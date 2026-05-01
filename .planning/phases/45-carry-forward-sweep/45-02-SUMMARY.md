---
phase: 45-carry-forward-sweep
plan: 02
subsystem: api
tags: [carry-forward, broker, error-forwarding, retry-after, fr-cf-01, rate-limit, http-passthrough, anthropic, openai]

# Dependency graph
requires:
  - phase: 41-broker-anthropic-messages
    provides: livinity-broker/router.ts Anthropic /v1/messages handler + sync error catch site, livinity-broker/agent-runner-factory.ts upstream /api/agent/stream proxy boundary, integration.test.ts bare tsx + node:assert/strict harness
  - phase: 42-broker-openai-chat-completions
    provides: livinity-broker/openai-router.ts OpenAI /v1/chat/completions handler + sync error catch site (mirror pattern of router.ts)
  - phase: 45-carry-forward-sweep (45-01)
    provides: Wave 1 isolation contract — sacred file BASELINE_SHA pinned at 4f868d31...; Wave 2 plans must leave nexus/packages/core/src/sdk-agent-runner.ts byte-identical (git diff --shortstat HEAD -- empty)
provides:
  - UpstreamHttpError class in agent-runner-factory.ts capturing {status, retryAfter} at the upstream-fetch boundary
  - Strict 429-only allowlist + Retry-After verbatim forwarding on Anthropic /v1/messages sync catch (router.ts)
  - Same allowlist on OpenAI /v1/chat/completions sync catch (openai-router.ts) with OpenAI-shape error body (rate_limit_exceeded_error / rate_limit_exceeded code)
  - mockUpstreamError() test helper sibling to mockUpstreamSse() — intercepts only /api/agent/stream, returns Response with status + Retry-After header
  - 5 new integration tests (Test 6, 6b, 7, 8, 9) covering 18 status-code sub-cases (9 statuses × 2 routers via Tests 7+9 loops) + 2 Retry-After format cases (delta-seconds + HTTP-date)
affects: [45-04, 47-MODEL-02, v29.3-FR-DASH-03]

# Tech tracking
tech-stack:
  added: []  # No new dependencies (D-NO-NEW-DEPS preserved)
  patterns:
    - "Typed upstream-error class (UpstreamHttpError extends Error) co-located with the throw site so catch-side instanceof works without circular imports — the class is exported from agent-runner-factory.ts and imported by both routers"
    - "res.setHeader('Retry-After', ...) BEFORE res.status().json() — Express's res.json() flushes headers, so setHeader after json() is a no-op (pitfall: silent header drop)"
    - "Strict allowlist (pitfall B-09): exactly one upstream status (429) is special-cased; ALL other statuses fall into the 'forward verbatim' branch. Parameterized loop test over [400,401,403,429,500,502,503,504,529] enforces this — no aspirational 'maybe also 503' remap"
    - "Retry-After byte-identity (pitfall B-10 / RFC 7231 §7.1.3): the broker is a pass-through; both delta-seconds AND HTTP-date formats forwarded as-is, no parsing, no normalization, no trim"

key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts
    - livos/packages/livinityd/source/modules/livinity-broker/router.ts
    - livos/packages/livinityd/source/modules/livinity-broker/openai-router.ts
    - livos/packages/livinityd/source/modules/livinity-broker/integration.test.ts

key-decisions:
  - "Co-locate UpstreamHttpError in agent-runner-factory.ts (not a new file) — the throw site is here and the class is small (10 lines). Co-location keeps the diff small and avoids new module boundaries (D-NO-NEW-DEPS spirit)."
  - "Anthropic 429 body uses {type: 'error', error: {type: 'rate_limit_error', message}} per Anthropic Messages API spec; OpenAI 429 body uses {error: {message, type: 'rate_limit_exceeded_error', code: 'rate_limit_exceeded'}} per OpenAI Chat Completions spec — match each upstream's native error shape so marketplace clients written against the spec parse correctly."
  - "Skipped Co-Authored-By footer — recent v29.4 commits (45-01 chore + 45-01 docs) deliberately omit it per planner directive; matched style."
  - "Streaming-path errors deliberately out of scope (per plan <interfaces> note + FR-CF-01 success criteria #1) — they go through SSE adapter's onAgentEvent({type: 'error'}) handler, not this catch block. Streaming-path 429 forwarding is plan 45-04's territory."

