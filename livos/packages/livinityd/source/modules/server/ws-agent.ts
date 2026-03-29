/**
 * WebSocket /ws/agent endpoint handler.
 *
 * Bridges the browser to the AgentSessionManager, which manages per-user
 * SDK query() sessions. Messages flow:
 *   Browser -> WebSocket -> this handler -> AgentSessionManager -> SDK -> relay back
 *
 * After each turn, the handler persists user + assistant messages to Redis
 * via AiModule so conversation history survives page refresh.
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
	type TurnData,
} from '@nexus/core/lib'

import type Livinityd from '../../index.js'
import type createLogger from '../utilities/logger.js'
import type AiModule from '../ai/index.js'
import type {ChatMessage, Conversation} from '../ai/index.js'

/**
 * Save a completed turn's messages to Redis conversation storage.
 * Creates the conversation on first turn (auto-titles from user prompt).
 */
async function saveToConversation(
	turn: TurnData,
	userId: string,
	ai: AiModule,
	logger: ReturnType<typeof createLogger>,
): Promise<void> {
	if (!turn.conversationId) return // No persistence for unnamed sessions

	try {
		const conversation = await ai.getOrCreateConversation(
			turn.conversationId,
			turn.userPrompt.slice(0, 60),
			userId,
		)

		const now = Date.now()

		// Push user message
		const userMsg: ChatMessage = {
			id: `msg_${now}_user`,
			role: 'user',
			content: turn.userPrompt,
			timestamp: now,
		}
		conversation.messages.push(userMsg)

		// Push assistant message with tool calls mapped to legacy format
		const assistantMsg: ChatMessage = {
			id: `msg_${now + 1}_assistant`,
			role: 'assistant',
			content: turn.assistantContent,
			toolCalls: turn.toolCalls.length > 0
				? turn.toolCalls.map((tc: TurnData['toolCalls'][number]) => ({
					tool: tc.name,
					params: tc.input,
					result: {
						success: !tc.isError,
						output: tc.output || '',
					},
				}))
				: undefined,
			timestamp: now + 1,
		}
		conversation.messages.push(assistantMsg)

		conversation.updatedAt = now
		await ai.saveConversation(conversation, userId)
	} catch (err: any) {
		logger.error('WS agent: failed to save conversation turn', err)
	}
}

export function createAgentWebSocketHandler(opts: {
	livinityd: Livinityd
	logger: ReturnType<typeof createLogger>
}) {
	const ai = opts.livinityd.ai

	// Create a lazy ToolRegistry proxy that delegates to ai.toolRegistry.
	// This is needed because ai.toolRegistry is populated asynchronously after startup
	// (fetched from nexus API), but AgentSessionManager is created synchronously here.
	const lazyToolRegistry = new Proxy({} as any, {
		get(_target, prop) {
			const real = ai.toolRegistry
			if (!real) {
				// Registry not yet loaded — return safe defaults
				if (prop === 'listFiltered') return () => []
				if (prop === 'list') return () => []
				if (prop === 'listAll') return () => []
				if (prop === 'get') return () => undefined
				if (prop === 'size') return 0
				if (prop === 'execute') return async () => ({success: false, output: '', error: 'Tool registry not yet loaded'})
				return undefined
			}
			const value = (real as any)[prop]
			return typeof value === 'function' ? value.bind(real) : value
		},
	})

	// Create a single AgentSessionManager instance shared across all connections
	const sessionManager = new AgentSessionManager({
		toolRegistry: lazyToolRegistry,
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
				await sessionManager.handleMessage(userId, msg, sendMessage, {
					onTurnComplete: (turn: TurnData) => saveToConversation(turn, userId, ai, logger),
				})
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
