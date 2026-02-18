import {Redis} from 'ioredis'
import {
	SubagentManager,
	ScheduleManager,
	type AgentEvent,
} from '@nexus/core/lib'

import type Livinityd from '../../index.js'

export interface AiModuleOptions {
	livinityd: Livinityd
	redisUrl?: string
	geminiApiKey?: string
}

export interface ChatMessage {
	id: string
	role: 'user' | 'assistant'
	content: string
	toolCalls?: Array<{tool: string; params: Record<string, unknown>; result: {success: boolean; output: string}}>
	timestamp: number
}

export interface Conversation {
	id: string
	title: string
	messages: ChatMessage[]
	createdAt: number
	updatedAt: number
}

/** SSE event data from Liv AI daemon */
interface LivStreamEventData {
	tool?: string
	params?: Record<string, unknown>
	success?: boolean
	output?: string
	answer?: string
}

/** SSE event from Liv AI daemon */
interface LivStreamEvent {
	type: string
	turn?: number
	data?: LivStreamEventData | string
}

/** Type guard for LivStreamEventData */
function isEventData(data: unknown): data is LivStreamEventData {
	return typeof data === 'object' && data !== null
}

/** Strip mcp__servername__ prefix from tool names for display */
function formatToolName(name: string): string {
	const match = name.match(/^mcp__[^_]+__(.+)$/)
	return match ? match[1] : name
}

/** Extract the most meaningful param value for display */
function briefArgs(params: Record<string, unknown>): string {
	if (!params || Object.keys(params).length === 0) return ''
	const priorityKeys = ['command', 'path', 'file_path', 'url', 'query', 'key', 'action', 'task', 'id', 'name', 'message', 'text', 'function']
	for (const k of priorityKeys) {
		if (params[k] !== undefined) {
			const val = String(params[k]).trim().replace(/\s+/g, ' ')
			return val.length > 60 ? val.slice(0, 57) + '...' : val
		}
	}
	const firstVal = Object.values(params)[0]
	if (firstVal !== undefined) {
		const val = String(firstVal).trim().replace(/\s+/g, ' ')
		return val.length > 60 ? val.slice(0, 57) + '...' : val
	}
	return ''
}

/** Format step for display: "toolName" or "toolName(brief args)" */
function formatStep(name: string, params: Record<string, unknown>): string {
	const args = briefArgs(params)
	return args ? `${name}(${args})` : name
}

/** Extract error message with proper type narrowing */
function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

export default class AiModule {
	livinityd: Livinityd
	logger: Livinityd['logger']
	redis!: Redis
	subagentManager!: SubagentManager
	scheduleManager!: ScheduleManager

	private redisUrl: string
	private conversations = new Map<string, Conversation>()
	chatStatus = new Map<string, {status: string; tool?: string; steps?: string[]; turn?: number}>()

	constructor({livinityd, redisUrl}: AiModuleOptions) {
		this.livinityd = livinityd
		this.logger = livinityd.logger.createChildLogger('ai')
		this.redisUrl = redisUrl || process.env.REDIS_URL || 'redis://localhost:6379'
	}

	async start() {
		this.logger.log('Starting AI module...')

		// Initialize Redis
		this.redis = new Redis(this.redisUrl, {maxRetriesPerRequest: null})
		this.redis.on('connect', () => this.logger.log('AI Redis connected'))
		this.redis.on('error', (err: Error) => this.logger.error('AI Redis error', err))

		this.subagentManager = new SubagentManager(this.redis)
		this.scheduleManager = new ScheduleManager(this.redis)

		this.logger.log('AI module started')
	}

	async stop() {
		if (this.redis) await this.redis.quit()
		this.logger.log('AI module stopped')
	}

