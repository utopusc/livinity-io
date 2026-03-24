# Phase 51: Agent Extended Tools -- Processes + Screenshot + System Info - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase implements the remaining three agent tools: process listing, screenshot capture, and system information collection. These are the final stub replacements from Phase 48. After this phase, all agent tools are functional.

</domain>

<decisions>
## Implementation Decisions

### Processes Tool
- Tool name: `processes`
- Parameters: { sortBy?: 'cpu' | 'memory', limit?: number }
- Use `systeminformation` package (already in agent deps from STACK.md research): `si.processes()`
- Return array of: { pid, name, cpu, memory, user } sorted by requested field
- Default: top 20 by CPU usage
- Cross-platform: systeminformation handles Windows/Mac/Linux differences

### System Info Tool
- Tool name: `system_info`
- No parameters required
- Collect via systeminformation: osInfo(), cpu(), mem(), fsSize(), networkInterfaces()
- Return structured JSON: { os: {platform, distro, release, arch, hostname}, cpu: {manufacturer, brand, cores, speed}, memory: {total, used, free, percent}, disks: [{fs, size, used, available, mount}], network: [{iface, ip4, mac}], uptime }
- Collect once per call (not streaming)

### Screenshot Tool
- Tool name: `screenshot`
- Parameters: { display?: number } (default: primary display)
- Use `node-screenshots` package (from STACK.md): Screenshots.all() to enumerate, capture() on selected
- Return: { width, height, data: base64_jpeg_string }
- Compress as JPEG (quality 80) to reduce payload size
- Primary display only for v14.0 (multi-monitor selection deferred)
- If node-screenshots unavailable (native addon issue), return error result gracefully

### Tool Registration Updates
- Update AVAILABLE_TOOLS in agent/src/tools.ts to include parameter schemas for all 3 tools
- These parameter schemas are sent to relay on connect and used by DeviceBridge for proxy tool registration

### Claude's Discretion
- systeminformation function selection for disk/network details
- JPEG compression quality tuning
- Process list field selection beyond the minimum required

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `agent/src/tools.ts` — Tool dispatcher with shell + file tools (Phase 50), stubs for processes/system_info/screenshot
- `agent/src/tools/shell.ts` and `agent/src/tools/files.ts` — Pattern for tool implementation (async function, structured return)

### Established Patterns
- Tool function signature: `async function(params: Record<string, unknown>): Promise<ToolResult>`
- ToolResult: { success: boolean, result: any, error?: string }
- Each tool in its own file under agent/src/tools/
- Dispatcher imports and routes in tools.ts

### Integration Points
- Replace remaining stubs in agent/src/tools.ts dispatcher
- Add new tool files: agent/src/tools/processes.ts, agent/src/tools/system-info.ts, agent/src/tools/screenshot.ts
- May need to npm install systeminformation and node-screenshots in agent/

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond what's described. Follow the established tool pattern from Phase 50.

</specifics>

<deferred>
## Deferred Ideas

- Process kill capability — v14.1 (view-only for safety in v14.0)
- Multi-monitor screenshot selection — v14.1
- Streaming system metrics (periodic telemetry) — v14.1

</deferred>
