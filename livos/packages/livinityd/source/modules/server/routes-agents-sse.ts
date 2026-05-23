/**
 * Phase 202-04 — `GET /agents/status/stream` Server-Sent Events endpoint.
 *
 * Per-tab long-lived HTTP stream that pushes `AgentStatusEvent` payloads from
 * the `AgentScheduler.statusEvents` EventEmitter to every connected browser.
 * The Agents dashboard (`/agents` page in liv-ai-app subapp) opens a single
 * `new EventSource('/agents/status/stream', { withCredentials: true })` and
 * merges incoming events into a `Record<agentId, AgentStatus>` map.
 *
 * Decisions honoured:
 *   D-202-08 — SSE (not WebSocket). Frontend uses native EventSource.
 *
 * Threat mitigations:
 *   T-202-07 — adminProcedure-equivalent JWT gate via the same verifyToken
 *              path used by /chat/:agentId (Phase 198-01). Bearer header OR
 *              LIVINITY_SESSION cookie. Unauthenticated → 401 BEFORE any
 *              stream output.
 *
 * Caddy-buffer mitigation:
 *   `X-Accel-Buffering: no` header tells reverse proxies (Caddy, nginx) NOT
 *   to buffer the response, so events reach the browser as they're emitted
 *   instead of after the full body completes.
 */

import type {Request, Response, RequestHandler} from 'express'

import type {AgentScheduler, AgentStatusEvent} from '../mastra/scheduler.js'

export interface AgentsSseDeps {
	scheduler: AgentScheduler
	verifyToken: (token: string) => Promise<unknown>
	logger: {
		info: (msg: string) => void
		warn: (msg: string, error?: unknown) => void
	}
}

/**
 * Factory — produces the Express RequestHandler that streams status events.
 * Kept as a factory (not a free function) so the boot wire-up can pass the
 * scheduler + verifyToken instances at construction time.
 */
export function createAgentsStatusSseHandler(
	deps: AgentsSseDeps,
): RequestHandler {
	const handler: RequestHandler = async (req: Request, res: Response) => {
		// 1. JWT gate — same two-source token resolution as the /chat/:agentId
		//    handler in livinityd/source/index.ts:1225 (Bearer header OR
		//    LIVINITY_SESSION cookie). Single-user Mini PC deployment.
		try {
			let token = req.headers.authorization?.split(' ')[1]
			if (!token) {
				const cookies = (req as unknown as {cookies?: {LIVINITY_SESSION?: string}})
					.cookies
				token = cookies?.LIVINITY_SESSION
			}
			if (!token) {
				res.status(401).json({error: 'Unauthorized'})
				return
			}
			await deps.verifyToken(token)
		} catch {
			res.status(401).json({error: 'Unauthorized'})
			return
		}

		// 2. SSE response headers. `X-Accel-Buffering: no` bypasses Caddy /
		//    nginx buffering so events flush immediately. `Connection:
		//    keep-alive` keeps the underlying TCP socket open between events.
		res.status(200)
		res.setHeader('Content-Type', 'text/event-stream')
		res.setHeader('Cache-Control', 'no-cache, no-transform')
		res.setHeader('Connection', 'keep-alive')
		res.setHeader('X-Accel-Buffering', 'no')
		// Express buffers chunks until the next tick by default; flushHeaders
		// pushes the status + headers out NOW so the browser's EventSource
		// readyState flips from CONNECTING (0) → OPEN (1) before the first
		// event arrives.
		if (typeof (res as Response & {flushHeaders?: () => void}).flushHeaders === 'function') {
			(res as Response & {flushHeaders?: () => void}).flushHeaders!()
		}

		// 3. Initial "open" sentinel so the client knows the stream is live
		//    even before the first status flip. Useful for the
		//    `useAgentStatusSSE` hook's `lastEventAt` initialisation.
		const writeEvent = (eventName: string, payload: unknown): void => {
			try {
				res.write(`event: ${eventName}\n`)
				res.write(`data: ${JSON.stringify(payload)}\n\n`)
			} catch (err) {
				// Best-effort — if the client disconnected mid-write, the
				// cleanup below removes the listener. No need to escalate.
				deps.logger.warn(
					'Phase 202-04 SSE — write() failed (client may have disconnected)',
					err,
				)
			}
		}

		writeEvent('hello', {at: new Date().toISOString()})

		// 4. Subscribe to the scheduler's status emitter. Every event is
		//    forwarded as an `event: status` SSE chunk. The listener is
		//    detached on `req.close` / `req.aborted` so a tab close does NOT
		//    leak listeners.
		const onStatus = (event: AgentStatusEvent): void => {
			writeEvent('status', event)
		}
		deps.scheduler.statusEvents.on('status', onStatus)

		// 5. Heartbeat ping every 25s. Prevents idle-timeout disconnects on
		//    long-poll-aware proxies AND keeps the client's `lastEventAt`
		//    fresh so the dashboard can render a "live" indicator. SSE
		//    comments (`: ...`) are ignored by EventSource but still flush
		//    the TCP socket.
		const heartbeat = setInterval(() => {
			try {
				res.write(': heartbeat\n\n')
			} catch {
				// Connection already dead — cleanup happens via close handler.
			}
		}, 25_000)

		// 6. Cleanup on client disconnect. Both `close` (TCP) and `aborted`
		//    (HTTP request abort) fire on tab close; we wire both for
		//    defense-in-depth.
		const cleanup = (): void => {
			clearInterval(heartbeat)
			deps.scheduler.statusEvents.off('status', onStatus)
		}
		req.on('close', cleanup)
		req.on('aborted', cleanup)
	}
	return handler
}
