/**
 * Phase 243-02 Task 2 — /livos/terminal/ws WebSocket handler.
 *
 * Wires the xterm.js panel (Plan 243-03) to the PtySession engine (Plan 243-01).
 *
 * Auth gates (in order, all MUST pass before any PTY spawn):
 *   1. LIVINITY_PROXY_TOKEN cookie present + verifyProxyToken passes.
 *      → on failure: ws.close(4403, 'unauthorized'). No PtySession created.
 *   2. Feature flag `livos:v43:terminal_panel` === 'true' (default OFF).
 *      → on failure: ws.close(4403, 'feature disabled'). No PtySession.
 *   3. Username forced to literal 'bruce' — defense in depth backing the
 *      runtime guard in 243-01's PtySession.start().
 *
 * Wire protocol (see 243-02-PLAN <protocol> section):
 *   Client→Server: init / data / resize / close
 *   Server→Client: ready / data / exit / error
 *
 * Lifecycle:
 *   - ws.on('close')  → session?.kill() + deleteMetadata (best-effort)
 *   - session 'exit'  → ws.send({type:'exit'}) + ws.close(1000) + deleteMetadata
 *   - All Redis del/write errors logged at warn, NEVER thrown.
 *
 * No `?token=` query-string fallback — cookie-only auth (clean break from the
 * legacy /terminal handler).
 *
 * DI surface mirrors ssh-sessions/ws-handler.ts so tests inject fakes for
 * sessionFactory, flagChecker, verifyProxyTokenFn, getAdminUserFn,
 * writeMetadataFn, deleteMetadataFn — handler is fully synchronous in tests.
 */

import type http from 'node:http'
import type {WebSocket} from 'ws'

import {PtySession} from './session.js'
import type {PtySpawnOptions, PtySessionMetadata} from './types.js'
import {
	isTerminalPanelEnabled,
	type TerminalFlagRedisClient,
} from './feature-flag.js'
import {
	writeSessionMetadata,
	deleteSessionMetadata,
} from './metadata.js'

// ─── Types ──────────────────────────────────────────────────────────────

interface MinimalLogger {
	warn?: (message: string, ...args: unknown[]) => void
	error: (message: string, ...args: unknown[]) => void
	log?: (message?: string) => void
	verbose?: (message: string) => void
}

function warnOrError(
	logger: MinimalLogger,
	message: string,
	...args: unknown[]
): void {
	if (typeof logger.warn === 'function') logger.warn(message, ...args)
	else logger.error(message, ...args)
}

/** Surface PtySession exposes that the handler needs. */
export interface PtySessionLike {
	readonly sessionId: string
	start(): void
	on(event: 'data', listener: (chunk: string) => void): void
	on(event: 'exit', listener: (info: {exitCode: number; signal: string | null}) => void): void
	write(data: string): void
	resize(cols: number, rows: number): void
	kill(): void
}

/** Narrow shape of the livinityd binding the handler uses. */
interface MinimalLivinityd {
	server: {
		verifyProxyToken(
			token: string,
		): Promise<{userId?: string; loggedIn?: boolean} | unknown>
	}
}

/** Redis client surface — superset of TerminalFlagRedisClient + metadata. */
interface MinimalRedis extends TerminalFlagRedisClient {
	hset(key: string, fields: Record<string, string>): Promise<number>
	hgetall(key: string): Promise<Record<string, string>>
	del(key: string): Promise<number>
}

/** Admin user shape returned by the database module's getAdminUser. */
interface AdminUserShape {
	id: string
	role: 'admin' | 'member' | 'guest'
}

export interface CreateHandlerDeps {
	livinityd: MinimalLivinityd
	logger: MinimalLogger
	redis: MinimalRedis
	/** Test-injectable factory; production constructs a real PtySession. */
	sessionFactory?: (opts: PtySpawnOptions) => PtySessionLike
	/** Test-injectable flag check; default = `isTerminalPanelEnabled`. */
	flagChecker?: (redis: TerminalFlagRedisClient) => Promise<boolean>
	/** Test-injectable; production dynamically imports from database module. */
	getAdminUserFn?: () => Promise<AdminUserShape | null>
	/** Test-injectable; production uses metadata.ts writeSessionMetadata. */
	writeMetadataFn?: (
		redis: MinimalRedis,
		sessionId: string,
		meta: PtySessionMetadata,
	) => Promise<void>
	/** Test-injectable; production uses metadata.ts deleteSessionMetadata. */
	deleteMetadataFn?: (
		redis: MinimalRedis,
		sessionId: string,
	) => Promise<void>
}

