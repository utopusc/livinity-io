/**
 * Phase 197-02 — McpBridge.
 *
 * Phase 201 update (2026-05-23) — selfclaude HTTP source removed (operator
 * directive: only Luse needed). Luse stdio source now defaults to running the
 * in-repo Luse server via `npx tsx <abs-path>/computer-use/mcp/server.ts`
 * instead of looking for a pre-built `LUSE_MCP_PATH` binary. The original
 * env-var override path is still honoured for production deploys that ship a
 * compiled binary.
 *
 * Consumes computer-use tools from Luse stdio via Mastra's MCPClient and
 * exposes them to the Liv AI agent as a namespaced tool map. The Luse source
 * is independently optional — livinityd boot never crashes from a missing
 * binary; the bridge silently degrades.
 *
 * Destructive Luse tools (6 named entries) get a `meta.requireApproval = true`
 * flag attached at namespace-time. Plan 197-05's SSE layer detects these
 * destructive chunks by NAME via the exported `destructiveToolNames` Set
 * (N-01 lock — never reaches into chunk.tool.meta).
 *
 * Threat mitigations honoured:
 *   T-197-02-01 (T): fs.access(luse spawn target, X_OK or R_OK) gates spawn.
 *   T-197-02-02 (I): MCPClient id parameter MANDATORY ('livos-mcp-bridge').
 *   T-197-02-05 (E): 6 destructive tools tagged with requireApproval.
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import {fileURLToPath} from 'node:url'

import {MCPClient} from '@mastra/mcp'

import {LuseMcpUnavailableError} from './mcp-errors.js'

// Phase 201 — default Luse spawn target: the in-repo TSX server. Resolved
// from this module's own URL so it works under both dev (tsx packages/
// livinityd/source/...) and the production install (rsync'd to /opt/livos/).
// The env var LUSE_MCP_PATH still wins when set (production binaries, custom
// builds, test harnesses).
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_LUSE_SERVER_TSX = path.resolve(
	__dirname,
	'../computer-use/mcp/server.ts',
)

// Source of truth for destructive Luse tool names (UNNAMESPACED).
const DESTRUCTIVE_LUSE_TOOLS = new Set([
	'computer_click_mouse',
	'computer_type_text',
	'computer_press_keys',
	'computer_application',
	'computer_drag_mouse',
	'computer_paste_text',
] as const)

/**
 * N-01 lock — NAMESPACED destructive tool names. Plan 197-05's SSE chunk
 * handler imports this Set and uses `destructiveToolNames.has(chunk.toolName)`
 * for stable name-based detection (no chunk.tool.meta surface dependency).
 */
export const destructiveToolNames: ReadonlySet<string> = new Set([
	'luse_computer_click_mouse',
	'luse_computer_type_text',
	'luse_computer_press_keys',
	'luse_computer_application',
	'luse_computer_drag_mouse',
	'luse_computer_paste_text',
])

export interface McpBridge {
	listTools(): Promise<Record<string, unknown>>
	destroy(): Promise<void>
}

export interface McpBridgeLogger {
	warn(msg: string, err?: unknown): void
	info(msg: string): void
}

export interface McpBridgeRedis {
	get(key: string): Promise<string | null>
}

export interface McpBridgeDeps {
	redis: McpBridgeRedis
	logger: McpBridgeLogger
}

export interface McpBridgeOptions {
	/** Test seam — defaults to `(opts) => new MCPClient(opts)`. */
	mcpClientFactory?: (opts: ConstructorParameters<typeof MCPClient>[0]) => MCPClient
	/** Phase 201 — selfclaude removed; keep param for API compat. */
	fetchImpl?: typeof globalThis.fetch
}

function readBoolFlag(value: string | null, defaultValue: boolean): boolean {
	if (value === null) return defaultValue
	if (value === 'true' || value === '1') return true
	if (value === 'false' || value === '0') return false
	return defaultValue
}

