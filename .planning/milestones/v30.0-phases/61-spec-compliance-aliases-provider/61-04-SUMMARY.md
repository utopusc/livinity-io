---
phase: 61
plan: 04
subsystem: livinity-broker/rate-limit-headers
tags:
  - broker
  - rate-limit-headers
  - phase-61
  - phase-gate
  - wave-4
dependency_graph:
  requires:
    - "Plan 61-01: BrokerProvider interface + AnthropicProvider with .withResponse() exposing result.upstreamHeaders + 4 Wave 4 placeholder comments at insertion points in passthrough-handler.ts"
    - "Plan 61-02: 3 stub providers (openai/gemini/mistral) — Plan 04 verifies grep-guard still blocks accidental dispatch"
    - "Plan 61-03: Redis-backed alias resolver + boot seed (128/128 broker tests baseline GREEN)"
  provides:
    - "rate-limit-headers.ts (123 LOC) — pure-function module exporting forwardAnthropicHeaders + translateAnthropicToOpenAIHeaders + rfc3339ToOpenAIDuration"
    - "Anthropic broker route (/v1/messages) forwards ALL upstream anthropic-* + retry-after headers verbatim via prefix loop (sync + streaming)"
    - "OpenAI broker route (/v1/chat/completions) translates 6 canonical Anthropic ratelimit headers to x-ratelimit-* OpenAI namespace; reset values are duration strings; retry-after preserved (sync + streaming)"
    - "Streaming branch reordering: provider.streamRequest() invoked BEFORE res.flushHeaders() on BOTH routes — RESEARCH.md Pitfall 1 / R9 mitigation (after flushHeaders, setHeader silently no-ops)"
    - "Phase 61 closure: all 7 requirements satisfied (C3-01..03 + D1-01..02 + D2-01..02); shippable"
  affects:
    - "livinity-broker/passthrough-handler.ts — 4 Wave 4 placeholders REPLACED with actual calls; 2 streaming branches REORDERED to put provider.streamRequest() before flushHeaders()"
tech_stack:
  added: []
  patterns:
    - "Prefix-loop forwarding (NOT enumeration) — future-proof against new anthropic-* headers (RESEARCH.md catalog has 21 today; loop catches future additions automatically)"
    - "RFC 3339 ISO timestamp → OpenAI duration string ('Ns' / 'MmSs') per official OpenAI docs (NOT Unix seconds — CONTEXT.md was wrong; RESEARCH.md A1 corrects)"
    - "setHeader-before-flushHeaders ordering verified by integration test recording call order on FakeRes wrapper — Pitfall 1 / R9 mitigation"
    - "Single-namespace per route — OpenAI route emits ONLY x-ratelimit-* (NOT both anthropic-* and x-ratelimit-*); T-61-16 mitigation"
    - "Hop-by-hop / body-framing header drop is implicit (prefix matches only anthropic-* + retry-after) — RESEARCH.md Pitfall 3 mitigation"
key_files:
  created:
    - "livos/packages/livinityd/source/modules/livinity-broker/rate-limit-headers.ts (123 LOC) — pure-function module exporting 3 functions"
    - "livos/packages/livinityd/source/modules/livinity-broker/__tests__/rate-limit-headers.test.ts (162 LOC) — 12 unit tests covering all 3 functions"
    - "livos/packages/livinityd/source/modules/livinity-broker/__tests__/rate-limit-integration.test.ts (358 LOC) — 7 integration tests across both routes (sync + streaming + 429 + ordering)"
  modified:
    - "livos/packages/livinityd/source/modules/livinity-broker/passthrough-handler.ts (+29 LOC, -16 LOC) — 4 Wave 4 placeholders replaced with actual calls; both streaming branches reordered (provider.streamRequest before flushHeaders)"