	/** Run a single chat turn — bridges to Liv AI daemon via HTTP SSE */
	async chat(
		conversationId: string,
		userMessage: string,
		onEvent?: (event: AgentEvent) => void,
	): Promise<ChatMessage> {
		// Get or create conversation
		let conversation = this.conversations.get(conversationId)
		if (!conversation) {
			conversation = {
				id: conversationId,
				title: userMessage.slice(0, 60),
				messages: [],
				createdAt: Date.now(),
				updatedAt: Date.now(),
			}
			this.conversations.set(conversationId, conversation)
		}

		// Add user message
		const userMsg: ChatMessage = {
			id: `msg_${Date.now()}_user`,
			role: 'user',
			content: userMessage,
			timestamp: Date.now(),
		}
		conversation.messages.push(userMsg)
		await this.saveConversation(conversation)

		// Build context from recent history
		const recentHistory = conversation.messages
			.slice(-10)
			.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
			.join('\n\n')

		const contextPrefix = conversation.messages.length > 1 ? `Previous conversation:\n${recentHistory}\n\n` : ''

		// Build the full task string with context for Liv
		const task = contextPrefix ? `${contextPrefix}Current message: ${userMessage}` : userMessage

		// Forward to Liv AI daemon via HTTP SSE
		const livApiUrl = process.env.LIV_API_URL || 'http://localhost:3200'
		this.chatStatus.set(conversationId, {status: 'Connecting to Liv...', steps: []})
		let finalAnswer = ''
		const toolCalls: Array<{tool: string; params: Record<string, unknown>; result: {success: boolean; output: string}}> = []
		const pendingToolCalls = new Map<string, {tool: string; params: Record<string, unknown>}>()

		try {
			const response = await fetch(`${livApiUrl}/api/agent/stream`, {
				method: 'POST',
				headers: {'Content-Type': 'application/json', ...(process.env.LIV_API_KEY ? {'X-API-Key': process.env.LIV_API_KEY} : {})},
				body: JSON.stringify({task, max_turns: 30}),
				signal: AbortSignal.timeout(600_000),
			})

			if (!response.ok || !response.body) {
				throw new Error(`Liv API error: ${response.status} ${response.statusText}`)
			}

			// Parse SSE stream from Liv
			const reader = response.body.getReader()
			const decoder = new TextDecoder()
			let buffer = ''

			while (true) {
				const {done, value} = await reader.read()
				if (done) break
				buffer += decoder.decode(value, {stream: true})
				const lines = buffer.split('\n')
				buffer = lines.pop() || ''

				for (const line of lines) {
					if (!line.startsWith('data: ')) continue

					let event: LivStreamEvent
					try {
						event = JSON.parse(line.slice(6)) as LivStreamEvent
					} catch {
						continue
					}

					// Update chat status for UI polling
					if (event.type === 'thinking') {
						const prev = this.chatStatus.get(conversationId)
						this.chatStatus.set(conversationId, {status: 'Thinking...', steps: prev?.steps ?? [], turn: event.turn})
					}

					// Forward event for streaming UI
					if (onEvent) {
						onEvent({type: event.type as AgentEvent['type'], turn: event.turn, data: event.data})
					}

					// Collect tool calls — append short name to steps[]
					if (event.type === 'tool_call' && isEventData(event.data)) {
						const rawName = event.data.tool || 'unknown'
						const toolName = formatToolName(rawName)
						const prev = this.chatStatus.get(conversationId)
						this.chatStatus.set(conversationId, {
							status: `Using ${toolName}...`,
							tool: toolName,
							steps: [...(prev?.steps ?? []), formatStep(toolName, event.data.params || {})],
							turn: event.turn,
						})
						pendingToolCalls.set(`${event.turn}-${rawName}`, {
							tool: rawName,
							params: event.data.params || {},
						})
					}

					// Collect tool results (observations)
					if (event.type === 'observation' && isEventData(event.data)) {
						const rawName = event.data.tool || 'unknown'
						const toolName = formatToolName(rawName)
						const prev = this.chatStatus.get(conversationId)
						this.chatStatus.set(conversationId, {
							status: `Processing ${toolName}...`,
							tool: toolName,
							steps: prev?.steps ?? [],
							turn: event.turn,
						})
						const key = `${event.turn}-${rawName}`
						const pending = pendingToolCalls.get(key)
						toolCalls.push({
							tool: toolName,
							params: pending?.params || {},
							result: {
								success: event.data.success ?? true,
								output: event.data.output || '',
							},
						})
						pendingToolCalls.delete(key)
					}

					// Capture final answer
					if (event.type === 'done' && isEventData(event.data)) {
						finalAnswer = event.data.answer || finalAnswer
					}
					if (event.type === 'final_answer' && event.data) {
						finalAnswer = typeof event.data === 'string' ? event.data : (isEventData(event.data) ? (event.data.answer || String(event.data)) : String(event.data))
					}
				}
			}
		} catch (error) {
			this.logger.error('Liv bridge error', error)
			finalAnswer = finalAnswer || `Error communicating with Liv AI: ${getErrorMessage(error)}`
		}

		// Build assistant message
		const assistantMsg: ChatMessage = {
			id: `msg_${Date.now()}_assistant`,
			role: 'assistant',
			content: finalAnswer || '(No response from Liv)',
			toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
			timestamp: Date.now(),
		}
		conversation.messages.push(assistantMsg)
		conversation.updatedAt = Date.now()
		await this.saveConversation(conversation)
		this.chatStatus.delete(conversationId)

		return assistantMsg
	}

	private async saveConversation(conversation: Conversation): Promise<void> {
		try {
			await this.redis.set(`liv:ui:conv:${conversation.id}`, JSON.stringify(conversation))
			await this.redis.sadd('liv:ui:convs', conversation.id)
		} catch (err) {
			this.logger.error('Failed to save conversation', err)
		}
	}

	async getConversation(id: string): Promise<Conversation | undefined> {
		// Check memory cache first
		const cached = this.conversations.get(id)
		if (cached) return cached
		// Load from Redis
		try {
			const data = await this.redis.get(`liv:ui:conv:${id}`)
			if (data) {
				const conv = JSON.parse(data) as Conversation
				this.conversations.set(id, conv)
				return conv
			}
		} catch {}
		return undefined
	}

	async listConversations(): Promise<Array<{id: string; title: string; updatedAt: number; messageCount: number}>> {
		try {
			const ids = await this.redis.smembers('liv:ui:convs')
			if (ids.length === 0) return []
			const pipeline = this.redis.pipeline()
			for (const id of ids) pipeline.get(`liv:ui:conv:${id}`)
			const results = await pipeline.exec()
			const convs: Array<{id: string; title: string; updatedAt: number; messageCount: number}> = []
			for (const [err, data] of (results || [])) {
				if (err || !data) continue
				try {
					const c = JSON.parse(data as string) as Conversation
					convs.push({id: c.id, title: c.title, updatedAt: c.updatedAt, messageCount: c.messages.length})
				} catch {}
			}
			return convs.sort((a, b) => b.updatedAt - a.updatedAt)
		} catch {
			return Array.from(this.conversations.values()).map((c) => ({
				id: c.id, title: c.title, updatedAt: c.updatedAt, messageCount: c.messages.length,
			}))
		}
	}

	async deleteConversation(id: string): Promise<boolean> {
		this.conversations.delete(id)
		try {
			await this.redis.del(`liv:ui:conv:${id}`)
			await this.redis.srem('liv:ui:convs', id)
		} catch {}
		return true
	}

}
