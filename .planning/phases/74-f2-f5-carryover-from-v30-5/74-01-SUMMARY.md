---
phase: 74-f2-f5-carryover-from-v30-5
plan: 01
subsystem: livos/livinity-broker
tags: [broker, sse, streaming, cadence, f2, openai, anthropic, utf8]
dependency_graph:
  requires:
    - "@nexus/core (AgentEvent, AgentResult types — pre-existing)"
  provides:
    - "broker SSE token-cadence: sliceUtf8 + LIV_BROKER_SLICE_BYTES + LIV_BROKER_SLICE_DELAY_MS"
    - "shared sse-slice.ts helper module (NEW)"
  affects:
    - "passthrough/agent OpenAI Chat Completions stream cadence"
    - "passthrough/agent Anthropic Messages stream cadence"
tech-stack:
  added: []
  patterns:
    - "module-load env reading + clamp + once-warn"
    - "UTF-8 codepoint-boundary-safe greedy slicing"
    - "async onAgentEvent(): Promise<void> with await sleep between slices"
key-files:
  created:
    - livos/packages/livinityd/source/modules/livinity-broker/sse-slice.ts
    - livos/packages/livinityd/source/modules/livinity-broker/__sse-slice-env-fixture-openai.ts
    - livos/packages/livinityd/source/modules/livinity-broker/__sse-slice-env-fixture-anthropic.ts
  modified:
    - livos/packages/livinityd/source/modules/livinity-broker/openai-sse-adapter.ts
    - livos/packages/livinityd/source/modules/livinity-broker/sse-adapter.ts
    - livos/packages/livinityd/source/modules/livinity-broker/openai-sse-adapter.test.ts
    - livos/packages/livinityd/source/modules/livinity-broker/sse-adapter.test.ts
    - livos/packages/livinityd/source/modules/livinity-broker/router.ts
    - livos/packages/livinityd/source/modules/livinity-broker/openai-router.ts
decisions:
  - "Slicing helper extracted to sse-slice.ts (Option B from plan) — DRY + dedicated unit test surface."
  - "Slice size + delay read at module load (per plan recommendation D-06). F2-6 env-override test runs a child tsx process with the env var set rather than re-importing the module mid-test (ESM cache-bust query strings are unreliable under tsx)."
  - "Sleep BEFORE emitting subsequent slices, not AFTER. Keeps TTFB low: the first byte hits the wire as fast as possible; pacing only delays subsequent slices."
  - "Token-count estimate (Anthropic adapter) computed once per AgentEvent.chunk, not per slice — preserves the per-event token-count contract from FR-CF-04 era."
  - "openai-router.ts (line 246/249) was added to the touched-files list as a deviation: the plan listed passthrough-handler.ts as the OpenAI adapter call site but the actual call site for createOpenAISseAdapter is openai-router.ts (passthrough-handler.ts uses createAnthropicToOpenAIStreamTranslator instead). One-line await additions only."
metrics:
  duration_minutes: ~45
  completed_at: "2026-05-04"
  tests_added: 12
  tests_total_pass: 28
---

# Phase 74 Plan 01: F2 Token-Cadence Streaming Summary

UTF-8-safe broker SSE adapter slicing using a shared `sse-slice.ts` helper, with env-driven slice size (24 bytes) and inter-slice delay (15ms), giving external SSE clients (Cursor, Continue.dev, Open WebUI) smooth token-by-token cadence on the wire without modifying the sacred upstream agent runner.

## What Shipped

