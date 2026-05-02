# Phase 60: B2 Public Endpoint (`api.livinity.io`) + Rate-Limit Perimeter - Context

**Gathered:** 2026-05-02
**Status:** Ready for planning
**Mode:** Smart-discuss (autonomous); production-adjacent platform infra (Server5)

<domain>
## Phase Boundary

Phase 60 exposes the broker on the open internet at `https://api.livinity.io` with TLS + rate-limit perimeter. External clients (Bolt.diy, Open WebUI, Continue.dev, raw curl from anywhere) can reach the broker via Bearer auth without Mini-PC-internal subdomain routing or container IP guard.

What's IN scope for Phase 60:
- DNS: `api.livinity.io` A/AAAA → Server5 (`45.137.194.102`).
- TLS termination at Server5 — Let's Encrypt on-demand certificate (matches existing `*.livinity.io` wildcard pattern from v19/v20 Caddy work).
- Server5 Caddy block routing `api.livinity.io` → Mini PC broker via private LivOS tunnel (existing relay topology — Cloudflare DNS-only → Server5 → Mini PC).
- Rate-limit perimeter at Server5 — token-bucket primitive enforcing baseline limit (e.g., 60 req/min per Bearer key OR per source IP if Bearer absent). 429 on exceed with Anthropic-compat error body + `Retry-After` header.
- Container IP guard REMOVED from broker (Phase 59 Bearer auth replaces it as identity surface).
- Server5 Caddy config committed to platform repo (location researcher confirms — likely `livinity-io-platform/server5/Caddyfile` or similar).

What's OUT of scope (deferred):
- CF Workers alternative (researcher considers but Caddy-on-Server5 is the proposed default — already proven by v19 wildcard TLS work).
- Per-tier subscription rate-limiting (broker-level token bucket per Bearer key is baseline; per-tier work defers to monetization milestone).
- WAF rules (Caddy + IP-rate-limit is enough perimeter for v30; deeper WAF defers).
- DDoS protection beyond Caddy's built-in rate_limit module (defer to CF if needed).
- Certificate revocation / rotation tooling (Caddy auto-renews; manual re-issue tools defer).
- Load balancing (single Server5 → single Mini PC; HA defers to multi-relay milestone).
- Public endpoint authentication observability (Phase 62 covers Settings UI usage stats; Phase 60 only ensures auth events reach `broker_usage` capture).

</domain>

<decisions>
## Implementation Decisions

### Phase 56 Q4 Verdict — Caddy on Server5 (NOT Cloudflare Workers)

CF Workers alternative was considered. Rationale for Caddy:
- **Existing infrastructure:** Server5 already runs Caddy v2.11 with `*.livinity.io` wildcard + on-demand TLS for custom domains (v19 Phase shipped this). Adding `api.livinity.io` is a single block addition.
- **Routing topology preserved:** CF DNS-only → Server5 → Mini PC tunnel is the established stack (per project memory). Inserting CF Workers would flip the DNS posture from DNS-only to proxied for `api.livinity.io` ONLY — incongruent with the rest of `*.livinity.io`.
- **Cold start absent:** Caddy is a long-running process; no cold start. CF Workers cold start would add ~50-200ms perceived latency to first requests per region.
- **TLS strategy continuity:** Caddy auto-issues Let's Encrypt certs; works for `api.livinity.io` identically to existing wildcards. CF Workers would require flipping CF DNS posture to "proxied" → CF terminates TLS → CF cert chain (subtly different).
- **Rate-limit primitive:** Caddy `caddy-ratelimit` plugin (via `xcaddy build` OR pre-built Caddy with the module) provides per-IP / per-Bearer token-bucket rate limits in-config. Comparable to CF Workers + KV bucket but in-process and zero-egress-cost.
- **Observability:** Caddy logs to local file → tunneled to LivOS log infra. CF Workers would require CF Logs/Logpush separate observability path.

**Verdict:** Caddy on Server5 is the chosen platform. Phase 60 plans target this; CF Workers stays in MILESTONE-CONTEXT.md as a "future consideration if scale demands it" note.

### TLS Strategy: Let's Encrypt On-Demand (Existing Pattern)

- Caddy `tls` directive: `tls {email <ops-email>}`. Use existing v19 Caddyfile email config (researcher confirms exact email — likely `ops@livinity.io` or similar).
- For `api.livinity.io` specifically: explicit certificate issuance (not on-demand) since it's a fixed hostname, not user-provisioned. Caddy issues on first start, auto-renews 30 days before expiry.
- Test verification (Phase 63): `openssl s_client -connect api.livinity.io:443` shows valid Let's Encrypt cert chain.

### Rate-Limit Primitive: `caddy-ratelimit` Plugin

