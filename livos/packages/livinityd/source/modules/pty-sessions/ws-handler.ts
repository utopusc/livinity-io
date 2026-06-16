/**
 * Phase 246-03 — /livos/terminal/ws WebSocket handler (multi-session).
 *
 * Extends Phase 243-02's single-session handler with create/attach routing
 * through SessionManager + Redis scrollback writes on every PTY chunk.
 *
 * Auth gates (preserved verbatim from Phase 243-02):
 *   1. LIVINITY_PROXY_TOKEN cookie present + verifyProxyToken passes
 *      → on failure: ws.close(4403, 'unauthorized')
 *   2. Feature flag `livos:v43:terminal_panel` === 'true'
 *      → on failure: ws.close(4403, 'feature disabled')
 *   3. Username forced to literal 'bruce' — D-V44-NO-ROOT-PTY defense-in-depth
 *
 * Connection routing (URL query parsing):
 *   - /livos/terminal/ws            → CREATE branch (Phase 243 default)
 *   - /livos/terminal/ws?create     → CREATE branch (explicit, same as above)
 *   - /livos/terminal/ws?attach=<id>→ ATTACH branch (NEW Phase 246-03)
 *
 * Wire protocol:
 *   Client → Server: init / data / resize / close
 *   Server → Client: ready / reattached / data / exit / error
 *
 * Lifecycle (semantic break from Phase 243-02):
 *   - Phase 243: ws.close() called session.kill() in cleanup
 *   - Phase 246: ws.close() is a no-op — PTY survives reload. Only
 *               explicit {type:'close'} OR session 'exit' OR admin kill
 *               destroys the PtySession.
 *
 * Scrollback persistence:
 *   - Every PTY 'data' chunk → ws.send + appendScrollback(redis, id, chunk)
 *   - On exit: deleteSessionMetadata + deleteScrollback (best-effort)
 *
 * D-V44-CADDY-REUSE-226-04: this handler reuses the existing
 * /livos/terminal/* Caddy matcher unchanged — the query-string variants are
 * matched by path prefix.
 *
 * D-V44-SACRED: this module does NOT touch sdk-agent-runner.ts.
 */

import type http from 'node:http'
import type {WebSocket} from 'ws'

import type {PtySpawnOptions, PtySessionMetadata} from './types.js'
import {
	isTerminalPanelEnabled,
	type TerminalFlagRedisClient,
} from './feature-flag.js'
import {getDesktopUser} from '../system/desktop-user.js'
import {
	writeSessionMetadata,
	deleteSessionMetadata,
} from './metadata.js'
import {
	appendScrollback,
	readScrollback,
	deleteScrollback,
	touchLastAttachAt,
	type PtyScrollbackRedisClient,
} from './scrollback.js'
import type {SessionManager} from './session-manager.js'

// ─── Types ──────────────────────────────────────────────────────────────

