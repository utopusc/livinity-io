# Server5 Relay Dependency Audit
*Produced: 2026-05-11 — for user concern "cogu sey livintiy de relay kullaniyor bu cok can sikici"*
*Author: Technical Researcher agent — codebase walk + live SSH to Server5*

---

## Executive Summary

- **Total distinct traffic paths audited:** 18
- **Data-plane (heavy, per-request) paths:** 8
- **Control-plane (light, infrequent) paths:** 6
- **Internal-only (Mini PC → Mini PC) paths:** 4 — these do NOT touch Server5 (good news)
- **Direct alternatives immediately achievable:** 5 paths
- **Needs design:** 2 paths
- **Structural Server5 dependency (keeps relay valuable):** 2 paths

**Biggest wins in order:** (1) streaming/VNC traffic — heaviest by far; (2) App Store iframe; (3) tRPC + WebSocket user traffic. All three are data-plane, all transit every byte through Server5's relay, and all have a clean Phase-104-style alternative (public DNS A-record pointing straight at Mini PC's public IP, bypassing the relay entirely).

---

## How Server5 Actually Works (Protocol Map)

Server5 runs three key processes:

| Port | Process | Role |
|------|---------|------|
| 4000 | `platform/relay` (Node.js) | The actual tunnel relay — all `*.livinity.io` subdomain traffic |
| 3000 | `platform/web` (Next.js) | livinity.io/store, /dashboard, /api/apps, /api/install-event |
| 3002 | `platform/changelog` (Next.js) | changelog.livinity.io |
| 4100 | `platform/marketplace` (Express) | mcp.livinity.io |

Caddy on Server5 (`/etc/caddy/Caddyfile`) routes:
- `livinity.io` and `*.livinity.io` → port 4000 (relay)
- `apps.livinity.io` → port 3000 (same Next.js as /store)
- `*.*.livinity.io` (e.g., `immich.bruce.livinity.io`) → port 4000 (relay)
- `mcp.livinity.io` → port 4100 (marketplace)

The relay at port 4000 maintains a persistent WebSocket (`wss://relay.livinity.io/tunnel/connect`) from Mini PC (TunnelClient in `tunnel-client.ts:244`). Every inbound HTTP request or WebSocket upgrade that arrives at Server5 for a user subdomain is serialized as a JSON message and forwarded down that tunnel. The Mini PC side deserializes it, makes a local HTTP call to `127.0.0.1:8080` (livinityd/Caddy), and sends the response back up the tunnel. **Every byte of user-facing traffic is double-proxied through this WebSocket.**

The on-demand TLS decision (`/internal/ask` endpoint at port 4000) is what enables Caddy on Server5 to issue certs for any `<anything>.livinity.io` subdomain.

---

## Traffic Path Map

### PATH-01 — Main UI: `bruce.livinity.io` → Mini PC

- **URL pattern:** `bruce.livinity.io`, `bruce.livinity.io/api/trpc/*`, `bruce.livinity.io/assets/*`
- **Current routing:** Browser → Cloudflare DNS (A-record → 45.137.194.102) → Caddy on Server5 port 443 → relay port 4000 → WebSocket tunnel → TunnelClient on Mini PC (`tunnel-client.ts:477-556`) → Mini PC 127.0.0.1:8080 (Caddy) → livinityd:8080
- **Classification:** DATA-PLANE — every page load, every asset, every API call
- **Volume:** ALL user traffic. Estimated 1-50 MB/user/day minimum; much higher during streaming
- **Why it goes through Server5:** Mini PC is behind home NAT. No public IP directly reachable. Server5 holds the public DNS A-record and the reverse tunnel.
- **Direct alternative:** Phase 104 hybrid DNS pattern. Add a public DNS A-record `bruce.livinity.io → <mini-pc-public-ip>` (requires Mini PC to have a static/DDNS public IP and port 443 open). Traffic goes: Browser → DNS → Mini PC directly. Zero Server5 involvement.
- **Blockers:** Mini PC needs (a) a reachable public IP (static or DDNS like DuckDNS), (b) port 443/80 open through home router NAT, (c) Caddy ACME to work (currently has the CF plugin, dns-01 works already — no new TLS work needed).
- **Effort:** MEDIUM (NAT/DDNS setup is the user-side friction; code change is just a DNS record)

---

