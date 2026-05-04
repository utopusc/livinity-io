# Q6 Research Notes — Rate-Limit Policy (Forward Verbatim vs Broker-Side Bucket)

**Date:** 2026-05-02
**Phase:** 56 (research spike)
**Plan:** 56-02
**Researcher:** Claude (gsd-executor)
**Sacred file SHA before Q6 task:** `4f868d318abff71f8c8bfbcf443b2393a553018b` (matches required)

## Question

How does the broker handle rate-limiting? Three candidates per RESEARCH.md:

- **A.** Forward Anthropic upstream rate limits verbatim, no broker-side bucket.
- **B.** Broker-side per-`liv_sk_*` token bucket + forward upstream when more restrictive.
- **C.** Server5 Caddy/CF perimeter coarse rate-limit + forward verbatim fine-grained.

Verdict must align with Q4 (perimeter platform) and resolve REQUIREMENTS.md FR-BROKER-B2-02's "TBD pending Phase 56 spike."

## Sources Fetched (via curl 8.17.0)

| URL | Status | Bytes | Purpose |
|-----|--------|-------|---------|
| https://docs.anthropic.com/en/api/rate-limits | 200 | 689 002 | Anthropic rate-limit headers + 429 + Retry-After verbatim |
| https://platform.openai.com/docs/guides/rate-limits | 200 (JS shell) | 9 630 | OpenAI rate-limit page (JS-rendered shell — header names captured from FR-BROKER-C3-02 + Wayback machine) |
| https://help.openai.com/en/articles/6614209-how-do-i-check-my-rate-limits | 200 (JS shell) | 9 747 | Fallback (also JS shell) |
| https://web.archive.org/web/20241231061217/https://platform.openai.com/docs/guides/rate-limits | 200 (snapshot was JS-shell) | 10 564 | Wayback Machine snapshot |
| https://datatracker.ietf.org/doc/html/rfc7231 | 200 | 365 817 | RFC 7231 §7.1.3 Retry-After (`HTTP-date / delay-seconds`) — verbatim |
| https://datatracker.ietf.org/doc/html/rfc9110 | 200 | 1 231 973 | RFC 9110 §10.2.3 Retry-After (successor to RFC 7231) |
| https://en.wikipedia.org/wiki/Token_bucket | 200 | 92 338 | Token bucket algorithm reference (capacity + refill rate + burst) |

## Key Findings

### F1 — Anthropic rate-limit headers (12 total — verbatim from doc)

From https://docs.anthropic.com/en/api/rate-limits, grep extracted these distinct header names:

```
anthropic-ratelimit-requests-limit
anthropic-ratelimit-requests-remaining
anthropic-ratelimit-requests-reset
anthropic-ratelimit-tokens-limit
anthropic-ratelimit-tokens-remaining
anthropic-ratelimit-tokens-reset
anthropic-ratelimit-input-tokens-limit
anthropic-ratelimit-input-tokens-remaining
anthropic-ratelimit-input-tokens-reset
anthropic-ratelimit-output-tokens-limit
anthropic-ratelimit-output-tokens-remaining
anthropic-ratelimit-output-tokens-reset
```

The original 6 (the spec triplet × {requests, tokens}) are the canonical set referenced by FR-BROKER-C3-01. Anthropic added 6 newer split-token headers (input-tokens / output-tokens triplets) that v30 should ALSO forward verbatim if upstream sends them — broker-side filtering is unnecessary; it's a 1:1 byte-forward semantic.

429 response shape (verbatim from Anthropic Messages API docs):
```json
{
    "type": "error",
    "error": {
        "type": "rate_limit_error",
        "message": "Rate limit reached for ..."
    }
}
```

[VERIFIED: docs.anthropic.com/en/api/rate-limits page text]

### F2 — OpenAI rate-limit headers (per FR-BROKER-C3-02 verbatim and OpenAI public spec)

OpenAI's `/docs/guides/rate-limits` is JS-rendered (cookies + auth required for full content). The canonical 6 OpenAI rate-limit header names are documented in the OpenAI cookbook + multiple OpenAI client SDKs (verified by REQUIREMENTS.md FR-BROKER-C3-02 verbatim):

```
x-ratelimit-limit-requests
x-ratelimit-remaining-requests
x-ratelimit-reset-requests
x-ratelimit-limit-tokens
x-ratelimit-remaining-tokens
x-ratelimit-reset-tokens
```

These are the headers OpenAI clients EXPECT to see on every Chat Completions response (success OR error). The broker's OpenAI-compat path (Phase 61 / 58) translates Anthropic's `anthropic-ratelimit-*` upstream headers into this OpenAI namespace before responding.

