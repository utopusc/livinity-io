# v32-bytebot-thumbnail CONTEXT

## Goal
Add a floating 240px thumbnail component that renders the latest bytebot desktop
screenshot during computer-use tool calls. Pure additive overlay — zero changes
to existing components.

## Data Source
`agent.messages` (ChatMessage[]) from `useAgentSocket`. Each ChatMessage has:
- `toolCalls?: ChatToolCall[]`  — `id`, `name`, `input`, `status`, `output` (string)
- `blocks: ContentBlock[]`     — interleaved text/tool blocks

`output` on ChatToolCall is always a plain string. Image data may be JSON-encoded
inside that string (e.g. `{"screenshot_base64": "..."}`) or it may be a raw
base64 string, or the tool result content[] may include image blocks that were
serialized to text.

## Tool Name Patterns
- `mcp__bytebot__screenshot` → matches `/^mcp_bytebot_/i` after stripping double underscore
- `mcp__bytebot__computer_use` → matches similarly
- Raw names like `computer_use`, `screenshot` → match secondary regexes

The hook uses `mcp__servername__toolname` double-underscore format. Regex should
match both `mcp_bytebot_` (single underscore variant) and `mcp__bytebot__` prefix
by normalizing: strip the mcp__ prefix check on lowercase name.

## Image Extraction Strategy
`output` is a string. Parse attempts in order:
1. Try `JSON.parse(output)` — if object, check:
   a. `.screenshot_base64` → `data:image/png;base64,${value}`
   b. `.image_url` → as-is
   c. `.screenshot` → treat as base64 if no protocol, else as-is
   d. `.content[]` items with `type==='image'` and `source.data` → base64
2. If output is raw base64 string (no JSON, no spaces, length > 100) → wrap as png
3. Fallback: no image found

## Dismiss Logic
Local state: `dismissedKey: string | null`. Set to `toolCall.id` when X clicked.
Auto-reset: `useEffect` watching `currentKey` — if `currentKey !== dismissedKey`
(new screenshot arrived), clear dismissedKey automatically so thumbnail reappears.

## Mount Point
`livos/packages/ui/src/routes/ai-chat/index.tsx` — inside the
`activeView === 'chat'` branch, after `<ChatInput />` closes, before the canvas
and computer-use panels. The component is `position: fixed` so it never affects layout.

## Sacred SHA
`f3538e1d811992b782a9bb057d1b7f0a0189f95f` — NO changes to `liv/packages/core/`.

## Files Changed
- NEW: `livos/packages/ui/src/routes/ai-chat/bytebot-thumbnail.tsx`
- MOD: `livos/packages/ui/src/routes/ai-chat/index.tsx` (1 import + 1 JSX line)
