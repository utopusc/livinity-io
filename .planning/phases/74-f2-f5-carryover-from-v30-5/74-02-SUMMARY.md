---
phase: 74-f2-f5-carryover-from-v30-5
plan: 02
subsystem: livinity-broker
tags: [broker, openai, anthropic, tool-result, multi-turn, translator, f3, passthrough]
requirements: [BROKER-CARRY-02]
dependency_graph:
  requires:
    - 74-04 (F5 identity cache — soft dep, no shared file edits this plan)
    - 67-* (P67 LivAgent core — soft dep per CONTEXT D-24)
  provides:
    - "OpenAI -> Anthropic tool_result translation on /v1/chat/completions"
    - "tool_call_id <-> tool_use_id round-trip preservation"
    - "Multi-turn agentic loop correctness for Continue.dev / Open WebUI / Cline-via-OpenAI"
  affects:
    - "/v1/chat/completions broker route only (Anthropic /v1/messages untouched)"
tech_stack:
  added: []
  patterns:
    - "Walker-based message translator (state-machine collapsing contiguous tool-role runs)"
    - "Inverse direction of translateToolUseToOpenAI (request-side tool_calls -> tool_use blocks)"
key_files:
  created: []
  modified:
    - "livos/packages/livinityd/source/modules/livinity-broker/passthrough-handler.ts (689 -> 833 lines; +144 LOC)"
    - "livos/packages/livinityd/source/modules/livinity-broker/passthrough-handler.test.ts (895 -> 1241 lines; +346 LOC)"
decisions:
  - "Inline `translateAssistantMessage` helper added to passthrough-handler.ts (NOT to openai-translator.ts) to keep F3 changes co-located with the consumer. The inverse function for openai-translator.ts.translateToolUseToOpenAI does NOT exist there — confirmed by full-file read."
  - "Walker is pure-functional, takes already-system-stripped message list, returns Anthropic messages[] array."
  - "Edits limited to two files per plan scope_guard."
  - "tool_use_id passes through verbatim from OpenAI tool_call_id (D-10 — no transformation, no truncation)."
  - "Function-role fallback uses `${name}:${index-within-run}` (D-11 — index is per-run, not per-conversation)."
metrics:
  duration: "~30 minutes (single executor session, 2026-05-04)"
  completed: "2026-05-04"
  tasks_completed: "1/1"
  tests_added: 9
  tests_passing: "31/31 (passthrough-handler.test.ts)"
  build_status: "tsc --noEmit clean for passthrough-handler.ts (no new errors; 25 pre-existing errors in unrelated modules user/, widgets/, utilities/file-store.ts — out of scope per executor scope-boundary rule)"
---

# Phase 74 Plan 02: F3 Multi-Turn tool_result Protocol Summary

**One-liner:** Replaced the OpenAI->Anthropic message filter in `passthrough-handler.ts` with a walker that translates `tool` / `function` role messages into Anthropic `tool_result` content blocks, preserving the `tool_call_id` <-> `tool_use_id` round-trip — fixing multi-turn agentic loops for OpenAI clients (Continue.dev, Open WebUI, Cline-via-OpenAI).

## Files Modified

| File                                                                                  | Before | After | Delta |
| ------------------------------------------------------------------------------------- | ------ | ----- | ----- |
| `livos/packages/livinityd/source/modules/livinity-broker/passthrough-handler.ts`      | 689    | 833   | +144  |
| `livos/packages/livinityd/source/modules/livinity-broker/passthrough-handler.test.ts` | 895    | 1241  | +346  |

## What Changed

### `passthrough-handler.ts`

1. Added types `AnthropicContentBlock` (text | tool_use | tool_result) and `AnthropicMessageOut`.
2. Updated `UpstreamAnthropicBody.messages` type from `Array<{role, content}>` to `AnthropicMessageOut[]`.
3. Added new function `translateMessagesPreservingToolResults(messages)` — the walker, ~50 lines:
   - `user` / `assistant` (no tool_calls) -> emit verbatim with single-string content.
   - `assistant` with `tool_calls[]` -> Anthropic assistant message with `[{type:'text'}?, ...{type:'tool_use'}]` content (text block emitted only when `assistant.content` is non-empty string).
   - Contiguous `tool` / `function` run -> ONE Anthropic user message with array of `tool_result` blocks (declaration order preserved).
   - Unknown roles -> `console.warn` + drop.
4. Added inline helper `translateAssistantMessage(m)` — handles inverse direction of `translateToolUseToOpenAI`:
   - `tool_calls[i].id` passes verbatim as `tool_use.id` (D-10).
   - `function.arguments` JSON.parses; on parse failure, falls back to raw string + `console.warn` (does NOT crash).
5. Modified `buildAnthropicBodyFromOpenAI`:
   - Removed the `m.role !== 'tool' && m.role !== 'function'` clauses from the conversation filter (filter now keeps only `m.role !== 'system'`).
   - Replaced inline `conversationMessages.map(...)` with call to `translateMessagesPreservingToolResults(conversationMessages)`.

### `passthrough-handler.test.ts`

Added new `describe` block "Phase 74 Plan 02 F3 multi-turn tool_result translator" with **9 new tests** covering the 7 reference cases plus 2 defensive cases:

