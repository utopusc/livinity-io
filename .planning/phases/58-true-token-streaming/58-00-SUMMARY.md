---
phase: 58-true-token-streaming
plan: 00
subsystem: testing
tags: [broker, test-infrastructure, fake-anthropic, sse, vitest, express, phase-58, wave-0]

# Dependency graph
requires:
  - phase: 57-passthrough-mode-agent-mode
    provides: passthrough-handler.ts (passthroughAnthropicMessages + passthroughOpenAIChatCompletions with transitional aggregate-then-restream SSE)
provides:
  - Deterministic-timing fake-Anthropic SSE Express server for Wave 4 integration tests
  - CANONICAL_SCRIPT (11 events, 5 deltas @ 300ms, ~1.6s total) for ≥3-deltas-in-2sec assertion
  - clientFactory test seam on PassthroughOpts + OpenAIPassthroughOpts (additive, undefined preserves Phase 57 behavior)
  - Exported makeClient() for test composition
  - Compression middleware audit: server/index.ts confirmed CLEAN (no compression() — no Cache-Control: no-transform mitigation needed)
affects: [phase-58-wave-1, phase-58-wave-2, phase-58-wave-3, phase-58-wave-4]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Deterministic SSE test fixture: Express ephemeral-port (app.listen(0, '127.0.0.1')) + per-event setTimeout for controlled inter-event timing (jitter <5ms vs 250ms test tolerance)"
    - "Test seam pattern: optional clientFactory? on opts interfaces — undefined falls through to default makeClient() (zero production behavior change)"
    - "preErrorStatus + preErrorRetryAfter knobs simulate upstream 429+Retry-After before script runs — covers retry path testing"

key-files:
  created:
    - livos/packages/livinityd/source/modules/livinity-broker/__tests__/fake-anthropic-sse-server.ts
    - livos/packages/livinityd/source/modules/livinity-broker/__tests__/fake-anthropic-sse-server.test.ts
  modified:
    - livos/packages/livinityd/source/modules/livinity-broker/passthrough-handler.ts

key-decisions:
  - "Server-side setTimeout per event (vs client-side jitter compensation) — only Node event loop jitter matters; tolerances 50x margin"
  - "Loopback bind '127.0.0.1' enforced for fake server (T-58-00-02 mitigation — no LAN exposure even on misconfigured CI)"
  - "5 deltas @ 300ms apart = 1.5s body + ~100ms framing events — well under 2s threshold with margin for jitter"
  - "Test seam dispatch via const client = (opts.clientFactory ?? makeClient)(token) — minimum diff, additive, undefined-safe"
  - "Compression audit deferred to grep server/index.ts (clean: 0 matches) — Waves 2+3 may re-verify if mounting changes"

patterns-established:
  - "Pattern 1: __tests__/<fixture>.ts colocated with handler under modules/livinity-broker/ (vitest auto-discovers)"
  - "Pattern 2: ScriptedEvent[] tuples ({type, data, delayMs}) — explicit, grep-able, no JSON file roundtrip"
  - "Pattern 3: Test seams as optional opts fields — Wave 4 tests inject without disturbing production callers"

requirements-completed: [FR-BROKER-C1-02]

# Metrics
duration: 4 min
completed: 2026-05-03
---

# Phase 58 Plan 00: Wave 0 Test Infrastructure Summary

**Deterministic-timing fake-Anthropic SSE Express server with CANONICAL_SCRIPT (5 deltas @ 300ms) + clientFactory test seam on passthrough-handler.ts — unblocks Waves 1+4.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-05-03T02:11:16Z
- **Completed:** 2026-05-03T02:14:57Z
- **Tasks:** 2/2 complete
- **Files modified:** 3 (2 new, 1 edited)

## Accomplishments

- Built `__tests__/fake-anthropic-sse-server.ts` (157 LOC) — Express ephemeral-port SSE simulator. Loopback-bound, controlled-timing, supports preError 429+Retry-After. Verified by 6/6 self-tests.
- CANONICAL_SCRIPT exports 11 wire-spec-verbatim events: 5 content_block_delta @ 300ms apart, message_delta with cumulative output_tokens=15. Total runtime ~1.6s (under 2s assertion threshold).
- Added optional `clientFactory?: (token) => Anthropic` field to both `PassthroughOpts` and `OpenAIPassthroughOpts` — Wave 4 tests will inject `(token) => new Anthropic({authToken: token.accessToken, baseURL: fakeServer.baseURL})`.
- Promoted internal `makeClient` to `export function makeClient` for test composition.
- Compression middleware audit (RESEARCH.md A4): `grep -c "compression" server/index.ts` returns 0 — CLEAN. No `Cache-Control: no-transform` mitigation required for SSE responses.

## Task Commits

1. **Task 1: fake-Anthropic SSE server + canonical script + self-test** — `070f862e` (test)
2. **Task 2: clientFactory test seam + compression audit** — `8da22b8d` (feat)

_Plan metadata commit (this SUMMARY) follows._

## Files Created/Modified

