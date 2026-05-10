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
 *
 * Phase 100-10-04 (D-100-10-C, G-100-10-E) — Redis client lifecycle:
 *
 * This MCP server runs in its OWN Node.js process spawned by livinityd's
 * McpClientManager via the per-WebApp descriptor in `luse-mcp-config.ts`.
 * It DOES NOT share the parent livinityd's ioredis client; instead, it
 * constructs its OWN fresh `new Redis(luseRedisUrl, ...)` from the
 * `LUSE_REDIS_URL` env var threaded through by the descriptor's env
 * block. That fresh client is passed into `registerLuseTools({redis})`
 * so the `mcp__luse__create_stream` handler can read the privilege-gate
 * flag `liv:config:luse_can_create_streams` at call-time.
 */
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js'
// ioredis exports Redis as a named export (NOT default) per project memory.
import {Redis} from 'ioredis'

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

	// P100-10-03 — `LUSE_DISPLAY` env (set by 100-10-01's WebAppWindowManager
	// via 100-10-02's LuseMcpConfig descriptor) scopes the window-aware tools
	// (`mcp__luse__list_windows`, etc.) to this WebApp's allocated Xvfb
	// display (`:10`, `:11`, ...). When unset, fall back to `DISPLAY` so
	// host-display Luse instances still work (legacy behavior).
	const defaultDisplay = process.env.LUSE_DISPLAY ?? process.env.DISPLAY

	// P100-10-04 — construct a FRESH ioredis client from LUSE_REDIS_URL.
	// The parent livinityd process owns its own ioredis instance; this MCP
	// child is a separate Node.js process and cannot share it. The
	// `mcp__luse__create_stream` handler reads the Redis flag
	// `liv:config:luse_can_create_streams` via this local client (G-100-10-E).
	// When `LUSE_REDIS_URL` is absent or the empty string, we DO NOT construct
	// a client — the handler treats `redis === null` as "deny" (fail-closed,
	// same semantics as a thrown Redis error).
	const luseRedisUrl = process.env.LUSE_REDIS_URL
	let redis: Redis | null = null
	if (typeof luseRedisUrl === 'string' && luseRedisUrl.length > 0) {
		try {
			redis = new Redis(luseRedisUrl, {
				lazyConnect: true,
				maxRetriesPerRequest: 1,
			})
		} catch (err) {
			process.stderr.write(
				`[luse-mcp] warning: failed to construct Redis client from LUSE_REDIS_URL: ${(err as Error).message}; create_stream will fail-closed\n`,
			)
			redis = null
		}
	} else {
		process.stderr.write(
			'[luse-mcp] warning: LUSE_REDIS_URL not set; mcp__luse__create_stream will fail-closed (privilege gate denies)\n',
		)
	}

	const server = new McpServer({name: 'luse', version: '1.0.0'})
	// Note: `streamManager` is NOT wired into this MCP child (the StreamManager
	// instance lives in the parent livinityd process and cross-process IPC is
	// out of scope for this plan). Without `streamManager`, the stream-management
	// tool handlers are not registered in this child — the schemas remain
	// visible in LUSE_TOOLS for agent enumeration. Test injection passes a
	// mock streamManager directly to `registerLuseTools`.
	registerLuseTools(server as never, {
		defaultWindowId,
		defaultDisplay,
		redis,
		userId: process.env.LUSE_USER_ID ?? 'admin',
	})

	const transport = new StdioServerTransport()
	await server.connect(transport)

	// Log to STDERR so the MCP stdout wire stays clean.
	process.stderr.write(
		`[luse-mcp] connected via stdio transport${
			defaultWindowId !== undefined ? ` (windowId=${defaultWindowId})` : ''
		}${defaultDisplay !== undefined ? ` (display=${defaultDisplay})` : ''}${
			redis !== null ? ' (redis=connected)' : ' (redis=null, create_stream gated off)'
		}\n`,
	)
}

main().catch((err) => {
	process.stderr.write(`[luse-mcp] fatal error: ${(err as Error).stack ?? String(err)}\n`)
	process.exit(1)
})
