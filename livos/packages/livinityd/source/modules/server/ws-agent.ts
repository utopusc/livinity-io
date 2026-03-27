/**
 * WebSocket /ws/agent endpoint handler.
 *
 * Bridges the browser to the AgentSessionManager, which manages per-user
 * SDK query() sessions. Messages flow:
 *   Browser -> WebSocket -> this handler -> AgentSessionManager -> SDK -> relay back
 *
 * JWT auth is handled by the existing upgrade handler in server/index.ts.
 * This handler only needs to extract the userId from the already-verified token.
 */

import {WebSocket} from 'ws'
import type {IncomingMessage} from 'http'

import {
	AgentSessionManager,
	type AgentWsMessage,
	type ClientWsMessage,
} from '@nexus/core/lib'

import type Livinityd from '../../index.js'
import type createLogger from '../utilities/logger.js'

export function createAgentWebSocketHandler(opts: {
	livinityd: Livinityd
	logger: ReturnType<typeof createLogger>
}) {
	// Create a single AgentSessionManager instance shared across all connections
	const sessionManager = new AgentSessionManager({
		toolRegistry: opts.livinityd.ai.toolRegistry,
	})

	return (ws: WebSocket, request: IncomingMessage) => {
		const logger = opts.logger

		// Extract userId from JWT payload (already verified in upgrade handler)
		// Decode JWT payload to extract userId (token was already verified during upgrade)
		const url = new URL(request.url || '/', 'http://localhost')
		const token = url.searchParams.get('token')
		let userId = 'admin' // fallback for legacy single-user tokens

		if (token) {
			try {
				const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
				if (payload.userId) userId = payload.userId
			} catch {
				/* legacy token format, use 'admin' */
			}
		}

		logger.log(`WS agent: connected, userId=${userId}`)

		// 15-second heartbeat ping to keep connection alive through Caddy proxy
		const heartbeat = setInterval(() => {
			if (ws.readyState === WebSocket.OPEN) {
				ws.ping()
			}
		}, 15_000)

		// Message relay callback: sends AgentWsMessage to the WebSocket client
		const sendMessage = (msg: AgentWsMessage) => {
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(JSON.stringify(msg))
			}
		}

		// Handle incoming messages from the browser
		ws.on('message', async (data) => {
			try {
				const msg = JSON.parse(data.toString()) as ClientWsMessage
				logger.verbose(`WS agent: received ${msg.type} from userId=${userId}`)
				await sessionManager.handleMessage(userId, msg, sendMessage)
			} catch (err: any) {
				logger.error('WS agent: message handling error', err)
				sendMessage({type: 'error', message: err.message || 'Unknown error'})
			}
		})

		// Handle WebSocket close -- cleanup heartbeat but don't kill session
		// The session will be replaced when a new start message arrives,
		// or the SDK query will complete naturally.
		ws.on('close', () => {
			logger.log(`WS agent: disconnected, userId=${userId}`)
			clearInterval(heartbeat)
		})

		ws.on('error', (err) => {
			logger.error('WS agent: WebSocket error', err)
			clearInterval(heartbeat)
		})
	}
}
