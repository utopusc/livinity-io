// Phase 22 MH-04, MH-05 — WebSocket handler for outbound docker-agents.
//
// Mounted at /agent/connect. Distinct from /ws/agent (which is the existing
// AI-loop streaming socket — different concept). The agent presents its token
// in the FIRST `register` message, NOT as a query-string param — this is why
// we don't share the existing webSocketRouter token gate (which expects
// ?token=<JWT>).
//
// Lifecycle:
//   1. Agent opens WS                                         → handler invoked
//   2. Agent sends {type:'register', token, ...}              → findAgentByToken
//      - if not found / revoked: ws.close(4401, 'invalid-or-revoked-token')
//   3. registerAgent() into agent-registry; mark env online   → ack {type:'registered', agentId}
//   4. Server pings every 30s; agent replies pong → touchLastSeen
//   5. Server sends {type:'request', requestId, method, args} → agent dispatches
//      Agent replies {type:'response', requestId, result|error} → resolves pending
//   6. WS close → unregister + mark env offline + last_seen=NOW()
//
// Redis subscriber (startAgentRevocationSubscriber) listens on
// 'livos:agent:revoked'; on receipt, calls registry.forceDisconnect(agentId)
// which closes the WS with 4403 'token-revoked'. This satisfies the MH-05
// requirement that revocation disconnect within 5s — pub/sub is sub-second on
// a local Redis, and the WS close + handler cleanup adds at most another second.

import type http from 'node:http'

import type {WebSocket} from 'ws'
import type {Redis} from 'ioredis'

import type createLogger from '../utilities/logger.js'
import {getPool} from '../database/index.js'

import {findAgentByToken, touchLastSeen} from '../docker/agents.js'
import {agentRegistry} from '../docker/agent-registry.js'
import type {AgentMessage, AgentRegister} from '../docker/agent-protocol.js'

type Logger = ReturnType<typeof createLogger>

const PING_INTERVAL_MS = 30_000

export function createAgentWsHandler({logger}: {logger: Logger}) {
	return async function handleAgentWs(ws: WebSocket, _request: http.IncomingMessage) {
		let agentId: string | null = null
		let pingTimer: ReturnType<typeof setInterval> | null = null

		const cleanup = async () => {
			if (pingTimer) {
				clearInterval(pingTimer)
				pingTimer = null
			}
			if (agentId) {
				agentRegistry.unregisterAgent(agentId)
				const pool = getPool()
				if (pool) {
					try {
						await pool.query(
							`UPDATE environments SET agent_status = 'offline', last_seen = NOW() WHERE agent_id = $1`,
							[agentId],
						)
					} catch (err) {
						logger.error(`failed to mark agent ${agentId} offline`, err)
					}
				}
				agentId = null
			}
		}

		ws.on('message', async (raw) => {
			let msg: AgentMessage
			try {
				msg = JSON.parse(raw.toString()) as AgentMessage
			} catch {
				try {
					ws.close(4400, 'invalid-json')
				} catch {
					/* ignore */
				}
				return
			}

			// First message MUST be `register`. Any other message before register
			// closes the connection — protects against partial-state bugs.
			if (msg.type === 'register') {
				if (agentId) {
					// Already registered on this WS — second register message is a protocol error
					try {
						ws.close(4400, 'already-registered')
					} catch {
						/* ignore */
					}
					return
				}
				const reg = msg as AgentRegister
				const row = await findAgentByToken(reg.token)
				if (!row) {
					try {
						ws.close(4401, 'invalid-or-revoked-token')
					} catch {
						/* ignore */
					}
					return
				}
				agentId = row.id
				agentRegistry.registerAgent(agentId, ws)
				await touchLastSeen(agentId)
				const pool = getPool()
				if (pool) {
					try {
						await pool.query(
							`UPDATE environments SET agent_status = 'online', last_seen = NOW() WHERE agent_id = $1`,
							[agentId],
						)
					} catch (err) {
						logger.error(`failed to mark agent ${agentId} online`, err)
					}
				}
				try {
					ws.send(
						JSON.stringify({
							type: 'registered',
							agentId,
							serverTime: Date.now(),
						}),
					)
				} catch (err) {
					logger.error('failed to send registered ack', err)
				}
				pingTimer = setInterval(() => {
					if (ws.readyState === ws.OPEN) {
						try {
							ws.send(JSON.stringify({type: 'ping', ts: Date.now()}))
						} catch {
							/* ws may have closed mid-tick */
						}
					}
				}, PING_INTERVAL_MS)
				logger.log(
					`agent ${agentId} (env_id=${row.envId}, platform=${reg.platform}, dockerVersion=${reg.dockerVersion ?? 'unknown'}) connected`,
				)
				return
			}

			if (!agentId) {
				try {
					ws.close(4401, 'must-register-first')
				} catch {
					/* ignore */
				}
				return
			}

			if (msg.type === 'response') {
				agentRegistry.handleResponse(agentId, msg)
			} else if (msg.type === 'pong') {
				// Best-effort liveness; ignore failures so we never tear down a healthy WS
				touchLastSeen(agentId).catch((err) =>
					logger.error(`touchLastSeen failed for ${agentId}`, err),
				)
			}
			// 'progress' messages currently ignored (v28 streaming will use them)
		})

		ws.on('close', () => {
			cleanup().catch((err) => logger.error('cleanup failed', err))
		})
		ws.on('error', (err) => {
			logger.error('ws error', err)
			cleanup().catch((cleanupErr) => logger.error('cleanup failed', cleanupErr))
		})
	}
}

/**
 * Subscribe to 'livos:agent:revoked' on Redis. When a token is revoked via
 * the tRPC mutation, ANY livinityd instance currently holding the live WS
 * (typically the same instance, but pub/sub generalises across multi-instance
 * deployments) calls registry.forceDisconnect — closes the WS with 4403.
 *
 * Uses a duplicate Redis connection because subscribe-mode blocks regular
 * commands on a connection (ioredis enforces this). The duplicate inherits
 * connection options from the original.
 */
export function startAgentRevocationSubscriber({
	redis,
	logger,
}: {
	redis: Redis
	logger: Logger
}) {
	const sub = redis.duplicate()
	sub.subscribe('livos:agent:revoked', (err) => {
		if (err) {
			logger.error('subscribe failed', err)
		} else {
			logger.log('subscribed to livos:agent:revoked')
		}
	})
	sub.on('message', (channel, payload) => {
		if (channel !== 'livos:agent:revoked') return
		try {
			const parsed = JSON.parse(payload)
			if (parsed && typeof parsed.agentId === 'string') {
				agentRegistry.forceDisconnect(parsed.agentId, 'token-revoked')
				logger.log(`forceDisconnect ${parsed.agentId} (revoked)`)
			}
		} catch (err) {
			logger.error('bad revocation payload', err)
		}
	})
}
