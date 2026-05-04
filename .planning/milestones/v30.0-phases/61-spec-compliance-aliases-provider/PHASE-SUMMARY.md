---
phase: 61-spec-compliance-aliases-provider
milestone: v30.0
status: COMPLETE
started: 2026-05-03
completed: 2026-05-03
duration_total: ~50 min (sum of 4 plans: 15 + 4 + 13 + 18)
plans_total: 4
plans_complete: 4
requirements: [FR-BROKER-C3-01, FR-BROKER-C3-02, FR-BROKER-C3-03, FR-BROKER-D1-01, FR-BROKER-D1-02, FR-BROKER-D2-01, FR-BROKER-D2-02]
requirements_complete: [FR-BROKER-C3-01, FR-BROKER-C3-02, FR-BROKER-C3-03, FR-BROKER-D1-01, FR-BROKER-D1-02, FR-BROKER-D2-01, FR-BROKER-D2-02]
sacred_sha_baseline: "4f868d318abff71f8c8bfbcf443b2393a553018b"
sacred_sha_end: "4f868d318abff71f8c8bfbcf443b2393a553018b"
sacred_sha_drift: false
locked_decisions_consumed: [D-30-06, D-30-07, D-30-08]
---

# Phase 61 — C3+D1+D2 Rate-Limit Headers + Model Aliases + Provider Stub — PHASE SUMMARY

**Phase 61 closes spec-compliance for external clients (Open WebUI / Continue.dev / Bolt.diy / Cline). The broker now (1) exposes upstream Anthropic rate-limit headers via prefix-loop forward on the Anthropic route + 6-canonical translation to OpenAI x-ratelimit-* namespace on the OpenAI route (with RFC-3339-to-duration-string reset format), (2) resolves friendly model aliases (opus/sonnet/haiku/gpt-4/etc) from a Redis-backed table with 5s TTL cache + boot SETNX seed + admin-runtime-update support, and (3) dispatches via a pluggable BrokerProvider interface with concrete AnthropicProvider + OpenAI/Gemini/Mistral stubs (compile-clean, throw NotImplementedError on invocation). All 7 requirements satisfied; full broker test suite 147/147 GREEN; sacred SHA byte-identical across all 12 sample points; D-NO-NEW-DEPS preserved across all 4 plans.**

## Plan-by-plan timeline

| Plan | Title | Wave | Duration | Commits | Status |
|------|-------|------|----------|---------|--------|
| 61-01 | BrokerProvider interface + AnthropicProvider + passthrough refactor | 1 | ~15 min | 3 (RED + GREEN + refactor) | COMPLETE |
| 61-02 | OpenAI/Gemini/Mistral stubs + grep-guard | 2 | ~4 min | 2 work + 1 docs follow-up | COMPLETE |
| 61-03 | Redis-backed alias resolver + boot seed + Anthropic route bug fix | 3 | ~13 min | 3 (RED + GREEN + wire) | COMPLETE |
| 61-04 | Rate-limit header forward + translation — phase gate | 4 | ~18 min | 3 (RED + Anthropic-wire + OpenAI-wire) | COMPLETE |
| **Total** | **4 plans, 4 waves** | | **~50 min** | **11 work + 1 docs follow-up + 4 plan SUMMARY commits** | **COMPLETE** |

## Phase 61 requirement closure

