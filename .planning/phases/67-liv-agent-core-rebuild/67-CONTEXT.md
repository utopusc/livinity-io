# Phase 67: Liv Agent Core Rebuild - Context

**Gathered:** 2026-05-04
**Status:** Ready for planning
**Mode:** Autonomous (`--auto`) — decisions locked from `.planning/v31-DRAFT.md` §P67 spec + scout findings

<domain>
## Phase Boundary

Build the v31 AI chat foundation that enables the WOW UX of subsequent phases (P68-P75):

1. **`RunStore`** — Redis-backed agent-run lifecycle store (`liv:agent_run:{runId}:meta` JSON, `liv:agent_run:{runId}:chunks` Redis List, `liv:agent_run:{runId}:control` stop signal, Pub/Sub channel `liv:agent_run:{runId}:tail`). 24h TTL.
2. **`LivAgentRunner`** — orchestrator that wraps the existing `SdkAgentRunner` (sacred file, untouched internals). Adds: reasoning content extraction (Kimi `reasoning_content` → `chunk.type='reasoning'`), tool call snapshot batching (pair assistant tool_use + subsequent tool_result → `chunk.type='tool_snapshot'`), computer-use tool routing stub (when name matches `computer_use_*`, route to bytebotd bridge — actual bytebotd lands in P71), context-manager hook (75% threshold, summarization stub).
3. **`/api/agent/runs/:runId/stream`** SSE endpoint with `?after=` resume support, 15s heartbeat, JWT-gated.
4. **`POST /api/agent/start`** route — creates `RunStore` run + spawns `LivAgentRunner` in-process (BullMQ queueing is P73), returns `{runId}`.
5. **`useLivAgentStream`** frontend hook — Zustand-store-backed; opens SSE, reconnects with `?after=lastIdx` on drop, exposes `{ messages, snapshots, status, sendMessage, stop }`.

**Out of scope (deferred):**
- BullMQ queueing/concurrency control → **P73** (Reliability Layer).
- Bytebot desktop image + react-vnc embed → **P71** (Computer Use Foundation). P67 only adds the routing stub.
- Side panel + per-tool views consuming `ToolCallSnapshot` → **P68/P69**.
- Composer UX polish (auto-grow, slash menu) → **P70**.
- Reasoning card rendering + Postgres FTS over conversations → **P75**.
- WebSocket `/api/agent/stream` deprecation — keep it forever (this milestone). Per v31-DRAFT line 298, deprecation is v32.
- Renaming `nexus/packages/core/` → `liv/packages/core/` → **P65** (NOT autonomous).

</domain>

<decisions>
## Implementation Decisions

### File paths and naming under P65-pending state (D-01..D-04)
- **D-01:** P65 (Nexus → Liv rename) has NOT happened yet. New code lands in **`nexus/packages/core/src/`** (current location), NOT `liv/packages/core/src/` (the post-rename target from v31-DRAFT). P65 will move the directory wholesale.
- **D-02:** New file names use **`liv-` prefix in the filename** (e.g. `nexus/packages/core/src/run-store.ts`, `nexus/packages/core/src/liv-agent-runner.ts`) so the rename in P65 only touches the directory move, not file renames.
- **D-03:** New TypeScript class names are **`Liv*` from the start** (`LivAgentRunner`, `RunStore`). No `Nexus*` prefix in new code.
- **D-04:** New Redis key prefix is **`liv:agent_run:*`** per v31-DRAFT line 274-278 — NOT `nexus:agent_run:*`. Rationale: P65's Redis migration will rename existing `nexus:*` keys, but new keys land in the post-rename namespace from day 1 to avoid double-migration churn. This is consistent with `STATE.md` line 50 "nexus:* Redis → liv:*" rename plan.

