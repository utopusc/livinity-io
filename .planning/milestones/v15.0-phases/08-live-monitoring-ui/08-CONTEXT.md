# Phase 8: Live Monitoring UI - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Add live computer use monitoring to the LivOS AI chat — when AI is controlling a device, users see a real-time screenshot feed, action overlays (click markers, typed text), a session timeline, and pause/stop/resume controls.

Uses existing polling infrastructure (chatStatus map polled every 500ms) — no SSE/WebSocket changes needed. Screenshots are stored in the chatStatus map and displayed in a panel similar to CanvasPanel.

</domain>

<decisions>
## Implementation Decisions

### Screenshot Display
- Extend chatStatus map to include latest `screenshot` base64 data during computer use sessions
- Backend stores screenshot from tool_call observation events (when tool is device_*_screenshot)
- Create ComputerUsePanel component (similar to canvas-panel.tsx pattern) showing full-screen screenshot
- Panel appears in the split-pane right side (desktop) or overlay (mobile) during active computer use sessions

### Action Overlay
- Overlay click markers (red crosshair/dot) at coordinates where AI clicked
- Show typed text badge near where AI typed
- Overlays rendered as absolute-positioned elements on top of the screenshot image
- Keep last 3-5 action markers visible, fade older ones

### Session Timeline
- Extend StatusIndicator to show computer use action timeline during sessions
- Each action entry: icon (mouse/keyboard), description ("Clicked at 450,520", "Typed 'youtube.com'"), timestamp
- Show recent 8-10 actions, scrollable

### Pause/Stop/Resume Controls
- Add control buttons in ComputerUsePanel header: Pause, Resume, Stop
- Pause: set flag in chatStatus that the agent loop reads before next tool call
- Stop: cancel the agent stream
- Use tRPC mutations: ai.pauseComputerUse, ai.stopComputerUse

### Claude's Discretion
- Exact component styling and layout details
- Whether to use tabs or integrated view for timeline
- Animation details for action overlays
- How screenshot is scaled to fit the panel

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `livos/packages/ui/src/routes/ai-chat/canvas-panel.tsx` — Side panel pattern with header, content, error boundary
- `livos/packages/ui/src/routes/ai-chat/index.tsx` — StatusIndicator (lines 161-317) polls chatStatus every 500ms
- `livos/packages/ui/src/routes/my-devices/index.tsx` — Device cards, activity dialog, audit entry rows
- `livos/packages/livinityd/source/modules/ai/index.ts` — chatStatus map, chat() method with SSE parsing

### Established Patterns
- chatStatus map: `{conversationId → {status, tool, steps, commands, turn, awaitingApproval}}`
- StatusIndicator polls via `trpcReact.ai.getChatStatus` with `refetchInterval: 500`
- CanvasPanel: split-pane right side on desktop, overlay on mobile
- ToolCallDisplay: expandable cards with tool name, params, result
- New HTTP routes added to `httpOnlyPaths` in common.ts

### Integration Points
- `livos/packages/livinityd/source/modules/ai/index.ts` — extend chatStatus map with screenshot field
- `livos/packages/livinityd/source/modules/ai/routes.ts` — add pause/stop mutations
- `livos/packages/ui/src/routes/ai-chat/index.tsx` — render ComputerUsePanel when session active
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` — add new routes to httpOnlyPaths

</code_context>

<specifics>
## Specific Ideas

- Screenshot image should be displayed at full panel width with aspect ratio preserved
- Click overlay: red circle (8px) with brief animation on appear
- Type overlay: small label near last click position with the text that was typed
- Timeline entries should have relative timestamps ("2s ago", "5s ago")

</specifics>

<deferred>
## Deferred Ideas

- Session replay/scrubber (future)
- Multi-device simultaneous monitoring (future)
- Recording computer use sessions as video (future)

</deferred>
