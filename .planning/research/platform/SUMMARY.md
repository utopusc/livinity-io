# Project Research Summary

**Project:** Livinity Platform v8.0 (livinity.io)
**Domain:** Tunnel relay SaaS platform for self-hosted LivOS instances
**Researched:** 2026-03-17
**Confidence:** HIGH

## Executive Summary

Livinity Platform v8.0 turns LivOS from a local-only self-hosted server OS into a globally accessible product by adding a central tunnel relay (livinity.io) that routes internet traffic to users' home servers via persistent WebSocket connections. The architecture consists of three new components: a custom Node.js WebSocket relay server on Server5, a Next.js 15 SaaS website for user accounts and tunnel management, and a lightweight tunnel client module embedded inside livinityd on each user's server. The recommended approach is a custom relay rather than an off-the-shelf tool like frp or rathole, because the platform requires per-byte bandwidth metering, direct database access for API key validation, and two-level subdomain routing -- none of which existing tunnel tools provide without extensive wrapping.

The stack is well-aligned with the existing LivOS ecosystem: Node.js + TypeScript for the relay (sharing ws, ioredis, and jsonwebtoken libraries already in use), Next.js 15 with Drizzle ORM and Better Auth for the SaaS dashboard, Cloudflare wildcard DNS for subdomain resolution, and Caddy with DNS-01 challenge for TLS. The relay and Next.js app run as separate processes on Server5 (45.137.194.102), communicating via Redis pub/sub. A single `*.livinity.io` wildcard DNS record handles all user subdomains -- no per-user DNS records needed. App subdomains (e.g., `immich.alice.livinity.io`) are resolved by the wildcard but require On-Demand TLS from Caddy since standard wildcards only cover one subdomain level.

The primary risks are: (1) WebSocket connections dropping silently through the tunnel due to Caddy config reloads and missing upgrade handlers -- mitigated by explicit WS upgrade handling, ping/pong heartbeats, and `stream_close_delay 5m` in Caddy; (2) relay server memory exhaustion on Server5's 8GB RAM -- mitigated by explicit connection lifecycle management, bounded caches with TTL, and memory monitoring; and (3) the identity confusion of two separate auth systems (livinity.io platform account vs. LivOS server login) -- mitigated by clear naming conventions ("Platform Account" vs. "Server Login" vs. "API Key") and keeping the systems deliberately separate with no SSO in v8.0. The Let's Encrypt rate limit of 50 certificates per registered domain per week caps new user onboarding at ~50/week, which is sufficient for launch.

## Key Findings

### Recommended Stack

The stack leverages the existing LivOS technology base wherever possible, minimizing new dependencies and keeping operational complexity low for a two-server deployment (Server4 production LivOS, Server5 platform).

**Core technologies:**

| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| Tunnel relay | Custom Node.js + `ws` | Node 22 LTS, ws 8.x | Only option with native per-byte metering and direct auth integration; frp/rathole lack metering hooks |
| Platform web | Next.js 15, App Router | 15.x | Server Components for marketing pages, Server Actions for forms, Route Handlers for API |
| Auth | Better Auth | latest | Actively developed successor to Auth.js/Lucia; plugin ecosystem for email verification, rate limiting |
| ORM | Drizzle ORM | latest | Instant TypeScript inference, PostgreSQL-native API (needed for bandwidth aggregation queries) |
| Email | Resend + react-email | latest | Managed deliverability, React template DX, 3,000 free emails/month |
| UI | Tailwind CSS 3.4 + shadcn/ui | 3.4.x | Matches LivOS design system; share design tokens |
| DNS | Cloudflare API (`cloudflare` npm SDK) | latest | Wildcard A records, near-instant propagation, existing Cloudflare setup |
| TLS | Caddy v2 + DNS-01 (cloudflare module) | 2.11.x | Static wildcard for `*.livinity.io`, On-Demand TLS for `*.*.livinity.io` app subdomains |
| Bandwidth (hot) | Redis `INCRBY` via ioredis 5.x | 5.x | Lock-free atomic increments for concurrent tunnel writes |
| Bandwidth (cold) | PostgreSQL 16 via 60s flush job | 16.x | Durable, queryable, source of truth for quotas and billing |
| Request IDs | nanoid 5.x | 5.x | Fast, URL-friendly, collision-resistant |
| Process manager | PM2 | latest | Consistent with existing LivOS deployment on Server4 |

