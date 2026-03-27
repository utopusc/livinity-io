# Phase 13: WebSocket Streaming Transport - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a dedicated `/ws/agent` WebSocket endpoint to livinityd that relays SDK messages from the backend to the browser in real-time. Replace the current SSE polling approach with true bidirectional WebSocket streaming. Support mid-conversation messages, interrupts, and auto-reconnection.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — infrastructure phase. Follow the architecture patterns from v20-ARCHITECTURE.md (relay pattern, AsyncGenerator input channel, batched React state updates).

Key architecture decisions already made in research:
- WebSocket, NOT SSE (bidirectional requirement for interrupts/mid-conversation messages)
- Dedicated `/ws/agent` endpoint (not tRPC subscriptions — avoids starving other tRPC calls)
- JWT auth on WebSocket upgrade (existing pattern from tRPC wsClient)
- Relay SDK messages directly with minimal transformation
- Single session per user enforced server-side

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ws` package (^8.18.0) already in dependencies
- Existing WebSocket patterns: `/ws/desktop` for VNC, tRPC wsLink
- JWT auth middleware in livinityd
- `SdkAgentRunner` with EventEmitter-based streaming
- v20-ARCHITECTURE.md has complete component boundaries and wire protocol

### Established Patterns
- WebSocket upgrade with JWT query param auth (trpc.ts wsClient pattern)
- Express server with multiple WebSocket endpoints (server/index.ts)
- 15s heartbeat for proxy keepalive
- Auto-reconnect with exponential backoff (1s-30s)

### Integration Points
- livinityd Express server — add `/ws/agent` upgrade handler
- `sdk-agent-runner.ts` — consume SDK messages, relay to WebSocket
- `livos/packages/ui/src/routes/ai-chat/` — new useAgentSocket hook
- AI module (`modules/ai/index.ts`) — may need refactoring to use WebSocket instead of HTTP fetch

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Follow v20-ARCHITECTURE.md patterns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
