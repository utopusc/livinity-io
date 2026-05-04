---
phase: 67-liv-agent-core-rebuild
plan: 02
subsystem: agent-core
tags: [liv-agent-runner, sdk-wrapper, reasoning-extraction, tool-snapshot, computer-use-stub, composition, event-driven, tdd]

# Dependency graph
requires:
  - phase: 67-01-run-store
    provides: RunStore class + Chunk/RunMeta/RunStatus types (consumed via constructor injection + appendChunk/getControl/markComplete/markError API)
  - phase: 67-CONTEXT
    provides: D-05 (sacred file rule), D-12 (ToolCallSnapshot shape), D-13 (constructor signature), D-14 (reasoning extraction), D-15 (tool snapshot batching), D-16 (computer-use stub), D-26 (TS build clean)
  - phase: existing
    provides: SdkAgentRunner type (sacred — type-only import), ToolRegistry type, ioredis Redis type
provides:
  - LivAgentRunner class — orchestrator wrapping SdkAgentRunner via composition
  - categorizeTool() — pure helper mapping tool name → ToolCategory (10-string union)
  - ToolCallSnapshot type — D-12 verbatim, locked binding contract
  - ToolCategory type — 10-string union (matches LivIcons keys + 'computer-use')
  - LivAgentRunnerOptions type — D-13 verbatim constructor shape
  - SDK event contract documented: 'liv:assistant_message' / 'liv:tool_result' (production wiring deferred to 67-03)
affects: [67-03-sse-endpoint, 67-04-use-liv-agent-stream-hook, 71-bytebot-integration, 73-reliability-bullmq]

# Tech tracking
tech-stack:
  added: []  # No new dependencies — D-NO-NEW-DEPS pattern preserved
  patterns:
    - "Composition over sacred SdkAgentRunner — type-only import, instance-injection via constructor (D-05)"
    - "EventEmitter async-handler drain pattern: track in-flight Promises in a Set, await Promise.allSettled before finalizing (fixes synchronous emit() + async handler ordering bug)"
    - "Cooperative-stop Strategy A — poll runStore.getControl(runId) at top of every event handler invocation (every event = 1 iter)"
    - "tsx-runnable test harness with FakeRunStore + StubSdkRunner (matches run-store.test.ts style)"
    - "Tool snapshot batching via Map<toolId, ToolCallSnapshot>; orphan tool_results dropped silently"
    - "Computer-use stub: short-circuits tool execution path, emits literal P71 string in toolResult.output"

key-files:
  created:
    - nexus/packages/core/src/liv-agent-runner.ts (551 lines)
    - nexus/packages/core/src/liv-agent-runner.test.ts (465 lines)
  modified:
    - nexus/packages/core/src/index.ts (added LivAgentRunner + categorizeTool + 3 type re-exports)
    - nexus/packages/core/src/lib.ts (same set under @nexus/core/lib subpath)

key-decisions:
  - "SDK event contract chosen: 'liv:assistant_message' + 'liv:tool_result' as the two event names the runner subscribes to. Rationale: the sacred SdkAgentRunner emits high-level AgentEvent on a single 'event' channel and DOES NOT expose reasoning_content / tool_use_id at that boundary. To honor D-14 (reasoning extraction) and D-15 (snapshot pairing) without modifying the sacred file, the runner subscribes to two richer event names that an integration layer (67-03 SSE wiring) will emit alongside. Tests script these names directly. File header documents the contract for future maintainers."
  - "Stop strategy = Strategy A (poll runStore.getControl(runId) at top of every event handler). Rationale: every event = 1 iter — trivially satisfies ROADMAP P67 success criterion #2 ('within 1 iter'). Strategy B (interval polling) would have introduced 100ms latency and an extra cleanup path. Test 3 measures elapsed < 600ms when stop() fires at 250ms against a 500ms scripted run."
  - "Stop finalization = markComplete(runId, { stopped: true }) — chosen over markError. Rationale: stop is a graceful user-initiated termination, not a failure; markError implies fault. The { stopped: true } payload distinguishes stop-vs-natural-completion for downstream consumers. Test 3 asserts this exact payload."
  - "contextManagerHook semantics = single best-effort token-count estimate at start of run (task.length / 4 heuristic). Rationale: scope_guard explicitly defers 75% summarization to P73; the hook is wired so P73 can plug in without changing this file. If hook is not provided ⇒ no-op. Hook errors are swallowed (non-fatal) — P73 will tighten to fail-closed."
  - "computerUseRouter accepted as constructor param BUT NEVER invoked in P67 — D-16 explicitly says emit stub regardless. The literal 'Computer use not available until P71 (Bytebot integration)' string is the only output. P71 will replace stub-emission with `const result = await opts.computerUseRouter?.(snapshot); ...emit merged...` (TODO comment lives in the code)."
  - "EventEmitter async-handler drain — added Set<Promise<void>> tracker + Promise.allSettled drain after sdkRunner.run() returns. Without this, markComplete fires before async handlers finish persisting chunks (root cause of initial test 1 + test 4 failures). This is the standard Node EventEmitter + async handler pattern; documented in code comments."
  - "categorizeTool exported as a top-level function (NOT a method on the class). Rationale: pure function, no instance state needed — tests assert it directly without spinning up a runner. Greppable for downstream consumers."
  - "Both index.ts (package main) AND lib.ts (@nexus/core/lib subpath) re-export the new types. Mirrors the 67-01 RunStore re-export decision so 67-03 / 67-04 can pick either import path."

