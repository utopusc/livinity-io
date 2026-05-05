/**
 * agent-runs.ts — POST /api/agent/start, GET /api/agent/runs/:runId/stream,
 *                 POST /api/agent/runs/:runId/control. Phase 67-03.
 *
 * Wires @liv/core RunStore + LivAgentRunner so browsers/clients can:
 *   - start an agent run (returns runId + sseUrl)
 *   - subscribe to chunks via SSE with `?after=<lastIdx>` resume
 *   - send a stop signal
 *
 * Existing /api/agent/stream (the old WS/SSE) is UNCHANGED (D-06). The broker
 * (livinity-broker/agent-runner-factory.ts:92) and the existing chat UI both
 * still proxy to nexus's `/api/agent/stream` — this module is purely additive.
 *
 * Sacred file `nexus/packages/core/src/sdk-agent-runner.ts`
 * (SHA `4f868d318abff71f8c8bfbcf443b2393a553018b`) is read-only — this module
 * imports `@liv/core` types but never modifies sacred internals.
 *
 * D-NO-BYOK / D-NO-NEW-DEPS preserved: no broker contact, no new package
 * deps. Auth uses livinityd's existing JWT secret + `Server.verifyToken()`.
 *
 * Mount from `server/index.ts` via `mountAgentRunsRoutes(app, livinityd, options)`.
 * The `livAgentRunnerFactory` option must produce a LivAgentRunner per call —
 * tests inject a stub; production wiring constructs an SdkAgentRunner backed
 * by livinityd.ai.toolRegistry and a Brain bound to livinityd.ai.redis.
 *
 * Phase 73-04: POST /api/agent/start now enqueues to RunQueue (BullMQ-backed,
 * per-user concurrency=1) instead of fire-and-forget factory call. RunQueue
 * is constructed at mount time (or injected via `runQueueOverride` in tests),
 * and the worker is started ONCE before any route handlers register. Per
 * CONTEXT D-23..D-25: always enqueue (no 429 rejection); the queue serializes
 * naturally per-user. This replaces the original P67-03 D-18 fire-and-forget
 * design — concurrency control was punted to P73 from day one.
 */

import type {Application, Request, Response} from 'express'
// Imports below resolve from '@liv/core' via the package's `./lib` subpath
// export — the lib entry is "safe to import without side effects" (the main
// `@liv/core` entry pulls in daemon side-effects like `dotenv/config`). Both
// entries re-export RunStore + LivAgentRunner + RunQueue per Phase 67-01/02
// + 73-02 SUMMARY.
import {
	LivAgentRunner,
	RunStore,
	RunQueue,
	McpConfigManager,
	type Chunk,
	type RunMeta,
} from '@liv/core/lib'

import type Livinityd from '../../index.js'

// Phase 72-native-06: bytebot computer-use MCP server registration. Called
// once at mount time AFTER McpConfigManager is constructed, BEFORE the
// running nexus daemon's McpClientManager would reconcile (it reconciles
// via Redis Pub/Sub on `liv:config:updated`, which McpConfigManager.installServer
// publishes automatically). Default-disabled — no-op when BYTEBOT_MCP_ENABLED
// is unset (D-NATIVE-10).
import {registerBytebotMcpServer} from '../computer-use/index.js'

/**
 * Factory that produces a fresh LivAgentRunner per agent run.
 *
 * Tests inject a stub. Production wiring (passed in from `server/index.ts`)
 * constructs an SdkAgentRunner using the daemon's toolRegistry + a Brain
 * bound to its Redis client.
 */
export type LivAgentRunnerFactory = (
	runId: string,
	task: string,
) => LivAgentRunner | Promise<LivAgentRunner>

/**
 * Auth override — when present, replaces JWT verification on POST /start
 * and POST /control. Used by tests; never wired in production. Sets
 * `(request as any).agentRunsUserId` to a synthetic userId.
 */
export type AuthOverride = (
	request: Request,
	response: Response,
	next: () => void,
) => void

