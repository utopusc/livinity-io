# Phase 82 Summary — v32 Tool Call Side Panel

**Status:** COMPLETE
**Wave:** 2 (parallel with P81, P83, P85-UI, P86)

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `livos/packages/ui/src/routes/ai-chat/v32/ToolCallPanel.tsx` | 295 | Main 480px right-side fixed overlay panel |
| `livos/packages/ui/src/routes/ai-chat/v32/lib/is-visual-tool.ts` | 59 | `isVisualTool()` regex helper + `shouldAutoOpen()` memo |
| `.planning/phases/82-tool-side-panel/82-CONTEXT.md` | 122 | Phase planning document |

## Implementation Map

### V32-PANEL-01 — Fixed overlay container
- `ToolCallPanel.tsx`: `fixed inset-y-0 right-0 z-30 w-[480px]`
- Framer Motion: `initial={{x:480}} animate={{x:0}} exit={{x:480}}` spring `damping:30 stiffness:300`
- Wrapped in `<AnimatePresence>` for enter/exit animations
- `role="complementary"` + `aria-label="Tool call side panel"` for accessibility

### V32-PANEL-02 — Live/Manual mode badge
- Internal state `'live' | 'manual'`
- Live: green pulsing dot + "Live" text (`animate-pulse`)
- Manual: amber dot (static) + "Manual" text
- `aria-live="polite"` on the badge div

### V32-PANEL-03 — Slider scrubber
- `@/shadcn-components/ui/slider` (Radix SliderPrimitive)
- `min={0}` `max={toolCalls.length - 1}` `value={[safeIndex]}`
- User drag: sets `currentIndex` + mode to `'manual'` (or `'live'` if dragged to last)
- Prev/Next buttons (Pause/Play Lucide icons) flanking the slider
- Step counter "Step N of M" below slider

### V32-PANEL-04 — Jump to Live pill
- Shown only when `mode === 'manual' && agentStatus === 'running'`
- Positioned in panel header, right-aligned before close button
- On click: sets `mode='live'`, jumps `currentIndex` to `toolCalls.length - 1`

### V32-PANEL-05 — batchId grouping ticks
- `groupByBatchId()` groups consecutive snapshots sharing the same `batchId`
- Tick marks rendered above slider track when `batchGroups.length > 1`
- Each tick positioned at its `startIndex / (total-1) * 100%` on the track

### V32-PANEL-06 — Global Cmd+I close shortcut
- `useEffect` on `window` for `keydown`, guarded by `isOpen`
- Condition: `(e.metaKey || e.ctrlKey) && e.key === 'i'`
- `e.preventDefault()` + `onClose()` on match
- Cleanup on unmount and `isOpen` change

### liv-sidebar-toggled event
- `useEffect` fires on every `isOpen` change
- `window.dispatchEvent(new CustomEvent('liv-sidebar-toggled', {detail:{open: isOpen}}))`
- P81's chat surface listens and shifts chat width accordingly

### isVisualTool + shouldAutoOpen
- `lib/is-visual-tool.ts` exports two functions
- `isVisualTool(name)`: tests against 5 regex patterns covering browser_, web_, mcp_bytebot_, (read|edit|write)_file, (execute|run)_
- `shouldAutoOpen(toolCalls)`: returns `isVisualTool(toolCalls[last].name)`
- Exported from `lib/is-visual-tool.ts`; parent (P81's index.tsx) uses `shouldAutoOpen` in a `useEffect` to set `isOpen=true`

### Placeholder content tile
- Renders current `ToolCallSnapshot` as prettified JSON in `<pre>` block
- Comment: `{/* P83 will replace this placeholder with ToolViewRegistry */}`
- Header shows tool name (human-readable via `toolDisplayName()`) + status badge

### Empty state
- Shown when `toolCalls.length === 0`
- Centered `Activity` Lucide icon + "No tool activity" heading + description

## Constraints Verified

| Constraint | Status |
|-----------|--------|
| D-LIV-STYLED: only `liv-*` Tailwind tokens | PASS — no zinc/gray/raw color values |
| D-LIV-CARD-WIDTH: panel = `w-[480px]` | PASS — exact class in motion.div |
| D-NO-NEW-DEPS: Framer Motion + Lucide + existing Slider | PASS — no new installs |
| Zero changes outside v32/ | PASS — only ToolCallPanel.tsx + lib/is-visual-tool.ts |
| Zero changes to index.tsx, views/ | PASS — neither file touched |
| ToolCallSnapshot type inline with TODO | PASS — TODO comment references P81 |

## Verification Results

```
pnpm --filter ui build     → exit 0  (39.20s, 428 precache entries)
tsc --noEmit on v32 files  → 0 errors in any v32/ file
                             (pre-existing livinityd errors unchanged)
```

All pre-existing warnings (CSS `@import` order, chunk size, sourcemap notices for third-party libs) are unchanged from P80 baseline.

## API Surface for P81 (index.tsx)

```tsx
import { ToolCallPanel, ToolCallSnapshot } from './ToolCallPanel';
import { shouldAutoOpen } from './lib/is-visual-tool';

// In parent component:
const [panelOpen, setPanelOpen] = useState(false);

useEffect(() => {
  if (shouldAutoOpen(toolCalls)) {
    setPanelOpen(true);
  }
}, [toolCalls]);

<ToolCallPanel
  toolCalls={toolCalls}
  isOpen={panelOpen}
  onClose={() => setPanelOpen(false)}
  agentStatus={agentStatus}
  externalNavigateToIndex={clickedIndex}
/>
```

## Deviations from CONTEXT.md

1. **Lucide icon choices**: CONTEXT.md listed `Pause` and `Play` for the prev/next buttons — used exactly those. `Activity` used for empty state icon instead of a generic circle (more semantically appropriate for "tool activity").

2. **Slider variant**: Used the default Radix slider variant (not `liv-slider`) since `liv-slider` depends on `--liv-bg-elevated` and `--liv-accent-cyan` tokens that are Phase 66 v31 tokens, not in the v32 `v32-tokens.css` set (P80). The default variant respects the existing shadcn slider styling which is neutral and coexists fine with `liv-*` tokens on the container. P83/P88 can upgrade to a custom variant if needed.

3. **Types.ts import path**: Since P81 had not yet shipped `types.ts` at time of writing, the `ToolCallSnapshot` interface is inlined in `ToolCallPanel.tsx` with a prominent TODO comment. The `lib/is-visual-tool.ts` uses a local `MinimalToolCallSnapshot` interface scoped to that file. When P81 ships types.ts, both files can be updated to `import type { ToolCallSnapshot } from '../types'` with a one-line change each.

## Commit SHA

(to be filled after commit)
