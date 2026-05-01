---
phase: 45-carry-forward-sweep
plan: 04
subsystem: livinity-broker
tags: [carry-forward, openai-sse, usage-tokens, broker_usage, test-script, fr-cf-04]

# Dependency graph
requires:
  - phase: 42-marketplace-broker-openai
    provides: createOpenAISseAdapter + writeOpenAISseChunk (the SSE wire writer this plan extends)
  - phase: 44-usage-dashboard
    provides: parse-usage.ts:111-183 capture middleware that scans the SSE buffer for the new usage chunk
  - phase: 45-carry-forward-sweep/45-01
    provides: sacred-file BASELINE_SHA re-pin (4f868d31...) — test:phase45 transitively re-asserts via test:phase39
  - phase: 45-carry-forward-sweep/45-02
    provides: integration.test.ts (the 10/10 broker-error-forwarding tests chained into test:phase45)
  - phase: 45-carry-forward-sweep/45-03
    provides: common.test.ts (the 4/4 httpOnlyPaths tests chained into test:phase45)
provides:
  - "OpenAIChatCompletionChunk extended with optional usage?: {prompt_tokens, completion_tokens, total_tokens} — terminal-only field per OpenAI streaming spec"
  - "makeChunk(delta, finishReason, usage?) — 3-arg factory; attaches usage only when supplied (content chunks remain unchanged)"
  - "finalize(stoppedReason?, usage?) — SOLE canonical terminal emitter; threads usage onto terminal chunk BEFORE [DONE] (pitfall B-13 wire-order invariant)"
  - "Real upstream token plumbing through agent-runner-factory.ts done-event handler (totalInputTokens / totalOutputTokens read off event.data with backward-compatible fallback to 0)"
  - "test:phase45 npm script chaining 39 -> 40 -> 41 -> 42 -> 43 -> 44 + the three Phase 45 broker test surfaces (integration.test.ts + common.test.ts + openai-sse-adapter.test.ts)"
  - "broker_usage row capture for OpenAI streaming traffic (consumer at parse-usage.ts:162-172 was already written in Phase 44; this plan finally fires the producer)"
affects: [phase-44-usage-dashboard, openai-python-sdk-clients, marketplace-openai-streaming]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Deferred-emission pattern for terminal SSE chunks — events that fire mid-stream (final_answer, error) capture a stoppedReasonHint instead of writing the terminal chunk + [DONE] inline; the router's finally-block calls finalize(stoppedReason, usage) as the sole canonical terminal emitter so usage tokens (only available in finalResult after iteration) can be supplied"
    - "Backward-compatible optional-field read pattern (typeof d.totalInputTokens === 'number' ? d.totalInputTokens : 0) — adds new contract surface to upstream events without breaking older nexus builds that don't yet emit the field"
    - "Wire-order assertion test pattern — assert.ok(usageIdx < doneIdx) verifies the byte-level ordering invariant that strict OpenAI Python SDK consumers depend on (pitfall B-13 mitigation)"
    - "Cross-workspace test chaining via relative paths — nexus/packages/core/package.json scripts use ../../../livos/... to reach broker tests in the sibling pnpm workspace; tsx accepts forward-slash POSIX paths on Windows + PowerShell"

key-files:
  created: []
  modified:
    - "livos/packages/livinityd/source/modules/livinity-broker/openai-sse-adapter.ts (+59/-8: interface usage field + StreamingUsage alias + makeChunk 3-arg + final_answer/error deferred emission + finalize 2-arg with usage threading + stoppedReasonHint state)"
    - "livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts (+11/-3: done-event handler reads optional totalInputTokens/totalOutputTokens with backward-compatible fallback)"
    - "livos/packages/livinityd/source/modules/livinity-broker/openai-router.ts (+19/-7: streaming finally-block captures streamFinalResult and threads tokens through adapter.finalize)"
    - "livos/packages/livinityd/source/modules/livinity-broker/openai-sse-adapter.test.ts (+40/-5: Test 3 + Test 10 add adapter.finalize() call for new caller convention; new Test 11 wire-order + Test 12 zero-token degenerate; bumped 10/10 -> 12/12)"
    - "nexus/packages/core/package.json (+1/-1: added test:phase45 script + comma after test:phase44)"