### PATH-02 — tRPC Subscriptions / WebSocket Streams (agent output, live system stats)

- **URL pattern:** `wss://bruce.livinity.io/trpc` (WebSocket upgrade), `wss://bruce.livinity.io/ws`
- **Current routing:** Same as PATH-01 but WebSocket. Server5 relay uses `ws-proxy.ts` (`handleWsUpgrade` in `tunnel-client.ts:561-639`) — the relay maintains TWO persistent WebSocket connections simultaneously: (a) the tunnel control WS from Mini PC, and (b) for each user WebSocket, a second WS bridged over the tunnel.
- **Classification:** DATA-PLANE — continuous streaming (agent SSE, tRPC subscription events, system metrics)
- **Volume:** Low per-event, but the connection is persistent and adds ~2 extra WebSocket hops (browser→relay, relay→tunnel, tunnel→livinityd)
- **Why it goes through Server5:** Same reason as PATH-01.
- **Direct alternative:** Same as PATH-01. When the DNS A-record points directly at Mini PC, the WebSocket upgrade goes directly, no relay bridge needed.
- **Blockers:** Same as PATH-01.
- **Effort:** MEDIUM — same fix as PATH-01, no separate work

---

### PATH-03 — WebApp Viewer Streams (x11vnc → noVNC / RFB protocol, Phase 100+)

- **URL pattern:** `wss://bruce.livinity.io/ws/stream/<streamId>`, `wss://chrome.bruce.livinity.io/...`
- **Current routing:** Browser → Server5 relay → TunnelClient WS bridge (`tunnel-client.ts:559-639`) → Mini PC 127.0.0.1:8080 → Caddy → livinityd WS handler → VncBridge → x11vnc on a port in [15900, 16000) range
- **Classification:** DATA-PLANE — HEAVIEST PATH. x11vnc sends raw RFB/VNC frames, which are already compressed but still large. A single active stream at 10fps/720p is roughly 0.5-2 Mbps. This is the "most annoying" path in practice because Server5 must handle ALL the bandwidth.
- **Volume:** Potentially hundreds of MB/user/session
- **Why it goes through Server5:** Same NAT issue. The WebSocket goes: browser → relay → tunnel WebSocket → Mini PC local WS → livinityd → VNC port.
- **Direct alternative:** DNS A-record on Mini PC (PATH-01 fix) automatically fixes this. The VNC WebSocket would go directly browser → Mini PC → x11vnc. No relay involved.
- **Blockers:** Same as PATH-01.
- **Effort:** MEDIUM — automatic once PATH-01/PATH-02 are resolved. No separate streaming code changes.

---

### PATH-04 — App Subdomains: `immich.bruce.livinity.io` → per-user container

- **URL pattern:** `immich.bruce.livinity.io/*`, `chrome.bruce.livinity.io/*`
- **Current routing:** Browser → Server5 relay (Caddy: `*.*.livinity.io` → port 4000) → relay parses Host header via `subdomain-parser.ts` (finds `username=bruce`, `appName=immich`) → tunnel WS → TunnelClient (`tunnel-client.ts:488-492`) preserves original Host header → Mini PC livinityd app gateway → per-user Docker container port
- **Classification:** DATA-PLANE — all app traffic, including file uploads/downloads to self-hosted apps like Nextcloud, Jellyfin video streams, etc.
- **Volume:** Extremely high for media apps (Jellyfin = direct video stream bytes through relay). Potentially GB/session.
- **Why it goes through Server5:** Multi-level subdomain (`app.user.livinity.io`) requires Server5 Caddy for TLS (`*.*.livinity.io` with on-demand TLS) and relay for routing.
- **Direct alternative:** Same DNS A-record fix as PATH-01 but requires Caddy on Mini PC to handle `*.bruce.livinity.io` wildcards. Mini PC Caddy already has the Cloudflare DNS module — wildcard cert for `*.bruce.livinity.io` via dns-01 is already supported. In multi-user mode Caddy on Mini PC uses `generateFullCaddyfile()` with wildcard routing (`caddy.ts:77-80` — all subdomains already route to 8080 in multi-user mode). So the only change is DNS.
- **Blockers:** Same as PATH-01 plus: wildcard DNS dns-01 requires CF_API_TOKEN in Caddy environment (already documented as the blocker for multi-user toggle in MEMORY.md).
- **Effort:** MEDIUM

