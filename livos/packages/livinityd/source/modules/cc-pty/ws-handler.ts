// Phase 166-04 — /ws/cc-pty WebSocket handler.
//
// JWT-authenticated, ownership-gated bridge from browser WS to CcPtyManager.
// Protocol (D-V35-B):
//   client → server: {type:'attach'|'stdin'|'resize'|'detach', ...}
//   server → client: {type:'attached'|'stdout'|'exited'|'error', ...}
//
// Mitigations applied at this surface (full register in 166-04 PLAN.md
// threat_model):
//   T-166-04-01 unauth → ws.close(1008) BEFORE manager.attachSession
//   T-166-04-02 cross-user attach → error + close(1008)
//   T-166-04-03 oversize stdin (>1MB) → error + close(1009), pty.write skipped
//   T-166-04-04 malformed JSON → error frame, socket stays open
//   T-166-04-05 invalid resize → error frame, no resize
//
// Phase 163 ws-agent.ts surface UNCHANGED — /ws/cc-pty is a SEPARATE new
// endpoint. The JWT-parsing pattern is COPIED into the server/index.ts
// mount block (NOT extracted into a shared helper).

import type {WebSocket} from 'ws'
import type {IncomingMessage} from 'http'
import type {CcPtyManager} from './manager.js'
import type {SessionStore} from './session-store.js'
import type {CcPtySession} from './types.js'

const MAX_STDIN_BYTES = 1024 * 1024 // 1MB hard cap per stdin envelope
const WS_CLOSE_POLICY = 1008          // RFC 6455 "policy violation"
const WS_CLOSE_OVERSIZE = 1009        // RFC 6455 "message too big"

export interface CcPtyWsHandlerLogger {
	log: (msg: string) => void
	error: (msg: string, err?: unknown) => void
}

export interface CcPtyWsHandlerOptions {
	manager: CcPtyManager
	store: SessionStore
	logger: CcPtyWsHandlerLogger
	/**
	 * Auth resolver — given the upgrade request, returns the authenticated
	 * user. Mirrors livos/packages/livinityd/source/modules/server/ws-agent.ts
	 * JWT pattern. Returns null on unauth (handler will close with 1008).
	 */
	resolveUser: (req: IncomingMessage) => Promise<{id: string} | null>
}

type AttachHandle = {
	stdin: (data: string) => void
	resize: (cols: number, rows: number) => void
	detach: () => void
}

