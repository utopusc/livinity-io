---
phase: 13-websocket-streaming-transport
plan: 02
subsystem: ui
tags: [websocket, react-hook, streaming, chat-ui, real-time, agent-socket]

# Dependency graph
requires:
  - phase: 13-websocket-streaming-transport
    plan: 01
    provides: /ws/agent WebSocket endpoint, AgentSessionManager, wire protocol types (AgentWsMessage, ClientWsMessage)
provides:
  - useAgentSocket React hook with WebSocket connection management, reconnection, and stream accumulation
  - AI chat route wired to WebSocket streaming for real-time agent responses
  - Connection status indicator visible in chat UI
  - ChatMessage type for processed agent messages
affects: [14-chat-ui-streaming-renderer, 15-session-persistence-history]

# Tech tracking
tech-stack:
  added: []
  patterns: [requestAnimationFrame-stream-batching, useReducer-message-state, websocket-fallback-to-trpc]

key-files:
  created:
    - livos/packages/ui/src/hooks/use-agent-socket.ts
  modified:
    - livos/packages/ui/src/routes/ai-chat/index.tsx

key-decisions:
  - "useReducer for message state management to avoid stale closures in WebSocket callbacks"
  - "requestAnimationFrame batching for stream deltas -- accumulate in mutable ref, flush on animation frame"
  - "Dual-path send: WebSocket when connected, tRPC mutation as fallback when disconnected"
  - "ChatToolCall type extracted separately from ChatMessage for clean reducer action typing"
  - "Agent messages mapped to existing Message type for rendering -- minimal UI changes required"

patterns-established:
  - "Stream accumulation via bufferRef + requestAnimationFrame for 60fps text updates"
  - "WebSocket exponential backoff reconnection: 1s base, 2x multiplier, 30s cap, reset on success"
  - "Connection status indicator pattern: colored dot + text label for WebSocket state"
  - "Fallback pattern: agent.isConnected routes to WS, otherwise existing tRPC path unchanged"

requirements-completed: [SDK-03, SDK-NF-02]

# Metrics
duration: 15min
completed: 2026-03-27
---

# Phase 13 Plan 02: Client WebSocket Hook and Chat Integration Summary

**useAgentSocket React hook with requestAnimationFrame stream batching, exponential backoff reconnection, and dual-path AI chat route wiring (WebSocket primary, tRPC fallback)**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-27T09:33:58Z
- **Completed:** 2026-03-27T09:48:36Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- useAgentSocket hook manages full WebSocket lifecycle: connect, reconnect, message dispatch, stream accumulation, and cleanup
- Stream deltas batched via requestAnimationFrame for smooth 60fps text rendering without excessive React re-renders
- AI chat route sends messages through WebSocket when connected, transparently falls back to existing tRPC mutation when disconnected
- Connection status indicator (green/yellow/red dot) shows real-time WebSocket state in the chat header
- Interrupt/cancel actions wired through WebSocket for immediate agent control during streaming
- Existing tRPC-based conversation CRUD, sidebar, canvas, and computer use panels remain fully functional

## Task Commits

Each task was committed atomically:

1. **Task 1: Create useAgentSocket hook with reconnection and stream accumulation** - `54c15bf` (feat)
2. **Task 2: Wire useAgentSocket into AI chat route for WebSocket streaming** - `c011b03` (feat)

## Files Created/Modified
- `livos/packages/ui/src/hooks/use-agent-socket.ts` - New React hook: WebSocket connection to /ws/agent with JWT auth, exponential backoff reconnection, useReducer state management for ChatMessage array, requestAnimationFrame stream batching, and action dispatchers
- `livos/packages/ui/src/routes/ai-chat/index.tsx` - Wired useAgentSocket hook into AiChat component: dual-path message sending, displayMessages mapping, connection status indicator, agent streaming indicator, interrupt/cancel via WebSocket

## Decisions Made
- Used `useReducer` instead of `useState` for the messages array to avoid stale closure issues in WebSocket onmessage callbacks -- dispatched actions always see current state
- Extracted `ChatToolCall` as a separate exported type for clean TypeScript inference in reducer actions (avoids indexing optional array type)
- Mapped agent `ChatMessage` to existing `Message` type for rendering instead of creating separate rendering components -- minimizes UI changes for Phase 13, Phase 14 will add streaming markdown renderer
- Keep `isLoading` state for tRPC path and derive `isAnyLoading` from both paths to minimize changes to existing code

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed ChatMessage toolCalls type indexing error**
- **Found during:** Task 1 (useAgentSocket hook)
- **Issue:** `ChatMessage['toolCalls'][number]` fails TypeScript because `toolCalls` is `Array<...> | undefined` -- cannot index `undefined` with `number`
- **Fix:** Extracted `ChatToolCall` as a standalone exported interface, used it directly in reducer action types
- **Files modified:** livos/packages/ui/src/hooks/use-agent-socket.ts
- **Verification:** TypeScript compiles clean (tsc --noEmit)
- **Committed in:** 54c15bf (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Type extraction is a minor structural improvement. No scope creep.

## Issues Encountered
- Pre-existing TypeScript errors exist in livinityd source files (ai/routes.ts, user/routes.ts, file-store.ts, widgets/routes.ts) and stories/ directory -- all unrelated to this plan's changes. Verified no new errors introduced in either created or modified file.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- WebSocket client-server pipeline is end-to-end complete: browser connects to /ws/agent, sends prompts, and receives streaming responses word-by-word
- Phase 14 (Chat UI Streaming Renderer) can now add streamdown markdown rendering for the streaming assistant messages
- Phase 15 (Session Persistence History) can add conversation save/load around the WebSocket session lifecycle
- The `ChatMessage` and `ChatToolCall` types from the hook provide the data model for Phase 14's tool call cards and markdown rendering

---
*Phase: 13-websocket-streaming-transport*
*Completed: 2026-03-27*