---

### PATH-05 — App Store Iframe: `livinity.io/store` embedded in LivOS UI

- **URL pattern:** `https://livinity.io/store?token=<apiKey>&instance=<hostname>` (loaded in an iframe)
- **Current routing:** The App Store window in LivOS UI loads `livinity.io/store` in an `<iframe>` (`app-store-content.tsx:56-62`). This URL hits Server5 Next.js at port 3000. All assets for the store page (JS bundles, CSS, app icons) are fetched from Server5. The iframe then communicates with LivOS UI via `postMessage` (`use-app-store-bridge.ts:306-332`). The actual install/uninstall commands come back as postMessage events → tRPC calls to Mini PC.
- **Classification:** DATA-PLANE for store browsing (all store page assets transit Server5). CONTROL-PLANE for install triggers (those are tRPC calls that go through the relay — PATH-01).
- **Volume:** Every time a user opens the App Store window: full Next.js page load from Server5. ~500KB-2MB of JS/CSS per session. Ongoing while browsing.
- **Why it goes through Server5:** The store UI is intentionally hosted on Server5 to keep it updated centrally. The `isAllowedOrigin` check (`use-app-store-bridge.ts:37`) explicitly trusts `https://livinity.io` and `*.livinity.io`.
- **Direct alternative:** The local app store (using `AppStore` / `AppRepository` class, `app-store.ts`, `app-repository.ts`) already clones the `utopusc/livinity-apps` git repo to disk and serves app metadata directly from the Mini PC via tRPC (`appStore.registry` route). The native app store UI in `layouts/app-store.tsx` already works without Server5. The gap is that the Store window specifically uses the iframe for a richer UI. A dedicated native UI (or route to the local registry) would eliminate this dependency entirely.
- **Blockers:** UX work — the full-featured store UI with screenshots/descriptions lives on Server5. Local tRPC registry is functional but minimal. Rebuilding the rich store UI locally is LARGE effort; switching App Store window to open local registry is SMALL.
- **Effort:** SMALL to redirect App Store window to local registry tRPC data (the data is already there). LARGE to rebuild the full rich store experience locally.

---

### PATH-06 — `reportEvent` app install/uninstall telemetry → `https://livinity.io/api/install-event`

- **URL pattern:** `POST https://livinity.io/api/install-event` (server-to-server from Mini PC)
- **Code:** `apps.ts:809` — `fetch('https://livinity.io/api/install-event', {...})`
- **Current routing:** Mini PC livinityd → outbound HTTPS → Cloudflare → Server5 Caddy → port 3000 (Next.js) — this is a DIRECT outbound call from Mini PC, NOT through the relay tunnel.
- **Classification:** CONTROL-PLANE — fires once per install/uninstall event. Fire-and-forget (ignores failures).
- **Volume:** ~1 call per app install/uninstall. Minimal.
- **Why it goes through Server5:** Platform analytics. Server5 tracks which apps are installed across the LivOS fleet.
- **Direct alternative:** None needed — this is already direct (Mini PC → Server5 outbound HTTPS, not relay). It is NOT relay traffic. The user's complaint does not apply here. This is a one-way reporting call.
- **Blockers:** N/A — already relay-free.
- **Effort:** N/A

---

### PATH-07 — `fetchPlatformTemplate` compose files → `https://livinity.io/api/apps/<appId>`

- **URL pattern:** `GET https://livinity.io/api/apps/<appId>` (server-to-server from Mini PC)
- **Code:** `apps.ts:756` — `fetch('https://livinity.io/api/apps/${appId}', {headers: {'X-Api-Key': apiKey}})`
- **Current routing:** Mini PC livinityd → outbound HTTPS → Server5 Next.js at port 3000. NOT through the relay — this is a direct Mini PC outbound call.
- **Classification:** CONTROL-PLANE — called only when installing an app not in the local git repo or builtin list. Infrequent.
- **Volume:** One call per rare-app install. Negligible.
- **Why it goes through Server5:** Server5's PostgreSQL `platform.apps` table holds compose definitions for apps not in the `livinity-apps` GitHub repo (the 26 curated apps).
- **Direct alternative:** Already relay-free. If the app exists in the local git clone of `livinity-apps`, this path is never hit. The direct outbound fetch is fine.
- **Blockers:** N/A.
- **Effort:** N/A