interface MinimalLogger {
	warn?: (message: string, ...args: unknown[]) => void
	error: (message: string, ...args: unknown[]) => void
	log?: (message?: string) => void
	info?: (message: string, ...args: unknown[]) => void
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

/** Surface the handler needs from a SessionManager record (Session). */
interface SessionRecordLike {
	id: string
	name: string
	pty: PtySessionLike
	createdAt: string
	lastAttachAt: string
}

/** Narrow shape of the livinityd binding the handler uses. */
interface MinimalLivinityd {
	server: {
		verifyProxyToken(
			token: string,
		): Promise<{userId?: string; loggedIn?: boolean} | unknown>
	}
}

/** Redis client surface — superset of flag + metadata + scrollback. */
interface MinimalRedis extends TerminalFlagRedisClient, PtyScrollbackRedisClient {
	hgetall(key: string): Promise<Record<string, string>>
	// Phase 243 metadata.ts wants a {hset(key, fields: Record<string,string>)}
	// overload — scrollback.ts wants {hset(key, field, value)}. ioredis supports
	// both at runtime. Declare the field-record overload here so the metadata
	// function-call sites typecheck against the same shape.
	hset(key: string, field: string, value: string): Promise<number>
	hset(key: string, fields: Record<string, string>): Promise<number>
}

/** Admin user shape returned by the database module's getAdminUser. */
interface AdminUserShape {
	id: string
	role: 'admin' | 'member' | 'guest'
}

/** Minimal surface the handler needs from SessionManager (testable via mock). */
export interface SessionManagerLike {
	create(opts: PtySpawnOptions, nameHint?: string): SessionRecordLike
	get(sessionId: string): SessionRecordLike | null
	touch(sessionId: string): boolean
	kill(sessionId: string): boolean
}

export interface CreateHandlerDeps {
	livinityd: MinimalLivinityd
	logger: MinimalLogger
	redis: MinimalRedis
	/** Phase 246-01 — shared per-livinityd-process SessionManager singleton. */
	sessionManager: SessionManager | SessionManagerLike
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
	/** Test-injectable; production uses scrollback.ts appendScrollback. */
	appendScrollbackFn?: (
		redis: PtyScrollbackRedisClient,
		sessionId: string,
		chunk: string,
	) => Promise<void>
	/** Test-injectable; production uses scrollback.ts readScrollback. */
	readScrollbackFn?: (
		redis: PtyScrollbackRedisClient,
		sessionId: string,
	) => Promise<string[]>
	/** Test-injectable; production uses scrollback.ts deleteScrollback. */
	deleteScrollbackFn?: (
		redis: PtyScrollbackRedisClient,
		sessionId: string,
	) => Promise<void>
	/** Test-injectable; production uses scrollback.ts touchLastAttachAt. */
	touchLastAttachAtFn?: (
		redis: PtyScrollbackRedisClient,
		sessionId: string,
		isoTimestamp: string,
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

function parseUrlMode(rawUrl: string | undefined): {
	mode: 'create' | 'attach'
	attachId: string | null
} {
	try {
		const url = new URL(rawUrl ?? '/', 'http://internal')
		const attachId = url.searchParams.get('attach')
		if (attachId !== null && attachId.length > 0) {
			return {mode: 'attach', attachId}
		}
	} catch {
		// fall through to create
	}
	return {mode: 'create', attachId: null}
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
	const writeMetadataFn = deps.writeMetadataFn ?? writeSessionMetadata
	const deleteMetadataFn = deps.deleteMetadataFn ?? deleteSessionMetadata
	const appendScrollbackFn = deps.appendScrollbackFn ?? appendScrollback
	const readScrollbackFn = deps.readScrollbackFn ?? readScrollback
	const deleteScrollbackFn = deps.deleteScrollbackFn ?? deleteScrollback
	const touchLastAttachAtFn = deps.touchLastAttachAtFn ?? touchLastAttachAt
	const sessionManager = deps.sessionManager as SessionManagerLike

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
			warnOrError(
				deps.logger,
				'[pty-terminal] upgrade rejected: no LIVINITY_PROXY_TOKEN cookie on request',
			)
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

		// ─── Resolve user_id ──────────────────────────────────────────────
		// Reaching here means verifyProxyToken RESOLVED (a throw would have
		// closed above), so the proxy token is valid = authenticated browser
		// session. That token carries NO identity by design: jwt.ts signs
		// `{proxyToken:true}` and verifyProxyToken returns the boolean `true`,
		// NOT a payload object. For v44 (single-user) a valid proxy token
		// therefore resolves to the admin user; the PTY still runs as bruce
		// per D-V44-NO-ROOT-PTY. The userId branch below is retained for
		// forward-compat in case a future token gains an identity payload
		// (v45 multi-user).
		//
		// HOT-FIX 2026-05-29: the previous `else { ws.close(4403) }` here was a
		// silent-disconnect bug — it fired on EVERY real connection because the
		// live payload is the boolean `true`, never an object with
		// userId/loggedIn. The 12 unit tests mocked verifyProxyToken to return
		// `{userId:'u1', loggedIn:true}`, so the broken path went unnoticed
		// until the terminal feature flag was first turned on (Phase 246 UAT).
		let userId: string
		const idPayload = tokenPayload as {userId?: string; loggedIn?: boolean} | boolean
		if (
			idPayload &&
			typeof idPayload === 'object' &&
			typeof idPayload.userId === 'string' &&
			idPayload.userId.length > 0
		) {
			userId = idPayload.userId
		} else {
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
		}

		// ─── Resolve desktop user (R4, Phase 252-02) ──────────────────────
		// Mirror server/index.ts — resolve the OS user the PTY runs as from Redis
		// `livos:desktop:user` so a non-bruce box gets a working terminal.
		// WS1: fail-soft to getDesktopUser() (the process's own user) instead of a
		// hardcoded 'bruce', so it's correct even when the Redis key is unseeded.
		// Resolved here (async handler scope) because the `init` branch runs
		// inside a synchronous ws.on('message').
		let desktopUser = getDesktopUser()
		try {
			const u = await (deps.redis as {get?: (k: string) => Promise<string | null>})
				.get?.('livos:desktop:user')
			if (typeof u === 'string' && u.length > 0) desktopUser = u
		} catch {
			// Phase 278: on a Redis throw, KEEP the already-resolved
			// getDesktopUser() value (the process's own login). The old
			// `desktopUser = 'bruce'` here CLOBBERED the correct value on any
			// non-bruce box whenever Redis hiccupped.
		}

		// ─── URL mode routing (Phase 246-03) ──────────────────────────────
		const requestUrl = (request as {url?: string}).url
		const {mode, attachId} = parseUrlMode(requestUrl)

		// ─── State for this connection ────────────────────────────────────
		let activeSession: SessionRecordLike | null = null

		function wireForwarders(session: SessionRecordLike): void {
			const sessionId = session.id
			session.pty.on('data', (chunk: string) => {
				safeSend(ws, {type: 'data', data: chunk}, deps.logger)
				// Fire-and-log: scrollback writes are observability + reload-replay,
				// not auth — never throw out of the data callback.
				void appendScrollbackFn(deps.redis, sessionId, chunk).catch((err) => {
					warnOrError(
						deps.logger,
						'[pty-terminal] appendScrollback failed:',
						(err as Error)?.message || err,
					)
				})
			})
			session.pty.on(
				'exit',
				(info: {exitCode: number; signal: string | null}) => {
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
					// Phase 246-03: pty exit removes from SessionManager + cleans Redis.
					try {
						sessionManager.kill(sessionId)
					} catch (err) {
						warnOrError(
							deps.logger,
							'[pty-terminal] sessionManager.kill on exit threw:',
							(err as Error)?.message || err,
						)
					}
					void deleteMetadataFn(deps.redis, sessionId).catch((err) => {
						warnOrError(
							deps.logger,
							'[pty-terminal] deleteMetadata failed:',
							(err as Error)?.message || err,
						)
					})
					void deleteScrollbackFn(deps.redis, sessionId).catch((err) => {
						warnOrError(
							deps.logger,
							'[pty-terminal] deleteScrollback failed:',
							(err as Error)?.message || err,
						)
					})
				},
			)
		}

		// ─── ATTACH branch (Phase 246-03) ─────────────────────────────────
		if (mode === 'attach' && attachId) {
			const existing = sessionManager.get(attachId)
			if (!existing) {
				ws.close(4404, 'session not found')
				return
			}
			activeSession = existing
			// Best-effort Redis HSET on the metadata hash — observability only.
			const nowIso = new Date().toISOString()
			void touchLastAttachAtFn(deps.redis, attachId, nowIso).catch((err) => {
				warnOrError(
					deps.logger,
					'[pty-terminal] touchLastAttachAt failed:',
					(err as Error)?.message || err,
				)
			})
			try {
				sessionManager.touch(attachId)
			} catch (err) {
				warnOrError(
					deps.logger,
					'[pty-terminal] sessionManager.touch threw:',
					(err as Error)?.message || err,
				)
			}
			let scrollback: string[] = []
			try {
				scrollback = await readScrollbackFn(deps.redis, attachId)
			} catch (err) {
				warnOrError(
					deps.logger,
					'[pty-terminal] readScrollback failed (empty replay):',
					(err as Error)?.message || err,
				)
				scrollback = []
			}
			safeSend(
				ws,
				{type: 'reattached', sessionId: attachId, scrollback},
				deps.logger,
			)
			wireForwarders(existing)
			// Fall through to the message router below so resize/data/close work.
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
				if (activeSession) {
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
					username: desktopUser,
					cols,
					rows,
					...(cwd !== undefined ? {cwd} : {}),
				}
				let created: SessionRecordLike
				try {
					created = sessionManager.create(spawnOpts)
				} catch (err) {
					const message = (err as Error)?.message ?? String(err)
					warnOrError(
						deps.logger,
						'[pty-terminal] spawn failed:',
						message,
					)
					safeSend(ws, {type: 'error', message}, deps.logger)
					ws.close(1011, 'spawn failed')
					return
				}
				activeSession = created
				const meta: PtySessionMetadata = {
					user_id: userId,
					name: created.name,
					createdAt: created.createdAt,
					lastAttachAt: created.lastAttachAt,
					cwd: cwd ?? '',
				}
				// Fire-and-log: Redis metadata is observability, not auth.
				void writeMetadataFn(deps.redis, created.id, meta).catch((err) => {
					warnOrError(
						deps.logger,
						'[pty-terminal] writeMetadata failed (continuing):',
						(err as Error)?.message || err,
					)
				})
				safeSend(ws, {type: 'ready', sessionId: created.id}, deps.logger)
				wireForwarders(created)
				return
			}

			// Messages other than 'init' before session exists → silently ignored
			// per protocol (no PtySession spawn yet).
			if (!activeSession) {
				return
			}

			if (parsed.type === 'data') {
				if (typeof parsed.data === 'string') {
					activeSession.pty.write(parsed.data)
				}
				return
			}
			if (parsed.type === 'resize') {
				if (isFinitePositiveInt(parsed.cols) && isFinitePositiveInt(parsed.rows)) {
					activeSession.pty.resize(parsed.cols, parsed.rows)
				}
				return
			}
			if (parsed.type === 'close') {
				// Phase 246-03: route teardown through SessionManager so the map
				// stays consistent. The manager-kill triggers pty.kill internally
				// — the 'exit' forwarder above then sends {type:'exit'} + closes.
				try {
					sessionManager.kill(activeSession.id)
				} catch (err) {
					warnOrError(
						deps.logger,
						'[pty-terminal] sessionManager.kill on close threw:',
						(err as Error)?.message || err,
					)
				}
				return
			}

			safeSend(ws, {type: 'error', message: 'bad message shape'}, deps.logger)
		})

		ws.on('close', () => {
			// Phase 246-03 semantic break — do NOT kill the PtySession on ws
			// disconnect. The session survives browser reload; the next attach
			// reattaches via ?attach=<id>. Only explicit {type:'close'}, pty
			// exit, or admin kill destroys the session.
			if (typeof deps.logger.info === 'function' && activeSession) {
				deps.logger.info('[pty-terminal] ws disconnected', {
					sessionId: activeSession.id,
				})
			}
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