**Critical version requirements:**
- Node.js 22 LTS (for stable WebSocket handling and `crypto.randomUUID`)
- Caddy must have the `dns.providers.cloudflare` module compiled in (already present on Server5)
- PostgreSQL 16 (for `gen_random_uuid()` and improved JSON operations)

### Expected Features

**Must have (table stakes) -- 7 features:**
1. **Landing page** -- Hero, how-it-works, feature cards, pricing placeholder, footer. Static Next.js SSG page.
2. **User registration + email verification** -- Email/password signup, Resend verification email, unverified users cannot generate API keys.
3. **Login with email/password** -- Better Auth session management, httpOnly secure cookie, 30-day rolling expiry.
4. **Dashboard + API key generation** -- Connection status widget, API key display (show once on generation, store bcrypt hash), bandwidth gauge, subdomain info.
5. **Server connection status** -- Green/grey dot based on Redis `tunnel:connected:{userId}` key with 90s TTL, refreshed by client heartbeat.
6. **Tunnel connection instructions** -- Personalized install command with API key prefix, `curl | bash` install script.
7. **Basic bandwidth usage display** -- Progress bar from PostgreSQL `bandwidth_usage` table, color thresholds at 80%/95%/100%.

**Should have (differentiators) -- 4 features:**
8. **AI server OS integration** -- No new LivOS code; relay routes `{username}.livinity.io` to LivOS main port. This IS the value proposition.
9. **One-command install** -- `curl -sSL https://livinity.io/install.sh | bash` downloads and configures the tunnel client. Single API key, entire LivOS instance publicly routable.
10. **App store subdomain access** -- Each installed app accessible at `{app}.{username}.livinity.io` via relay Host header routing. Dashboard shows installed apps with copy-able URLs.
11. **Multi-user support** -- LivOS v7.0 already implements this. Platform marketing highlights it as a differentiator vs. ngrok/Cloudflare Tunnel.

**Defer (v8.1+):**
- Payment processing (Stripe) -- v8.1. Free tier only for launch; "Premium coming soon" placeholder.
- Custom domain support (`myserver.example.com`) -- v8.1 premium feature.
- Multi-region relay -- v8.2. Single relay on Server5 (EU) is sufficient for launch.
- Mobile app -- v9.0. Browser access covers the core use case.
- White-label / third-party API -- unplanned.

### Architecture Approach

The platform adds three new components to the LivOS ecosystem without modifying the core LivOS serving path. The relay server is a standalone Node.js process on Server5 (:4000) that maintains an in-memory Map of username-to-WebSocket connections. The Next.js app runs alongside it (:3000). They communicate via Redis pub/sub, not HTTP. The tunnel client is a new module inside livinityd (not a separate process), sharing livinityd's Redis connection, logger, and config system.

**Major components:**

1. **Relay Server** (platform/relay/, ~800 lines TS) -- Accepts tunnel WebSocket connections at `/tunnel/connect`, validates API keys, maintains tunnel registry, serializes/deserializes HTTP requests as JSON+base64 envelopes, handles WebSocket upgrade proxying, counts bandwidth via Redis INCRBY.

2. **livinity.io Next.js App** (platform/web/) -- Marketing pages (SSG), auth pages (register/login via Better Auth), dashboard (connection status, API key, bandwidth), API routes for tunnel registration and TLS authorization (`/api/tls/authorize` for Caddy On-Demand TLS ask endpoint).

3. **LivOS Tunnel Client** (livos/packages/livinityd/source/modules/platform/) -- Single WebSocket connection to relay, request forwarding to 127.0.0.1:8080, WebSocket upgrade proxying, exponential backoff reconnection, config stored in Redis keys.

**Key architectural decisions:**
- Wildcard DNS only (no per-user DNS records) -- all routing is application-layer in the relay
- JSON+base64 message envelope (debuggable; binary protocol deferred until profiling shows need)
- Single relay process (sufficient for 50-100 tunnels; clustering deferred)
- Relay and Next.js as separate processes (Next.js does not support WebSocket servers natively)
- Redis pub/sub for relay<->Next.js communication (no internal HTTP API exposure)

### Critical Pitfalls

The top 5 pitfalls that must be addressed during implementation, ordered by severity:

1. **P1: WebSocket connections drop silently through the tunnel** -- Caddy's `stream_close_delay` defaults to 0, killing all WebSocket connections on any config reload. The relay must handle `server.on('upgrade')` explicitly (not via http-proxy-middleware alone). LivOS relies on WebSocket for tRPC, AI streaming, terminal, and voice -- if WebSocket passthrough fails, the product is unusable. **Prevention:** Set `stream_close_delay 5m` in Caddy config, implement explicit WS upgrade handling in relay, add 30s ping/pong heartbeat, ensure SSE responses are not buffered.

