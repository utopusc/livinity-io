# Phase 16: Mid-Conversation Interaction - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Enable users to type and send messages while the agent is actively working, with support for interrupting or redirecting the agent. Uses the AsyncGenerator input channel from Phase 13.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
Infrastructure phase — the AsyncGenerator input channel already exists in AgentSessionManager (Phase 13). This phase wires the UI to use it:
- Send follow-up messages via WebSocket `message` type while agent is streaming
- Stop button sends `interrupt` via WebSocket
- ChatInput stays enabled during streaming (currently may be disabled)
- New user messages appear in the chat immediately (optimistic rendering)
- Agent incorporates follow-up in next turn

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AgentSessionManager.sendMessage()` — pushes to input channel AsyncGenerator
- `useAgentSocket.sendFollowUp()` — sends `{ type: 'message', text }` over WebSocket
- `useAgentSocket.interrupt()` — sends `{ type: 'interrupt' }` over WebSocket
- `ChatInput` component with send/stop toggle

### Integration Points
- `chat-input.tsx` — may need to stay enabled during streaming
- `use-agent-socket.ts` — sendFollowUp and interrupt already implemented
- `ws-agent.ts` — handles 'message' and 'interrupt' WebSocket messages

</code_context>

<specifics>
## Specific Ideas

No specific requirements — enable the existing infrastructure.

</specifics>

<deferred>
## Deferred Ideas

None

</deferred>