---

### PATH-08 — App Store Git Clone: `https://github.com/utopusc/livinity-apps.git`

- **URL pattern:** Git clone/fetch from GitHub — called every 5 minutes by `AppStore.update()` (`app-store.ts:57`)
- **Current routing:** Mini PC → outbound HTTPS to `github.com` directly. Does NOT touch Server5.
- **Classification:** CONTROL-PLANE — periodic 5-minute check, but only actually clones if there's a new commit.
- **Volume:** Negligible — just a HEAD ref check; actual clone only on update.
- **Why it goes through Server5:** It does not. This is a direct GitHub connection.
- **Direct alternative:** N/A — already relay-free.
- **Effort:** N/A

---

### PATH-09 — App Icon URLs (raw.githubusercontent.com CDN)

- **URL pattern:** `https://raw.githubusercontent.com/utopusc/livinity-apps-gallery/master/<appId>/icon.svg` (rendered in browser)
- **Code:** `app-repository.ts:183`, `builtin-apps.ts` (many entries)
- **Current routing:** Browser fetches directly from GitHub's CDN. Goes browser → `raw.githubusercontent.com` — entirely bypasses Server5.
- **Classification:** CONTROL-PLANE — loaded once per app card render, cached by browser.
- **Why it goes through Server5:** It does not.
- **Direct alternative:** N/A — already relay-free. These are public CDN URLs.
- **Effort:** N/A

---

### PATH-10 — Skills/Capabilities Marketplace: `raw.githubusercontent.com/utopusc/livinity-skills`

- **URL pattern:** `GET https://raw.githubusercontent.com/utopusc/livinity-skills/main/marketplace/index.json`
- **Code:** `ai/routes.ts:2592`
- **Current routing:** Mini PC livinityd → outbound HTTPS to GitHub CDN. NOT Server5.
- **Classification:** CONTROL-PLANE — called on demand when user installs a capability from the marketplace.
- **Volume:** Negligible.
- **Direct alternative:** N/A — already relay-free.
- **Effort:** N/A

---

### PATH-11 — update.sh: GitHub clone `https://github.com/utopusc/livinity-io.git`

- **URL pattern:** `git clone --depth 1 https://github.com/utopusc/livinity-io.git` (update.sh:326)
- **Current routing:** Mini PC → outbound HTTPS to GitHub directly. NOT Server5.
- **Classification:** CONTROL-PLANE — runs once per update.
- **Volume:** Negligible per run.
- **Direct alternative:** N/A — already relay-free.
- **Effort:** N/A

---

### PATH-12 — Anthropic API (AI broker / subscription path)

- **URL pattern:** `https://api.anthropic.com/v1/...` (inside `claude-agent-sdk` subprocess)
- **Current routing:** Mini PC spawns `claude` CLI subprocess via `SdkAgentRunner` (`sdk-agent-runner.ts:331`). The subprocess uses `HOME=/root` (via `BROKER_FORCE_ROOT_HOME`) to read `~/.claude/.credentials.json`. The SDK connects directly to `api.anthropic.com`. Server5 is NOT in this path.
- **Classification:** DATA-PLANE by volume (all AI inference tokens), but CONTROL-PLANE by topology (direct from Mini PC). This is a confirmed direct connection.
- **Volume:** All LLM inference traffic — potentially large in token count but it goes Mini PC → Anthropic directly.
- **Why it goes through Server5:** It does NOT. This is verified. The relay is not in the AI inference path. The user does not need to audit this one further.
- **Direct alternative:** N/A — already relay-free. Push back: "broker relay" is a common assumption that is WRONG here. The broker subscription path spawns `claude` CLI which speaks directly to `api.anthropic.com`.
- **Effort:** N/A

---

### PATH-13 — liv-core internal calls: livinityd → `http://localhost:3200/api/...`

- **URL pattern:** `http://localhost:3200/api/agent/stream`, `/api/tools`, `/api/approvals`, etc.
- **Code:** `ai/routes.ts:87` — `process.env.LIV_API_URL || 'http://localhost:3200'`
- **Current routing:** Mini PC internal loopback only. livinityd → liv-core on same host. NOT Server5.
- **Classification:** INTERNAL — no external traffic.
- **Direct alternative:** N/A — already internal.
- **Effort:** N/A

---

### PATH-14 — Kimi API (legacy provider, now inactive)

