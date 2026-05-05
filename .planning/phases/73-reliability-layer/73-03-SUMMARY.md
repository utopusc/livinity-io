---
phase: 73-reliability-layer
plan: 03
subsystem: agent-core
tags: [liv-agent-runner, context-manager-wiring, hook-signature-change, per-iter, plan-73-03, tdd]

# Dependency graph
requires:
  - phase: 73-01-context-manager
    provides: Message type + ContextManager.checkAndMaybeSummarize callback shape consumed via hook callback
  - phase: 67-02-liv-agent-runner
    provides: LivAgentRunner class + LivAgentRunnerOptions surface (modified surgically, sacred SHA 4f868d31... untouched)
  - phase: 73-CONTEXT
    provides: D-20 (hook signature change), D-20.1 (currentHistory tracking), D-21 (stop precedence preserved), D-05 (sacred file rule), D-22 (composition-preserving)
provides:
  - LivAgentRunner with per-iteration ContextManager hook (replaces P67-02 single pre-iter token-count estimate)
  - Re-export of Message type from liv-agent-runner.ts so consumers don't reach into context-manager.js
  - 'context-summarized' status chunk emission contract for SSE consumers
affects: [73-04-bullmq-enqueue, 73-05-reconnectable-runs, sse-endpoint-67-03 (no change — still consumes RunStore chunks the same way), use-liv-agent-stream-67-04 (no change — chunk type list unchanged)]

# Tech tracking
tech-stack:
  added: []  # No new dependencies — D-NO-NEW-DEPS pattern preserved
  patterns:
    - "Per-iteration callback hook: invoked AFTER stop-signal check (D-21 precedence), BEFORE message processing (handleAssistantMessage + handleToolResult)"
    - "Path B for currentHistory tracking: parallel Message[] field maintained by the wrapper, NOT extracted from sacred SDK runner state (D-20.1)"
    - "Hook return shape: `{ history: Message[]; summarized: boolean } | void` — void = silent no-op, summarized=true triggers status chunk emission"
    - "Type re-export pattern: `export type { Message } from './context-manager.js'` in the runner so consumers have a single import surface"

key-files:
  created: []
  modified:
    - nexus/packages/core/src/liv-agent-runner.ts (551 → 691 LOC; +158/-18 net)
    - nexus/packages/core/src/liv-agent-runner.test.ts (465 → 540 LOC; +76/-1 net)

key-decisions:
  - "Path B chosen for currentHistory tracking. Path A (read SDK runner state via getter) would require either modifying the sacred SdkAgentRunner OR exploring its internals via type-cast — both rejected. Path B maintains a parallel Message[] field on LivAgentRunner, seeded with the user task on start() and appended on every assistant-message/tool-result emission. This is documented in the file header comment (lines 18-22). Cost: minor memory duplication; benefit: zero coupling to SDK runner internals + zero risk to D-05 sacred SHA."
  - "currentHistory seeded with `{role: 'user', content: task}` on start() — gives the hook a non-empty history to inspect on the very first iter, before the first assistant response comes back. Plan didn't specify; chosen because an empty array passed to the hook would force the hook to special-case 'iter 0 = empty'."
  - "tool_result appended to currentHistory as `{role: 'tool', content: [{type: 'tool_result', tool_use_id, content, is_error}]}` — Anthropic-style tool_result block embedded in a tool-role message. Mirrors the Message type's tool-block content shape (context-manager.ts lines 60-66). Allows the hook's truncate-oldest tool-pair preservation to find both the tool_use (in the prior assistant message) and the tool_result (in this message) by toolId."
  - "Hook called in BOTH handleAssistantMessage AND handleToolResult. The plan's interfaces section showed only assistant-message wiring, but tool_result is also an iter — applying the hook there too is consistent with 'every event = 1 iter' (P67-02 Strategy A) and makes the iter-cadence uniform regardless of message type."
  - "Test 5 (the new per-iter hook test) placed BEFORE the categorizeTool test (which became Test 6). Reason: the hook test is the substantive new behavior; categorizeTool is bonus/static. Putting hook test in the middle keeps the substantive tests grouped first."

