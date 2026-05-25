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
import {spawn, type ChildProcessWithoutNullStreams} from 'node:child_process'

import {LuseMcpUnavailableError} from './mcp-errors.js'
import {sweepStaleLocks} from './stale-lock-sweeper.js'
import {
	MCP_CONFIG_REDIS_HASH_KEY,
	MCP_CONFIG_REDIS_PUBSUB_CHANNEL,
	parseEntry,
	type McpServerConfig,
} from '../server/trpc/mcp-config-router.js'

/**
 * Phase 203-08 — Local stdio MCP client. Replaces `@mastra/mcp` MCPClient
 * (purged with @mastra/* deps). Implements the minimal Model Context Protocol
 * surface livinityd actually uses:
 *
 *   - `initialize` handshake on spawn
 *   - `tools/list` for `getTools()` (returns a `{name → {description, parameters/inputSchema}}` map
 *     wrapped with an `.execute({context})` closure that calls `tools/call`)
 *   - `tools/call` for tool invocation
 *   - `disconnect()` tears down the child + cleans up pending requests
 *
 * Supports ONE server per client (livinityd never multiplexed) — the
 * upstream MCPClient `{servers: {name: {command,args}}}` map is collapsed to
 * the first entry's spawn definition. Tool names returned by `getTools()` are
 * namespaced with the server name as prefix (matching the upstream Mastra
 * MCPClient convention `luse_<toolname>`).
 *
 * Wire format: JSON-RPC 2.0 framed with `Content-Length`-style newline
 * delimiters per the MCP stdio spec (https://modelcontextprotocol.io/docs/concepts/transports#stdio).
 *
 * Error handling: child stderr is logged on debug; protocol errors surface as
 * thrown rejections on the in-flight `requests` map; spawn failures are caught
 * at construction and surface via the first `getTools()` rejection so
 * createMcpBridge's degraded path can swallow them per T-197-02-01.
 */
interface McpServerSpawn {
	command: string
	args?: string[]
}

interface McpClientConfig {
	id: string
	servers: Record<string, McpServerSpawn>
}

interface McpToolDescriptor {
	name: string
	description?: string
	inputSchema?: unknown
}

class StdioMcpClient {
	private child: ChildProcessWithoutNullStreams | null = null
	private requestId = 0
	private pending = new Map<
		number,
		{resolve: (v: unknown) => void; reject: (e: unknown) => void}
	>()
	private buffer = ''
	private serverName: string
	private initPromise: Promise<void> | null = null

	constructor(private readonly config: McpClientConfig) {
		const entries = Object.entries(config.servers)
		if (entries.length === 0) {
			throw new Error('StdioMcpClient: no servers configured')
		}
		this.serverName = entries[0]![0]
	}

	private ensureSpawned(): ChildProcessWithoutNullStreams {
		if (this.child) return this.child
		const spawn_ = this.config.servers[this.serverName]!
		const child = spawn(spawn_.command, spawn_.args ?? [], {
			stdio: ['pipe', 'pipe', 'pipe'],
		})
		this.child = child
		child.stdout.on('data', (chunk: Buffer) => this.onStdout(chunk.toString('utf8')))
		// Phase 203-08 — `child` typed `ChildProcessWithoutNullStreams` ships
		// without `.on` in this codebase's @types/node version (same gap hits
		// chrome-cdp/bootstrap.ts, chrome-master/master-login-routes.ts,
		// computer-use/* — pre-existing baseline pattern). Cast to a minimal
		// event-emitter surface to silence the gap without widening the type.
		const childEvents = child as unknown as {
			on(event: 'error' | 'exit', listener: (arg: unknown) => void): void
		}
		childEvents.on('error', (err: unknown) => this.failAllPending(err))
		childEvents.on('exit', (code: unknown) => {
			if (this.pending.size > 0) {
				this.failAllPending(new Error(`StdioMcpClient: child exited code=${String(code)}`))
			}
		})
		return child
	}

	private onStdout(text: string): void {
		this.buffer += text
		let nl: number
		while ((nl = this.buffer.indexOf('\n')) >= 0) {
			const line = this.buffer.slice(0, nl).trim()
			this.buffer = this.buffer.slice(nl + 1)
			if (!line) continue
			try {
				const msg = JSON.parse(line) as {id?: number; result?: unknown; error?: unknown}
				if (typeof msg.id === 'number') {
					const entry = this.pending.get(msg.id)
					if (entry) {
						this.pending.delete(msg.id)
						if (msg.error) entry.reject(msg.error)
						else entry.resolve(msg.result)
					}
				}
			} catch {
				// Ignore unparseable lines (server log noise).
			}
		}
	}

