# Phase 12: MCP Tool Bridge - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Ensure existing LivOS tools (shell, files, Docker, etc.) work reliably through the Claude Agent SDK's MCP tool system. The `buildSdkTools()` + `createSdkMcpServer()` bridge already exists in `sdk-agent-runner.ts` — this phase verifies, hardens, and validates the tool bridge for production use.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — infrastructure phase. The tool bridge already exists; focus on verification, error handling, and ensuring all critical tools work through the SDK path.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SdkAgentRunner.buildSdkTools()` (sdk-agent-runner.ts:62-101) — converts ToolRegistry to SDK MCP tools via Zod schemas
- `paramTypeToZod()` (sdk-agent-runner.ts:32-60) — maps string/number/boolean/array/object to Zod
- `createSdkMcpServer()` — SDK function that hosts tools as MCP server
- `McpClientManager` (mcp-client-manager.ts) — manages external MCP server connections
- `ToolRegistry` (tool-registry.ts) — 42 registered tools with profiles (minimal/basic/coding/messaging/full)

### Established Patterns
- Tools registered via `toolRegistry.register()` with name, description, parameters, execute handler
- Tool profiles filter available tools: minimal (3), basic (5), coding (9), full (all)
- `allowedTools` whitelist in SDK config auto-approves `mcp__nexus-tools__*`
- External MCP servers connected via stdio or streamableHttp transport

### Integration Points
- `sdk-agent-runner.ts` — builds MCP tools and passes to `query()` options
- `tool-registry.ts` — single source of truth for all tool definitions
- `mcp-client-manager.ts` — external MCP server lifecycle management
- Chrome DevTools MCP auto-enabled when CDP reachable at ws://127.0.0.1:9223

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Focus on ensuring reliable tool execution through SDK.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
