---
phase: 17-session-management-history
plan: 02
subsystem: ui
tags: [react, trpc, websocket, conversation-history, sidebar, useReducer]

# Dependency graph
requires:
  - phase: 17-session-management-history
    plan: 01
    provides: getConversationMessages tRPC route, conversationId on WebSocket start payload, Redis conversation persistence
  - phase: 13-websocket-streaming-transport
    provides: useAgentSocket hook with reducer-based message state
provides:
  - LOAD_MESSAGES reducer action for loading persisted conversation messages into UI state
  - conversationId tracking in useAgentSocket for associating messages with Redis records
  - loadConversation function for hydrating chat from sidebar click
  - Sidebar conversation selection with tRPC fetch and message hydration
  - Page refresh conversation restore via URL param ?conv=
  - Post-streaming sidebar refetch for live metadata updates
affects: [18 cost control, future conversation search]

# Tech tracking
tech-stack:
  added: []
  patterns: [useUtils imperative fetch for user-triggered tRPC queries, ref-based conversation tracking to avoid re-renders]

key-files:
  created: []
  modified:
    - livos/packages/ui/src/hooks/use-agent-socket.ts
    - livos/packages/ui/src/routes/ai-chat/index.tsx

key-decisions:
  - "conversationIdRef uses useRef not useState -- avoids re-renders since parent manages authoritative ID via URL params"
  - "trpcReact.useUtils() for imperative fetch on sidebar click rather than reactive query -- user-triggered action not auto-fetch"
  - "initialConvLoaded ref gate prevents double-load on mount when isConnected changes"

patterns-established:
  - "Imperative tRPC fetch: useUtils().route.fetch() for on-demand data loading triggered by user action"
  - "Streaming-end refetch: prevStreamingRef pattern to detect streaming->idle transition for sidebar updates"

requirements-completed: [SDK-06, SDK-07]

# Metrics
duration: 5min
completed: 2026-03-27
---

# Phase 17 Plan 02: Frontend Conversation History Summary

**Sidebar conversation selection loads persisted messages via tRPC, with conversationId forwarding through WebSocket for continued persistence**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-27T11:37:30Z
- **Completed:** 2026-03-27T11:42:44Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- useAgentSocket hook now supports loading historical messages via LOAD_MESSAGES reducer action and tracks conversationId for persistence
- Sidebar conversation clicks fetch full message history via tRPC and hydrate the chat UI including tool call cards
- Sending messages in any conversation passes the conversationId through WebSocket so new messages persist to the correct Redis record
- Page refresh with ?conv=id restores the conversation from Redis automatically
- Sidebar refetches after each agent streaming session ends to reflect updated titles and message counts

## Task Commits

Each task was committed atomically:

1. **Task 1: Add LOAD_MESSAGES to reducer + conversationId tracking in useAgentSocket** - `3d3a08b` (feat)
2. **Task 2: Wire sidebar conversation selection to load history + pass conversationId on send** - `7b4d687` (feat)

## Files Created/Modified
- `livos/packages/ui/src/hooks/use-agent-socket.ts` - Added LOAD_MESSAGES action, conversationIdRef, loadConversation function, conversationId in sendMessage payload
- `livos/packages/ui/src/routes/ai-chat/index.tsx` - Added handleSelectConversation with tRPC fetch, conversationId forwarding in handleSend, streaming-end refetch, page refresh load

## Decisions Made
- conversationIdRef is a useRef (not useState) because the WebSocket send needs the latest value without triggering re-renders; the parent component manages the authoritative ID via URL params
- Used trpcReact.useUtils() for imperative fetch on sidebar click rather than a reactive useQuery, since this is a user-triggered action
- initialConvLoaded ref prevents double-loading on mount when isConnected transitions

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Session management and history is fully wired end-to-end (backend persistence from Plan 01 + frontend loading/resumption from Plan 02)
- Ready for Phase 18 cost control or any future phase that needs conversation context

## Self-Check: PASSED

All files verified present. Both task commits (3d3a08b, 7b4d687) confirmed in git log.

---
*Phase: 17-session-management-history*
*Completed: 2026-03-27*