### Sacred file boundary (D-05)
- **D-05:** `nexus/packages/core/src/sdk-agent-runner.ts` SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` — read-only. `LivAgentRunner` **WRAPS** `SdkAgentRunner` (composition), does NOT modify it. No edits, no patches, no diffs to sacred file. Verify SHA pre/post each plan task.

### Coexistence with existing endpoints (D-06..D-08)
- **D-06:** Existing `/api/agent/stream` SSE endpoint (used by broker `agent-runner-factory.ts:92`, existing chat UI, broker integration tests) **STAYS UNCHANGED**. Phase 67 is additive — the new endpoint is `/api/agent/runs/:runId/stream`.
- **D-07:** WebSocket-based agent streaming is NOT modified or deprecated in this phase. Future cleanup in v32.
- **D-08:** Existing chat UI (`livos/packages/ui/src/routes/ai-chat/...`) continues using its current stream model. Migration to `useLivAgentStream` happens in P68 (Side Panel) or P70 (Composer Polish), not here. P67 ships the hook; consumers adopt later.

### RunStore data model (D-09..D-11)
- **D-09:** Redis schema per v31-DRAFT line 274-278 (verbatim):
  - `liv:agent_run:{runId}:meta` — JSON `{userId, task, status: 'queued'|'running'|'complete'|'error'|'stopped', createdAt, completedAt?, finalResult?}`
  - `liv:agent_run:{runId}:chunks` — Redis List, each entry JSON `{idx: number, type: 'text'|'reasoning'|'tool_snapshot'|'tool_call_partial'|'error'|'status', payload: any, ts: number}`
  - `liv:agent_run:{runId}:control` — string key, value `'stop'` if stop signal sent (loop checks every iter)
  - Pub/Sub channel: `liv:agent_run:{runId}:tail` — broadcasts new chunk index on every append
- **D-10:** TTL: 24h on all four keys/channel keys per spec. Use `EXPIRE` after every write so any append refreshes the TTL window.
- **D-11:** Run-ID generation: `randomUUID()` from `node:crypto` (consistent with existing pattern in `sdk-agent-runner.ts` line 11).

### ToolCallSnapshot data shape (D-12)
- **D-12:** Snapshot shape (canonical for P68/P69 consumers):
  ```ts
  type ToolCallSnapshot = {
    toolId: string;          // tool_use_id from assistant message
    toolName: string;        // e.g. "browser-navigate", "execute-command"
    category: 'browser' | 'terminal' | 'file' | 'fileEdit' | 'webSearch' | 'webCrawl' | 'webScrape' | 'mcp' | 'computer-use' | 'generic';
    assistantCall: { input: Record<string, unknown>; ts: number };
    toolResult?: { output: unknown; isError: boolean; ts: number };  // undefined while running
    status: 'running' | 'done' | 'error';
    startedAt: number;
    completedAt?: number;
  };
  ```
  This is the data structure the side panel (P68) and per-tool views (P69) consume. Lock it now to unblock those phases.

### LivAgentRunner composition (D-13..D-16)
- **D-13:** Constructor signature: `new LivAgentRunner({ runStore, sdkRunner, toolRegistry, redisClient, contextManagerHook?, computerUseRouter? })`. The `sdkRunner` is the existing `SdkAgentRunner` instance — passed in, never instantiated inside.
- **D-14:** Reasoning extraction: tap into the SDK runner's stream by listening for events on its `EventEmitter` (existing pattern, see `sdk-agent-runner.ts` line 12). Filter for messages where `reasoning_content` field is present (Kimi-style) and emit as `RunStore.appendChunk(runId, { type: 'reasoning', payload: text })`. Other text emits as `{ type: 'text', payload: text }`.
- **D-15:** Tool snapshot batching algorithm: maintain an in-memory `Map<toolId, ToolCallSnapshot>` for the run. On assistant message with `tool_use` block → create snapshot (status 'running'), emit `chunk.type='tool_snapshot'` to RunStore. On subsequent `tool_result` block with matching `tool_use_id` → merge into snapshot (status 'done' or 'error'), emit again with same `toolId`. Consumer dedupes by `toolId` and replaces.
- **D-16:** Computer-use routing stub: when `toolName.startsWith('computer_use_') || toolName.startsWith('bytebot_')`, the runner emits a `tool_snapshot` with category 'computer-use' but the actual tool execution is **deferred to P71 implementation**. P67's stub: log a warning, emit `toolResult` with `{ isError: true, output: 'Computer use not available until P71' }` so the UI can render the "needs setup" placeholder.

### POST /api/agent/start route (D-17..D-19)
- **D-17:** Route file: `livos/packages/livinityd/source/modules/ai/agent-runs.ts` (NEW). Mounted by existing ai routes index. Accepts `POST { task: string, conversationId?: string }`, returns `{ runId, sseUrl: '/api/agent/runs/{runId}/stream' }`.
- **D-18:** No BullMQ in P67 — runner spawns in-process. Concurrency control (per-user max=1) is P73. P67 just runs to completion or until stop.
- **D-19:** JWT auth: existing middleware (multi-user JWT structure: `{userId, role, sessionId}` per memory `MEMORY.md`). The userId from JWT goes into RunStore.meta.userId.

### SSE endpoint (D-20..D-22)
- **D-20:** Endpoint: `GET /api/agent/runs/:runId/stream?after=<lastIdx>`. Auth via existing JWT middleware (header `Authorization: Bearer <token>` or query `?token=<jwt>` for SSE-friendly browsers).
- **D-21:** Resume logic: read all chunks from `liv:agent_run:{runId}:chunks` starting at `?after+1`, send them as `data: {chunk-json}\n\n` events, then subscribe to Pub/Sub `liv:agent_run:{runId}:tail` for live tail.
- **D-22:** Heartbeat: `: heartbeat\n\n` comment line every 15s (per spec). Disconnect on client close.

### Frontend useLivAgentStream hook (D-23..D-25)
- **D-23:** File: `livos/packages/ui/src/lib/use-liv-agent-stream.ts` (per v31-DRAFT line 300).
- **D-24:** Hook signature: `useLivAgentStream({ conversationId, autoStart? }) → { messages, snapshots, status, sendMessage, stop, runId, retry }`. Uses Zustand store internally; the store key is the `conversationId` so multiple conversations can stream independently.
- **D-25:** Reconnect: on EventSource error/close, wait 1s then re-open with `?after=lastIdx` from store. Exponential backoff up to 30s. Surface a `status: 'reconnecting'` while in this state.

### Build/test discipline (D-26)
- **D-26:** Each plan's task list ends with `pnpm --filter @nexus/core build` + (where relevant) `pnpm --filter @livos/livinityd build` + `pnpm --filter ui build`. Vite build success is the binding correctness gate (per the 538 pre-existing repo-wide TS errors noted in P66 — out of scope).

### Claude's Discretion
- Internal field names within RunStore (e.g. exact key for run-ids set, run-id list expiry strategy).
- Exact Redis pipelining for performance (single MULTI/EXEC vs sequential commands).
- Whether to add a small pre-built `RunStoreSubscriber` helper class for the SSE endpoint (probably yes for clarity).
- Exact SSE event names beyond `data:` (e.g. `event: chunk`, `event: heartbeat`, `event: complete`).
- Test file layout (Jest/Vitest convention from existing repo).

</decisions>

<specifics>
## Specific Ideas

- v31-DRAFT.md has the full architecture. There's nothing novel to research — this is greenfield code in a known stack (Express, ioredis, Zustand, EventSource).
- **The ToolCallSnapshot data shape is the most important deliverable** because P68 and P69 are blocked on it. Lock D-12 cleanly so those phases can start without this phase's full execute completing.
- The user pivoted from Suna infra to AI chat focus mid-session (2026-05-04 message). P67 is the heart of "AI chat" per their direction.
- v31-DRAFT line 311: "KEEP: `liv/packages/core/src/sdk-agent-runner.ts` (unchanged internals)" — the rename target. Sacred file rule.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and detailed spec
- `.planning/v31-DRAFT.md` lines 263-321 — full P67 deliverables (RunStore, LivAgentRunner, SSE endpoint, route, frontend hook), files affected, verification, estimate
- `.planning/ROADMAP.md` Phase 67 section — goal + 4 success criteria
- `.planning/STATE.md` — milestone state, hard constraints

### Sacred file (read-only)
- `nexus/packages/core/src/sdk-agent-runner.ts` SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` — wrapped by `LivAgentRunner`, never modified.