/** Options accepted by mountAgentRunsRoutes. */
export interface MountAgentRunsOptions {
	/** REQUIRED to actually run agents. If omitted, /start returns 503. */
	livAgentRunnerFactory?: LivAgentRunnerFactory
	/** Test-only: bypass JWT verification with a synthetic auth middleware. */
	authOverride?: AuthOverride
	/** Test-only: inject a pre-built RunStore (so tests can append chunks
	 *  outside the route handlers). Defaults to a fresh RunStore over
	 *  `livinityd.ai.redis`. */
	runStoreOverride?: RunStore
	/** Test-only: inject a pre-built RunQueue (so tests can stub BullMQ).
	 *  Defaults to a fresh RunQueue over `livinityd.ai.redis` + the
	 *  provided `livAgentRunnerFactory` when both are present. P73-04 D-24. */
	runQueueOverride?: RunQueue
}

/** Heartbeat interval for SSE — D-22 specifies exactly 15s. */
const HEARTBEAT_INTERVAL_MS = 15000

/**
 * Resolve and verify a JWT token from either an `Authorization: Bearer ...`
 * header or a `?token=<jwt>` query string param (D-20). Returns the userId
 * on success, or `null` on auth failure.
 *
 * Token query param exposure is documented in 67-03 threat register T-67-03-04
 * (info disclosure via proxy/CDN access logs); EventSource cannot set custom
 * headers so the query param is necessary. Caddy + Cloudflare access logs are
 * admin-only on Mini PC.
 */
async function resolveJwtUserId(
	livinityd: Livinityd,
	request: Request,
): Promise<string | null> {
	const headerAuth = request.headers.authorization
	const headerToken =
		typeof headerAuth === 'string' && /^Bearer\s+/i.test(headerAuth)
			? headerAuth.replace(/^Bearer\s+/i, '').trim()
			: undefined
	const queryToken =
		typeof request.query.token === 'string' ? request.query.token : undefined
	const token = headerToken || queryToken
	if (!token) return null

	try {
		const payload = await livinityd.server.verifyToken(token)
		// New multi-user token has userId; legacy {loggedIn:true} maps to 'admin'
		// for purposes of this route. Legacy single-user dev still works.
		if (payload.userId) return payload.userId
		if (payload.loggedIn) return 'admin'
		return null
	} catch {
		return null
	}
}

/**
 * Mount the three Phase 67-03 agent-run routes on the existing livinityd
 * Express app. Called from `server/index.ts` alongside mountBrokerRoutes
 * so the existing `/api/agent/stream` line is preserved verbatim (D-06).
 *
 * Routes (all under root, NOT prefixed):
 *   - POST /api/agent/start                       — D-17
 *   - GET  /api/agent/runs/:runId/stream          — D-20/D-21/D-22
 *   - POST /api/agent/runs/:runId/control         — user-instruction
 */
