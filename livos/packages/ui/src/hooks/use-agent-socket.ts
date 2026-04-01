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

/** A content block — text or tool, rendered in order */
export type ContentBlock =
	| {type: 'text'; content: string}
	| {type: 'tool'; toolCall: ChatToolCall}

export interface ChatMessage {
	id: string
	role: 'user' | 'assistant' | 'system'
	content: string
	blocks: ContentBlock[]
	toolCalls?: ChatToolCall[]
	isStreaming?: boolean
	timestamp: number
}

export interface AgentStatus {
	phase: 'idle' | 'thinking' | 'executing' | 'responding'
	currentTool: string | null
}

type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting'

// --- Reducer ---

type MessageAction =
	| {type: 'ADD_USER_MESSAGE'; message: ChatMessage}
	| {type: 'START_ASSISTANT_MESSAGE'; id: string}
	| {type: 'APPEND_TEXT'; text: string}
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
					blocks: [],
					toolCalls: [],
					isStreaming: true,
					timestamp: Date.now(),
				},
			]

		case 'APPEND_TEXT': {
			const last = state[state.length - 1]
			if (!last || last.role !== 'assistant' || !last.isStreaming) return state
			const blocks = [...last.blocks]
			const lastBlock = blocks[blocks.length - 1]
			if (lastBlock && lastBlock.type === 'text') {
				// Append to existing text block
				blocks[blocks.length - 1] = {type: 'text', content: lastBlock.content + action.text}
			} else {
				// Create new text block (after a tool or at start)
				blocks.push({type: 'text', content: action.text})
			}
			const newContent = last.content + action.text
			return [...state.slice(0, -1), {...last, content: newContent, blocks}]
		}

		case 'ADD_TOOL_CALL': {
			const last = state[state.length - 1]
			if (!last || last.role !== 'assistant') return state
			const blocks = [...last.blocks, {type: 'tool' as const, toolCall: action.toolCall}]
			return [
				...state.slice(0, -1),
				{...last, blocks, toolCalls: [...(last.toolCalls || []), action.toolCall]},
			]
		}

		case 'UPDATE_TOOL_CALL': {
			const last = state[state.length - 1]
			if (!last || last.role !== 'assistant') return state
			const updatedCalls = (last.toolCalls || []).map((tc) =>
				tc.id === action.toolCallId ? {...tc, ...action.updates} : tc,
			)
			// Also update in blocks
			const updatedBlocks = last.blocks.map((b) => {
				if (b.type === 'tool' && b.toolCall.id === action.toolCallId) {
					return {type: 'tool' as const, toolCall: {...b.toolCall, ...action.updates}}
				}
				return b
			})
			return [...state.slice(0, -1), {...last, toolCalls: updatedCalls, blocks: updatedBlocks}]
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
					blocks: [{type: 'text', content: action.message}],
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

// --- Hook ---

export function useAgentSocket() {
	const [messages, dispatch] = useReducer(messagesReducer, [])
	const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected')
	const [isStreaming, setIsStreaming] = useState(false)
	const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
	const [totalCost, setTotalCost] = useState<number>(0)
	const [usageStats, setUsageStats] = useState<{inputTokens: number; outputTokens: number; durationMs: number; numTurns: number} | null>(null)
	const [agentStatus, setAgentStatus] = useState<AgentStatus>({phase: 'idle', currentTool: null})

	const wsRef = useRef<WebSocket | null>(null)
	const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const backoffRef = useRef(1000)
	const intentionalCloseRef = useRef(false)
	const conversationIdRef = useRef<string | null>(null)
	const toolInputBufferRef = useRef('')
	const currentToolIdRef = useRef<string | null>(null)

	// --- Message handling ---

	const handleSdkMessage = useCallback(
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(data: any) => {
			switch (data.type) {
				case 'system':
					break

				case 'stream_delta': {
					// Compact normalized text delta from server
					if (data.text) {
						dispatch({type: 'APPEND_TEXT', text: data.text})
						setAgentStatus(prev => {
							if (prev.phase === 'responding') return prev
							return {phase: 'responding', currentTool: null}
						})
					}
					break
				}

				case 'stream_event': {
					// SDK wraps events: data.event is an OBJECT {type, delta, ...}
					const event = data.event
					const eventType = typeof event === 'object' && event !== null ? event.type : event
					switch (eventType) {
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
								setAgentStatus({phase: 'executing', currentTool: contentBlock.name})
							}
							break
						}
						case 'content_block_delta': {
							const delta = event?.delta ?? data.delta
							if (delta?.type === 'text_delta' && delta.text) {
								dispatch({type: 'APPEND_TEXT', text: delta.text})
								setAgentStatus(prev => {
									if (prev.phase === 'responding') return prev
									return {phase: 'responding', currentTool: null}
								})
							} else if (delta?.type === 'input_json_delta' && delta.partial_json) {
								toolInputBufferRef.current += delta.partial_json
							}
							break
						}
						case 'content_block_stop': {
							if (currentToolIdRef.current && toolInputBufferRef.current) {
								try {
									const input = JSON.parse(toolInputBufferRef.current)
									dispatch({type: 'UPDATE_TOOL_CALL', toolCallId: currentToolIdRef.current, updates: {input, status: 'running'}})
								} catch {
									dispatch({type: 'UPDATE_TOOL_CALL', toolCallId: currentToolIdRef.current, updates: {status: 'running'}})
								}
								currentToolIdRef.current = null
								toolInputBufferRef.current = ''
							}
							break
						}
						case 'message_start':
						case 'message_stop':
							break
					}
					break
				}

				case 'assistant': {
					// Complete assistant turn — extract tool calls we may have missed
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const toolUseBlocks = (data.message?.content || []).filter((block: any) => block.type === 'tool_use')
					for (const block of toolUseBlocks) {
						// Only add if not already tracked
						dispatch({type: 'UPDATE_TOOL_CALL', toolCallId: block.id, updates: {input: block.input || {}}})
					}
					// Extract text and append only NEW content
					const textContent = (data.message?.content || [])
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						.filter((b: any) => b.type === 'text')
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						.map((b: any) => b.text)
						.join('')
					// Don't replace — text was already streamed via deltas
					void textContent
					break
				}

				case 'tool_progress': {
					if (data.tool_use_id && data.elapsed_time_seconds != null) {
						dispatch({type: 'UPDATE_TOOL_CALL', toolCallId: data.tool_use_id, updates: {elapsedSeconds: data.elapsed_time_seconds}})
					}
					break
				}

				case 'tool_use_summary': {
					const summary = data.summary || ''
					const ids: string[] = data.preceding_tool_use_ids || []
					for (const id of ids) {
						dispatch({type: 'UPDATE_TOOL_CALL', toolCallId: id, updates: {status: 'complete', output: summary}})
					}
					setAgentStatus({phase: 'thinking', currentTool: null})
					break
				}

				case 'user': {
					// Tool results
					const contentBlocks = data.message?.content
					if (Array.isArray(contentBlocks)) {
						for (const block of contentBlocks) {
							if (block.type === 'tool_result' && block.tool_use_id) {
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
					dispatch({type: 'FINALIZE_MESSAGE'})
					if (data.total_cost_usd != null) setTotalCost(data.total_cost_usd)
					if (data.usage) {
						setUsageStats({
							inputTokens: data.usage.input_tokens ?? 0,
							outputTokens: data.usage.output_tokens ?? 0,
							durationMs: data.duration_ms ?? 0,
							numTurns: data.num_turns ?? 0,
						})
					}
					setIsStreaming(false)
					setAgentStatus({phase: 'idle', currentTool: null})
					if (data.subtype !== 'success') {
						const errorMsg = data.errors?.[0]?.message || data.error?.message || data.error || `Agent stopped: ${data.subtype || 'unknown reason'}`
						dispatch({type: 'ADD_ERROR', message: String(errorMsg)})
					}
					break
				}
			}
		},
		[],
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
				backoffRef.current = 1000
			}
			ws.onmessage = handleMessage
			ws.onclose = () => {
				wsRef.current = null
				setConnectionStatus('disconnected')
				if (!intentionalCloseRef.current) {
					setConnectionStatus('reconnecting')
					const delay = backoffRef.current
					backoffRef.current = Math.min(backoffRef.current * 2, 30000)
					reconnectTimerRef.current = setTimeout(() => {
						reconnectTimerRef.current = null
						connect()
					}, delay)
				}
			}
			ws.onerror = () => {}
		} catch {
			setConnectionStatus('disconnected')
		}
	}, [handleMessage])

	useEffect(() => {
		intentionalCloseRef.current = false
		connect()
		return () => {
			intentionalCloseRef.current = true
			if (reconnectTimerRef.current) {
				clearTimeout(reconnectTimerRef.current)
				reconnectTimerRef.current = null
			}
			if (wsRef.current) {
				wsRef.current.close(1000)
				wsRef.current = null
			}
		}
	}, [connect])

	// --- Visibility-based reconnection (iOS background/resume) ---
	useEffect(() => {
		const handleVisibilityChange = () => {
			if (document.hidden) return
			// Page became visible -- check if WebSocket needs reconnection
			setTimeout(() => {
				const ws = wsRef.current
				if (!ws || ws.readyState !== WebSocket.OPEN) {
					// Reset backoff for immediate reconnection
					backoffRef.current = 1000
					// Clear any pending reconnect timer to avoid double-connect
					if (reconnectTimerRef.current) {
						clearTimeout(reconnectTimerRef.current)
						reconnectTimerRef.current = null
					}
					connect()
				}
			}, 500)
		}
		document.addEventListener('visibilitychange', handleVisibilityChange)
		return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
	}, [connect])

	// --- Actions ---

	const sendMessage = useCallback(
		(prompt: string, model?: string, conversationId?: string, attachments?: Array<{name: string; mimeType: string; data: string; size: number}>) => {
			const ws = wsRef.current
			if (!ws || ws.readyState !== WebSocket.OPEN) return
			if (conversationId) conversationIdRef.current = conversationId
			toolInputBufferRef.current = ''
			currentToolIdRef.current = null

			// Build user message with attachment indicators
			const attachmentText = attachments?.length
				? '\n' + attachments.map(a => `[Attached: ${a.name}]`).join(' ')
				: ''
			const userMsg: ChatMessage = {
				id: `msg_${Date.now()}_user`,
				role: 'user',
				content: prompt + attachmentText,
				blocks: [{type: 'text', content: prompt + attachmentText}],
				timestamp: Date.now(),
			}
			dispatch({type: 'ADD_USER_MESSAGE', message: userMsg})
			dispatch({type: 'START_ASSISTANT_MESSAGE', id: `msg_${Date.now()}_assistant`})
			setIsStreaming(true)
			setAgentStatus({phase: 'thinking', currentTool: null})

			const payload: Record<string, unknown> = {type: 'start', prompt}
			if (currentSessionId) payload.sessionId = currentSessionId
			if (model) payload.model = model
			if (conversationIdRef.current) payload.conversationId = conversationIdRef.current
			if (attachments?.length) payload.attachments = attachments
			ws.send(JSON.stringify(payload))
		},
		[currentSessionId],
	)

	const sendFollowUp = useCallback(
		(text: string) => {
			const ws = wsRef.current
			if (!ws || ws.readyState !== WebSocket.OPEN) return
			const userMsg: ChatMessage = {
				id: `msg_${Date.now()}_followup`,
				role: 'user',
				content: text,
				blocks: [{type: 'text', content: text}],
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
		dispatch({type: 'FINALIZE_MESSAGE'})
		setIsStreaming(false)
		setAgentStatus({phase: 'idle', currentTool: null})
	}, [])

	const cancel = useCallback(() => {
		const ws = wsRef.current
		if (!ws || ws.readyState !== WebSocket.OPEN) return
		ws.send(JSON.stringify({type: 'cancel'}))
		dispatch({type: 'FINALIZE_MESSAGE'})
		setIsStreaming(false)
		setAgentStatus({phase: 'idle', currentTool: null})
	}, [])

	const loadConversation = useCallback((messages: ChatMessage[], conversationId: string) => {
		dispatch({type: 'LOAD_MESSAGES', messages})
		conversationIdRef.current = conversationId
	}, [])

	const clearMessages = useCallback(() => {
		dispatch({type: 'CLEAR'})
		conversationIdRef.current = null
		setTotalCost(0)
		setUsageStats(null)
		setAgentStatus({phase: 'idle', currentTool: null})
	}, [])

	return {
		messages,
		isConnected: connectionStatus === 'connected',
		isStreaming,
		connectionStatus,
		currentSessionId,
		conversationId: conversationIdRef.current,
		totalCost,
		usageStats,
		agentStatus,
		sendMessage,
		sendFollowUp,
		interrupt,
		cancel,
		clearMessages,
		loadConversation,
	}
}
