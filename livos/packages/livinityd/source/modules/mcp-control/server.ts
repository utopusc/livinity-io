/**
 * Phase 346-03 Task 2 (MCP-01, D-346-5) — the liv-control MCP server + its
 * loopback StreamableHTTP transport.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ZERO imports from the broker/subscription path (D-346-2). Fenced by
 * __tests__/broker-zero-import.test.ts. Imports ONLY the SDK, express, node
 * http, and the local mcp-control primitives (auth gate + tools + allowlist).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Hardening deltas vs the liv/packages/mcp-server StreamableHTTP template
 * (which is an ANTI-pattern: no auth, public bind):
 *   1. SEPARATE Express app + http listener bound to MCP_CONTROL_DEFAULT_HOST
 *      ('127.0.0.1') on a distinct loopback port — NOT mounted on livinityd's
 *      public :8080 app, so there is NO Caddy-reachable surface. Network reach
 *      is a DELIBERATE operator step (their own tunnel / reverse-proxy),
 *      documented in the UAT; we bind loopback only and add NO Caddy route.
 *   2. An `isEnabled()` DI gate checked at the TOP of every route handler → 404
 *      when false (default-off inertness, INDEPENDENT of listener state: even a
 *      started listener serves nothing until the admin opts in — Plan 04).
 *   3. `createMcpControlAuthMiddleware` mounted BEFORE the transport handler, so
 *      an unauthenticated request is rejected by the gate, never by the
 *      transport. (Order on the route: isEnabled 404-gate → auth gate → transport.)
 *   4. WARN-1 defense-in-depth: the constructor THROWS if a caller passes a
 *      `host` that is not a loopback literal — a future caller cannot widen the
 *      bind past D-346-5.
 */

import http from 'node:http'
import {randomUUID} from 'node:crypto'

import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import {isInitializeRequest} from '@modelcontextprotocol/sdk/types.js'
import express, {type Express, type NextFunction, type Request, type Response} from 'express'

import {createMcpControlAuthMiddleware} from './auth-gate.js'
import {findMcpControlKeyByHash} from './keys-database.js'
import {
	registerMcpControlTools,
	type FetchImpl,
	type McpToolDeps,
} from './tools.js'

/** The loopback bind host — NEVER 0.0.0.0. Exported for the test to pin. */
export const MCP_CONTROL_DEFAULT_HOST = '127.0.0.1' as const

/**
 * The transport route path. DISTINCT from the consumer-side '/api/mcp' proxy and
 * the legacy '/mcp' server (D-346-9) so there is no collision with existing MCP
 * surface.
 */
export const MCP_CONTROL_ROUTE_PATH = '/mcp-control' as const

/** MCP server identity — NOT in SYSTEM_MCP_NAMES, NOT 'nexus' (D-346-9). */
export const MCP_CONTROL_SERVER_NAME = 'liv-control' as const

/** Default loopback port (overridable via env / opts). */
export const MCP_CONTROL_DEFAULT_PORT = 8779

/** WARN-1: the only hosts a caller may bind — all loopback. */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost', '::1'])

interface MinimalLogger {
	debug?: (...args: unknown[]) => void
	info?: (...args: unknown[]) => void
	warn?: (...args: unknown[]) => void
	error?: (...args: unknown[]) => void
}

export interface CreateMcpControlServerOptions {
	/** Default-off gate (D-346-6). Checked at the TOP of every route handler. */
	isEnabled: () => boolean
	/** LIVINITYD_API_URL (loopback, e.g. http://127.0.0.1:8080). */
	apiUrl: string
	/** LIV_API_KEY — internal service token for the /trpc auth; never exposed. */
	apiKey: string
	logger: MinimalLogger
	/** Loopback host override — MUST be a loopback literal or the ctor throws (WARN-1). */
	host?: string
	/** Loopback port override (default MCP_CONTROL_DEFAULT_PORT). */
	port?: number
	/** Test seam: inject the auth middleware (default = the real liv_mcp_* gate). */
	authMiddleware?: (req: Request, res: Response, next: NextFunction) => void
	/** Test seam: inject the DAO lookup used by the default auth gate. */
	findByHash?: typeof findMcpControlKeyByHash
	/** Test seam: inject the tool registrar (default = registerMcpControlTools). */
	registerTools?: (server: McpServer, deps: McpToolDeps) => void
	/** Test seam: inject fetch used by the tool handlers. */
	fetchImpl?: FetchImpl
}

export interface McpControlServerHandle {
	start(): Promise<void>
	stop(): Promise<void>
	isListening(): boolean
	/** The bound address after start() (for tests to prove the loopback bind). */
	address(): {address: string; port: number} | null
	/** The Express app (exposed for offline supertest-style checks). */
	readonly app: Express
}

/**
 * Build the liv-control MCP server handle. Does NOT listen until start().
 * WARN-1: throws at construction for a non-loopback host.
 */
