import {useCallback, useEffect, useReducer, useRef, useState} from 'react'

import {JWT_LOCAL_STORAGE_KEY} from '@/modules/auth/shared'

// --- Types ---

export interface ChatToolCall {
	id: string
	name: string
	input: Record<string, unknown>
	status: 'running' | 'complete' | 'error'
	output?: string
	elapsedSeconds?: number
	errorMessage?: string
}

export interface ChatMessage {
	id: string
	role: 'user' | 'assistant' | 'system'
	content: string
	toolCalls?: ChatToolCall[]
	isStreaming?: boolean
	timestamp: number
}

export interface AgentStep {
	id: string
	tool: string
	description: string
	status: 'running' | 'complete' | 'error'
}

export interface AgentStatus {
	phase: 'idle' | 'thinking' | 'executing' | 'responding'
	currentTool: string | null
	steps: AgentStep[]
}

type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting'

// --- Reducer ---

type MessageAction =
	| {type: 'ADD_USER_MESSAGE'; message: ChatMessage}
	| {type: 'START_ASSISTANT_MESSAGE'; id: string}
	| {type: 'UPDATE_STREAMING_CONTENT'; content: string}
	| {type: 'ADD_TOOL_CALL'; toolCall: ChatToolCall}
	| {type: 'UPDATE_TOOL_CALL'; toolCallId: string; updates: Partial<ChatToolCall>}
	| {type: 'FINALIZE_MESSAGE'}
	| {type: 'ADD_ERROR'; message: string}
	| {type: 'CLEAR'}
	| {type: 'LOAD_MESSAGES'; messages: ChatMessage[]}

function messagesReducer(state: ChatMessage[], action: MessageAction): ChatMessage[] {
	switch (action.type) {
		case 'ADD_USER_MESSAGE':
			return [...state, action.message]

		case 'START_ASSISTANT_MESSAGE':
			return [
				...state,
				{
					id: action.id,
					role: 'assistant',
					content: '',
					toolCalls: [],
					isStreaming: true,
					timestamp: Date.now(),
				},
			]

		case 'UPDATE_STREAMING_CONTENT': {
			const last = state[state.length - 1]
			if (!last || last.role !== 'assistant' || !last.isStreaming) return state
			return [...state.slice(0, -1), {...last, content: action.content}]
		}

		case 'ADD_TOOL_CALL': {
			const last = state[state.length - 1]
			if (!last || last.role !== 'assistant') return state
			return [
				...state.slice(0, -1),
				{...last, toolCalls: [...(last.toolCalls || []), action.toolCall]},
			]
		}

		case 'UPDATE_TOOL_CALL': {
			const last = state[state.length - 1]
			if (!last || last.role !== 'assistant' || !last.toolCalls) return state
			const updatedCalls = last.toolCalls.map((tc) =>
				tc.id === action.toolCallId ? {...tc, ...action.updates} : tc,
			)
			return [...state.slice(0, -1), {...last, toolCalls: updatedCalls}]
		}

		case 'FINALIZE_MESSAGE': {
			const last = state[state.length - 1]
			if (!last || last.role !== 'assistant') return state
			return [...state.slice(0, -1), {...last, isStreaming: false}]
		}

		case 'ADD_ERROR':
			return [
				...state,
				{
					id: `err_${Date.now()}`,
					role: 'system',
					content: action.message,
					isStreaming: false,
					timestamp: Date.now(),
				},
			]

		case 'CLEAR':
			return []

		case 'LOAD_MESSAGES':
			return action.messages

		default:
			return state
	}
}

// --- Helpers ---

function describeToolBrief(toolName: string): string {
	const raw = toolName.replace(/^mcp__[^_]+__/, '').toLowerCase()
	if (/shell|command|bash|exec/.test(raw)) return 'Running shell command'
	if (/read_file|file_read/.test(raw)) return 'Reading file'
	if (/write_file|file_write|create_file/.test(raw)) return 'Writing file'
	if (/edit_file|file_edit|apply_diff/.test(raw)) return 'Editing file'
	if (/list_dir|directory/.test(raw)) return 'Listing directory'
	if (/search|grep|find_symbol|find_file/.test(raw)) return 'Searching codebase'
	if (/docker|container/.test(raw)) return 'Managing Docker'
	if (/memory|remember/.test(raw)) return 'Accessing memory'
	if (/http|fetch|request|api/.test(raw)) return 'Making HTTP request'
	if (/screenshot|screen/.test(raw)) return 'Taking screenshot'
	if (/computer_use|click|type|key/.test(raw)) return 'Using computer'
	if (/canvas/.test(raw)) return 'Working on canvas'
	if (/skill/.test(raw)) return 'Running skill'
	return `Using ${toolName.replace(/^mcp__[^_]+__/, '')}`
}