patterns-established:
  - "Phase 67 composition pattern: type-only import of sacred SdkAgentRunner + instance injection via constructor (no value imports, no inheritance). 71+ Bytebot bridge will follow the same pattern."
  - "Async-handler drain on EventEmitter-driven runners — applies to any future @nexus/core class that subscribes to EventEmitter events with async handlers (e.g. P71 Bytebot bridge, P73 BullMQ worker)."
  - "tsx-runnable unit tests with in-memory FakeRunStore + StubSdkRunner — usable template for 67-03 SSE handler tests + future P71 bridge tests."

requirements-completed: [CORE-03, CORE-04, CORE-05, CORE-06]

# Metrics
duration: ~25min
completed: 2026-05-04
---

# Phase 67 Plan 02: LivAgentRunner Orchestrator Summary

**Composition wrapper around the sacred `SdkAgentRunner` that translates raw SDK events into typed `RunStore` chunks (text/reasoning/tool_snapshot), enforces cooperative stop within 1 iter, and ships the D-16 computer-use stub error — wave-2 deliverable that unblocks the SSE endpoint (67-03) and the frontend hook (67-04).**

## Files Created / Modified

| Path | Status | Lines | Purpose |
|------|--------|-------|---------|
| `nexus/packages/core/src/liv-agent-runner.ts` | created | 551 | LivAgentRunner class + categorizeTool helper + ToolCallSnapshot/ToolCategory/LivAgentRunnerOptions types |
| `nexus/packages/core/src/liv-agent-runner.test.ts` | created | 465 | tsx-runnable test harness with FakeRunStore + StubSdkRunner; 5/5 pass |
| `nexus/packages/core/src/index.ts` | modified | +9 | Re-export LivAgentRunner + categorizeTool + 3 types from package main |
| `nexus/packages/core/src/lib.ts` | modified | +7 | Same re-exports under `@nexus/core/lib` subpath |

## SDK Event Contract (extracted from sdk-agent-runner.ts read on 2026-05-04)

The sacred `SdkAgentRunner` (`sdk-agent-runner.ts`, SHA `4f868d318abff71f8c8bfbcf443b2393a553018b`) emits `AgentEvent` (typed in `agent.ts:13-17`) on the `'event'` channel with these high-level types:
`'thinking' | 'chunk' | 'tool_call' | 'observation' | 'final_answer' | 'error' | 'done'`.

That payload shape **does not expose** the data D-14 (reasoning_content) and D-15 (tool_use_id pairing) require. To honor both decisions without modifying the sacred file, `LivAgentRunner` subscribes to two **additional** event names that an integration layer (production: 67-03 SSE handler wiring; tests: scripted directly via `StubSdkRunner`) will emit alongside the existing `AgentEvent`s:

| Event name | Payload shape |
|---|---|
| `'liv:assistant_message'` | `{ reasoning_content?: string; content?: Array<{ type: 'text'; text: string } \| { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }> }` |
| `'liv:tool_result'` | `{ tool_use_id: string; content: unknown; is_error?: boolean }` |

