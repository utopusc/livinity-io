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

/** Extract error message with proper type narrowing */
function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

/** Generate a verbose English description of what the tool call is doing */
function describeToolCall(name: string, params: Record<string, unknown>): string {
	const p = params || {}
	const get = (key: string) => p[key] !== undefined ? String(p[key]).trim() : ''

	// MCP management
	if (name === 'mcp_list') return 'Retrieving the list of available MCP tools and servers to understand what capabilities are currently loaded.'
	if (name === 'mcp_manage') {
		const action = get('action')
		const server = get('server') || get('name') || get('id')
		if (action === 'restart') return server ? `Restarting the ${server} MCP server to apply changes and refresh its tool connections.` : 'Restarting the MCP server.'
		if (action === 'stop') return server ? `Stopping the ${server} MCP server.` : 'Stopping the MCP server.'
		if (action === 'start') return server ? `Starting the ${server} MCP server and initializing its available tools.` : 'Starting the MCP server.'
		if (action === 'status') return server ? `Checking the current running status of the ${server} server.` : 'Checking server status.'
		if (action === 'logs') return server ? `Reading the log output from ${server} to check for errors or recent activity.` : 'Reading server logs.'
		return server ? `Managing the ${server} MCP server.` : 'Managing MCP server configuration.'
	}

	// Chrome DevTools
	if (name === 'navigate_page') {
		const url = get('url')
		if (!url) return 'Navigating the browser to a new page.'
		try {
			const hostname = new URL(url).hostname
			return `Opening ${hostname} in the browser to access the requested web content and inspect the page.`
		} catch {
			return `Navigating the browser to ${url.slice(0, 60)}.`
		}
	}
	if (name === 'take_screenshot') return "Capturing a screenshot of the browser's current viewport to inspect the page's visual state."
	if (name === 'take_snapshot') return "Reading the page's accessibility tree to understand the current DOM structure and identify available interactive elements."
	if (name === 'evaluate_script') return 'Executing JavaScript code directly in the browser page to interact with the DOM, extract data, or trigger actions.'
	if (name === 'click') return 'Clicking on the identified page element to trigger its action or follow the interaction flow.'
	if (name === 'fill' || name === 'fill_form') return 'Filling in form fields with the required input values.'
	if (name === 'list_pages') return 'Listing all currently open browser tabs to identify which pages are available.'
	if (name === 'new_page') {
		const url = get('url')
		if (!url) return 'Opening a new browser tab.'
		try { return `Opening a new browser tab and loading ${new URL(url).hostname}.` } catch { return 'Opening a new browser tab.' }
	}
	if (name === 'close_page') return 'Closing the current browser tab to clean up after completing the task.'
	if (name === 'select_page') return 'Switching the active context to a different browser tab.'
	if (name === 'list_network_requests') return 'Examining the network requests made by the page to analyze API traffic, response codes, and data payloads.'
	if (name === 'list_console_messages') return "Reading the browser's console output to check for JavaScript errors, warnings, or logged debug information."
	if (name === 'get_network_request') return 'Inspecting the full details of a specific network request including request headers, body, and response data.'
	if (name === 'hover') return 'Hovering the mouse cursor over a page element to reveal hover states, dropdown menus, or tooltips.'
	if (name === 'press_key') {
		const k = get('key')
		return k ? `Pressing the "${k}" key to trigger keyboard input, submit a form, or navigate within the page.` : 'Pressing a keyboard key on the page.'
	}
	if (name === 'wait_for') {
		const t = get('text')
		return t ? `Waiting for the text "${t.slice(0, 40)}" to appear on the page before proceeding to the next step.` : 'Waiting for the page to reach the expected state before continuing.'
	}
	if (name === 'resize_page') return 'Resizing the browser window to a specific viewport dimension.'
	if (name === 'emulate') return 'Adjusting browser emulation settings such as device type, color scheme, or network conditions.'
	if (name === 'handle_dialog') return 'Dismissing or accepting a browser dialog (alert, confirm, or prompt) that appeared on the page.'
	if (name === 'performance_start_trace') return 'Starting a performance trace recording to capture page load timing, rendering metrics, and Core Web Vitals.'
	if (name === 'performance_stop_trace') return 'Stopping the performance trace and collecting all recorded metrics for analysis.'
	if (name === 'drag') return 'Dragging a page element to a new position using mouse simulation.'
	if (name === 'upload_file') return "Uploading a local file through the browser's file input element."

	// Memory
	if (name.startsWith('memory_') || name.endsWith('_memory') || name.includes('_memory_')) {
		if (name.includes('search') || name.includes('get') || name.includes('read')) return 'Searching stored memory for relevant information and context that may be useful for this task.'
		if (name.includes('store') || name.includes('set') || name.includes('save') || name.includes('write')) return 'Saving important information to persistent memory so it can be recalled in future conversations.'
		if (name.includes('list')) return 'Listing all stored memory entries to review what information has been accumulated.'
		if (name.includes('delete') || name.includes('remove')) return 'Removing an outdated or irrelevant entry from memory storage.'
		return 'Performing a memory storage operation.'
	}

	// Shell / exec
	if (name.includes('shell') || name.includes('exec') || name.includes('bash') || name.includes('run_command')) {
		const cmd = (get('command') || get('cmd') || '').replace(/\s+/g, ' ').slice(0, 80)
		return cmd ? `Running the command \`${cmd}\` on the server to complete the requested operation.` : 'Executing a terminal command on the server.'
	}

	// Apps
	if (name.includes('app')) {
		if (name.includes('list')) return 'Fetching the complete list of installed applications along with their current status and configuration.'
		if (name.includes('install')) return `Installing the ${get('appId') || 'requested'} application from the gallery and configuring its environment.`
		if (name.includes('start')) return 'Starting the application container and waiting for it to become healthy and ready.'
		if (name.includes('stop')) return 'Stopping the running application and shutting down its containers gracefully.'
		if (name.includes('status')) return 'Checking the current health status and configuration of the application.'
		return 'Managing application lifecycle and configuration.'
	}

	// Docker
	if (name.includes('docker') || name.includes('container')) return 'Querying Docker to check container status, logs, or configuration.'

	// Agents / subagents
	if (name.includes('agent') || name.includes('subagent')) {
		if (name.includes('list')) return 'Listing all registered subagents along with their current state and loop configuration.'
		if (name.includes('create') || name.includes('add')) return 'Creating a new specialized subagent to handle an autonomous background task.'
		if (name.includes('run') || name.includes('exec') || name.includes('start')) return 'Launching a subagent task and monitoring its execution.'
		if (name.includes('stop') || name.includes('kill')) return 'Stopping the running subagent and terminating its current task loop.'
		return 'Managing subagent registration and configuration.'
	}

	// Schedule / tasks
	if (name.includes('schedule') || name.includes('cron')) return 'Setting up a scheduled task with a cron expression so it runs automatically at the specified interval.'

	// System
	if (name.includes('health')) return 'Checking overall system health including CPU usage, memory availability, and critical service status.'
	if (name.includes('disk') || name.includes('storage')) return 'Checking disk usage and available storage space across the mounted volumes.'
	if (name.includes('metric') || name.includes('monitor') || name.includes('stat')) return 'Reading real-time system performance metrics including CPU, memory, and I/O utilization.'
	if (name.includes('log')) return 'Reading recent log output to identify errors, warnings, or trace recent system activity.'
	if (name.includes('network') || name.includes('ping')) return 'Testing network connectivity and measuring response latency to external endpoints.'
	if (name.includes('status') || name.includes('info')) return 'Retrieving current status information and runtime configuration details.'

	// Files
	if (name.includes('read') && !name.includes('readdir')) {
		const fp = get('path') || get('file_path')
		return fp ? `Reading the contents of ${fp.split('/').pop() || fp} to inspect its current state.` : 'Reading file contents from disk.'
	}
	if (name.includes('write_file') || name.includes('file_write')) return 'Writing the updated content to a file on disk.'
	if (name.includes('list_dir') || name.includes('readdir')) return 'Listing the files and directories to understand the current file structure.'
	if (name.includes('search') || name.includes('grep') || name.includes('find')) {
		const q = get('query') || get('pattern') || get('q')
		return q ? `Searching through files for "${q.slice(0, 50)}" to locate matching content.` : 'Searching for matching content across files.'
	}

	// Web
	if (name.includes('fetch') || name.includes('http_request')) return 'Making an HTTP request to fetch data from a remote API endpoint.'
	if (name.includes('web_search')) return 'Searching the web for up-to-date information relevant to the current task.'

	// Config / settings
	if (name.includes('config') || name.includes('setting')) return 'Reading configuration settings to understand the current system setup.'

	// Notifications
	if (name.includes('notify') || name.includes('alert') || name.includes('send_message')) return 'Sending a notification or message to the configured communication channel.'

	// Generic fallback
	const readable = name.replace(/_/g, ' ')
	return `Executing ${readable} to progress the current task.`
}