patterns-established:
  - "UpstreamHttpError discriminator pattern: catch (err) -> if (err instanceof UpstreamHttpError) -> branch on err.status === 429 vs other; else fall through to existing 500 behavior. Keeps the 'genuinely-internal error' contract intact (JSON.parse failures, runner crashes before fetch completes still 500)."
  - "9-status-code parameterized allowlist test: exhaustive coverage of common upstream codes via for-loop, asserting res.status === status for each — catches accidental remap regressions in CI."
  - "Per-test fetch mock teardown: every test gets its own mockUpstreamError(...) returning a restoreFetch thunk; restoreFetch() called in finally-equivalent position before next test runs. No persistent state leak between tests (mirrors mockUpstreamSse() pattern from Tests 1-2)."

requirements-completed: [FR-CF-01]

# Metrics
duration: 3min
completed: 2026-05-01
---

# Phase 45 Plan 02: Carry-Forward C1 Broker Error Path Forwarding Summary

**Strict 429-only allowlist + byte-identical Retry-After forwarding via UpstreamHttpError class — broker now forwards upstream nexus errors verbatim (429 stays 429 with Retry-After preserved; 502/503/504/529 stay themselves; non-upstream errors stay 500) instead of collapsing every status to HTTP 500.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-01T19:15:19Z
- **Completed:** 2026-05-01T19:18:47Z
- **Tasks:** 4 (1 atomic commit per plan design)
- **Files modified:** 4 (matches `files_modified` frontmatter exactly)
- **LOC delta:** +206 / -4

## Accomplishments

- Introduced `UpstreamHttpError` class in `agent-runner-factory.ts` (10 lines) capturing `{status: number, retryAfter: string | null}` at the upstream-fetch boundary; replaced the lossy `throw new Error(...)` at lines 75-77 with `throw new UpstreamHttpError(...)` that reads `response.headers.get('Retry-After')` BEFORE throwing.
- Anthropic-side `router.ts` sync error catch (was lines 157-162) now branches: `instanceof UpstreamHttpError && status === 429` → forward 429 + Retry-After verbatim + `error.type: 'rate_limit_error'`; `instanceof UpstreamHttpError && status !== 429` → forward `err.status` verbatim + `error.type: 'api_error'`; else (non-UpstreamHttpError) → preserve existing 500 behavior.
- OpenAI-side `openai-router.ts` sync error catch (was lines 234-242) mirrors the Anthropic logic exactly with the OpenAI error body shape: 429 body uses `{error: {message, type: 'rate_limit_exceeded_error', code: 'rate_limit_exceeded'}}`; non-429 upstream uses existing `{type: 'api_error', code: 'upstream_failure'}` shape just with the real status code.
- Extended `integration.test.ts` with `mockUpstreamError({status, retryAfter})` helper + 5 new test blocks (Test 6, 6b, 7, 8, 9). Final tally: **10/10 PASS** including 18 status-code sub-cases (9 statuses × 2 routers via Tests 7+9 loops) + 2 Retry-After format cases (delta-seconds via Test 6, HTTP-date via Test 6b).
- Atomic single commit `cdd34445` lands on master with subject containing FR-CF-01.
- Sacred file `nexus/packages/core/src/sdk-agent-runner.ts` `git diff --shortstat HEAD~1 HEAD` returns empty — Wave 2 isolation contract preserved on top of 45-01's audit-only re-pin.

## Diff Hunks Landed

### `livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts` (+24 / -1)

**1. New `UpstreamHttpError` class declaration (after line 3 import block):**

