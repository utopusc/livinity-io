# Domain Pitfalls: Adding Tunnel Relay Platform to LivOS (v8.0 - Livinity Platform)

**Domain:** Building a central tunnel relay (livinity.io) that connects to self-hosted LivOS instances, with SaaS dashboard, DNS wildcard routing, WebSocket proxying, and freemium bandwidth metering
**Researched:** 2026-03-17
**Overall confidence:** HIGH (based on codebase analysis + verified web research + Cloudflare official docs)

---

## Critical Pitfalls

Mistakes that cause architecture rewrites, data loss, or make the platform unusable.

---

### P1: WebSocket Connections Drop Silently Through the Tunnel

**What goes wrong:** LivOS relies heavily on WebSocket for tRPC subscriptions, AI streaming (SSE over WebSocket), terminal sessions, and voice. A tunnel relay adds two additional hops (LivOS client -> relay server -> user browser), and each hop introduces opportunities for silent WebSocket disconnection. The relay silently closes idle WebSocket connections, and neither end knows the other is gone. The user sees a frozen UI; the LivOS instance keeps buffering messages to a dead socket.

**Why it happens in this project specifically:**
- Caddy on Server5 has default `stream_timeout` behavior -- WebSocket connections get no special timeout treatment unless explicitly configured. Caddy's `stream_timeout` defaults to no timeout, but `stream_close_delay` is 0 by default, meaning config reloads (which happen whenever a new tunnel registers) instantly kill all active WebSocket connections.
- The existing app gateway in `server/index.ts` uses `createProxyMiddleware` with `ws: false` (line 267: "ws disabled -- WS upgrades handled manually in upgrade handler"). If the relay reuses this pattern but forgets to implement the manual upgrade handler for tunneled connections, WebSockets simply fail to establish.
- tRPC uses WebSocket transport for subscriptions (real-time updates). The existing `httpOnlyPaths` mechanism in `common.ts` forces certain routes to HTTP, but any route NOT in that list goes through WebSocket -- which means the tunnel must support WebSocket passthrough for the majority of tRPC operations.
- AI chat streaming (`/api/agent/stream`) uses Server-Sent Events over HTTP, which are long-lived connections. The relay must avoid buffering SSE responses or applying request timeout to them.

**Consequences:**
- AI chat appears frozen (SSE stream broken mid-response)
- Terminal sessions disconnect randomly
- tRPC subscriptions fail, causing stale UI state (app status, notifications)
- Voice pipeline becomes unusable (WebSocket is required)

**Warning signs:**
- Users report "AI stopped responding" but LivOS instance logs show the response was sent
- Terminal sessions work for a few minutes then freeze
- UI shows stale data (apps appear stopped when they are running)
- Browser console shows `WebSocket is already in CLOSING or CLOSED state`

