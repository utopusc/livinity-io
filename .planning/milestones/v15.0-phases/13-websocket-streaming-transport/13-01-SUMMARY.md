---
phase: 13-websocket-streaming-transport
plan: 01
subsystem: api
tags: [websocket, sdk, streaming, agent-session, relay, real-time]

# Dependency graph
requires:
  - phase: 11-platform-auth-registration
    provides: SDK agent runner with query(), buildSdkTools, MCP server pattern
  - phase: 12-mcp-tool-bridge
    provides: MCP tool bridge wrapping ToolRegistry via createSdkMcpServer
provides:
  - AgentSessionManager class managing per-user SDK sessions with start/message/interrupt/cancel
  - createInputChannel async generator for mid-conversation message injection
  - Wire protocol types (AgentWsMessage, ClientWsMessage) for WebSocket communication
  - /ws/agent WebSocket endpoint on livinityd with JWT auth and 15s heartbeat
affects: [14-chat-ui-streaming-renderer, 15-session-persistence-history]

# Tech tracking
tech-stack:
  added: []
  patterns: [async-generator-input-channel, websocket-relay-architecture, per-user-session-map]

key-files:
  created:
    - nexus/packages/core/src/agent-session.ts
    - nexus/packages/core/src/agent-session.test.ts
    - livos/packages/livinityd/source/modules/server/ws-agent.ts
  modified:
    - nexus/packages/core/src/lib.ts
    - nexus/packages/core/src/sdk-agent-runner.ts
    - livos/packages/livinityd/source/modules/server/index.ts

key-decisions:
  - "Use AsyncIterable<SDKUserMessage> prompt mode for mid-conversation message injection via createInputChannel"
  - "Relay SDK messages with zero transformation as { type: 'sdk_message', data: SDKMessage }"
  - "Single session per user enforced by AgentSessionManager Map keyed by userId"
  - "Don't kill session on WebSocket disconnect to allow tab refresh reconnection"

patterns-established:
  - "Input channel pattern: async generator with pending array + resolve callback for push/close semantics"
  - "WebSocket relay pattern: AgentSessionManager onMessage callback for decoupled message delivery"
  - "Wire protocol: AgentWsMessage (server->client) and ClientWsMessage (client->server) envelope types"

requirements-completed: [SDK-03, SDK-NF-01]

# Metrics
duration: 15min
completed: 2026-03-27
---

# Phase 13 Plan 01: WebSocket Streaming Transport Summary

**AgentSessionManager with per-user SDK session relay and /ws/agent WebSocket endpoint using async generator input channel for bidirectional agent communication**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-27T09:12:15Z
- **Completed:** 2026-03-27T09:28:09Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- AgentSessionManager class manages per-user SDK query() sessions with start, message injection, interrupt, and cancel semantics
- createInputChannel provides async generator input for mid-conversation message injection into the SDK's streaming input mode
- /ws/agent WebSocket endpoint mounted on livinityd Express server using existing mountWebSocketServer pattern with JWT auth and 15s heartbeat
- Wire protocol types (AgentWsMessage, ClientWsMessage) match v20-ARCHITECTURE.md specification exactly
- Both nexus-core and livinityd compile cleanly

## Task Commits

Each task was committed atomically:

1. **Task 1: Create AgentSessionManager with input channel and relay loop** - `8a290b5` (feat)
2. **Task 2: Mount /ws/agent WebSocket endpoint on livinityd Express server** - `d5ef03f` (feat)

## Files Created/Modified
- `nexus/packages/core/src/agent-session.ts` - AgentSessionManager class, createInputChannel helper, wire protocol types
- `nexus/packages/core/src/agent-session.test.ts` - Unit tests for createInputChannel and AgentSessionManager session management
- `livos/packages/livinityd/source/modules/server/ws-agent.ts` - WebSocket /ws/agent endpoint handler bridging browser to AgentSessionManager
- `nexus/packages/core/src/lib.ts` - Added AgentSessionManager, createInputChannel, and type exports
- `nexus/packages/core/src/sdk-agent-runner.ts` - Exported tierToModel and isCdpReachable for reuse
- `livos/packages/livinityd/source/modules/server/index.ts` - Mounted /ws/agent WebSocket endpoint

## Decisions Made
- Used AsyncIterable prompt mode (not Session.send()) for mid-conversation messages -- aligns with SDK's streaming input pattern and createInputChannel architecture
- Relay SDK messages with zero transformation -- forward raw SDKMessage as { type: 'sdk_message', data } to let the React client parse types directly
- Use abortController.abort() for interrupt rather than Query.interrupt() -- simpler lifecycle management, abort breaks the for-await loop cleanly
- Don't kill session on WebSocket disconnect -- allows reconnection on tab refresh or network blip; session replaced on next 'start' message
- toolRegistry accessed via livinityd.ai.toolRegistry (the AiModule property) rather than a direct Livinityd property

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Exported tierToModel and isCdpReachable from sdk-agent-runner.ts**
- **Found during:** Task 1 (AgentSessionManager implementation)
- **Issue:** agent-session.ts imports tierToModel and isCdpReachable from sdk-agent-runner.ts, but they were private functions
- **Fix:** Changed `function tierToModel` and `function isCdpReachable` to `export function` in sdk-agent-runner.ts
- **Files modified:** nexus/packages/core/src/sdk-agent-runner.ts
- **Verification:** TypeScript build succeeds with imports
- **Committed in:** 8a290b5 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential for imports to work. The plan itself instructed to export these if not already exported. No scope creep.

## Issues Encountered
- livinityd TypeScript has pre-existing compilation errors in unrelated files (user/routes.ts, file-store.ts, widgets/routes.ts) -- verified no errors in new ws-agent.ts or the lines added to server/index.ts

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- WebSocket transport layer is complete and ready for Phase 14 (Chat UI Streaming Renderer)
- The React client can connect to /ws/agent with JWT token, send { type: 'start', prompt } to begin a session
- SDK messages will be relayed as { type: 'sdk_message', data } for the streaming renderer to parse
- Mid-conversation messages, interrupts, and cancellation are all wired up

## Self-Check: PASSED

All files exist, all commits verified.

---
*Phase: 13-websocket-streaming-transport*
*Completed: 2026-03-27*
