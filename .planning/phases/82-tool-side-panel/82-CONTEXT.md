# Phase 82 Context — v32 Tool Call Side Panel

## Goal

Build the right-side tool inspection panel for the v32 AI chat rewrite. A fixed overlay that slides in from the right when tool calls appear. The panel lets users scrub through tool call history with a slider, auto-tracks live mode as new calls arrive, and drops to manual mode on user navigation. Cmd+I (or Ctrl+I) closes globally. Dispatches `liv-sidebar-toggled` custom events so other components (P81's chat surface) can shift their width.

This is a direct Suna port of `tool-call-side-panel.tsx` adapted for LivOS's ToolCallSnapshot model (P87's `batchId` field, P81's type shapes) and styled exclusively with v32 `liv-*` tokens (P80).

## ROADMAP Entry

Phase 82: Tool Side Panel — ROADMAP.md line 65:
> `ToolCallPanel.tsx` (`fixed inset-y-0 right-0 z-30` overlay, slide-in animation, slider scrubber, live/manual mode, "Jump to Live" pill, Cmd+I close, `liv-sidebar-toggled` event). `isVisualTool(name)` regex extended to `mcp_bytebot_*`. Wave 2 parallel P81+P83.

## Files Owned (this phase ONLY)

| File | Description |
|------|-------------|
| `livos/packages/ui/src/routes/ai-chat/v32/ToolCallPanel.tsx` | Main component — 480px fixed right panel |
| `livos/packages/ui/src/routes/ai-chat/v32/lib/is-visual-tool.ts` | `isVisualTool(name)` + `shouldAutoOpen(toolCalls)` |

DO NOT touch:
- `livos/packages/ui/src/routes/ai-chat/v32/index.tsx` (P81's lane)
- `livos/packages/ui/src/routes/ai-chat/v32/views/` (P83's lane)
- `livos/packages/ui/src/routes/ai-chat/v32/types.ts` (P81 creates, read-only for us)
- Anything outside `livos/packages/ui/src/routes/ai-chat/v32/`

## Constraints

- D-LIV-STYLED: `liv-*` Tailwind tokens only (no `zinc-*`, `gray-*`, no raw color values).
- D-LIV-CARD-WIDTH: Panel width fixed at `w-[480px]`. Not 384, not 512.
- D-NO-NEW-DEPS: Framer Motion (already in project), Lucide icons (`X`, `Pause`, `Play`, `Activity`) already present, shadcn Slider from `@/shadcn-components/ui/slider`. No new npm installs.
- ToolCallSnapshot type: import from `./types` if P81 wrote it; otherwise inline minimal shape with TODO comment.
- Zero new TypeScript errors.

## Type Shape Assumed (if types.ts not yet present)

```ts
interface ToolCallSnapshot {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: 'pending' | 'running' | 'complete' | 'error';
  result?: unknown;
  batchId?: string;   // P87 Hermes — all tools in same turn share one UUID
  startedAt: number;
  completedAt?: number;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ToolCallSnapshot[];
}
```

## Behavioral Spec

### Container
```
fixed inset-y-0 right-0 z-30 w-[480px]
bg-liv-card border-l border-liv-border shadow-2xl
```
Framer Motion: `initial={{x: 480}} animate={{x:0}} exit={{x: 480}}` with `transition={{type:'spring', damping:30, stiffness:300}}`.
Wrapped in `<AnimatePresence>` so exit animation fires on close.

### Live / Manual Mode
- Internal state: `'live' | 'manual'`
- Live: `currentIndex` always == `toolCalls.length - 1`, auto-advances when new tools arrive
- Manual: user scrubbed away from last item via slider or prev/next buttons
- Returning to last index via slider or "Jump to Live" pill restores live mode

### Live/Manual badge (top-left of content area)
- Live: green pulsing dot + "Live" text — `animate-pulse` on dot
- Manual: amber dot (no pulse) + "Manual" text

### "Jump to Live" pill
- Appears only when `mode === 'manual'` AND `agentStatus === 'running'`
- Positioned top-right of content area
- On click: sets mode back to live, jumps to last index

### Slider scrubber (bottom of panel)
- Radix slider from `@/shadcn-components/ui/slider`
- `min={0}` `max={toolCalls.length - 1}` `value={[currentIndex]}`
- User drag sets manual mode and updates currentIndex
- Above slider track: tick marks at batchId boundaries (separate batchId = new batch section, rendered as a small divider label)

### batchId grouping
- Group consecutive toolCalls by `batchId`
- Render a small section header above each batch in the scrubber area showing the batch boundary
- For single tools or tools without batchId: no header

### Keyboard shortcut
- `useEffect` registers `keydown` on `window`
- Condition: `(e.metaKey || e.ctrlKey) && e.key === 'i'`
- On match: `e.preventDefault()`, calls `onClose()`
- Cleanup on unmount or when `isOpen` changes

### Custom event
- Every time `isOpen` changes: `window.dispatchEvent(new CustomEvent('liv-sidebar-toggled', {detail:{open: isOpen}}))`

### Content tile (placeholder)
- Renders current ToolCallSnapshot as prettified JSON in a `<pre>` inside a Card-like container
- Clear comment: `{/* P83 will replace this placeholder with ToolViewRegistry */}`
- Shows tool name in a small header above the JSON block

### Empty state
- When `toolCalls.length === 0`: centered icon + "No tool activity" heading + description text

## isVisualTool Regex Rules

```ts
const VISUAL_TOOL_PATTERNS = [
  /^browser_/,         // browser tools (screenshots, DOM)
  /^web_/,             // web search/scrape
  /^mcp_bytebot_/,     // bytebot screenshots/clicks
  /^(read|edit|write)_file/,   // file ops with diff view
  /^(execute|run)_/,  // terminal output
];
```
Returns `true` if any pattern matches, `false` otherwise.

`shouldAutoOpen(toolCalls: ToolCallSnapshot[]): boolean` — returns true if `toolCalls.length > 0` AND `isVisualTool(toolCalls[toolCalls.length - 1].name)`.

## Verification Gates

1. `pnpm --filter ui build` exits 0
2. `pnpm --filter ui exec tsc --noEmit` zero new errors
3. Open `/playground/v32-theme` in dev — `liv-*` tokens render correctly (smoke for the token foundation)
4. Visual smoke for the panel itself deferred to P81's `/ai-chat-v2` preview route

## Dependencies

- Wave 1 complete: P80 (tokens in tailwind.config.ts), P87 (batchId on ToolCallSnapshot shape)
- P81: provides types.ts (read-only for us); panel is consumed by P81's index.tsx
- P83: will replace placeholder tile with ToolViewRegistry
- P88: will wire up SSE streaming that drives toolCalls prop updates