	private failAllPending(err: unknown): void {
		for (const [, entry] of this.pending) entry.reject(err)
		this.pending.clear()
	}

	private rpc(method: string, params?: unknown): Promise<unknown> {
		const child = this.ensureSpawned()
		const id = ++this.requestId
		const payload = JSON.stringify({jsonrpc: '2.0', id, method, params}) + '\n'
		return new Promise<unknown>((resolve, reject) => {
			this.pending.set(id, {resolve, reject})
			try {
				child.stdin.write(payload)
			} catch (err) {
				this.pending.delete(id)
				reject(err)
			}
		})
	}

	private async ensureInitialized(): Promise<void> {
		if (this.initPromise) return this.initPromise
		this.initPromise = (async () => {
			await this.rpc('initialize', {
				protocolVersion: '2025-06-18',
				capabilities: {},
				clientInfo: {name: this.config.id, version: '1.0.0'},
			})
			// Per spec — send `notifications/initialized` once handshake completes.
			const child = this.ensureSpawned()
			try {
				child.stdin.write(
					JSON.stringify({jsonrpc: '2.0', method: 'notifications/initialized'}) + '\n',
				)
			} catch {
				/* swallow — best-effort notification */
			}
		})()
		return this.initPromise
	}

	async getTools(): Promise<Record<string, unknown>> {
		await this.ensureInitialized()
		const result = (await this.rpc('tools/list')) as {tools?: McpToolDescriptor[]}
		const tools = result?.tools ?? []
		const out: Record<string, unknown> = {}
		for (const t of tools) {
			const namespaced = `${this.serverName}_${t.name}`
			const callTool = async (args: {context: Record<string, unknown>}): Promise<unknown> => {
				return this.rpc('tools/call', {name: t.name, arguments: args.context})
			}
			out[namespaced] = {
				description: t.description,
				inputSchema: t.inputSchema,
				parameters: t.inputSchema,
				execute: callTool,
			}
		}
		return out
	}

	async disconnect(): Promise<void> {
		if (!this.child) return
		try {
			this.child.stdin.end()
		} catch {
			/* swallow */
		}
		this.failAllPending(new Error('StdioMcpClient: disconnected'))
		try {
			this.child.kill()
		} catch {
			/* swallow */
		}
		this.child = null
	}
}

// Local alias preserving the call shape mcp-bridge expects.
const MCPClient = StdioMcpClient

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
	/**
	 * Phase 205-03 — reconcile spawned external MCP clients against the
	 * current `liv:mcp:config` hash. Spawns enabled-not-yet-running entries
	 * and disconnects entries that have been deleted or disabled. Exposed
	 * for test seams; the live-reload subscribe loop calls it internally on
	 * each `liv:mcp:updated` publish.
	 */
	reconcileServers(): Promise<void>
}

export interface McpBridgeLogger {
	warn(msg: string, err?: unknown): void
	info(msg: string): void
}

/**
 * Minimal Redis surface mcp-bridge depends on. Production wires the full
 * ioredis client via `this.ai.redis`; tests pass an in-memory fake. The
 * `duplicate()` method MUST return an object with `subscribe`, `on('message',...)`,
 * and `quit()` — ioredis returns a Redis instance which satisfies that surface.
 *
 * Phase 205-03 — `hgetall` + `duplicate` are NEW; previously the bridge only
 * needed `get(key)` for the Luse-enabled flag.
 */
export interface McpBridgeRedis {
	get(key: string): Promise<string | null>
	hgetall(key: string): Promise<Record<string, string>>
	duplicate(): McpBridgeSubRedis
}

export interface McpBridgeSubRedis {
	subscribe(channel: string): Promise<unknown>
	on(event: 'message', listener: (channel: string, message: string) => void): unknown
	quit(): Promise<unknown>
}

export interface McpBridgeDeps {
	redis: McpBridgeRedis
	logger: McpBridgeLogger
}

export interface McpBridgeOptions {
	/**
	 * Test seam — defaults to `(opts) => new MCPClient(opts)`. After Plan 203-08
	 * MCPClient resolves to the local StdioMcpClient (no @mastra/mcp). The
	 * return type is duck-typed to the methods mcp-bridge calls (`getTools`,
	 * `disconnect`) so test mocks need not pull the concrete class.
	 */
	mcpClientFactory?: (opts: McpClientConfig) => {
		getTools(): Promise<Record<string, unknown>>
		disconnect?(): Promise<void>
	}
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