export async function createMcpBridge(
	deps: McpBridgeDeps,
	options: McpBridgeOptions = {},
): Promise<McpBridge> {
	const mcpClientFactory =
		options.mcpClientFactory ?? ((opts) => new MCPClient(opts))

	const luseEnabled = readBoolFlag(await deps.redis.get('liv:mcp:luse:enabled'), true)

	const servers: Record<string, unknown> = {}

	// ─── Luse stdio ────────────────────────────────────────────────────────
	// Phase 201 — Luse server is restored from 782ee4a3 and lives at
	// modules/computer-use/mcp/server.ts. Spawn target is either:
	//   1. process.env.LUSE_MCP_PATH if set → executed as-is (production binary)
	//   2. otherwise → `npx tsx <repo-abs-path-to-server.ts>` via DEFAULT_LUSE_SERVER_TSX
	// Either way, MCPClient receives a stdio spawn command + args pair.
	if (luseEnabled) {
		const lusePathEnv = process.env.LUSE_MCP_PATH
		let command: string
		let args: string[] = []
		let probePath: string

		if (lusePathEnv) {
			command = lusePathEnv
			probePath = lusePathEnv
		} else {
			// tsx wrapper around the in-repo TSX server. fs.access checks the .ts
			// source (R_OK is enough; tsx itself decides whether to compile).
			command = process.execPath.endsWith('node') ? 'npx' : 'npx'
			args = ['tsx', DEFAULT_LUSE_SERVER_TSX]
			probePath = DEFAULT_LUSE_SERVER_TSX
		}

		try {
			await fs.access(
				probePath,
				lusePathEnv ? fs.constants.X_OK : fs.constants.R_OK,
			) // T-197-02-01
			servers.luse = {command, args}
			deps.logger.info(
				lusePathEnv
					? `Luse MCP source enabled (env binary): ${lusePathEnv}`
					: `Luse MCP source enabled (tsx ${DEFAULT_LUSE_SERVER_TSX})`,
			)
		} catch (err) {
			deps.logger.warn(
				lusePathEnv
					? 'LUSE_MCP_PATH not executable — skipping Luse source'
					: `Default Luse server.ts not readable at ${DEFAULT_LUSE_SERVER_TSX} — skipping Luse source`,
				err,
			)
		}
	}

	if (Object.keys(servers).length === 0) {
		deps.logger.info(
			'McpBridge constructed with no sources — agent will have no computer-use tools',
		)
		return {
			async listTools() {
				return {}
			},
			async destroy() {
				/* no-op */
			},
		}
	}

	// T-197-02-02 — MANDATORY id parameter on MCPClient.
	const client = mcpClientFactory({
		id: 'livos-mcp-bridge',
		servers: servers as never,
	})

	return {
		async listTools(): Promise<Record<string, unknown>> {
			const raw = (await (client as unknown as {getTools(): Promise<Record<string, unknown>>}).getTools()) ?? {}
			const out: Record<string, unknown> = {}
			for (const [name, def] of Object.entries(raw)) {
				const match = /^luse_(.+)$/.exec(name)
				if (match && DESTRUCTIVE_LUSE_TOOLS.has(match[1] as never)) {
					const original = (def ?? {}) as {meta?: Record<string, unknown>}
					out[name] = {
						...original,
						meta: {...(original.meta ?? {}), requireApproval: true},
					}
				} else {
					out[name] = def
				}
			}
			return out
		},
		async destroy(): Promise<void> {
			const disconnect = (client as unknown as {disconnect?: () => Promise<void>}).disconnect
			if (typeof disconnect === 'function') {
				try {
					await disconnect.call(client)
				} catch {
					/* swallow — best-effort teardown */
				}
			}
		},
	}
}

// Helper export so tests / Plan 197-04 can assert against the unnamespaced set
// without re-declaring the literal.
export const DESTRUCTIVE_LUSE_TOOLS_UNNAMESPACED: ReadonlySet<string> = DESTRUCTIVE_LUSE_TOOLS as never

// Phase 201 — ALLOWED_SELFCLAUDE_HOSTS re-export removed alongside the
// selfclaude HTTP source. If a future plan re-introduces an HTTP-based MCP,
// add its allow-list here.