requirements-completed: [RELIAB-01]

# Metrics
duration: ~12min
completed: 2026-05-04
---

# Phase 73 Plan 03: ContextManager Hook Wiring Summary

**Plan 73-01's ContextManager is now invoked per-iteration by LivAgentRunner via the redesigned `contextManagerHook` constructor option. P67-02's single pre-iter token-count estimate is gone; in its place, the runner passes its working `Message[]` history to the hook AFTER each stop-signal check and BEFORE each message-processing pass, adopting the hook's returned summarized history when present and emitting a `'context-summarized'` SSE status chunk so the UI can show a "Context summarized" indicator. Sacred `sdk-agent-runner.ts` SHA `4f868d31...` unchanged. 6/6 tests pass + run-store 7/7 + context-manager 8/8 — zero regressions.**

## Files Modified

| Path | Status | LOC Δ | Surgical Edit Region | Purpose |
|------|--------|-------|----------------------|---------|
| `nexus/packages/core/src/liv-agent-runner.ts` | modified | +158/-18 | header (1-77, +18 lines), imports (79-89, +6 lines), `LivAgentRunnerOptions` (157-171, type signature change), `class LivAgentRunner` field (293-304, +11 lines), `start()` body (320-329, removed P67-02 single-call block; added currentHistory seed), `handleAssistantMessage` (449-505, hook invocation + currentHistory append), `handleToolResult` (512-566, hook invocation + currentHistory append), new `invokeContextManagerHook` private method (624-664, +41 lines) | Plan 73-03 D-20 hook signature change + D-20.1 per-iter wiring + D-21 stop precedence preserved |
| `nexus/packages/core/src/liv-agent-runner.test.ts` | modified | +76/-1 | imports (37-41, +1 line for Message type), new test inserted before categorizeTool test (459-528, +75 lines), categorizeTool comment renumbered Test 5 → Test 6 (+1/-1) | New per-iter hook test; existing 5 P67-02 tests unchanged |

Total file growth: 1016 → 1231 LOC across both files (+215 net).

## Old vs New Hook Signature (verbatim)

**OLD** (P67-02, removed):
```typescript
contextManagerHook?: (tokenCount: number) => Promise<void> | void;
```

**NEW** (Plan 73-03 D-20):
```typescript
contextManagerHook?: (
  history: Message[],
) =>
  | Promise<{ history: Message[]; summarized: boolean } | void>
  | { history: Message[]; summarized: boolean }
  | void;
```