| Req | Description | Plan | Evidence |
|-----|-------------|------|----------|
| FR-BROKER-C3-01 | Anthropic broker route forwards anthropic-* + retry-after verbatim | 61-04 | `rate-limit-integration.test.ts` Anthropic-route sync + streaming forward tests GREEN |
| FR-BROKER-C3-02 | OpenAI broker route translates 6 canonical headers; reset = duration string | 61-04 | `rate-limit-integration.test.ts` OpenAI-route sync + streaming translate tests GREEN |
| FR-BROKER-C3-03 | retry-after preserved on 429 in BOTH routes | 61-04 | `rate-limit-integration.test.ts` 429-path tests GREEN; v29.4 Phase 45 behavior intact |
| FR-BROKER-D1-01 | Friendly model alias resolution (opus/sonnet/haiku/gpt-4/etc → Claude IDs) | 61-03 | `alias-resolver.test.ts` 7 GREEN; `seed-default-aliases.test.ts` 5 GREEN |
| FR-BROKER-D1-02 | Admin runtime alias updates take effect within 5s without restart | 61-03 | `alias-resolver.test.ts:'TTL refresh test'` GREEN (5s TTL cache verified) |
| FR-BROKER-D2-01 | BrokerProvider TypeScript interface | 61-01 | `interface-compile.test.ts` GREEN; `anthropic.test.ts` 5 GREEN |
| FR-BROKER-D2-02 | OpenAI/Gemini/Mistral provider stubs throw NotImplementedError | 61-02 | `stubs-throw.test.ts` 12 GREEN; `router-no-stub-dispatch.test.ts` 4 GREEN |

**7/7 requirements satisfied.** Phase 61 is shippable.

## Sacred SHA history — byte-identical across all of Phase 61

`nexus/packages/core/src/sdk-agent-runner.ts` SHA: `4f868d318abff71f8c8bfbcf443b2393a553018b`

Verified at every plan checkpoint:

| Plan | Sample points | All match? |
|------|--------------|-----------|
| 61-01 | Plan start, Task 2 mid, Task 3 end | YES |
| 61-02 | Plan start, Task 1 mid, plan end | YES |
| 61-03 | Plan start, Task 2 mid, Task 3 end | YES |
| 61-04 | Plan start, Task 1 commit, Task 2 commit, Task 3 commit (phase gate) | YES |

**Total sample points: 12 across 4 plans. All match `4f868d318abff71f8c8bfbcf443b2393a553018b`.** D-30-07 strictly preserved across the entire phase.

## D-NO-NEW-DEPS audit — GREEN across all 4 plans

Zero new npm packages added in any plan:

| Plan | New npm deps | Notes |
|------|--------------|-------|
| 61-01 | 0 | `@anthropic-ai/sdk@^0.80.0` already in livinityd deps from Phase 57 |
| 61-02 | 0 | Stubs only import from `./interface.js` (Plan 01) |
| 61-03 | 0 | Resolver uses existing `ioredis` from Phase 22 |
| 61-04 | 0 | rate-limit-headers module imports only `Response` type from `express` (already present) |

D-30-08 strictly preserved.

## Test suite trajectory across Phase 61

| Stage | Tests | Status |
|-------|-------|--------|
| Pre-Phase-61 baseline | 94/94 | GREEN |
| After 61-01 (Plan 01 end) | 100/100 | GREEN |
| After 61-02 (Plan 02 end) | 116/116 | GREEN |
| After 61-03 (Plan 03 end) | 128/128 | GREEN |
| After 61-04 (Plan 04 end — phase gate) | **147/147** | GREEN |

**Total new tests across phase:** 53 (6 in 01 + 16 in 02 + 12 in 03 + 19 in 04).

**5-run determinism gate (Plan 04 end):** 5 consecutive runs all 147/147 GREEN.

**5 pre-existing "No test suite found" broker test files** unchanged across the entire phase — out of scope per Plan 02 `deferred-items.md`.

## Locked decisions consumed

| Decision | Consumed by | Notes |
|----------|-------------|-------|
| D-30-06 (edge handles abuse, broker forwards transparently) | 61-04 | Broker forwards upstream rate-limit headers verbatim/translated; emits ZERO own 429s in v30 (Caddy edge handles abuse per Phase 60) |
| D-30-07 (sacred file untouched) | 61-01..04 | All edits scoped to `livinity-broker/`; sacred file SHA byte-identical at 12 sample points |
| D-30-08 (D-NO-NEW-DEPS) | 61-01..04 | Zero new npm packages across all 4 plans |