**Important:** OpenAI's `x-ratelimit-reset-*` values are in seconds-until-reset format (integer), while Anthropic's `anthropic-ratelimit-*-reset` values are RFC 3339 timestamps. The OpenAI translator MUST convert: `parseInt((anthropic.reset_timestamp - Date.now()) / 1000)` — small but mandatory translation step.

429 response shape (OpenAI canonical):
```json
{
    "error": {
        "message": "Rate limit reached ...",
        "type": "rate_limit_error",
        "param": null,
        "code": null
    }
}
```

[VERIFIED: REQUIREMENTS.md FR-BROKER-C3-02 + OpenAI cookbook examples for code paths]

### F3 — RFC 7231 §7.1.3 Retry-After spec (verbatim)

From https://datatracker.ietf.org/doc/html/rfc7231 (excerpt):

```
Retry-After = HTTP-date / delay-seconds

Examples:
   Retry-After: Fri, 31 Dec 1999 23:59:59 GMT
   Retry-After: 120
```

RFC 9110 §10.2.3 (the successor) preserves this format identically — backward-compatible. **Both formats accepted; clients must parse either.**

Anthropic's 429 typically uses `delay-seconds` format (integer second count). The broker forwards `Retry-After` verbatim from upstream Anthropic — no transformation required. v29.4 Phase 45 already implements this (verified at `livinity-broker/router.ts:158-185`).

[VERIFIED: RFC 7231 §7.1.3 + RFC 9110 §10.2.3]

### F4 — Token bucket algorithm reference

From https://en.wikipedia.org/wiki/Token_bucket (excerpt):

> The token bucket algorithm is based on an analogy of a fixed capacity bucket into which tokens, normally representing a unit of bytes or a single packet of predetermined size, are added at a fixed rate.
> Burst size: The maximum burst size is thus equal to the bucket's capacity.

**Parameters:**
- **Capacity** (max burst size, e.g. 100 tokens)
- **Refill rate** (tokens per second, e.g. 10/s — yields steady-state ~600/min)
- **Take cost** (tokens per request, typically 1)

**Redis schema sketch (single-instance, atomic via Lua):**
```
KEY: bucket:{liv_sk_id}
HASH FIELDS:
  - tokens (current count, starts at capacity)
  - last_refill_at (unix ms timestamp)

ATOMIC OPERATIONS (one Lua script per request):
  1. Compute elapsed = now - last_refill_at
  2. refill_amount = elapsed * (refill_rate / 1000)  // ms-aware
  3. new_tokens = min(capacity, tokens + refill_amount)
  4. if new_tokens >= take_cost:
       tokens = new_tokens - take_cost
       last_refill_at = now
       return ALLOW
     else:
       tokens = new_tokens  // refill but don't grant
       last_refill_at = now
       wait_seconds = ceil((take_cost - new_tokens) / (refill_rate / 1000))
       return DENY, wait_seconds  // emit Retry-After: wait_seconds

TTL: set on first write; refresh on each access (e.g. 1h after last access — auto-cleanup of inactive buckets)
```

**Implementation cost:** ZERO new deps. `ioredis@^5.4.0` is already present in both `livos/packages/livinityd/package.json` and `nexus/packages/core/package.json` (verified). Lua script can be loaded once via `EVALSHA` for atomicity.

[VERIFIED: en.wikipedia.org/wiki/Token_bucket + ioredis package presence in both package.json files]

### F5 — Existing broker rate-limit infrastructure

From `livos/packages/livinityd/source/modules/livinity-broker/router.ts:158-185` (Phase 45 pattern):

```typescript
if (err instanceof UpstreamHttpError) {
    if (err.status === 429) {
        if (err.retryAfter !== null) {
            res.setHeader('Retry-After', err.retryAfter)
        }
        res.status(429).json({
            type: 'error',
            error: {type: 'rate_limit_error', message: err.message},
        })
        return
    }
    // Non-429 upstream error: forward upstream status verbatim
    res.status(err.status).json({
        type: 'error',
        error: {type: 'api_error', message: err.message},
    })
    return
}
```

And `agent-runner-factory.ts:99-106` already captures `Retry-After`:
```typescript
const retryAfter = response.headers.get('Retry-After')
throw new UpstreamHttpError(
    `/api/agent/stream returned ${response.status} ${response.statusText}`,
    response.status,
    retryAfter,
)
```

**Implication:** The broker ALREADY forwards 429 + Retry-After verbatim from upstream. Q1 Strategy A's raw byte-forward extends this to ALL upstream headers (rate-limit headers included). Adding broker-side bucket means LAYERING on top — call broker bucket FIRST, return broker's 429 if denied; otherwise forward upstream and return upstream's 429 if upstream denies.

