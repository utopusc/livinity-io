#!/usr/bin/env tsx
/**
 * Luse MCP server (renamed P100-10-02 from Bytebot MCP server per D-100-10-B) —
 * stdio JSON-RPC entry point.
 *
 * Phase 72-native-05 — Wave-2 deliverable. Spawned as a child process by
 * livinityd's existing McpClientManager (config wiring lands in 72-native-06).
 *
 * Apache 2.0 attribution
 * ─────────────────────────
 * The 17 tool schemas this server exposes (LUSE_TOOLS) and the action
 * dispatch strategy are derived from upstream bytebot project (Apache 2.0):
 *   https://github.com/bytebot-ai/bytebot
 *
 * Apache 2.0 NOTICE: full license text mirrored at
 * `.planning/licenses/bytebot-LICENSE.txt`.
 *
 * Architecture decisions (per 72-CONTEXT.md):
 *   D-NATIVE-03 — stdio MCP server (NO HTTP listener).
 *   D-NATIVE-04 — Tool handlers dispatch to native primitives.
 *   D-NATIVE-10 — Server name `luse` matches `mcp_luse_*` categorize patch.
 *
 * Spawn:
 *   tsx /opt/livos/packages/livinityd/source/modules/computer-use/mcp/server.ts
 *
 * Wire (JSON-RPC 2.0 over stdin/stdout). Logs go to stderr exclusively —
 * stdout is reserved for the MCP wire and any stray stdout writes will
 * corrupt the protocol stream.
 */
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js'

import {registerLuseTools} from './tools.js'

async function main(): Promise<void> {
	// Phase 97-05 — optional per-WebApp window scoping. When the parent
	// (mcp-client-manager.ts via luse-mcp-config.ts buildLuseConfig
	// with a PerWebAppMcpDescriptor) sets LUSE_TARGET_WINDOW_ID in this
	// child's env, every native primitive call defaults to that wid unless
	// the tool input explicitly overrides it. When unset, host-display
	// behavior is preserved (existing pre-P97 default).
	const targetWindowEnv = process.env.LUSE_TARGET_WINDOW_ID
	let defaultWindowId: number | undefined
	if (typeof targetWindowEnv === 'string' && targetWindowEnv.length > 0) {
		const parsed = Number(targetWindowEnv)
		if (Number.isFinite(parsed) && Number.isInteger(parsed) && parsed > 0) {
			defaultWindowId = parsed
		} else {
			process.stderr.write(
				`[luse-mcp] warning: LUSE_TARGET_WINDOW_ID=${JSON.stringify(targetWindowEnv)} is not a positive integer; ignoring (host-display default)\n`,
			)
		}
	}

	const server = new McpServer({name: 'luse', version: '1.0.0'})
	registerLuseTools(server as never, {defaultWindowId})

	const transport = new StdioServerTransport()
	await server.connect(transport)

	// Log to STDERR so the MCP stdout wire stays clean.
	process.stderr.write(
		`[luse-mcp] connected via stdio transport${
			defaultWindowId !== undefined ? ` (windowId=${defaultWindowId})` : ''
		}\n`,
	)
}

main().catch((err) => {
	process.stderr.write(`[luse-mcp] fatal error: ${(err as Error).stack ?? String(err)}\n`)
	process.exit(1)
})