/** Format a compact terminal-style command line for display */
function formatCommand(name: string, params: Record<string, unknown>): string {
	const keys = Object.keys(params || {})
	if (keys.length === 0) return `${name}()`
	const args = keys.slice(0, 3).map((k) => {
		const val = String(params[k]).replace(/[\n\r\t]/g, ' ').trim()
		const short = val.length > 35 ? val.slice(0, 32) + '...' : val
		return `${k}=${short}`
	}).join(', ')
	return `${name}(${args})`
}

export default class AiModule {
	livinityd: Livinityd
	logger: Livinityd['logger']
	redis!: Redis
	subagentManager!: SubagentManager
	scheduleManager!: ScheduleManager

	private redisUrl: string
	private conversations = new Map<string, Conversation>()
	chatStatus = new Map<string, {status: string; tool?: string; steps?: string[]; commands?: string[]; turn?: number}>()

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
		const task = contextPrefix ? `${contextPrefix}Current message: ${userMessage}` : userMessage

		// Forward to Liv AI daemon via HTTP SSE
		const livApiUrl = process.env.LIV_API_URL || 'http://localhost:3200'
		this.chatStatus.set(conversationId, {status: 'Connecting...', steps: [], commands: []})
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

					if (event.type === 'thinking') {
						const prev = this.chatStatus.get(conversationId)
						this.chatStatus.set(conversationId, {status: 'Thinking...', steps: prev?.steps ?? [], commands: prev?.commands ?? [], turn: event.turn})
					}

