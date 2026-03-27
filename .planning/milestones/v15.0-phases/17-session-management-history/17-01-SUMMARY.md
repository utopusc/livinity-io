---
phase: 17-session-management-history
plan: 01
subsystem: ai
tags: [websocket, redis, conversation-persistence, trpc, agent-sdk]

# Dependency graph
requires:
  - phase: 13-websocket-streaming-transport
    provides: AgentSessionManager with consumeAndRelay loop and WebSocket handler
  - phase: 16-mid-conversation-interaction
    provides: Follow-up message injection via inputChannel
provides:
  - TurnData interface and onTurnComplete callback on AgentSessionManager
  - Conversation persistence from SDK WebSocket sessions to Redis via AiModule
  - getConversationMessages tRPC route returning UI-formatted ChatMessage arrays
  - updateConversationTitle tRPC mutation for sidebar rename
  - Public saveConversation and getOrCreateConversation methods on AiModule
affects: [17-02 frontend history sidebar, 18 cost control]

# Tech tracking
tech-stack:
  added: []
  patterns: [callback-based turn persistence in relay loop, turn accumulation with flush-on-result]

key-files:
  created: []
  modified:
    - nexus/packages/core/src/agent-session.ts
    - nexus/packages/core/src/lib.ts
    - livos/packages/livinityd/source/modules/server/ws-agent.ts
    - livos/packages/livinityd/source/modules/ai/index.ts
    - livos/packages/livinityd/source/modules/ai/routes.ts

key-decisions:
  - "Turn accumulation in consumeAndRelay: accumulate text from assistant messages + stream deltas, flush on result type message"
  - "onTurnComplete callback pattern: AgentSessionManager stays storage-agnostic, ws-agent.ts bridges to AiModule"
  - "Tool output captured from user tool_result blocks matching pending tool calls"

patterns-established:
  - "Turn persistence callback: onTurnComplete(TurnData) called after each SDK result message"
  - "getOrCreateConversation: auto-creates conversation on first turn with title from user prompt"

requirements-completed: [SDK-06]

# Metrics
duration: 7min
completed: 2026-03-27
---

# Phase 17 Plan 01: Backend Conversation Persistence Summary

**SDK WebSocket sessions persist user/assistant turns to Redis via onTurnComplete callback, with tRPC routes for message retrieval and title updates**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-27T11:26:55Z
- **Completed:** 2026-03-27T11:33:45Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- SDK sessions now persist every user/assistant turn to Redis conversation storage through the onTurnComplete callback
- Conversations auto-created on first turn with title from first 60 characters of user prompt
- getConversationMessages tRPC route transforms backend ChatMessage format to UI ChatMessage format (tool calls mapped with id, name, input, status, output)
- updateConversationTitle mutation ready for sidebar rename functionality

## Task Commits

Each task was committed atomically:

1. **Task 1: Add conversation persistence to AgentSessionManager + WebSocket handler** - `5e52067` (feat)
2. **Task 2: Add getConversationMessages tRPC route + make saveConversation accessible** - `70a5f6f` (feat)

## Files Created/Modified
- `nexus/packages/core/src/agent-session.ts` - Added TurnData interface, conversationId on ClientWsMessage/ActiveSession, onTurnComplete callback in startSession/handleMessage, turn accumulation in consumeAndRelay
- `nexus/packages/core/src/lib.ts` - Exported TurnData type from @nexus/core/lib
- `livos/packages/livinityd/source/modules/server/ws-agent.ts` - Added saveToConversation helper bridging TurnData to AiModule Redis storage, passed onTurnComplete through handleMessage
- `livos/packages/livinityd/source/modules/ai/index.ts` - Made saveConversation public, added getOrCreateConversation method
- `livos/packages/livinityd/source/modules/ai/routes.ts` - Added getConversationMessages query and updateConversationTitle mutation

## Decisions Made
- Turn accumulation uses a flush-on-result pattern: text and tool calls accumulate during the relay loop and flush when a `result` message arrives (or in the finally block for interrupted sessions)
- AgentSessionManager remains storage-agnostic -- it only fires the callback. The ws-agent.ts handler owns the persistence bridge to AiModule
- Tool call outputs captured from `user` type messages containing `tool_result` blocks, matching against pending tool calls in the accumulator

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Backend fully ready for 17-02 frontend history sidebar
- getConversationMessages returns messages in the exact format the UI ChatMessage interface expects
- Conversations auto-persist and auto-title, ready for sidebar list display

## Self-Check: PASSED

All 6 files verified present. Both task commits (5e52067, 70a5f6f) confirmed in git log.

---
*Phase: 17-session-management-history*
*Completed: 2026-03-27*
