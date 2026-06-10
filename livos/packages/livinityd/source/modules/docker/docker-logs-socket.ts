import type http from 'node:http'

import {type WebSocket} from 'ws'

import {getDockerClient} from './docker-clients.js'
import {stripDockerStreamHeaders} from './docker.js'
import type Livinityd from '../../index.js'
import type createLogger from '../utilities/logger.js'

/**
 * Phase 263-03 (L-062) — minimal user shape returned by findUserById /
 * getAdminUser. `id`/`role` drive the RBAC gate; `isActive` (WR-02) lets the
 * gate reject deactivated/revoked tenants immediately instead of honoring a
 * still-valid JWT until expiry. Optional so legacy fakes/admins without the
 * flag are treated as active (only an explicit `false` rejects).
 */
interface DatabaseUserShape {
	id: string
	role: 'admin' | 'member' | 'guest'
	isActive?: boolean
}

/**
 * Phase 263-03 (L-062) — DI surface for the RBAC gate. Production resolves the
 * three *Fn from `../database/index.js`; tests inject fakes so the gate can be
 * driven without PG / jwt / a real Docker socket. Mirrors
 * ssh-sessions/ws-handler.ts CreateHandlerDeps.
 */
export interface CreateDockerLogsHandlerDeps {
	livinityd: Livinityd
	logger: ReturnType<typeof createLogger>
	findUserByIdFn?: (id: string) => Promise<DatabaseUserShape | null>
	getAdminUserFn?: () => Promise<DatabaseUserShape | null>
	userOwnsContainerFn?: (userId: string, containerName: string) => Promise<boolean>
	getDockerClientFn?: typeof getDockerClient
}

/**
 * Parsed query-string surface for the WS handler. `envId` is optional and
 * defaults to null so existing callers (Phase 17 ContainerDetailSheet
 * LogsTab) keep streaming local-socket logs unchanged.
 */
export interface LogsParams {
	containerName: string | null
	tail: number
	envId: string | null
}

/**
 * Pure URL parser — extracted boundary so the WS handler stays a thin shell
 * and unit tests don't need to mock Docker / WS / ws upgrade. See
 * docker-logs-socket.unit.test.ts for the full contract.
 *
 * Tail is clamped to [0, 5000] (matches MAX_LINES_PER_CONTAINER on the UI
 * side). Non-numeric tail falls back to default 500. Empty `envId=` is
 * treated as missing so back-compat callers (no envId) and old callers
 * accidentally sending an empty value both fall through to the local socket.
 *
 * Token query param is intentionally NOT surfaced — the JWT is consumed by
 * the WS upgrade authentication BEFORE this handler runs; surfacing it here
 * would add a place where the secret could leak into a logger.
 */
export function parseLogsParams(rawUrl: string): LogsParams {
	let params: URLSearchParams
	try {
		// `new URL(...)` requires an origin; we synthesize one because the WS
		// upgrade only carries the path + query.
		params = new URL(`https://localhost${rawUrl || '/'}`).searchParams
	} catch {
		// Defensive — malformed URLs return the empty shape rather than throw.
		return {containerName: null, tail: 500, envId: null}
	}

	const containerName = params.get('container') || null

	const tailStr = params.get('tail')
	let tail = 500
	if (tailStr !== null && tailStr.length > 0) {
		const parsed = parseInt(tailStr, 10)
		if (Number.isFinite(parsed)) {
			tail = Math.max(0, Math.min(5000, parsed))
		}
		// NaN (e.g. 'banana') falls through to default 500.
	}

	const envIdRaw = params.get('envId')
	const envId = envIdRaw && envIdRaw.length > 0 ? envIdRaw : null

	return {containerName, tail, envId}
}

/**
 * WebSocket handler for real-time container log streaming.
 *
 * URL: `/ws/docker/logs?container=<name>&envId=<id|alias|null>&tail=<n>&token=<jwt>`
 *
 * - `envId` is OPTIONAL (Phase 28 Plan 28-01) — when omitted, falls back to
 *   the local socket via `getDockerClient(null)` (existing Phase 17
 *   behaviour preserved for ContainerDetailSheet LogsTab).
 * - `envId` accepts a UUID OR the `'local'` alias (canonicalised inside
 *   getDockerClient). Agent envs return a clear 1011 close instead of
 *   silently falling back.
 * - Streams `container.logs({follow:true})` with Docker multiplexed
 *   stream-header stripping. Does NOT strip ANSI — xterm.js in the browser
 *   renders color escapes natively (QW-01). The cross-container LogsViewer
 *   (Phase 28-01 Task 3) renders plain text and tolerates ANSI as visible
 *   garbage; the per-container xterm in ContainerDetailSheet is the
 *   canonical drilldown for ANSI colors.
 *
 * Heartbeat: ping every 30s; terminate if no pong within the next interval.
 */