					if (onEvent) {
						onEvent({type: event.type as AgentEvent['type'], turn: event.turn, data: event.data})
					}

					if (event.type === 'tool_call' && isEventData(event.data)) {
						const rawName = event.data.tool || 'unknown'
						const toolName = formatToolName(rawName)
						const desc = describeToolCall(toolName, event.data.params || {})
						const cmd = formatCommand(toolName, event.data.params || {})
						const prev = this.chatStatus.get(conversationId)
						this.chatStatus.set(conversationId, {
							status: desc,
							tool: toolName,
							steps: [...(prev?.steps ?? []), desc],
							commands: [...(prev?.commands ?? []), cmd],
							turn: event.turn,
						})
						pendingToolCalls.set(`${event.turn}-${rawName}`, {
							tool: rawName,
							params: event.data.params || {},
						})
					}

					if (event.type === 'observation' && isEventData(event.data)) {
						const rawName = event.data.tool || 'unknown'
						const toolName = formatToolName(rawName)
						const prev = this.chatStatus.get(conversationId)
						this.chatStatus.set(conversationId, {
							status: 'Processing result...',
							tool: toolName,
							steps: prev?.steps ?? [],
							commands: prev?.commands ?? [],
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
		const cached = this.conversations.get(id)
		if (cached) return cached
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
