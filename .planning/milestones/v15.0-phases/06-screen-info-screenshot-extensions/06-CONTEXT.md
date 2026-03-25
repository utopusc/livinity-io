# Phase 6: Screen Info & Screenshot Extensions - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a `screen_info` tool that returns display resolution, count, and active window info. Extend the existing `screenshot` tool to return image dimensions and scaling factor alongside the JPEG data. These enable the AI to accurately map pixel coordinates for computer use actions.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — infrastructure phase extending existing tool patterns.

Key constraints from Phase 5:
- Follow the same lazy-loading pattern as mouse.ts/keyboard.ts (ensureRobotLoaded)
- @jitsi/robotjs provides `getScreenSize()` for resolution
- `node-screenshots` already captures screenshots — extend its return data
- Register new tool in TOOL_NAMES + switch case in tools.ts
- Add schema to DEVICE_TOOL_SCHEMAS in device-bridge.ts
- For active window info: use `@jitsi/robotjs` getActiveWindow if available, or systeminformation

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `agent/src/tools/screenshot.ts` — existing screenshot tool with lazy node-screenshots import
- `agent/src/tools/mouse.ts` — lazy robotjs loading pattern (ensureRobotLoaded)
- `agent/src/tools.ts` — dispatcher with 17 TOOL_NAMES
- `livos/packages/livinityd/source/modules/devices/device-bridge.ts` — 17 tool schemas

### Established Patterns
- Lazy dynamic import for native addons (prevents crashes on headless)
- Return format: `{ success, output, data?, images? }`
- TOOL_NAMES constant + switch case dispatch

### Integration Points
- tools.ts dispatcher (add screen_info case)
- device-bridge.ts DEVICE_TOOL_SCHEMAS (add screen_info schema, update screenshot schema)
- esbuild.config.mjs / build-sea.mjs (no changes needed — robotjs already external)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase extending existing patterns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