export default function createDockerLogsHandler(deps: CreateDockerLogsHandlerDeps) {
	const {livinityd, logger} = deps

	async function resolveFindUserById(): Promise<(id: string) => Promise<DatabaseUserShape | null>> {
		if (deps.findUserByIdFn) return deps.findUserByIdFn
		const mod = (await import('../database/index.js')) as {
			findUserById: (id: string) => Promise<DatabaseUserShape | null>
		}
		return mod.findUserById
	}

	async function resolveGetAdminUser(): Promise<() => Promise<DatabaseUserShape | null>> {
		if (deps.getAdminUserFn) return deps.getAdminUserFn
		const mod = (await import('../database/index.js')) as {
			getAdminUser: () => Promise<DatabaseUserShape | null>
		}
		return mod.getAdminUser
	}

	async function resolveUserOwnsContainer(): Promise<
		(userId: string, containerName: string) => Promise<boolean>
	> {
		if (deps.userOwnsContainerFn) return deps.userOwnsContainerFn
		const mod = (await import('../database/index.js')) as {
			userOwnsContainer: (userId: string, containerName: string) => Promise<boolean>
		}
		return mod.userOwnsContainer
	}

	const getClient = deps.getDockerClientFn ?? getDockerClient

	return async function (ws: WebSocket, request: http.IncomingMessage) {
		try {
			const {containerName, tail, envId} = parseLogsParams(request.url ?? '')

			if (!containerName) {
				ws.close(1008, 'Missing container')
				return
			}

			// ── Phase 263-03 (L-062) — RBAC gate at the handler boundary ──────
			// WS upgrades are OUTSIDE the Express chain; the generic upgrade gate
			// (index.ts) does verifyToken ONLY — no role, no ownership. Re-verify
			// here and require admin OR container-ownership, else close 4403.
			// Mirrors ssh-sessions/ws-handler.ts:169-221. containerName is already
			// parsed above (needed for the ownership check).
			{
				let userId: string | null = null
				try {
					const url = new URL(`https://localhost${request.url ?? '/'}`)
					const token = url.searchParams.get('token')
					if (!token) {
						ws.close(4403, 'missing token')
						return
					}
					const payload = (await livinityd.server.verifyToken(token)) as {
						userId?: string
						loggedIn?: boolean
					}
					if (typeof payload.userId === 'string') {
						userId = payload.userId
					} else if (payload.loggedIn === true) {
						const getAdminUser = await resolveGetAdminUser()
						const admin = await getAdminUser()
						if (!admin) {
							ws.close(4403, 'admin role required')
							return
						}
						userId = admin.id
					} else {
						ws.close(4403, 'unauthorized')
						return
					}
				} catch (err) {
					logger.error(`Logs handler — token verify failed`, err)
					ws.close(4403, 'unauthorized')
					return
				}

				const findUserById = await resolveFindUserById()
				const user2 = await findUserById(userId)
				if (!user2) {
					ws.close(4403, 'unauthorized')
					return
				}
				// WR-02: a deactivated/revoked tenant must lose container access
				// immediately, not at JWT expiry (the row carries `is_active`).
				if (user2.isActive === false) {
					ws.close(4403, 'account inactive')
					return
				}
				if (user2.role !== 'admin') {
					const userOwnsContainer = await resolveUserOwnsContainer()
					const owns = await userOwnsContainer(userId, containerName)
					if (!owns) {
						ws.close(4403, 'forbidden: not owner')
						return
					}
				}
			}

			// Phase 28 Plan 28-01: resolve a per-env Dockerode client. When envId
			// is null, getDockerClient(null) returns the local-socket client (back-
			// compat for the existing ContainerDetailSheet LogsTab). When envId is
			// a UUID or 'local' alias, the env-specific client is returned.
			let docker
			try {
				docker = await getClient(envId)
			} catch (err: any) {
				const msg = err?.message ?? ''
				if (msg.startsWith('[env-not-found]')) {
					logger.error(`Logs handler — unknown env`, err)
					if (ws.readyState === ws.OPEN) ws.close(1008, 'Unknown env')
					return
				}
				if (msg.startsWith('[agent-not-implemented]')) {
					logger.error(`Logs handler — agent env not yet supported`, err)
					if (ws.readyState === ws.OPEN) {
						ws.close(1011, 'Agent envs not yet supported for logs')
					}
					return
				}
				// Misconfigured env or other infrastructural error — surface as
				// generic internal error, don't fall through to local socket
				// (silent fallback would hide the misconfiguration).
				throw err
			}

			logger.log(`Logs follow for ${containerName} (envId=${envId ?? 'local'}, tail=${tail})`)

			const container = docker.getContainer(containerName)
			// dockerode returns a NodeJS.ReadableStream when follow:true
			const stream = (await container.logs({
				stdout: true,
				stderr: true,
				tail,
				timestamps: false,
				follow: true,
			})) as unknown as NodeJS.ReadableStream

			// Strip Docker 8-byte frame headers per chunk before sending; DO NOT stripAnsi
			// (we want ANSI colors to reach xterm in the browser).
			stream.on('data', (chunk: Buffer) => {
				if (ws.readyState !== ws.OPEN) return
				const text = stripDockerStreamHeaders(chunk)
				ws.send(text)
			})

			stream.on('end', () => {
				if (ws.readyState === ws.OPEN) ws.close(1000, 'stream-end')
			})

			stream.on('error', (err) => {
				logger.error(`Logs stream error for ${containerName}`, err)
				if (ws.readyState === ws.OPEN) ws.close(1011, 'Stream error')
			})

			// Heartbeat: ping every 30s; terminate if no pong within the next interval
			let isAlive = true
			ws.on('pong', () => {
				isAlive = true
			})
			const heartbeat = setInterval(() => {
				if (!isAlive) {
					ws.terminate()
					return
				}
				isAlive = false
				try {
					ws.ping()
				} catch {
					/* ignore */
				}
			}, 30_000)

			ws.on('close', () => {
				clearInterval(heartbeat)
				logger.verbose(`Logs session closed for ${containerName}`)
				// dockerode log streams expose .destroy()
				;(stream as any).destroy?.()
			})
		} catch (error: any) {
			logger.error(`Docker logs handler error`, error)
			if (ws.readyState === ws.OPEN) ws.close(1011, error?.message || 'Internal error')
		}
	}
}