2. **P5: Relay server memory exhaustion** -- Server5 has 8GB RAM shared across relay, Next.js, PostgreSQL, and Redis. Node.js WebSocket memory leaks are well-documented (orphaned connections in Maps, uncollected event listeners). With 50-100 tunnels reconnecting through storms, the relay can OOM. **Prevention:** Explicit `TunnelConnection` class with `destroy()` method, bounded LRU caches with TTL (no unbounded Maps), memory monitoring on health endpoint, alert at 70% (5.6GB), auto-reject new connections at 80%.

3. **P3: Wildcard DNS does not cover nested subdomains** -- `*.livinity.io` covers `alice.livinity.io` but NOT `immich.alice.livinity.io`. Multi-level wildcards (`*.*.livinity.io`) are invalid in DNS. **Prevention:** Use Caddy On-Demand TLS with a DNS-01 challenge to issue individual `*.{username}.livinity.io` certificates on first connection. The `ask` endpoint validates the username against PostgreSQL. Let's Encrypt rate limit of 50 certs/week caps onboarding to ~50 new users/week. Alternatively, use a second domain (`livinity.app`) with flat wildcard for app subdomains.

4. **P4: Two separate auth systems create identity confusion** -- Users have a livinity.io "Platform Account," a LivOS "Server Login," and an "API Key" for the tunnel. Three different credentials. **Prevention:** Crystal clear naming everywhere in UI and docs. Do NOT implement SSO in v8.0. The API key is the only link between the two systems. Provide clear error messages that identify which system the user needs to interact with.

5. **P8: Tunnel protocol not designed for reconnection** -- Residential internet has micro-outages. Without session resumption, every 2-second blip requires full re-authentication and loses all in-flight requests. **Prevention:** Assign persistent session IDs, buffer incoming requests for 30s during reconnection window, implement exponential backoff with jitter (1s to 60s max) on the client, serve a branded "Connecting..." page instead of browser error.

## Implications for Roadmap

Based on the combined research, the platform should be built in 6 phases. The ordering is driven by hard dependencies (relay must exist before anything routes through it) and the principle of testable increments (each phase produces something that can be verified end-to-end).

### Phase 1: Project Setup + Relay Server Core
**Rationale:** Everything depends on the relay. The relay is the most architecturally novel component and carries the highest risk (P1, P2, P5, P8). It must be built and stress-tested first.
**Delivers:** Working relay that accepts a hardcoded tunnel connection, proxies HTTP requests through it, handles WebSocket upgrades, and counts bandwidth.
**Addresses features:** None user-facing -- this is infrastructure.
**Avoids pitfalls:** P1 (WebSocket handling), P2 (multiplexing design), P5 (memory management), P8 (reconnection protocol), P10 (codebase separation), P15 (header passthrough for CORS/cookies).
**Stack elements:** Node.js 22, ws 8.x, ioredis 5.x, nanoid, jsonwebtoken.
**Estimated scope:** ~800-1200 lines TypeScript for relay + ~200 lines for tunnel client module in livinityd.

### Phase 2: DNS, TLS, and Subdomain Routing
**Rationale:** With the relay working locally, wire it up to real domains and TLS so end-to-end browser access is testable.
**Delivers:** `alice.livinity.io` resolves to Server5, Caddy terminates TLS, relay routes to the correct tunnel, app subdomains work.
**Addresses features:** Feature 10 (app subdomain access).
**Avoids pitfalls:** P3 (wildcard DNS limitations), P7 (Caddy reload kills connections), P18 (missing offline page).
**Stack elements:** Cloudflare API, Caddy On-Demand TLS, DNS-01 challenge.
**Key decisions this phase:** Subdomain naming scheme (nested `app.user.livinity.io` vs flat `user-app.livinity.io`), whether to use a second domain for app subdomains.

### Phase 3: Platform Authentication + Registration
**Rationale:** Before the dashboard can exist, users must be able to register and log in. Auth is a prerequisite for API key generation, which is a prerequisite for tunnel connections.
**Delivers:** Working registration flow with email verification, login, session management, and the PostgreSQL schema for platform users.
**Addresses features:** Feature 2 (registration), Feature 3 (login).
**Avoids pitfalls:** P4 (auth naming confusion), P9 (abuse prevention via email verification).
**Stack elements:** Better Auth, Drizzle ORM, Resend, PostgreSQL 16.