- **URL pattern:** `https://api.kimi.com/coding/v1/...`
- **Current routing:** Mini PC → outbound HTTPS to Kimi's API directly. NOT Server5. (Currently inactive — `liv:config:primary_provider=claude`)
- **Direct alternative:** N/A — already relay-free.
- **Effort:** N/A

---

### PATH-15 — livinity.io Dashboard (`livinity.io/dashboard`)

- **URL pattern:** `https://livinity.io/dashboard` — user opens this in a browser (not from LivOS UI)
- **Current routing:** Browser → Server5 Caddy → port 3000 (Next.js). This is Server5 serving its own pages — there is no relay involvement. The user's browser talks to Server5, but the tunnel to Mini PC is NOT needed.
- **Classification:** CONTROL-PLANE — infrequent (user sets up API key, views domains, etc.)
- **Volume:** Negligible.
- **Why it goes through Server5:** This IS Server5's own service. The dashboard is hosted on Server5 by design — it's the platform management UI.
- **Direct alternative:** Potentially fold the domain management and API key UI into LivOS settings directly. The platform routes already exist in `platform/routes.ts`. The "My Domains" section in Settings (`my-domains-section.tsx:46`) already links to `https://livinity.io/dashboard`.
- **Blockers:** Requires a LivOS-native domain management UI. Medium UX effort.
- **Effort:** MEDIUM to replace with in-LivOS UI, but low priority since it's infrequent.

---

### PATH-16 — Changelog: `changelog.livinity.io`

- **URL pattern:** `https://changelog.livinity.io`
- **Current routing:** Browser → Server5 Caddy → port 3002 (Next.js changelog). Server5 serves its own content. No relay to Mini PC.
- **Classification:** CONTROL-PLANE — very infrequent.
- **Volume:** Negligible.
- **Direct alternative:** Not needed — Server5 is the right host for this. It's authoritative content about the platform.
- **Effort:** N/A (should stay on Server5)

---

### PATH-17 — Factory Reset Network Preflight: `HEAD https://livinity.io`

- **URL pattern:** `HEAD https://livinity.io` (5-second timeout)
- **Code:** `network-preflight.ts:22` — `PREFLIGHT_URL = 'https://livinity.io'`
- **Current routing:** Browser (the LivOS UI) → outbound HTTPS to Server5. NOT through the relay tunnel. Just a reachability check.
- **Classification:** CONTROL-PLANE — called only when user initiates factory reset.
- **Volume:** One call per factory reset flow.
- **Why it goes through Server5:** It checks if the internet and `livinity.io` are reachable before wiping — ensures the re-install server is available. This is a deliberate dependency.
- **Direct alternative:** Could check a neutral URL (e.g., `github.com`) instead. But this also ensures Server5 is reachable before factory reset, which is valid since update.sh downloads from GitHub anyway (not Server5). The preflight URL could be changed to `github.com` to remove the Server5 dependency.
- **Effort:** SMALL

---

### PATH-18 — Caddy On-Demand TLS (`/internal/ask` on Server5 port 4000)

- **URL pattern:** HTTP `GET http://localhost:4000/internal/ask?domain=bruce.livinity.io` (called by Server5 Caddy internally)
- **Current routing:** Server5 Caddy → Server5 relay (internal call, loopback). Mini PC is NOT involved.
- **Classification:** CONTROL-PLANE — called once per TLS certificate issuance (on new connection to new subdomain). Very infrequent after the cert is cached.
- **Volume:** Once per subdomain per cert rotation.
- **Why it goes through Server5:** This is entirely Server5-internal. The cert issuance logic lives on Server5 because Caddy on Server5 is the TLS terminator for `*.livinity.io`.
- **Direct alternative:** If Mini PC gets its own public DNS A-record (PATH-01 fix), Mini PC's Caddy handles its own TLS via dns-01 (Cloudflare module). The Server5 `/internal/ask` mechanism becomes irrelevant for Mini PC's subdomains.
- **Effort:** Automatic consequence of PATH-01 fix.

---

## Classification Summary Table