## Critical implementation notes

### Streaming branch reordering (Plan 04 deviation, R9 mitigation)

Both passthrough handlers' streaming branches were reordered: `provider.streamRequest()` now runs BEFORE `res.flushHeaders()`. This is a structural change from Phase 58's layout but necessary because:
- `forwardAnthropicHeaders` / `translateAnthropicToOpenAIHeaders` need `result.upstreamHeaders` (from `provider.streamRequest`)
- After `flushHeaders`, `res.setHeader` silently no-ops (RESEARCH.md Pitfall 1 / R9)
- The SDK's `.withResponse()` resolves once HTTP response headers arrive but BEFORE the SSE iterator is consumed — re-ordering does not stall the response, just shifts the await onto headers arrival rather than first SSE chunk arrival

### Reset format = duration string, NOT Unix seconds

CONTEXT.md said the OpenAI translator should emit Unix seconds for reset values. RESEARCH.md A1 corrected this: official OpenAI docs use duration string format (`'Ns'` for sub-minute, `'MmSs'` for ≥ 60s). Plan 04 ships duration string per official spec. If Phase 63 live verification surfaces parse failures with Open WebUI / Continue.dev / Bolt.diy, hot-patch is a 3-line change to `rfc3339ToOpenAIDuration()` returning `String(seconds)`.

### Anthropic route bug fix (Plan 03)

Phase 57's Anthropic route forwarded `body.model` to upstream verbatim. So `body.model='opus'` previously 404'd at Anthropic. Plan 03 alias-resolved on the Anthropic route too — now `body.model='opus'` correctly resolves to `claude-opus-4-7` and the request succeeds. Bug fix per RESEARCH.md State of the Art table.

### Plan 04 verify-criterion path correction

Plan 04 acceptance criteria mentioned `openai-router.ts` for the OpenAI translator wiring. But `openai-router.ts` agent-mode path uses `createSdkAgentRunnerForUser` (the SACRED path — D-30-07 forbids edits). Plan 01 explicitly placed all 4 Wave 4 placeholders in `passthrough-handler.ts`. Plan 04 wired the OpenAI translator at the actual placeholder sites in `passthrough-handler.ts` (passthrough mode = where headers are reachable). Agent-mode OpenAI route does NOT get rate-limit headers — acceptable because passthrough is DEFAULT for external clients per D-30-03; agent-mode is opt-in for internal scenarios where rate-limit headers are not needed by the broker layer.

## Hand-off

### To Phase 62 (E1+E2 Usage Tracking + Settings UI — independent, can begin immediately)

- Phase 61 produced ZERO Phase 62 dependencies. Phase 62 is independent (per ROADMAP critical-path).
- Phase 62 reuses Phase 59's apiKeys.* tRPC routes (already shipped) and consumes Phase 58's per-chunk usage + chatcmpl id (already shipped).
- The new `rate-limit-headers.ts` module is NOT referenced by Phase 62; it's a passthrough-handler-only concern.
- The new BrokerProvider interface (Plan 01-02) is NOT consumed by Phase 62 either — same passthrough-handler scope.
- Settings > AI Configuration > Usage tab can be built against existing `broker_usage` table (Phase 45+) without Phase 61 changes.

### To Phase 63 (Mandatory Live Verification — final phase of v30.0)