```typescript
/**
 * Phase 45 Plan 02 (FR-CF-01) — typed upstream error.
 *
 * Thrown by createSdkAgentRunnerForUser when the upstream nexus
 * /api/agent/stream call returns a non-OK Response. Captures status
 * + Retry-After header so the router catch blocks can forward
 * verbatim per the strict 429-only allowlist (pitfall B-09).
 *
 * Retry-After is preserved BYTE-IDENTICAL — both delta-seconds
 * (`'60'`) and HTTP-date (`'Wed, 21 Oct 2026 07:28:00 GMT'`)
 * formats are forwarded as-is, no parsing, no normalization
 * (pitfall B-10 / RFC 7231 §7.1.3).
 */
export class UpstreamHttpError extends Error {
	readonly status: number
	readonly retryAfter: string | null
	constructor(message: string, status: number, retryAfter: string | null) {
		super(message)
		this.name = 'UpstreamHttpError'
		this.status = status
		this.retryAfter = retryAfter
	}
}
```

**2. Post-fetch guard (was lines 75-77, now lines 99-106):**

Before:
```typescript
if (!response.ok || !response.body) {
    throw new Error(`/api/agent/stream returned ${response.status} ${response.statusText}`)
}
```

After:
```typescript
if (!response.ok || !response.body) {
    const retryAfter = response.headers.get('Retry-After')
    throw new UpstreamHttpError(
        `/api/agent/stream returned ${response.status} ${response.statusText}`,
        response.status,
        retryAfter,
    )
}
```

### `livos/packages/livinityd/source/modules/livinity-broker/router.ts` (+22 / -1)

**1. Import extended:**

Before: `import {createSdkAgentRunnerForUser} from './agent-runner-factory.js'`
After: `import {createSdkAgentRunnerForUser, UpstreamHttpError} from './agent-runner-factory.js'`

**2. Sync error catch (was lines 157-162, now lines 158-187):**

```typescript
} catch (err: any) {
    // FR-CF-01 (Phase 45 Plan 02) — strict 429-only allowlist with Retry-After
    // verbatim forwarding (pitfall B-09 / B-10). All other upstream statuses
    // forward at their actual code; non-UpstreamHttpError throws stay 500.
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
        // (502/503/504 stay 502/503/504 — NOT remapped to 429, NOT collapsed to 500).
        res.status(err.status).json({
            type: 'error',
            error: {type: 'api_error', message: err.message},
        })
        return
    }
    // Genuinely-internal error (no upstream Response in scope): preserve 500.
    res.status(500).json({
        type: 'error',
        error: {type: 'api_error', message: err?.message || 'broker error'},
    })
}
```

### `livos/packages/livinityd/source/modules/livinity-broker/openai-router.ts` (+27 / -1)

**1. Import extended:** identical to router.ts pattern.

**2. Sync error catch (was lines 234-242, now lines 235-272):**

```typescript
} catch (err: any) {
    // FR-CF-01 (Phase 45 Plan 02) — strict 429-only allowlist with Retry-After
    // verbatim forwarding (pitfall B-09 / B-10). Mirrors router.ts:157 catch.
    if (err instanceof UpstreamHttpError) {
        if (err.status === 429) {
            if (err.retryAfter !== null) {
                res.setHeader('Retry-After', err.retryAfter)
            }
            res.status(429).json({
                error: {
                    message: err.message,
                    type: 'rate_limit_exceeded_error',
                    code: 'rate_limit_exceeded',
                },
            })
            return
        }
        // Non-429 upstream error: forward upstream status verbatim.
        res.status(err.status).json({
            error: {
                message: err.message,
                type: 'api_error',
                code: 'upstream_failure',
            },
        })
        return
    }
    // Genuinely-internal error (no upstream Response): preserve 500.
    res.status(500).json({
        error: {
            message: err?.message || 'broker error',
            type: 'api_error',
            code: 'upstream_failure',
        },
    })
}
```

### `livos/packages/livinityd/source/modules/livinity-broker/integration.test.ts` (+125 / -1)

**1. New `mockUpstreamError()` helper (sibling to existing `mockUpstreamSse()`):**

