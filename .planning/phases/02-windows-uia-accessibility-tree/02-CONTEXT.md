# Phase 2: Windows UIA Accessibility Tree - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Add Windows UI Automation (UIA) accessibility tree integration to the agent. Creates a `screen_elements` tool that returns interactive UI elements with precise center coordinates, enabling AI to click by element identity rather than pixel-guessing from screenshots.

</domain>

<decisions>
## Implementation Decisions

### UIA Invocation Architecture
- Persistent PowerShell subprocess spawned once at agent startup, communicates via stdin/stdout JSON IPC (read-eval-print loop)
- PowerShell reads JSON lines from stdin, executes UIA query, writes JSON response to stdout
- On non-Windows platforms, screen_elements returns `{ error: "Not available on {platform}" }` gracefully
- Auto-restart subprocess on next tool call if it crashes, log warning

### Element Format & Filtering
- Pipe-delimited text format: `id|window|control_type|name|(cx,cy)` — compact, lower tokens, proven by Windows-Use
- Interactive control types: Button, Edit, ComboBox, CheckBox, RadioButton, MenuItem, Hyperlink, ListItem, TabItem, Slider, ToggleButton (11 types)
- Element cap: 100 elements max, sorted by proximity to foreground window, then by screen position
- Include window title in each element, abbreviated to 30 chars

### DPI Awareness & Tool Registration
- Set PerMonitorAwareV2 via PowerShell at agent startup: `Add-Type; SetProcessDpiAwarenessContext(-4)` via child_process.execSync
- Register screen_elements in AgentCore tools array and DeviceBridge like other tools (shell, files, screenshot, etc.)
- PowerShell UIA script embedded as string constant in agent-core.ts (no external .ps1 file)
- Element coordinates reported in logical screen coordinates (matching robotjs space, same as Phase 1 screenshot coords)

### Claude's Discretion
- PowerShell script implementation details (exact .NET type loading, COM interface calls)
- Error handling and timeout behavior for UIA queries
- Element deduplication strategy (if multiple elements overlap)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `agent-app/src/main/agent-core.ts` — AgentCore class with tool dispatch (line 310-340), tool registration in tools array (line 194)
- Existing tool pattern: `private toolXxx(params: any): any` methods returning `{ success, output, data }` or `{ error }`
- DeviceBridge tool registration: tools listed in `tools` array, dispatched via `case 'tool_name': return this.toolXxx(params)`
- Phase 1 coordinate system: `this.logicalScreenW`, `this.logicalScreenH`, `this.aiTargetW`, `this.aiTargetH` for coordinate mapping

### Established Patterns
- Native modules loaded via `require()` with lazy loading (see ensureRobot() pattern)
- Tool results: `{ success: true, output: string, data: object }` or `{ error: string }`
- Agent advertises capabilities in tools array when connecting to relay
- child_process.execSync used for shell tool, spawn used for async processes

### Integration Points
- `AgentCore.tools` array (line 194) — add 'screen_elements' to tool list
- Tool dispatch switch (lines 310-340) — add `case 'screen_elements'`
- DeviceBridge in LivOS — will auto-register screen_elements as a proxy tool when agent connects
- Nexus ToolRegistry — device proxy tools get `device_{deviceId}_screen_elements` name

</code_context>

<specifics>
## Specific Ideas

**PowerShell UIA Script Design:**
- Load `System.Windows.Automation` .NET assembly (built into every Windows)
- Use `AutomationElement.RootElement` as tree root
- TreeWalker with `ControlViewWalker` for efficient traversal
- Filter by `ControlType` property to 11 interactive types
- Calculate center coordinates from `BoundingRectangle` property: `cx = rect.Left + rect.Width/2, cy = rect.Top + rect.Height/2`
- Return elements as JSON array to stdout

**Element Format Example:**
```
1|Notepad - Untitled|Button|Close|(1890,12)
2|Notepad - Untitled|Edit|Text Editor|(960,540)
3|Taskbar|Button|Start|(24,1060)
```

</specifics>

<deferred>
## Deferred Ideas

- macOS AXUIElement accessibility backend (XPA-01) — future milestone
- Linux AT-SPI2 accessibility backend (XPA-02) — future milestone
- Element highlighting on screenshots (ENH-01) — future
- Multi-monitor accessibility tree (ENH-02) — future

</deferred>
