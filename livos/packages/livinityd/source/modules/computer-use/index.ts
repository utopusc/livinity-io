/**
 * Phase 201 restore — minimal computer-use module barrel.
 *
 * The pre-782ee4a3 barrel re-exported 7 surfaces (task-repository,
 * container-manager, desktop-gateway, routes, luse-tools, luse-system-prompt,
 * luse-mcp-config). Six of those modules are still deleted; restoring them
 * pulls in Phase 71-104 infrastructure (Bytebot container lifecycle, desktop
 * subdomain gateway, computer-use tRPC router) that the v200+ Mastra agent
 * loop no longer needs.
 *
 * This minimal barrel re-exports only what the live system actually uses:
 *   - LUSE_TOOLS / LUSE_TOOL_NAMES / isLuseToolName — Anthropic tool schemas
 *   - Native primitives barrel (screenshot, input, window)
 *
 * The Luse stdio MCP server in `./mcp/server.ts` is NOT re-exported because
 * it is an entry-point script, not a library — McpClientManager spawns it
 * via the Redis-registered command `npx tsx <abs-path-to-server.ts>`.
 */

export {
	LUSE_TOOLS,
	LUSE_TOOL_NAMES,
	LUSE_AUTO_MODE_EXTRA_TOOLS,
	isLuseToolName,
} from './luse-tools.js'
export type {AnthropicTool, LuseToolName} from './luse-tools.js'

export * from './native/index.js'