```typescript
function mockUpstreamError(opts: {status: number; retryAfter?: string}): () => void {
    const original = globalThis.fetch
    globalThis.fetch = (async (input: any, init?: any) => {
        const urlStr = typeof input === 'string' ? input : input?.url || ''
        if (!urlStr.includes('/api/agent/stream')) return original(input, init)
        const headers = new Headers({'Content-Type': 'text/plain'})
        if (opts.retryAfter !== undefined) headers.set('Retry-After', opts.retryAfter)
        return new Response('upstream error', {status: opts.status, headers})
    }) as any
    return () => {
        globalThis.fetch = original
    }
}
```

**2. Five new test blocks (Test 6, 6b, 7, 8, 9) inserted before the final summary log; final log denominator bumped from `(5/5)` to `(10/10)`.**

## Test Results — `npx tsx source/modules/livinity-broker/integration.test.ts`

```
  PASS Test 1: sync POST → Anthropic Messages JSON shape
  PASS Test 2: SSE POST → Anthropic spec-compliant chunks
  PASS Test 3: unknown userId → 404
  PASS Test 4: single-user mode + non-admin → 403
  PASS Test 5: invalid body shape → 400
  PASS Test 6: Anthropic 429 + Retry-After:60 forwarded verbatim
  PASS Test 6b: Anthropic 429 + HTTP-date Retry-After byte-identical
  PASS Test 7: Anthropic parameterized 9-status-code allowlist (no remap)
  PASS Test 8: OpenAI 429 + Retry-After:120 forwarded verbatim
  PASS Test 9: OpenAI parameterized 9-status-code allowlist (no remap)

All integration.test.ts tests passed (10/10)
```

**Test 7 sub-cases (Anthropic parameterized loop):** asserts `res.status === <expected>` for each upstream status — `400 → 400`, `401 → 401`, `403 → 403`, `429 → 429`, `500 → 500`, `502 → 502`, `503 → 503`, `504 → 504`, `529 → 529` (9 sub-assertions). Confirmed no remap to 429 anywhere; no collapse to 500 for any of these 9 codes.

**Test 9 sub-cases (OpenAI parameterized loop):** mirror of Test 7 against `/u/admin-1/v1/chat/completions` — same 9 status codes, same strict-equality assertion. **Total parameterized sub-cases: 9 × 2 routers = 18.**

**Test 6 + 6b + 8 Retry-After format coverage:**
- Test 6 (Anthropic): delta-seconds `'60'` → `res.headers.get('retry-after') === '60'` (verbatim)
- Test 6b (Anthropic): HTTP-date `'Wed, 21 Oct 2026 07:28:00 GMT'` → `res.headers.get('retry-after') === <same string>` (byte-identical, no normalization)
- Test 8 (OpenAI): delta-seconds `'120'` → `res.headers.get('retry-after') === '120'` (verbatim)

## Task Commits