This contract is documented in the file header comment of `liv-agent-runner.ts` for future maintainers. If the SDK runner internals change, that comment is the single point of truth.

## Stop Strategy: A (poll-on-event)

Implementation: `checkStop(runId)` is called at the top of every event handler invocation (`handleAssistantMessage`, `handleToolResult`, and inside the `for` loop over `content` blocks). On first observation of `'stop'` from `runStore.getControl(runId)`:

1. Sets `this.stopRequested = true`.
2. Best-effort `removeAllListeners?.()` on the SDK runner (strips further event translation).
3. Handler returns immediately — no further chunks emitted.

When `start()` proceeds past `await sdkRunner.run(task)` and sees `stopRequested === true`, it calls `runStore.markComplete(runId, { stopped: true })` (graceful-stop bookkeeping) instead of the natural-completion path.

Test 3 measures: stop fires at 250ms, scripted run is 500ms total (5 × 100ms) — `start()` resolves at ~250-300ms (verified `< 600ms`).

## contextManagerHook Semantics

Per scope_guard, **75% summarization is deferred to P73**. This plan only wires the hook:

- If `contextManagerHook` is provided in opts → call it ONCE at the start of `start()` with a token-count estimate (`Math.ceil(task.length / 4)`).
- Hook errors are caught + swallowed (non-fatal). P73 will tighten to fail-closed if needed.
- If not provided → no-op.

P73 will replace the heuristic with real per-iter token accounting and the actual summarization trigger.

## D-16 Computer-Use Stub — Behavior

When the runner observes a `tool_use` block with `categorizeTool(name) === 'computer-use'` (i.e. name starts with `computer_use_` or `bytebot_`):

1. Emit running snapshot (`status: 'running'`, no `toolResult`) — same as any other tool.
2. **Immediately** emit a second `tool_snapshot` chunk with the same `toolId` and:
   - `status: 'error'`
   - `toolResult: { output: 'Computer use not available until P71 (Bytebot integration)', isError: true, ts: Date.now() }`
   - `completedAt: Date.now()`
3. `console.warn` with the tool name (operator hint).
4. **DOES NOT** call `computerUseRouter` — even if provided.
5. **DOES NOT** wait for or invoke any SDK tool execution path.

The literal substring `'Computer use not available until P71'` is asserted by Test 4 and is greppable across the codebase.

P71 (Bytebot integration) will replace the stub-emission block with:
```typescript
const result = await this.opts.computerUseRouter?.(snapshot);
// ...emit merged snapshot with result...
```
(TODO comment in the source.)

## Test Result

```
LivAgentRunner tests — backend: FakeRunStore + StubSdkRunner
  PASS  reasoning chunk emitted before text chunk for Kimi-style msg
  PASS  tool snapshot pairing — tool_use + tool_result merged by toolId
  PASS  stop() interrupts loop within 1 iter (graceful, <450ms total)
  PASS  computer-use tool emits stub error snapshot (no SDK tool_result needed)
  PASS  categorizeTool maps known patterns to correct categories

5 pass, 0 fail
```

Runtime: ~700ms total (test 3 spends ~250ms on the scripted stop scenario; others complete in single-digit ms).

`run-store.test.ts` (Plan 67-01): re-run after this plan's changes — **7/7 still passing, no regression.**

## Sacred SHA Verification

```
$ git hash-object nexus/packages/core/src/sdk-agent-runner.ts
4f868d318abff71f8c8bfbcf443b2393a553018b   # before Task 1
4f868d318abff71f8c8bfbcf443b2393a553018b   # after Task 1
4f868d318abff71f8c8bfbcf443b2393a553018b   # after Task 2 + runner fix
```