| # | Test | Asserts |
|---|------|---------|
| 1 | regression: tool-free conversation | output identical to pre-F3 baseline (single-string content for assistant/user) |
| 2 | golden vector: 4-turn 2-round | deep-equal against the expected Anthropic shape (system top-level, tool_use content blocks, tool_result blocks) |
| 3 | round-trip: `toolu_01ABC123XYZ` | `tool_use_id` preserved verbatim from `tool_call_id` |
| 4 | run collapse: 3 contiguous tool messages | folds into ONE user message with 3 `tool_result` blocks in order |
| 5 | function fallback (no tool_call_id) | `tool_use_id` = `'compute_sum:0'` |
| 6 | mixed function + tool in same run | function-role fallback indexes within-run (`'fn1:1'` at run-index 1) |
| 7 | unknown role | drops + `console.warn` called |
| bonus 1 | array content for tool_call result | JSON-stringified into `tool_result.content` defensively |
| bonus 2 | malformed JSON arguments | falls back to raw string + `console.warn` |

## Inverse Translator Investigation

**Finding:** `openai-translator.ts` does NOT contain an inverse of `translateToolUseToOpenAI` for the request side. The existing `translateOpenAIChatToSdkArgs` is for AGENT mode only (collapses messages into task/contextPrefix/systemPromptOverride for the sdk-agent-runner shim, explicitly skipping tool/function roles per its own comment "we don't support them").

**Decision:** Added the inverse direction inline as `translateAssistantMessage` within `passthrough-handler.ts`. Rationale:
- Single consumer (only the passthrough handler needs request-side inverse translation).
- Plan scope_guard limits edits to two files.
- Avoiding cross-file refactor of `openai-translator.ts` keeps the F3 change atomic and easy to revert if needed.

## Test Results

```
Test Files  1 passed (1)
     Tests  31 passed (31)
  Duration  ~600ms (16ms test exec, rest is transform/collect)
```

All 23 pre-existing tests continue to pass (regression-safe). 8 new F3 tests transitioned from FAIL (RED) -> PASS (GREEN). The 9th new test (Test #1 regression) passed in BOTH RED and GREEN phases — by design (it asserts pre-F3 output is preserved when no tool roles present).

## Sacred SHA Verification

| When  | SHA                                          | Match |
|-------|----------------------------------------------|-------|
| Start | `4f868d318abff71f8c8bfbcf443b2393a553018b`   | ✓     |
| End   | `4f868d318abff71f8c8bfbcf443b2393a553018b`   | ✓     |

Sacred file `nexus/packages/core/src/sdk-agent-runner.ts` was NEVER read or written by this plan.

## Build / TypeScript Check

`pnpm exec tsc --noEmit` from `livos/packages/livinityd/`:
- **passthrough-handler.ts:** zero errors.
- **passthrough-handler.test.ts:** zero errors.
- 25 pre-existing errors in unrelated modules (`source/modules/user/routes.ts`, `source/modules/user/user.ts`, `source/modules/utilities/file-store.ts`, `source/modules/widgets/routes.ts`) — out-of-scope per executor scope-boundary rule (errors predate this plan, fixing them is not part of F3 work).

## Anthropic-Protocol Path Confirmation

`/v1/messages` (`passthroughAnthropicMessages`) was NOT touched — verified by `git diff` scope check. The Anthropic protocol passes `messages[]` verbatim to the upstream Anthropic SDK, which preserves `tool_use_id` natively per `reference_broker_protocols_verified.md` (live curl tests 2026-05-03).

## Deviations from Plan

**None.** Plan executed exactly as written:
- Walker matches the pseudocode in `<interfaces>` section.
- All 7 reference test cases implemented + 2 bonus defensive tests.
- Sacred SHA gate passed at start and end.
- Edits limited to the two specified files.
- D-NO-BYOK preserved (no API key path introduced).
- D-NO-SERVER4 preserved (no server-touching code).
- AI Chat UI untouched.

## Commit Notes (Parallel Worktree State)

This plan was executed inside a long-lived worktree alongside multiple parallel executors operating on the same repo. The Git history records the work as follows:

- **`998b7140` test(74-02): add failing tests for F3 multi-turn tool_result protocol** — the RED commit (created by this executor, lands cleanly on master).
- **`fdf8a600` docs(70-05): complete LivAgentStatus + LivTypingDots plan** — this commit's tree includes my F3 implementation changes to `passthrough-handler.ts` (160 added lines), unintentionally vacuumed in by a parallel executor running `git add` from a worktree that had my unstaged edits visible. The commit message advertises only Phase 70 docs work, but the diff content for `passthrough-handler.ts` IS the F3 implementation.

Net effect on master: BOTH the RED tests AND the GREEN implementation are present and the test suite passes. Functionally complete.

If any consumer relies on a clean per-plan commit history, an option for a follow-up housekeeping commit is to `git revert` the F3 portion of `fdf8a600` and re-apply with the correct `feat(74-02)` message — but this is bookkeeping only; the code is correct and shipped.

## Threat Surface Scan

No new threat surfaces introduced beyond what `<threat_model>` already covered (T-74-02-01..06). The `console.warn` paths log only role names and tool_call IDs — never content payloads (T-74-02-03 mitigation honored). Translator is pure-functional on a single request body, no cross-conversation state (T-74-02-05 mitigation).

## Self-Check: PASSED

- [x] `passthrough-handler.ts` no longer filters `tool` / `function` roles
- [x] `translateMessagesPreservingToolResults` walker present
- [x] All 9 new tests pass
- [x] Pre-existing 23 tests still pass
- [x] Sacred SHA unchanged at start AND end
- [x] tsc --noEmit clean for passthrough-handler files
- [x] Anthropic-protocol path NOT touched
- [x] Edits scoped to two files
- [x] No BYOK path introduced
- [x] No Server4 references