### Existing endpoints to preserve
- `livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts:92` — broker calls existing `/api/agent/stream`. KEEP working.
- `livos/packages/livinityd/source/modules/ai/index.ts:481` and `index-v19.ts:368` — existing chat UI streaming integration. KEEP working.

### Existing Redis usage patterns
- `nexus/packages/core/src/agent-session.ts:165-186` — ioredis usage pattern (`Redis | null`, `redis.keys('nexus:hooks:*')`). New code follows same instantiation pattern but uses `liv:` key prefix.

### Tool registry (consumers of LivAgentRunner output)
- `nexus/packages/core/src/tool-registry.ts` — tool definitions; the LivAgentRunner needs to know tool name → category mapping for snapshot.category. Use existing `liv-icons.ts` keys (P66-04) as the canonical category list.

### v31 hard constraints
- `.planning/STATE.md` lines 65-71 — D-NO-BYOK, BROKER_FORCE_ROOT_HOME, D-NO-SERVER4, side panel auto-open behavior

### v31 prior phase outputs that this phase consumes (or does NOT)
- `livos/packages/ui/src/icons/liv-icons.ts` (P66-04) — category names align with snapshot.category
- `livos/packages/ui/src/components/motion/` (P66-02) — frontend hook does NOT consume motion primitives directly; that's P68