**Prevention:**
1. **Explicit WebSocket upgrade handling in relay:** The relay MUST intercept HTTP `Upgrade: websocket` headers and establish a bidirectional pipe to the tunnel client. Do NOT rely on `http-proxy-middleware` alone -- handle the `server.on('upgrade', ...)` event explicitly, as documented in [Node.js http-proxy-middleware issues](https://github.com/chimurai/http-proxy-middleware/issues/432).
2. **Application-level ping/pong:** Implement a 30-second ping/pong heartbeat between relay and tunnel client, AND between relay and user browser. WebSocket protocol has built-in ping/pong frames -- use them. Detect dead connections within 60 seconds.
3. **Caddy `stream_close_delay`:** Set `stream_close_delay 5m` on the relay Caddy config so config reloads (triggered by new tunnel registrations) give existing WebSocket connections 5 minutes to drain gracefully instead of killing them instantly.
4. **SSE passthrough:** Ensure the relay does NOT buffer responses. Set `X-Accel-Buffering: no` and use `Transfer-Encoding: chunked`. The relay proxy must flush each chunk immediately.
5. **Reconnection protocol:** The tunnel client must auto-reconnect with exponential backoff and resume session state. Design this into the tunnel protocol from day one -- retrofitting reconnection is extremely painful.

**Which phase should address it:** Phase 1 (Tunnel Relay Server) -- this is the core functionality. If WebSocket doesn't work through the tunnel, the product is unusable.

**Confidence:** HIGH -- verified against existing `server/index.ts` app gateway code and Caddy WebSocket documentation.

---

### P2: TCP-over-WebSocket Performance Degradation (TCP Meltdown)

**What goes wrong:** The tunnel transports TCP traffic (HTTP, WebSocket, database connections) inside a WebSocket connection, creating a TCP-over-TCP situation. When packet loss occurs on the outer connection, the outer TCP retransmits and the inner TCP also retransmits, causing exponential throughput degradation. This is known as the "TCP meltdown" problem. For a self-hosted product where users may have residential internet with variable quality, this is not a theoretical concern.

**Why it happens in this project specifically:**
- LivOS instances will run on home servers with consumer ISPs -- asymmetric bandwidth, packet loss during peak hours, and NAT traversal issues are common
- The tunnel must carry multiple concurrent streams: HTTP requests, WebSocket connections (tRPC, terminal, voice), SSE streams, and potentially file uploads/downloads through Docker apps
- A single tunnel WebSocket connection carrying all these streams means one dropped packet blocks ALL streams (head-of-line blocking)
- Server5 has 8GB RAM -- the relay must buffer and reorder frames efficiently without consuming excessive memory

**Consequences:**
- Perceived latency spikes to seconds during periods of even minor packet loss
- Voice pipeline becomes unusable (voice requires consistent low latency)
- File uploads through tunneled Docker apps (e.g., uploading photos to Immich) stall or fail
- Head-of-line blocking makes all apps feel slow even when only one is transferring data

**Warning signs:**
- Users on WiFi or mobile hotspot experience much worse performance than direct access
- Latency appears to multiply (100ms RTT becomes 500ms+ through tunnel)
- Voice quality degrades noticeably compared to LAN/direct access
- Large file uploads frequently time out

**Prevention:**
1. **Multiple tunnel connections per instance:** Use a pool of 2-4 parallel tunnel WebSocket connections and distribute streams across them. This limits head-of-line blocking to the streams sharing that specific connection.
2. **Stream multiplexing with independent flow control:** Implement a multiplexing protocol (similar to HTTP/2 framing or QUIC stream design) within the tunnel. Each logical stream gets its own flow control window so a stalled stream does not block others.
3. **Prioritize latency-sensitive traffic:** Voice and tRPC subscriptions should get priority over file uploads. Implement basic QoS by assigning interactive streams to dedicated connections and bulk transfers to separate ones.
4. **Consider QUIC/HTTP3 for tunnel transport:** If the relay and tunnel client both support it, QUIC eliminates TCP meltdown entirely because it handles multiplexing natively with independent streams. This is a stretch goal but worth evaluating.
5. **Benchmark early:** Set up a test with artificial 1-2% packet loss and measure latency/throughput through the tunnel. Do this in the first phase, not after shipping.

**Which phase should address it:** Phase 1 (Tunnel Relay Server) -- the multiplexing design is an architectural decision that cannot be retrofitted easily. The basic pool-of-connections approach should be built from day one.

**Confidence:** MEDIUM-HIGH -- TCP meltdown is well-documented in tunneling literature. The severity depends on users' network quality, which varies. The mitigation approaches are proven (ngrok, Cloudflare Tunnel, and Tailscale all use connection pooling or QUIC).

---

### P3: Cloudflare Wildcard DNS Does Not Automatically Create Per-Tunnel Records

**What goes wrong:** The plan calls for `*.livinity.io` wildcard DNS routing so each tunnel gets a subdomain like `alice.livinity.io`. While Cloudflare now supports proxying wildcard DNS records on all plans (since May 2022), there are critical nuances that trip up implementations:

1. A wildcard record only matches when NO specific record exists at that name. If you create a specific A record for `alice.livinity.io`, the wildcard stops matching for `alice`.
2. Multi-level wildcards do NOT work. `*.*.livinity.io` is not valid -- only the first label is interpreted as wildcard.
3. Cloudflare does not automatically create individual DNS records when you add tunnel hostnames -- you must create them manually or via API.

**Why it happens in this project specifically:**
- LivOS already uses per-app subdomains: `immich.livinity.cloud`, `vikunja.livinity.cloud`. The livinity.io platform adds per-USER subdomains on top of that. If a user's LivOS instance has app subdomains, the full routing would be `immich.alice.livinity.io` -- this requires multi-level subdomain support which wildcards cannot provide.
- The existing `caddy.ts` generates individual subdomain blocks. If the platform follows the same pattern (creating specific DNS records per user), the wildcard stops matching for those users, and you must manage every record explicitly.
- Cloudflare free plan allows 1,000 DNS records. At 50-100 users, this is fine. At 1,000+ users with app subdomains, you hit the limit. Pro plan allows 3,500.

**Consequences:**
- App subdomains through the tunnel don't resolve (multi-level wildcards don't work)
- Platform must choose between per-user wildcard subdomains OR per-app subdomains through the tunnel -- cannot do both with standard DNS
- DNS record management at scale becomes operational burden
- Hitting the 1,000 record limit on Cloudflare free plan blocks new user registrations

**Warning signs:**
- `alice.livinity.io` works but `immich.alice.livinity.io` returns NXDOMAIN
- Users report some subdomains work and others don't (wildcard vs specific record conflict)
- Cloudflare API returns errors when adding records beyond the limit

**Prevention:**
1. **Choose flat subdomain structure:** Use `alice-immich.livinity.io` instead of `immich.alice.livinity.io`. This keeps all subdomains at one level where the wildcard works. The relay server parses the subdomain to extract user ID and app ID.
2. **Wildcard-only approach:** Use a single `*.livinity.io` wildcard A record pointing to Server5. ALL routing logic happens at the relay server level, not at DNS level. The relay receives `alice.livinity.io` requests, looks up which tunnel `alice` maps to, and forwards accordingly.
3. **Do NOT create specific DNS records per user:** Let the wildcard handle all user subdomains. Only create specific records for platform infrastructure (`api.livinity.io`, `dashboard.livinity.io`).
4. **SSL:** Cloudflare's Universal SSL covers `*.livinity.io` automatically on all plans. No need for Advanced Certificate Manager unless you need multi-level subdomains (which you should avoid per point 1).
5. **App routing via path, not subdomain:** For accessing apps through the tunnel, use `alice.livinity.io/app/immich` instead of subdomain-based routing. This avoids the multi-level subdomain problem entirely and simplifies DNS.

**Which phase should address it:** Phase 1 (Tunnel Relay Server) and Phase 2 (DNS & Subdomain Routing) -- the subdomain naming scheme is an architectural decision that affects everything downstream.

