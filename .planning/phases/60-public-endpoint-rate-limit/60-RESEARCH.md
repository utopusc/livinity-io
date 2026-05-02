# Phase 60: B2 Public Endpoint (`api.livinity.io`) + Rate-Limit Perimeter — Research

**Researched:** 2026-05-02
**Domain:** Caddy reverse-proxy + caddy-ratelimit plugin + DNS + broker IP-guard removal (production-adjacent platform infra)
**Confidence:** HIGH (architecture verified against repo source; plugin verified against upstream README; one MEDIUM gap on Server5 build provenance — see Open Questions)

## Summary

The CONTEXT.md author proceeded under the assumption that "Server5 → Mini PC over private LivOS tunnel" is a network-level tunnel (wireguard / private subnet). It is not. **It is an envelope-based reverse-WebSocket tunnel.** Server5 runs Caddy on :80/:443 → forwards `*.livinity.io` to `localhost:4000` → that port is the **`@livinity/relay` Node process** (`platform/relay/src/index.ts`), which serializes incoming HTTP into JSON `TunnelRequest` envelopes (base64 body) and pushes them down a `wss://relay.livinity.io/tunnel/connect` WebSocket where Mini PC livinityd is the *client*. There is no IP/host that Caddy can `reverse_proxy` to for the Mini PC — every request flows through the relay process. Phase 60's `api.livinity.io` block must terminate at the **same relay process at `localhost:4000`**, not at a Mini-PC tunnel host.

This single discovery rewrites half of the CONTEXT.md plan: the proposed `reverse_proxy https://<minipc-tunnel-host>:8080` block is wrong. The right block is `reverse_proxy localhost:4000` (with `Host: api.livinity.io` preserved), AND the relay's `server.ts` request handler MUST be taught to recognize `api.livinity.io` as a special hostname (not a username subdomain) and forward to a chosen tunnel — likely the admin user's tunnel — which then hits `livinityd:8080/u/:userId/v1/messages` over the WebSocket. The good news: `INFRA_SUBDOMAINS` in `server.ts:84` already includes `'api'` so on-demand TLS issuance for `api.livinity.io` is pre-authorized at the `/internal/ask` endpoint — no relay code change needed for cert provisioning.

Rate-limiting via `caddy-ratelimit` is straightforward but **requires a custom `xcaddy` build** (not in stock Caddy). The Caddyfile uses an `order rate_limit before basic_auth` global block + per-zone `key`/`window`/`events`. 429 body customization is done via a separate `handle_errors 429 { respond ... }` block, not inside the `rate_limit` directive itself. `Retry-After` is automatic.

**Primary recommendation:**

