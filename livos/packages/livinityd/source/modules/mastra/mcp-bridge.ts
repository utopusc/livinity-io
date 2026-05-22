/**
 * Phase 197-02 — McpBridge.
 *
 * Consumes computer-use tools from two MCP sources (Luse stdio + selfclaude
 * HTTP) via Mastra's MCPClient and exposes them to the Liv AI agent as a
 * unified, namespaced tool map. Each source is independently optional —
 * livinityd boot never crashes from a missing binary or unreachable HTTP
 * endpoint; the bridge silently degrades.
 *
 * Destructive Luse tools (6 named entries) get a `meta.requireApproval = true`
 * flag attached at namespace-time. Plan 197-05's SSE layer detects these
 * destructive chunks by NAME via the exported `destructiveToolNames` Set
 * (N-01 lock — never reaches into chunk.tool.meta).
 *
 * Threat mitigations honoured:
 *   T-197-02-01 (T): fs.access(LUSE_MCP_PATH, X_OK) gates spawn.
 *   T-197-02-02 (I): MCPClient id parameter MANDATORY ('livos-mcp-bridge').
 *   T-197-02-03 (T): selfclaude URL hostname allow-listed (localhost only).
 *   T-197-02-04 (D): 2_000 ms AbortController timeout on selfclaude HEAD probe.
 *   T-197-02-05 (E): 6 destructive tools tagged with requireApproval.
 */

import * as fs from 'node:fs/promises'

import {MCPClient} from '@mastra/mcp'

import {
	InvalidMcpUrlError,
	LuseMcpUnavailableError,
	SelfclaudeMcpUnavailableError,
} from './mcp-errors.js'

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

const ALLOWED_SELFCLAUDE_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

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
	/** Test seam for fetch (HEAD probe). Defaults to globalThis.fetch. */
	fetchImpl?: typeof globalThis.fetch
}

function readBoolFlag(value: string | null, defaultValue: boolean): boolean {
	if (value === null) return defaultValue
	if (value === 'true' || value === '1') return true
	if (value === 'false' || value === '0') return false
	return defaultValue
}

async function probeSelfclaudeHead(
	url: URL,
	fetchImpl: typeof globalThis.fetch,
): Promise<boolean> {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), 2_000)
	try {
		const resp = await fetchImpl(url, {method: 'HEAD', signal: controller.signal})
		clearTimeout(timer)
		return resp.ok || resp.status === 405 // some MCP servers reject HEAD with 405; treat as alive
	} catch {
		clearTimeout(timer)
		return false
	}
}

export async function createMcpBridge(
	deps: McpBridgeDeps,
	options: McpBridgeOptions = {},
): Promise<McpBridge> {
	const mcpClientFactory =
		options.mcpClientFactory ?? ((opts) => new MCPClient(opts))
	const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)

	const luseEnabled = readBoolFlag(await deps.redis.get('liv:mcp:luse:enabled'), true)
	const selfclaudeEnabled = readBoolFlag(
		await deps.redis.get('liv:mcp:selfclaude:enabled'),
		true,
	)

	const servers: Record<string, unknown> = {}

	// ─── Luse stdio ────────────────────────────────────────────────────────
	if (luseEnabled) {
		const lusePath = process.env.LUSE_MCP_PATH
		if (!lusePath) {
			deps.logger.warn(
				'Luse MCP enabled but LUSE_MCP_PATH env var unset — skipping Luse source',
			)
		} else {
			try {
				await fs.access(lusePath, fs.constants.X_OK) // T-197-02-01
				servers.luse = {command: lusePath, args: []}
				deps.logger.info(`Luse MCP source enabled: ${lusePath}`)
			} catch (err) {
				deps.logger.warn(
					'LUSE_MCP_PATH not executable — skipping Luse source',
					err,
				)
			}
		}
	}

	// ─── selfclaude HTTP ───────────────────────────────────────────────────
	if (selfclaudeEnabled) {
		const rawUrl = process.env.SELFCLAUDE_MCP_URL ?? 'http://localhost:8090/mcp'
		let parsed: URL
		try {
			parsed = new URL(rawUrl)
		} catch {
			throw new InvalidMcpUrlError(rawUrl, 'malformed URL')
		}
		if (!ALLOWED_SELFCLAUDE_HOSTS.has(parsed.hostname)) {
			throw new InvalidMcpUrlError(rawUrl, `hostname ${parsed.hostname} not in allow-list`)
		}
		const alive = await probeSelfclaudeHead(parsed, fetchImpl)
		if (!alive) {
			deps.logger.warn(
				`selfclaude MCP at ${rawUrl} did not respond within 2_000 ms — skipping selfclaude source`,
			)
		} else {
			servers.selfclaude = {url: parsed}
			deps.logger.info(`selfclaude MCP source enabled: ${rawUrl}`)
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

// Re-export ALLOWED_SELFCLAUDE_HOSTS so tests can assert against the literal
// without reaching into module internals.
export {ALLOWED_SELFCLAUDE_HOSTS}