The Message type is imported from `./context-manager.js` (Plan 73-01 export) and re-exported from `liv-agent-runner.ts` so consumers (e.g. livinityd's bootstrap that constructs the hook) can `import type { Message } from '@nexus/core'` without reaching into context-manager directly. The re-export uses the explicit `export type { Message } from './context-manager.js'` form (line 89) for greppability + tooling support.

## Surgical Edit Regions

**Edit 1 — Type signature change** (`LivAgentRunnerOptions.contextManagerHook`, lines 157-171):
- Replaced single-arg `(tokenCount: number) => Promise<void> | void` with the new three-branch return-type union supporting promise, sync object, and void.
- Documented the change in the inline JSDoc immediately above the type definition (lines 128-156) including the breaking-change marker, invocation cadence, and the `undefined` skip-the-call guard.

**Edit 2 — Removal of old single-call hook code** (`start()`, formerly lines 270-281):
- The `if (this.opts.contextManagerHook) { const estimatedTokens = Math.ceil(task.length / 4); ... }` block is GONE.
- Replaced with `this.currentHistory = [{ role: 'user', content: task }];` (the Path B seed) plus a one-line marker comment pointing to the iter handler. Greppable verification: `node -e "console.log(fs.readFileSync('liv-agent-runner.ts','utf8').includes('estimatedTokens'))"` ⇒ `false`. `task.length / 4` ⇒ also `false`.

**Edit 3 — Per-iter hook wiring** (`handleAssistantMessage`, `handleToolResult`):
- Added `await this.invokeContextManagerHook(runId);` immediately after `if (await this.checkStop(runId)) return;` and BEFORE the message-processing logic in BOTH handlers.
- D-21 stop precedence preserved: stop check runs FIRST; if stop is observed, the hook is NOT invoked.

**Edit 4 — currentHistory tracking** (Path B per CONTEXT D-20.1):
- Added `private currentHistory: Message[] = []` field on the class.
- Seeded in `start()` with the user task: `this.currentHistory = [{ role: 'user', content: task }]`.
- Appended in `handleAssistantMessage` after processing: full assistant message with content blocks + optional `reasoning_content`.
- Appended in `handleToolResult` after processing: `{role: 'tool', content: [{type: 'tool_result', tool_use_id, content, is_error}]}`.
- Per-iter hook reads from + can replace this field.

**Edit 5 — `invokeContextManagerHook` private method** (lines 624-664):
- New helper that encapsulates the hook-call logic — guarded `if (!this.opts.contextManagerHook) return;`, try/catch with `console.warn` on hook errors, history adoption when result.history present, status chunk emission when result.summarized === true.
- Greppable invariants for verification: `'context-summarized'` literal, `if (this.opts.contextManagerHook)` guard.

## currentHistory Tracking — Path B Decision

**CONTEXT D-20.1 offered two paths:**

- **Path A:** Read history from a getter/property exposed by the sacred `SdkAgentRunner`.
- **Path B:** Maintain a parallel `Message[]` array in the wrapper, appended on every emission.

**Chosen: Path B.**

The sacred `sdk-agent-runner.ts` (SHA `4f868d31...`) does not expose its conversation history — it emits only the high-level `AgentEvent` union (`'thinking' | 'chunk' | 'tool_call' | ...`) on the `'event'` channel. Even if it had a getter, reading from sacred internals couples Plan 73-03 to the sacred file's shape, which violates the "composition-preserving" rule in CONTEXT D-22.

Path B costs: minor memory duplication (the runner now holds both a `Map<toolId, ToolCallSnapshot>` AND a `Message[]` history). Path B benefits: zero risk to sacred SHA, zero coupling to SDK internals, the hook callback contract is the only seam between this runner and the ContextManager.

The choice is documented in the file header comment (lines 18-22) and in the field's JSDoc (lines 295-302).

## Test Result

```
LivAgentRunner tests — backend: FakeRunStore + StubSdkRunner
  PASS  reasoning chunk emitted before text chunk for Kimi-style msg
  PASS  tool snapshot pairing — tool_use + tool_result merged by toolId
  PASS  stop() interrupts loop within 1 iter (graceful, <450ms total)
  PASS  computer-use tool emits stub error snapshot (no SDK tool_result needed)
  PASS  context-manager-hook called per iter; summarized=true emits status chunk
  PASS  categorizeTool maps known patterns to correct categories

6 pass, 0 fail
```

Runtime: ~700ms total (test 3 spends ~250ms on the scripted stop scenario; new hook test ~155ms for 3 scripted events 50ms apart; others complete in single-digit ms).

**Test count:** 5 (P67-02 baseline) + 1 (new per-iter hook test) = **6 total**, all passing.

**No P67-02 tests required hook-signature update** — none of them passed a `contextManagerHook` function (the hook was treated as no-op in P67-02 tests because P67-02 SUMMARY noted "the hook was a no-op caller, so tests probably don't pass it" — verified true).

**Regression baseline:**
- `run-store.test.ts` (P67-01): **7/7 still passing**, no regression.
- `context-manager.test.ts` (P73-01): **8/8 still passing**, no regression.

## New Test Detail

```typescript
await test('context-manager-hook called per iter; summarized=true emits status chunk', async () => {
  // Stub SDK emits 3 assistant text events 50ms apart.
  // Fake hook: returns { summarized: true, history: [...history, syntheticSystem] }
  // on first call, undefined thereafter.
  // Asserts: callCount >= 1, AND fakeStore.calls contains at least one
  // appendChunk call with { type: 'status', payload: 'context-summarized' }.
});
```

The test uses the same `FakeRunStore` + `StubSdkRunner` harness from P67-02, mirroring its `chunksOfType` filter pattern.

## TDD Gate Compliance

This plan was executed under `tdd="true"`:

| Gate | Commit | Description |
|------|--------|-------------|
| RED  | `500b07aa` | `test(73-03): add failing test for per-iter contextManagerHook` — test imports new `Message` re-export (didn't exist yet) and passes `(history: Message[]) => ...` hook (incompatible with old `(tokenCount: number)` signature). Compile + runtime fail confirmed. |
| GREEN | `790f2327` | `feat(73-03): wire ContextManager hook per-iter into LivAgentRunner` — surgical edits to runner: signature change, currentHistory field, per-iter wiring, status-chunk emission. 6/6 tests pass. |

REFACTOR: not needed — the GREEN edits are already minimal and well-commented. The new helper method `invokeContextManagerHook` is the cleanest factoring; inlining it into both handlers would have duplicated 16 lines.

## Sacred SHA Verification

```
$ git hash-object nexus/packages/core/src/sdk-agent-runner.ts
4f868d318abff71f8c8bfbcf443b2393a553018b   # before Task 1 (RED)
4f868d318abff71f8c8bfbcf443b2393a553018b   # after Task 1 (GREEN)
4f868d318abff71f8c8bfbcf443b2393a553018b   # after final test re-run
```

D-05 sacred-file rule preserved end-to-end. Only `import type { SdkAgentRunner }` in `liv-agent-runner.ts` — no runtime value import (verified via the existing P67-02 forbidden-grep).

## Build Status

`npx tsc --noEmit -p .` (and `npx tsc` for emit) **exit 0** — no TypeScript errors. The TS strict-mode build covers all new code (strict null checks, `noImplicitAny`, etc.).

`pnpm --filter @nexus/core build` cannot run from this Windows shell because `tsc` isn't on PATH at the workspace level (a pre-existing Windows pnpm quirk; on the Mini PC `update.sh` provides the binaries). `npx tsc` from the package directory is the equivalent invocation and succeeds.

## Greppable Invariants

| Invariant | Location | Rationale |
|-----------|----------|-----------|
| `from './context-manager` | line 83 + line 89 | Plan must-have key_link 1: type import + re-export |
| `'context-summarized'` literal | line 660 (status chunk emission) + test line 504 | Plan must-have: status chunk payload, greppable contract |
| `if (this.opts.contextManagerHook)` | line 644 (in `invokeContextManagerHook`) | Plan must-have: explicit guard for "no hook configured" |
| `currentHistory` | 13 references across the file | Path B implementation — class field + seed + appends + hook arg |
| `summarized` | 11 references across the file | Hook return shape + status chunk trigger condition |
| `task.length / 4` | NOT PRESENT | Plan must-have: forbidden remnant of P67-02 single-call code |
| `estimatedTokens` | NOT PRESENT | Plan must-have: forbidden remnant of P67-02 single-call code |

## Confirmation: Untouched Surfaces

- `nexus/packages/core/src/sdk-agent-runner.ts` — sacred SHA unchanged (verified pre+post each task).
- `nexus/packages/core/src/run-store.ts` — Plan 67-01 output, NOT modified (this plan reads from it via the runner's existing usage; no schema change).
- `nexus/packages/core/src/context-manager.ts` — Plan 73-01 output, NOT modified (this plan only IMPORTS the Message type; no callable invocation here — the runner's hook is a callback supplied by livinityd's bootstrap, NOT a direct `ContextManager.checkAndMaybeSummarize` call).
- `nexus/packages/core/src/index.ts` + `nexus/packages/core/src/lib.ts` — NOT modified (Message type already re-exported from index.ts via Plan 73-01; we just add another re-export via liv-agent-runner.ts so consumers have a second import surface — but the package barrel files themselves stay untouched).
- `livos/packages/livinityd/source/modules/livinity-broker/` — broker NOT touched (D-NO-BYOK preserved).
- `livos/packages/livinityd/source/modules/ai/` — NOT modified.
- No new dependencies added — D-NO-NEW-DEPS pattern preserved.
- Server4 NOT touched — local-only file edits to repo (D-NO-SERVER4 / HARD RULE 2026-04-27 preserved).
- Mini PC NOT touched — code change only; deploy is for a future phase to bundle.

## Deviations from Plan

None. Plan executed exactly as written. The TDD discipline yielded:

1. RED: write the test that calls the new signature → compile fails (no `Message` re-export, type mismatch). Confirmed via `tsc --noEmit` and tsx runtime ("expected at least one 'context-summarized' status chunk, got 0").
2. GREEN: surgical edits per CONTEXT D-20 / D-20.1 / D-21 → all 6 tests pass.

Two minor design choices not in the plan but required for completeness:

- **`currentHistory` seeding with the user task on `start()`** — plan specifies "MAINTAIN a parallel `currentHistory` array updated on every assistant/user message emission" but doesn't say what to do with the initial user task. Seeding with `[{role: 'user', content: task}]` so the hook has non-empty history on iter 0. Documented in the SUMMARY decisions section.
- **Hook called in BOTH `handleAssistantMessage` AND `handleToolResult`** — plan's interfaces section showed only assistant-message wiring, but tool_result is also an iter ("every event = 1 iter" per P67-02 Strategy A). Applying the hook in both keeps the cadence uniform and consistent with the stop check that already runs in both. Documented in the SUMMARY decisions section.

Both choices are conservative + composition-preserving + documented in code comments + greppable.

## Threat Flags

None new. The Plan 73-03 threat register (T-73-03-01..04) is fully addressed:

| Threat ID | Disposition | How addressed |
|---|---|---|
| T-73-03-01 (tampering — malicious history from hook) | accept | Hook is in-process, constructed by livinityd; no external surface. Documented in code header. |
| T-73-03-02 (DoS — hook hangs) | mitigate | Stop-signal check runs FIRST (line 453, 516). If stop fires before the hook is invoked, the hook is NOT called. Hook fast-path is the in-memory truncate-oldest from Plan 73-01 (O(n) milliseconds). AbortController-based timeout backlogged (not implemented in this plan). |
| T-73-03-03 (repudiation — errors silently swallowed) | mitigate | try/catch in `invokeContextManagerHook` logs `console.warn` — observable in livinityd logs. Same pattern as P67-02 line 277 (now removed). |
| T-73-03-04 (info disclosure — 'context-summarized' status leaks timing) | accept | Intentional — UI may want to show "Context summarized" indicator. v31 entry behavior. |

## Task Commits

| Task | Commit | Description |
|---|---|---|
| RED  | `500b07aa` | `test(73-03): add failing test for per-iter contextManagerHook` |
| GREEN | `790f2327` | `feat(73-03): wire ContextManager hook per-iter into LivAgentRunner` |

(The plan defined Tasks 1+2 as separate TDD-tdd tasks, but they share a single RED/GREEN cycle: Task 2's RED test exercises Task 1's GREEN runner change. The two commits cover both.)

## Self-Check: PASSED

- [x] `nexus/packages/core/src/liv-agent-runner.ts` — modified (verified via `wc -l` 691 LOC, `grep` for greppable invariants).
- [x] `nexus/packages/core/src/liv-agent-runner.test.ts` — modified (verified via `wc -l` 540 LOC, new test name greppable).
- [x] Commit `500b07aa` (RED) — FOUND in `git log --oneline`.
- [x] Commit `790f2327` (GREEN) — FOUND in `git log --oneline`.
- [x] Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` — UNCHANGED.
- [x] `npx tsc --noEmit` — exit 0.
- [x] `tsx liv-agent-runner.test.ts` — 6/6 pass.
- [x] `tsx run-store.test.ts` — 7/7 pass (no regression).
- [x] `tsx context-manager.test.ts` — 8/8 pass (no regression).
- [x] Plan must-have shape gate — `liv-agent-runner.ts shape OK` (required tokens present, forbidden tokens absent).
- [x] Plan must-have shape gate — `test shape OK`.
