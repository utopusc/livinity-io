# Phase 87 — Hermes Background Runtime — SUMMARY

**Status:** COMPLETE
**Wave:** 1 (parallel with P80 + P85-schema)

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `liv/packages/core/src/lib/hermes-phrases.ts` | 42 | THINKING_VERBS (15), WAITING_VERBS (3), pickThinkingVerb(), pickWaitingVerb() |
| `liv/packages/core/src/liv-agent-runner.hermes.test.ts` | 410 | Integration tests: tests (a)-(e) for all 5 Hermes patterns |
| `liv/packages/core/src/kimi-agent-runner.repair.test.ts` | 158 | 8-case test suite covering all 4 repair passes |

## Files Modified

| File | Lines (after) | Changes |
|------|--------------|---------|
| `liv/packages/core/src/run-store.ts` | 339 | Added `'status_detail'` to `ChunkType` union |
| `liv/packages/core/src/liv-agent-runner.ts` | 835 | status_detail at 3 call sites; IterationBudget; steer drain; batchId; pickToolVerb helper |
| `liv/packages/core/src/agent-session.ts` | 912 | `livRunner?` on ActiveSession; `injectSteer()` on AgentSessionManager; `steer` variant in ClientWsMessage; `steer` case in handleMessage |
| `liv/packages/core/src/kimi-agent-runner.ts` | 553 | `_repairToolArguments()` private method; replaced direct JSON.parse with repair chain call |
| `livos/packages/livinityd/source/modules/server/ws-agent.ts` | 273 | Explicit `steer` case early-return before delegating to handleMessage |

## Sacred SHA Verification

Command: `git hash-object liv/packages/core/src/sdk-agent-runner.ts`
Output: `f3538e1d811992b782a9bb057d1b7f0a0189f95f`
Result: MATCHES — file is untouched.

## Pattern Implementation Map

### V32-HERMES-01 — status_detail chunk
- `run-store.ts` line 43: `'status_detail'` added to ChunkType union
- `liv-agent-runner.ts`: `handleAssistantMessage()` emits `status_detail` with `phase:'thinking'` at start of every turn
- `liv-agent-runner.ts`: `handleAssistantMessage()` emits `status_detail` with `phase:'tool_use'` + `pickToolVerb()` phrase just before `openToolSnapshot()`
- `liv-agent-runner.ts`: `handleToolResult()` emits `status_detail` with `phase:'thinking'` after processing the tool result

### V32-HERMES-02 — Hermes phrases module
- `liv/packages/core/src/lib/hermes-phrases.ts`: THINKING_VERBS (15-entry as const tuple), WAITING_VERBS (3-entry as const tuple), `pickThinkingVerb()`, `pickWaitingVerb()`
- Imported in `liv-agent-runner.ts` as `import { pickThinkingVerb } from './lib/hermes-phrases.js'`

### V32-HERMES-03 — IterationBudget
- `liv-agent-runner.ts` LivAgentRunnerOptions: `maxIterations?: number` field (default 90)
- `LivAgentRunner`: `_iterationCount = 0` and `_maxIterations: number` private fields; constructor sets `_maxIterations = opts.maxIterations ?? 90`
- `start()`: resets `_iterationCount = 0` and sets `_runStartedAt = Date.now()`
- `handleAssistantMessage()`: increments `_iterationCount` first; if `> _maxIterations` emits error chunk `{code:'MAX_ITERATIONS'}`, calls `markError`, sets `stopRequested = true`, returns early

### V32-HERMES-04 — Steer injection
- `liv-agent-runner.ts` `LivAgentRunner`: `_pendingSteer: string | null = null` field; `public injectSteer(guidance)` method
- `handleAssistantMessage()`: drains `_pendingSteer` by pushing `{role:'system', content:'<liv_steer>...<\/liv_steer>'}` into `currentHistory` then sets `_pendingSteer = null` (single-shot drain)
- `agent-session.ts` `ActiveSession`: `livRunner?: LivAgentRunner` optional field
- `agent-session.ts` `AgentSessionManager`: `injectSteer(userId, guidance)` looks up `sessions.get(userId)` and calls `session.livRunner.injectSteer(guidance)` — no-op if absent
- `agent-session.ts` `ClientWsMessage`: `| { type: 'steer'; guidance: string }` variant added
- `agent-session.ts` `handleMessage()`: `case 'steer'` dispatches to `this.injectSteer(userId, msg.guidance)`
- `ws-agent.ts`: explicit early-return for `raw.type === 'steer'` before delegating to handleMessage — calls `sessionManager.injectSteer(sessionKey, raw.guidance)` directly

### V32-HERMES-05 — batchId on ToolCallSnapshot
- `liv-agent-runner.ts` `ToolCallSnapshot`: `batchId?: string` optional field added
- `LivAgentRunner`: `_currentBatchId: string | null = null` private field
- `handleAssistantMessage()`: assigns `this._currentBatchId = randomUUID()` once per turn before processing blocks
- `openToolSnapshot()`: assigns `batchId: this._currentBatchId ?? undefined` on the snapshot

### V32-HERMES-06 — JSON repair chain
- `kimi-agent-runner.ts` `KimiAgentRunner`: `private _repairToolArguments(raw: string): string` method implementing 4-pass repair (direct parse → strip commas + balance braces → Python literal replacement → '{}' fallback)
- Tool call argument parsing in `run()`: replaced `JSON.parse(tc.function.arguments)` with `const repairedArgs = this._repairToolArguments(tc.function.arguments)` + `JSON.parse(repairedArgs)`

## Decisions

### batchId default behavior
Every assistant turn gets a fresh UUID assigned to `_currentBatchId` before processing content blocks. ALL tool_use snapshots in the same turn share it (including single-tool turns). Rationale: consistent field presence is simpler for UI consumers than conditional undefined — P83 can always read `batchId` without an existence check.

### System-message attachment for steer
Steer is prepended to `currentHistory` as a `{role:'system'}` message (NOT injected into the SDK messages array directly). Rationale: the `LivAgentRunner` does not have direct access to the SDK request construction — the sacred `SdkAgentRunner` owns that path. The `contextManagerHook` receives `currentHistory` and may forward it to summarization, which can pass system context back to the SDK. This is additive (no SDK internals touched) and honors the D-05 sacred file invariant. The steer tag `<liv_steer>...<\/liv_steer>` is clearly namespaced.

## Verification Commands Run

```
git hash-object liv/packages/core/src/sdk-agent-runner.ts
# → f3538e1d811992b782a9bb057d1b7f0a0189f95f  (exit 0)

cd liv/packages/core && npm run build
# → tsc  (exit 0, no errors)

npx tsx src/liv-agent-runner.hermes.test.ts
# → 5 pass, 0 fail  (exit 0)

npx tsx src/kimi-agent-runner.repair.test.ts
# → 8 pass, 0 fail  (exit 0)

npx tsx src/liv-agent-runner.test.ts
# → 7 pass, 0 fail  (exit 0, no regressions)
```

## Commit SHA

`628ed1ca`