This plan produces a single atomic commit (per plan's Wave 2 design — all 4 tasks committed together):

1. **Task 1: UpstreamHttpError class + post-fetch guard rewrite** — staged
2. **Task 2: router.ts catch block branching** — staged
3. **Task 3: openai-router.ts catch block branching** — staged
4. **Task 4: integration.test.ts new helper + 5 test blocks** — staged
5. **Atomic commit:** `cdd3444559cc6bb537693fc5d3cf61f1c4356ddd` — `feat(45-02): broker 429 forwarding + Retry-After preservation (FR-CF-01)`

**Commit hash (full):** `cdd3444559cc6bb537693fc5d3cf61f1c4356ddd`
**Short hash:** `cdd34445`
**Subject:** `feat(45-02): broker 429 forwarding + Retry-After preservation (FR-CF-01)`

## Files Created/Modified

- `livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts` — Added `UpstreamHttpError` class export + replaced lossy `throw new Error(...)` post-fetch guard with typed `throw new UpstreamHttpError(...)` capturing `Retry-After` header (+24 / -1)
- `livos/packages/livinityd/source/modules/livinity-broker/router.ts` — Extended import to bring in `UpstreamHttpError` + replaced sync error catch block with `instanceof`-aware branching (+22 / -1)
- `livos/packages/livinityd/source/modules/livinity-broker/openai-router.ts` — Same import extension + same catch-block branching pattern with OpenAI error shape (+27 / -1)
- `livos/packages/livinityd/source/modules/livinity-broker/integration.test.ts` — Added `mockUpstreamError()` helper + Test 6 / 6b / 7 / 8 / 9 + bumped final log denominator from `5/5` to `10/10` (+125 / -1)

## Decisions Made

- **Single atomic commit.** Plan's frontmatter shows 4 tasks but the `<output>` block prescribes "ONE atomic commit. Subject: feat(45-02)..." Tasks 1-3 are interdependent (router and openai-router import the class declared in agent-runner-factory) and Task 4's tests verify the entire wire end-to-end, so a per-task split would not produce independently-buildable commits.
- **`error.type` value mapping.** Anthropic Messages API spec uses `'rate_limit_error'` for 429 (per Anthropic docs) and `'api_error'` for general 5xx. OpenAI Chat Completions spec uses `'rate_limit_exceeded_error'` (with `code: 'rate_limit_exceeded'`) for 429 and existing `'api_error' / code: 'upstream_failure'` for general. Matched each spec's native shape so marketplace clients written against either API parse correctly.
- **`res.setHeader('Retry-After', ...)` BEFORE `res.status().json()`.** Express's `res.json()` flushes headers — calling setHeader after json is a silent no-op. Order matters; both routers set the header first, then call status+json. Verified by Test 6/6b/8 which would fail if order were swapped.
- **Skipped Co-Authored-By footer.** Recent v29.4 commits (45-01 chore + 45-01 docs + Phase 45 plans seed) deliberately omit it per planner directive ("the project's recent commits don't use one consistently"). Matched style.
- **Streaming-path errors deliberately out of scope.** Per plan `<interfaces>` and FR-CF-01 success criteria #1, streaming errors flow through the SSE adapter's `onAgentEvent({type: 'error'})` handler — that's plan 45-04's domain, not 45-02. Both `router.ts` (line 113 streaming catch) and `openai-router.ts` (line 187 streaming catch) are intentionally untouched.

## Audit-Only Contract Verification (Wave 2 isolation)

```
$ git diff --shortstat HEAD~1 HEAD -- nexus/packages/core/src/sdk-agent-runner.ts
(empty — zero bytes)

$ git show HEAD --stat
 .../livinity-broker/agent-runner-factory.ts        |  31 ++++-
 .../modules/livinity-broker/integration.test.ts    | 125 ++++++++++++++++++++-
 .../modules/livinity-broker/openai-router.ts       |  29 ++++-
 .../source/modules/livinity-broker/router.ts       |  25 ++++-
 4 files changed, 206 insertions(+), 4 deletions(-)

$ npx tsx nexus/packages/core/src/providers/sdk-agent-runner-integrity.test.ts
PASS: sdk-agent-runner.ts integrity verified (SHA: 4f868d318abff71f8c8bfbcf443b2393a553018b)
```

Sacred file `nexus/packages/core/src/sdk-agent-runner.ts` does NOT appear in the commit's file-stat — Wave 2 isolation contract upheld on top of 45-01's audit-only re-pin (BASELINE_SHA `4f868d31...` still pinned).

## Deviations from Plan

None — plan executed exactly as written.

The plan's `<action>` blocks specified literal code text for each edit; that text was inserted verbatim. The plan's automated `<verify>` blocks were each satisfied by the post-edit grep + tsc + test runs. The single deviation worth noting is operational (not source-code):

- The plan's per-task `<verify>` automated blocks include `cd livos/packages/livinityd && npx tsc --noEmit`. Running this surfaces 4 PRE-EXISTING errors (3 broker files importing `AgentEvent`/`AgentResult` from `@nexus/core` which don't currently re-export those names — this is pre-existing drift unrelated to 45-02). Confirmed by stashing the 45-02 edits and re-running tsc (same 4 errors), then unstashing — no new errors introduced. Per the plan's scope boundary rule (Rule scope: "Only auto-fix issues DIRECTLY caused by the current task's changes") this drift is logged but NOT fixed in this plan.