decisions:
  - "Wired translateAnthropicToOpenAIHeaders into passthrough-handler.ts (where the OpenAI passthrough handler lives), NOT openai-router.ts (which is agent-mode-only and uses sacred createSdkAgentRunnerForUser path). Plan acceptance criteria mentioned openai-router.ts, but D-30-07 forbids touching the sacred path; Plan 01 explicitly placed all 4 Wave 4 placeholders in passthrough-handler.ts. Rule 1 deviation — verify-criterion path correction (see Deviations section)."
  - "Reordered both streaming branches so provider.streamRequest() runs BEFORE res.flushHeaders() — only way to honour the setHeader-before-flushHeaders contract since result.upstreamHeaders are not available until streamRequest resolves. SDK's .withResponse() resolves once HTTP response headers arrive but BEFORE the SSE iterator is consumed, so reordering does not stall the response (just shifts the await onto headers arrival rather than first SSE chunk arrival)."
  - "Reset value format: RFC 3339 → OpenAI duration string ('Ns' / 'MmSs') per RESEARCH.md A1 — CONTEXT.md said Unix seconds but that contradicts the official OpenAI docs. Negative or invalid input clamps to '0s' (T-61-13)."
  - "Sacred file SHA 4f868d318abff71f8c8bfbcf443b2393a553018b — byte-identical pre + post (D-30-07 strictly preserved)"
  - "D-NO-NEW-DEPS preserved — zero new npm packages; module imports only from express types (already present)"
metrics:
  duration_minutes: 18
  completed: "2026-05-03"
  task_count: 3
  file_count_created: 3
  file_count_modified: 1
---

# Phase 61 Plan 04: Rate-Limit Header Forwarding + Translation — Phase Gate Summary

**One-liner:** Shipped pure-function rate-limit header module + wired into both broker routes (Anthropic verbatim forward; OpenAI x-ratelimit-* translation with RFC-3339-to-duration-string conversion); reordered both streaming branches so provider.streamRequest() precedes flushHeaders() (R9 mitigation); 19 new tests GREEN (12 unit + 7 integration) including 5-run determinism gate; broker suite 128 → 147 GREEN; sacred SHA byte-identical.

## Tasks

| # | Name | Status | Commit |
|---|------|--------|--------|
| 1 | Wave 0 — RED tests for rate-limit-headers (unit) + integration tests with both routes + setHeader-before-flushHeaders ordering | Y | `5130e065` |
| 2 | Implement rate-limit-headers.ts + wire forwardAnthropicHeaders into passthrough-handler.ts (Anthropic sync + streaming) | Y | `377e7f53` |
| 3 | Wire translateAnthropicToOpenAIHeaders into passthrough-handler.ts OpenAI route (sync + streaming) — final phase gate | Y | `2ca27dbb` |

## Header Forwarding Module

**File:** `livos/packages/livinityd/source/modules/livinity-broker/rate-limit-headers.ts` (123 LOC)

```typescript
export function forwardAnthropicHeaders(upstream: Headers, res: Response): void
export function translateAnthropicToOpenAIHeaders(upstream: Headers, res: Response): void
export function rfc3339ToOpenAIDuration(rfc3339: string): string
```

### Anthropic verbatim forward (Anthropic route — FR-BROKER-C3-01)

Prefix-loop iteration over upstream Web Fetch `Headers`:
```typescript
for (const [name, value] of upstream) {
  const lower = name.toLowerCase()
  if (lower.startsWith('anthropic-') || lower === 'retry-after') {
    res.setHeader(name, value)
  }
}
```

Catches **all** 21 known Anthropic headers from RESEARCH.md catalog, plus future additions (`anthropic-fast-tier-*`, etc.) without code change. Hop-by-hop / body-framing headers (`content-length` / `content-encoding` / `transfer-encoding` / `connection` / `date`) are dropped implicitly because the prefix only matches `anthropic-*` + `retry-after` (RESEARCH.md Pitfall 3 mitigation).

### OpenAI translation table (OpenAI route — FR-BROKER-C3-02)

