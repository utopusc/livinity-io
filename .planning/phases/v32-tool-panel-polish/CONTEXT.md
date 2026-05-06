# v32 Tool Panel + Visual Polish — Context

## Goal
1. New right-side tool panel (right-tool-panel.tsx) — 480px fixed overlay, Framer Motion slide-in, Cmd+I toggle, auto-open on tool call.
2. Visual polish on index.tsx — Tailwind class only, zero functional/positional changes.

## Source files
- `livos/packages/ui/src/routes/ai-chat/index.tsx` — main page, mount point for RightToolPanel
- `livos/packages/ui/src/hooks/use-agent-socket.ts` — exports ChatToolCall, messages[] with toolCalls[] on each assistant message
- `livos/packages/ui/src/routes/ai-chat/chat-messages.tsx` — existing inline tool rendering reference
- `livos/packages/ui/src/styles/v32-tokens.css` — --liv-* design tokens

## Tool call event shape (from use-agent-socket.ts)
The hook exposes `agent.messages: ChatMessage[]`. Each assistant message has:
  - `message.toolCalls: ChatToolCall[]` — flat list of tool calls for that message
  - `message.blocks: ContentBlock[]` — interleaved text + tool blocks

ChatToolCall interface:
```ts
{
  id: string
  name: string
  input: Record<string, unknown>
  status: 'running' | 'complete' | 'error'
  output?: string
  elapsedSeconds?: number
  errorMessage?: string
}
```

## Panel strategy
- Derive tool calls from `agent.messages` (already available in the parent) — collect all
  ChatToolCall objects across all assistant messages, newest first.
- Pass `messages` and `isStreaming` as props so the panel is a pure display component.
- Auto-open: track previous tool count; when it increases during streaming, set panelOpen=true.
- Cmd+I shortcut toggles panel.

## Computer-use / browser-use detection
Tool name patterns (from chat-messages.tsx getToolIcon helper):
- Shell: /shell|command|bash|exec/
- File: /file|read|write|edit/
- Docker: /docker|container/
- Screenshot / computer use: name includes 'screenshot', 'computer', 'click', 'type', 'key', 'scroll'
- Browser: name includes 'browser_navigate', 'browser_click', 'browser_get_dom', 'browser_screenshot'
Image output detection: output contains base64 data URI or a key like screenshot_base64 in input.

## Visual polish targets (index.tsx)
- New Chat button: add bg-liv-primary text-liv-primary-foreground + visible label + kbd hint
- Active tab: font-semibold (already has border-b-2 border-liv-primary)
- Conversation rows: py-2.5 (already applied in commit 798ecd34 — verify)
- Hero heading: text-3xl font-semibold
- Description text: text-base text-liv-muted-foreground
- Action chips: px-4 py-2, hover:scale-[1.02]
- Composer Card: border-liv-border (already present), no padding change needed in chat-input (it's p-3 md:p-4)

## Constraints
- ZERO changes to liv/packages/core/ — sacred SHA f3538e1d unchanged
- No new npm deps
- liv-* tokens only for new styling
