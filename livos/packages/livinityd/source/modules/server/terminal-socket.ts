import type http from 'node:http'

import {$} from 'execa'
import pty, {IPty} from 'node-pty'
import {type WebSocket} from 'ws'

import type Livinityd from '../../index.js'
import type createLogger from '../utilities/logger.js'

/**
 * Phase 263-03 (L-062) — minimal user shape returned by findUserById /
 * getAdminUser. Only `id` and `role` are consulted at this boundary.
 */
interface DatabaseUserShape {
	id: string
	role: 'admin' | 'member' | 'guest'
	// WR-02: lets the gate reject deactivated/revoked tenants immediately
	// (the users row carries `is_active`). Optional so legacy fakes/admins
	// without the flag are treated as active (only an explicit `false` rejects).
	isActive?: boolean
}

const DEFAULT_SHELL_CONTAINERS: Record<string, string> = {
	bitcoin: 'bitcoind',
	lightning: 'lnd',
	ordinals: 'ord',
	nextcloud: 'web',
	'core-lightning': 'lightningd',
	'home-assistant': 'server',
	'bitcoin-knots': 'bitcoind',
	immich: 'server',
	photoprism: 'web',
}

interface TerminalDbShape {
	findUserById: (id: string) => Promise<DatabaseUserShape | null>
	getAdminUser: () => Promise<DatabaseUserShape | null>
	userOwnsContainer: (userId: string, containerName: string) => Promise<boolean>
}

export default function createTerminalWebSocketHandler({
	livinityd,
	logger,
	dbFn,
}: {
	livinityd: Livinityd
	logger: ReturnType<typeof createLogger>
	/** Test seam (WR-02): inject a fake DB so the active-user gate can be
	 * driven without a real PG. Production omits it -> dynamic import. */
	dbFn?: () => Promise<TerminalDbShape>
}) {
	async function resolveDb(): Promise<TerminalDbShape> {
		if (dbFn) return dbFn()
		return (await import('../database/index.js')) as never
	}

	return async function (ws: WebSocket, request: http.IncomingMessage) {
		try {
			const appId = new URL(`https://localhost/${request.url}`).searchParams.get('appId')
			const cols = Number(new URL(`https://localhost/${request.url}`).searchParams.get('cols'))
			const rows = Number(new URL(`https://localhost/${request.url}`).searchParams.get('rows'))

			// ── Phase 263-03 (L-062) — RBAC gate at the handler boundary ──────
			// WS upgrades are OUTSIDE the Express chain; the generic upgrade gate
			// (index.ts) does verifyToken ONLY — no role, no ownership. Re-verify
			// here and resolve the user. The host-shell branch (no appId) spawns
			// `sudo --user <username> --login bash` on the HOST — admin only. The
			// app branch requires admin OR ownership of the target container.
			// Mirrors ssh-sessions/ws-handler.ts:169-221.
			let user: DatabaseUserShape
			let userId: string
			try {
				const token = new URL(`https://localhost/${request.url}`).searchParams.get('token')
				if (!token) {
					ws.close(4403, 'missing token')
					return
				}
				const payload = (await livinityd.server.verifyToken(token)) as {
					userId?: string
					loggedIn?: boolean
				}
				const db = await resolveDb()
				let resolvedId: string | null = null
				if (typeof payload.userId === 'string') {
					resolvedId = payload.userId
				} else if (payload.loggedIn === true) {
					const admin = await db.getAdminUser()
					if (!admin) {
						ws.close(4403, 'admin role required')
						return
					}
					resolvedId = admin.id
				} else {
					ws.close(4403, 'unauthorized')
					return
				}
				const found = await db.findUserById(resolvedId)
				if (!found) {
					ws.close(4403, 'unauthorized')
					return
				}
				// WR-02: a deactivated/revoked tenant must lose terminal access
				// immediately, not at JWT expiry (the row carries `is_active`).
				if (found.isActive === false) {
					ws.close(4403, 'account inactive')
					return
				}
				user = found
				userId = resolvedId
			} catch (err) {
				logger.error(`Terminal socket — token verify failed`, err)
				ws.close(4403, 'unauthorized')
				return
			}

			// HOST-shell branch (no appId) is ADMIN ONLY — it spawns a host shell.
			if (!appId && user.role !== 'admin') {
				ws.close(4403, 'admin role required')
				return
			}

			let ptyProcess: IPty

			if (appId) {
				const app = await livinityd.apps.getApp(appId)
				const [manifest, compose] = await Promise.all([app.readManifest(), app.readCompose()])
				let container

				// If app has specified a default shell in it's manifest use that
				if (manifest.defaultShell) {
					container = compose.services![manifest.defaultShell]?.container_name
				}

				// If we don't have a default container specified, use a predefined lookup
				if (!container) {
					container = container = compose.services![DEFAULT_SHELL_CONTAINERS[app.id]]?.container_name
				}

				// If we still don't have a default container use the first container as a fallback
				if (!container) {
					container = Object.values(compose.services!).filter((service) => service.image && service.container_name)[0]
						?.container_name as string
				}

				// Phase 263-03 (L-062) — a non-admin may only open a terminal into
				// a container they own. Run the ownership check now that the target
				// `container` is resolved, BEFORE pty.spawn.
				if (user.role !== 'admin') {
					const db = await resolveDb()
					const owns = container ? await db.userOwnsContainer(userId, container) : false
					if (!owns) {
						ws.close(4403, 'forbidden: not owner')
						return
					}
				}

				// Launch terminal with interactive docker shell
				// We set a consistent '$ ' prompt across different containers regardless of the shell environment (bash or sh)
				// by overriding any existing PS1 settings.
				// We prioritize bash for better feature support but fall back to sh if bash is not available.
				// We disable bashrc with `--norc` to make sure the prompt isn't overridden.
				ptyProcess = pty.spawn(
					'docker',
					[
						'exec',
						'-it',
						container,
						'/bin/sh',
						'-c',
						`
						export PS1='$ '
						if command -v bash >/dev/null 2>&1; then
							exec bash --norc
						else
							exec sh
						fi
						`,
					],
					{
						name: 'xterm-color',
						cols,
						rows,
					},
				)
			} else {
				// Try to get username of first non-root user on the system (UID 1000)
				// Fall back to root if UID 1000 doesn't exist
				let username = 'root'
				try {
					const result = await $`id -nu 1000`
					username = result.stdout.trim()
				} catch {
					// UID 1000 doesn't exist, use root
					logger.log('No user with UID 1000, using root for terminal')
				}

				// Launch terminal
				if (username === 'root') {
					ptyProcess = pty.spawn(
						'bash',
						['-c', 'if [ -f /etc/motd ]; then cat /etc/motd; fi; exec bash'],
						{
							name: 'xterm-color',
							cols,
							rows,
						},
					)
				} else {
					ptyProcess = pty.spawn(
						'sudo',
						['--user', username, '--login', 'bash', '-c', 'if [ -f /etc/motd ]; then cat /etc/motd; fi; exec bash'],
						{
							name: 'xterm-color',
							cols,
							rows,
						},
					)
				}
			}
			// Stream output from the shell to the WebSocket
			ptyProcess.onData((data) => ws.send(data))

			// Stream input from the WebSocket to the shell
			ws.on('message', (data) => ptyProcess.write(data.toString()))

			// Kill process when WebSocket is closed
			ws.on('close', () => ptyProcess.kill())
		} catch (error) {
			logger.error(`Terminal socket`, error)
			ws?.close()
		}
	}
}