- **Plugin source:** `github.com/mholt/caddy-ratelimit` (researcher verifies — most-maintained Caddy rate-limit plugin).
- **Build:** Server5 Caddy already on v2.11.2 (per memory). Phase 60 may need to rebuild Caddy with the plugin via `xcaddy build` — or use a pre-built `caddy-ratelimit` Docker image. **Researcher decides which path is least disruptive to Server5's running install.**
- **Limit dimensions:**
  - Per Bearer key (extracted from `Authorization` header) — primary dimension. Default: 60 req/min per key.
  - Per source IP — fallback when Bearer absent or invalid. Default: 30 req/min per IP. (Lower than per-key because invalid-Bearer probing should be rate-capped harder.)
- **Bucket size:** 60 token-bucket per dim, refill 1/sec. Burst tolerance ~60 requests in 1 second, then steady 1/sec.
- **Excess behavior:** HTTP 429 with body `{"error": {"type": "rate_limit_error", "message": "Rate limit exceeded"}}` (Anthropic-compat shape) + `Retry-After: <seconds>` header.

### Container IP Guard Removal

Phase 41/42 broker code today checks `req.ip` against a 127.0.0.1 / 172.16/12 allowlist (container-internal IPs only). Phase 60:
- Removes the IP guard from broker code (`livinity-broker/router.ts` + `openai-router.ts` if present).
- Phase 59 Bearer middleware is the new identity surface for external requests; URL-path identity remains for back-compat.
- Server5 Caddy is the new perimeter: it terminates TLS, applies rate limit, then forwards to Mini PC broker over the tunnel.

### `api.livinity.io` Caddy Block Sketch

```caddyfile
api.livinity.io {
  tls ops@livinity.io                          # auto Let's Encrypt
  rate_limit {                                  # caddy-ratelimit plugin
    distributed
    zone bearer {
      key    {http.request.header.Authorization}
      events 60
      window 1m
    }
    zone ip {
      key    {http.request.remote.host}
      events 30
      window 1m
    }
  }
  reverse_proxy https://<minipc-tunnel-host>:8080 {
    transport http {
      tls
      tls_insecure_skip_verify        # tunnel cert may be self-signed
    }
    header_up X-Forwarded-For {http.request.remote.host}
    header_up Authorization {http.request.header.Authorization}
  }
  log {
    output file /var/log/caddy/api.livinity.io.log
    format json
  }
}
```

**Researcher refines:** the exact `reverse_proxy` upstream (private tunnel hostname or IP), tunnel TLS cert verification posture, distributed rate-limit storage (not strictly needed for single-Server5 v30; default zone-local is fine).

### Rate-Limit Error Body Shape (Anthropic-Compat)

```json
{
  "error": {
    "type": "rate_limit_error",
    "message": "Rate limit exceeded — try again in <N> seconds"
  }
}
```

Plus `Retry-After: <N>` header (seconds — Anthropic spec uses seconds OR HTTP-date; seconds is simpler).

### DNS Setup

- `api.livinity.io` IN A `45.137.194.102` (Server5)
- Optionally IN AAAA if Server5 has IPv6
- TTL 300 (5 min) — allows fast change if Server5 IP shifts
- Cloudflare DNS-only mode (NOT proxied) — preserves the established stack pattern

### Mini PC Broker Reachability via Tunnel

The existing LivOS tunnel topology routes Server5 → Mini PC. Phase 60 needs:
- Server5 Caddy can reach Mini PC's `livos.service` port 8080 over the tunnel.
- The exact tunnel hostname / IP from Server5's vantage point. Researcher confirms — likely a hardcoded name in Server5's `/etc/hosts` OR a wireguard peer IP.
- Tunnel TLS verification: if tunnel uses self-signed cert, `tls_insecure_skip_verify` in Caddy. If tunnel does mTLS, Caddy needs client cert.

**Researcher confirms tunnel architecture from the Server5 side** — this is the Phase 60 gating unknown.

### Production-Adjacent Infra Caveat

Per project memory: "Server5 = livinity.io relay only — NO LivOS install. Do NOT attempt LivOS deployment / patching here."

Phase 60 work on Server5 is **platform-side Caddy config**, NOT LivOS work. The hard rule against LivOS on Server5 is preserved. Server5 has been a stable Caddy + relay host since v19; Phase 60 only ADDS a config block, does not introduce new infrastructure.

**Risk:** Production-adjacent — config error could break existing `*.livinity.io` traffic. Mitigation: Caddy supports `caddy validate Caddyfile` pre-flight; Phase 60 plans MUST run validate BEFORE reload. Plus rollback strategy: keep prior Caddyfile in `/etc/caddy/Caddyfile.bak.<ts>`; `caddy reload --config <bak>` reverts in seconds.