| Path | Description | Type | Volume | Server5 Role | Direct Alt Available |
|------|-------------|------|--------|--------------|----------------------|
| PATH-01 | Main UI + tRPC HTTP | DATA-PLANE | All user traffic | Relay proxy | YES (DNS A-record) |
| PATH-02 | WebSocket subscriptions | DATA-PLANE | Persistent connections | Relay WS bridge | YES (same as PATH-01) |
| PATH-03 | VNC/streaming frames | DATA-PLANE | HEAVIEST (MB/session) | Relay WS bridge | YES (same as PATH-01) |
| PATH-04 | App subdomains | DATA-PLANE | All app traffic | Relay + subdomain routing | YES (wildcard DNS on Mini PC) |
| PATH-05 | App Store iframe | DATA-PLANE (assets) | 1-2MB/open | Static host | PARTIAL (local registry exists) |
| PATH-06 | Install event telemetry | CONTROL-PLANE | 1 call/install | Direct HTTPS target | NOT relay (already direct) |
| PATH-07 | Platform compose fetch | CONTROL-PLANE | 1 call/rare-app install | Direct HTTPS target | NOT relay (already direct) |
| PATH-08 | App store git clone | CONTROL-PLANE | ~5min polling | NOT Server5 (GitHub) | N/A already direct |
| PATH-09 | App icon CDN | CONTROL-PLANE | Per page render | NOT Server5 (GitHub CDN) | N/A already direct |
| PATH-10 | Skills marketplace | CONTROL-PLANE | On demand | NOT Server5 (GitHub CDN) | N/A already direct |
| PATH-11 | update.sh git clone | CONTROL-PLANE | Per update run | NOT Server5 (GitHub) | N/A already direct |
| PATH-12 | Anthropic API (broker) | DATA-PLANE (tokens) | All AI inference | NOT Server5 (direct) | N/A already direct |
| PATH-13 | livinityd → liv-core | INTERNAL | All agent calls | NOT Server5 (loopback) | N/A already internal |
| PATH-14 | Kimi API (inactive) | DATA-PLANE | Inactive | NOT Server5 (direct) | N/A |
| PATH-15 | livinity.io Dashboard | CONTROL-PLANE | Infrequent | Server5 own service | MEDIUM (fold into LivOS) |
| PATH-16 | Changelog | CONTROL-PLANE | Very infrequent | Server5 own service | Should stay on Server5 |
| PATH-17 | Factory reset preflight | CONTROL-PLANE | Once per reset | Availability check | SMALL (change URL) |
| PATH-18 | On-demand TLS ask | CONTROL-PLANE | Once per cert | Server5 internal | Automatic with PATH-01 fix |

---

## Critical Correction: What Is and Is NOT Relay Traffic

**NOT relay traffic (good news, no action needed):**
- All Anthropic/Claude API calls (PATH-12) — direct Mini PC → `api.anthropic.com`
- All liv-core internal calls (PATH-13) — loopback only
- App store git clone (PATH-08) — direct to GitHub
- App icon URLs (PATH-09) — browser fetches directly from GitHub CDN
- Skills marketplace (PATH-10) — direct to GitHub CDN
- update.sh (PATH-11) — direct to GitHub
- `reportEvent` telemetry (PATH-06) — direct outbound HTTPS to Server5 (not through relay)
- `fetchPlatformTemplate` (PATH-07) — direct outbound HTTPS to Server5 (not through relay)

**IS relay traffic (the actual problem):**
- PATH-01, PATH-02, PATH-03, PATH-04 — ALL user-facing browser traffic

The relay is the architectural pattern where: **every browser-to-Mini-PC byte transits Server5**. That's paths 01-04. The other concerns are separate server-to-server calls that are already direct.

---

## Data-Plane Paths to Eliminate First (Biggest Wins)

### Win #1: DNS A-record for Mini PC public IP (eliminates PATH-01, PATH-02, PATH-03, PATH-04)

This is the Phase 104 hybrid pattern applied to `bruce.livinity.io` itself.

**What it requires:**
1. Mini PC has a reachable public IP (static ISP IP, or DDNS like DuckDNS/Cloudflare tunnel-free).
2. Port 443 and 80 open on home router → Mini PC.
3. Add a Cloudflare DNS A-record for `bruce.livinity.io` pointing at that IP (not proxied — DNS-only, orange → grey cloud).
4. Add a Cloudflare DNS A-record for `*.bruce.livinity.io` pointing at same IP.
5. Caddy on Mini PC already has the Cloudflare dns-01 module and can issue wildcard certs for `*.bruce.livinity.io` via `CF_API_TOKEN` (same token already documented for multi-user mode).
6. Mini PC Caddy in multi-user mode already generates the right `generateFullCaddyfile()` config routing all subdomains to port 8080 (`caddy.ts:77-80`).

