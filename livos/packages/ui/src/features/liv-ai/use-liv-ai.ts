/**
 * Phase 197-06 — useLivAi hook.
 *
 * Wraps tRPC mastra.agent.stream subscription consumption with a reducer over
 * chunks. Returns {messages, pendingApproval, isStreaming, sendMessage,
 * approve, cancel, reset}.
 *
 * Note on transport: subscriptions still route via WebSocket through the
 * existing splitLink in trpc/trpc.ts (op.type === 'subscription' → wsLink).
 * The httpOnlyPaths entry for `mastra.agent.stream` is forward-compatible
 * with a future migration to httpSubscriptionLink but does NOT affect v1.
 */

import {useCallback, useReducer, useRef, useState} from 'react'

import {trpcReact} from '@/trpc/trpc'

export interface LivAiMessage {
	id: string
	role: 'user' | 'assistant'
	content: string
	toolCalls?: Array<{id: string; name: string; args: unknown}>
	toolResults?: Array<{toolCallId: string; result: unknown}>
}

export interface PendingApproval {
	toolCallId: string
	toolName: string
	args: unknown
	runId: string
}

interface State {
	messages: LivAiMessage[]
	pendingApproval: PendingApproval | null
	isStreaming: boolean
	currentRunId: string | null
}

type Action =
	| {type: 'send-user'; text: string}
	| {type: 'chunk'; chunk: Record<string, unknown>}
	| {type: 'run-start'; runId: string}
	| {type: 'pending-approval'; pa: PendingApproval}
	| {type: 'clear-pending'}
	| {type: 'finish'}
	| {type: 'error'; err: unknown}
	| {type: 'reset'}

function reducer(state: State, action: Action): State {
	switch (action.type) {
		case 'reset':
			return {messages: [], pendingApproval: null, isStreaming: false, currentRunId: null}
		case 'send-user': {
			return {
				...state,
				isStreaming: true,
				messages: [
					...state.messages,
					{id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, role: 'user', content: action.text},
				],
			}
		}
		case 'run-start':
			return {...state, currentRunId: action.runId, isStreaming: true}
		case 'chunk': {
			const c = action.chunk as {
				type?: string
				text?: string
				delta?: string
				toolName?: string
				toolCallId?: string
				args?: unknown
				result?: unknown
			}
			if (c.type === 'text-delta' || c.type === 'text') {
				const piece = (c.delta ?? c.text ?? '') as string
				if (!piece) return state
				const last = state.messages[state.messages.length - 1]
				if (last && last.role === 'assistant') {
					const next = state.messages.slice(0, -1)
					next.push({...last, content: last.content + piece})
					return {...state, messages: next}
				}
				return {
					...state,
					messages: [
						...state.messages,
						{id: `a-${Date.now()}`, role: 'assistant', content: piece},
					],
				}
			}
			if (c.type === 'tool-call' && c.toolCallId && c.toolName) {
				const last = state.messages[state.messages.length - 1]
				const tc = {id: c.toolCallId, name: c.toolName, args: c.args}
				if (last && last.role === 'assistant') {
					const next = state.messages.slice(0, -1)
					next.push({...last, toolCalls: [...(last.toolCalls ?? []), tc]})
					return {...state, messages: next}
				}
				return {
					...state,
					messages: [
						...state.messages,
						{id: `a-${Date.now()}`, role: 'assistant', content: '', toolCalls: [tc]},
					],
				}
			}
			if (c.type === 'tool-result' && c.toolCallId) {
				const last = state.messages[state.messages.length - 1]
				const tr = {toolCallId: c.toolCallId, result: c.result}
				if (last && last.role === 'assistant') {
					const next = state.messages.slice(0, -1)
					next.push({...last, toolResults: [...(last.toolResults ?? []), tr]})
					return {...state, messages: next}
				}
			}
			return state
		}
		case 'pending-approval':
			return {...state, pendingApproval: action.pa}
		case 'clear-pending':
			return {...state, pendingApproval: null}
		case 'finish':
			return {...state, isStreaming: false, currentRunId: null}
		case 'error':
			return {...state, isStreaming: false}
		default:
			return state
	}
}

export function useLivAi(threadId: string): {
	messages: LivAiMessage[]
	pendingApproval: PendingApproval | null
	isStreaming: boolean
	currentRunId: string | null
	sendMessage(text: string): void
	approve(approved: boolean): void
	cancel(): void
	reset(): void
} {
	const [state, dispatch] = useReducer(reducer, {
		messages: [],
		pendingApproval: null,
		isStreaming: false,
		currentRunId: null,
	})

	const [pendingInput, setPendingInput] = useState<{threadId: string; message: string} | null>(null)
	const runIdRef = useRef<string | null>(null)
	runIdRef.current = state.currentRunId

	// Mastra subscription — only active when pendingInput is set.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const trpcAny = trpcReact as any
	trpcAny.mastra?.agent?.stream?.useSubscription?.(pendingInput ?? {threadId: '', message: ''}, {
		enabled: pendingInput !== null,
		onData(chunk: Record<string, unknown>) {
			const c = chunk as {
				type?: string
				runId?: string
				toolName?: string
				toolCallId?: string
				args?: unknown
			}
			if (c.type === 'run-start' && typeof c.runId === 'string') {
				dispatch({type: 'run-start', runId: c.runId})
				return
			}
			if (c.type === 'tool-call-approval' && c.toolCallId && c.toolName) {
				dispatch({
					type: 'pending-approval',
					pa: {
						toolCallId: c.toolCallId,
						toolName: c.toolName,
						args: c.args,
						runId: c.runId ?? runIdRef.current ?? 'unknown',
					},
				})
				return
			}
			if (c.type === 'finish') {
				dispatch({type: 'finish'})
				setPendingInput(null)
				return
			}
			dispatch({type: 'chunk', chunk})
		},
		onError(err: unknown) {
			dispatch({type: 'error', err})
			setPendingInput(null)
		},
	})

	const approveMut = trpcAny.mastra?.agent?.approve?.useMutation?.()
	const cancelMut = trpcAny.mastra?.agent?.cancel?.useMutation?.()

	const sendMessage = useCallback(
		(text: string) => {
			if (!text.trim()) return
			dispatch({type: 'send-user', text})
			setPendingInput({threadId, message: text})
		},
		[threadId],
	)

	const approve = useCallback(
		(approved: boolean) => {
			const pa = state.pendingApproval
			if (!pa) return
			approveMut?.mutate?.({toolCallId: pa.toolCallId, approved})
			dispatch({type: 'clear-pending'})
		},
		[approveMut, state.pendingApproval],
	)

	const cancel = useCallback(() => {
		const runId = state.currentRunId
		if (runId) {
			cancelMut?.mutate?.({runId})
		}
		dispatch({type: 'finish'})
		setPendingInput(null)
	}, [cancelMut, state.currentRunId])

	const reset = useCallback(() => {
		dispatch({type: 'reset'})
		setPendingInput(null)
	}, [])

	return {
		messages: state.messages,
		pendingApproval: state.pendingApproval,
		isStreaming: state.isStreaming,
		currentRunId: state.currentRunId,
		sendMessage,
		approve,
		cancel,
		reset,
	}
}
