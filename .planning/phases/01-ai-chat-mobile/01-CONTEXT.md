# Phase 1: AI Chat Mobile - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Make AI Chat fully usable on mobile: sidebar as drawer, messages within viewport width, compact tool cards, properly positioned input area. Desktop unchanged.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — responsive CSS/layout phase.

Key guidance:
- Sidebar (conversations + agents tabs) should be a slide-in drawer on mobile, toggled via hamburger icon
- Messages must not overflow horizontally — code blocks need overflow-x: auto within constrained width
- Tool call cards should show compact summary (tool name + status), tap to expand full details
- Chat input stays anchored at bottom, works with useKeyboardHeight from Phase 40 (v23.0)
- Use existing useIsMobile() hook for conditional rendering
- Use Tailwind responsive classes (md:, lg:) where possible instead of JS conditionals

</decisions>

<code_context>
## Existing Code Insights

### Key Files
- `livos/packages/ui/src/routes/ai-chat/index.tsx` — main AI Chat page with sidebar + chat area
- `livos/packages/ui/src/routes/ai-chat/chat-input.tsx` — input with file upload (already has keyboard handling)
- `livos/packages/ui/src/routes/ai-chat/chat-messages.tsx` — message rendering with blocks
- `livos/packages/ui/src/hooks/use-agent-socket.ts` — WebSocket hook (already has visibility reconnect)
- `livos/packages/ui/src/hooks/use-is-mobile.ts` — mobile detection

### Existing Mobile Code
- AI Chat already uses `isMobile` in some places
- vaul Drawer already imported in some components
- chat-input.tsx already has useKeyboardHeight + useIsMobile

</code_context>

<specifics>
## Specific Ideas

No specific requirements — responsive layout fixes.

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>
