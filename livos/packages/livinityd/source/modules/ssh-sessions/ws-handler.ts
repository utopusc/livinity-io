/**
 * Phase 48 Plan 48-01 — WebSocket handler for /ws/ssh-sessions (FR-SSH-01).
 *
 * URL: `/ws/ssh-sessions?token=<jwt>`
 *
 * RBAC gate: re-verifies the token at the handler boundary. The generic
 * `mountWebSocketServer` flow at server/index.ts:905-934 only checks token
 * validity (signature + presence) — NOT user role. This handler mirrors the
 * admin-role lookup pattern from server/index.ts:1170-1200 (/api/files
 * privateApi middleware): decode JWT payload.userId, look up via
 * `findUserById`, gate on `role === 'admin'`. Legacy single-user tokens
 * carry `{loggedIn: true}` (no userId) — those map to admin via
 * `getAdminUser()`.
 *
 * Close codes:
 *   4403 — non-admin user (mirror v26.0 authorizeDeviceAccess close-code
 *          convention; 4xxx range = application-defined per RFC 6455).
 *   4404 — `journalctl` binary missing on host (graceful degrade — Mini PC
 *          always has it, but defensive).
 *   1011 — internal handler error (RFC 6455 standard "server error").
 *
 * Ring buffer: 5000 events (mirror Phase 28 docker-logs MAX_LINES_PER_CONTAINER).
 * One module-shared journalctl child per livinityd instance, NOT one per WS.
 * Multiple WS subscribers fan out from the single child. On last-subscriber
 * disconnect, the child is killed (SIGTERM) — no zombies. Buffer is module-
 * shared; on connect, the new client gets the most-recent ≤5000 events
 * replayed before live-tail begins.
 *
 * D-NO-NEW-DEPS upheld — no new third-party libs (no geo-IP enrichment, no new
 * JWT lib). Uses livinityd's existing `livinityd.server.verifyToken` (jwt.verify)
 * + `findUserById` from the database module.
 *
 * D-NO-SERVER4 upheld — Mini PC only.
 */

import type http from 'node:http'
import type {WebSocket} from 'ws'

import type Livinityd from '../../index.js'
import {
	realJournalctlStream,
	type JournalctlStream,
	type SshSessionEvent,
} from './journalctl-stream.js'

const RING_BUFFER_LIMIT = 5_000

/**
 * Minimal logger contract — accepts both:
 *   1. The livinityd workspace logger (`log`/`verbose`/`error`, no `warn`).
 *   2. `console` (has `warn` natively) — used in tests.
 *
 * `warn` is optional; the handler falls back to `error` (or to a no-op) when
 * `warn` is absent. This keeps the production wiring `this.logger.createChildLogger(...)`
 * type-compatible without forcing a logger refactor across the entire livinityd
 * codebase.
 */
interface MinimalLogger {
	warn?: (message: string, ...args: unknown[]) => void
	error: (message: string, ...args: unknown[]) => void
	log?: (message?: string) => void
	verbose?: (message: string) => void
}

function warnOrError(logger: MinimalLogger, message: string, ...args: unknown[]): void {
	if (typeof logger.warn === 'function') logger.warn(message, ...args)
	else logger.error(message, ...args)
}

interface DatabaseUserShape {
	id: string
	role: 'admin' | 'member' | 'guest'
}

/**
 * DI surface — production wires defaults, tests inject fakes. Keeping these
 * thin function-shapes (instead of full module references) means
 * `ws-handler.test.ts` can drive the entire flow without touching child_process,
 * PostgreSQL, jwt, or Redis.
 */
export interface CreateHandlerDeps {
	livinityd: Livinityd
	logger: MinimalLogger
	/**
	 * Optional injection — tests pass a fake; production uses
	 * `realJournalctlStream` from journalctl-stream.ts.
	 */
	streamFactory?: (opts: {
		onMissing: () => void
		onExit?: (code: number | null, signal: string | null) => void
		logger: MinimalLogger
	}) => JournalctlStream
	/**
	 * Optional injection — tests pass a fake; production dynamically imports
	 * `findUserById` from the database module on first call.
	 */
	findUserByIdFn?: (id: string) => Promise<DatabaseUserShape | null>
	/**
	 * Optional injection — tests pass a fake; production dynamically imports
	 * `getAdminUser` from the database module for legacy `{loggedIn: true}`
	 * token resolution.
	 */
	getAdminUserFn?: () => Promise<DatabaseUserShape | null>
}

interface SharedStreamState {
	stream: JournalctlStream
	buffer: SshSessionEvent[] // ring (most-recent N)
	subscribers: Set<(ev: SshSessionEvent) => void>
}