1. Phase 60 must include a **plan to extend the relay** (`platform/relay/src/`) to recognize `api.livinity.io` as a special routing target — not just a Caddyfile addition. This is the load-bearing decision the CONTEXT.md missed.
2. Build Caddy with `caddy-ratelimit` via `xcaddy build` (non-Docker; matches existing Caddy install pattern at `/usr/bin/caddy`). One binary swap with `systemctl reload caddy`.
3. Caddyfile addition is a 25-line block colocated in `platform/relay/Caddyfile` with `localhost:4000` as upstream + per-Bearer + per-IP rate-limit zones + `handle_errors 429` for Anthropic-compat body.
4. Broker IP-guard removal touches exactly `livinity-broker/router.ts:30` + `auth.ts:32-68` + 1 integration test fixture.
5. DNS: single A record `api.livinity.io → 45.137.194.102` via Cloudflare (manual or API; researcher could not locate Terraform/Pulumi config in repo — DNS appears to be manually managed).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| TLS termination + LE cert issue | Server5 Caddy | `/internal/ask` endpoint at relay:4000 | Caddy already terminates TLS for `*.livinity.io`; ask endpoint already has `'api'` in `INFRA_SUBDOMAINS` (`platform/relay/src/server.ts:84`) — pre-authorized [VERIFIED: codebase] |
| Per-Bearer / per-IP rate limiting | Server5 Caddy (`caddy-ratelimit` plugin) | — | In-process rate limit; default zone-local storage sufficient for single-Server5; rejects (no buffer/queue) [CITED: github.com/mholt/caddy-ratelimit README] |
| 429 body shaping (Anthropic-compat) | Caddy `handle_errors 429` block | — | `caddy-ratelimit` raises internal 429; Caddy `handle_errors` rewrites body via `respond` directive [CITED: caddyserver.com handle_errors docs] |
| `api.livinity.io` → broker routing | Relay process (`platform/relay/src/server.ts`) | Mini PC livinityd Express app | Caddy → localhost:4000; relay must add a special-case for hostname `api.livinity.io` that forwards to the admin user's tunnel (current code only routes by `<username>.livinity.io` subdomain or custom domain) [VERIFIED: server.ts code] |
| Identity (which user does this Bearer belong to) | Mini PC livinityd Bearer middleware (Phase 59) | PG `api_keys` table | Relay forwards Bearer header verbatim; livinityd is the identity authority [VERIFIED: Phase 59 RESEARCH] |
| Container IP guard (legacy, to remove) | Mini PC livinityd `livinity-broker/auth.ts:32-68` | — | Removed in Phase 60; Bearer auth replaces it [VERIFIED: auth.ts code] |
| DNS authoritative for `livinity.io` | Cloudflare (DNS-only mode) | — | Established stack; manual dashboard or CF API; **researcher could not locate IaC for DNS in this repo** — likely manual [ASSUMED — see Open Question 1] |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Phase 56 Q4 verdict (CONTEXT.md author's call, ahead of Phase 56 spike):** Caddy on Server5 — NOT Cloudflare Workers. Reasons: existing infra reuse, DNS-only continuity, no cold start, in-process rate-limit primitive.
- **TLS strategy:** Let's Encrypt; explicit certificate (not on-demand) for `api.livinity.io` since it's a fixed hostname. `tls <ops-email>` directive. Caddy auto-renews 30d before expiry.
  - **Researcher note:** Existing Caddyfile uses `tls { on_demand }` for ALL blocks. The on-demand path with `INFRA_SUBDOMAINS` allowlist already authorizes `api.livinity.io`. Switching to explicit `tls <email>` is a stylistic choice but creates inconsistency. **Recommend keeping `tls { on_demand }` for consistency** — the cert will issue on first request.
- **Rate-limit primitive:** `github.com/mholt/caddy-ratelimit` plugin. Per-Bearer zone (60 req/min) + per-IP zone fallback (30 req/min). 60-event token bucket, 1-second refill.
- **Rate-limit error body:** `{"error": {"type": "rate_limit_error", "message": "Rate limit exceeded — try again in <N> seconds"}}` + `Retry-After: <N>` header.
  - **Researcher note:** Anthropic's actual top-level shape includes a `type: "error"` wrapper AND a `request_id`: `{"type": "error", "error": {"type": "rate_limit_error", "message": "..."}, "request_id": "req_..."}`. CONTEXT.md's body misses the outer `type: "error"` and `request_id`. **Recommend matching Anthropic exactly for spec compliance.** [CITED: platform.claude.com/docs/en/api/errors §"Error shapes"]
- **Container IP guard removal:** Remove from `livinity-broker/router.ts:30` (`router.use(containerSourceIpGuard)`) and the function in `livinity-broker/auth.ts:32-68`.
- **DNS:** `api.livinity.io IN A 45.137.194.102`, TTL 300, Cloudflare DNS-only (NOT proxied).
- **Sacred file UNTOUCHED:** `nexus/packages/core/src/sdk-agent-runner.ts` SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` not modified.
- **Server5 platform-only work:** Phase 60 work on Server5 is platform Caddy + DNS, NOT LivOS. The "Server5 = livinity.io relay only — NO LivOS install" rule is preserved.

### Claude's Discretion
- Caddyfile syntax vs JSON config — Caddyfile (existing repo pattern).
- `xcaddy build` vs Docker image vs apt — **Recommend xcaddy build** (matches existing `/usr/bin/caddy` install per project memory). See Section "caddy-ratelimit Plugin Build Strategy" below.
- Log format — JSON.
- Rate-limit window granularity — 1m default (CONTEXT.md choice; reasonable).

### Deferred Ideas (OUT OF SCOPE)
- Per-tier subscription rate-limit policy → monetization milestone.
- WAF rules / DDoS protection beyond Caddy rate-limit → defer to CF if needed.
- Multi-region tunnel relay (HA) → multi-relay milestone.
- CF Workers alternative architecture → research note for future.
- Server5 Caddy version upgrade beyond v2.11.2 → out unless plugin requires newer.
- Custom-domain → broker routing → out (broker only on `api.livinity.io`; users keep `<username>.livinity.io`).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FR-BROKER-B2-01 | `api.livinity.io` reachable from open internet via Server5; TLS terminates at Server5; container IP guard REMOVED from broker | DNS A record added at Cloudflare; Caddy block added in `platform/relay/Caddyfile`; relay `server.ts` extended to recognize `api.livinity.io` as a special hostname (line 206 region) and forward to admin user's tunnel; `livinity-broker/router.ts:30` IP-guard removed; `livinity-broker/auth.ts:32-68` function deleted (or kept as dead code if still imported by tests). |
| FR-BROKER-B2-02 | Rate-limit perimeter at Server5; baseline limit per Bearer + per IP; 429 with Anthropic-compat error body + Retry-After | `caddy-ratelimit` plugin installed via `xcaddy build`; `rate_limit` directive added in Caddyfile with two zones; `handle_errors 429 { respond ... }` block emits Anthropic-shape body (4-field: type/error/message/request_id); `Retry-After` automatic per plugin. |
</phase_requirements>

## Standard Stack

### Core (already on Server5 OR via standard install)

| Tool | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Caddy | v2.11.2 (project memory; **Wave 0 task confirms exact version on Server5**) | TLS termination + reverse proxy + rate-limit host | Already running on Server5 since v19; DNS provider Cloudflare module already loaded [VERIFIED: project memory + `platform/relay/Caddyfile`] |
| `xcaddy` | latest from `caddyserver/xcaddy` | Build Caddy with third-party modules | Standard build tool; required for `caddy-ratelimit` (not in stock Caddy) [CITED: github.com/mholt/caddy-ratelimit README] |
| `caddy-ratelimit` | master at HEAD (no tagged releases per GitHub Releases page; **last commit activity 2026-01-2026**) | Per-zone token-bucket rate limiting | Most-maintained Caddy rate-limit plugin; 439 GitHub stars; `mholt` is original Caddy author [VERIFIED: github.com/mholt/caddy-ratelimit] |
| `@livinity/relay` (existing) | v0.1.0 from repo | HTTP-envelope reverse-tunnel between Server5:4000 and Mini PC livinityd:8080 over WSS | Already the load-bearing platform piece; Phase 60 extends it (does not replace) [VERIFIED: `platform/relay/src/index.ts`] |

**Version verification (Wave 0 SSH-Server5 batch):**
```bash
caddy version                                    # confirm v2.11.2
caddy list-modules | grep -E '(ratelimit|cloudflare)'  # confirm dns.providers.cloudflare loaded; confirm http.handlers.rate_limit ABSENT (proves we need to rebuild)
which caddy                                      # confirm /usr/bin/caddy
systemctl status caddy                           # confirm unit name + state
ls -la /etc/caddy/Caddyfile                      # confirm Caddyfile path on disk
diff /etc/caddy/Caddyfile <(cat platform/relay/Caddyfile)   # detect on-server drift vs repo
ls -la /opt/platform/relay/                      # confirm relay deployed to /opt/platform/relay per ecosystem.config.cjs
pm2 list | grep relay                            # confirm relay process state
```

### Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token-bucket rate limiter | Custom Express middleware | `caddy-ratelimit` at the perimeter | Perimeter is the right tier (cuts traffic before it hits livinityd); plugin handles cluster sync, jitter, sweep, storage abstraction [CITED: caddy-ratelimit README] |
| 429 retry-after computation | Manual `Retry-After` math | `caddy-ratelimit` automatic header | Plugin computes from window remaining; jitter is a flag [CITED: caddy-ratelimit README] |
| Custom 429 JSON body construction | Inline JSON in respond directive every time | `handle_errors 429 { respond ... }` block | Caddy v2 idiom; supports `{err.status_code}`/`{err.message}` placeholders [CITED: caddyserver.com handle_errors docs] |
| TLS certificate management | Custom acme client | Caddy's built-in ACME | Already running for `*.livinity.io`; auto-renew 30d before expiry [VERIFIED: existing Caddyfile uses `tls { on_demand }`] |
| Custom DNS authority client | Manual zone file or self-hosted DNS | Cloudflare DNS (existing) | Established stack; LE supports CF DNS challenge already (the Caddy CF module is loaded per project memory) |
| New tunnel from Server5 to Mini PC for `api.livinity.io` | Wireguard / SSH tunnel / Tailscale | Reuse existing `@livinity/relay` WebSocket envelope tunnel | The tunnel already exists; introducing a second tunnel doubles failure surface and bypasses bandwidth tracking, custom-domain caching, etc. |

## Architecture Patterns

### System Architecture Diagram (post Phase 60)

```
                                      DNS-only (NOT proxied)
                                              │
External client (Bolt.diy / curl / SDK)       │
  Authorization: Bearer liv_sk_*              ▼
  Host: api.livinity.io  ─────────────►   Cloudflare DNS
                                              │   A: 45.137.194.102
                                              ▼
                ┌──────────────────────────────────────────────────────┐
                │  Server5 (45.137.194.102)                            │
                │                                                       │
                │  ┌──────────────────────────────────────────────┐    │
                │  │  Caddy v2.11.2 + caddy-ratelimit plugin     │    │
                │  │  :443 (TLS terminate, LE cert)              │    │
                │  │                                              │    │
                │  │  ★ NEW api.livinity.io block:               │    │
                │  │    1. rate_limit zone bearer (60/min)       │    │
                │  │    2. rate_limit zone ip (30/min)           │    │
                │  │    3. reverse_proxy localhost:4000          │    │
                │  │       ─ preserve Authorization header        │    │
                │  │       ─ preserve Host = api.livinity.io      │    │
                │  │    4. handle_errors 429 → Anthropic body    │    │
                │  │    5. log → /var/log/caddy/api.log (json)   │    │
                │  └────────────────────┬─────────────────────────┘    │
                │                       │ http://localhost:4000          │
                │                       ▼                                │
                │  ┌──────────────────────────────────────────────┐    │
                │  │  @livinity/relay process (Node, port 4000)  │    │
                │  │  platform/relay/src/server.ts               │    │
                │  │                                              │    │
                │  │  ★ EXTEND request handler:                  │    │
                │  │    if host === 'api.livinity.io':           │    │
                │  │      lookup admin tunnel by user role       │    │
                │  │      forward TunnelRequest envelope         │    │
                │  └────────────────────┬─────────────────────────┘    │
                │                       │ WebSocket (TunnelRequest        │
                │                       │ JSON envelope, base64 body)     │
                └───────────────────────┼────────────────────────────────┘
                                        │ wss://relay.livinity.io/tunnel/connect
                                        │ (already established)
                                        ▼
                ┌──────────────────────────────────────────────────────┐
                │  Mini PC (10.69.31.68) — bruce@                     │
                │                                                       │
                │  livinityd Express :8080                             │
                │   └─► /u/:userId/v1/messages                         │
                │      ─ Bearer middleware (Phase 59) [resolves user_id]│
                │      ─ ★ container-IP-guard REMOVED (this phase)     │
                │      ─ broker handler → upstream Anthropic           │
                └──────────────────────────────────────────────────────┘
```

### Pattern 1: Caddy v2.11 directive ordering for third-party plugins

**What:** `caddy-ratelimit` is a third-party HTTP handler. Stock Caddy doesn't know its position in the directive ordering, so a global `order` block is required.

**When:** Always, when adding a third-party HTTP handler directive to a Caddyfile.

**Example (verified):**
```caddyfile
# Source: caddyserver.com/docs/caddyfile/options + caddy-ratelimit README
{
    # ... existing global options (on_demand_tls ask, etc.) ...
    order rate_limit before basic_auth
}
```

### Pattern 2: caddy-ratelimit per-key zone with per-IP fallback

**What:** Two zones — primary keyed on `Authorization` header value, fallback keyed on remote IP (catches missing/anonymous Bearer).

**When:** Public-internet endpoint that requires authentication; want abuse cap on both authed and anon traffic.

**Example (synthesized from caddy-ratelimit README + CONTEXT.md):**
```caddyfile
# Source: github.com/mholt/caddy-ratelimit/blob/master/README.md
api.livinity.io {
    tls {
        on_demand
    }
    rate_limit {
        zone bearer {
            # Bearer key acts as the per-client identity. Anonymous traffic with
            # no Authorization header all collapse onto a single shared bucket
            # (defensive — prevents one zone from authorizing huge anon traffic).
            key    {http.request.header.Authorization}
            window 1m
            events 60
        }
        zone ip {
            key    {http.request.remote.host}
            window 1m
            events 30
        }
    }
    reverse_proxy localhost:4000 {
        header_up Host           {host}      # api.livinity.io preserved
        header_up X-Real-IP      {remote_host}
        header_up X-Forwarded-For {remote_host}
        # Authorization header is forwarded by default (Caddy v2 default behavior;
        # no header_up needed unless we want to whitelist explicitly).
    }
    handle_errors 429 {
        # Plugin sets Retry-After automatically; we shape the body for Anthropic spec.
        # See platform.claude.com/docs/en/api/errors §"Error shapes" — top-level type:"error"
        # wrapper, nested error object with type+message, request_id field.
        header Content-Type application/json
        respond `{"type":"error","error":{"type":"rate_limit_error","message":"Rate limit exceeded"},"request_id":"req_relay_{http.request.uuid}"}` 429
    }
    log {
        output file /var/log/caddy/api.livinity.io.log
        format json
    }
}
```

**Key correction vs CONTEXT.md proposal:**
1. NO `distributed` block — single Server5 doesn't need cluster sync; defaults to in-memory zone-local storage [CITED: caddy-ratelimit README §"Distributed Rate Limiting" says distributed mode is opt-in].
2. NO `tls_insecure_skip_verify` — there is no upstream TLS to verify. Caddy → relay is plain `http://localhost:4000` (relay has no TLS — Caddy is the TLS layer).
3. NO `header_up Authorization` — Caddy forwards request headers verbatim by default; explicit re-statement is harmless but adds noise.
4. The 429 body is shaped via `handle_errors`, NOT via a body field on the `rate_limit` directive (`caddy-ratelimit` does not support custom body configuration in-directive).

### Pattern 3: Relay request handler extension for `api.livinity.io`

**What:** The relay's `parseSubdomain` function returns `{username: 'api', appName: null}` for `api.livinity.io`. The current `server.ts:266` then calls `registry.get('api')` — which returns `null` because no user registered under username `api`. Result: traffic falls through to `serveOfflinePage` → broken.

**When:** Phase 60 must explicitly route `api.livinity.io` to the admin user's tunnel BEFORE the generic username lookup.

**Example (proposed extension at `server.ts` ~line 257, before line 266):**
```typescript
// Source: synthesized from platform/relay/src/server.ts behavior
// API endpoint routing: api.livinity.io → admin user's tunnel
const hostnameLower = req.headers.host?.split(':')[0]?.toLowerCase();
if (hostnameLower === 'api.livinity.io') {
  // Phase 60 — find admin tunnel; forward to /u/:adminUserId/v1/...
  // Bearer middleware on Mini PC will validate the liv_sk_* token and
  // resolve the actual end user; the URL-path :userId is just a routing key.
  const adminTunnel = await findAdminTunnel(registry, pool); // helper to add
  if (!adminTunnel || adminTunnel.ws.readyState !== 1) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({type:'error', error:{type:'api_error', message:'broker tunnel offline'}}));
    return;
  }
  // Quota: charge bandwidth to admin user (per-Bearer key attribution defers to Phase 62 E1)
  const quota = await checkQuota(redis, adminTunnel.userId);
  if (!quota.allowed) { /* same 429 path as existing subdomain quota */ return; }
  // Forward; targetApp = null (broker is at root, not container-routed)
  proxyHttpRequest(adminTunnel, req, res, null);
  return;
}
```

**Why admin tunnel:** Phase 59 Bearer middleware on Mini PC livinityd is the identity authority. The URL path `/u/:adminUserId/v1/messages` is just a routing convention; the Bearer token resolves the real end-user via PG `api_keys.user_id` join. Routing all `api.livinity.io` traffic through the admin tunnel keeps the existing per-user-tunnel architecture intact while making one tunnel the broker gateway.

**Alternative considered (and rejected):** Have Caddy directly forward to Mini PC over a second tunnel (e.g., wireguard). Rejected because (1) no second tunnel exists; (2) introducing one doubles failure surface; (3) bypasses bandwidth tracking + reconnect buffering already in the relay.

### Anti-Patterns to Avoid

- **`reverse_proxy https://<minipc>:8080`** — there is no public Mini PC IP from Server5's vantage. The Mini PC is behind a NAT/firewall on a residential network; the only path is the existing reverse-WebSocket tunnel.
- **`tls_insecure_skip_verify`** — there is no upstream TLS to skip. The CONTEXT.md included this defensively; it's a noise.
- **`tls <email>` for `api.livinity.io`** — inconsistent with existing blocks that all use `tls { on_demand }`. The on-demand path is already authorized for `api` via `INFRA_SUBDOMAINS` allowlist at `server.ts:84`. Use `on_demand` for consistency. (Caddy will issue the cert on first request just as well.)
- **Hand-rolled rate-limit middleware in livinityd** — the perimeter is the right tier; rate-limiting at the broker means the request already consumed Mini PC CPU + tunnel bandwidth.
- **Not adding a `handle_errors 429` block** — `caddy-ratelimit` returns a generic Caddy 429 page (HTML "Too Many Requests") otherwise. External clients expect JSON.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-Bearer rate limiting at Mini PC | Express middleware | `caddy-ratelimit` at perimeter | Burns Mini PC CPU + tunnel bandwidth before reject; perimeter rejects free |
| DNS automation | Custom CF API script | Manual Cloudflare dashboard click (single A record, one-time setup) | One record, set-and-forget; automation overhead exceeds benefit |
| Caddy validate wrapper | Custom shell script | `caddy validate --config /etc/caddy/Caddyfile` (exit 0 on valid) | Built-in [CITED: caddyserver.com command-line] |
| Caddy reload wrapper | Custom systemctl restart | `caddy reload --config /etc/caddy/Caddyfile` (zero-downtime; rejects invalid config without restart) | Built-in graceful reload [CITED: caddyserver.com command-line] |
| Backup/rollback | Git-pin Caddyfile | `cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak.$(date +%s)` then `caddy reload --config /etc/caddy/Caddyfile.bak.<ts>` to revert | Project pattern; CONTEXT.md proposed it correctly |

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — Phase 60 is config + perimeter only. No DB schema changes. (The `api_keys` table from Phase 59 is the data dimension; Phase 60 just exposes it via internet.) | None. |
| Live service config | (1) Server5 Caddyfile at `/etc/caddy/Caddyfile` — **may have drift** vs `platform/relay/Caddyfile` in this repo (researcher cannot verify without SSH; **Wave 0 must `diff`**). (2) Cloudflare DNS zone for `livinity.io` — researcher could not locate IaC; appears manually managed. | Wave 0: SSH-Server5 confirm-or-update Caddyfile in repo; Wave 3: add A record at Cloudflare (manual or API). |
| OS-registered state | Server5 systemd service `caddy.service` (assumed standard apt install). PM2 process `relay` per `ecosystem.config.cjs`. **Wave 0 to confirm.** | None for Phase 60 unit-name change; relay receives a code update so `pm2 restart relay` after deploy. |
| Secrets/env vars | None added. Caddy uses Cloudflare token from existing wildcard config (project memory: `dns.providers.cloudflare module at /usr/bin/caddy`). | None. |
| Build artifacts / installed packages | **NEW: custom-built Caddy binary** required (`xcaddy build --with github.com/mholt/caddy-ratelimit`). The existing `/usr/bin/caddy` v2.11.2 must be replaced with the custom build. Backup the existing binary as `/usr/bin/caddy.bak.$(date +%s)` before swap. | Wave 1: build custom Caddy on Server5 (or build locally and rsync); swap binary; reload. |

**Critical observation:** `update.sh` deploys LivOS to Mini PC, not Server5. Server5 has its own deploy story (rsync from `platform/`?) which **researcher could not locate in repo**. Phase 60 plans must include explicit Server5 deploy steps; cannot rely on `update.sh`.

## Common Pitfalls

### Pitfall 1: Reverse-tunnel topology assumption
**What goes wrong:** Author assumes Caddy reverse-proxies to a Mini PC IP. There is no such IP.
**Why it happens:** Project memory says "Server5 → Mini PC via private LivOS tunnel" without specifying it's a reverse-WebSocket envelope tunnel. Memory is ambiguous.
**How to avoid:** Plans target `reverse_proxy localhost:4000` explicitly + extend `relay/server.ts` to recognize `api.livinity.io` hostname.
**Warning sign:** A plan referencing `<minipc-tunnel-host>:8080` or wireguard/Tailscale.

### Pitfall 2: caddy-ratelimit not in stock Caddy
**What goes wrong:** Plan deploys Caddyfile with `rate_limit` directive; Caddy refuses to start with "unknown directive: rate_limit".
**Why it happens:** Plugin is third-party; requires `xcaddy build`.
**How to avoid:** Wave 1 task is "build custom Caddy + swap binary" BEFORE Wave 2 (Caddyfile addition). Verification: `caddy list-modules | grep rate_limit` must show the module after install.
**Warning sign:** Caddy reload fails with "unknown directive" error.

### Pitfall 3: Directive ordering for third-party module
**What goes wrong:** Caddy refuses to load Caddyfile with "directive not allowed" or "unrecognized directive position" because it doesn't know where to put `rate_limit` in the ordering.
**Why it happens:** Stock Caddy directive order is hardcoded; third-party directives have no default position.
**How to avoid:** Add `order rate_limit before basic_auth` to the global block at top of Caddyfile. [CITED: caddyserver.com Caddyfile options]
**Warning sign:** `caddy validate` returns non-zero with directive ordering complaint.

### Pitfall 4: Anthropic 429 body shape mismatch
**What goes wrong:** External SDK clients (Anthropic Python/TS SDK, OpenAI SDK) parse the 429 body and fail on missing `request_id` or wrong `type` wrapper. Can manifest as "Failed to parse error response" in client logs instead of clean "rate limited" message.
**Why it happens:** CONTEXT.md proposed body misses outer `type: "error"` wrapper and `request_id` field.
**How to avoid:** Match Anthropic's exact shape verbatim: `{"type":"error","error":{"type":"rate_limit_error","message":"..."},"request_id":"req_..."}`. The `request_id` can be a relay-synthesized id.
**Warning sign:** Anthropic Python SDK raises `APIStatusError` with cryptic JSON parse error instead of `RateLimitError`.

### Pitfall 5: LE rate limit during testing
**What goes wrong:** Iteratively breaking + re-issuing certs for `api.livinity.io` blows past LE's "5 certificates per registered domain per week" limit.
**Why it happens:** Plan tests cert issuance multiple times; LE does NOT count successful renewals against the limit, but DOES count fresh issues.
**How to avoid:** Use Caddy's `acme_ca https://acme-staging-v02.api.letsencrypt.org/directory` for testing (staging issues fake certs unlimited); flip to production CA only on final deploy. **OR:** issue once, never reissue during test cycle.
**Warning sign:** Caddy log shows `urn:ietf:params:acme:error:rateLimited`.

### Pitfall 6: DNS cache lag during Phase 63 verification
**What goes wrong:** Tester adds A record, immediately curls `api.livinity.io`, gets DNS resolution failure or wrong IP from a stale recursive resolver.
**Why it happens:** TTL is 300s but recursive resolvers may cache longer; first query before propagation fails.
**How to avoid:** Wait ≥5 min after DNS change; verify with multiple resolvers: `dig @1.1.1.1 api.livinity.io`, `dig @8.8.8.8 api.livinity.io`. Only test from external host AFTER both return `45.137.194.102`.
**Warning sign:** First test fails; second test 5 min later passes — looks intermittent.

### Pitfall 7: Caddyfile drift between repo and Server5
**What goes wrong:** Repo `platform/relay/Caddyfile` is the "source of truth" but Server5 `/etc/caddy/Caddyfile` was last edited manually months ago and has diverged. Researcher patches repo file; Server5 deploy doesn't reflect repo because deploy story is unclear.
**Why it happens:** `update.sh` is for Mini PC, not Server5. Server5 deploy is presumed manual rsync OR direct edit on server.
**How to avoid:** Wave 0 task: SSH Server5, `diff /etc/caddy/Caddyfile <repo-version>` first. If drift exists, **document it in plan** before patching. Two acceptable resolutions: (a) reconcile repo to match Server5; (b) overwrite Server5 from repo. Pick explicitly.
**Warning sign:** Plan says "edit `platform/relay/Caddyfile`" without "deploy to Server5" task.

### Pitfall 8: Self-throttle during rate-limit verification
**What goes wrong:** Test runner at the SAME IP as the test target burns through its own per-IP rate-limit quota during 429-verification load test, blocks itself for next minute.
**Why it happens:** `for i in $(seq 1 100); do curl ... & done` from one IP fills the per-IP zone (30 events / 1m); subsequent legitimate test traffic is rejected.
**How to avoid:** Test from a host NOT used by the test runner for other ops. Or: use a temporary `key` zone like a UUID header that the test sends, so the test self-isolates from real-IP zone. Or: test the per-Bearer zone (60/min, higher limit) and verify 429 manually with the per-IP zone separately.
**Warning sign:** Subsequent tests in same run get unexpected 429s.

## Code Examples

### Example 1: Caddyfile addition (full block)

Already shown in Pattern 2 above. Place between the `*.livinity.io` and `*.*.livinity.io` blocks (alphabetical-ish order; Caddy doesn't care but the file is human-readable).

### Example 2: Caddy validate + reload pattern (verified)

```bash
# Source: caddyserver.com/docs/command-line
# Phase 60 plan rollback runbook

# 1. Backup current Caddyfile
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak.$(date +%Y%m%d-%H%M%S)

# 2. Apply new Caddyfile
sudo cp <new-Caddyfile> /etc/caddy/Caddyfile

# 3. Validate BEFORE reload (exit 0 = valid; non-zero = config error, no reload performed)
sudo caddy validate --config /etc/caddy/Caddyfile
if [ $? -ne 0 ]; then
  echo "Config invalid — aborting reload, original Caddyfile still in effect"
  exit 1
fi

# 4. Graceful reload (zero downtime; if config invalid here despite validate, Caddy keeps old config)
sudo systemctl reload caddy
# OR equivalently:
# sudo caddy reload --config /etc/caddy/Caddyfile

# 5. Confirm new block is live
curl -sI https://api.livinity.io | head -3   # expects 200/401/429 — NOT 502

# 6. Rollback (if needed)
sudo cp /etc/caddy/Caddyfile.bak.<ts> /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

### Example 3: Broker IP-guard removal diff

```diff
// Source: livinity-broker/router.ts (current state)
- // 1. IP guard — first thing, before body parsing
- router.use(containerSourceIpGuard)
-
- // 2. JSON body parsing (10MB limit — leaves room for future image content blocks)
+ // 2. JSON body parsing (10MB limit — leaves room for future image content blocks)
+ // (Phase 60 — IP guard removed; Phase 59 Bearer auth replaces it as identity surface)
  router.use(express.json({limit: '10mb'}))
```

The `containerSourceIpGuard` function in `auth.ts:32-68` can stay (dead code) OR be deleted. **Recommend delete + remove the import** in `router.ts:3` to keep auth.ts focused on `resolveAndAuthorizeUserId` (which Phase 59 may also evolve).

### Example 4: xcaddy build on Server5

```bash
# Source: github.com/mholt/caddy-ratelimit README + caddyserver/xcaddy README
# Wave 1 build steps

# Install xcaddy (if not present — single static binary)
curl -sL https://github.com/caddyserver/xcaddy/releases/latest/download/xcaddy_linux_amd64 \
  -o /tmp/xcaddy && chmod +x /tmp/xcaddy

# Build Caddy with caddy-ratelimit + existing Cloudflare DNS module
/tmp/xcaddy build v2.11.2 \
  --with github.com/caddy-dns/cloudflare \
  --with github.com/mholt/caddy-ratelimit \
  --output /tmp/caddy-custom

# Verify modules
/tmp/caddy-custom list-modules | grep -E '(rate_limit|cloudflare)'
# Expect: http.handlers.rate_limit, dns.providers.cloudflare

# Backup original + swap (Caddy is running; binary swap is safe — old process keeps running until reload)
sudo cp /usr/bin/caddy /usr/bin/caddy.bak.$(date +%Y%m%d-%H%M%S)
sudo install -m 0755 /tmp/caddy-custom /usr/bin/caddy

# Confirm new binary on disk
caddy version  # still shows v2.11.2 (xcaddy embeds same Caddy core)
caddy list-modules | grep rate_limit  # NOW shows http.handlers.rate_limit

# At this point old Caddy process is still running. Reload picks up new binary:
sudo systemctl restart caddy   # NOTE: 'reload' won't pick up new binary; needs restart

# Confirm Caddy started cleanly
sudo systemctl status caddy
sudo journalctl -u caddy -n 50 --no-pager
```

**Note on `restart` vs `reload`:** `caddy reload` reuses the running binary's parsed config; it does NOT swap the binary. To pick up the new `caddy-ratelimit`-enabled binary, a full `systemctl restart caddy` is required. This causes a ~1-2 second downtime window. Mitigations:
- Do this during low-traffic hours.
- Have rollback ready: `sudo install -m 0755 /usr/bin/caddy.bak.<ts> /usr/bin/caddy && sudo systemctl restart caddy`.
- Acceptable for a one-time bootstrap; subsequent Caddyfile changes use graceful `reload`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `caddy-ratelimit` distributed mode required Redis-like external store | Distributed mode is opt-in; default zone-local in-memory storage works fine for single-node | always | Simplifies single-Server5 deploy; no Redis dependency added [CITED: caddy-ratelimit README] |
| Custom HTTP error pages via `errors {}` (Caddy v1) | `handle_errors 429 { respond ... }` (Caddy v2) | Caddy v2.0 | Cleaner; supports placeholders |
| `tls <email> @<ca-url>` directive | `tls { on_demand }` + `acme_ca` global option | Caddy v2.5+ | Existing Caddyfile uses on-demand pattern; consistent |
| Anthropic SDK base URL hardcoded | `Anthropic(base_url=...)` since SDK v0.18+ | 2024 | Phase 63 verification uses this for `api.livinity.io` smoke test |

**Deprecated / not needed:**
- Cloudflare Workers — considered for `api.livinity.io`; rejected per CONTEXT.md (cold start, DNS posture flip).
- Wireguard tunnel from Server5 to Mini PC — never existed; the WebSocket envelope tunnel is the only path.
- Cloudflare-managed certificates — would require flipping `api.livinity.io` to "proxied" mode, breaking the existing DNS-only stack.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 1.x (livinityd) for broker IP-guard removal tests; ad-hoc bash for Server5 Caddy smoke tests |
| Config file | `livos/packages/livinityd/vitest.config.ts` (existing) for in-repo tests; **no automated tests on Server5 — Wave 0 to acknowledge** |
| Quick run command | `npm test -- livinity-broker --run` (single broker test pass, ~10s) |
| Full suite command | `npm test -- --run` (livinityd full suite) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FR-BROKER-B2-01 (a) | `api.livinity.io` resolves + reaches Caddy | smoke (manual) | `dig api.livinity.io @1.1.1.1` + `curl -I https://api.livinity.io` | manual — Wave 4 |
| FR-BROKER-B2-01 (b) | Container IP guard REMOVED from broker | unit (vitest) | `npm test -- livinity-broker/auth.test --run` after deletion of `containerSourceIpGuard` test cases | partial — must delete IP-guard test cases in `auth.test.ts` |
| FR-BROKER-B2-01 (c) | Bearer-authed external request reaches broker through Caddy → relay → tunnel → livinityd | E2E (manual) | `curl -H "Authorization: Bearer liv_sk_<test>" https://api.livinity.io/v1/messages -d '{...}'` from external host | manual — Wave 4 |
| FR-BROKER-B2-02 (a) | 429 returned when Bearer rate exceeds zone limit | smoke (manual) | `for i in $(seq 1 100); do curl -H "Authorization: Bearer <test>" https://api.livinity.io/v1/messages -d '{...}' & done; wait` — at least one 429 observed | manual — Wave 4 |
| FR-BROKER-B2-02 (b) | 429 body matches Anthropic shape | smoke (manual) | grep response body for `"type":"error"` and `"rate_limit_error"` | manual — Wave 4 |
| FR-BROKER-B2-02 (c) | `Retry-After` header present on 429 | smoke (manual) | `curl -i ... | grep -i Retry-After` | manual — Wave 4 |
| FR-BROKER-B2-02 (d) | TLS valid on `api.livinity.io` | smoke (manual) | `openssl s_client -connect api.livinity.io:443 -servername api.livinity.io < /dev/null 2>&1 | grep "Verify return code: 0"` | manual — Wave 4 |

### Sampling Rate
- **Per task commit:** `npm test -- livinity-broker --run` (~10s)
- **Per wave merge:** Full livinityd `npm test -- --run`
- **Phase gate:** Manual Wave 4 smoke battery from external host (Server5 itself qualifies; or a laptop on coffee-shop wifi for the FR-BROKER-B2-01 (c) external-host test)

### Wave 0 Gaps
- [ ] Bash test script `phase-60-smoke.sh` colocating the 4 manual smoke tests (DNS, TLS, Bearer-authed, rate-limit). Single run-from-anywhere file.
- [ ] Existing `auth.test.ts` IP-guard test cases — must be removed when `containerSourceIpGuard` is deleted. Wave 0 enumerates the test cases to remove.
- [ ] Integration test fixture: `livinity-broker/integration.test.ts` line 313 (429 forwarding test) — verify it still passes after IP-guard removal (it should; the test fixtures already mock at higher layer).

## Security Domain

> Phase 60 is platform-perimeter security. Highly relevant.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Bearer token validation lives at Mini PC livinityd (Phase 59); Server5 Caddy is transport-only |
| V3 Session Management | no | Bearer tokens are stateless; no sessions at perimeter |
| V4 Access Control | yes | Per-Bearer rate-limit zone is a coarse access control; per-IP zone is anonymous-traffic cap |
| V5 Input Validation | partial | Caddy passes body through; livinityd Bearer middleware + broker JSON validation handle real input validation |
| V6 Cryptography | yes | TLS termination via Let's Encrypt; minimum TLS version per Caddy v2 default (TLS 1.2+); never hand-roll |
| V8 Data Protection | yes | `Authorization` header is in transit between Caddy ↔ relay (`localhost:4000` — loopback, no TLS needed) and relay ↔ Mini PC (WSS, encrypted) |
| V12 Files and Resources | no | No file uploads at perimeter |
| V13 API Security | yes | Rate limiting + Bearer auth + spec-compliant 429 = standard API hardening |

### Known Threat Patterns for {Server5 Caddy + reverse-tunnel}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Brute-force Bearer token guess at high rate | Information Disclosure / Spoofing | Per-IP rate-limit zone (30/min) caps probe rate; livinityd negative-result cache (Phase 59) further reduces PG load |
| Bearer leak in logs (Caddy access log captures `Authorization` header) | Information Disclosure | Caddy default access log does NOT include request headers; **verify** `format json` doesn't accidentally include them. If it does, add `log` block-level filtering: `request>headers>Authorization delete` |
| Anonymous traffic flood (no Bearer; per-IP fallback) | DoS | Per-IP zone fires 429 above 30/min; baseline DDoS protection from Caddy + Server5 firewall |
| Tunnel hijack — malicious tunnel client steals admin role to receive `api.livinity.io` traffic | Spoofing | `findAdminTunnel(registry, pool)` MUST query `users.role = 'admin' AND id = tunnel.userId` — do NOT trust username "admin" string match. Phase 60 plan must spec this query exactly. |
| LE staging-vs-prod cert mix-up | Spoofing (cert validity) | Plan: explicit `acme_ca` in Caddyfile during testing; flip to prod on final deploy. Document in runbook. |
| Caddyfile syntax error breaking ALL `*.livinity.io` traffic | DoS (self-inflicted) | `caddy validate` BEFORE reload; backup-then-revert pattern in runbook |

## Sources

### Primary (HIGH confidence)
- [github.com/mholt/caddy-ratelimit README](https://github.com/mholt/caddy-ratelimit/blob/master/README.md) — install via xcaddy, Caddyfile syntax, distributed mode opt-in, Retry-After automatic
- [caddyserver.com/docs/caddyfile/directives/handle_errors](https://caddyserver.com/docs/caddyfile/directives/handle_errors) — handle_errors 429 with respond directive, {err.status_code}/{err.message} placeholders
- [caddyserver.com/docs/command-line](https://caddyserver.com/docs/command-line) — caddy validate / caddy reload (graceful zero-downtime) / caddy fmt
- [caddyserver.com/docs/caddyfile/options](https://caddyserver.com/docs/caddyfile/options) — `order rate_limit before basic_auth` global block syntax
- [platform.claude.com/docs/en/api/errors](https://platform.claude.com/docs/en/api/errors) — Anthropic 429 body shape, full error type list (also mirror at docs.anthropic.com/en/api/errors before redirect)
- [platform/relay/Caddyfile](C:\Users\hello\Desktop\Projects\contabo\livinity-io\platform\relay\Caddyfile) — current Caddy config (5 blocks)
- [platform/relay/src/index.ts](C:\Users\hello\Desktop\Projects\contabo\livinity-io\platform\relay\src\index.ts) — relay topology proof: WebSocket envelope tunnel
- [platform/relay/src/server.ts](C:\Users\hello\Desktop\Projects\contabo\livinity-io\platform\relay\src\server.ts) — `INFRA_SUBDOMAINS` includes `'api'` (line 84); subdomain routing logic
- [livinity-broker/router.ts:30](C:\Users\hello\Desktop\Projects\contabo\livinity-io\livos\packages\livinityd\source\modules\livinity-broker\router.ts) — IP-guard mount line for removal
- [livinity-broker/auth.ts:32-68](C:\Users\hello\Desktop\Projects\contabo\livinity-io\livos\packages\livinityd\source\modules\livinity-broker\auth.ts) — `containerSourceIpGuard` function for deletion
- [livos/packages/livinityd/source/modules/platform/tunnel-client.ts:244](C:\Users\hello\Desktop\Projects\contabo\livinity-io\livos\packages\livinityd\source\modules\platform\tunnel-client.ts) — `wss://relay.livinity.io` confirms tunnel client target

### Secondary (MEDIUM confidence)
- [Caddy community thread on caddy-ratelimit](https://caddy.community/t/new-caddy-rate-limit-module/20241) — confirms maintenance pattern
- [DeepWiki mholt/caddy-ratelimit](https://deepwiki.com/mholt/caddy-ratelimit) — supporting confirmation of 429 + Retry-After

### Tertiary (LOW confidence)
- Project memory `reference_minipc.md` — claimed Server5 Caddy at v2.11.2; unverified in this research session (Wave 0 SSH confirms)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Server5 Caddy is at v2.11.2 with dns.providers.cloudflare module loaded | Standard Stack | Low — `xcaddy build v2.11.2` will produce the version we want regardless of what's currently installed; Wave 0 SSH check confirms |
| A2 | Cloudflare DNS for `livinity.io` is manually managed (no IaC found in this repo) | Architectural Map | Medium — if IaC exists somewhere, plan should use it instead of manual edit. Phase 60 plan should ask user explicitly. |
| A3 | Server5 deploy story for `platform/relay/` is rsync-based with PM2 (per `ecosystem.config.cjs`); no automated CD pipeline | Runtime State | Medium — if there's a deploy script researcher missed, plans should use it. Wave 0 SSH check + grep `package.json` scripts. |
| A4 | The "admin user's tunnel" exists and is reliable enough to be the broker entry point | Architecture Pattern 3 | High — if admin tunnel goes offline, ALL `api.livinity.io` traffic 503s. Plan should consider fallback (e.g., round-robin across all online tunnels with valid keys, OR a dedicated "broker" tunnel role). |
| A5 | livinityd `/u/:userId/v1/messages` route accepts an arbitrary `:userId` so long as Bearer middleware resolves a real user from the `liv_sk_*` token | Architecture Pattern 3 | High — if URL-path resolver still validates `:userId` MATCHES the Bearer-resolved user_id, Phase 60 needs livinityd code change too. **Phase 59 plan 59-03 likely addresses this — researcher recommends checking 59-03-PLAN.md for the "Bearer wins over URL-path" detail.** |
| A6 | `caddy-ratelimit` zone keyed on `{http.request.header.Authorization}` correctly de-duplicates per-Bearer (each unique header value = its own bucket) | Pattern 2 | Low — verified in plugin docs (key supports placeholders); single Caddy node means each value gets its own in-memory map entry |
| A7 | Test runner can self-isolate from per-IP rate-limit during Wave 4 verification by varying source IP OR by testing per-Bearer zone (60/min) which has higher ceiling | Pitfall 8 | Low — test design choice |
| A8 | Anthropic Python/TS SDK clients accept the proposed 4-field 429 body without parse errors | Pitfall 4 | Medium — verified Anthropic error shape exists; SDK behavior on broker-synthesized 429s may differ. Phase 63 (live verification) actually tests this with real SDK. |

**If this table is empty:** N/A — has 8 assumptions worth flagging for the planner.

## Open Questions

1. **Cloudflare DNS management mechanism — manual dashboard, API token, or IaC?**
   - What we know: Caddy v2.11 has `dns.providers.cloudflare` module loaded on Server5 (per project memory); a CF API token must exist somewhere for Caddy DNS-01 challenges (would be at `/etc/caddy/` or systemd env file).
   - What's unclear: Whether DNS *records* (the A/CNAME entries themselves, not DNS-01 cert challenges) are managed via IaC.
   - Recommendation: Phase 60 plan asks user explicitly. Default = manual dashboard click for one A record; not worth automating for a single record.

2. **What is Server5's deploy story for `platform/relay/` source changes?**
   - What we know: `update.sh` deploys LivOS to Mini PC, not Server5. `ecosystem.config.cjs` says `cwd: '/opt/platform/relay'`, suggesting rsync from this repo's `platform/relay/` to `/opt/platform/relay/` on Server5.
   - What's unclear: Whether there's an automated rsync script OR manual copy.
   - Recommendation: Phase 60 plan Wave 0 confirms via SSH. Wave 3 task explicitly enumerates the deploy steps (rsync command + `pm2 restart relay`).

3. **Should `api.livinity.io` route through admin tunnel OR a dedicated broker-role tunnel?**
   - What we know: The relay registers tunnels by `username`. Admin user = single-user-mode owner. Routing via admin tunnel works if admin is always online.
   - What's unclear: Whether multi-user deployments (Phase 60 doesn't disable multi-user) want all `api.livinity.io` traffic gated through a single user's tunnel.
   - Recommendation: For v30, route via admin tunnel (simplest; matches single-user-mode default). Document the multi-user implication: `liv_sk_*` keys belong to specific users, but ALL traffic still flows through admin tunnel; Bearer middleware on Mini PC resolves user identity per-request. This is fine because admin tunnel is just a pipe.

4. **Does the Phase 59 Bearer middleware override URL-path `:userId` validation when Bearer wins?**
   - What we know: Phase 59 CONTEXT.md says "URL-path `:userId` becomes optional (Bearer is the source of identity when present)."
   - What's unclear: Does Phase 59 plan 59-03 actually skip `resolveAndAuthorizeUserId` (which 404s on unknown `:userId`) when Bearer is set? If not, Phase 60 traffic with `Host: api.livinity.io` and URL `/u/<admin-id>/v1/messages` would have `<admin-id>` validated against the URL — fine if we use a real admin id, but a real concern if we used a sentinel like `/u/api/v1/messages`.
   - Recommendation: Phase 60 routes through the admin user's actual UUID; relay knows admin's tunnel registration username/userId. No sentinel needed.

5. **Does `xcaddy build` produce a binary compatible with the installed Caddy systemd unit + Cloudflare module config?**
   - What we know: xcaddy embeds a specific Caddy version + chosen modules; the binary is drop-in compatible.
   - What's unclear: Whether the existing `/etc/caddy/Caddyfile` references any modules that xcaddy build doesn't include.
   - Recommendation: Wave 1 task: `caddy list-modules > /tmp/before.txt`, build new binary, `<new>/caddy list-modules > /tmp/after.txt`, `diff /tmp/before.txt /tmp/after.txt` — verify NO modules are dropped; only `http.handlers.rate_limit` is added.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Caddy v2.11.2 | All Phase 60 work | ✓ (Server5; per project memory) | v2.11.2 (Wave 0 confirms) | — |
| `xcaddy` | Wave 1 build | ✗ on Server5 (assumed; Wave 0 confirms) | — | Single static binary download from `caddyserver/xcaddy` releases; or build locally + scp |
| Go toolchain (xcaddy needs Go ≥1.21) | xcaddy build | ✗ on Server5 likely (Wave 0 confirms) | — | (a) Install Go on Server5 for one-time build; (b) Build elsewhere (researcher's machine OR a CI runner) and `scp` the resulting `caddy-custom` binary |
| Cloudflare API token (for DNS A record add) | Wave 3 DNS step | ?✓ (token exists somewhere for Caddy CF DNS challenge; reuse OR manual dashboard) | — | Manual click in Cloudflare dashboard |
| External-network test host | Wave 4 smoke battery | ✓ (Server5 itself qualifies; OR researcher's local machine) | — | — |
| `dig` / `openssl s_client` / `curl` | Wave 4 smoke | ✓ (any modern Linux/macOS) | — | — |

**Missing dependencies with no fallback:** None — all gaps have viable workarounds.

**Missing dependencies with fallback:**
- xcaddy + Go: build locally and `scp` to Server5; ~30s build, single 50MB binary upload.

## Project Constraints (from CLAUDE.md)

CLAUDE.md does not exist at `./CLAUDE.md` (researcher confirmed via `Read` failure). Project-level constraints come from project memory (system reminder) and STATE.md:

- **D-NO-NEW-DEPS:** Preserved for LivOS code. Caddy plugin install is platform infra, not LivOS — does NOT violate. The relay code extension (`server.ts` for `api.livinity.io` routing) uses no new packages.
- **D-NO-SERVER4:** Server4 hands-off. Phase 60 work is Server5 + Mini PC code only. NEVER apply patches to Server4.
- **D-LIVINITYD-IS-ROOT:** Preserved (no daemon model change in Phase 60).
- **D-NO-BYOK:** Preserved (broker still issues its own `liv_sk_*`; user's raw `claude_*` never enters broker).
- **Sacred file UNTOUCHED:** `nexus/packages/core/src/sdk-agent-runner.ts` SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` not modified.
- **Server5 platform-only:** "livinity.io relay only — NO LivOS install." Phase 60 honors this — only `platform/relay/` + Caddy config touched on Server5; ZERO `/opt/livos/` or `livos.service` work there.
- **Mini PC SSH rate-limit / fail2ban:** Project memory: "ALL diagnostic SSH calls MUST batch into ONE invocation." Phase 60 plans for SSH (Wave 0) MUST batch all probes into one ssh invocation.

## Metadata

**Confidence breakdown:**
- Standard stack (Caddy + caddy-ratelimit + xcaddy): HIGH — verified against upstream README + caddyserver.com docs.
- Architecture (relay extension required): HIGH — verified by reading `platform/relay/src/server.ts` line by line.
- 429 body shape: HIGH — Anthropic docs source extracted verbatim.
- Cloudflare DNS management mechanism: LOW — could not locate IaC; assumed manual.
- Server5 deploy story for relay code changes: LOW — could not locate deploy script in repo; assumed manual rsync. **Wave 0 confirms.**
- Pitfalls: HIGH — primary pitfall (tunnel topology assumption) confirmed by reading source; LE rate limit confirmed by Caddy docs.

**Research date:** 2026-05-02
**Valid until:** 2026-06-01 (30 days for stable Caddy ecosystem; faster expiry if `caddy-ratelimit` ships breaking change — check upstream changelog before Phase 60 implementation)