// --- Hook ---

export function useAgentSocket() {
	const [messages, dispatch] = useReducer(messagesReducer, [])
	const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected')
	const [isStreaming, setIsStreaming] = useState(false)
	const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
	const [totalCost, setTotalCost] = useState<number>(0)
	const [usageStats, setUsageStats] = useState<{inputTokens: number; outputTokens: number; durationMs: number; numTurns: number} | null>(null)
	const [agentStatus, setAgentStatus] = useState<AgentStatus>({phase: 'idle', currentTool: null, steps: []})
	const thinkingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	const wsRef = useRef<WebSocket | null>(null)
	const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const backoffRef = useRef(1000) // Start at 1s
	const intentionalCloseRef = useRef(false)
	const conversationIdRef = useRef<string | null>(null)

	// Stream accumulation refs — uses setTimeout(100ms) instead of requestAnimationFrame
	// because RAF is suspended in background tabs, causing all text to appear at once.
	// Pattern from claudecodeui: separate accumulated ref (never reset mid-stream) from timer ref.
	const accumulatedRef = useRef('')
	const streamTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	// Track current tool input JSON accumulation
	const toolInputBufferRef = useRef('')
	const currentToolIdRef = useRef<string | null>(null)

	const appendDelta = useCallback((text: string) => {
		accumulatedRef.current += text
		if (!streamTimerRef.current) {
			streamTimerRef.current = setTimeout(() => {
				streamTimerRef.current = null
				dispatch({type: 'UPDATE_STREAMING_CONTENT', content: accumulatedRef.current})
			}, 50)
		}
	}, [])

	const flushBuffer = useCallback(() => {
		if (streamTimerRef.current) {
			clearTimeout(streamTimerRef.current)
			streamTimerRef.current = null
		}
		dispatch({type: 'UPDATE_STREAMING_CONTENT', content: accumulatedRef.current})
	}, [])

	const resetBuffer = useCallback(() => {
		accumulatedRef.current = ''
		toolInputBufferRef.current = ''
		currentToolIdRef.current = null
		if (streamTimerRef.current) {
			clearTimeout(streamTimerRef.current)
			streamTimerRef.current = null
		}
		if (thinkingTimerRef.current) {
			clearTimeout(thinkingTimerRef.current)
			thinkingTimerRef.current = null
		}
	}, [])

	// --- Message handling ---

	const handleSdkMessage = useCallback(
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(data: any) => {
			switch (data.type) {
				case 'system':
					// Init message -- log but don't display
					break

				case 'assistant': {
					// Complete assistant turn (non-streaming fallback)
					const content = (data.message?.content || [])
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						.filter((block: any) => block.type === 'text')
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						.map((block: any) => block.text)
						.join('')

					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const toolUseBlocks = (data.message?.content || []).filter((block: any) => block.type === 'tool_use')
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const toolCalls = toolUseBlocks.map((block: any) => ({
						id: block.id,
						name: block.name,
						input: block.input || {},
						status: 'running' as const,
					}))

					// Only update text if the complete message has more content than what
					// was already accumulated via streaming. Otherwise tool-only messages
					// (no text blocks) would wipe the streamed text.
					if (content && content.length >= accumulatedRef.current.length) {
						accumulatedRef.current = content
					}
					flushBuffer()
					for (const tc of toolCalls) {
						dispatch({type: 'ADD_TOOL_CALL', toolCall: tc})
					}

					// Also check for tool_result blocks in assistant message (non-streaming fallback)
					const toolResultBlocks = (data.message?.content || []).filter(
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						(block: any) => block.type === 'tool_result',
					)
					for (const block of toolResultBlocks) {
						if (!block.tool_use_id) continue
						let outputString = ''
						if (typeof block.content === 'string') {
							outputString = block.content
						} else if (Array.isArray(block.content)) {
							outputString = block.content
								// eslint-disable-next-line @typescript-eslint/no-explicit-any
								.filter((b: any) => b.type === 'text' && b.text)
								// eslint-disable-next-line @typescript-eslint/no-explicit-any
								.map((b: any) => b.text)
								.join('\n')
						}
						const isError = block.is_error === true
						dispatch({
							type: 'UPDATE_TOOL_CALL',
							toolCallId: block.tool_use_id,
							updates: {
								status: isError ? 'error' : 'complete',
								output: outputString,
								...(isError ? {errorMessage: outputString} : {}),
							},
						})
					}
					break
				}

				case 'stream_delta': {
					// Compact normalized text delta from server (claudecodeui pattern)
					if (data.text) {
						appendDelta(data.text)
						setAgentStatus(prev => {
							if (prev.phase === 'responding') return prev
							return {...prev, phase: 'responding', currentTool: null}
						})
					}
					break
				}

			case 'stream_event': {
					// SDK wraps events: data.event is an OBJECT {type, delta, ...}, not a string.
					// Extract the event type for switching.
					const event = data.event
					const eventType = typeof event === 'object' && event !== null ? event.type : event
					switch (eventType) {
						case 'message_start':
							// Create a new assistant message entry if not already streaming
							break

						case 'content_block_start': {
							const contentBlock = event?.content_block ?? data.content_block
							if (contentBlock?.type === 'tool_use') {
								const toolCall = {
									id: contentBlock.id,
									name: contentBlock.name,
									input: {} as Record<string, unknown>,
									status: 'running' as const,
								}
								currentToolIdRef.current = contentBlock.id
								toolInputBufferRef.current = ''
								dispatch({type: 'ADD_TOOL_CALL', toolCall})
								// Clear thinking debounce timer
								if (thinkingTimerRef.current) {
									clearTimeout(thinkingTimerRef.current)
									thinkingTimerRef.current = null
								}
								setAgentStatus(prev => ({
									...prev,
									phase: 'executing',
									currentTool: contentBlock.name,
									steps: [
										...prev.steps.filter(s => s.id !== contentBlock.id),
										{
											id: contentBlock.id,
											tool: contentBlock.name,
											description: describeToolBrief(contentBlock.name),
											status: 'running',
										},
									],
								}))
							}
							break
						}

						case 'content_block_delta': {
							// Delta may be at event.delta (SDK object format) or data.delta (flat format)
							const delta = event?.delta ?? data.delta
							if (delta?.type === 'text_delta' && delta.text) {
								appendDelta(delta.text)
								setAgentStatus(prev => {
									if (prev.phase === 'responding') return prev
									return {...prev, phase: 'responding', currentTool: null}
								})
							} else if (delta?.type === 'input_json_delta' && delta.partial_json) {
								toolInputBufferRef.current += delta.partial_json
							}
							break
						}

						case 'content_block_stop': {
							// If we were accumulating tool input JSON, parse and update
							// Keep status as 'running' -- tool input is finalized but execution hasn't started yet
							if (currentToolIdRef.current && toolInputBufferRef.current) {
								try {
									const input = JSON.parse(toolInputBufferRef.current)
									dispatch({
										type: 'UPDATE_TOOL_CALL',
										toolCallId: currentToolIdRef.current,
										updates: {input, status: 'running'},
									})
								} catch {
									// Input JSON didn't parse; keep running status, tool will still execute
									dispatch({
										type: 'UPDATE_TOOL_CALL',
										toolCallId: currentToolIdRef.current,
										updates: {status: 'running'},
									})
								}
								currentToolIdRef.current = null
								toolInputBufferRef.current = ''
							}
							break
						}

						case 'message_stop':
							flushBuffer()
							break
					}
					break
				}

				case 'tool_progress': {
					// Tool is executing -- update elapsed time on matching tool call
					if (data.tool_use_id && data.elapsed_time_seconds != null) {
						dispatch({
							type: 'UPDATE_TOOL_CALL',
							toolCallId: data.tool_use_id,
							updates: {elapsedSeconds: data.elapsed_time_seconds},
						})
					}
					break
				}

				case 'tool_use_summary': {
					// Tool execution completed -- mark preceding tool calls as complete with summary
					const summary = data.summary || ''
					const ids: string[] = data.preceding_tool_use_ids || []
					for (const id of ids) {
						dispatch({
							type: 'UPDATE_TOOL_CALL',
							toolCallId: id,
							updates: {status: 'complete', output: summary},
						})
					}
					setAgentStatus(prev => {
						const updatedSteps = prev.steps.map(s =>
							ids.includes(s.id) ? {...s, status: 'complete' as const} : s
						)
						// Debounce transition to 'thinking' to avoid flicker between rapid tool calls
						if (thinkingTimerRef.current) clearTimeout(thinkingTimerRef.current)
						thinkingTimerRef.current = setTimeout(() => {
							setAgentStatus(p => {
								if (p.phase === 'executing' || p.phase === 'responding') return p
								return {...p, phase: 'thinking'}
							})
							thinkingTimerRef.current = null
						}, 300)
						return {...prev, currentTool: null, steps: updatedSteps}
					})
					break
				}

				case 'user': {
					// User message with tool_result blocks -- extract actual tool output
					const contentBlocks = data.message?.content
					if (Array.isArray(contentBlocks)) {
						for (const block of contentBlocks) {
							if (block.type === 'tool_result' && block.tool_use_id) {
								// Build output string from content (may be string or array of text blocks)
								let outputString = ''
								if (typeof block.content === 'string') {
									outputString = block.content
								} else if (Array.isArray(block.content)) {
									outputString = block.content
										// eslint-disable-next-line @typescript-eslint/no-explicit-any
										.filter((b: any) => b.type === 'text' && b.text)
										// eslint-disable-next-line @typescript-eslint/no-explicit-any
										.map((b: any) => b.text)
										.join('\n')
								}

								const isError = block.is_error === true
								dispatch({
									type: 'UPDATE_TOOL_CALL',
									toolCallId: block.tool_use_id,
									updates: {
										status: isError ? 'error' : 'complete',
										output: outputString,
										...(isError ? {errorMessage: outputString} : {}),
									},
								})
							}
						}
					}
					break
				}

				case 'result': {
					flushBuffer()
					dispatch({type: 'FINALIZE_MESSAGE'})

					// Extract cost and usage from SDK result
					if (data.total_cost_usd != null) {
						setTotalCost(data.total_cost_usd)
					}
					if (data.usage) {
						setUsageStats({
							inputTokens: data.usage.input_tokens ?? 0,
							outputTokens: data.usage.output_tokens ?? 0,
							durationMs: data.duration_ms ?? 0,
							numTurns: data.num_turns ?? 0,
						})
					}

					setIsStreaming(false)
					setAgentStatus({phase: 'idle', currentTool: null, steps: []})
					if (thinkingTimerRef.current) {
						clearTimeout(thinkingTimerRef.current)
						thinkingTimerRef.current = null
					}

					if (data.subtype !== 'success') {
						const errorMsg = data.errors?.[0]?.message || data.error?.message || data.error || `Agent stopped: ${data.subtype || 'unknown reason'}`
						dispatch({type: 'ADD_ERROR', message: String(errorMsg)})
					}
					break
				}
			}
		},
		[appendDelta, flushBuffer],
	)

	const handleMessage = useCallback(
		(event: MessageEvent) => {
			let msg
			try {
				msg = JSON.parse(event.data)
			} catch {
				return
			}

			switch (msg.type) {
				case 'session_ready':
					setCurrentSessionId(msg.sessionId)
					setIsStreaming(false)
					break

				case 'error':
					dispatch({type: 'ADD_ERROR', message: msg.message || 'Server error'})
					setIsStreaming(false)
					break

				case 'sdk_message':
					handleSdkMessage(msg.data)
					break
			}
		},
		[handleSdkMessage],
	)

	// --- Connection management ---

	const connect = useCallback(() => {
		const jwt = localStorage.getItem(JWT_LOCAL_STORAGE_KEY)
		if (!jwt) {
			setConnectionStatus('disconnected')
			return
		}

		const {protocol, hostname, port} = location
		const portPart = port ? `:${port}` : ''
		const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:'
		const wsUrl = `${wsProtocol}//${hostname}${portPart}/ws/agent?token=${jwt}`

		try {
			const ws = new WebSocket(wsUrl)
			wsRef.current = ws

			ws.onopen = () => {
				setConnectionStatus('connected')
				backoffRef.current = 1000 // Reset backoff on success
			}

			ws.onmessage = handleMessage

			ws.onclose = () => {
				wsRef.current = null
				setConnectionStatus('disconnected')

				if (!intentionalCloseRef.current) {
					// Schedule reconnection with exponential backoff
					setConnectionStatus('reconnecting')
					const delay = backoffRef.current
					backoffRef.current = Math.min(backoffRef.current * 2, 30000) // Max 30s
					reconnectTimerRef.current = setTimeout(() => {
						reconnectTimerRef.current = null
						connect()
					}, delay)
				}
			}

			ws.onerror = () => {
				// onclose will fire after onerror -- reconnection handled there
			}
		} catch {
			setConnectionStatus('disconnected')
		}
	}, [handleMessage])

	// Connect on mount, cleanup on unmount
	useEffect(() => {
		intentionalCloseRef.current = false
		connect()

		return () => {
			intentionalCloseRef.current = true
			if (reconnectTimerRef.current) {
				clearTimeout(reconnectTimerRef.current)
				reconnectTimerRef.current = null
			}
			if (thinkingTimerRef.current) {
				clearTimeout(thinkingTimerRef.current)
				thinkingTimerRef.current = null
			}
			if (wsRef.current) {
				wsRef.current.close(1000)
				wsRef.current = null
			}
		}
	}, [connect])

	// --- Actions ---

	const sendMessage = useCallback(
		(prompt: string, model?: string, conversationId?: string) => {
			const ws = wsRef.current
			if (!ws || ws.readyState !== WebSocket.OPEN) return

			resetBuffer()

			// Track the active conversation
			if (conversationId) conversationIdRef.current = conversationId

			const userMsg: ChatMessage = {
				id: `msg_${Date.now()}_user`,
				role: 'user',
				content: prompt,
				timestamp: Date.now(),
			}
			dispatch({type: 'ADD_USER_MESSAGE', message: userMsg})
			dispatch({type: 'START_ASSISTANT_MESSAGE', id: `msg_${Date.now()}_assistant`})
			setIsStreaming(true)
			setAgentStatus({phase: 'thinking', currentTool: null, steps: []})

			const payload: {type: string; prompt: string; sessionId?: string; model?: string; conversationId?: string} = {
				type: 'start',
				prompt,
			}
			if (currentSessionId) payload.sessionId = currentSessionId
			if (model) payload.model = model
			if (conversationIdRef.current) payload.conversationId = conversationIdRef.current
			ws.send(JSON.stringify(payload))
		},
		[currentSessionId, resetBuffer],
	)

	const sendFollowUp = useCallback(
		(text: string) => {
			const ws = wsRef.current
			if (!ws || ws.readyState !== WebSocket.OPEN) return

			const userMsg: ChatMessage = {
				id: `msg_${Date.now()}_followup`,
				role: 'user',
				content: text,
				timestamp: Date.now(),
			}
			dispatch({type: 'ADD_USER_MESSAGE', message: userMsg})
			ws.send(JSON.stringify({type: 'message', text}))
		},
		[],
	)

	const interrupt = useCallback(() => {
		const ws = wsRef.current
		if (!ws || ws.readyState !== WebSocket.OPEN) return

		ws.send(JSON.stringify({type: 'interrupt'}))
		flushBuffer()
		dispatch({type: 'FINALIZE_MESSAGE'})
		setIsStreaming(false)
		setAgentStatus({phase: 'idle', currentTool: null, steps: []})
	}, [flushBuffer])

	const cancel = useCallback(() => {
		const ws = wsRef.current
		if (!ws || ws.readyState !== WebSocket.OPEN) return

		ws.send(JSON.stringify({type: 'cancel'}))
		flushBuffer()
		dispatch({type: 'FINALIZE_MESSAGE'})
		setIsStreaming(false)
		setAgentStatus({phase: 'idle', currentTool: null, steps: []})
	}, [flushBuffer])

	const loadConversation = useCallback((messages: ChatMessage[], conversationId: string) => {
		dispatch({type: 'LOAD_MESSAGES', messages})
		conversationIdRef.current = conversationId
		resetBuffer()
	}, [resetBuffer])

	const clearMessages = useCallback(() => {
		dispatch({type: 'CLEAR'})
		resetBuffer()
		conversationIdRef.current = null
		setTotalCost(0)
		setUsageStats(null)
		setAgentStatus({phase: 'idle', currentTool: null, steps: []})
	}, [resetBuffer])

	return {
		// State
		messages,
		isConnected: connectionStatus === 'connected',
		isStreaming,
		connectionStatus,
		currentSessionId,
		conversationId: conversationIdRef.current,
		totalCost,
		usageStats,
		agentStatus,

		// Actions
		sendMessage,
		sendFollowUp,
		interrupt,
		cancel,
		clearMessages,
		loadConversation,
	}
}