export function createCcPtyWsHandler(opts: CcPtyWsHandlerOptions) {
	return async (ws: WebSocket, req: IncomingMessage) => {
		const user = await opts.resolveUser(req).catch(() => null)
		if (!user) {
			ws.close(WS_CLOSE_POLICY, 'unauthorized')
			return
		}

		let attachHandle: AttachHandle | null = null

		const send = (env: object): void => {
			try {
				ws.send(JSON.stringify(env))
			} catch {
				/* socket gone — drop silently */
			}
		}

		ws.on('message', async (raw: unknown) => {
			let env: any
			try {
				const text = (raw as Buffer | string).toString('utf-8' as any)
				env = JSON.parse(text)
			} catch {
				send({type: 'error', message: 'malformed JSON'})
				return
			}
			try {
				if (env.type === 'attach') {
					if (attachHandle) {
						send({type: 'error', message: 'already attached — detach first'})
						return
					}
					let session: CcPtySession | null = await opts.store.getById(env.sessionId)

					// v38.2 hotfix — inline ad-hoc session creation by sessionId prefix.
					// Phase 190-01 added 'bare' auto-create gated on env.sessionType, but the
					// terminal-ws-client never sends sessionType — so the gate never fires
					// and bare/claude ad-hoc clicks 500'd with "session not found". Fix:
					// detect ad-hoc sessions by their id prefix (always assigned client-side)
					// and create on-the-fly. Includes `liv-agent-*` for Phase 189 agent click.
					if (!session) {
						if (env.sessionId.startsWith('liv-bare-')) {
							session = await opts.manager.createSession({
								userId: user.id,
								title: 'Terminal',
								cwd: typeof env.cwd === 'string' ? env.cwd : '~',
								sessionType: 'bare',
								id: env.sessionId,
							})
						} else if (env.sessionId.startsWith('liv-adhoc-claude-')) {
							session = await opts.manager.createSession({
								userId: user.id,
								title: 'Claude',
								cwd: typeof env.cwd === 'string' ? env.cwd : '~',
								sessionType: 'claude',
								id: env.sessionId,
							})
						} else if (env.sessionId.startsWith('liv-agent-')) {
							// Phase 189 agent session — id is `liv-agent-<itemId>`,
							// client passes cwd (~/liv/items/<name>/) and agentName so
							// manager.ts can derive agentDir + invoke resolveAgentSpawnArgs
							// (wizard prompt injection on first open).
							session = await opts.manager.createSession({
								userId: user.id,
								title: typeof env.agentName === 'string' ? env.agentName : 'Agent',
								cwd: typeof env.cwd === 'string' ? env.cwd : undefined,
								sessionType: 'claude',
								agentName: typeof env.agentName === 'string' ? env.agentName : undefined,
								id: env.sessionId,
							})
						}
					}

					if (!session) {
						send({type: 'error', message: `session ${env.sessionId} not found`})
						return
					}
					if (session.userId !== user.id) {
						opts.logger.log(
							`[cc-pty/ws] cross-user attach rejected: user=${user.id} target.userId=${session.userId}`,
						)
						send({type: 'error', message: 'forbidden'})
						ws.close(WS_CLOSE_POLICY, 'cross-user attach forbidden')
						return
					}
					attachHandle = await opts.manager.attachSession(session.id, (chunk) => {
						send({type: 'stdout', data: chunk.toString('base64')})
					})
					send({
						type: 'attached',
						session: {
							id: session.id,
							tmuxName: session.tmuxName,
							cwd: session.cwd,
							title: session.title,
						},
					})
				} else if (env.type === 'stdin') {
					if (!attachHandle) {
						send({type: 'error', message: 'not attached'})
						return
					}
					const data = typeof env.data === 'string' ? env.data : ''
					const bytes = Buffer.byteLength(data, 'utf-8')
					if (bytes > MAX_STDIN_BYTES) {
						send({
							type: 'error',
							message: `stdin frame too large (${bytes} > ${MAX_STDIN_BYTES})`,
						})
						ws.close(WS_CLOSE_OVERSIZE, 'stdin oversize')
						return
					}
					attachHandle.stdin(data)
				} else if (env.type === 'resize') {
					if (!attachHandle) {
						send({type: 'error', message: 'not attached'})
						return
					}
					const cols = Number(env.cols)
					const rows = Number(env.rows)
					if (
						!Number.isFinite(cols) ||
						!Number.isFinite(rows) ||
						cols < 1 ||
						rows < 1 ||
						cols > 1000 ||
						rows > 1000
					) {
						send({type: 'error', message: 'invalid resize dims'})
						return
					}
					attachHandle.resize(cols, rows)
				} else if (env.type === 'detach') {
					attachHandle?.detach()
					attachHandle = null
				} else if (env.type === 'ping') {
					// Phase 181-04 — Heartbeat: respond immediately, no auth state required.
					// Responds before any 'attach' message is needed (T-181-04-02 mitigation).
					send({type: 'pong'})
				} else {
					send({type: 'error', message: `unknown envelope type: ${env.type}`})
				}
			} catch (err: any) {
				opts.logger.error('[cc-pty/ws] handler error', err)
				send({type: 'error', message: err?.message ?? String(err)})
			}
		})

		ws.on('close', () => {
			attachHandle?.detach()
			attachHandle = null
		})

		ws.on('error', (err: unknown) => {
			opts.logger.error('[cc-pty/ws] WebSocket error', err)
		})
	}
}