## Issues Encountered

- **Pre-existing `@nexus/core` type drift:** `AgentEvent` and `AgentResult` types are imported by `agent-runner-factory.ts` (line 1), `router.ts` (line 2), and `openai-router.ts` (line 3) but `@nexus/core`'s built `dist/index.d.ts` doesn't currently export those names. tsc surfaces 4 errors. Confirmed pre-existing by stash-test (same errors at HEAD baseline). Not in 45-02 scope; logged here for future plan to address (likely Phase 47 `update.sh` build chain when memory dist + nexus rebuild gets fixed).

- **`integration.test.ts` static check showed no errors despite the @nexus/core import drift in sibling files** — the test file itself doesn't import those types. The runtime `npx tsx` execution succeeds because tsx uses transpile-only mode (no type-checking at runtime), so the test loop runs even with the broker module's static type errors. This is the same pattern Phase 41/42 used; not new for 45-02.

## User Setup Required

None — no external service configuration needed for an in-process error-forwarding fix.

## Next Phase Readiness

- **45-03 (FR-CF-03 httpOnlyPaths)** can proceed in Wave 2 — does not touch broker module, parallel-safe.
- **45-04 (FR-CF-04 OpenAI streaming usage chunk)** can proceed in Wave 2 — touches `openai-sse-adapter.ts` only (orthogonal to 45-02's sync-catch surface). The `UpstreamHttpError` class is now available for 45-04 if streaming-path 429 forwarding becomes a future scope item.
- **v29.3 FR-DASH-03 banner-section** is now end-to-end correct: marketplace UI receiving HTTP 429 with `Retry-After` from the broker can render the "rate-limited" state with a real countdown. Stops being "synthetic-verifiable only".
- **Phase 47 FR-MODEL-02 Branch B** (if taken) — sacred file BASELINE_SHA `4f868d31...` still pinned; 45-02 did not move it; FR-MODEL-02 Branch B's eventual surgical edit will re-pin a third time on top of `cdd34445`.

## Self-Check: PASSED

- File `livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts` exists and contains `export class UpstreamHttpError extends Error` — verified
- File `livos/packages/livinityd/source/modules/livinity-broker/router.ts` exists and contains `import {createSdkAgentRunnerForUser, UpstreamHttpError}` + `err instanceof UpstreamHttpError` + `res.setHeader('Retry-After', err.retryAfter)` + `type: 'rate_limit_error'` — verified
- File `livos/packages/livinityd/source/modules/livinity-broker/openai-router.ts` exists and contains `import {createSdkAgentRunnerForUser, UpstreamHttpError}` + `err instanceof UpstreamHttpError` + `type: 'rate_limit_exceeded_error'` — verified
- File `livos/packages/livinityd/source/modules/livinity-broker/integration.test.ts` exists and contains `function mockUpstreamError` + 5 new PASS-line strings (Test 6 / 6b / 7 / 8 / 9) — verified
- Commit `cdd34445` (full SHA `cdd3444559cc6bb537693fc5d3cf61f1c4356ddd`) exists in `git log --oneline -5` — verified
- `git diff --shortstat HEAD~1 HEAD -- nexus/packages/core/src/sdk-agent-runner.ts` returns empty (Wave 2 isolation upheld) — verified
- `npx tsx source/modules/livinity-broker/integration.test.ts` exits 0 with `All integration.test.ts tests passed (10/10)` — verified
- `npx tsx nexus/packages/core/src/providers/sdk-agent-runner-integrity.test.ts` PASS (BASELINE_SHA `4f868d31...` still matches sacred file) — verified

---
*Phase: 45-carry-forward-sweep*
*Completed: 2026-05-01*
