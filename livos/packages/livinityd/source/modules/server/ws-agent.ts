/**
 * WebSocket /ws/agent endpoint handler.
 *
 * Bridges the browser to the AgentSessionManager, which manages per-user
 * SDK query() sessions. Messages flow:
 *   Browser -> WebSocket -> this handler -> AgentSessionManager -> SDK -> relay back
 *
 * Session keys are per-connection (not per-user) so multiple tabs don't
 * cancel each other's sessions.
 *
 * Conversation history is loaded from Redis and prepended to the prompt
 * so the AI remembers previous messages in the same conversation.
 */

import {randomUUID} from 'node:crypto'
import {WebSocket} from 'ws'
import type {IncomingMessage} from 'http'

import {
	AgentSessionManager,
	IntentRouter,
	LearningEngine,
	type AgentWsMessage,
	type ClientWsMessage,
	type TurnData,
	type CapabilityManifest,
} from '@liv/core/lib'

import type Livinityd from '../../index.js'
import type createLogger from '../utilities/logger.js'
import type AiModule from '../ai/index.js'
import type {ChatMessage, Conversation} from '../ai/index.js'

/**
 * Save a completed turn's messages to Redis conversation storage.
 */
async function saveToConversation(
	turn: TurnData,
	userId: string,
	ai: AiModule,
	logger: ReturnType<typeof createLogger>,
): Promise<void> {
	if (!turn.conversationId) return

	try {
		const conversation = await ai.getOrCreateConversation(
			turn.conversationId,
			turn.userPrompt.slice(0, 60),
			userId,
		)

		const now = Date.now()

		// Strip "Previous conversation:" prefix before saving — store only the actual user message
		let cleanPrompt = turn.userPrompt
		if (cleanPrompt.startsWith('Previous conversation:')) {
			const match = cleanPrompt.match(/\nCurrent message: ([\s\S]*)$/)
			if (match) cleanPrompt = match[1]
		}

		const userMsg: ChatMessage = {
			id: `msg_${now}_user`,
			role: 'user',
			content: cleanPrompt,
			timestamp: now,
		}
		conversation.messages.push(userMsg)

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

/**
 * Build a context prefix from conversation history so the AI remembers
 * previous messages. Returns empty string if no history.
 */
async function buildConversationContext(
	conversationId: string | undefined,
	userId: string,
	ai: AiModule,
): Promise<string> {
	if (!conversationId) return ''

	try {
		const conversation = await ai.getConversation(conversationId, userId)
		if (!conversation || conversation.messages.length === 0) return ''

		// Take last 6 messages, truncate each to 300 chars to keep prompt manageable
		const recent = conversation.messages.slice(-6)
		const history = recent
			.map((m) => {
				const role = m.role === 'user' ? 'User' : 'Assistant'
				const text = m.content.length > 300 ? m.content.slice(0, 300) + '...' : m.content
				return `${role}: ${text}`
			})
			.join('\n\n')

		return `Previous conversation:\n${history}\n\nCurrent message: `
	} catch {
		return ''
	}
}

export function createAgentWebSocketHandler(opts: {
	livinityd: Livinityd
	logger: ReturnType<typeof createLogger>
}) {
	const ai = opts.livinityd.ai

	// Lazy ToolRegistry proxy — delegates to ai.toolRegistry when available
	const lazyToolRegistry = new Proxy({} as any, {
		get(_target, prop) {
			const real = ai.toolRegistry
			if (!real) {
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

	// LearningEngine — logs tool calls and mines co-occurrence patterns
	const learningEngine = new LearningEngine({redis: ai.redis})

	// IntentRouter — fetches capabilities from nexus API, uses livinityd Redis for caching
	// brain is null in livinityd context (LLM fallback skipped — keyword matching only)
	const livApiUrl = process.env.LIV_API_URL || 'http://localhost:3200'
	const apiKey = process.env.LIV_API_KEY || ''

	const intentRouter = new IntentRouter({
		redis: ai.redis,
		getCapabilities: async () => {
			try {
				const res = await fetch(`${livApiUrl}/api/capabilities?status=active`, {
					headers: apiKey ? {'X-Api-Key': apiKey} : {},
					signal: AbortSignal.timeout(5000),
				})
				if (!res.ok) throw new Error(`HTTP ${res.status}`)
				const data = await res.json() as {capabilities: CapabilityManifest[]}
				return data.capabilities
			} catch (err: any) {
				opts.logger.error('IntentRouter: failed to fetch capabilities from nexus', err.message)
				return []
			}
		},
		learningEngine,
		// No brain in livinityd — LLM fallback is skipped, keyword matching only
	})

	const sessionManager = new AgentSessionManager({
		toolRegistry: lazyToolRegistry,
		// IntentRouter disabled — scoped tool selection filters out MCP tools.
		// Re-enable once CapabilityRegistry properly tracks MCP provides_tools
		// and IntentRouter preserves all MCP tools in scoped registry.
		// intentRouter,
		redis: ai.redis,
		learningEngine,
	})

	return (ws: WebSocket, request: IncomingMessage) => {
		const logger = opts.logger

		// Each WebSocket connection gets a unique session key so multiple tabs
		// don't cancel each other's sessions.
		const connectionId = randomUUID().slice(0, 8)

		// Extract userId from JWT
		const url = new URL(request.url || '/', 'http://localhost')
		const token = url.searchParams.get('token')
		let userId = 'admin'

		if (token) {
			try {
				const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
				if (payload.userId) userId = payload.userId
			} catch {
				/* legacy token format */
			}
		}

		// Per-connection session key prevents tab conflicts
		const sessionKey = `${userId}:${connectionId}`

		logger.log(`WS agent: connected, userId=${userId}, conn=${connectionId}`)

		// 15-second heartbeat
		const heartbeat = setInterval(() => {
			if (ws.readyState === WebSocket.OPEN) ws.ping()
		}, 15_000)

		const sendMessage = (msg: AgentWsMessage) => {
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(JSON.stringify(msg))
			}
		}

		// Handle incoming messages
		ws.on('message', async (data) => {
			try {
				const raw = JSON.parse(data.toString()) as ClientWsMessage

				// For 'start' messages: prepend conversation history to prompt
				if (raw.type === 'start' && raw.conversationId) {
					const context = await buildConversationContext(raw.conversationId, userId, ai)
					if (context) {
						raw.prompt = context + raw.prompt
					}
				}

				// Pass attachments through to session manager
				if (raw.type === 'start' && raw.attachments) {
					;(raw as any)._attachments = raw.attachments
				}

				logger.verbose(`WS agent: received ${raw.type} from ${sessionKey}`)

				// V32-HERMES-04: 'steer' is fire-and-forget — inject guidance into the
				// active LivAgentRunner for this connection and send no reply.
				// All other message types are delegated to sessionManager.handleMessage().
				if (raw.type === 'steer') {
					sessionManager.injectSteer(sessionKey, raw.guidance)
					return
				}

				await sessionManager.handleMessage(sessionKey, raw, sendMessage, {
					onTurnComplete: (turn: TurnData) => saveToConversation(turn, userId, ai, logger),
				})
			} catch (err: any) {
				logger.error('WS agent: message handling error', err)
				sendMessage({type: 'error', message: err.message || 'Unknown error'})
			}
		})

		// Cleanup on close — kill this connection's session
		ws.on('close', () => {
			logger.log(`WS agent: disconnected, ${sessionKey}`)
			clearInterval(heartbeat)
			sessionManager.cleanup(sessionKey)
		})

		ws.on('error', (err) => {
			logger.error('WS agent: WebSocket error', err)
			clearInterval(heartbeat)
		})
	}
}
