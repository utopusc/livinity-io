# Phase 20: Conversation Persistence & History - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase ensures that AI Chat conversations survive tab close/reopen and that users can browse and load past conversations from a sidebar. The backend routes already exist (`listConversations`, `getConversation` tRPC routes). The primary work is wiring the frontend to properly load history on mount and enabling the conversation sidebar to list and switch between conversations.

</domain>

<decisions>
## Implementation Decisions

### Message History Loading
- On AI Chat mount, check for active conversation (from URL param or last-used) and load messages from Redis via `getConversation` tRPC query
- Use the existing `conversationIdRef` pattern from v20.0 Phase 17 to track current conversation
- Restore messages into the `useReducer` state via a batch `LOAD_HISTORY` action

### Conversation Sidebar
- Use the existing `ConversationSidebar` component (already exists from v20.0 Phase 17)
- Ensure it properly fetches conversations via `listConversations` on mount
- Click handler should update `conversationIdRef` and load the selected conversation's messages
- Show title (auto-generated from first message), timestamp, and message count

### Claude's Discretion
- Exact visual styling of the conversation list items
- Whether to add a "New Chat" button in the sidebar (recommended)
- How to handle edge cases (deleted conversations, empty conversations)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `listConversations` tRPC query — returns conversation list from Redis
- `getConversation` tRPC query — returns full conversation with messages
- `ConversationSidebar` component — exists but may need wiring fixes
- `conversationIdRef` — useRef tracking current conversation ID
- `useUtils().ai.getConversation.fetch()` — imperative fetch for conversation loading

### Established Patterns
- useReducer for message state (ADD_MESSAGE, FINALIZE_MESSAGE, etc.)
- WebSocket reconnection preserves session via AgentSessionManager
- `initialConvLoaded` ref gate prevents double-load on mount

### Integration Points
- `index.tsx` — AI Chat main page, manages conversation state
- `use-agent-socket.ts` — WebSocket hook, conversation context
- `chat-messages.tsx` — Message rendering
- AiModule routes (`routes.ts`) — tRPC conversation endpoints

</code_context>

<specifics>
## Specific Ideas

- User specifically mentioned: "Bir saat sonra sekmeyi açınca mesajlar kaybolmuş oluyor" (messages disappear after reopening tab)
- The fix should ensure messages are loaded from Redis on component mount, not just during active WebSocket sessions
- Conversation sidebar should show past chats with click-to-load functionality

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 20-conversation-persistence-history*
*Context gathered: 2026-03-28 via smart discuss*