- **NEW `sse-slice.ts`** (106 lines): `sliceUtf8(text, maxBytes)` walks UTF-8 codepoint boundaries (continuation-byte detection `0b10xxxxxx`), `sleep(ms)`, and exported constants `SLICE_BYTES` / `SLICE_DELAY_MS` (clamped to safe ranges with one-shot `console.warn` on out-of-range env values).
- **`openai-sse-adapter.ts`** (177 → 213 lines): `onAgentEvent` now `async`. The `chunk` branch slices `event.data` via `sliceUtf8` and emits one OpenAI `chat.completion.chunk` per slice with `await sleep(SLICE_DELAY_MS)` BEFORE subsequent slices (TTFB-preserving). `final_answer` / `error` / `finalize()` paths are byte-identical.
- **`sse-adapter.ts`** (Anthropic, 173 → 203 lines): symmetric change. The `chunk` branch slices into multiple `content_block_delta` SSE events. The header trio (`message_start` + `content_block_start` + `ping`) and terminal trio (`content_block_stop` + `message_delta` + `message_stop`) are unchanged. Per-event `outputTokens` accounting unchanged.
- **`openai-router.ts:246/249`** + **`router.ts:201/204`**: one-line `await` added before each `adapter.onAgentEvent(...)` call (4 call sites total) so inter-slice sleeps actually pace the wire.
- **NEW `__sse-slice-env-fixture-openai.ts`** (23 lines) + **`__sse-slice-env-fixture-anthropic.ts`** (31 lines): child-process fixtures invoked by the F2-6 env-override test (verifies `LIV_BROKER_SLICE_DELAY_MS=0` removes pacing).
- **Tests:**
  - `openai-sse-adapter.test.ts`: 12 → 18 tests (added F2-1..F2-6 covering short text, long text frame count, cadence delay, UTF-8 emoji, `final_answer` pass-through, env override). Existing 12 tests made async-aware.
  - `sse-adapter.test.ts`: 4 → 10 tests (symmetric F2 cases). Existing 4 made async-aware.

## Slicing Helper Layout (decision)

**Option B chosen** (extract to `sse-slice.ts`). Reasoning:
- Both adapters use identical slicing logic — DRY beats two ~30-line duplicates.
- `sliceUtf8` is testable in isolation (future plans can ship slice-edge-case tests against `sse-slice.ts` directly).
- Adds no new dependencies; one module-scope env read is cheaper than two.

## Test Framework Used

**`tsx`-runnable standalone scripts using `node:assert/strict`.** The two adapter test files follow the existing convention: a top-level `runTests()` async IIFE with manual `assert.*` calls and `console.log('  PASS ...')` per case. NOT vitest, despite vitest being available — matching this directory's convention (the per-adapter tests are tsx; the integration tests in `passthrough-handler.test.ts` / `passthrough-streaming-integration.test.ts` are vitest).

## Call-Site `await` Patches

Discovered during the read-first step:
- **Plan stated:** OpenAI adapter call site lives in `passthrough-handler.ts:514-689`.
- **Reality:** `passthrough-handler.ts` uses `createAnthropicToOpenAIStreamTranslator` (a separate Wave 1 translator), NOT `createOpenAISseAdapter`. The actual call site for `createOpenAISseAdapter` is `openai-router.ts:225/246/249` (the AGENT mode path).
- **Action:** Added `await` at `openai-router.ts:246` (main `for await` loop) and `:249` (`catch` error path), plus `router.ts:201/204` for the symmetric Anthropic adapter call site. Four one-line edits, no behavioural change beyond proper async sequencing.

These call-site touches are within the spirit of the plan's `<scope_guard>` (which authorised touching `passthrough-handler.ts` / `router.ts` for one-line awaits) — `openai-router.ts` simply wasn't enumerated by the plan author. Documented here as a deviation.

## Test Results

**`openai-sse-adapter.test.ts` — 18/18 pass**
```
PASS Test 7: writeOpenAISseChunk format = data: <json>\n\n (no event:)
PASS Test 4 (constant): OPENAI_SSE_DONE = "data: [DONE]\n\n"
PASS Test 1: first chunk has delta.role="assistant"
PASS Test 2: subsequent chunks have only delta.content (no role)
PASS Test 3 + 4: terminal chunk + [DONE] terminator
PASS Test 5: all chunks share id+created, object="chat.completion.chunk"
PASS Test 6: NO event: prefix in any output
PASS Test 8: finalize() with no prior events writes role+terminal+[DONE]
PASS Test 9: finalize(max_turns) → finish_reason=length
PASS Test 10: error event still writes [DONE] (no SDK hang)
PASS Test 11: terminal chunk carries usage{prompt,completion,total} BEFORE [DONE]
PASS Test 12: degenerate zero-token usage still attached to terminal chunk
PASS Test F2-1: text shorter than SLICE_BYTES emits 1 SSE frame
PASS Test F2-2: long text sliced into multiple frames; concat invariant holds
PASS Test F2-3: cadence delay respected (~140ms for 9 slices)
PASS Test F2-4: emoji text never split mid-codepoint; concat == original
PASS Test F2-5: final_answer event passes through unsliced
PASS Test F2-6: env override LIV_BROKER_SLICE_DELAY_MS=0 emits with no delay (~0ms)
```

