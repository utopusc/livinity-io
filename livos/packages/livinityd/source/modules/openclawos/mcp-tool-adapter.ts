/**
 * Phase 203-06 Task 6 — McpBridge → plugin-rpc adapter.
 *
 * Bridges the existing mastra mcpBridge surface (which returns Mastra-wrapped
 * tools keyed by name) into the `LusePluginRpcMcp` shape consumed by
 * `plugin-rpc.ts`. Avoids a hard import of `@mastra/mcp` types here — we
 * duck-type the surface livinityd already touches:
 *
 *   - listTools(): Promise<Record<string, MastraTool>>
 *   - each MastraTool has `.execute({context}): Promise<unknown>` (the Mastra
 *     wrapper around the underlying `MCPClient.callTool(...)` call)
 *
 * No new dependency, no MCPClient passthrough. The mcpBridge already handles
 * the destructive-tool meta tagging (requireApproval) so the plugin-rpc's
 * `luse.list` surfaces those flags via the tool definitions Mastra emits.
 */

import type {McpBridge} from '../agent-runtime/mcp-bridge.js'
import type {LusePluginRpcMcp} from './plugin-rpc.js'

// Minimal duck-type for a Mastra-wrapped tool — we only call `execute`.
interface MastraToolLike {
	execute?: (input: {context: Record<string, unknown>}) => Promise<unknown>
	description?: string
	parameters?: unknown
	inputSchema?: unknown
	meta?: Record<string, unknown>
}

/**
 * Build the adapter once the mcpBridge is initialized. Returns null when the
 * bridge is unavailable — `plugin-rpc.ts` then surfaces TOOL_NOT_FOUND so the
 * plugin handles graceful degradation.
 */
export function createMcpToolAdapter(bridge: McpBridge | null): LusePluginRpcMcp | null {
	if (!bridge) return null

	return {
		async callTool({serverName, name, args}) {
			// Only luse is supported in the current bridge — selfclaude was removed
			// in Phase 201. Future bridge expansion would add a switch on serverName.
			if (serverName !== 'luse') {
				throw new Error(
					`mcp-tool-adapter: unsupported serverName '${serverName}' (luse only)`,
				)
			}
			const tools = (await bridge.listTools()) as Record<string, MastraToolLike>
			const tool = tools[name]
			if (!tool || typeof tool.execute !== 'function') {
				throw new Error(`mcp-tool-adapter: tool '${name}' not registered on luse`)
			}
			return tool.execute({context: args})
		},
		async getServerTools(serverName) {
			if (serverName !== 'luse') return {}
			const tools = (await bridge.listTools()) as Record<string, MastraToolLike>
			// Filter to only luse_* names (the destructive flag flow needs the
			// requireApproval meta the bridge already attaches in mcp-bridge.ts).
			const out: Record<string, unknown> = {}
			for (const [k, v] of Object.entries(tools)) {
				if (!k.startsWith('luse_')) continue
				out[k] = {
					description: v.description,
					parameters: v.parameters ?? v.inputSchema,
					meta: v.meta,
				}
			}
			return out
		},
	}
}