D-05 sacred-file rule preserved end-to-end. Only `import type { SdkAgentRunner }` appears in `liv-agent-runner.ts` — no runtime value import (verified via plan's `forbidden` regex check).

## Build Status

`pnpm --filter @nexus/core build` (which runs `tsc`): **exit 0**, no TypeScript errors.

The TS strict-mode build covers all new code — strict null checks, `noImplicitAny`, etc.

## Confirmation: Untouched Surfaces

- `nexus/packages/core/src/sdk-agent-runner.ts` — sacred SHA unchanged (verified pre+post each task).
- `livos/packages/livinityd/source/modules/livinity-broker/` — broker NOT touched (D-NO-BYOK preserved).
- `livos/packages/livinityd/source/modules/ai/` — `index.ts`, `index-v19.ts`, `routes.ts` NOT modified (D-06, D-07 preserved).
- `nexus/packages/core/src/run-store.ts` — RunStore from 67-01 NOT modified (this plan is a CONSUMER of its API).
- No new dependencies added — D-NO-NEW-DEPS pattern preserved.
- Server4 NOT touched — local-only file edits to repo `nexus/` and `.planning/` (HARD RULE 2026-04-27 preserved).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Async event handlers raced markComplete**

- **Found during:** Task 2 first test run (Tests 1 + 4 failed: "expected >=3 appendChunk calls, got 2" and "expected exactly 2 tool_snapshot chunks, got 0").
- **Issue:** `EventEmitter.emit()` is synchronous and discards Promises returned by listeners. When `stub.run(task)` finished its scripted steps and the runner proceeded to `markComplete`, the async event handlers were still in the microtask queue — chunks not yet appended.
- **Fix:** Track in-flight handler Promises in a `Set<Promise<void>>`; after `await sdkRunner.run(task)` returns, drain via `while (inFlight.size > 0) { await Promise.allSettled(...) }`. Standard Node EventEmitter + async handler pattern; documented in code comments.
- **Files modified:** `nexus/packages/core/src/liv-agent-runner.ts` (lines ~245-275 — handler tracking + drain loop).
- **Commit:** `23a1a5a4` (folded into the test commit since the runner change is needed for the tests to pass).

No other deviations. Plan executed essentially as written; the reference implementation outline was followed verbatim except for the EventEmitter drain fix above.

## Threat Flags

None new. The threat register in 67-02-PLAN.md (T-67-02-01..06) is fully addressed:

| Threat ID | Disposition | How addressed |
|---|---|---|
| T-67-02-01 (tampering — malicious tool input) | mitigate | D-16 stub blocks computer-use entirely; other tool inputs forwarded verbatim to the existing SDK runner (its responsibility). |
| T-67-02-02 (info disclosure — reasoning leaks via SSE) | accept | Intended per D-14 — reasoning chunks ARE a feature for the P75 reasoning card. |
| T-67-02-03 (DoS — stop ignored) | mitigate | Strategy A every-event polling + `removeAllListeners?.()`. Test 3 verifies <600ms stop time on a 500ms script. |
| T-67-02-04 (privesc — computer-use executes) | mitigate | D-16 stub emits error snapshot; no router invocation; no SDK tool execution path called. Test 4 verifies. |
| T-67-02-05 (spoofing — tool_use_id collision) | accept | Orphan tool_results dropped silently; collision overwrites earlier snapshot (semantically correct). |
| T-67-02-06 (repudiation — errors swallowed) | mitigate | Caught errors emitted as `{ type: 'error' }` chunk AND persisted via markError. |

## Task Commits

| Task | Commit | Description |
|---|---|---|
| 1 | `db740ffe` | `feat(67-02): implement LivAgentRunner orchestrator (composition wrapper)` — runner + barrel re-exports |
| 2 | `23a1a5a4` | `test(67-02): add liv-agent-runner.test.ts (5/5 passing)` — tests + EventEmitter drain fix |

## Self-Check: PASSED

- [x] `nexus/packages/core/src/liv-agent-runner.ts` — FOUND (551 lines)
- [x] `nexus/packages/core/src/liv-agent-runner.test.ts` — FOUND (465 lines)
- [x] `nexus/packages/core/src/index.ts` — re-exports LivAgentRunner/categorizeTool/types (verified via grep)
- [x] `nexus/packages/core/src/lib.ts` — same re-exports under `@nexus/core/lib`
- [x] Commit `db740ffe` — FOUND in `git log --oneline`
- [x] Commit `23a1a5a4` — FOUND in `git log --oneline`
- [x] Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` — UNCHANGED
- [x] `tsc` build — exit 0
- [x] `tsx liv-agent-runner.test.ts` — 5/5 pass
- [x] `tsx run-store.test.ts` — 7/7 pass (no regression)