export function createMcpControlServer(
	opts: CreateMcpControlServerOptions,
): McpControlServerHandle {
	const host = opts.host ?? MCP_CONTROL_DEFAULT_HOST
	// ── WARN-1 defense-in-depth — refuse any non-loopback bind at construction.
	if (!LOOPBACK_HOSTS.has(host)) {
		throw new Error(
			`[mcp-control] refusing non-loopback host "${host}" — the MCP control transport binds loopback ONLY (D-346-5). Network reach is a deliberate operator step via their own tunnel.`,
		)
	}

	const port = opts.port ?? MCP_CONTROL_DEFAULT_PORT
	const {logger} = opts
	const registerTools = opts.registerTools ?? registerMcpControlTools
	const authMiddleware =
		opts.authMiddleware ??
		createMcpControlAuthMiddleware({logger, findByHash: opts.findByHash})

	// Live StreamableHTTP transports keyed by MCP session id.
	const transports: Record<string, StreamableHTTPServerTransport> = {}

	const app = express()
	app.use(express.json())

	// ── (2) isEnabled 404-gate — TOP of every route handler, before auth/transport.
	// Inert when disabled EVEN IF start() was called (independent of listener state).
	const enabledGate = (req: Request, res: Response, next: NextFunction): void => {
		if (!opts.isEnabled()) {
			res.status(404).json({error: 'not_found', message: 'MCP control server disabled'})
			return
		}
		next()
	}

	// Session-init POST → create a per-session McpServer bound to the request's
	// mcpKeyId (attribution, D-346-7); continuation POST/GET/DELETE route by id.
	const handlePost = async (req: Request, res: Response): Promise<void> => {
		const sessionId = req.headers['mcp-session-id'] as string | undefined
		let transport: StreamableHTTPServerTransport

		if (sessionId && transports[sessionId]) {
			transport = transports[sessionId]
		} else if (!sessionId && isInitializeRequest(req.body)) {
			transport = new StreamableHTTPServerTransport({
				sessionIdGenerator: () => randomUUID(),
				onsessioninitialized: (id) => {
					transports[id] = transport
					logger.debug?.(`[mcp-control] session initialized: ${id}`)
				},
				onsessionclosed: (id) => {
					delete transports[id]
					logger.debug?.(`[mcp-control] session closed: ${id}`)
				},
			})
			transport.onclose = () => {
				if (transport.sessionId) delete transports[transport.sessionId]
			}

			const server = new McpServer({name: MCP_CONTROL_SERVER_NAME, version: '1.0.0'})
			registerTools(server, {
				apiUrl: opts.apiUrl,
				apiKey: opts.apiKey,
				logger,
				// Attribution: the liv_mcp_* key id resolved by the auth gate.
				mcpKeyId: req.mcpKeyId,
				fetchImpl: opts.fetchImpl,
			})
			await server.connect(transport)
		} else {
			res.status(400).json({
				jsonrpc: '2.0',
				error: {code: -32000, message: 'Invalid or missing MCP session'},
				id: null,
			})
			return
		}

		await transport.handleRequest(req, res, req.body)
	}

	const handleSessionRequest = async (req: Request, res: Response): Promise<void> => {
		const sessionId = req.headers['mcp-session-id'] as string | undefined
		const transport = sessionId ? transports[sessionId] : undefined
		if (!transport) {
			res.status(400).send('Invalid or missing MCP session')
			return
		}
		await transport.handleRequest(req, res)
	}

	// ── (3) Route order: isEnabled 404-gate → auth gate → transport handler.
	app.post(MCP_CONTROL_ROUTE_PATH, enabledGate, authMiddleware, (req, res) => {
		void handlePost(req, res)
	})
	app.get(MCP_CONTROL_ROUTE_PATH, enabledGate, authMiddleware, (req, res) => {
		void handleSessionRequest(req, res)
	})
	app.delete(MCP_CONTROL_ROUTE_PATH, enabledGate, authMiddleware, (req, res) => {
		void handleSessionRequest(req, res)
	})

	let httpServer: http.Server | null = null

	return {
		app,
		isListening(): boolean {
			return Boolean(httpServer?.listening)
		},
		address() {
			const addr = httpServer?.address()
			if (addr && typeof addr === 'object') {
				return {address: addr.address, port: addr.port}
			}
			return null
		},
		async start(): Promise<void> {
			if (httpServer?.listening) return
			await new Promise<void>((resolve, reject) => {
				const srv = http.createServer(app)
				srv.once('error', reject)
				// ── (1) HOST bind is the loopback guarantee — never 0.0.0.0.
				srv.listen(port, host, () => {
					srv.removeListener('error', reject)
					httpServer = srv
					logger.info?.(
						`[mcp-control] liv-control listening on http://${host}:${port}${MCP_CONTROL_ROUTE_PATH} (loopback-only, no Caddy route)`,
					)
					resolve()
				})
			})
		},
		async stop(): Promise<void> {
			// Idempotent: close every open transport, then the listener.
			for (const id of Object.keys(transports)) {
				try {
					await transports[id].close()
				} catch (err) {
					logger.error?.(`[mcp-control] error closing transport ${id}`, err)
				}
				delete transports[id]
			}
			const srv = httpServer
			httpServer = null
			if (!srv) return
			await new Promise<void>((resolve) => {
				srv.close(() => resolve())
			})
		},
	}
}