// ─── Helpers ────────────────────────────────────────────────────────────

function extractProxyToken(
	request: {headers: {cookie?: string}},
): string | null {
	const cookieHeader = request.headers.cookie ?? ''
	const m = cookieHeader.match(/LIVINITY_PROXY_TOKEN=([^;]+)/)
	return m ? m[1] : null
}

function safeSend(ws: WebSocket, obj: unknown, logger: MinimalLogger): void {
	try {
		ws.send(JSON.stringify(obj))
	} catch (err) {
		warnOrError(logger, '[pty-terminal] ws.send failed:', (err as Error)?.message || err)
	}
}

function isFinitePositiveInt(value: unknown): value is number {
	return (
		typeof value === 'number' && Number.isFinite(value) && value > 0 && Number.isInteger(value)
	)
}

// ─── Handler factory ────────────────────────────────────────────────────

export function createPtyTerminalWsHandler(deps: CreateHandlerDeps) {
	const flagChecker = deps.flagChecker ?? isTerminalPanelEnabled
	const sessionFactory =
		deps.sessionFactory ?? ((opts: PtySpawnOptions) => new PtySession(opts) as unknown as PtySessionLike)
	const writeMetadataFn = deps.writeMetadataFn ?? writeSessionMetadata
	const deleteMetadataFn = deps.deleteMetadataFn ?? deleteSessionMetadata

	async function resolveGetAdminUser(): Promise<() => Promise<AdminUserShape | null>> {
		if (deps.getAdminUserFn) return deps.getAdminUserFn
		const mod = (await import('../database/index.js')) as {
			getAdminUser: () => Promise<AdminUserShape | null>
		}
		return mod.getAdminUser
	}

	return async function handler(
		ws: WebSocket,
		request: http.IncomingMessage,
	): Promise<void> {
		// ─── Gate 1: cookie auth ──────────────────────────────────────────
		const proxyToken = extractProxyToken(request as never)
		if (!proxyToken) {
			ws.close(4403, 'unauthorized')
			return
		}
		let tokenPayload: {userId?: string; loggedIn?: boolean}
		try {
			tokenPayload = (await deps.livinityd.server.verifyProxyToken(proxyToken)) as {
				userId?: string
				loggedIn?: boolean
			}
		} catch (err) {
			warnOrError(
				deps.logger,
				'[pty-terminal] verifyProxyToken failed:',
				(err as Error)?.message || err,
			)
			ws.close(4403, 'unauthorized')
			return
		}

		// ─── Gate 2: feature flag ─────────────────────────────────────────
		let flagOn = false
		try {
			flagOn = await flagChecker(deps.redis)
		} catch (err) {
			warnOrError(
				deps.logger,
				'[pty-terminal] flagChecker failed:',
				(err as Error)?.message || err,
			)
			flagOn = false
		}
		if (!flagOn) {
			ws.close(4403, 'feature disabled')
			return
		}

		// ─── Resolve user_id (legacy {loggedIn:true} → getAdminUser) ──────
		let userId: string
		if (typeof tokenPayload.userId === 'string' && tokenPayload.userId.length > 0) {
			userId = tokenPayload.userId
		} else if (tokenPayload.loggedIn === true) {
			try {
				const getAdminUser = await resolveGetAdminUser()
				const admin = await getAdminUser()
				userId = admin?.id ?? 'admin'
			} catch (err) {
				warnOrError(
					deps.logger,
					'[pty-terminal] getAdminUser failed:',
					(err as Error)?.message || err,
				)
				userId = 'admin'
			}
		} else {
			ws.close(4403, 'unauthorized')
			return
		}

		// ─── State for this connection ────────────────────────────────────
		let session: PtySessionLike | null = null
		let cleanedUp = false

		async function cleanup(): Promise<void> {
			if (cleanedUp) return
			cleanedUp = true
			const s = session
			if (s) {
				try {
					s.kill()
				} catch (err) {
					warnOrError(
						deps.logger,
						'[pty-terminal] kill threw during cleanup:',
						(err as Error)?.message || err,
					)
				}
				try {
					await deleteMetadataFn(deps.redis, s.sessionId)
				} catch (err) {
					warnOrError(
						deps.logger,
						'[pty-terminal] deleteMetadata failed:',
						(err as Error)?.message || err,
					)
				}
			}
		}

		// ─── Message routing ──────────────────────────────────────────────
		ws.on('message', (raw: Buffer | string) => {
			let parsed: {type?: string; [k: string]: unknown}
			try {
				parsed = JSON.parse(typeof raw === 'string' ? raw : raw.toString())
			} catch {
				safeSend(ws, {type: 'error', message: 'bad message shape'}, deps.logger)
				return
			}
			if (!parsed || typeof parsed.type !== 'string') {
				safeSend(ws, {type: 'error', message: 'bad message shape'}, deps.logger)
				return
			}

			if (parsed.type === 'init') {
				if (session) {
					// already initialized — silently ignore duplicate init
					return
				}
				const cols = parsed.cols
				const rows = parsed.rows
				if (!isFinitePositiveInt(cols) || !isFinitePositiveInt(rows)) {
					safeSend(
						ws,
						{type: 'error', message: 'init: cols/rows required'},
						deps.logger,
					)
					return
				}
				const cwd = typeof parsed.cwd === 'string' ? parsed.cwd : undefined
				const spawnOpts: PtySpawnOptions = {
					username: 'bruce',
					cols,
					rows,
					...(cwd !== undefined ? {cwd} : {}),
				}
				let created: PtySessionLike
				try {
					created = sessionFactory(spawnOpts)
					created.start()
				} catch (err) {
					const message = (err as Error)?.message ?? String(err)
					warnOrError(
						deps.logger,
						'[pty-terminal] spawn failed:',
						message,
					)
					safeSend(ws, {type: 'error', message}, deps.logger)
					ws.close(1011, 'spawn failed')
					// Best-effort cleanup — created session if any.
					void cleanup()
					return
				}
				session = created
				const nowIso = new Date().toISOString()
				const meta: PtySessionMetadata = {
					user_id: userId,
					name: 'terminal',
					createdAt: nowIso,
					lastAttachAt: nowIso,
					cwd: cwd ?? '',
				}
				// Fire-and-log: Redis metadata is observability, not auth.
				void writeMetadataFn(deps.redis, created.sessionId, meta).catch((err) => {
					warnOrError(
						deps.logger,
						'[pty-terminal] writeMetadata failed (continuing):',
						(err as Error)?.message || err,
					)
				})
				safeSend(ws, {type: 'ready', sessionId: created.sessionId}, deps.logger)
				created.on('data', (chunk: string) => {
					safeSend(ws, {type: 'data', data: chunk}, deps.logger)
				})
				created.on('exit', (info: {exitCode: number; signal: string | null}) => {
					safeSend(
						ws,
						{type: 'exit', code: info.exitCode, signal: info.signal},
						deps.logger,
					)
					try {
						ws.close(1000)
					} catch {
						// transport already closed — ignore
					}
					void cleanup()
				})
				return
			}

			// Messages other than 'init' before session exists → silently ignored
			// per protocol (no PtySession spawn yet).
			if (!session) {
				return
			}

			if (parsed.type === 'data') {
				if (typeof parsed.data === 'string') {
					session.write(parsed.data)
				}
				return
			}
			if (parsed.type === 'resize') {
				if (isFinitePositiveInt(parsed.cols) && isFinitePositiveInt(parsed.rows)) {
					session.resize(parsed.cols, parsed.rows)
				}
				return
			}
			if (parsed.type === 'close') {
				session.kill()
				return
			}

			safeSend(ws, {type: 'error', message: 'bad message shape'}, deps.logger)
		})

		ws.on('close', () => {
			void cleanup()
		})

		ws.on('error', (err: Error) => {
			warnOrError(
				deps.logger,
				'[pty-terminal] ws error:',
				err?.message || err,
			)
		})
	}
}