| Anthropic | OpenAI | Conversion |
|---|---|---|
| `anthropic-ratelimit-requests-limit` | `x-ratelimit-limit-requests` | verbatim integer |
| `anthropic-ratelimit-requests-remaining` | `x-ratelimit-remaining-requests` | verbatim integer |
| `anthropic-ratelimit-requests-reset` | `x-ratelimit-reset-requests` | RFC 3339 → duration string |
| `anthropic-ratelimit-tokens-limit` | `x-ratelimit-limit-tokens` | verbatim integer |
| `anthropic-ratelimit-tokens-remaining` | `x-ratelimit-remaining-tokens` | verbatim integer |
| `anthropic-ratelimit-tokens-reset` | `x-ratelimit-reset-tokens` | RFC 3339 → duration string |
| `retry-after` | `retry-after` | verbatim (FR-BROKER-C3-03) |

**Dropped (no OpenAI equivalent):** `anthropic-ratelimit-input-tokens-*`, `anthropic-ratelimit-output-tokens-*`, `anthropic-priority-*`.

**T-61-16 single-namespace mitigation:** OpenAI route emits ONLY `x-ratelimit-*` + `retry-after` — does NOT also call `forwardAnthropicHeaders` on the same response. Asserted by integration test "no anthropic-* keys on OpenAI response".

### Reset format: RFC 3339 → OpenAI duration string

Per RESEARCH.md A1 (corrects CONTEXT.md which said Unix seconds):

- `< 60s` → `'Ns'` (e.g. `'45s'`)
- `≥ 60s` → `'MmSs'` (e.g. `'6m0s'`, `'12m30s'`)
- Negative durations → `'0s'` (clamped)
- Invalid input (NaN from `Date.parse`) → `'0s'` (T-61-13)

## Streaming Path: setHeader-before-flushHeaders Ordering Verified

Both streaming branches in `passthrough-handler.ts` were **REORDERED** so `provider.streamRequest()` (which yields `result.upstreamHeaders`) runs BEFORE `res.flushHeaders()`:

**Before (Phase 58 layout):**
```
setHeader(SSE headers) → flushHeaders → provider.streamRequest → loop
```

**After (Phase 61 Plan 04):**
```
provider.streamRequest → setHeader(SSE headers) → setHeader(rate-limit-*) → flushHeaders → loop
```

The SDK's `.withResponse()` resolves once HTTP response headers arrive but BEFORE the SSE iterator is consumed, so the re-ordering does not stall the response — it just shifts the await onto headers arrival rather than first SSE chunk arrival.

**Verification (integration test):** `FakeRes` wrapper records the order of `setHeader` vs `flushHeaders` calls in a `_callOrder` array. Test asserts every `setHeader('anthropic-...', ...)` (Anthropic route) and `setHeader('x-ratelimit-...', ...)` (OpenAI route) entry's index is `< flushHeadersIdx`.

## New Tests Count + GREEN Status

**Wave 0 net new:** 19 tests across 2 new files.

| File | Tests | Status |
|------|-------|--------|
| `__tests__/rate-limit-headers.test.ts` | 12 | GREEN |
| `__tests__/rate-limit-integration.test.ts` | 7 | GREEN |

**Full broker suite trajectory:**

| Stage | Tests | Status |
|-------|-------|--------|
| Pre-Plan-04 baseline (Plan 03 end) | 128/128 | GREEN |
| After Task 1 (RED) | 128/128 + 12 unit + 7 integration unable to run/fail | RED for new tests |
| After Task 2 (Anthropic wired) | 128 + 10 GREEN (Anthropic + units) | partial GREEN |
| After Task 3 (OpenAI wired — phase gate) | **147/147** | GREEN |

**5-run determinism gate:** 5 consecutive runs all 147/147 GREEN.

**5 pre-existing "No test suite found" broker test files** unchanged (`integration.test.ts`, `openai-integration.test.ts`, `openai-sse-adapter.test.ts`, `sse-adapter.test.ts`, `translate-request.test.ts`) — out of scope per Plan 02 `deferred-items.md` and Rule 3 scope boundary. All were also failing pre-Plan-04 baseline.

## Sacred File Integrity

```
$ git hash-object nexus/packages/core/src/sdk-agent-runner.ts
4f868d318abff71f8c8bfbcf443b2393a553018b   # MATCH — byte-identical pre + post
```