- Phase 63 must verify Phase 61's outputs end-to-end on Mini PC against 3+ external clients (Bolt.diy / Open WebUI / Continue.dev / Cline).
- **Mandatory verifications:**
  1. **Friendly alias works live (D1):** `curl https://api.livinity.io/v1/messages -H "Authorization: Bearer liv_sk_..." -d '{"model":"opus","max_tokens":256,"messages":[{"role":"user","content":"hi"}]}'` returns 200 (not 404). Response `model` field shows `claude-opus-4-7`.
  2. **Anthropic rate-limit headers visible (C3-01):** Same curl — response headers include `anthropic-ratelimit-requests-remaining: <num>`, `anthropic-ratelimit-tokens-remaining: <num>`. NOT 0 unless quota actually exhausted.
  3. **OpenAI translation works live (C3-02):** `curl https://api.livinity.io/v1/chat/completions -H "Authorization: Bearer liv_sk_..." -d '{"model":"gpt-4","messages":[{"role":"user","content":"hi"}]}'` — response headers include `x-ratelimit-remaining-requests: <num>`. Reset values are duration strings (e.g. `1s`, `6m0s`). NO `anthropic-*` headers visible (single-namespace per route).
  4. **Admin runtime alias update (D1-02):** `redis-cli SET livinity:broker:alias:test-alias claude-haiku-4-5-20251001`; within 5 seconds `curl ... -d '{"model":"test-alias", ...}'` works without restart.
  5. **Open WebUI / Continue.dev / Bolt.diy parse `'6m0s'` correctly:** open question from Plan 04 — if any client misparses, hot-patch `rfc3339ToOpenAIDuration` to return decimal seconds.
- Mini PC `bash /opt/livos/update.sh` deploy is required before Phase 63 verification can start (currently Mini PC is on pre-Phase-61 livinityd source).

### Open question carried forward

**Q (RESEARCH.md A1):** Do Open WebUI / Continue.dev / Bolt.diy parse OpenAI duration strings (`'6m0s'`) correctly?

**If yes:** ship as-is.

**If no:** 3-line hot-patch to `rfc3339ToOpenAIDuration()` — return `String(Math.max(0, Math.floor((parsed - Date.now()) / 1000)))`. Update unit tests accordingly. Single-line behavior change.

## Commits across Phase 61

| Plan | Commit SHA | Subject |
|------|-----------|---------|
| 61-01 | `e753374c` | `test(61-01): wave 0 RED tests for BrokerProvider interface + AnthropicProvider` |
| 61-01 | `c79928d8` | `feat(61-01): BrokerProvider interface + AnthropicProvider concrete + registry` |
| 61-01 | `e87bbacd` | `refactor(61-01): dispatch passthrough-handler.ts via getProvider('anthropic')` |
| 61-02 | `39c93f62` | `test(61-02): wave 0 RED tests for stubs-throw + router-no-stub-dispatch` |
| 61-02 | `f1f7e68c` | `feat(61-02): OpenAI/Gemini/Mistral stubs + registry seeding` |
| 61-02 | `4de7bb04` | `docs(61-02): log out-of-scope broker test discoveries` |
| 61-03 | `c2da2592` | `test(61-03): wave 0 RED tests for alias-resolver + seed-default-aliases` |
| 61-03 | `78fb9786` | `feat(61-03): Redis-backed alias resolver + boot seeder (Wave 0 GREEN)` |
| 61-03 | `2741e6f0` | `feat(61-03): wire alias resolver into both broker routes + boot seed` |
| 61-04 | `5130e065` | `test(61-04): wave 0 RED tests for rate-limit-headers + integration` |
| 61-04 | `377e7f53` | `feat(61-04): rate-limit-headers.ts + wire forward into Anthropic route (FR-BROKER-C3-01)` |
| 61-04 | `2ca27dbb` | `feat(61-04): wire translateAnthropicToOpenAIHeaders into OpenAI route — phase gate (FR-BROKER-C3-02)` |

11 work commits + 1 docs follow-up + 4 SUMMARY/PHASE-SUMMARY commits (pending).

## Self-Check: PASSED

**All 4 plan SUMMARY files exist:**
- `61-01-SUMMARY.md` — FOUND
- `61-02-SUMMARY.md` — FOUND
- `61-03-SUMMARY.md` — FOUND
- `61-04-SUMMARY.md` — FOUND

**Sacred SHA verified at phase end:** `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` → `4f868d318abff71f8c8bfbcf443b2393a553018b` ✓