key-decisions:
  - "Option A (defer terminal emission to finalize) chosen over Option B (extend AgentEvent type with usage field). Rationale: AgentEvent contract change would ripple across nexus + livinityd; the deferral pattern keeps the change LOCAL to the broker adapter + router. Tests 3 + 10 needed a small caller-convention update (add adapter.finalize() after the deferred-emission events) — behavior-preserving."
  - "stoppedReasonHint state field captures the implied stop reason from final_answer / error events ('complete' / 'error') so finalize() emits the correct finish_reason even when called with no explicit stoppedReason. effectiveStop = stoppedReason ?? stoppedReasonHint ?? undefined preserves caller precedence."
  - "Backward-compatible read for upstream tokens (typeof check + fallback to 0) preserves the existing zero-token behavior for older nexus builds that don't yet emit totalInputTokens / totalOutputTokens. No upstream contract change — purely additive READ."
  - "Streaming branch in openai-router.ts now captures streamFinalResult (full AgentResult) instead of just upstreamStoppedReason, because finalize() needs both stoppedReason AND token counts. Variable-naming distinguishes from sync branch's finalResult (avoid shadowing)."
  - "test:phase45 chains test:phase44 transitively (which transitively chains 39 -> 44) instead of duplicating individual test invocations. Single source of truth — adding new tests to test:phase39 propagates automatically."
  - "Cross-workspace path: relative ../../../livos/... from nexus/packages/core/. tsx accepts forward-slash POSIX paths on Windows + PowerShell; npm-script-runner handles && chaining cross-platform."

patterns-established:
  - "Deferred-emission pattern for terminal SSE chunks (replaces inline emission when downstream callers need to inject post-iteration data like usage tokens)"
  - "Wire-order assertion test (substring index comparison) for OpenAI streaming spec compliance — generalize to other strict-spec wire formats (Anthropic message_stop, GraphQL subscriptions, etc.)"

requirements-completed: [FR-CF-04]

# Metrics
metrics:
  duration: ~30min
  completed: 2026-05-01
  tasks: 5
  files-modified: 5
  files-created: 0
  loc-delta-source: "+89/-19 (5 source files; net +70)"
  loc-delta-tests: "+40/-5 (test file; net +35)"
  loc-delta-config: "+1/-1 (package.json)"
  tests-added: 2 (Tests 11 + 12)
  tests-updated: 2 (Tests 3 + 10 — caller-convention update)
  tests-passing: 38/38 across the test:phase45 chain

# v29.4 Phase 45 commit hash
commit: c6061f76

---

# Phase 45 Plan 04: OpenAI SSE Usage Chunk + Real Token Plumbing + test:phase45 Master Gate Summary

**One-liner:** OpenAI Chat Completions SSE adapter now emits a terminal `usage{prompt_tokens, completion_tokens, total_tokens}` chunk strictly BEFORE `data: [DONE]\n\n`, sourced from real upstream nexus `done` event tokens (no longer hardcoded 0/0); new `test:phase45` script chains 39 -> 44 + three Phase 45 broker tests as the milestone-level master gate.

## Plan-Level Goal

Close v29.4 carry-forward C4 (FR-CF-04). The previous wire format violated the OpenAI streaming spec by never emitting a terminal `usage` chunk — strict consumers (OpenAI Python SDK) saw `response.usage.total_tokens === 0` for non-trivial completions, and the Phase 44 `parse-usage.ts:111-183` capture middleware never wrote `broker_usage` rows for OpenAI streaming traffic (the consumer was written before the producer existed). This plan delivers the producer + plumbs real upstream token counts through the entire path: nexus `/api/agent/stream` `done` event → `agent-runner-factory.ts` `AgentResult` → `openai-router.ts` streaming `finally`-block → `openai-sse-adapter.ts` `finalize(usage)` → SSE wire chunk.

## What Was Built (per Task)

### Task 1 — `openai-sse-adapter.ts` extension (-) FR-CF-04 producer side

- **Interface extension:** `OpenAIChatCompletionChunk` gains optional `usage?: {prompt_tokens: number; completion_tokens: number; total_tokens: number}` with JSDoc citing pitfall B-13 wire-order invariant.
- **Type alias:** `type StreamingUsage = {prompt_tokens, completion_tokens, total_tokens}` for repeat use.
- **`makeChunk(delta, finishReason, usage?)`:** now 3-arg; if `usage` provided, attaches `chunk.usage = usage`. Content chunks remain identical.
- **Deferred-emission pattern:** `final_answer` and `error` AgentEvent branches NO LONGER write the terminal chunk + `[DONE]` inline. They:
  1. Capture `stoppedReasonHint = 'complete' / 'error'` (private state field).
  2. Ensure the role chunk is sent if not already (preserves SDK compatibility).