### Phase 4: Dashboard + API Key System + Tunnel Provisioning
**Rationale:** With auth working, build the dashboard that generates API keys and provisions tunnels. This is the phase where the full user flow becomes testable: register -> get API key -> connect LivOS -> see status.
**Delivers:** Dashboard with API key generation, connection status widget, bandwidth display, tunnel connection instructions. LivOS Settings UI for entering the API key.
**Addresses features:** Feature 4 (dashboard + API key), Feature 5 (connection status), Feature 6 (instructions), Feature 7 (bandwidth display).
**Avoids pitfalls:** P6 (bandwidth metering definition -- establish measurement semantics here), P17 (token rotation).
**Stack elements:** Next.js 15 App Router, shadcn/ui, Tailwind CSS 3.4, Redis for status polling.

### Phase 5: Landing Page + Install Script
**Rationale:** The landing page and install script are the public-facing launch components. They depend on the dashboard and relay being stable so the advertised flow actually works.
**Delivers:** Marketing landing page, `install.sh` script that downloads the tunnel client, one-command setup experience.
**Addresses features:** Feature 1 (landing page), Feature 9 (one-command install).
**Stack elements:** Next.js SSG, Framer Motion (animations), shell script for installer.

### Phase 6: Polish, Monitoring, and Launch Prep
**Rationale:** Hardening, observability, abuse prevention, and operational readiness before opening to users.
**Delivers:** PM2 resource limits, health endpoints, abuse detection heuristics, rate limiting on relay and registration, Terms of Service, branded offline pages, Let's Encrypt staging-to-production switch.
**Addresses features:** Feature 8 (AI server OS -- marketing emphasis), Feature 11 (multi-user -- marketing emphasis).
**Avoids pitfalls:** P9 (abuse), P12 (scaling), P13 (reconnection storms), P16 (resource contention).

### Phase Ordering Rationale

- **Relay first (Phase 1)** because it is the hardest component and everything depends on it. If the relay architecture is wrong, every subsequent phase is wasted work. The reconnection protocol, multiplexing design, and memory management patterns must be validated before building anything on top.
- **DNS/TLS second (Phase 2)** because you need real domain routing to test anything end-to-end. Localhost testing hides Caddy, DNS, and certificate issues.
- **Auth before dashboard (Phase 3 before 4)** because the dashboard is protected by auth. Building the dashboard without auth means building fake auth first and replacing it later.
- **Landing page late (Phase 5)** because it is independent of the technical stack and can be built in parallel with earlier phases if resources allow. But it should not delay the core relay/auth/dashboard work.
- **Monitoring/hardening last (Phase 6)** because you need the system running to know what to monitor. But abuse prevention (email verification) should be in Phase 3.

### Research Flags

**Phases likely needing deeper research during planning:**
- **Phase 1 (Relay Server):** The WebSocket multiplexing protocol and reconnection design are custom work with no off-the-shelf solution. Review localtunnel/server and pipenet architectures for reference. The TCP meltdown mitigation (P2) needs benchmarking with simulated packet loss.
- **Phase 2 (DNS/TLS):** The interaction between Cloudflare proxy mode, Caddy On-Demand TLS, and DNS-01 challenges needs careful testing. Research whether Cloudflare's orange-cloud proxy interferes with Caddy's ACME challenges (it may require grey-cloud/DNS-only for cert issuance).

**Phases with standard patterns (skip deep research):**
- **Phase 3 (Auth):** Better Auth has comprehensive documentation and a well-defined setup path for Next.js + Drizzle. Standard SaaS auth patterns.
- **Phase 4 (Dashboard):** Standard Next.js CRUD dashboard with Server Components. Well-documented patterns.
- **Phase 5 (Landing Page):** Static marketing page. No novel technical challenges.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies are mature, well-documented, and consistent with existing LivOS ecosystem. Better Auth is the newest choice but is backed by the former Auth.js team. |
| Features | HIGH | Table stakes are clearly defined by competitive analysis (ngrok, CF Tunnel, Tailscale). Differentiators leverage existing LivOS v7.0 capabilities. Feature scoping is tight. |
| Architecture | HIGH | Three-component architecture (relay, web, client) is well-established in tunnel services. Data flow diagrams and protocol specification are detailed. Separation of relay and Next.js is validated by Next.js limitation on WS support. |
| Pitfalls | HIGH | 18 pitfalls identified from codebase analysis, official documentation, and production tunnel service precedents. Critical pitfalls (P1, P5, P8) have concrete prevention strategies with code-level guidance. |

