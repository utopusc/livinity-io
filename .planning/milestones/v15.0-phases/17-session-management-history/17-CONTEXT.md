# Phase 17: Session Management + History - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Persist conversations across sessions. Users can browse and resume past conversations from the existing sidebar. Conversations stored in Redis with metadata.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
Infrastructure phase — wiring session persistence into existing conversation sidebar:
- Store conversations in Redis (existing pattern from nexus SessionManager)
- Auto-generate title from first user message
- Sidebar already exists with conversation list — wire it to use new session data
- Resume: load history into useAgentSocket state, new messages continue from there
- New conversation button clears state and starts fresh session

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Existing ConversationSidebar in ai-chat/index.tsx — already has list, delete, create new
- Existing conversation tRPC routes (listConversations, getConversation, deleteConversation)
- Redis-based conversation storage in ai/index.ts
- AgentSessionManager with session_id tracking

### Integration Points
- ai-chat/index.tsx — ConversationSidebar, conversation state management
- use-agent-socket.ts — needs to accept initial messages for resume
- agent-session.ts — session persistence on completion
- ai/routes.ts — tRPC routes for conversation CRUD

</code_context>

<specifics>
## Specific Ideas

No specific requirements — extend existing conversation infrastructure to work with WebSocket sessions.

</specifics>

<deferred>
## Deferred Ideas

None

</deferred>