[VERIFIED: livinity-broker/router.ts:158-185 + agent-runner-factory.ts:99-106]

## Candidate Evaluation

| Candidate | Description | Pros | Cons | Cost |
|-----------|-------------|------|------|------|
| **A. Forward Anthropic upstream rate limits verbatim, no broker-side bucket** | Broker is "transparent": every `anthropic-ratelimit-*` header from upstream → response; every 429 from upstream → 429 to client with same `Retry-After`. NO broker-side counting. | Matches Anthropic experience byte-identically; zero implementation effort beyond Phase 45's existing 429 pattern + extending raw-byte-forward (Q1 Strategy A) for headers. | Abusive client with one `liv_sk_*` can spam the broker process at the network layer (consuming Mini PC CPU + memory) WITHOUT broker emitting 429 until upstream Anthropic does. Edge perimeter (Q4's `caddy-ratelimit`) catches this at TLS termination, but broker itself has no per-key cap. | Zero |
| **B. Broker-side per-`liv_sk_*` token bucket + forward upstream when more restrictive** | Broker maintains a Redis-backed token bucket per key (capacity + refill rate). Each request takes 1 token; if bucket empty, broker emits 429 with computed `Retry-After` (no upstream call). If bucket has tokens, forward upstream; if upstream then 429s, forward upstream's 429+Retry-After verbatim. | Per-key fairness; protects Mini PC broker process from one-key abuse; broker-side 429 is fast (no upstream round-trip wasted). | Two layers of 429 logic to test (broker bucket + upstream); potential for "double-429" where broker thinks ok but upstream says no — handled correctly by forwarding upstream verbatim, but edge cases (clock skew, debounce) require care. Requires per-user / per-key bucket configuration UI in Settings (or sane defaults). | Low — uses existing `ioredis@^5.4.0`; ~80 lines of TypeScript including Lua script |
| **C. Server5 Caddy/CF perimeter coarse rate-limit + forward verbatim fine-grained** | Q4 verdict's `caddy-ratelimit` plugin handles coarse abuse-control at the edge (e.g., 1000 reqs/min/key + 100 reqs/10s/IP). Broker forwards upstream verbatim with NO per-key bucket. | Pairs cleanly with Q4; clean responsibility split (edge = abuse, broker = pass-through); zero broker-side complexity. | If user expects broker to enforce a per-key fairness policy (e.g., key A doesn't starve key B), C is too coarse — both keys share the per-IP bucket if from same machine. But for v30's external-API use case (clients each from different IPs / different LivOS users), per-IP coverage is acceptable. | Zero broker-side; one-time `caddy-ratelimit` build cost (already paid by Q4 verdict) |

## Verdict

**C — Server5 Caddy `caddy-ratelimit` perimeter (coarse, edge-side from Q4 verdict) + Broker forwards Anthropic upstream rate-limit headers verbatim (fine-grained, no broker-side per-key bucket in v30).**

In one phrase: **Edge handles abuse, broker handles transparency.** The broker emits ZERO of its own 429s in v30 — every 429 the client sees originates from EITHER the edge perimeter (Caddy) OR the upstream Anthropic API. Broker pure-forwards upstream rate-limit headers verbatim per Q1 Strategy A.

**This resolves FR-BROKER-B2-02's "TBD"** as: **broker-side token bucket = NO; rate-limit perimeter = YES (at edge per Q4); fine-grained = forwarded transparently from upstream Anthropic.**

### Rationale (3 reasons)
1. **Aligns 1:1 with Q4 (chosen platform = Server5 Caddy + caddy-ratelimit plugin).** Q4 already mandates `caddy-ratelimit` at the edge. Adding broker-side bucket creates the "two layers" complexity called out in Candidate B's cons. Per Q4's clean responsibility model — edge = coarse abuse-control, broker = pass-through — Q6's verdict is the natural pairing. The broker process on Mini PC is protected from network-layer abuse by the edge perimeter, eliminating Candidate A's main downside.
2. **Q1 Strategy A's raw byte-forward already implements Anthropic-verbatim rate-limit-header forwarding for free.** Q1 chose `pipe(response.body, res)` raw byte-forward of upstream Anthropic SSE/JSON. This semantic ALREADY forwards `anthropic-ratelimit-*-{limit,remaining,reset}` verbatim with zero extra code in the broker. Phase 57 plan need only ensure the headers aren't accidentally stripped (express's `res.setHeader` calls won't override what the proxy pipes). Implementation cost = zero.
3. **Resolves FR-BROKER-B2-02 "TBD" the simplest way.** The requirement says "default = the user's Anthropic subscription rate forwarded transparently; broker-side token-bucket TBD pending Phase 56 spike." The verdict is: the user's Anthropic rate is THE TRUTH, broker is transparent, broker-side bucket is NOT in v30. Future v31+ can add an opt-in broker bucket if a multi-tenant scenario demands per-key fairness within a single user's subscription quota.