export function createSshSessionsWsHandler(deps: CreateHandlerDeps) {
	let shared: SharedStreamState | null = null

	function ensureStream(onMissing: () => void): SharedStreamState {
		if (shared) return shared
		const buffer: SshSessionEvent[] = []
		const subscribers = new Set<(ev: SshSessionEvent) => void>()
		const factory = deps.streamFactory ?? realJournalctlStream
		const stream = factory({
			onMissing,
			onExit: () => {
				// Subprocess died — invalidate the shared state so the next
				// connection re-spawns. Don't tear down active WS clients here
				// — they'll see EOF/disconnect through their own ws lifecycles.
				shared = null
			},
			logger: deps.logger,
		})
		// Fan-out subscriber that pushes into ring buffer + every per-WS subscriber.
		stream.subscribe((ev) => {
			buffer.push(ev)
			if (buffer.length > RING_BUFFER_LIMIT) {
				// O(n) shift, but n=5000 → microseconds. Acceptable.
				buffer.shift()
			}
			for (const sub of subscribers) {
				try {
					sub(ev)
				} catch (err) {
					warnOrError(deps.logger, '[ssh-sessions] subscriber threw:', err)
				}
			}
		})
		shared = {stream, buffer, subscribers}
		return shared
	}

	async function resolveFindUserById(): Promise<
		(id: string) => Promise<DatabaseUserShape | null>
	> {
		if (deps.findUserByIdFn) return deps.findUserByIdFn
		const mod = (await import('../database/index.js')) as {
			findUserById: (id: string) => Promise<DatabaseUserShape | null>
		}
		return mod.findUserById
	}

	async function resolveGetAdminUser(): Promise<
		() => Promise<DatabaseUserShape | null>
	> {
		if (deps.getAdminUserFn) return deps.getAdminUserFn
		const mod = (await import('../database/index.js')) as {
			getAdminUser: () => Promise<DatabaseUserShape | null>
		}
		return mod.getAdminUser
	}

	return async function (ws: WebSocket, request: http.IncomingMessage): Promise<void> {
		// 1. Re-verify JWT and resolve userId (legacy fallback → getAdminUser).
		let userId: string | null = null
		try {
			const url = new URL(`https://localhost${request.url ?? '/'}`)
			const token = url.searchParams.get('token')
			if (!token) {
				ws.close(4403, 'missing token')
				return
			}
			const payload = (await deps.livinityd.server.verifyToken(token)) as {
				userId?: string
				loggedIn?: boolean
			}
			if (typeof payload.userId === 'string') {
				userId = payload.userId
			} else if (payload.loggedIn === true) {
				// Legacy single-user mode — admin by definition. Allow but still
				// resolve the actual admin id so the role check below has a row.
				const getAdminUser = await resolveGetAdminUser()
				const admin = await getAdminUser()
				if (!admin) {
					ws.close(4403, 'admin role required')
					return
				}
				userId = admin.id
			} else {
				ws.close(4403, 'admin role required')
				return
			}
		} catch (err) {
			warnOrError(
				deps.logger,
				'[ssh-sessions] token verify failed:',
				(err as Error)?.message || err,
			)
			ws.close(4403, 'admin role required')
			return
		}

		// 2. Look up user role. Non-admin → close 4403.
		try {
			const findUserById = await resolveFindUserById()
			const user = await findUserById(userId)
			if (!user || user.role !== 'admin') {
				ws.close(4403, 'admin role required')
				return
			}
		} catch (err) {
			deps.logger.error('[ssh-sessions] role lookup failed:', err)
			ws.close(1011, 'server error')
			return
		}

		// 3. Ensure journalctl stream — close 4404 on ENOENT (binary missing).
		let missingClosed = false
		const state = ensureStream(() => {
			if (missingClosed) return
			missingClosed = true
			try {
				ws.close(4404, 'journalctl binary missing on host')
			} catch {
				// already closed — ignore
			}
		})
		if (missingClosed) return // synchronous-ENOENT path closed already

		// 4. Replay ring-buffer (most-recent ≤N) on connect.
		for (const ev of state.buffer) {
			if (ws.readyState !== ws.OPEN) break
			try {
				ws.send(JSON.stringify(ev))
			} catch {
				// transport already gone — abort replay
				break
			}
		}

		// 5. Live subscribe.
		const sub = (ev: SshSessionEvent) => {
			if (ws.readyState !== ws.OPEN) return
			try {
				ws.send(JSON.stringify(ev))
			} catch (err) {
				warnOrError(
					deps.logger,
					'[ssh-sessions] ws.send failed:',
					(err as Error)?.message || err,
				)
			}
		}
		state.subscribers.add(sub)

		// 6. Cleanup on close — unsubscribe; if last subscriber, kill the journalctl process.
		ws.on('close', () => {
			state.subscribers.delete(sub)
			if (state.subscribers.size === 0) {
				try {
					state.stream.stop()
				} catch {
					// already stopped — ignore
				}
				shared = null
			}
		})
		ws.on('error', (err: Error) => {
			warnOrError(
				deps.logger,
				'[ssh-sessions] ws error:',
				(err as Error)?.message || err,
			)
		})
	}
}

// Re-export for tests that import the constant directly.
export {RING_BUFFER_LIMIT}