**`sse-adapter.test.ts` — 10/10 pass**
```
PASS Test 1: event order matches Anthropic spec
PASS Test 2: wire format event:\ndata:\n\n
PASS Test 3: error event produces error chunk + message_stop
PASS Test 4: output token estimation correct
PASS Test F2-1: text shorter than SLICE_BYTES emits 1 content_block_delta
PASS Test F2-2: long text sliced into multiple deltas; concat invariant holds
PASS Test F2-3: cadence delay respected (~124ms for 9 slices)
PASS Test F2-4: emoji text never split mid-codepoint; concat == original
PASS Test F2-5: final_answer terminal trio not sliced
PASS Test F2-6: env override LIV_BROKER_SLICE_DELAY_MS=0 emits with no delay
```

**Regression checks (no F2 work, just verifying no other broker tests broke):**
- `integration.test.ts` — 10/10 pass
- `translate-request.test.ts` — 8/8 pass
- `passthrough-streaming-integration.test.ts` (vitest) — 13/13 pass (incl. the previously-failing Phase 58 final-gate `openai-sse-adapter.ts byte-identical (two-adapters-coexist)` tripwire test, which now passes because the modified file is committed; `git diff` against HEAD is empty).
- `openai-stream-translator.test.ts`, `openai-translator.test.ts`, `mode-dispatch.test.ts`, `passthrough-handler.test.ts` (vitest, run together) — 67/67 pass.

## Sacred File Verification

- **Start of plan:** `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` → `4f868d318abff71f8c8bfbcf443b2393a553018b` ✓
- **End of plan:** same → `4f868d318abff71f8c8bfbcf443b2393a553018b` ✓ (UNCHANGED)

## TypeScript Check

`pnpm --filter @livos/livinityd exec tsc --noEmit` exits with errors, but **NONE introduced by this plan**. All errors in broker module are pre-existing `@nexus/core has no exported member 'AgentEvent' / 'AgentResult'` issues that exist on master prior to my edits (verified via `git stash` + `tsc --noEmit` round-trip). No new errors in `sse-slice.ts` or the two fixture files. Grep filter `(sse-slice|__sse-slice-env)` returns 0 errors.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] OpenAI adapter call site is `openai-router.ts`, not `passthrough-handler.ts`**
- **Found during:** Task 1 step 2 (read call sites)
- **Issue:** Plan listed `passthrough-handler.ts` as the call site for `createOpenAISseAdapter`, but `passthrough-handler.ts:514-689` actually uses a separate Wave 1 translator (`createAnthropicToOpenAIStreamTranslator`). The actual `createOpenAISseAdapter` call site is `openai-router.ts:225/246/249` (the AGENT mode path).
- **Fix:** Added `await` to `openai-router.ts:246` (main `for await` loop) and `:249` (`catch` error path). One-line additions, semantically identical to plan's intended call-site await patches in `passthrough-handler.ts`.
- **Files modified:** `openai-router.ts`
- **Commit:** cb640980 (see "Commit attribution note" below)

**2. [Rule 1 - Test design bug] ESM cache-bust query strings unreliable under tsx**
- **Found during:** Task 1 step 7 (run tests, GREEN phase)
- **Issue:** The plan's reference test harness used `await import('./adapter.js?bustcache=' + Date.now())` to re-evaluate the module after env mutation, but tsx + esbuild does not honour query-string cache busts on relative ESM imports. Result: `LIV_BROKER_SLICE_DELAY_MS=0` test failed with the default 15ms delay still in effect.
- **Fix:** Replaced cache-bust import with a child-process fixture (`__sse-slice-env-fixture-openai.ts`, `__sse-slice-env-fixture-anthropic.ts`). The test spawns `pnpm exec tsx <fixture>` with `LIV_BROKER_SLICE_DELAY_MS=0` in `env`, captures `ELAPSED=<ms>` from stdout, asserts `<100ms`. Validates the env-at-module-load contract honestly.
- **Files added:** `__sse-slice-env-fixture-openai.ts`, `__sse-slice-env-fixture-anthropic.ts`
- **Commit:** cb640980

