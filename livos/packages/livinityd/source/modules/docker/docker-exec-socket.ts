import type http from 'node:http'

import {type WebSocket} from 'ws'

import {getDockerClient} from './docker-clients.js'
import type Livinityd from '../../index.js'
import type createLogger from '../utilities/logger.js'

/**
 * Phase 263-03 (L-062) — minimal user shape returned by findUserById /
 * getAdminUser. Only `id` and `role` are consulted at this boundary.
 */
interface DatabaseUserShape {
	id: string
	role: 'admin' | 'member' | 'guest'
}

/**
 * Phase 263-03 (L-062) — DI surface for the RBAC gate. Production resolves the
 * three *Fn from `../database/index.js` (and the docker client from
 * `./docker-clients.js`); tests inject fakes so the gate can be driven without
 * PG / jwt / a real Docker socket. Mirrors ssh-sessions/ws-handler.ts
 * CreateHandlerDeps.
 */
export interface CreateDockerExecHandlerDeps {
	livinityd: Livinityd
	logger: ReturnType<typeof createLogger>
	findUserByIdFn?: (id: string) => Promise<DatabaseUserShape | null>
	getAdminUserFn?: () => Promise<DatabaseUserShape | null>
	userOwnsContainerFn?: (userId: string, containerName: string) => Promise<boolean>
	getDockerClientFn?: typeof getDockerClient
}

/**
 * Parsed query-string surface for the WS handler. `envId` is optional and
 * defaults to null so existing Phase 17 ContainerDetailSheet ConsoleTab
 * callers (which never send envId) keep streaming local-socket exec
 * sessions unchanged.
 */
export interface ExecParams {
	containerName: string | null
	shell: string // default 'bash'; handler validates against ALLOWED_SHELLS
	user: string // default ''
	envId: string | null // empty/missing → null
}

const ALLOWED_SHELLS = ['bash', 'sh', 'ash'] as const

/**
 * Pure URL parser — extracted boundary so the WS handler stays a thin shell
 * and unit tests don't need to mock Docker / WS / ws upgrade. See
 * docker-exec-socket.unit.test.ts for the full contract.
 *
 * Empty `envId=` is treated as missing so back-compat callers (no envId) and
 * old callers accidentally sending an empty value both fall through to the
 * local socket. Token query param is intentionally NOT surfaced — the JWT is
 * consumed by the WS upgrade authentication BEFORE this handler runs;
 * surfacing it here would add a place where the secret could leak into a
 * logger. Mirrors Plan 28-01 parseLogsParams shape decision.
 *
 * Shell value is preserved verbatim (no validation here) — the handler
 * validates against ALLOWED_SHELLS and closes 1008 on miss. Keeping the
 * parser dumb-and-pure simplifies its tests and respects single
 * responsibility.
 */
export function parseExecParams(rawUrl: string): ExecParams {
	let params: URLSearchParams
	try {
		// `new URL(...)` requires an origin; we synthesize one because the WS
		// upgrade only carries the path + query.
		params = new URL(`https://localhost${rawUrl || '/'}`).searchParams
	} catch {
		// Defensive — malformed URLs return the empty shape rather than throw.
		return {containerName: null, shell: 'bash', user: '', envId: null}
	}

	const containerName = params.get('container') || null
	const shell = params.get('shell') || 'bash'
	const user = params.get('user') || ''

	const envIdRaw = params.get('envId')
	const envId = envIdRaw && envIdRaw.length > 0 ? envIdRaw : null

	return {containerName, shell, user, envId}
}

/**
 * WebSocket handler for real-time container exec terminal streaming.
 *
 * URL: `/ws/docker-exec?container=<name>&envId=<id|alias|null>&shell=<bash|sh|ash>&user=<u>&token=<jwt>`
 *
 * - `envId` is OPTIONAL (Phase 29 Plan 29-01) — when omitted, falls back to
 *   the local socket via `getDockerClient(null)` (existing Phase 17
 *   ContainerDetailSheet ConsoleTab behaviour preserved without UI changes).
 * - `envId` accepts a UUID OR the `'local'` alias (canonicalised inside
 *   getDockerClient). Agent envs return a clear 1011 close instead of
 *   silently falling back.
 * - Streams `container.exec({Tty:true})` with bidirectional pipe; resize
 *   messages arrive as JSON `{type:'resize', cols, rows}` over the same WS.
 *
 * Mirrors the Plan 28-01 docker-logs-socket.ts env-resolution + error-mapping
 * pattern verbatim — `[env-not-found]` → 1008, `[agent-not-implemented]` →
 * 1011, anything else propagates.
 */