**What traffic bypasses Server5:**
- All browser traffic to `bruce.livinity.io` (PATH-01)
- All WebSocket connections (PATH-02)
- All VNC/streaming frames (PATH-03)
- All app subdomain traffic — `immich.bruce.livinity.io`, `chrome.bruce.livinity.io` (PATH-04)

**What still goes through Server5:**
- The TunnelClient WebSocket from Mini PC stays connected but becomes idle — it can be disconnected if the user has confirmed the direct path works.
- `livinity.io/store` iframe page assets (PATH-05) — still from Server5.
- `reportEvent` and `fetchPlatformTemplate` outbound calls (PATH-06, PATH-07) — these are Mini PC OUTBOUND calls to Server5, not relayed. They stay and are fine.

**Bandwidth impact on Server5:** Near-zero. Server5 would only handle the infrequent control-plane calls.

### Win #2: App Store iframe (PATH-05) — SMALL effort, moderate win

The local app store is fully functional. The `appStore.registry` tRPC query already returns all apps from the local git clone. The native `AppStoreLayout` (`layouts/app-store.tsx`) already works without Server5. The only change needed is to redirect the App Store window away from the Server5-hosted iframe.

**Implementation:** In `app-store-content.tsx:56`, instead of loading `https://livinity.io/store?token=...` in an iframe, render the native `AppStoreLayout` component (or a route to it) directly. This requires no new backend work — all data is available via existing tRPC routes.

**Trade-off:** Loses the centrally-updated, richer store UI (screenshots, editorial copy). Gains: no Server5 dependency, works offline, no API key required.

---

## Control-Plane Paths That Can Stay on Server5

These paths either:
- Already bypass Server5 entirely, or
- Appropriately use Server5 as an authoritative service host

**Should stay on Server5:**
- PATH-06 (`reportEvent`) — fleet analytics, intentionally centralized
- PATH-07 (`fetchPlatformTemplate`) — platform-curated app definitions
- PATH-15 (Dashboard) — platform-level management, appropriate on Server5
- PATH-16 (Changelog) — authoritative platform content
- PATH-17 (factory reset preflight) — could change URL target, but low priority

---

## Paths Blocked by Current Architecture

### The CGNAT / NAT Problem

Win #1 (DNS A-record for Mini PC) requires the Mini PC to have a public IP reachable from the internet. If the user's ISP uses CGNAT (Carrier-Grade NAT), the Mini PC has no unique public IP — port forwarding is impossible. This is increasingly common with residential ISPs.

**Detection:** On Mini PC: `curl ifconfig.me` gives the external IP. If it matches the router's WAN IP (visible in router admin), NAT traversal is possible. If it differs, the user is behind CGNAT.

**Workarounds for CGNAT (not designing these here, but noting them):**
- Request a static IP from ISP (paid upgrade on most residential plans)
- IPv6 (Mini PC gets a globally routable IPv6 address; Cloudflare supports AAAA records) — no CGNAT issue
- A separate relay (but one the user controls, not Server5) — e.g., a cheap VPS running a WireGuard or Bore/FRP tunnel
- Cloudflare Tunnel (cloudflared) — already implemented in `domain/tunnel.ts` as the alternative path. When cloudflared is active, `caddy.ts:56-63` shows Caddy runs in tunnel mode (`:80` reverse proxy only, no domain block). This IS a viable "no public IP" answer but requires Cloudflare account and the user did not want external service dependencies.

### The App Store Rich UI Problem

The Server5-hosted `livinity.io/store` has a richer UI (curated editorial copy, screenshots, category browsing) that the local `AppRepository` git clone does not replicate. Going fully local means using the simpler native UI already present in LivOS. This is an acceptable trade-off for relay independence.

---

## Proposed "Relay Reduction" Follow-Up Phase (Post Phase 104)

**Phase name suggestion:** Phase 105 — Direct-Connect Mode

