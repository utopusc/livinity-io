import {useCallback, useEffect, useReducer, useRef, useState} from 'react'

import {JWT_LOCAL_STORAGE_KEY} from '@/modules/auth/shared'

// --- Types ---

export interface ChatToolCall {
	id: string
	name: string
	input: Record<string, unknown>
	status: 'running' | 'complete' | 'error'
	output?: string
}

export interface ChatMessage {
	id: string
	role: 'user' | 'assistant' | 'system'
	content: string
	toolCalls?: ChatToolCall[]
	isStreaming?: boolean
	timestamp: number
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

	const wsRef = useRef<WebSocket | null>(null)
	const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const backoffRef = useRef(1000) // Start at 1s
	const intentionalCloseRef = useRef(false)

	// Stream accumulation refs (Pattern 3: batched state updates)
	const bufferRef = useRef('')
	const rafRef = useRef<number>()
	// Track current tool input JSON accumulation
	const toolInputBufferRef = useRef('')
	const currentToolIdRef = useRef<string | null>(null)

	const appendDelta = useCallback((text: string) => {
		bufferRef.current += text
		if (!rafRef.current) {
			rafRef.current = requestAnimationFrame(() => {
				dispatch({type: 'UPDATE_STREAMING_CONTENT', content: bufferRef.current})
				rafRef.current = undefined
			})
		}
	}, [])

	const flushBuffer = useCallback(() => {
		if (rafRef.current) {
			cancelAnimationFrame(rafRef.current)
			rafRef.current = undefined
		}
		dispatch({type: 'UPDATE_STREAMING_CONTENT', content: bufferRef.current})
	}, [])

	const resetBuffer = useCallback(() => {
		bufferRef.current = ''
		toolInputBufferRef.current = ''
		currentToolIdRef.current = null
		if (rafRef.current) {
			cancelAnimationFrame(rafRef.current)
			rafRef.current = undefined
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

					bufferRef.current = content
					flushBuffer()
					for (const tc of toolCalls) {
						dispatch({type: 'ADD_TOOL_CALL', toolCall: tc})
					}
					break
				}

				case 'stream_event': {
					const event = data.event
					switch (event) {
						case 'message_start':
							// Create a new assistant message entry if not already streaming
							break

						case 'content_block_start': {
							const contentBlock = data.content_block
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
							}
							break
						}

						case 'content_block_delta': {
							const delta = data.delta
							if (delta?.type === 'text_delta' && delta.text) {
								appendDelta(delta.text)
							} else if (delta?.type === 'input_json_delta' && delta.partial_json) {
								toolInputBufferRef.current += delta.partial_json
							}
							break
						}

						case 'content_block_stop': {
							// If we were accumulating tool input JSON, parse and update
							if (currentToolIdRef.current && toolInputBufferRef.current) {
								try {
									const input = JSON.parse(toolInputBufferRef.current)
									dispatch({
										type: 'UPDATE_TOOL_CALL',
										toolCallId: currentToolIdRef.current,
										updates: {input, status: 'complete'},
									})
								} catch {
									dispatch({
										type: 'UPDATE_TOOL_CALL',
										toolCallId: currentToolIdRef.current,
										updates: {status: 'complete'},
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

				case 'result': {
					flushBuffer()
					dispatch({type: 'FINALIZE_MESSAGE'})
					setIsStreaming(false)

					if (data.subtype === 'error') {
						const errorMsg = data.error?.message || data.error || 'Unknown error'
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
			if (rafRef.current) {
				cancelAnimationFrame(rafRef.current)
				rafRef.current = undefined
			}
			if (wsRef.current) {
				wsRef.current.close(1000)
				wsRef.current = null
			}
		}
	}, [connect])

	// --- Actions ---

	const sendMessage = useCallback(
		(prompt: string, model?: string) => {
			const ws = wsRef.current
			if (!ws || ws.readyState !== WebSocket.OPEN) return

			resetBuffer()

			const userMsg: ChatMessage = {
				id: `msg_${Date.now()}_user`,
				role: 'user',
				content: prompt,
				timestamp: Date.now(),
			}
			dispatch({type: 'ADD_USER_MESSAGE', message: userMsg})
			dispatch({type: 'START_ASSISTANT_MESSAGE', id: `msg_${Date.now()}_assistant`})
			setIsStreaming(true)

			const payload: {type: string; prompt: string; sessionId?: string; model?: string} = {
				type: 'start',
				prompt,
			}
			if (currentSessionId) payload.sessionId = currentSessionId
			if (model) payload.model = model
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
	}, [flushBuffer])

	const cancel = useCallback(() => {
		const ws = wsRef.current
		if (!ws || ws.readyState !== WebSocket.OPEN) return

		ws.send(JSON.stringify({type: 'cancel'}))
		flushBuffer()
		dispatch({type: 'FINALIZE_MESSAGE'})
		setIsStreaming(false)
	}, [flushBuffer])

	const clearMessages = useCallback(() => {
		dispatch({type: 'CLEAR'})
		resetBuffer()
	}, [resetBuffer])

	return {
		// State
		messages,
		isConnected: connectionStatus === 'connected',
		isStreaming,
		connectionStatus,
		currentSessionId,

		// Actions
		sendMessage,
		sendFollowUp,
		interrupt,
		cancel,
		clearMessages,
	}
}