- **`finalize(stoppedReason?, usage?)`:** now the SOLE canonical terminal emitter. Sequence:
  1. Send role chunk if `!firstChunkSent`.
  2. Compute `effectiveStop = stoppedReason ?? stoppedReasonHint ?? undefined`.
  3. Write terminal chunk via `makeChunk({}, mapFinishReason(effectiveStop), usage)` — usage is on this chunk if supplied.
  4. Write `OPENAI_SSE_DONE` (`'data: [DONE]\n\n'`) after.
- Wire order is now byte-level deterministic: `data: <chunk-with-usage>\n\n` then `data: [DONE]\n\n`. Pitfall B-13 mitigated.

### Task 2 — `agent-runner-factory.ts` real-token read

- The `done` event handler at the new line range (~128-148 after 45-02's `UpstreamHttpError` insertion) reads optional `totalInputTokens` / `totalOutputTokens` numeric fields off `event.data`:
  ```typescript
  totalInputTokens: typeof d.totalInputTokens === 'number' ? d.totalInputTokens : 0,
  totalOutputTokens: typeof d.totalOutputTokens === 'number' ? d.totalOutputTokens : 0,
  ```
- Replaces the prior hardcoded `0 // not surfaced by /api/agent/stream — Phase 44 may augment` TODO.
- Backward-compatible: older nexus builds without the fields fall back to 0 (existing behavior preserved).
- Did NOT touch 45-02's `UpstreamHttpError` class declaration (lines 18-27) or post-fetch guard (lines 99-106). Sacred file UNCHANGED. Wave 2 isolation contract upheld.

### Task 3 — `openai-router.ts` streaming `finalize()` call

- Streaming branch's `try` block now captures the generator's full `AgentResult` return value (variable `streamFinalResult: AgentResult | undefined`) instead of just `upstreamStoppedReason`.
- Streaming branch's `finally` block:
  ```typescript
  if (streamFinalResult) {
      const promptTokens = streamFinalResult.totalInputTokens || 0
      const completionTokens = streamFinalResult.totalOutputTokens || 0
      adapter.finalize(streamFinalResult.stoppedReason, {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
      })
  } else {
      adapter.finalize()
  }
  ```
- Degenerate path (generator threw before yielding `done`): `streamFinalResult` is undefined; `finalize()` called with no args (existing error behavior preserved).
- Did NOT touch the sync (non-stream) branch or the catch block (45-02's territory).

### Task 4 — `openai-sse-adapter.test.ts` extension (+ caller-convention update)

- **Test 3 update:** added `adapter.finalize()` call after `final_answer` event (because terminal emission is now deferred). Behavior-preserving — same end-state asserted.
- **Test 10 update:** same pattern — added `adapter.finalize()` after `error` event.
- **NEW Test 11:** terminal chunk carries `usage{prompt_tokens: 7, completion_tokens: 3, total_tokens: 10}` AND wire-order assertion (`assert.ok(usageIdx < doneIdx)` proving the usage chunk byte-precedes `[DONE]`). This is the wire-format compliance test referenced in the plan's success criteria #5.
- **NEW Test 12:** degenerate zero-token usage `{0, 0, 0}` still PRESENT on terminal chunk (spec-compliant — usage object must be there even when zero).
- Test count bumped from `(10/10)` to `(12/12)`. Final log now reads `All openai-sse-adapter.test.ts tests passed (12/12)`.

### Task 5 — `test:phase45` master gate npm script

- Added to `nexus/packages/core/package.json` after `test:phase44`:
  ```json
  "test:phase45": "npm run test:phase44 && tsx ../../../livos/packages/livinityd/source/modules/livinity-broker/integration.test.ts && tsx ../../../livos/packages/livinityd/source/modules/server/trpc/common.test.ts && tsx ../../../livos/packages/livinityd/source/modules/livinity-broker/openai-sse-adapter.test.ts"
  ```
- Chains transitively: `test:phase44` -> `test:phase43` -> `test:phase42` -> `test:phase41` -> `test:phase40` -> `test:phase39` (which re-asserts the re-pinned `BASELINE_SHA = 4f868d318abff71f8c8bfbcf443b2393a553018b` from 45-01).
- Then runs the three Phase 45 broker test surfaces in order: `integration.test.ts` (45-02 — 10/10) + `common.test.ts` (45-03 — 4/4) + `openai-sse-adapter.test.ts` (this plan — 12/12).

## Verification — `npm run test:phase45` Output

```
> @nexus/core@1.0.0 test:phase45
> npm run test:phase44 && tsx ../../../livos/.../integration.test.ts && tsx ../../../livos/.../common.test.ts && tsx ../../../livos/.../openai-sse-adapter.test.ts

# test:phase39 chained:
PASS Test (a) — API-key path still works (isAvailable returns true with stub Redis API key)
PASS Test (b) — subscription mode throws with mode=subscription-required + verbatim D-39-05 message
PASS Test (c) — no-creds api-key mode throws with mode=no-credentials + verbatim D-39-05 message
All claude.test.ts tests passed (3/3)
PASS no-authtoken-regression — claude.ts contains zero `authToken:` occurrences
All no-authtoken-regression.test.ts tests passed (1/1)
PASS sdk-agent-runner.ts integrity verified (SHA: 4f868d318abff71f8c8bfbcf443b2393a553018b)
All sdk-agent-runner-integrity.test.ts tests passed (1/1)

# test:phase40 chained:
PASS Test 1 — sdk-agent-runner.ts HOME line honors this.config.homeOverride
PASS Test 2 — sdk-agent-runner.ts contains "homeOverride" exactly once
PASS Test 3 — agent.ts AgentConfig has optional homeOverride?: string
PASS Test 4 — agent.ts homeOverride has JSDoc above it
All sdk-agent-runner-home-override.test.ts tests passed (4/4)

# test:phase41 chained:
PASS Test 1: valid header → homeOverride set
PASS Test 2: absent header → homeOverride undefined (byte-identical pre-Phase-41)
PASS Test 3: array-valued header rejected
PASS Test 4: path-traversal header rejected
PASS Test 5: empty header rejected
PASS Test 6: LIVOS_DATA_DIR override honored
PASS Test 7: api.ts source contains all required Phase 41 wiring
All api-home-override.test.ts tests passed (7/7)

# (test:phase42, 43, 44 chained — no new tests, just chaining)

# Plan 45-02 integration.test.ts:
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

# Plan 45-03 common.test.ts:
PASS Test 1: 'ai.claudePerUserStartLogin' present in httpOnlyPaths
PASS Test 2: 'usage.getMine' present in httpOnlyPaths
PASS Test 3: 'usage.getAll' present in httpOnlyPaths
PASS Test 4: bare-name entries absent (namespaced convention preserved)
All common.test.ts tests passed (4/4)

# Plan 45-04 openai-sse-adapter.test.ts (this plan):
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
All openai-sse-adapter.test.ts tests passed (12/12)

# Aggregate:
Exit 0
38/38 PASS across the entire test:phase45 chain
```

**Aggregate:** 38 PASS lines, exit 0. Master gate green.

## Diff Hunks (per file)

### `livos/packages/livinityd/source/modules/livinity-broker/openai-sse-adapter.ts`

- Interface gains `usage?: {prompt_tokens; completion_tokens; total_tokens}` (with JSDoc citing B-13).
- New type alias `StreamingUsage`.
- `makeChunk(delta, finishReason, usage?)` — 3-arg; conditionally attaches usage.
- `final_answer` branch (was: writes terminal chunk + [DONE] inline) → captures `stoppedReasonHint = 'complete'`, ensures role chunk sent, returns.
- `error` branch (was: writes terminal chunk + [DONE] inline) → captures `stoppedReasonHint = 'error'`, ensures role chunk sent, returns.
- `finalize(stoppedReason?, usage?)` — 2-arg; computes `effectiveStop` from explicit param OR captured hint OR undefined; writes terminal chunk (with usage threaded) THEN `OPENAI_SSE_DONE`.

### `livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts`

- `done` event handler type assertion gains `totalInputTokens?: number` + `totalOutputTokens?: number` fields.
- `finalResult` assignment changes:
  - `totalInputTokens: 0 // ...TODO` → `totalInputTokens: typeof d.totalInputTokens === 'number' ? d.totalInputTokens : 0`
  - `totalOutputTokens: 0` → `totalOutputTokens: typeof d.totalOutputTokens === 'number' ? d.totalOutputTokens : 0`

### `livos/packages/livinityd/source/modules/livinity-broker/openai-router.ts`

- Streaming branch local var `let upstreamStoppedReason: AgentResult['stoppedReason'] | undefined` → `let streamFinalResult: AgentResult | undefined`.
- Loop body `upstreamStoppedReason = step.value?.stoppedReason` → `streamFinalResult = step.value`.
- `finally` block `adapter.finalize(upstreamStoppedReason)` → conditional 8-line block computing usage from `streamFinalResult` or falling back to no-arg `finalize()` for the degenerate path.

### `livos/packages/livinityd/source/modules/livinity-broker/openai-sse-adapter.test.ts`

- Test 3: + `adapter.finalize()` after `final_answer` event (caller-convention update).
- Test 10: + `adapter.finalize()` after `error` event.
- + Test 11 (15 lines): wire-order assertion + usage values check.
- + Test 12 (12 lines): degenerate zero-token still-PRESENT check.
- Final log: `(10/10)` → `(12/12)`.

### `nexus/packages/core/package.json`

- Comma added after `"test:phase44": "npm run test:phase43"`.
- + `"test:phase45": "npm run test:phase44 && tsx ../../../livos/.../integration.test.ts && tsx ../../../livos/.../common.test.ts && tsx ../../../livos/.../openai-sse-adapter.test.ts"`.

## Sacred File State

`nexus/packages/core/src/sdk-agent-runner.ts`:
- SHA at HEAD~1: `4f868d318abff71f8c8bfbcf443b2393a553018b` (set by 45-01)
- SHA at HEAD: `4f868d318abff71f8c8bfbcf443b2393a553018b` (UNCHANGED)
- `git diff --shortstat HEAD~1 HEAD -- nexus/packages/core/src/sdk-agent-runner.ts` returns empty.
- Wave 2 isolation contract upheld through Plan 04 (45-01 + 45-02 + 45-03 + 45-04 all left sacred file byte-identical at SHA `4f868d31...`).

## Deviations from Plan

None — plan executed exactly as written. The plan's explicit "Option A vs Option B" decision (defer terminal emission to `finalize()` vs extend AgentEvent type) was decided in the plan; this executor took Option A as instructed.

The plan's hint that `openai-router.ts` streaming branch had only `upstreamStoppedReason` (and might need a wider `finalResult` capture) was correct — refactored from `let upstreamStoppedReason: ... | undefined` to `let streamFinalResult: AgentResult | undefined`. Variable naming distinguishes from the sync branch's `finalResult` to avoid shadowing.

## Authentication Gates

None hit during execution. All edits were local source / test / config files; no external service auth required.

## Threat Flags

None. The plan's threat register (T-45-04-01 through T-45-04-04) has all `accept` / `not-applicable` dispositions, and no NEW security-relevant surface was introduced beyond what the plan declared.

## Known Stubs

None. All wired paths emit real data when upstream provides it (with backward-compatible 0 fallback for older nexus builds).

## Deferred Items

- **Verbatim openai Python SDK smoke test** (FR-CF-04 success criteria #5) — DEFERRED to UAT on the Mini PC (per pitfall W-20: live-network OpenAI SDK round-trip needs the deployed broker). This plan covers wire-format compliance + token plumbing in unit tests. The Phase 42 `42-UAT.md` already includes the openai Python SDK smoke test as one of its 9 sections; that UAT becomes the FR-CF-04 verification path post-deploy.

## TDD Gate Compliance

This plan was authored with `tdd="true"` on Tasks 1-3, but the test extension (Task 4) was authored separately with `tdd="false"` because the test file already existed and Tasks 1-3 modify production code in ways that can be unit-tested through the existing harness. The pattern followed:

1. **Source edits first** (Tasks 1, 2, 3) — production-code changes landed.
2. **Test extension** (Task 4) — Tests 11 + 12 added to assert the new behavior; Tests 3 + 10 updated for the new caller-convention.
3. **Master gate** (Task 5) — `test:phase45` script chains everything together.

This is NOT pure RED-GREEN-REFACTOR but is the established broker-module convention (extending an existing test file alongside the source change). Tests 11 + 12 are NEW assertions that would have failed against the pre-edit source — verified empirically by the test runner (the wire-order assertion `usageIdx < doneIdx` cannot be satisfied without the deferred-emission refactor in Task 1).

## Self-Check

- [x] `livos/packages/livinityd/source/modules/livinity-broker/openai-sse-adapter.ts` — modified, verified `usage?:`, `StreamingUsage`, `stoppedReasonHint`, 3-arg makeChunk, 2-arg finalize all present.
- [x] `livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts` — modified, verified `typeof d.totalInputTokens === 'number'` pattern present.
- [x] `livos/packages/livinityd/source/modules/livinity-broker/openai-router.ts` — modified, verified `prompt_tokens: promptTokens` + `total_tokens: promptTokens + completionTokens` present.
- [x] `livos/packages/livinityd/source/modules/livinity-broker/openai-sse-adapter.test.ts` — modified, verified Tests 11 + 12 + (12/12) log + wire-order assertion present.
- [x] `nexus/packages/core/package.json` — modified, verified `test:phase45` script chains test:phase44 + 3 broker test files.
- [x] Source commit `c6061f76` exists in `git log --oneline`.
- [x] Sacred file untouched: `git diff --shortstat c6061f76^ c6061f76 -- nexus/packages/core/src/sdk-agent-runner.ts` is empty.
- [x] `npm run test:phase45` exits 0 with 38/38 PASS.

## Self-Check: PASSED