**Overall confidence:** HIGH

### Gaps to Address

1. **Cloudflare proxy vs. Caddy ACME conflict:** STACK.md recommends non-proxied (grey cloud) DNS records for Caddy's DNS-01 challenge, but ARCHITECTURE.md recommends proxied (orange cloud) for DDoS protection. These are contradictory. **Resolution needed during Phase 2:** DNS-01 challenges work through Cloudflare's API regardless of proxy status (the challenge is DNS-based, not HTTP-based), so orange cloud should be fine. But this needs verification in the actual Caddy + Cloudflare setup on Server5.

2. **App subdomain strategy not fully resolved:** STACK.md proposes `{app}.{username}.livinity.io` with Caddy On-Demand TLS. PITFALLS.md (P3) warns this requires one certificate per user (50/week LE limit). ARCHITECTURE.md proposes a second domain (`livinity.app`) for app subdomains. **Resolution needed during Phase 2:** Decide between nested subdomains on one domain (simpler UX, rate-limited onboarding) or a second domain (avoids rate limit but adds operational complexity).

3. **Username validation rules undefined:** Usernames become subdomains. Reserved words (admin, www, api, app, relay, status, etc.), character restrictions (alphanumeric + hyphens), and length limits need to be defined before the registration flow is built. **Resolution needed during Phase 3.**

4. **Relay process deployment strategy:** PM2 is assumed but not verified for Server5. Server5 currently uses systemd (per MEMORY.md). **Resolution needed during Phase 1 setup:** Decide PM2 vs. systemd for the new platform services.

5. **Bandwidth measurement semantics:** PITFALLS.md (P6) raises the question of what exactly "bandwidth" means (application-layer bytes vs. wire bytes). The measurement definition affects user trust and must be documented publicly. **Resolution needed during Phase 4 dashboard implementation.**

## Sources

### Primary (HIGH confidence)
- [Cloudflare Wildcard DNS Documentation](https://developers.cloudflare.com/dns/manage-dns-records/reference/wildcard-dns-records/)
- [Cloudflare Wildcard Proxy Announcement](https://blog.cloudflare.com/wildcard-proxy-for-everyone/)
- [Cloudflare API: Create DNS Record](https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/create/)
- [Caddy Automatic HTTPS](https://caddyserver.com/docs/automatic-https)
- [Caddy reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
- [Caddy On-Demand TLS](https://caddy.community/t/on-demand-tls-rate-limits/10986)
- [Caddy WebSocket reload issue #6420](https://github.com/caddyserver/caddy/issues/6420)
- [Let's Encrypt Rate Limits](https://letsencrypt.org/docs/rate-limits/)
- [Next.js WS Discussion #58698](https://github.com/vercel/next.js/discussions/58698)
- LivOS codebase analysis (server/index.ts, caddy.ts, jwt.ts, common.ts)

### Secondary (MEDIUM confidence)
- [frp (Fast Reverse Proxy)](https://github.com/fatedier/frp) -- ~90k stars, evaluated and rejected for lacking metering hooks
- [rathole](https://github.com/rathole-org/rathole) -- evaluated and rejected for lacking plugin system
- [localtunnel/server](https://github.com/localtunnel/server) -- reference tunnel architecture
- [Pipenet](https://github.com/punkpeye/pipenet) -- TypeScript tunnel reference implementation
- [ws library memory issues](https://github.com/websockets/ws/issues/804)
- [Better Auth vs Auth.js](https://betterstack.com/community/guides/scaling-nodejs/better-auth-vs-nextauth-authjs-vs-autho/)
- [Drizzle vs Prisma 2026](https://makerkit.dev/blog/tutorials/drizzle-vs-prisma)
- [Stripe Usage-Based Billing Guide](https://docs.stripe.com/billing/subscriptions/usage-based/implementation-guide)
- [awesome-tunneling](https://github.com/anderspitman/awesome-tunneling)

### Tertiary (LOW confidence)
- TCP-over-TCP meltdown performance numbers (theoretical, depends on network conditions)
- Node.js per-connection WebSocket memory overhead (varies by implementation)
- Cloudflare DNS record limits per plan tier (community forums, not official docs)

---
*Research completed: 2026-03-17*
*Ready for roadmap: yes*