### Memory references
- Memory: `MEMORY.md` §"Multi-User Architecture (v7.0)" — JWT structure `{userId, role, sessionId}`, multi-user routes via tRPC httpOnlyPaths

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable assets
- `ioredis` already wired (`agent-session.ts:26`).
- `randomUUID()` from `node:crypto` already used in `sdk-agent-runner.ts:11`.
- `EventEmitter` for stream events is the existing pattern in `sdk-agent-runner.ts:11`.
- `LivIcons` map at `livos/packages/ui/src/icons/liv-icons.ts` (P66-04) — categories align with `ToolCallSnapshot.category`.
- Zustand already in use across the UI (per scout of `livos/packages/ui/src/stores/`).
- `EventSource` is browser-native; no library needed for SSE client.

### Established patterns
- Agent runner pattern: `kimi-agent-runner.ts`, `sdk-agent-runner.ts`, `loop-runner.ts` — `LivAgentRunner` follows the same shape (class with `start(task)` method, exposes EventEmitter).
- Express SSE pattern likely already exists in `livinityd` — the executor should grep for existing SSE handlers (e.g. via `text/event-stream` content-type) and follow the same shape.
- ioredis Pub/Sub: `redis.subscribe(channel, callback)` + separate redis client for publishes (cannot publish on subscribed connection).
- JWT middleware exists at `livos/packages/livinityd/source/modules/auth/` or similar — locator at planning time.

### Integration points
- New routes mount via `livos/packages/livinityd/source/modules/ai/index.ts` (existing aggregator).
- New runner instantiated by the new agent-runs route handler; it pulls `redisClient` and `toolRegistry` from the daemon's existing DI/factory pattern.
- Frontend hook lives next to existing hooks under `livos/packages/ui/src/lib/`.

### Build verification
- `pnpm --filter @nexus/core build` (TypeScript compile via `tsc`)
- `pnpm --filter @livos/livinityd build` if applicable (or just `tsx` runtime; livinityd may not have a build step per `MEMORY.md`)
- `pnpm --filter ui build` (vite)

</code_context>

<deferred>
## Deferred Ideas

- **BullMQ queueing + per-user concurrency** — P73 Reliability Layer.
- **Real Bytebot integration** — P71. P67 ships the routing stub only.
- **Context manager 75% threshold actual summarization** — P73. P67 ships the hook signature; the body is a no-op or a stub that logs "summarization needed".
- **Migrating existing chat UI to `useLivAgentStream`** — P68 (Side Panel) or P70 (Composer Polish).
- **WebSocket /api/agent/stream deprecation** — v32 milestone.
- **`nexus:* → liv:*` Redis migration of EXISTING keys** — P65. P67 only writes new `liv:agent_run:*` keys; existing `nexus:*` keys stay until P65.
- **Reasoning content rendering as collapsible amber card** — P75. P67 ships the chunk type; UI rendering is later.
- **Conversation persistence to Postgres** — P75 (Postgres tsvector FTS).

</deferred>

---

*Phase: 67-liv-agent-core-rebuild*
*Context gathered: 2026-05-04*
