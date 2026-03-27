# Phase 14: Chat UI Foundation - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the old AI Chat message rendering with a clean, professional chat interface purpose-built for agent interactions. Streaming text, markdown with syntax-highlighted code blocks, error states. This is a fresh implementation, not a patch on the old chat.

</domain>

<decisions>
## Implementation Decisions

### Visual Design
- Professional, minimal design — dark theme consistent with existing LivOS UI
- No generic AI chat aesthetics — this should feel like a real developer tool (think Claude Code CLI but in browser)
- Messages: clean typography, proper spacing, no avatar bubbles needed
- Code blocks: syntax-highlighted with Shiki (via streamdown), copy button
- Streaming text: smooth word-by-word appearance, no layout jumps or flicker

### Streaming Markdown
- Use `streamdown` library for streaming markdown rendering (recommended in v20-STACK.md)
- Replace `react-markdown` for the agent chat view (keep react-markdown for other views)
- Handle unterminated code fences, incomplete tables gracefully during streaming
- requestAnimationFrame batching for smooth rendering

### Message Types
- User messages: simple text, right-aligned or visually distinct
- Assistant messages: streamdown-rendered markdown with tool call cards (Phase 15)
- System messages: init, compaction boundaries (subtle, non-intrusive)
- Error messages: red/orange, actionable text (SDK failure, network error, rate limit)

### Input Area
- Auto-resize textarea (grows with content, max ~6 lines)
- Send button toggles to Stop button when agent is streaming
- Enter to send, Shift+Enter for newline
- Disabled state when disconnected

### Layout
- Keep existing sidebar (conversations, MCP, Skills tabs) — don't rebuild
- Replace only the main chat area (message list + input)
- Auto-scroll to bottom with smart "user scrolled up" detection
- Connection status indicator (from useAgentSocket)

### Claude's Discretion
- Exact colors, spacing, and animation timings
- Component file structure within ai-chat directory
- Whether to use separate component files or inline in index.tsx
- Framer Motion animation details

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useAgentSocket` hook (Phase 13) — provides messages, isConnected, isStreaming, send, interrupt
- Existing `ai-chat/index.tsx` — sidebar structure, conversation management
- Framer Motion already in project for animations
- Tailwind + shadcn/ui design system
- `streamdown` to be added as dependency

### Established Patterns
- Tailwind for styling, shadcn/ui components (Button, ScrollArea, etc.)
- Framer Motion for enter/exit animations
- React 18 with functional components and hooks
- Dark theme with zinc/slate color palette

### Integration Points
- `useAgentSocket` hook returns ChatMessage[] with role, content, toolCalls, isStreaming
- Sidebar ConversationSidebar component in existing index.tsx
- Window system wraps via `ai-chat-content.tsx`

</code_context>

<specifics>
## Specific Ideas

User directive: "profesyonel bir sekilde" (professionally) — the UI must feel polished, not like a prototype. Think Claude Code web UI quality. Real-time, no lag, no jank.

</specifics>

<deferred>
## Deferred Ideas

- Tool call visualization cards (Phase 15)
- Mid-conversation interaction UI (Phase 16)
- Conversation history sidebar enhancement (Phase 17)
- Cost display (Phase 18)

</deferred>