- `livos/packages/livinityd/source/modules/livinity-broker/__tests__/fake-anthropic-sse-server.ts` (new, 157 LOC) — Express ephemeral-port fake-Anthropic SSE server with CANONICAL_SCRIPT
- `livos/packages/livinityd/source/modules/livinity-broker/__tests__/fake-anthropic-sse-server.test.ts` (new, 91 LOC) — 6 self-test cases covering ephemeral port, ≥5 deltas at distinct timestamps, preError 429, close() resolution, script integrity, sub-2s runtime
- `livos/packages/livinityd/source/modules/livinity-broker/passthrough-handler.ts` (modified, +17/-3 lines) — additive `clientFactory?` on both opts interfaces; `makeClient` exported; 2 dispatch sites use `(opts.clientFactory ?? makeClient)(token)`

## Decisions Made

- **Server-side timing only.** All inter-event delays are server-side `await setTimeout(delayMs)`. No client-side jitter compensation needed. Node event loop jitter on Windows+Linux is <5ms in practice; 250ms test tolerance gives 50x margin.
- **Loopback bind enforced.** `app.listen(0, '127.0.0.1', ...)` mitigates T-58-00-02 (fake server LAN exposure on misconfigured runners).
- **CANONICAL_SCRIPT 5 deltas @ 300ms.** Total ~1.6s — under 2s assertion threshold with margin for jitter. Can raise to 350ms (still <2s) if Wave 4 hits flakiness on Windows CI.
- **Test seam pattern: `const client = (opts.clientFactory ?? makeClient)(token)`.** Minimum diff, additive, undefined-safe — production callers unchanged. No new module exports beyond `makeClient`.

## Deviations from Plan

None — plan executed exactly as written. Acceptance criteria, sacred-file SHA gate, two-adapters-coexist gate all GREEN at first try.

## Verifications (post-execution)

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| Sacred file SHA `nexus/packages/core/src/sdk-agent-runner.ts` | `4f868d318abff71f8c8bfbcf443b2393a553018b` | `4f868d318abff71f8c8bfbcf443b2393a553018b` | PASS |
| `openai-sse-adapter.ts` git diff | empty | empty | PASS |
| `nexus/packages/core/` git status | empty | empty | PASS |
| Wave 0 self-tests | 6/6 GREEN | 6/6 GREEN (1.74s) | PASS |
| Phase 57 regression suite (passthrough-handler + mode-dispatch + credential-extractor + openai-translator) | 38/38 GREEN | 38/38 GREEN | PASS |
| TypeScript `--noEmit` errors in passthrough-handler.ts | 0 | 0 | PASS |
| `clientFactory?` in PassthroughOpts | present | present | PASS |
| `clientFactory?` in OpenAIPassthroughOpts | present | present | PASS |
| `export function makeClient` | yes | yes | PASS |
| `(opts.clientFactory ?? makeClient)(token)` dispatch sites | ≥2 | 2 | PASS |
| `compression(` in server/index.ts | 0 (per RESEARCH.md A4) | 0 | PASS — no mitigation needed |
| D-NO-NEW-DEPS (package.json diff across plan) | empty | empty | PASS |
| Pitfall 1 (no @nexus/core / sdk-agent-runner / claude-agent-sdk imports in passthrough-handler.ts) | 0 matches | 0 matches | PASS |

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Self-Check: PASSED

- Both new files exist on disk: `[ -f fake-anthropic-sse-server.ts ]` ✓; `[ -f fake-anthropic-sse-server.test.ts ]` ✓
- Both task commits found in git log: `070f862e` (Task 1 test), `8da22b8d` (Task 2 feat) ✓
- All plan-level `<success_criteria>` re-verified ✓

## Next Phase Readiness

Wave 0 unblocks the rest of Phase 58:

- **Wave 1 (Translator Core)** can now scaffold `openai-stream-translator.ts` unit tests by invoking `onAnthropicEvent()` with synthetic events derived from `CANONICAL_SCRIPT`-shape payloads (no fake server needed for unit tests — the script *shape* is the contract).
- **Wave 2 (Anthropic Passthrough Streaming)** will replace the transitional `passthrough-handler.ts:162` aggregate-then-restream block with `for await (const event of client.messages.stream(...))` real iteration. The clientFactory seam is in place; Wave 4 will use it.
- **Wave 3 (OpenAI Streaming Integration)** wires the Wave-1 translator into `passthrough-handler.ts:417` streaming branch. Same seam applies.
- **Wave 4 (Integration Tests)** wires `(token) => new Anthropic({authToken: token.accessToken, baseURL: fakeServer.baseURL})` into both passthrough handlers via clientFactory and asserts ≥3 distinct `content_block_delta` events at ≥50ms apart timestamps.

**Hand-off note for Wave 1:** Tests scaffolded here are GREEN by design (test infrastructure self-validates). The RED tests Wave 1 needs to turn GREEN do not yet exist — Wave 1's first task is to write `openai-stream-translator.test.ts` against the not-yet-implemented `openai-stream-translator.ts`. The CANONICAL_SCRIPT shape (especially `message_start.message.usage.input_tokens=25` and `message_delta.usage.output_tokens=15` cumulative) is the source-of-truth fixture for translator state assertions.

**No blockers.** Sacred file SHA stable, two-adapters-coexist preserved, D-NO-NEW-DEPS preserved, compression audit clean.

---
*Phase: 58-true-token-streaming*
*Completed: 2026-05-03*