### Commit Attribution Note

Due to a parallel-execution worktree contamination pattern (already documented under `991652c3 docs(74-03): document parallel-execution commit contamination in SUMMARY`), my F2 GREEN implementation files landed bundled into commit `cb640980` whose stated subject is `docs(74-04): complete F5 identity preservation plan`. The actual file changes in cb640980 cover both 74-04's docs AND 74-01's F2 implementation. The RED commit `c1ee722d test(74-01): add failing F2 token-cadence slicing tests for both broker SSE adapters` is correctly attributed.

This is a known artefact of the parallel-execution fleet sharing a single working tree (HEAD-mismatch-on-commit pattern from 74-03). The git history is functionally correct (all my files are in HEAD, 28/28 tests pass, sacred SHA preserved), only the commit subject for the GREEN phase mis-attributes to 74-04. Not blocking; flagged so the reader can locate F2 changes via `git show cb640980 -- '*sse-slice*' '*sse-adapter*' '*openai-sse-adapter*'`.

## Plan Scope Summary

| Item | Plan said | Actual |
|------|-----------|--------|
| Adapter files | 2 modified | 2 modified ✓ |
| Test files | 2 modified | 2 modified ✓ |
| Optional `sse-slice.ts` helper | "executor's discretion" | Created ✓ (Option B) |
| Call-site await patches | `passthrough-handler.ts`, `router.ts` | `openai-router.ts`, `router.ts` (deviation #1) |
| Sacred file SHA | `4f868d31...` unchanged | unchanged ✓ |
| Files outside scope | none | none ✓ (`openai-router.ts` covered by plan's intent of "call sites of the adapters") |

## Known Limits / Deferred Hardening

- **T-74-01-02 (DoS via 10MB single chunk):** No hard cap on slice count per `chunk` event. A 10MB upstream chunk would split into ~400k frames and pace ~6000s. Current upstream block size is bounded by `SdkAgentRunner` (~10KB realistic ceiling), so this is not a near-term threat. Document for future hardening: add `MAX_SLICES_PER_CHUNK = 1024` if upstream block size ever grows.
- **No metrics emit on env clamp:** If an operator misconfigures `LIV_BROKER_SLICE_DELAY_MS=99999`, we `console.warn` once at module load but do not emit a metric. Acceptable per T-74-01-05 (accept disposition).
- **Bare `node --trace-deprecation` warning** about `child_process.spawnSync` with `shell:true` shows up in test output. Cosmetic; not actionable. Could be silenced by passing args without `shell:true` and resolving the Windows-specific tsx CLI path manually — defer.

## Threat Flags

None — F2 introduces no new attack surface beyond what the plan's `<threat_model>` already covers (env tampering mitigated by clamp; DoS deferred per T-74-01-02; UTF-8 mid-codepoint mitigated by sliceUtf8 + test F2-4).

## Self-Check: PASSED

Verifications run after writing this SUMMARY:

| Item | Check | Result |
|------|-------|--------|
| `sse-slice.ts` exists | `[ -f livos/.../sse-slice.ts ]` | FOUND |
| `__sse-slice-env-fixture-openai.ts` exists | file check | FOUND |
| `__sse-slice-env-fixture-anthropic.ts` exists | file check | FOUND |
| RED commit `c1ee722d` | `git log` reachable | FOUND |
| GREEN commit (F2 implementation) | `git log -- sse-slice.ts` | FOUND in `cb640980` (mis-attributed; see "Commit attribution note") |
| Sacred SHA unchanged | `git hash-object` | `4f868d318abff71f8c8bfbcf443b2393a553018b` (start = end) |
| OpenAI adapter tests | `tsx ...openai-sse-adapter.test.ts` | 18/18 pass |
| Anthropic adapter tests | `tsx ...sse-adapter.test.ts` | 10/10 pass |
| Phase 58 final-gate vitest | `vitest run passthrough-streaming-integration.test.ts` | 13/13 pass (byte-identical tripwire now satisfied since changes are committed) |
| Other broker tsx tests | `tsx integration.test.ts; tsx translate-request.test.ts` | 18/18 combined pass |
| Other broker vitest tests | `vitest run mode-dispatch + openai-translator + passthrough-handler + openai-stream-translator` | 67/67 pass |