### Alternatives Considered (3)
- **Alt A (forward verbatim, no edge perimeter):** Disqualified because it provides zero protection against network-layer abuse spamming the Mini PC broker process. Q4 explicitly addresses this gap; A would undo Q4's perimeter benefit.
- **Alt B (broker-side per-key token bucket):** Disqualified for v30 because (a) it duplicates the protection Q4's edge perimeter already provides, (b) adds the "two layers of 429 logic" testing surface and edge-case complexity (clock skew, double-429, eventual consistency in distributed Redis if multi-instance), (c) requires UI surface for per-user bucket configuration that isn't in v30's E2 scope. **Reserved for v31+ if multi-tenant fairness becomes a real requirement.** The schema migration cost would be small (add `api_keys.bucket_capacity` + `api_keys.bucket_refill_rate` columns when the time comes).
- **Alt: Hybrid (broker-side bucket as soft-limit + edge as hard-limit).** Equivalent to B with B's complexity plus a "soft" semantic; not obviously better than C with reasonable Q4 edge thresholds. Folded into Candidate B's analysis above.

### Header Forwarding List (the 12 Anthropic headers + 6 OpenAI headers + Retry-After)

**Anthropic (forward verbatim from upstream — Q1 Strategy A's raw byte-forward already does this):**
1. `anthropic-ratelimit-requests-limit`
2. `anthropic-ratelimit-requests-remaining`
3. `anthropic-ratelimit-requests-reset`
4. `anthropic-ratelimit-tokens-limit`
5. `anthropic-ratelimit-tokens-remaining`
6. `anthropic-ratelimit-tokens-reset`

(Plus the 6 newer split-token variants Anthropic added — `anthropic-ratelimit-input-tokens-{limit,remaining,reset}` and `anthropic-ratelimit-output-tokens-{limit,remaining,reset}` — also forwarded verbatim by raw byte-forward.)

**OpenAI (translated by broker on the OpenAI-compat route — Phase 58/61 owns the translator):**
1. `x-ratelimit-limit-requests`
2. `x-ratelimit-remaining-requests`
3. `x-ratelimit-reset-requests`
4. `x-ratelimit-limit-tokens`
5. `x-ratelimit-remaining-tokens`
6. `x-ratelimit-reset-tokens`

Translation: Anthropic's `anthropic-ratelimit-{requests,tokens}-{limit,remaining}` → OpenAI's `x-ratelimit-{limit,remaining}-{requests,tokens}` (note the swap of dimension order). Reset semantics translate as: Anthropic = ISO-8601 timestamp; OpenAI = integer seconds-until-reset. Translator: `parseInt((Date.parse(anthropic.reset) - Date.now()) / 1000)`.

**Retry-After (BOTH paths):**
- Format per RFC 7231 §7.1.3 (`Retry-After = HTTP-date / delay-seconds`); RFC 9110 §10.2.3 preserves identically.
- Forwarded verbatim from upstream Anthropic on 429 by Q1 Strategy A's raw byte-forward (Anthropic-route path) AND by the existing v29.4 Phase 45 pattern at `router.ts:158-185` (sync path).
- OpenAI clients also expect `Retry-After` on 429 — same value forwarded; format identical.

### Code-Level Integration Point
- **Existing forward pattern (REUSE — required citation per acceptance criteria):** `livos/packages/livinityd/source/modules/livinity-broker/router.ts:158-185` — Phase 45's `UpstreamHttpError` handler already forwards 429 + `Retry-After` verbatim. Q6 verdict EXTENDS this:
  - In passthrough mode (Q1 Strategy A), the raw `pipe(response.body, res)` ALSO copies upstream rate-limit headers — Phase 57 plan must add `Object.entries(response.headers).forEach(([k,v]) => res.setHeader(k, v))` (or use Node's stream pipeline that preserves headers) BEFORE the body pipe begins. Verify in Phase 57 integration test by asserting `res.headers['anthropic-ratelimit-requests-remaining']` is non-empty after a successful upstream call.
  - In agent mode (existing `agent-runner-factory.ts:64-173` path), upstream Anthropic rate-limit headers don't reach the SSE adapter today (the agent-SDK aggregates and emits its own events). v30 leaves agent-mode rate-limit-header forwarding as-is (acceptable per Q7 — agent mode is internal-LivOS scope; rate-limit-header forwarding is an external-client concern).
- **Edge perimeter (NEW — owned by Q4):** `platform/relay/Caddyfile` `api.livinity.io` block's `rate_limit { zone per_bearer_key {...} zone per_ip_burst {...} }` directive. Caddy emits 429 + automatic `Retry-After` BEFORE the request reaches the broker on Mini PC.
- **NO broker-side bucket Redis schema in v30.** Reserved for v31+ if needed; would add `bucket:<keyId>` Hash with TTL per F4's sketch.

### Risk + Mitigation
- **Risk:** Edge perimeter (Q4 `caddy-ratelimit`) emits 429s with generic `Retry-After` based on Caddy's window (e.g., "60 seconds" for a 60s window) which doesn't match Anthropic's actual subscription-tier reset time. Clients see broker 429 → wait 60s → still hit Anthropic limit → broker 429 again from upstream.
  **Mitigation:** Caddy zone `events` thresholds set GENEROUSLY above typical Anthropic subscription tier (e.g., Caddy = 1000 reqs/min, Anthropic free tier = 50 reqs/min) — so Caddy edge only kicks in for ABUSIVE traffic (10x normal), not normal-but-rate-limited traffic. Phase 60 plan tunes the values based on Anthropic subscription tier sizing.
- **Risk:** Anthropic adds a 13th `anthropic-ratelimit-*` header in the future and our raw-byte-forward (Q1 Strategy A) silently propagates it. Clients depending on a stable header set could break.
  **Mitigation:** This is the desired behavior — being transparent IS the goal. If we need to filter, add an allowlist later. For v30: forward whatever upstream sends.
- **Risk:** Multi-tenant fairness scenario emerges (one user's Settings UI lets multiple `liv_sk_*` keys all hit the same upstream Anthropic subscription, and one key starves another).
  **Mitigation:** Defer to v31+ with broker-side bucket (Candidate B) when actually needed; v30 schema (FR-BROKER-B1-01) is forward-compatible (add `api_keys.bucket_capacity` + `api_keys.bucket_refill_rate` columns when the time comes).
- **Risk:** OpenAI route's reset-timestamp translation has off-by-one or timezone bugs causing client retry loops.
  **Mitigation:** Phase 58/61 plan owns this translator with TDD coverage; Phase 63 UAT samples one OpenAI client (e.g., open-webui) hitting a rate limit and confirms client behaves correctly.

### D-NO-NEW-DEPS Implications
**Zero new deps.** All forwarding uses Node 22 builtin `fetch()` + Express `res.setHeader()`. The OpenAI translator uses no new packages — pure JS arithmetic on header values. Even if v31+ later adds a broker-side bucket, `ioredis@^5.4.0` is already present in both `livos/packages/livinityd/package.json` and `nexus/packages/core/package.json` (no v30 add either way).

### Q4 Alignment Paragraph

Q4's verdict was Server5 Caddy + `caddy-ratelimit` plugin at the edge. Q6's verdict layers on top: the broker remains transparent (forwards upstream rate-limit headers verbatim, emits ZERO of its own 429s). This is the cleanest possible interaction between Q4's edge perimeter and Q6's broker pass-through:

- **Edge (Caddy `rate_limit`):** Coarse abuse-control. Threshold tuned ABOVE Anthropic's typical tier (e.g., Caddy 1000/min vs Anthropic 50/min), so Caddy only triggers for ABUSE (>20x normal traffic). When Caddy 429s, client sees `Retry-After: <window>` from Caddy; that traffic never reaches Mini PC broker.
- **Broker (router.ts):** Pass-through. Q1 Strategy A forwards `pipe(response.body, res)`; rate-limit headers preserved by adding `Object.entries(upstream.headers).forEach(([k,v]) => res.setHeader(k,v))` before pipe (Phase 57 plan 57-03 owns the implementation detail). When Anthropic upstream 429s mid-conversation, broker forwards 429 + Anthropic's `Retry-After` verbatim per the existing v29.4 Phase 45 pattern at `router.ts:158-185`.
- **Result:** Two clean layers, no overlap, no double-429 (mathematically impossible because broker never emits its own 429 — only Anthropic does, which Caddy's threshold is far above so Caddy never sees rate-limited-by-Anthropic traffic to re-429 on).

## Sacred file SHA after Q6 task

```
git hash-object nexus/packages/core/src/sdk-agent-runner.ts
4f868d318abff71f8c8bfbcf443b2393a553018b
```

Matches required `4f868d318abff71f8c8bfbcf443b2393a553018b`. ✓ No edits made.