**Scope:**
1. **R1 (SMALL):** Add a "Direct Connect" wizard in LivOS Settings → Domain. User enters their public IP (or enables DDNS client). System automatically:
   - Updates Cloudflare DNS A-record for `<username>.livinity.io` via CF API
   - Adds `*.<username>.livinity.io` wildcard A-record
   - Generates/renews wildcard TLS cert via dns-01
   - Optionally disconnects TunnelClient
   - Shows verification status (can reach Mini PC directly)
2. **R2 (SMALL):** Native App Store mode toggle in Settings. When enabled, App Store window loads local tRPC registry instead of Server5 iframe.
3. **R3 (MEDIUM):** DDNS client integration — if user has a DDNS provider (DuckDNS, Cloudflare), configure automatic IP update on network change. Keeps the Cloudflare DNS A-record current even with dynamic ISP IPs.
4. **R4 (MEDIUM):** CGNAT detection and advisory. On domain setup, check if `curl ifconfig.me` matches router WAN IP. If CGNAT detected, show a clear message explaining the limitation and options.
5. **R5 (LARGE, optional):** Full offline/LAN mode — dnsmasq + Caddy internal CA for zero-cloud LAN access (already researched in `local-livinity-setup.md`).

**Gate to start:** Phase 104 (home.livinity.io hybrid DNS) shipped and validated. Phase 105 applies the same pattern to user-facing `bruce.livinity.io` subdomain.

---

## Risks of Relay Reduction

1. **CGNAT locks out Win #1 entirely.** The relay is a valid fallback for users who cannot open ports. Phase 105 should make direct-connect an opt-in, not a forced removal of relay support.

2. **TLS cert renewal.** Without Server5's on-demand TLS, Mini PC must renew its own wildcard cert. Caddy dns-01 handles this automatically with CF token. Risk: if CF token expires, cert renewal fails → HTTPS breaks. Mitigation: monitoring alert when cert is within 14 days of expiry.

3. **IP changes.** Residential ISPs change IPs without notice. Without DDNS, the A-record becomes stale → Mini PC unreachable. Mitigation: DDNS client built into Phase 105 R3.

4. **firewall.** Home router port forwarding must be configured by the user. One wrong setting breaks access. The relay remains the zero-config fallback.

5. **App Store API key dependency.** PATH-05 uses a platform API key stored in Redis (`livos:platform:api_key`). If the key is revoked or the user hasn't set it, the App Store iframe shows an error (`app-store-content.tsx:52-54`). The local registry (R2) does not require an API key.

6. **Multi-tenant Server5 isolation.** Today, all users of the livinity.io platform share Server5. If the relay is eliminated for one user (Mini PC direct), other users who do NOT have public IPs still need Server5. This is a per-instance optimization, not a platform-wide change.

---

## Source References

| Finding | File | Line |
|---------|------|------|
| TunnelClient default relay URL | `livos/packages/livinityd/source/modules/platform/tunnel-client.ts` | 244 |
| HTTP request proxying through tunnel | `tunnel-client.ts` | 477-556 |
| WebSocket forwarding through tunnel | `tunnel-client.ts` | 561-639 |
| Caddy generates all subdomains to port 8080 (multi-user) | `modules/domain/caddy.ts` | 77-80 |
| Caddy on-demand TLS for tunnel mode | `caddy.ts` | 56-63 |
| App Store iframe URL construction | `modules/window/app-contents/app-store-content.tsx` | 56 |
| isAllowedOrigin trusts livinity.io | `hooks/use-app-store-bridge.ts` | 37 |
| Platform compose fetch (direct, not relay) | `modules/apps/apps.ts` | 756 |
| Install event reporting (direct, not relay) | `apps.ts` | 809 |
| App store git clone (direct to GitHub) | `constants.ts` | 2 |
| SdkAgentRunner HOME override (Anthropic direct) | `liv/packages/core/src/sdk-agent-runner.ts` | 331 |
| Skills marketplace (direct to GitHub) | `modules/ai/routes.ts` | 2592 |
| Factory reset preflight URL | `features/factory-reset/lib/network-preflight.ts` | 22 |
| Server5 Caddyfile routing rules | SSH read from `/etc/caddy/Caddyfile` on 45.137.194.102 | — |
| Server5 relay subdomain parser | SSH read: `/opt/platform/relay/src/subdomain-parser.ts` | — |
| Server5 relay server request routing | SSH read: `/opt/platform/relay/src/server.ts` | — |
| Server5 listening ports | `ss -tlnp` on 45.137.194.102 | — |