	// ── Phase 208-04 R5 ──────────────────────────────────────────────────────
	// Sweep stale agent locks (>24h) from previous livinityd crashes BEFORE
	// any MCP child spawns. Override root via LIVOS_AGENT_LOCK_DIR (tests +
	// non-production deploys). Non-fatal: missing root logs a single warn.
	const sweepRootDir =
		process.env.LIVOS_AGENT_LOCK_DIR ?? '/opt/livos/data/openclaw/agents'
	try {
		const sweep = await sweepStaleLocks({
			rootDir: sweepRootDir,
			logger: (lvl, msg) => {
				if (lvl === 'warn') deps.logger.warn(msg)
				else deps.logger.info(msg)
			},
		})
		deps.logger.info(
			`[stale-lock-sweep] complete: scanned=${sweep.scanned} removed=${sweep.removed.length} root=${sweepRootDir}`,
		)
	} catch (err) {
		deps.logger.warn(
			`[stale-lock-sweep] failed (non-fatal): ${(err as Error).message}`,
		)
	}

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

	// T-197-02-02 — MANDATORY id parameter on MCPClient. The Luse client is
	// constructed eagerly at boot (only if a luse server entry was prepared
	// above) so the existing init-on-boot semantics are preserved.
	let luseClient:
		| {
				getTools(): Promise<Record<string, unknown>>
				disconnect?(): Promise<void>
			}
		| null = null
	if (Object.keys(servers).length > 0) {
		luseClient = mcpClientFactory({
			id: 'livos-mcp-bridge',
			servers: servers as never,
		})
	} else {
		deps.logger.info(
			'McpBridge constructed with no Luse source — agent has no computer-use tools (external MCPs may still load)',
		)
	}

	// ── Phase 205-03 — external MCP servers from `liv:mcp:config` ────────────
	// Spawned per-entry into a Map keyed by server name. Live-reload subscribe
	// loop calls reconcileServers() on every `liv:mcp:updated` publish to diff
	// the map against the current hash and spawn/disconnect accordingly.
	const externalClients = new Map<
		string,
		{
			getTools(): Promise<Record<string, unknown>>
			disconnect?(): Promise<void>
		}
	>()

	async function spawnExternal(entry: McpServerConfig): Promise<void> {
		if (entry.transport !== 'stdio' || !entry.command) {
			// HTTP transport not supported by StdioMcpClient; surface a warn and
			// skip. A future plan can add an HTTP MCP client.
			deps.logger.warn(
				`McpBridge: skipping external MCP '${entry.name}' — only stdio transport with a command is currently supported`,
			)
			return
		}
		try {
			const client = mcpClientFactory({
				id: `livos-mcp-${entry.name}`,
				servers: {
					[entry.name]: {command: entry.command, args: entry.args ?? []},
				} as never,
			})
			externalClients.set(entry.name, client)
			deps.logger.info(`McpBridge: spawned external MCP '${entry.name}' (transport=stdio)`)
		} catch (err) {
			deps.logger.warn(`McpBridge: failed to spawn external MCP '${entry.name}'`, err)
		}
	}

	async function disconnectExternal(name: string): Promise<void> {
		const client = externalClients.get(name)
		if (!client) return
		externalClients.delete(name)
		const disconnect = (client as unknown as {disconnect?: () => Promise<void>}).disconnect
		if (typeof disconnect === 'function') {
			try {
				await disconnect.call(client)
			} catch {
				/* swallow — best-effort teardown */
			}
		}
		deps.logger.info(`McpBridge: disconnected external MCP '${name}'`)
	}

	let reconciling = false
	let pendingReconcile = false

	async function reconcileServers(): Promise<void> {
		const raw = await deps.redis.hgetall(MCP_CONFIG_REDIS_HASH_KEY)
		const enabledNow = new Map<string, McpServerConfig>()
		for (const [name, value] of Object.entries(raw ?? {})) {
			// `luse` is the system MCP — already handled above on the Luse path;
			// never spawn it again as an "external" entry to avoid double-spawn.
			if (name === 'luse') continue
			const parsed = parseEntry(name, value, deps.logger)
			if (parsed && parsed.enabled) enabledNow.set(name, parsed)
		}
		// Disconnect entries that are gone or disabled.
		const toDisconnect: string[] = []
		for (const name of externalClients.keys()) {
			if (!enabledNow.has(name)) toDisconnect.push(name)
		}
		for (const name of toDisconnect) {
			await disconnectExternal(name)
		}
		// Spawn entries that are new.
		for (const [name, entry] of enabledNow) {
			if (!externalClients.has(name)) {
				await spawnExternal(entry)
			}
		}
	}