**Confidence:** HIGH -- verified against [Cloudflare wildcard DNS documentation](https://developers.cloudflare.com/dns/manage-dns-records/reference/wildcard-dns-records/) and [Cloudflare wildcard proxy announcement](https://blog.cloudflare.com/wildcard-proxy-for-everyone/).

---

### P4: Two Separate Auth Systems Create Identity Confusion

**What goes wrong:** The platform introduces a NEW identity system (livinity.io SaaS accounts) alongside the EXISTING identity system (LivOS local multi-user accounts). Users must log in to the livinity.io dashboard to manage their tunnel, AND separately log in to their LivOS instance. These are different credentials, different sessions, different password reset flows. The confusion multiplies: which login is this? Which password do I use? Why am I logged out of one but not the other?

**Why it happens in this project specifically:**
- LivOS v7.0 already has a complete auth system: PostgreSQL users table, JWT sessions, multi-user support with admin/member roles, invite system, avatar selection, cookie-based sessions
- The livinity.io SaaS dashboard needs its OWN auth: email/password registration, email verification, password reset, Stripe subscription linking, tunnel token management
- The two systems have fundamentally different trust models: LivOS auth runs on the user's own server (trusted), livinity.io auth runs on your central server (standard SaaS trust)
- JWT secrets are different: LivOS uses `/data/secrets/jwt` on the user's server, livinity.io uses its own secret on Server5
- Session cookies are on different domains: `livinity.cloud` (LivOS) vs `livinity.io` (platform)
- The tunnel itself needs auth: the LivOS instance must authenticate to the relay server using a tunnel token, which is a THIRD credential type

**Consequences:**
- Users confuse their LivOS password with their livinity.io password
- "Forgot password" on the wrong system leads to frustration
- Tunnel disconnects if the livinity.io account is suspended but the LivOS instance doesn't know
- Support burden: "I can't log in" requires determining WHICH system they can't log in to
- If a user changes their livinity.io email, the LivOS instance has no knowledge of this

**Warning signs:**
- Support tickets saying "I changed my password but it still doesn't work" (changed on wrong system)
- Users trying to use tunnel tokens as login credentials
- LivOS instances still tunneling after the livinity.io account is cancelled

**Prevention:**
1. **Crystal clear naming:** The livinity.io account is the "Platform Account" -- the LivOS login is the "Server Login." Use different visual design (colors, logo variations) for each login screen.
2. **Tunnel token as bearer:** The tunnel uses a long-lived API token (generated in livinity.io dashboard, pasted into LivOS settings once). It is NOT a password -- it is a service credential. Call it "Tunnel Token" everywhere.
3. **One-way status propagation:** livinity.io knows the tunnel status (connected/disconnected, bandwidth used). LivOS knows its own status. They do NOT share user databases. The tunnel token is the only link.
4. **Account suspension flow:** If a livinity.io account is suspended (payment failed, abuse), the relay server disconnects the tunnel and responds with a structured error code that the LivOS instance can display to the local admin: "Tunnel disconnected: platform account suspended. Visit livinity.io to resolve."
5. **Do NOT implement SSO between them in v1:** The temptation is "log in once, access both." This is architecturally complex (OIDC/SAML between your own systems), creates security surface area, and confuses the trust model. Ship with separate logins, evaluate SSO for v2 based on user feedback.

**Which phase should address it:** Phase 3 (SaaS Dashboard) -- but the naming conventions and tunnel token format must be decided in Phase 1.

**Confidence:** HIGH -- based on direct analysis of the existing LivOS auth system and common patterns in tunnel services (ngrok, Tailscale, Cloudflare Zero Trust all use separate account systems).

---

### P5: Relay Server Memory Exhaustion from Long-Lived Connections

**What goes wrong:** The relay server on Server5 (8GB RAM) must maintain persistent WebSocket connections to every connected LivOS instance AND proxy all user traffic through those connections. Each tunnel connection has buffers, state, and metadata. Memory leaks in WebSocket handling are extremely common in Node.js -- documented cases show 8MB leaked per 2,000 connect/disconnect cycles, with OOM conditions occurring within 3 hours of production traffic.

**Why it happens in this project specifically:**
- Server5 has only 8GB RAM and must also run the SaaS dashboard, PostgreSQL, Redis, and potentially monitoring/logging
- The target is 50-100 concurrent tunnels. Each tunnel carries multiple multiplexed streams. At 4 streams per tunnel with 16KB buffers each, that is only ~6MB for 100 tunnels -- but the REAL memory cost is in connection metadata, proxy middleware instances, and the proxy cache.
- The existing `appGatewayProxyCache` pattern in `server/index.ts` (line 187) creates proxy middleware instances and caches them in a `Map` keyed by port. These are NEVER evicted. If the relay follows this same pattern (cache per tunnel), disconnected tunnels leave orphaned proxy instances in memory.
- Node.js `ws` library has documented memory leak patterns where disconnected WebSocket objects are not garbage collected if references remain in event listeners, Maps, or Sets.
- The relay must handle bursty reconnection storms (network outage causes all 100 tunnels to reconnect simultaneously), which spikes memory allocation and can trigger OOM if the previous connections haven't been cleaned up yet.

**Consequences:**
- Relay server OOMs after running for days/weeks, killing all tunnels simultaneously
- Reconnection storm after OOM restart causes immediate second OOM
- PostgreSQL or Redis killed by OOM killer, causing data loss or corruption
- All users' remote access goes down simultaneously (single point of failure)

**Warning signs:**
- `process.memoryUsage().heapUsed` grows monotonically over hours/days
- RSS never decreases even after tunnels disconnect
- Node.js process restarts appearing in logs (PM2 auto-restart on OOM)
- `dmesg | grep oom` showing oom-killer activity on Server5

**Prevention:**
1. **Explicit connection lifecycle management:** Create a `TunnelConnection` class with `connect()`, `disconnect()`, and `destroy()` methods. On disconnect, explicitly null all references, remove from all Maps/Sets, destroy proxy instances, and close all multiplexed streams. Log a warning if `destroy()` is not called within 60 seconds of WebSocket close.
2. **Bounded caches with TTL:** Replace unbounded `Map` caches with LRU caches that evict entries after TTL. The proxy cache in the existing `appGatewayProxyCache` pattern MUST NOT be replicated in the relay without eviction.
3. **Memory monitoring with alerts:** Expose `process.memoryUsage()` on a health endpoint. Alert at 70% of available memory (5.6GB). Auto-reject new tunnel connections at 80%.
4. **Graceful degradation:** When memory pressure is high, shed load by disconnecting the least-recently-active tunnels first (not random).
5. **Leak detection in development:** Use `--inspect` and Chrome DevTools memory profiling during development. Run a 24-hour soak test with 50 simulated tunnels that connect/disconnect every 5 minutes. Memory MUST be stable (not growing) after the first hour.
6. **Reconnection rate limiting:** When a tunnel disconnects and reconnects, rate-limit to max 1 reconnection per 5 seconds per tunnel. Exponential backoff on the client side.

**Which phase should address it:** Phase 1 (Tunnel Relay Server) -- memory management must be baked into the architecture, not patched later.

**Confidence:** HIGH -- memory leak patterns in WebSocket servers are extensively documented ([ws issue #804](https://github.com/websockets/ws/issues/804), [ws issue #43](https://github.com/websockets/ws/issues/43), [expose.sh memory leak fix](https://dev.to/robbiecahill/how-i-fixed-a-memory-leak-in-my-nodejs-app-b31)).

---

### P6: Bandwidth Metering Inaccuracy Causes Billing Disputes

**What goes wrong:** The freemium model gives 50GB/month free bandwidth. Measuring "bandwidth" is deceptively complex. Do you count: request bytes only? Request + response? Including headers? Including WebSocket frame overhead? Including tunnel protocol overhead? Including retransmissions? The answer determines whether a user sees "49GB used" or "52GB used" for the same actual traffic. A 6% difference crosses the free tier boundary and triggers a billing dispute.

**Why it happens in this project specifically:**
- The tunnel adds protocol overhead: WebSocket frame headers (~2-14 bytes per frame), multiplexing headers (stream ID, length), tunnel control messages (heartbeat, flow control). This overhead is NOT "user traffic" but it consumes the user's bandwidth allocation if measured at the relay's network interface.
- LivOS serves Docker app UIs which make many small requests (favicon.ico, manifest.json, chunks). Each request has HTTP headers (~500 bytes) that dwarf the tiny response. Counting headers inflates measured bandwidth significantly for app-heavy usage.
- SSE/WebSocket streams for AI chat send many small messages. The per-message overhead ratio is poor (a 50-byte AI token wrapped in a WebSocket frame + tunnel frame + HTTP/2 frame becomes 200+ bytes).
- Stripe's metered billing requires exact usage reporting. If your metering disagrees with what the user observes (e.g., their browser DevTools shows 30GB but you bill for 45GB), they dispute.

**Consequences:**
- Users dispute charges ("my browser says 30GB, you say 45GB")
- Underbilling erodes revenue (if you exclude overhead, heavy tunnel users get more than 50GB of actual relay capacity for free)
- Inconsistent measurement makes it impossible to capacity plan (you don't know your true per-user cost)
- Legal risk: billing for bandwidth that users can't verify

**Warning signs:**
- Customer support tickets asking "how do you calculate bandwidth?"
- Free tier users hitting limits much faster or slower than expected
- Revenue math doesn't match infrastructure costs (bandwidth cost per user is unexplained)
- Users comparing your dashboard to their ISP's usage meter and getting different numbers

**Prevention:**
1. **Define "bandwidth" precisely and document it publicly:** "Bandwidth is measured as the total bytes transferred between the Livinity relay server and your browser, including HTTP headers but excluding tunnel protocol overhead." Put this in the FAQ from day one.
2. **Measure at the application layer, not network layer:** Count `request.headers['content-length']` + response bytes written, NOT socket bytes. This excludes TCP/TLS overhead and tunnel framing, giving a number closer to what users expect.
3. **Provide a real-time usage dashboard:** Users must see their own bandwidth usage in the livinity.io dashboard, updated at least hourly. Include a per-day breakdown so they can correlate with their own usage patterns.
4. **Generous buffer on limits:** Don't hard-cut at 50GB. Soft-limit at 50GB (notification), hard-limit at 55GB (10% grace). This absorbs measurement discrepancies without triggering disputes.
5. **Batch usage reporting to Stripe:** Report usage to Stripe at the end of each billing period, not in real-time. This allows you to reconcile and correct before the customer sees a charge.
6. **Idempotent event tracking:** Use Redis `INCRBY` for bandwidth counters with the key `platform:bandwidth:{userId}:{YYYY-MM}`. This is atomic and idempotent. Never use a database INSERT per request -- the volume will be enormous.

**Which phase should address it:** Phase 4 (Bandwidth Metering & Billing) -- but the metering hooks must be designed into the relay proxy in Phase 1 (even if they just count bytes without acting on them).

**Confidence:** MEDIUM-HIGH -- metering accuracy problems are well-documented in SaaS billing literature ([Stigg metering guide](https://www.stigg.io/blog-posts/beyond-metering-the-only-guide-youll-ever-need-to-implement-usage-based-pricing), [Stripe metered billing limitations](https://www.withorb.com/blog/stripe-limitations-for-usage-based-billing)). The specific overhead calculations are estimates that need validation during Phase 1 development.

---

## High Pitfalls

Mistakes that cause significant rework, degraded user experience, or operational burden.

---

### P7: Caddy Config Reload Kills All Active Tunnel Connections

**What goes wrong:** Every time a new user registers and their tunnel connects, the relay may need to update routing configuration. If Caddy is used as the front-end reverse proxy (as it is in the current LivOS deployment), `caddy reload` drops all active WebSocket connections by default. With 100 concurrent tunnels, every new registration causes a global disconnect.

**Why it happens in this project specifically:**
- The existing `reloadCaddy()` function in `caddy.ts` runs `caddy reload --config /etc/caddy/Caddyfile` after every config change
- [Caddy issue #6420](https://github.com/caddyserver/caddy/issues/6420) documents that WebSocket connections are closed on config reload
- The `stream_close_delay` option exists but defaults to 0 (immediate close)
- In the current LivOS architecture, config reloads happen when apps are installed/uninstalled -- infrequent. In the relay, tunnel registrations happen continuously.

**Consequences:**
- Every new user registration disconnects all existing users for a few seconds
- WebSocket-dependent features (terminal, AI chat, tRPC subscriptions) break during reload
- Users experience random disconnections correlated with platform growth

**Warning signs:**
- Users report brief disconnections at seemingly random times
- Correlation between new registrations and existing user disconnect reports
- Caddy access logs show connection reset entries after reload

**Prevention:**
1. **Wildcard routing eliminates per-user Caddy config changes:** If using `*.livinity.io` wildcard, Caddy does NOT need to be reloaded when a new user registers. All routing happens at the application layer inside the relay server. The Caddyfile is static: `*.livinity.io -> relay_server:port`.
2. **Set `stream_close_delay 5m`:** Even with a static Caddyfile, if ANY reload is ever needed, set `stream_close_delay` to give WebSocket connections time to drain.
3. **Use Caddy API for dynamic config:** Instead of rewriting the Caddyfile and reloading, use Caddy's admin API (`/config/` endpoint) for zero-downtime config changes. This avoids the reload-kills-connections problem entirely.
4. **Separate Caddy instances:** If the relay needs per-user routing at the Caddy level, run a separate Caddy instance for the relay with its own reload lifecycle, independent from the platform dashboard Caddy.

**Which phase should address it:** Phase 2 (DNS & Subdomain Routing) -- routing architecture must be decided before it is built.

**Confidence:** HIGH -- verified against [Caddy documentation](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) and existing `caddy.ts` codebase.

---

### P8: Tunnel Protocol Not Designed for Reconnection From Day One

**What goes wrong:** Network interruptions are inevitable on residential internet. If the tunnel protocol does not support reconnection with session resumption, every network blip requires the LivOS instance to re-establish the tunnel from scratch, re-authenticate, and lose all in-flight requests. Users experience this as a 5-30 second outage every time their ISP hiccups.

**Why it happens in this project specifically:**
- Residential internet commonly has micro-outages (1-5 seconds) that kill WebSocket connections
- NAT tables on consumer routers timeout idle connections (often 2-5 minutes for UDP, 5-30 minutes for TCP)
- The tunnel carries stateful WebSocket connections (tRPC subscriptions, terminal sessions). Re-establishing the tunnel does NOT re-establish these inner connections -- the user's tRPC client and terminal must also reconnect, causing visible UI disruption.
- LivOS already has some reconnection logic in the SSE streaming pipeline (exponential backoff for AI chat), but the tunnel layer is a new component with no existing reconnection patterns.

**Consequences:**
- Users on residential internet experience frequent disconnections
- In-flight AI responses lost when tunnel drops mid-stream
- Terminal sessions reset to a new shell on reconnection
- User perceives the tunnel as "unreliable" compared to direct LAN access

**Warning signs:**
- Users with stable broadband report no issues; users on WiFi/mobile hotspot report frequent drops
- Tunnel uptime metrics show many short disconnections (under 60 seconds)
- LivOS instance logs show rapid connect/disconnect cycles

**Prevention:**
1. **Session ID on tunnel:** Assign a persistent session ID when the tunnel first connects. On reconnection, the client sends the session ID. The relay recognizes it and resumes the session instead of creating a new one.
2. **Request buffering during reconnection:** The relay buffers incoming user requests for up to 30 seconds while waiting for the tunnel to reconnect. If the tunnel comes back within the window, requests are forwarded. If not, users get a "connecting..." page.
3. **Heartbeat with fast failure detection:** 15-second ping interval with 30-second timeout. Detect dead connections in under 45 seconds total.
4. **Client-side exponential backoff:** Reconnection attempts at 1s, 2s, 4s, 8s, 16s, 30s (max). With jitter to prevent thundering herd.
5. **Status page during reconnection:** While the tunnel is reconnecting, serve a branded "Connecting to your server..." page to users instead of a browser error. This is much better UX than ERR_CONNECTION_REFUSED.

**Which phase should address it:** Phase 1 (Tunnel Relay Server) -- reconnection must be part of the tunnel protocol, not bolted on later.

**Confidence:** HIGH -- reconnection is a universal requirement for tunnel services. Every production tunnel service (ngrok, Cloudflare Tunnel, Tailscale) implements session resumption.

---

### P9: Free Tier Abuse -- Crypto Mining, Spam Hosting, Copyright Infringement

**What goes wrong:** A free tunnel service that proxies arbitrary HTTP/WebSocket traffic is an attractive target for abuse. Attackers register free accounts and use tunnels to: host phishing pages, proxy crypto mining traffic, serve pirated content, send spam, or perform DDoS amplification. The relay server's IP gets blacklisted, Cloudflare flags the domain, and legitimate users suffer.

**Why it happens in this project specifically:**
- The free tier provides 50GB/month of tunneled traffic -- enough for significant abuse
- The relay proxies opaque traffic from the user's server -- you don't inspect the content (and probably shouldn't for privacy)
- LivOS instances run arbitrary Docker containers -- users can install anything
- Server5's IP reputation affects ALL users if it gets flagged for abuse
- Cloudflare may suspend or restrict the livinity.io domain if it detects abuse patterns

**Consequences:**
- Server5 IP blacklisted by email providers, CDNs, or hosting providers
- Cloudflare restricts or suspends the livinity.io zone
- Legitimate users can't access their servers because the relay IP is blocked
- Legal liability for hosting/proxying illegal content
- Time spent on abuse reports instead of product development

**Warning signs:**
- Abuse reports arriving via email or Cloudflare dashboard
- Unusual traffic patterns (high bandwidth from new accounts, traffic to known-bad IPs)
- Cloudflare security events spiking
- Server5 IP appearing on blacklists (check mxtoolbox.com periodically)

**Prevention:**
1. **Email verification required before tunnel activation:** Do not allow tunnels without verified email. This is the single highest-ROI abuse prevention measure.
2. **Rate limiting on registration:** Maximum 2 accounts per email domain per hour. Block disposable email domains.
3. **Bandwidth throttling on free tier:** Enforce the 50GB/month limit strictly. Also enforce a RATE limit (e.g., 10 Mbps sustained). High instantaneous bandwidth is a sign of abuse.
4. **Abuse detection heuristics:** Flag accounts that: use >90% of free tier in the first 3 days, have tunnel traffic to >100 unique client IPs per hour, or receive traffic that triggers Cloudflare WAF rules.
5. **One-click tunnel termination:** Admin dashboard must have a "kill tunnel" button that immediately disconnects the tunnel and blocks the account. Do not require a multi-step process to respond to abuse.
6. **Terms of Service:** Explicitly prohibit hosting web services for third parties, proxying to third-party destinations, and running tunnels for purposes other than accessing self-hosted applications. This gives you legal standing to terminate abusive accounts.
7. **Consider requiring a valid payment method even for free tier:** ngrok does this. It dramatically reduces abuse because stolen credit cards get flagged quickly.

**Which phase should address it:** Phase 3 (SaaS Dashboard) for registration controls, Phase 4 (Billing) for payment method requirement. But the rate limiting must be in Phase 1 (built into the relay).

**Confidence:** MEDIUM-HIGH -- abuse patterns are well-documented for tunnel/proxy services. The specific prevention measures are standard practices from ngrok, Cloudflare, and similar services. However, the exact severity depends on how quickly the platform gains visibility.

---

### P10: Mixing Platform Concerns Into the LivOS Codebase

**What goes wrong:** The livinity.io platform (tunnel relay, SaaS dashboard, billing) is fundamentally different from LivOS (self-hosted home server). If platform code gets mixed into the LivOS codebase, it creates coupling that makes it impossible to release LivOS as open-source without including proprietary platform code, and impossible to update the platform without releasing a LivOS update.

**Why it happens in this project specifically:**
- The current repo structure is `livos/` (pnpm monorepo) + `nexus/` (npm). Adding platform code to either one creates unwanted coupling.
- LivOS needs a "tunnel client" component (connects to relay). This is the ONLY platform-related code that should be in the LivOS codebase. The relay server, SaaS dashboard, and billing are entirely separate.
- The existing `domain/caddy.ts` already has `tunnel` mode support (`applyCaddyConfigForTunnel()`) -- this is appropriate. But adding billing checks, account management, or relay logic to livinityd would be wrong.
- The temptation to "share code" (tRPC types, auth middleware, Redis patterns) between LivOS and platform leads to tight coupling.

**Consequences:**
- Open-source release of LivOS includes proprietary billing/relay code
- Platform bugs require deploying to all LivOS instances
- Version coupling: platform v2 requires LivOS v8.1, users on v8.0 lose tunnel access
- Testing becomes impossible without running the full platform stack

**Warning signs:**
- Import paths crossing from `livos/` to `platform/` or vice versa
- Shared tRPC routers between LivOS and platform
- LivOS build failing without platform dependencies installed
- "This change affects the relay" appearing in LivOS PRs

**Prevention:**
1. **Separate repository/workspace for the platform:** `livinity-io/` (or a new workspace in the existing repo) with its own `package.json`, build, deploy pipeline. Zero imports from `livos/` or `nexus/`.
2. **Tunnel client as standalone package:** `@livos/tunnel-client` is a small package (one file) in the LivOS monorepo. It connects to a configurable relay URL, authenticates with a token, and pipes traffic. It has NO knowledge of billing, accounts, or platform internals.
3. **API contract, not shared code:** The tunnel client and relay server communicate via a versioned protocol (JSON messages over WebSocket). Define the protocol in a shared `.proto` or TypeScript types file. This is the ONLY shared artifact.
4. **Feature flags for tunnel support in LivOS:** The tunnel UI in LivOS Settings only appears if the user has configured a relay URL. LivOS works perfectly without any tunnel configured.

**Which phase should address it:** Phase 0 (Project Setup) -- repository structure and boundary decisions must be made before any code is written.

**Confidence:** HIGH -- this is a standard architectural boundary problem. The existing separation between `livos/` and `nexus/` demonstrates the team already understands this pattern.

---

## Moderate Pitfalls

Mistakes that cause delays, technical debt, or degraded user experience.

---

### P11: Stripe Metered Billing Integration Complexity

**What goes wrong:** Stripe's metered billing has several gotchas: it requires uniform billing periods across products in a subscription, ties metric definitions to pricing models (changing how you measure requires reintegration), and does not support fractional billing. Upgrading/downgrading a plan mid-cycle creates two subscription items for the same billing period, and your system must correctly stop reporting to the old item and start reporting to the new one.

**Prevention:**
1. Start with a simple model: free tier (no Stripe interaction needed) and one paid tier (fixed price with included bandwidth). Do NOT implement pay-per-GB metered billing in v1.
2. Track bandwidth internally first (Redis counters). Only integrate with Stripe for the paid plan upgrade. This decouples metering from billing.
3. Use Stripe's [usage-based billing implementation guide](https://docs.stripe.com/billing/subscriptions/usage-based/implementation-guide) as the reference, but defer this to Phase 4 or later.

**Which phase should address it:** Phase 4 (Billing) or later. Do NOT let billing complexity delay the core tunnel functionality.

**Confidence:** MEDIUM -- Stripe integration specifics may change. The recommendation to defer is HIGH confidence.

---

### P12: Sub-Linear Scaling of Relay Ingress

**What goes wrong:** In a relay architecture, when an incoming request arrives at the relay, it must be routed to the correct tunnel connection. If the relay runs on a single process, this is straightforward. But if load requires multiple processes/workers, an incoming request may land on a process that does NOT hold the target tunnel connection. The request must then be internally proxied to the correct process, adding latency and doubling bandwidth usage. With more processes, the probability of this "mis-route" increases, creating sub-linear scaling.

**Prevention:**
1. Start with a single Node.js process for the relay. At 50-100 concurrent tunnels, a single process is sufficient (Node.js event loop can handle thousands of concurrent WebSocket connections).
2. If scaling beyond one process is needed later, use sticky sessions based on the subdomain hash -- all requests for `alice.livinity.io` route to the same worker process that holds alice's tunnel.
3. Redis pub/sub for cross-process tunnel discovery: if a request arrives at the wrong process, publish a request on a Redis channel and let the process with the tunnel respond.

**Which phase should address it:** Not in v1. Design for single-process relay initially. Plan for horizontal scaling only when approaching 500+ concurrent tunnels.

**Confidence:** MEDIUM -- the sub-linear scaling problem is documented in the [exposr architecture](https://github.com/exposr/exposrd). The single-process recommendation for 50-100 tunnels is HIGH confidence.

---

### P13: LivOS Tunnel Client Reconnection Consumes Excessive CPU/Bandwidth

**What goes wrong:** The tunnel client running on user's LivOS instances reconnects aggressively after disconnection, consuming CPU and bandwidth on what may be a low-power home server. If 100 instances all reconnect simultaneously after a relay restart (thundering herd), the relay gets overwhelmed.

**Prevention:**
1. Exponential backoff with jitter: 1s, 2s, 4s, 8s, 16s, 30s max. Add random jitter of 0-50% to each interval to spread reconnection attempts.
2. Max reconnection attempts: after 20 failed attempts (about 5 minutes at max backoff), stop trying and show a notification in LivOS UI: "Tunnel disconnected. Check livinity.io for status."
3. Server-side connection rate limiting: max 1 connection attempt per tunnel token per 5 seconds. Return HTTP 429 with `Retry-After` header.

**Which phase should address it:** Phase 1 (Tunnel Client in LivOS) -- backoff must be implemented from the start.

**Confidence:** HIGH -- thundering herd is a well-known problem. Prevention is straightforward.

---

### P14: Bandwidth Counter Drift Between Redis and Stripe

**What goes wrong:** Bandwidth is tracked in Redis (`INCRBY` per request) and eventually reported to Stripe for billing. If the Redis counter and Stripe's recorded usage diverge (due to crashes, missed reports, or double-counting), you either overbill customers or lose revenue.

**Prevention:**
1. Use Redis `INCRBY` for real-time counters (fast, atomic). Persist snapshots to PostgreSQL hourly (durable, auditable).
2. Report to Stripe from PostgreSQL snapshots, not Redis. This ensures Stripe-reported usage survives Redis restarts.
3. Idempotency key on Stripe usage reports: include the billing period and snapshot timestamp. Stripe deduplicates if the same report is sent twice.
4. Monthly reconciliation job: compare Redis total, PostgreSQL total, and Stripe-reported total. Alert on >1% divergence.

**Which phase should address it:** Phase 4 (Billing) -- once bandwidth tracking is stable.

**Confidence:** MEDIUM -- the specific failure modes depend on implementation. The mitigation strategy is standard for metered billing.

---

### P15: CORS and Cookie Issues With Cross-Domain Tunnel Access

**What goes wrong:** Users access their LivOS instance via `alice.livinity.io` (tunneled) but the LivOS frontend makes API calls to its own backend, which it expects at the same origin. Through the tunnel, the origin is `alice.livinity.io` but the backend cookies were set for `livinity.cloud` (the direct-access domain). CORS policies, `SameSite` cookie attributes, and `__Host-` cookie prefixes all interact in ways that break authentication through the tunnel.

**Why it happens in this project specifically:**
- LivOS sets cookies with `sameSite: 'lax'` and no explicit domain -- these cookies are scoped to the original domain, not `alice.livinity.io`
- The `LIVINITY_SESSION` cookie used for auth is set when the user logs into their LivOS instance. Through the tunnel, the login happens at `alice.livinity.io`, so the cookie is set for that domain. But if the user also accesses directly (on LAN), they have cookies on both domains.
- tRPC client in the frontend uses relative URLs (`/trpc/*`), which works fine. But if the frontend tries to call other services (Nexus at port 3200, MCP at port 3100), those cross-origin calls need CORS configuration.

**Prevention:**
1. The tunnel should be transparent to LivOS: the LivOS instance should not know (or care) whether the request came through the tunnel or directly. The relay must pass through all headers faithfully, including `Host`, `Cookie`, and `Origin`.
2. Set cookies with `domain=` unset (scoped to current host). This means cookies set via `alice.livinity.io` work for that domain, and cookies set via `livinity.cloud` work for that domain. They are independent, which is correct.
3. Do NOT set cookies for `.livinity.io` (with leading dot) as this would share cookies across all users' tunneled subdomains.
4. Ensure the relay preserves the `Host` header as-is. If the relay rewrites `Host` from `alice.livinity.io` to `localhost:8080`, the LivOS backend receives a different `Host` than what the browser sent, breaking cookie domain matching.

**Which phase should address it:** Phase 1 (Tunnel Relay Server) -- header passthrough is core relay functionality.

**Confidence:** HIGH -- CORS/cookie behavior is well-documented. The specific interaction with LivOS cookies was verified by reading `server/index.ts` and the app gateway middleware.

---

## Minor Pitfalls

Mistakes that cause annoyance but are fixable without major rework.

---

### P16: Server5 Resource Contention Between Relay and Dashboard

**What goes wrong:** Server5 (8GB RAM) must run the tunnel relay (memory-intensive with many concurrent connections), the SaaS dashboard (Next.js/React SSR or API server), PostgreSQL, Redis, and potentially monitoring. Under load, these compete for CPU and memory.

**Prevention:** Set PM2 `max_memory_restart` limits for each process. Reserve 3GB for OS + PostgreSQL + Redis. Allocate 3GB for relay, 1GB for dashboard, 1GB buffer. Monitor with `htop` and PM2 metrics. Plan to upgrade to a 16GB server when reaching 50+ concurrent tunnels.

**Which phase should address it:** Phase 1 (Infrastructure Setup) -- resource budgeting before deployment.

---

### P17: Tunnel Token Rotation Without Downtime

**What goes wrong:** Tunnel tokens (API keys generated in the dashboard, used by LivOS instances to authenticate to the relay) must be rotatable without disconnecting the tunnel. If token rotation requires the user to immediately update their LivOS settings, the tunnel drops until they do.

**Prevention:** Support two active tokens per account simultaneously. New token is generated, old token remains valid for 24 hours. Grace period allows the user to update their LivOS settings without urgency. After 24 hours, old token is revoked.

**Which phase should address it:** Phase 3 (SaaS Dashboard) -- token management feature.

---

### P18: Missing "Connecting..." Page When Tunnel Is Down

**What goes wrong:** When a user's LivOS instance is offline (powered off, internet down, tunnel disconnected), visitors to `alice.livinity.io` get a raw browser error (ERR_CONNECTION_REFUSED or 502 Bad Gateway). This looks broken and unprofessional.

**Prevention:** The relay serves a branded "Alice's server is currently offline. Last seen: 2 hours ago." page when the tunnel is not connected. Include a "Notify me when it's back" email subscription for extra polish. This page is served by the relay itself, not forwarded to the tunnel.

**Which phase should address it:** Phase 2 (DNS & Subdomain Routing) -- part of the user-facing routing logic.

---

## Phase-Specific Risk Summary

| Phase | Critical Risks | Key Pitfalls |
|-------|---------------|--------------|
| Phase 0: Project Setup | Codebase coupling | P10 |
| Phase 1: Tunnel Relay Server | WebSocket handling, memory leaks, protocol design | P1, P2, P5, P8, P13, P15 |
| Phase 2: DNS & Subdomain Routing | Wildcard DNS structure, Caddy reload | P3, P7, P18 |
| Phase 3: SaaS Dashboard & Auth | Identity confusion, abuse prevention | P4, P9, P17 |
| Phase 4: Bandwidth Metering & Billing | Metering accuracy, Stripe integration | P6, P11, P14 |
| Ongoing: Operations | Server resource contention, scaling limits | P12, P16 |

## Pre-Development Checklist

Before writing any relay code:

- [ ] Repository/workspace structure decided (P10: separate from LivOS codebase)
- [ ] Subdomain naming scheme chosen: flat (`alice-immich.livinity.io`) vs path-based (`alice.livinity.io/app/immich`) (P3)
- [ ] Tunnel protocol designed: multiplexing, reconnection, heartbeat (P1, P2, P8)
- [ ] Memory budget for Server5 allocated across services (P5, P16)
- [ ] Bandwidth measurement definition written and documented (P6)
- [ ] Abuse prevention tier decided: email verification? payment method? (P9)
- [ ] Caddy routing strategy chosen: static wildcard vs dynamic per-user (P7)
- [ ] Auth naming conventions established: "Platform Account" vs "Server Login" vs "Tunnel Token" (P4)

## Sources

### Primary (HIGH confidence)
- [Cloudflare Wildcard DNS Documentation](https://developers.cloudflare.com/dns/manage-dns-records/reference/wildcard-dns-records/) -- wildcard behavior, limitations
- [Cloudflare Wildcard Proxy Announcement (May 2022)](https://blog.cloudflare.com/wildcard-proxy-for-everyone/) -- proxy available on all plans
- [Cloudflare Universal SSL Limitations](https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/limitations/) -- wildcard certificate coverage
- [Caddy reverse_proxy Documentation](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) -- stream_timeout, stream_close_delay
- [Caddy WebSocket reload issue #6420](https://github.com/caddyserver/caddy/issues/6420) -- config reload kills WebSocket connections
- LivOS codebase: `server/index.ts` (app gateway), `caddy.ts` (Caddyfile generation), `jwt.ts` (auth patterns) -- direct analysis

### Secondary (MEDIUM confidence)
- [ws library memory leak #804](https://github.com/websockets/ws/issues/804) -- WebSocket memory leak patterns in Node.js
- [ws library memory issue #43](https://github.com/websockets/ws/issues/43) -- high memory usage patterns
- [http-proxy-middleware WebSocket upgrade #432](https://github.com/chimurai/http-proxy-middleware/issues/432) -- initial upgrade failure pattern
- [expose.sh Memory Leak Fix](https://dev.to/robbiecahill/how-i-fixed-a-memory-leak-in-my-nodejs-app-b31) -- production Node.js tunnel memory leak case study
- [exposr Tunnel Relay Architecture](https://github.com/exposr/exposrd) -- sub-linear scaling in relay architectures
- [Stripe Usage-Based Billing Guide](https://docs.stripe.com/billing/subscriptions/usage-based/implementation-guide) -- metered billing implementation
- [Stripe Limitations for Usage-Based Billing](https://www.withorb.com/blog/stripe-limitations-for-usage-based-billing) -- Stripe metered billing pitfalls
- [Stigg Metering Guide](https://www.stigg.io/blog-posts/beyond-metering-the-only-guide-youll-ever-need-to-implement-usage-based-pricing) -- SaaS metering best practices
- [Auth0 SaaS Auth Mistakes](https://auth0.com/blog/five-common-authentication-and-authorization-mistakes-to-avoid-in-your-saas-application/) -- common auth pitfalls
- [awesome-tunneling](https://github.com/anderspitman/awesome-tunneling) -- comprehensive list of tunnel architectures

### Tertiary (LOW confidence -- based on training data)
- TCP-over-TCP meltdown problem -- widely documented in networking literature, specific performance numbers unverified
- Node.js WebSocket per-connection memory overhead -- varies by implementation, 8MB/2000 connections is from a specific Spring issue, Node.js numbers may differ
- Cloudflare DNS record limits (1,000 free, 3,500 pro) -- from community forums, not official docs

---
*Research completed: 2026-03-17*
*Ready for roadmap: yes*