export default function createDockerExecHandler(deps: CreateDockerExecHandlerDeps) {
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
			const {containerName, shell, user, envId} = parseExecParams(request.url ?? '')

			// Validate required container parameter
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
					logger.error(`Exec handler — token verify failed`, err)
					ws.close(4403, 'unauthorized')
					return
				}

				const findUserById = await resolveFindUserById()
				const user2 = await findUserById(userId)
				if (!user2) {
					ws.close(4403, 'unauthorized')
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

			// Validate shell is one of the allowed options
			if (!ALLOWED_SHELLS.includes(shell as (typeof ALLOWED_SHELLS)[number])) {
				ws.close(1008, 'Invalid shell. Must be one of: bash, sh, ash')
				return
			}

			// Phase 29 Plan 29-01: resolve a per-env Dockerode client. When envId
			// is null, getDockerClient(null) returns the local-socket client (back-
			// compat for the existing Phase 17 ContainerDetailSheet ConsoleTab).
			// When envId is a UUID or 'local' alias, the env-specific client is
			// returned. Agent envs throw [agent-not-implemented] which we map to
			// 1011 — honest failure beats silent fallback to the local socket
			// (which would let an agent-env-targeted exec accidentally run on the
			// LivOS host).
			let docker
			try {
				docker = await getClient(envId)
			} catch (err: any) {
				const msg = err?.message ?? ''
				if (msg.startsWith('[env-not-found]')) {
					logger.error(`Exec handler — unknown env`, err)
					if (ws.readyState === ws.OPEN) ws.close(1008, 'Unknown env')
					return
				}
				if (msg.startsWith('[agent-not-implemented]')) {
					logger.error(`Exec handler — agent env not yet supported`, err)
					if (ws.readyState === ws.OPEN) {
						ws.close(1011, 'Agent envs not yet supported for exec')
					}
					return
				}
				// Misconfigured env or other infrastructural error — surface as
				// generic internal error, don't fall through to local socket
				// (silent fallback would hide the misconfiguration).
				throw err
			}

			logger.log(
				`Exec into ${containerName} (envId=${envId ?? 'local'}, shell=${shell})${user ? ` user=${user}` : ''}`,
			)

			const container = docker.getContainer(containerName)
			const exec = await container.exec({
				Cmd: [shell],
				AttachStdin: true,
				AttachStdout: true,
				AttachStderr: true,
				Tty: true,
				User: user || undefined,
			})

			const stream = await exec.start({hijack: true, stdin: true, Tty: true})

			// Stream output from exec to WebSocket
			stream.on('data', (chunk: Buffer) => {
				if (ws.readyState === ws.OPEN) {
					ws.send(chunk)
				}
			})

			// Stream input from WebSocket to exec
			ws.on('message', (data: Buffer | string) => {
				// Try to parse as JSON for resize messages
				try {
					const msg = JSON.parse(typeof data === 'string' ? data : data.toString())
					if (msg && msg.type === 'resize' && typeof msg.cols === 'number' && typeof msg.rows === 'number') {
						exec.resize({h: msg.rows, w: msg.cols}).catch((err) => {
							logger.error(`Exec resize error for ${containerName}`, err)
						})
						return
					}
				} catch {
					// Not JSON -- treat as terminal input
				}

				stream.write(data)
			})

			// Cleanup: WebSocket closed -> destroy stream
			ws.on('close', () => {
				logger.verbose(`Exec session closed for ${containerName}`)
				stream.destroy()
			})

			// Cleanup: Stream ended -> close WebSocket
			stream.on('end', () => {
				if (ws.readyState === ws.OPEN) {
					ws.close()
				}
			})

			stream.on('error', (err) => {
				logger.error(`Exec stream error for ${containerName}`, err)
				if (ws.readyState === ws.OPEN) {
					ws.close(1011, 'Stream error')
				}
			})
		} catch (error: any) {
			logger.error(`Docker exec handler error`, error)
			if (ws.readyState === ws.OPEN) {
				ws.close(1011, error?.message || 'Internal error')
			}
		}
	}
}
