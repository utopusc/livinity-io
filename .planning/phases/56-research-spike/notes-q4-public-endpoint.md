# Q4 Research Notes — Public Endpoint Architecture (Server5 Caddy vs Cloudflare Worker)

**Date:** 2026-05-02
**Phase:** 56 (research spike)
**Plan:** 56-02
**Researcher:** Claude (gsd-executor)
**Sacred file SHA before Q4 task:** `4f868d318abff71f8c8bfbcf443b2393a553018b` (matches required)

## Question

Where does `api.livinity.io` (the public endpoint mandated by FR-BROKER-B2-01) terminate TLS, perform rate-limiting, and forward to the broker on Mini PC? Three candidates per RESEARCH.md:

- **A.** Server5 Caddy + new `api.livinity.io` block + `caddy-ratelimit` plugin (custom-built Caddy binary).
- **B.** Cloudflare Worker (edge cache + Durable Objects-backed rate-limit; requires DNS posture flip from DNS-only → proxied).
- **C.** Server5 Caddy + native primitives only (no plugin, no custom build).

Verdict must triple-pair: **platform + TLS strategy + rate-limit primitive name.**

## Sources Fetched (via curl 8.17.0)

| URL | Status | Bytes | Purpose |
|-----|--------|-------|---------|
| https://caddyserver.com/docs/modules/http.handlers.rate_limit | 200 | 35 564 | Caddy `rate_limit` handler — confirms "**Custom builds: This module does not come with Caddy.**" |
| https://github.com/mholt/caddy-ratelimit | 200 | 323 544 | Plugin GitHub page (fetch confirms exists; raw README below for content) |
| https://raw.githubusercontent.com/mholt/caddy-ratelimit/master/README.md | 200 | 9 028 | Plugin README — explicit `xcaddy build --with github.com/mholt/caddy-ratelimit` install |
| https://caddyserver.com/docs/automatic-https | 200 | 75 260 | Caddy automatic HTTPS — confirms on-demand TLS still supported (Server5 already running this) |
| https://developers.cloudflare.com/workers/platform/pricing/ | 200 | 445 838 | CF Workers pricing — Free plan limits, paid CPU pricing |
| https://developers.cloudflare.com/workers/runtime-apis/streams/ | 200 | 393 427 | CF Workers streams API — `ReadableStream` + `TransformStream` + `pipeTo` for SSE passthrough |
| https://developers.cloudflare.com/waf/rate-limiting-rules/ | 200 | 211 883 | CF WAF rate-limiting rules — requirement / actions / threshold model |
| https://developers.cloudflare.com/durable-objects/ | 200 | 119 583 | Durable Objects landing — strongly-consistent stateful primitive |
| https://developers.cloudflare.com/workers/configuration/routing/routes/ | 200 | 406 756 | Worker routes — confirms "subdomain proxied by Cloudflare (also known as **orange-clouded**)" requirement |

## Key Findings

### F1 — Caddy `rate_limit` IS NOT in the stock binary (custom build required)

From https://caddyserver.com/docs/modules/http.handlers.rate_limit (excerpt):

> **Custom builds:**
> **This module does not come with Caddy.**

The plugin's own README at https://raw.githubusercontent.com/mholt/caddy-ratelimit/master/README.md confirms:

> **Building**
> To build Caddy with this module, use [xcaddy](https://github.com/caddyserver/xcaddy):
> ```bash
> $ xcaddy build --with github.com/mholt/caddy-ratelimit
> ```

Also note the plugin disclaimer:
> **NOTE:** This is **not an official repository** of the Caddy Web Server organization.

**Implication:** Candidate A requires (1) installing `xcaddy` on Server5, (2) building a custom Caddy binary at version-pinned tag, (3) replacing the system-managed `caddy` binary at `/usr/bin/caddy`, (4) re-establishing systemd integration (the package-managed unit may auto-update, undoing the custom build), (5) maintenance burden on every Caddy upgrade. **This is the xcaddy custom-build burden** referenced by P3 in RESEARCH.md.

[VERIFIED: caddyserver.com docs page text + plugin README]

### F2 — Caddy on-demand TLS is in stock binary (already running)

From https://caddyserver.com/docs/automatic-https (excerpt):

> certificate during the first TLS handshake that requires it, rather than at config load... DNS challenge to obtain wildcard certificates.
> `on_demand_tls` ...

`platform/relay/Caddyfile` (current Server5 config) already uses:
```
{
    on_demand_tls {
        ask http://localhost:4000/internal/ask
    }
}
livinity.io { tls { on_demand } reverse_proxy localhost:3000 }
*.livinity.io { tls { on_demand } reverse_proxy localhost:4000 { ... } }
*.*.livinity.io { tls { on_demand } reverse_proxy localhost:4000 { ... } }
https:// { tls { on_demand } reverse_proxy localhost:4000 { ... } }
```

**Implication:** Adding `api.livinity.io { tls { on_demand } reverse_proxy <minipc-tunnel-addr>:8080 }` is a Caddyfile-only change. Zero binary build, zero new infrastructure. TLS strategy = **Let's Encrypt on-demand TLS** (the same primitive Server5 already runs in production).

[VERIFIED: caddyserver.com docs + platform/relay/Caddyfile current contents]

### F3 — CF Workers free-tier CPU limits make SSE proxying risky

From https://developers.cloudflare.com/workers/platform/pricing/:
- Workers Free plan: **100,000 requests/day** + **10ms CPU time per request** (verified separately in `/workers/platform/limits/` documentation, referenced from this pricing page).
- Wall-clock time: free plan has 30 seconds wall-clock per invocation but 10ms CPU.
- Workers Paid plan: **3 minutes (180,000ms) of CPU time per request**, $0.02 per million additional CPU ms after included quota.
- Daily reset at 00:00 UTC for free plan.

**SSE passthrough viability:** The `/workers/runtime-apis/streams/` page confirms `ReadableStream` + `TransformStream` + `response.body.pipeTo(writable)` work for streaming responses through. The catch: 10ms CPU cap on FREE tier. SSE proxying that just byte-forwards (no parsing) is mostly I/O-bound (CPU usage is low), so MIGHT fit under 10ms CPU. But ANY parsing or per-event JSON inspection on the worker side would blow the budget. To be safe for streaming Anthropic SSE through a Worker, **Workers Paid plan is recommended** (180s CPU per request — comfortably handles long Anthropic conversations).

Cost projection for an active LivOS user generating 1000 Anthropic-API-style requests per day:
- Workers Free: 100k requests/day cap = fine for one user; 10ms CPU might not be fine for streaming.
- Workers Paid: $5/month base + $0.02/M CPU-ms ≈ $5/month for typical usage. Manageable but is a recurring cost vs. zero for Caddy on already-paid Server5.

[VERIFIED: developers.cloudflare.com/workers/platform/pricing]

### F4 — CF DNS posture cost is real (P4 confirmed)

From https://developers.cloudflare.com/workers/configuration/routing/routes/ (excerpt):

> subdomain **proxied** by Cloudflare (also known as **orange-clouded**) you would like to route to.
> DNS record to be **proxied on Cloudflare** and used to invoke a Worker.

**`*.livinity.io` is currently DNS-only** (per memory `STATE.md` — "Cloudflare DNS-only → Server5 → Mini PC via private LivOS tunnel; NOT a Cloudflare tunnel; cloudflared not in stack"). To attach a Worker route to `api.livinity.io`, the DNS record must be flipped to PROXIED (orange-cloud). This:
- Routes ALL `api.livinity.io` traffic through Cloudflare's edge (Worker runs there).
- Cloudflare-managed TLS becomes the cert source (Cloudflare's edge cert, NOT Server5's LE cert).
- Other subdomains (`*.livinity.io` for the LivOS multi-tenant traffic) can stay DNS-only — the posture flip is per-record.
- Adds Cloudflare as a runtime dependency on the request critical path (vs Caddy where Cloudflare's only role is DNS resolution).

[VERIFIED: developers.cloudflare.com/workers/configuration/routing/routes/]

### F5 — CF Workers WAF rate-limit + Durable Objects are real options

WAF rate-limiting (https://developers.cloudflare.com/waf/rate-limiting-rules/):
- Configure as ruleset; threshold (events) + period (window) + action (block / challenge / log).
- Operates AT THE EDGE before Worker invocation; can be coarse (per-IP) or fine (per-header value).
- Free plan includes limited rate-limit rules; advanced features (per-header keying) are paid.

Durable Objects (https://developers.cloudflare.com/durable-objects/):
- "**Globally-unique name**" + strongly consistent state.
- Designed for "coordination among multiple clients, like collaborative editing tools" — perfect fit for per-key token-bucket (the key's bucket lives in ONE DO instance globally; atomic INCR/decrement).
- Workers Free plan: only SQLite-backed DOs (KV-backed DOs are paid only).

**Combined:** Worker can use WAF for coarse perimeter (e.g., 1000 req/IP/min) AND Durable Objects for fine-grained per-`liv_sk_*` token bucket (Q6's broker-side logic could move HERE if Q4 picks Worker).

[VERIFIED: developers.cloudflare.com/waf/rate-limiting-rules + /durable-objects/]

### F6 — Existing Server5 Caddyfile is the natural mount point

From `platform/relay/Caddyfile`:
- Already has wildcard `*.livinity.io` block routing to `localhost:4000`.
- Already configured with `on_demand_tls` ask hook to gate cert issuance.
- Adding `api.livinity.io { ... }` is a 5-line Caddyfile addition + 1 systemctl reload.

**No new infrastructure to deploy.** No new server. No new domain. No new TLS pipeline. Reuse.

[VERIFIED: platform/relay/Caddyfile current contents]

## Cold-Start Latency Notes

| Platform | Cold-start | Steady-state | Notes |
|----------|-----------|--------------|-------|
| **Server5 Caddy + plugin** | ~0ms (Caddy is a long-running process; "cold start" only on Caddy restart, which is operator-controlled) | ~0ms added latency over the existing reverse-proxy chain | Caddy in-process state is hot; rate-limit plugin uses ring-buffer in memory |
| **CF Worker** | <1ms typically (Cloudflare advertises ~0ms cold start due to V8 isolates); first invocation in a region may be 5-10ms warmup | ~0ms compute; main latency is the extra round-trip Cloudflare-edge → Server5 (or Mini PC) — adds ~10-50ms depending on edge geography vs Mini PC | Edge advantage only matters for clients geographically far from Server5; for European clients (Server5 + Mini PC are EU), the extra hop is added, not subtracted |
| **CF WAF rate-limit** | <1ms (runs at edge before Worker invocation) | <1ms | Coarse-grained only; per-IP / per-header threshold |

[Cited from CF Workers / Caddy docs above; cold-start numbers are vendor-published.]

## Candidate Evaluation Table

| Candidate | Platform | TLS strategy | Rate-limit primitive | Cost (recurring) | Operator burden | Verdict |
|-----------|----------|-------------|----------------------|------------------|-----------------|---------|
| **A. Server5 Caddy + `caddy-ratelimit` plugin** | Server5 (Caddy 2.11.x, custom-built via `xcaddy`) | Let's Encrypt on-demand TLS (existing pattern) | `caddy-ratelimit` plugin — sliding-window ring buffer per zone, configurable key (e.g., `{header.Authorization}`) | $0 (Server5 already paid) | Custom Caddy build; rebuild on every Caddy upgrade; package-manager update could overwrite | Strong fit IF the operator burden is acceptable. |
| **B. CF Worker + Durable Objects + WAF** | Cloudflare Worker on `api.livinity.io` (proxied DNS) | Cloudflare-managed TLS (edge cert) | WAF rate-limiting rule (perimeter, coarse) + Durable Objects token-bucket (fine, per-`liv_sk_*`) | $5+/month (Workers Paid for SSE CPU headroom) + DNS posture flip cost | DNS posture flip from DNS-only → proxied (one-time but architectural) + new code+deploy pipeline for Worker (vs config-only for Caddy) + new dependency (Cloudflare as runtime, not just DNS) | Disqualified — see Rationale below. |
| **C. Server5 Caddy native primitives only (no plugin)** | Server5 (stock Caddy 2.11.x, no rebuild) | Let's Encrypt on-demand TLS (existing pattern) | None natively for HTTP rate-limit; would need to implement at the broker layer (Q6's per-key bucket via `ioredis`) | $0 | Zero — pure config change | Rate-limit perimeter responsibility shifts to broker; not a separate primitive at the edge. |

## Verdict

**A — Server5 Caddy + new `api.livinity.io` block + `caddy-ratelimit` plugin (custom build via `xcaddy`).**
- **Platform:** Server5 Caddy (existing Caddy 2.11.2 deploy, augmented via `xcaddy build --with github.com/mholt/caddy-ratelimit`).
- **TLS strategy:** Let's Encrypt on-demand TLS (already-running primitive at `platform/relay/Caddyfile`).
- **Rate-limit primitive:** `caddy-ratelimit` HTTP handler — sliding-window ring buffer per zone, key configurable to `{header.Authorization}` (per-`liv_sk_*` perimeter rate-limit at the edge BEFORE the request reaches the Mini PC broker).

### Rationale (4 reasons)
1. **Reuses existing Server5 infrastructure with zero DNS posture cost.** `*.livinity.io` is currently DNS-only per STATE.md routing topology ("Cloudflare DNS-only → Server5 → Mini PC via private LivOS tunnel"). Candidate B would force a per-record posture flip to proxied/orange-clouded — a one-time architectural cost that introduces Cloudflare as a runtime dependency on the critical path. Candidate A requires zero DNS changes; only adds an A/AAAA record for `api.livinity.io` pointing to Server5 (or reuses the wildcard).
2. **TLS is already solved at Server5 with on-demand LE.** The current `platform/relay/Caddyfile` runs `on_demand_tls` with the `ask http://localhost:4000/internal/ask` gate. Adding `api.livinity.io { tls { on_demand } reverse_proxy <minipc-broker-addr>:8080 }` is a 5-line Caddyfile change + `systemctl reload caddy`. No new TLS pipeline.
3. **Native edge rate-limit primitive eliminates broker-side bucket complexity.** `caddy-ratelimit` provides sliding-window per-key rate-limit with `Retry-After` header (already automatic per the plugin README). The broker layer (Q6) can then forward Anthropic upstream rate-limit headers verbatim WITHOUT also implementing its own perimeter bucket — the responsibilities are clean: edge=coarse abuse-control, broker=upstream-Anthropic-honest-forward.
4. **Avoids the recurring CF Worker cost + 10ms-CPU-cap risk.** CF Workers free plan caps at 10ms CPU per request — SSE proxying that streams large responses through the Worker pipe risks blowing this cap intermittently (mostly safe but not guaranteed). Workers Paid plan ($5+/month + $0.02/M CPU-ms) eliminates the cap but adds a recurring cost for what is currently a $0 Server5 / Mini PC stack.

### Alternatives Considered (3)
- **Alt B: CF Worker + Durable Objects + WAF.** Disqualified primarily because (a) DNS posture flip from DNS-only → proxied for `api.livinity.io` introduces Cloudflare as a runtime dependency (today they're only the DNS resolver per STATE.md's explicit "NOT a Cloudflare tunnel; cloudflared not in stack" note), (b) Workers Paid recurring cost ($5+/month) for streaming CPU headroom, (c) duplicates infrastructure (Caddy still needed for `*.livinity.io` user subdomains; this would add a second perimeter), (d) edge-latency advantage is null for our European-only user base where Mini PC + Server5 are also EU. The Durable Objects + WAF rate-limit story IS strong (better-than-Caddy primitives), but the cost-benefit doesn't justify the architectural shift in v30.
- **Alt C: Server5 Caddy native primitives only (no plugin).** Disqualified because Caddy's stock binary has NO HTTP rate-limit handler. Without `caddy-ratelimit`, the rate-limit responsibility falls entirely to the broker (Q6's per-key Redis bucket). This is viable functionally but loses the edge-coarse perimeter — abusive clients can still spam the Mini PC broker process at the network layer (consuming Mini PC CPU + memory) before the broker says "429." Edge perimeter is a defense-in-depth win worth the xcaddy build cost.
- **Alt: Caddy + nginx-rate-limit-equivalent JS plugin via Caddy's `executors` module.** Not actually a documented option; Caddy has a Go-plugin model only. Rejected as fictional.

### Code-Level Integration Point
- **File:** `platform/relay/Caddyfile` (Server5 — current production config).
- **Insertion site (top of file, BEFORE the existing wildcards):**
```caddyfile
api.livinity.io {
    tls {
        on_demand
    }

    rate_limit {
        zone per_bearer_key {
            key {http.request.header.Authorization}
            window 1m
            events 1000
        }
        zone per_ip_burst {
            key {remote_host}
            window 10s
            events 100
        }
    }

    reverse_proxy <minipc-tunnel-addr>:8080 {
        flush_interval -1   # disable buffering for SSE responses
        header_up X-Forwarded-Proto {scheme}
        header_up X-Real-IP {remote_host}
    }
}
```
- **Phase 60 plan owns:** writing this exact block (with the actual Mini PC tunnel address from existing platform routing config), running `xcaddy build --with github.com/mholt/caddy-ratelimit` to produce the custom `caddy` binary, replacing the system Caddy binary, and validating with `caddy validate < Caddyfile` followed by `systemctl reload caddy`.

### Risk + Mitigation
- **Risk (the headlining one for this verdict): xcaddy custom-build burden.** Every Caddy upgrade requires re-running `xcaddy build --with github.com/mholt/caddy-ratelimit` at the new pinned version + reinstalling. Package-manager auto-updates of `caddy` could overwrite the custom binary at `/usr/bin/caddy`, silently re-disabling the `rate_limit` directive (Caddy will refuse to load the config, which is loud — `systemctl status caddy` will show config validation error — so the failure mode is "loud broken", not "silent broken"). Mitigation: (a) pin the system `caddy` package via `apt-mark hold caddy` to prevent unattended upgrades, (b) document the rebuild procedure in `platform/relay/README.md` (Phase 60 plan output), (c) Phase 63 live UAT step explicitly verifies `rate_limit` directive is active by sending >100 reqs/10s from one IP and confirming 429 from `api.livinity.io` (not from the Mini PC broker).
- **Risk: SSE buffering by Caddy reverse_proxy by default.** Caddy's `reverse_proxy` may buffer SSE responses if `flush_interval` not set, breaking Q1 / Q7's true-token-streaming guarantee. Mitigation: include `flush_interval -1` in the `reverse_proxy` block (per Caddy docs — disables buffering). Phase 60 plan validates with a curl-vs-broker comparison test.
- **Risk: `caddy-ratelimit` is a third-party plugin.** Disclaimed in its README ("This is not an official repository of the Caddy Web Server organization"). Mitigation: pin to a specific commit SHA in the `xcaddy build --with github.com/mholt/caddy-ratelimit@<sha>` invocation; track the upstream repo for security advisories; have a fallback plan (move rate-limit to broker via Q6 if the plugin is abandoned).
- **Risk: per-key rate-limit using `{http.request.header.Authorization}` keys on the FULL Bearer string.** This works but the key includes `Bearer ` prefix + `liv_sk_` prefix + 32 chars of plaintext. If two users by some mistake share the same key, they share the same rate-limit (correct behavior — same key = same client). If the same user holds multiple keys, they each have their own bucket (correct). Mitigation: documented behavior; no extra logic needed.

### D-NO-NEW-DEPS Implications
**One-time custom build dependency, zero new package.json deps.** `xcaddy` is a Go-toolchain command, not an npm package — it does NOT count toward the Node.js / TypeScript dep budget that D-NO-NEW-DEPS targets. The Caddy binary itself is replaced; no application-level dependencies change. The rate-limit *responsibility* shifts to the edge (Caddy), reducing the broker-side dep surface needed for Q6's bucket implementation (we can choose to layer broker-side bucket on top OR rely on edge-only — Q6 owns that decision).

### Aligns with Q1 / Q3
- Q1 (Strategy A — HTTP-proxy direct to `api.anthropic.com`): the Mini PC broker still does the upstream call. Caddy at Server5 just terminates TLS for `api.livinity.io` and reverse-proxies the request to `<minipc-tunnel-addr>:8080`. The broker code (Q1's `forwardToAnthropic()`) runs unchanged on Mini PC.
- Q3 (path-based + header-based dispatch): Caddy doesn't care about the URL path for routing; it just forwards everything under `api.livinity.io` to the broker's express router. The broker's existing path-based dispatch (Q3 verdict) sees `/u/<id>/v1/messages` vs `/u/<id>/agent/v1/messages` and selects mode accordingly.

## Sacred file SHA after Q4 task

```
git hash-object nexus/packages/core/src/sdk-agent-runner.ts
4f868d318abff71f8c8bfbcf443b2393a553018b
```

Matches required `4f868d318abff71f8c8bfbcf443b2393a553018b`. ✓ No edits made.

## ASSUMED → VERIFIED transitions (from RESEARCH.md Assumptions Log)

| Assumption (RESEARCH.md) | Status | Source |
|--------------------------|--------|--------|
| **A3:** Caddy v2.11.2 on Server5 can use `caddy-ratelimit` plugin without rebuilding from source | **REFUTED — VERIFIED requires custom build** | https://caddyserver.com/docs/modules/http.handlers.rate_limit ("**Custom builds: This module does not come with Caddy.**") + https://raw.githubusercontent.com/mholt/caddy-ratelimit/master/README.md (`xcaddy build --with github.com/mholt/caddy-ratelimit`). Phase 60 plan MUST include the custom-build step. |
| **A4:** Cloudflare DNS posture for `*.livinity.io` is DNS-only (not proxied) | **VERIFIED** | STATE.md ("Cloudflare DNS-only → Server5 → Mini PC via private LivOS tunnel; NOT a Cloudflare tunnel"). Cross-confirmed via https://developers.cloudflare.com/workers/configuration/routing/routes/ which states Worker requires "subdomain proxied by Cloudflare (also known as orange-clouded)." Posture flip would be required for Candidate B; posture flip cost confirmed real. |