export async function mountAgentRunsRoutes(
	app: Application,
	livinityd: Livinityd,
	options: MountAgentRunsOptions = {},
): Promise<void> {
	const logger = livinityd.logger.createChildLogger('agent-runs')

	// One shared RunStore per daemon process — Redis is the source of truth so
	// no in-memory state to fan out. Test path may inject a pre-built one.
	const runStore =
		options.runStoreOverride ?? new RunStore(livinityd.ai.redis)

	// ── Phase 72-native-06: bytebot computer-use MCP server registration ─
	// Construct an McpConfigManager backed by the same Redis livinityd
	// already uses (the running nexus daemon shares this Redis and its
	// McpClientManager subscribes to `liv:config:updated`, so writing the
	// bytebot entry here is sufficient to spawn the child process there).
	//
	// Default-disabled: when BYTEBOT_MCP_ENABLED is unset the call is a
	// pure no-op (returns {registered:false}); livinityd boots normally
	// and the agent simply has no `mcp_bytebot_*` tools (D-NATIVE-10
	// graceful degradation). Failure here is also non-fatal — caught by
	// the function's internal try/catch.
	//
	// Auto-deviation Rule 3 documented in 72-native-06-SUMMARY.md: livinityd
	// did NOT previously instantiate McpConfigManager, so this construction
	// + wire is an additive change. The plan's <interfaces> block left
	// "the EXACT init point" to be verified at execution time; the chosen
	// site is here, immediately after RunStore construction (analogous to
	// other lifecycle wiring like P73-04 RunQueue below).
	try {
		const bytebotConfigManager = new McpConfigManager(livinityd.ai.redis)
		await registerBytebotMcpServer(
			livinityd.ai.redis,
			process.env,
			bytebotConfigManager,
			{
				log: (msg) => logger.log(msg),
				error: (msg) => logger.error(msg),
			},
		)
	} catch (err) {
		// Defensive: bytebot registration must NEVER block agent-runs mount.
		const msg = err instanceof Error ? err.message : String(err)
		logger.error(`[bytebot-mcp-config] mount-time error (non-fatal): ${msg}`)
	}

	const factory = options.livAgentRunnerFactory

	// ── Phase 73-04: RunQueue construction + worker startup ─────────────
	// CONTEXT D-23/D-24: tests inject a fake via `runQueueOverride`; production
	// constructs a default RunQueue from the existing factory + redis +
	// runStore. The factory option's signature returns LivAgentRunner;
	// RunQueue's factory contract is `(runId, task) => Promise<void>` (it
	// expects the FULL run to be awaited inside). Adapter wraps the existing
	// factory: resolve it, then await runner.start() — same shape the P67-03
	// fire-and-forget block used inline.
	//
	// Precedence: if both factory AND runQueueOverride are absent, runQueue
	// is null and POST /start returns 503 (preserves the original P67-03
	// path with a refined error message).
	const runQueue: RunQueue | null =
		options.runQueueOverride ??
		(factory
			? new RunQueue({
					redisClient: livinityd.ai.redis,
					runStore,
					// Adapter: existing factory returns LivAgentRunner (or
					// Promise of one); RunQueue's contract is `(runId, task)
					// => Promise<void>` and expects the FULL run inside.
					// `await factory(...)` accepts both sync and async returns.
					livAgentRunnerFactory: async (jobRunId: string, jobTask: string) => {
						const runner = await factory(jobRunId, jobTask)
						await runner.start(jobRunId, jobTask)
					},
					perUserConcurrency: 1,
					globalConcurrency: 5,
				})
			: null)

	if (runQueue) {
		await runQueue.start()
		logger.log('[agent-runs] RunQueue started (per-user concurrency=1)')
	}

	// ── POST /api/agent/start ─────────────────────────────────────────────
	// D-17: body { task, conversationId? }; JWT auth; calls runStore.createRun
	// then enqueues to RunQueue (Phase 73-04 — replaces P67-03 D-18 fire-and-
	// forget). Returns { runId, sseUrl }.
	app.post('/api/agent/start', async (request: Request, response: Response) => {
		// Auth — Bearer header or ?token= query (?token covers SSE-style
		// browsers that may chain a POST /start through the same auth shape).
		const authOverride = options.authOverride
		let userId: string | null = null
		if (authOverride) {
			authOverride(request, response, () => {})
			userId = (request as any).agentRunsUserId ?? null
		} else {
			userId = await resolveJwtUserId(livinityd, request)
		}
		if (!userId) {
			return response.status(401).json({error: 'unauthenticated'})
		}

		// Validate body
		const body = (request.body ?? {}) as {task?: unknown; conversationId?: unknown}
		const task = typeof body.task === 'string' ? body.task : ''
		if (!task || task.trim().length === 0) {
			return response.status(400).json({error: 'task is required'})
		}

		// Phase 73-04: 503 path now triggers when RunQueue is absent (factory
		// missing AND no runQueueOverride). The factory itself is held by the
		// queue at construction time; the route handler never calls factory()
		// directly anymore.
		if (!runQueue) {
			logger.error('POST /api/agent/start: runQueue not wired (need livAgentRunnerFactory or runQueueOverride)')
			return response.status(503).json({
				error: 'agent runner not wired — pass livAgentRunnerFactory in mountAgentRunsRoutes options',
			})
		}

		try {
			const runId = await runStore.createRun(userId, task)
			logger.log(`POST /api/agent/start userId=${userId} runId=${runId}`)

			// Phase 73-04 (CONTEXT D-23): enqueue to RunQueue instead of
			// fire-and-forget. The BullMQ worker (started above at mount time)
			// pulls the job, applies the per-user concurrency=1 gate, then
			// invokes the factory adapter which awaits runner.start(). Per
			// CONTEXT D-25 we always enqueue — no 429 rejection — the queue
			// serializes naturally per user.
			await runQueue.enqueue({
				runId,
				userId,
				task,
				enqueuedAt: Date.now(),
			})

			return response.status(200).json({
				runId,
				sseUrl: `/api/agent/runs/${runId}/stream`,
			})
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			logger.error(`POST /api/agent/start error: ${msg}`)
			return response.status(500).json({error: 'internal error'})
		}
	})

	// ── GET /api/agent/runs/:runId/stream ─────────────────────────────────
	// D-20: JWT via Authorization header OR ?token= query.
	// D-21: ?after=<lastIdx> resume — convention: lastIdx means "I have seen
	//       up to this idx, send me lastIdx+1 onwards". Initial connect omits
	//       the param to receive everything from idx 0. Also accepts -1.
	// D-22: 15s `: heartbeat\n\n` comments. Disconnect on client close.
	app.get(
		'/api/agent/runs/:runId/stream',
		async (request: Request, response: Response) => {
			const authOverride = options.authOverride
			let userId: string | null = null
			if (authOverride) {
				authOverride(request, response, () => {})
				userId = (request as any).agentRunsUserId ?? null
			} else {
				userId = await resolveJwtUserId(livinityd, request)
			}
			if (!userId) {
				return response.status(401).json({error: 'unauthenticated'})
			}

			const {runId} = request.params
			const meta = await runStore.getMeta(runId)
			if (!meta) {
				return response.status(404).json({error: 'run not found'})
			}
			if ((meta as RunMeta).userId !== userId) {
				return response.status(403).json({error: 'forbidden'})
			}

			// ?after=<lastIdx> — "I have seen up to lastIdx, send lastIdx+1+".
			// Convention chosen to match 67-04 hook reconnect logic verbatim.
			// Initial connection (no ?after=) ⇒ fromIndex = 0 (everything).
			let fromIndex = 0
			const afterRaw = request.query.after
			if (typeof afterRaw === 'string' && afterRaw.length > 0) {
				const parsed = Number.parseInt(afterRaw, 10)
				if (!Number.isNaN(parsed)) {
					fromIndex = parsed + 1
					if (fromIndex < 0) fromIndex = 0
				}
			}

			// Open SSE — exact header set per D-22 / common SSE-on-Caddy practice.
			response.writeHead(200, {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache, no-transform',
				'Connection': 'keep-alive',
				'X-Accel-Buffering': 'no',
			})
			// Flush headers immediately so EventSource opens before any chunks.
			if (typeof (response as any).flushHeaders === 'function') {
				try {
					;(response as any).flushHeaders()
				} catch {
					/* swallow — no-op for non-Node responses (tests) */
				}
			}

			let closed = false
			const writeData = (chunk: unknown): void => {
				if (closed) return
				try {
					response.write(`data: ${JSON.stringify(chunk)}\n\n`)
				} catch {
					/* swallow — connection torn down mid-write */
				}
			}
			const writeRaw = (line: string): void => {
				if (closed) return
				try {
					response.write(line)
				} catch {
					/* swallow */
				}
			}

			// 1. Catch-up: send all chunks ≥ fromIndex.
			const catchup = await runStore.getChunks(runId, fromIndex)
			let lastSentIdx = fromIndex - 1
			for (const chunk of catchup) {
				writeData(chunk)
				if (typeof chunk.idx === 'number') lastSentIdx = chunk.idx
			}

			// 2. If terminal at this point, send `event: complete` and end.
			//    Re-fetch meta to catch state transitions during catch-up.
			const post = await runStore.getMeta(runId)
			if (
				post &&
				(post.status === 'complete' ||
					post.status === 'error' ||
					post.status === 'stopped')
			) {
				writeRaw(`event: complete\ndata: ${JSON.stringify({status: post.status})}\n\n`)
				closed = true
				try {
					response.end()
				} catch {
					/* swallow */
				}
				return
			}

			// 3. Live tail via Pub/Sub. Subscribe + publisher MUST use separate
			//    Redis client instances — RunStore.subscribeChunks already
			//    duplicate()s its connection, so this is handled.
			const seen = new Set<number>()
			const unsubscribe = await runStore.subscribeChunks(runId, (chunk: Chunk) => {
				if (closed) return
				// Dedupe against catchup overlap — Pub/Sub publishes after RPUSH,
				// so a chunk we just sent during catch-up could also arrive here
				// if a publish raced our catch-up read. Track by idx.
				if (typeof chunk.idx === 'number') {
					if (chunk.idx <= lastSentIdx) return
					if (seen.has(chunk.idx)) return
					seen.add(chunk.idx)
					lastSentIdx = chunk.idx
				}
				writeData(chunk)

				// If this chunk announces terminal status, send `event: complete`
				// and gracefully end so the client closes its EventSource.
				if (chunk.type === 'status') {
					const p = chunk.payload
					if (p === 'complete' || p === 'error' || p === 'stopped') {
						writeRaw(
							`event: complete\ndata: ${JSON.stringify({status: p})}\n\n`,
						)
						closed = true
						unsubscribe().catch(() => {})
						clearInterval(heartbeat)
						try {
							response.end()
						} catch {
							/* swallow */
						}
					}
				}
			})

			// 4. Heartbeat — exact 15s interval per D-22. The literal string
			//    `: heartbeat` is greppable so verifiers can confirm presence.
			const heartbeat = setInterval(() => {
				writeRaw(`: heartbeat\n\n`)
			}, HEARTBEAT_INTERVAL_MS)

			// 5. Cleanup on client disconnect — clear timer, unsubscribe.
			//    No leaked subscriptions or timers (T-67-03-06 mitigation).
			const cleanup = (): void => {
				if (closed) return
				closed = true
				clearInterval(heartbeat)
				unsubscribe().catch((err: unknown) => {
					const msg = err instanceof Error ? err.message : String(err)
					logger.error(`[agent-runs] unsubscribe error for ${runId}: ${msg}`)
				})
			}
			request.on('close', cleanup)
			request.on('aborted', cleanup)
		},
	)

	// ── POST /api/agent/runs/:runId/control ───────────────────────────────
	// User-instruction: body { signal: 'stop' }; JWT auth; validates userId
	// match; calls runStore.setControl(runId, 'stop'); returns { ok: true }.
	app.post(
		'/api/agent/runs/:runId/control',
		async (request: Request, response: Response) => {
			const authOverride = options.authOverride
			let userId: string | null = null
			if (authOverride) {
				authOverride(request, response, () => {})
				userId = (request as any).agentRunsUserId ?? null
			} else {
				userId = await resolveJwtUserId(livinityd, request)
			}
			if (!userId) {
				return response.status(401).json({error: 'unauthenticated'})
			}

			const {runId} = request.params
			const meta = await runStore.getMeta(runId)
			if (!meta) {
				return response.status(404).json({error: 'run not found'})
			}
			if ((meta as RunMeta).userId !== userId) {
				return response.status(403).json({error: 'forbidden'})
			}

			const body = (request.body ?? {}) as {signal?: unknown}
			const signal = body.signal
			if (signal !== 'stop') {
				return response.status(400).json({error: 'invalid signal'})
			}

			try {
				await runStore.setControl(runId, 'stop')
				logger.log(`POST /api/agent/runs/${runId}/control signal=stop userId=${userId}`)
				return response.status(200).json({ok: true})
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err)
				logger.error(`POST /api/agent/runs/.../control error: ${msg}`)
				return response.status(500).json({error: 'internal error'})
			}
		},
	)

	logger.log('[agent-runs] routes mounted: POST /api/agent/start, GET /api/agent/runs/:runId/stream, POST /api/agent/runs/:runId/control')
}
