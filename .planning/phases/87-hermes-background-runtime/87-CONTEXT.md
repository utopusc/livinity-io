# Phase 87 — Hermes-Inspired Background Runtime Extensions

**Milestone:** v32 AI Chat Ground-up Rewrite
**Wave:** 1 (file-disjoint, paralel P80 + P85-schema)
**Effort:** ~8h
**Sacred SHA gate:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` MUST remain unchanged. This phase touches `liv-agent-runner.ts` and `agent-session.ts` (extension wrappers around the sacred file), but NEVER `sdk-agent-runner.ts` itself.

## Goal

Port 5 Hermes patterns into LivOS's background agent runtime, extending `LivAgentRunner` and `AgentSessionManager` without touching the sacred subscription path. Hermes is BACKEND inspiration only (per user direction 2026-05-05) — UI consumes the new chunk types but does not adopt CLI/emoji styling.

## Requirements (V32-HERMES-01..07)

- **V32-HERMES-01 — `status_detail` chunk type**
  - Add to `liv/packages/core/src/run-store.ts` `ChunkType` union: `'status_detail'`
  - Payload shape: `{ phase: 'thinking' | 'tool_use' | 'waiting'; phrase: string; elapsed: number /* ms since run start */ }`
  - Emit from `LivAgentRunner.handleAssistantMessage` start (phase: 'thinking', random verb), tool dispatch (phase: 'tool_use', verb hints at tool category), tool result (phase: 'thinking' resumes if more turns)
  - SSE endpoint must serialize the chunk verbatim (existing JSON serializer handles arbitrary payloads — verify)

- **V32-HERMES-02 — Hermes phrase constants**
  - New file `liv/packages/core/src/lib/hermes-phrases.ts`
  - Export `THINKING_VERBS` (15 entries verbatim from Hermes `display.py`):
    ```ts
    export const THINKING_VERBS = [
      'pondering', 'contemplating', 'musing', 'cogitating', 'ruminating',
      'deliberating', 'mulling', 'reflecting', 'processing', 'reasoning',
      'analyzing', 'computing', 'synthesizing', 'formulating', 'brainstorming',
    ] as const
    ```
  - Export `pickThinkingVerb()` returning a random entry
  - Export `WAITING_VERBS` (smaller set: 'waiting', 'ready', 'standing by')
  - **NO KAWAII faces / emoticons in this file** — those are CLI-only Hermes style; LivOS uses Liv-styled animation in UI

- **V32-HERMES-03 — `IterationBudget`**
  - Add `maxIterations?: number` to `LivAgentRunnerOptions` (default 90, matches Hermes)
  - In `LivAgentRunner.start()`, INCR a counter on every `handleAssistantMessage` invocation
  - On breach: emit `{type: 'error', payload: {message: 'Max iterations (N) reached', code: 'MAX_ITERATIONS'}}` chunk → call `runStore.markError()` → set `this.stopRequested = true`
  - Counter shared across subagent calls if subagent path exists (currently it doesn't but reserve the pattern)

- **V32-HERMES-04 — Steer injection**
  - Add private field `_pendingSteer: string | null = null` to `LivAgentRunner`
  - Add public method `injectSteer(guidance: string)` — sets the field
  - In `handleAssistantMessage` BEFORE calling SDK query, if `_pendingSteer` is set: prepend a synthetic system message `<liv_steer>${guidance}</liv_steer>` to the next request, then clear field
  - Preserves role-alternation invariant (no new user turn needed)
  - Add WS message type to `livos/packages/livinityd/source/modules/server/ws-agent.ts` `ClientMessage` union: `{type: 'steer', guidance: string}` — handler calls `agentSessionManager.injectSteer(userId, guidance)`
  - `AgentSessionManager.injectSteer(userId, guidance)` looks up active session → calls runner method

- **V32-HERMES-05 — `batchId` on ToolCallSnapshot**
  - Add optional field `batchId?: string` to `ToolCallSnapshot` interface in `run-store.ts`
  - Populated by `LivAgentRunner` when emitting tool snapshot: groups tools dispatched in same SDK turn under shared UUID
  - Currently no parallel tool dispatch in our path (Claude SDK handles it transparently), but field is reserved for UI grouping in P83
  - Default `undefined` (no breaking change for existing consumers)

- **V32-HERMES-06 — JSON repair chain (defensive)**
  - Add `_repairToolArguments(raw: string): string` to `liv/packages/core/src/kimi-agent-runner.ts` (legacy Kimi path, not Claude path — Claude SDK handles its own validation)
  - 4 sequential repair passes:
    1. Try `JSON.parse(raw)` — if success, re-serialize and return
    2. Strip trailing commas, balance unclosed braces/brackets, retry parse
    3. Replace Python-style `None`/`True`/`False` with JSON `null`/`true`/`false`, retry
    4. Last resort: return `'{}'` (empty object)
  - Logs each repair attempt at debug level
  - Tests in `kimi-agent-runner.test.ts` cover all 4 paths

- **V32-HERMES-07 — Integration test**
  - New `liv/packages/core/src/liv-agent-runner.hermes.test.ts`
  - Stubbed SDK runner emitting controlled events
  - Verify: `status_detail` emitted at start + tool + result; `maxIterations` triggers error chunk; `injectSteer` prepends `<liv_steer>` to next message; `batchId` populated when SDK reports tool batch

## Files Affected

**Created:**
- `liv/packages/core/src/lib/hermes-phrases.ts`
- `liv/packages/core/src/liv-agent-runner.hermes.test.ts`

**Modified:**
- `liv/packages/core/src/run-store.ts` (add `status_detail` ChunkType + `batchId` on ToolCallSnapshot)
- `liv/packages/core/src/liv-agent-runner.ts` (status_detail emit + IterationBudget + steer)
- `liv/packages/core/src/kimi-agent-runner.ts` (JSON repair chain — defensive, legacy path)
- `livos/packages/livinityd/source/modules/server/ws-agent.ts` (add steer ClientMessage type + handler)
- `liv/packages/core/src/agent-session.ts` (add `injectSteer()` method to AgentSessionManager)

**NOT modified (sacred):**
- `liv/packages/core/src/sdk-agent-runner.ts` ← VERIFY SHA UNCHANGED at end

## Sacred / Constraint Notes

- **D-NO-BYOK** — OAuth subscription path untouched (sdk-agent-runner.ts)
- **D-ADDITIVE-ONLY** — All new fields on existing types are optional; no breaking changes for current consumers
- **D-LIV-STYLED** — Hermes phrase data only (THINKING_VERBS); zero KAWAII emoticons / face frames / ASCII frames

## Verification

- [ ] `git hash-object liv/packages/core/src/sdk-agent-runner.ts` returns `f3538e1d811992b782a9bb057d1b7f0a0189f95f`
- [ ] `liv/packages/core` build clean (`npm run build`)
- [ ] `liv-agent-runner.hermes.test.ts` passes all 5 pattern integrations
- [ ] No regression on existing chat path: smoke test against Mini PC bytebot screenshot still works after deploy
- [ ] WS steer message handled: send `{type:'steer', guidance:'be more concise'}` while session running → next assistant message reflects guidance

## Reference

Hermes `display.py` `THINKING_VERBS` constants — verbatim port (the only Hermes UI data we adopt; everything else is concept).
Hermes `IterationBudget` class pattern — Python class translated to TS counter + breach handler.
Hermes `_repair_tool_call_arguments()` pattern — 4-pass repair chain.
Hermes `_pending_steer` field pattern — single-shot drain in next assistant turn.