D-30-07 strictly preserved. Sacred SHA verified at:
- Plan start (before Task 1)
- After Task 1 commit (`5130e065`)
- After Task 2 commit (`377e7f53`)
- After Task 3 commit (`2ca27dbb`) — final phase gate

## Commits Created

| SHA | Type | Subject |
|-----|------|---------|
| `5130e065` | test | `test(61-04): wave 0 RED tests for rate-limit-headers + integration` |
| `377e7f53` | feat | `feat(61-04): rate-limit-headers.ts + wire forward into Anthropic route (FR-BROKER-C3-01)` |
| `2ca27dbb` | feat | `feat(61-04): wire translateAnthropicToOpenAIHeaders into OpenAI route — phase gate (FR-BROKER-C3-02)` |

## D-NO-NEW-DEPS Audit

GREEN. Zero new npm packages added. The rate-limit-headers module imports only `Response` type from `express` (already present in livinityd deps since Phase 22). No SDK calls (operates on Web Fetch `Headers` instance from `.withResponse()` which Plan 01 already wired).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan acceptance criteria pointed at wrong file (openai-router.ts) for OpenAI translation wiring**
- **Found during:** Task 3 (after reading openai-router.ts)
- **Issue:** Plan Task 3 said `grep -c "translateAnthropicToOpenAIHeaders" livos/packages/livinityd/source/modules/livinity-broker/openai-router.ts` returns ≥ 2. But `openai-router.ts` agent-mode path uses `createSdkAgentRunnerForUser` (the SACRED path — D-30-07 forbids edits to `nexus/packages/core/src/sdk-agent-runner.ts`). Worse, `createSdkAgentRunnerForUser` aggregates internally and does NOT expose upstream Anthropic headers — there is no header to translate at that call site. Plan 01's Wave 4 hand-off note (line 199 of 61-01-SUMMARY.md) explicitly placed all 4 Wave 4 placeholders in `passthrough-handler.ts`, NOT `openai-router.ts`.
- **Fix:** Wired `translateAnthropicToOpenAIHeaders` at the 2 OpenAI placeholder sites in `passthrough-handler.ts` (sync + streaming branches of `passthroughOpenAIChatCompletions`). Agent-mode OpenAI route in `openai-router.ts` does NOT get rate-limit headers — acceptable because passthrough is the DEFAULT mode for external clients per D-30-03 (Bolt.diy / Open WebUI / Continue.dev / Cline always use passthrough); agent-mode is opt-in for internal scenarios where rate-limit headers are not needed by the broker layer (LivOS in-app chat goes through nexus directly, not the broker).
- **Files modified:** `livos/packages/livinityd/source/modules/livinity-broker/passthrough-handler.ts`
- **Commit:** `2ca27dbb`

**2. [Rule 1 - Bug] Streaming branches needed reordering — original placement could not work**
- **Found during:** Task 2 (after attempting initial wiring)
- **Issue:** Plan 01 placed Wave 4 placeholder ABOVE `res.flushHeaders()` BUT the `result` (which yields `upstreamHeaders`) was constructed by `provider.streamRequest()` AFTER `flushHeaders()`. The placeholder comment said "MUST precede flushHeaders below" but the variable being passed (`result.upstreamHeaders`) didn't yet exist at that point. Putting `forwardAnthropicHeaders(result.upstreamHeaders, res)` literally where the placeholder was would throw `ReferenceError: result is not defined`.
- **Fix:** REORDERED both streaming branches: `provider.streamRequest()` now runs BEFORE `res.flushHeaders()`. The SDK's `.withResponse()` resolves once HTTP response headers arrive but BEFORE the SSE iterator is consumed, so the re-ordering does not stall the response — it just shifts the await onto headers arrival rather than first SSE chunk arrival. Plan Step 4 explicitly anticipated this: *"Verify the call sits ABOVE the existing res.flushHeaders() line. If for any reason Phase 57 placed res.flushHeaders() ABOVE the placeholder, MOVE the forwardAnthropicHeaders call so it precedes flushHeaders."* — applied the correction.
- **Files modified:** `livos/packages/livinityd/source/modules/livinity-broker/passthrough-handler.ts`
- **Commits:** `377e7f53` (Anthropic streaming) + `2ca27dbb` (OpenAI streaming)