	async function scheduleReconcile(): Promise<void> {
		if (reconciling) {
			pendingReconcile = true
			return
		}
		reconciling = true
		try {
			await reconcileServers()
		} catch (err) {
			deps.logger.warn('McpBridge: reconcileServers failed', err)
		} finally {
			reconciling = false
			if (pendingReconcile) {
				pendingReconcile = false
				void scheduleReconcile()
			}
		}
	}

	// Initial spawn of currently-enabled external MCP servers from the hash.
	// Best-effort — never throw out of construction (matches Luse degraded path).
	try {
		await reconcileServers()
	} catch (err) {
		deps.logger.warn('McpBridge: initial reconcile failed (continuing in degraded mode)', err)
	}

	// ── Subscribe loop — Phase 205-03 live-reload ────────────────────────────
	// ioredis subscribe-mode connections cannot serve normal commands, so we
	// duplicate the main client and subscribe on the duplicate (canonical
	// ioredis pattern). Failure to duplicate (eg test fake without the
	// method) degrades silently — the bridge still works on next boot.
	let subConnection: McpBridgeSubRedis | null = null
	try {
		const dup = deps.redis.duplicate()
		// Literal channel for grep-friendliness (also exported as
		// MCP_CONFIG_REDIS_PUBSUB_CHANNEL — kept in lock-step with the publisher).
		await dup.subscribe('liv:mcp:updated')
		dup.on('message', (_channel, _message) => {
			void scheduleReconcile()
		})
		subConnection = dup
		deps.logger.info(
			`McpBridge: subscribed to ${MCP_CONFIG_REDIS_PUBSUB_CHANNEL} for live-reload`,
		)
	} catch (err) {
		deps.logger.warn('McpBridge: failed to subscribe to live-reload channel (degraded)', err)
	}

	return {
		async listTools(): Promise<Record<string, unknown>> {
			const out: Record<string, unknown> = {}
			// Luse tools (preserves the destructive-tool approval-flag pass)
			if (luseClient) {
				const raw =
					(await (luseClient as unknown as {getTools(): Promise<Record<string, unknown>>}).getTools()) ?? {}
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
			}
			// External MCP tools — already namespaced `<serverName>_<tool>` by
			// the StdioMcpClient.getTools() implementation.
			for (const [_name, client] of externalClients) {
				try {
					const raw =
						(await (client as unknown as {getTools(): Promise<Record<string, unknown>>}).getTools()) ?? {}
					for (const [tname, def] of Object.entries(raw)) {
						out[tname] = def
					}
				} catch (err) {
					deps.logger.warn(`McpBridge: getTools failed for external MCP '${_name}'`, err)
				}
			}
			return out
		},
		async destroy(): Promise<void> {
			if (luseClient) {
				const disconnect = (luseClient as unknown as {disconnect?: () => Promise<void>}).disconnect
				if (typeof disconnect === 'function') {
					try {
						await disconnect.call(luseClient)
					} catch {
						/* swallow */
					}
				}
			}
			// Disconnect all external MCPs.
			const names = Array.from(externalClients.keys())
			for (const name of names) {
				await disconnectExternal(name)
			}
			// Tear down the subscribe connection so the socket does not leak.
			if (subConnection) {
				try {
					await subConnection.quit()
				} catch {
					/* swallow */
				}
				subConnection = null
			}
		},
		async reconcileServers(): Promise<void> {
			await scheduleReconcile()
		},
	}
}

// Helper export so tests / Plan 197-04 can assert against the unnamespaced set
// without re-declaring the literal.
export const DESTRUCTIVE_LUSE_TOOLS_UNNAMESPACED: ReadonlySet<string> = DESTRUCTIVE_LUSE_TOOLS as never

// Phase 201 — ALLOWED_SELFCLAUDE_HOSTS re-export removed alongside the
// selfclaude HTTP source. If a future plan re-introduces an HTTP-based MCP,
// add its allow-list here.