### Sacred File — UNTOUCHED

Phase 60 only touches: Server5 Caddy config (platform repo), broker IP-guard removal (`livinity-broker/router.ts` + `openai-router.ts`), maybe DNS records (out-of-band — manual step OR Cloudflare API call).

NO edits to `nexus/packages/core/src/sdk-agent-runner.ts`. SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` unchanged.

### Claude's Discretion

- Caddyfile block exact wording vs equivalent JSON config (Caddyfile is more readable; defaulting unless researcher says otherwise).
- Build Caddy from source (xcaddy) vs pre-built Docker image vs apt package — pick least disruptive to running Server5.
- Log format (JSON vs CLF) — defaulting JSON.
- Rate-limit window granularity (1m vs 10s) — defaulting 1m for simplicity; researcher considers if Anthropic upstream rate-limit window argues for finer.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Server5 Caddy** — already at v2.11.2 with `*.livinity.io` wildcard + on-demand TLS for v19 custom domains. Phase 60 ADDS one block.
- **Tunnel topology** — Server5 → Mini PC private tunnel established. Phase 60 reuses; researcher confirms the Server5-side tunnel config (peer IP / hostname).
- **`livinity-broker/auth.ts`** — has Anthropic-spec 401 error body shape (Phase 59 reuses for revoked keys; Phase 60 reuses for 429 rate limits — same pattern, just `rate_limit_error` type).
- **`broker_usage` capture middleware (Phase 44)** — captures all responses including 429s. Phase 60 traffic flows through this since Caddy forwards to broker which still has the middleware.
- **`livinity-io-platform`** — separate platform repo? Phase 60 researcher confirms the Caddy config home (could be in this repo's `livos/`, in a separate `livinity-io-platform/` checkout, or directly on Server5 with no version control).

### Established Patterns
- v19 Phase Custom Domain Management — established Caddy on-demand TLS + `*.livinity.io` wildcard pattern. Phase 60 inherits.
- v22.0+ tunnel WebSocket routing — Phase 60 uses Server5→Mini PC tunnel for HTTP traffic too.
- v29.4 Phase 45 Retry-After preservation — Phase 60 emits Retry-After on its own 429s; doesn't conflict with broker forwarded 429s (Caddy 429 → Caddy's body+Retry-After; broker 429 → broker's body+Retry-After).

### Integration Points
- **Server5 Caddyfile** — single block addition (researcher confirms exact path).
- **DNS records** — Cloudflare DNS for `livinity.io` zone — researcher confirms how DNS is currently managed (manually via dashboard? IaC? Cloudflare API token in CI?).
- **Mini PC broker** — IP guard removal in `livinity-broker/router.ts` + (if exists) `openai-router.ts`. Researcher locates the guard.
- **Caddy plugin install** — `caddy-ratelimit` plugin via `xcaddy build` OR replace binary with pre-built variant.

</code_context>

<specifics>
## Specific Ideas

- **`curl` smoke test from external host (Phase 63 verification):** `curl -H "Authorization: Bearer liv_sk_..." https://api.livinity.io/v1/messages -d '{...}'` from a host NOT on Mini PC LAN. Must return streamed response.
- **TLS verification:** `openssl s_client -connect api.livinity.io:443 -servername api.livinity.io < /dev/null 2>&1 | grep "Verify return code: 0"` returns success.
- **Rate-limit verification:** `for i in $(seq 1 100); do curl -H "Authorization: Bearer liv_sk_..." https://api.livinity.io/v1/messages -d '{...}' & done; wait` → at least one 429 response with Anthropic-compat body + Retry-After header observed.
- **No silent throttling:** Server5 Caddy MUST reject (return 429) — NEVER buffer/queue/delay requests. Research and tests confirm `caddy-ratelimit` plugin's reject behavior.
- **Mini PC LAN bypass:** the existing per-user URL-path subdomain access via `<username>.livinity.io` continues to work for legacy traffic. `api.livinity.io` is the ADDITIONAL public surface for Bearer-authed external clients. NOT a replacement.

</specifics>

<deferred>
## Deferred Ideas

- **Per-tier subscription rate-limit policy** — defer to monetization milestone.
- **WAF rules / DDoS protection** — defer to CF if scale demands.
- **Multi-region tunnel relay (HA)** — defer to multi-relay milestone.
- **CF Workers alternative architecture** — kept as research note for future.
- **Server5 Caddy version upgrade beyond v2.11.2** — out of scope unless `caddy-ratelimit` requires newer.
- **Custom-domain → broker routing** — out of scope (broker only on `api.livinity.io`; users keep `<username>.livinity.io` for in-app access).

</deferred>