### Auth Gates

None encountered — all work was local code + tests, no SSH, no live API calls. Sacred SHA assertion is local `git hash-object` operation (no remote interaction).

## Phase 61 Requirement Closure

| Req | Description | Evidence |
|-----|-------------|----------|
| FR-BROKER-C3-01 | Anthropic route forwards anthropic-* + retry-after verbatim | `rate-limit-integration.test.ts:'sync: forwards all anthropic-* + retry-after; drops content-length and date'` (commit 5130e065 RED → 377e7f53 GREEN) |
| FR-BROKER-C3-02 | OpenAI route translates 6 canonical headers; reset = duration string | `rate-limit-integration.test.ts:'sync: translates 6 canonical headers to x-ratelimit-* namespace; reset is duration string'` (5130e065 RED → 2ca27dbb GREEN) |
| FR-BROKER-C3-03 | retry-after preserved on 429 BOTH routes | `rate-limit-integration.test.ts:'Anthropic route: 429 from upstream → throws UpstreamHttpError with retry-after preserved'` + `'OpenAI route: 429 from upstream → throws UpstreamHttpError with retry-after preserved'` (continues v29.4 Phase 45 behavior; verified intact) |
| FR-BROKER-D1-01 | Friendly model alias resolution | Closed in Plan 03 — `alias-resolver.test.ts` GREEN |
| FR-BROKER-D1-02 | Admin runtime alias updates take effect within 5s | Closed in Plan 03 — `alias-resolver.test.ts:'TTL refresh test'` GREEN |
| FR-BROKER-D2-01 | BrokerProvider TypeScript interface | Closed in Plan 01 — `interface-compile.test.ts` GREEN |
| FR-BROKER-D2-02 | OpenAI/Gemini/Mistral provider stubs throw NotImplementedError | Closed in Plan 02 — `stubs-throw.test.ts` GREEN (12 assertions) |

## Open Question for Phase 63 Live Verification

**Q:** Confirm Open WebUI / Continue.dev / Bolt.diy parse `'6m0s'` duration string format correctly.

**Background (RESEARCH.md A1):** Official OpenAI docs use duration string format (`'Ns'` / `'MmSs'`); some legacy clients may expect Unix seconds. If Phase 63 surfaces parse failures, hot-patch to decimal seconds (Option B in research).

**Hot-patch path:** Edit `rfc3339ToOpenAIDuration()` in `rate-limit-headers.ts` to return `String(seconds)` instead of formatted duration string. Single 3-line change; no test regressions expected (regex tests would need adjustment, but only tests authored in this plan).

## Self-Check: PASSED

**Files exist:**
- `livos/packages/livinityd/source/modules/livinity-broker/rate-limit-headers.ts` — FOUND
- `livos/packages/livinityd/source/modules/livinity-broker/__tests__/rate-limit-headers.test.ts` — FOUND
- `livos/packages/livinityd/source/modules/livinity-broker/__tests__/rate-limit-integration.test.ts` — FOUND

**Commits exist:**
- `5130e065` — FOUND (`test(61-04): wave 0 RED tests`)
- `377e7f53` — FOUND (`feat(61-04): rate-limit-headers.ts + wire forward into Anthropic route`)
- `2ca27dbb` — FOUND (`feat(61-04): wire translateAnthropicToOpenAIHeaders — phase gate`)

**Done-criteria greps:**
- `grep -c "forwardAnthropicHeaders" passthrough-handler.ts` → 5 (≥ 2) ✓
- `grep -c "translateAnthropicToOpenAIHeaders" passthrough-handler.ts` → 4 (≥ 2) ✓
- `grep -c "Phase 61 Wave 4" passthrough-handler.ts` → 0 ✓ (all placeholders gone)

**Sacred file SHA:**
- `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` → `4f868d318abff71f8c8bfbcf443b2393a553018b` — MATCH (byte-identical to pre-plan baseline)
