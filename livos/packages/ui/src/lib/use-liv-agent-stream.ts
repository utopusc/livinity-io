// useLivAgentStream — Zustand-backed SSE consumer for /api/agent/runs/:runId/stream.
//
// Phase 67-04. Per CONTEXT D-23/D-24/D-25.
//   - D-23: file path lib/use-liv-agent-stream.ts
//   - D-24: hook signature { messages, snapshots, status, sendMessage, stop, runId, retry }
//   - D-25: reconnect with exponential backoff (1s -> 30s cap) + ?after=lastSeenIdx
//
// Per-conversationId state slicing: a single Zustand store holds a Map keyed
// by conversationId so multiple conversations can stream independently
// (D-24). Per-conversation selectors pluck the slice for the calling hook.
//
// Wire format from Plan 67-03 SSE endpoint (locked at planning time, no
// runtime dependency on 67-03 source — types are mirrored in
// ./liv-agent-types.ts per D-12).
//
// JWT auth: matches the existing UI pattern in
// livos/packages/ui/src/trpc/trpc.ts — read from
// localStorage[JWT_LOCAL_STORAGE_KEY === 'jwt'] via the shared module.
// EventSource cannot set custom headers, so the JWT is appended as a
// `?token=<jwt>` query param (T-67-04-01 mitigation).
//
// Test discipline: substantive logic lives in EXPORTED PURE HELPERS
// (`applyChunk`, `nextBackoffMs`, `buildStreamUrl`) so the file is testable
// WITHOUT @testing-library/react (D-NO-NEW-DEPS, established Phase
// 25/30/33/38/62 precedent). The hook itself is a thin wiring layer and is
// exercised via smoke + source-text invariants in
// ./use-liv-agent-stream.unit.test.tsx.

import {useCallback, useEffect, useRef} from 'react'
import {create} from 'zustand'

import {JWT_LOCAL_STORAGE_KEY} from '@/modules/auth/shared'

import {
	makeEmptyConversationState,
	type Chunk,
	type ConversationStreamState,
	type Message,
	type StatusDetailPayload,
	type StreamStatus,
	type ToolCallSnapshot,
} from './liv-agent-types'

// ─────────────────────────────────────────────────────────────────────
// Public hook contract (D-24)
// ─────────────────────────────────────────────────────────────────────

export type UseLivAgentStreamOpts = {
	conversationId: string
	autoStart?: boolean
}

export type UseLivAgentStreamReturn = {
	messages: Message[]
	snapshots: Map<string, ToolCallSnapshot>
	status: StreamStatus
	/**
	 * P88 — Latest `status_detail` payload from the stream. `null` between
	 * runs and reset to `null` on terminal status. Powers the animated
	 * phrase card in the v32 chat surface.
	 */
	currentStatus: StatusDetailPayload | null
	sendMessage: (text: string) => Promise<void>
	stop: () => Promise<void>
	runId: string | null
	retry: () => void
}

// ─────────────────────────────────────────────────────────────────────
// Pure helpers (testable without RTL — see use-liv-agent-stream.unit.test.tsx)
// ─────────────────────────────────────────────────────────────────────

/**
 * Compute the next reconnect-backoff delay in ms for a given attempt count.
 * D-25: exponential 1s → 2s → 4s → 8s → 16s → 30s (cap).
 */
export function nextBackoffMs(attempts: number): number {
	if (attempts < 0) return 1000
	const ms = 1000 * 2 ** attempts
	return Math.min(ms, 30_000)
}

/**
 * Build the EventSource URL for a run with the resume cursor + JWT token.
 * `lastSeenIdx === -1` means "from the beginning" (P67-03 endpoint accepts
 * after=-1 as resume-from-start).
 */
export function buildStreamUrl(
	runId: string,
	lastSeenIdx: number,
	token: string,
): string {
	const after = encodeURIComponent(String(lastSeenIdx))
	const tokenEnc = encodeURIComponent(token)
	return `/api/agent/runs/${encodeURIComponent(runId)}/stream?after=${after}&token=${tokenEnc}`
}

/**
 * Pure reducer: apply a single chunk to a conversation slice and return the
 * next slice. Tested directly by the unit-test file (no RTL needed).
 *
 * D-15 dedupe: tool_snapshot with same toolId REPLACES existing entry.
 * Text/reasoning are appended to the last assistant message OR start a new
 * one if the last message is a user message.
 */
export function applyChunk(
	prev: ConversationStreamState,
	chunk: Chunk,
): ConversationStreamState {
	const next: ConversationStreamState = {
		...prev,
		lastSeenIdx: Math.max(prev.lastSeenIdx, chunk.idx),
		messages: prev.messages,
		snapshots: prev.snapshots,
	}

	const lastMsg = next.messages[next.messages.length - 1]
	const newMsgId = `msg_${prev.runId ?? 'noid'}_${chunk.idx}`

	if (chunk.type === 'text') {
		const text = typeof chunk.payload === 'string' ? chunk.payload : ''
		if (lastMsg && lastMsg.role === 'assistant') {
			next.messages = [
				...next.messages.slice(0, -1),
				{...lastMsg, text: lastMsg.text + text},
			]
		} else {
			next.messages = [
				...next.messages,
				{id: newMsgId, role: 'assistant', text, ts: chunk.ts},
			]
		}
	} else if (chunk.type === 'reasoning') {
		const text = typeof chunk.payload === 'string' ? chunk.payload : ''
		if (lastMsg && lastMsg.role === 'assistant') {
			next.messages = [
				...next.messages.slice(0, -1),
				{...lastMsg, reasoning: (lastMsg.reasoning ?? '') + text},
			]
		} else {
			next.messages = [
				...next.messages,
				{id: newMsgId, role: 'assistant', text: '', reasoning: text, ts: chunk.ts},
			]
		}
	} else if (chunk.type === 'tool_snapshot') {
		const snap = chunk.payload as ToolCallSnapshot
		if (snap && typeof snap.toolId === 'string') {
			const newSnaps = new Map(next.snapshots)
			newSnaps.set(snap.toolId, snap) // D-15: replace
			next.snapshots = newSnaps
		}
	} else if (chunk.type === 'error') {
		next.status = 'error'
		const payload = chunk.payload as {message?: string} | string | null
		if (typeof payload === 'string') {
			next.errorMessage = payload
		} else if (payload && typeof payload.message === 'string') {
			next.errorMessage = payload.message
		} else {
			next.errorMessage = 'Unknown error'
		}
	} else if (chunk.type === 'status') {
		const s = typeof chunk.payload === 'string' ? chunk.payload : ''
		if (s === 'complete' || s === 'error' || s === 'stopped') {
			next.status = s as StreamStatus
			// P88 — clear status_detail on terminal status so UI hides the
			// animated phrase card when the run finishes.
			next.currentStatus = null
		}
	} else if (chunk.type === 'status_detail') {
		// P88 — Hermes-inspired phrase + phase + elapsed, surfaced to UI as
		// an animated card above the streaming caret. Last-write-wins.
		const payload = chunk.payload as Partial<StatusDetailPayload> | null
		if (
			payload &&
			(payload.phase === 'thinking' ||
				payload.phase === 'tool_use' ||
				payload.phase === 'waiting') &&
			typeof payload.phrase === 'string' &&
			typeof payload.elapsed === 'number'
		) {
			next.currentStatus = {
				phase: payload.phase,
				phrase: payload.phrase,
				elapsed: payload.elapsed,
			}
		}
	}
	// 'tool_call_partial' is a no-op for now — P75 will surface partial args.

	return next
}

// ─────────────────────────────────────────────────────────────────────
// Auth helper — mirrors livos/packages/ui/src/trpc/trpc.ts:33
// ─────────────────────────────────────────────────────────────────────

function getJwt(): string {
	if (typeof window === 'undefined') return ''
	return window.localStorage.getItem(JWT_LOCAL_STORAGE_KEY) ?? ''
}

// ─────────────────────────────────────────────────────────────────────
// Zustand store — single store, per-conversationId Map slicing
// ─────────────────────────────────────────────────────────────────────

type LivAgentStoreState = {
	conversations: Map<string, ConversationStreamState>
	ensureConversation: (id: string) => void
	setRunId: (id: string, runId: string | null) => void
	setStatus: (id: string, status: StreamStatus) => void
	setError: (id: string, msg: string) => void
	applyChunk: (id: string, chunk: Chunk) => void
	bumpReconnect: (id: string) => void
	resetReconnect: (id: string) => void
	appendUserMessage: (id: string, text: string) => void
	resetConversation: (id: string) => void
}

export const useLivAgentStore = create<LivAgentStoreState>((set) => ({
	conversations: new Map(),

	ensureConversation: (id) =>
		set((state) => {
			if (state.conversations.has(id)) return state
			const map = new Map(state.conversations)
			map.set(id, makeEmptyConversationState(id))
			return {conversations: map}
		}),

	setRunId: (id, runId) =>
		set((state) => {
			const conv = state.conversations.get(id)
			if (!conv) return state
			const map = new Map(state.conversations)
			map.set(id, {...conv, runId})
			return {conversations: map}
		}),

	setStatus: (id, status) =>
		set((state) => {
			const conv = state.conversations.get(id)
			if (!conv) return state
			const map = new Map(state.conversations)
			map.set(id, {...conv, status})
			return {conversations: map}
		}),

	setError: (id, msg) =>
		set((state) => {
			const conv = state.conversations.get(id)
			if (!conv) return state
			const map = new Map(state.conversations)
			map.set(id, {...conv, status: 'error', errorMessage: msg})
			return {conversations: map}
		}),

	applyChunk: (id, chunk) =>
		set((state) => {
			const conv = state.conversations.get(id)
			if (!conv) return state
			const map = new Map(state.conversations)
			map.set(id, applyChunk(conv, chunk))
			return {conversations: map}
		}),

	bumpReconnect: (id) =>
		set((state) => {
			const conv = state.conversations.get(id)
			if (!conv) return state
			const map = new Map(state.conversations)
			map.set(id, {
				...conv,
				reconnectAttempts: conv.reconnectAttempts + 1,
				status: 'reconnecting',
			})
			return {conversations: map}
		}),

	resetReconnect: (id) =>
		set((state) => {
			const conv = state.conversations.get(id)
			if (!conv) return state
			const map = new Map(state.conversations)
			map.set(id, {...conv, reconnectAttempts: 0})
			return {conversations: map}
		}),

	appendUserMessage: (id, text) =>
		set((state) => {
			const conv = state.conversations.get(id)
			if (!conv) return state
			const ts = Date.now()
			const userMsg: Message = {
				id: `usr_${conv.runId ?? 'noid'}_${ts}`,
				role: 'user',
				text,
				ts,
			}
			const map = new Map(state.conversations)
			map.set(id, {...conv, messages: [...conv.messages, userMsg]})
			return {conversations: map}
		}),

	resetConversation: (id) =>
		set((state) => {
			const map = new Map(state.conversations)
			map.set(id, makeEmptyConversationState(id))
			return {conversations: map}
		}),
}))

// ─────────────────────────────────────────────────────────────────────
// The hook (D-24)
// ─────────────────────────────────────────────────────────────────────

const TERMINAL_STATUSES: ReadonlySet<StreamStatus> = new Set([
	'complete',
	'error',
	'stopped' as StreamStatus,
])

export function useLivAgentStream(
	opts: UseLivAgentStreamOpts,
): UseLivAgentStreamReturn {
	const {conversationId, autoStart} = opts

	// Subscribe with a selector so the hook re-renders only on slice change.
	const conv = useLivAgentStore((state) => {
		state // tslint silence
		return state.conversations.get(conversationId)
	})
	const ensureConversation = useLivAgentStore((s) => s.ensureConversation)
	const setRunId = useLivAgentStore((s) => s.setRunId)
	const setStatus = useLivAgentStore((s) => s.setStatus)
	const setError = useLivAgentStore((s) => s.setError)
	const applyChunkAction = useLivAgentStore((s) => s.applyChunk)
	const bumpReconnect = useLivAgentStore((s) => s.bumpReconnect)
	const resetReconnect = useLivAgentStore((s) => s.resetReconnect)
	const appendUserMessage = useLivAgentStore((s) => s.appendUserMessage)

	// Ensure slice exists synchronously on first render.
	if (!conv) {
		ensureConversation(conversationId)
	}

	const eventSourceRef = useRef<EventSource | null>(null)
	const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const firstChunkAfterOpenRef = useRef<boolean>(true)

	// Read latest snapshot of slice for callbacks (avoid stale closures).
	const getSlice = useCallback((): ConversationStreamState | undefined => {
		return useLivAgentStore.getState().conversations.get(conversationId)
	}, [conversationId])

	const closeStream = useCallback(() => {
		if (eventSourceRef.current) {
			try {
				eventSourceRef.current.close()
			} catch {
				// noop — close on already-closed ES is harmless.
			}
			eventSourceRef.current = null
		}
		if (reconnectTimerRef.current) {
			clearTimeout(reconnectTimerRef.current)
			reconnectTimerRef.current = null
		}
	}, [])

	const openStream = useCallback(
		(runId: string, fromIdx: number) => {
			closeStream()
			const url = buildStreamUrl(runId, fromIdx, getJwt())
			firstChunkAfterOpenRef.current = true
			const es = new EventSource(url)
			eventSourceRef.current = es

			es.onmessage = (ev: MessageEvent) => {
				let chunk: Chunk | null = null
				try {
					chunk = JSON.parse(ev.data) as Chunk
				} catch (err) {
					// T-67-04-02: malformed chunk -> log + continue, do NOT throw.
					// eslint-disable-next-line no-console
					console.error('[useLivAgentStream] malformed chunk JSON', err, ev.data)
					return
				}
				if (firstChunkAfterOpenRef.current) {
					firstChunkAfterOpenRef.current = false
					resetReconnect(conversationId)
					setStatus(conversationId, 'running')
				}
				applyChunkAction(conversationId, chunk)
			}

			es.addEventListener('complete', (ev: MessageEvent) => {
				let payload: {status?: string} = {}
				try {
					payload = JSON.parse(ev.data)
				} catch {
					/* noop */
				}
				const final = (payload.status ?? 'complete') as StreamStatus
				setStatus(conversationId, final)
				closeStream()
			})

			es.onerror = () => {
				// If we were already terminal, ignore this error (server closed
				// after a complete event — expected).
				const slice = getSlice()
				if (slice && TERMINAL_STATUSES.has(slice.status)) {
					closeStream()
					return
				}
				bumpReconnect(conversationId)
				const attempts = (getSlice()?.reconnectAttempts ?? 1) - 1
				const delay = nextBackoffMs(attempts)
				if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
				reconnectTimerRef.current = setTimeout(() => {
					const cur = getSlice()
					if (!cur || !cur.runId) return
					if (TERMINAL_STATUSES.has(cur.status)) return
					openStream(cur.runId, cur.lastSeenIdx)
				}, delay)
			}
		},
		[
			closeStream,
			conversationId,
			applyChunkAction,
			bumpReconnect,
			getSlice,
			resetReconnect,
			setStatus,
		],
	)

	const sendMessage = useCallback(
		async (text: string) => {
			ensureConversation(conversationId)
			appendUserMessage(conversationId, text)
			setStatus(conversationId, 'starting')

			const token = getJwt()
			const headers: Record<string, string> = {
				'Content-Type': 'application/json',
			}
			if (token) headers['Authorization'] = `Bearer ${token}`

			let runId: string | null = null
			try {
				const res = await fetch('/api/agent/start', {
					method: 'POST',
					headers,
					body: JSON.stringify({task: text, conversationId}),
				})
				if (!res.ok) {
					const msg = `POST /api/agent/start failed: ${res.status}`
					setError(conversationId, msg)
					return
				}
				const body = (await res.json()) as {runId?: string}
				runId = body.runId ?? null
			} catch (err) {
				setError(conversationId, (err as Error).message ?? 'Network error')
				return
			}

			if (!runId) {
				setError(conversationId, 'No runId returned from /api/agent/start')
				return
			}

			setRunId(conversationId, runId)
			openStream(runId, -1)
		},
		[
			conversationId,
			appendUserMessage,
			ensureConversation,
			openStream,
			setError,
			setRunId,
			setStatus,
		],
	)

	const stop = useCallback(async () => {
		const slice = getSlice()
		if (!slice || !slice.runId) return
		const token = getJwt()
		const headers: Record<string, string> = {'Content-Type': 'application/json'}
		if (token) headers['Authorization'] = `Bearer ${token}`
		try {
			await fetch(`/api/agent/runs/${encodeURIComponent(slice.runId)}/control`, {
				method: 'POST',
				headers,
				body: JSON.stringify({signal: 'stop'}),
			})
			// Do NOT close EventSource here — server emits status='stopped' +
			// `event: complete`, which closes the stream via onmessage path.
		} catch (err) {
			setError(conversationId, (err as Error).message ?? 'Stop failed')
		}
	}, [conversationId, getSlice, setError])

	const retry = useCallback(() => {
		const slice = getSlice()
		if (!slice || !slice.runId) return
		resetReconnect(conversationId)
		if (reconnectTimerRef.current) {
			clearTimeout(reconnectTimerRef.current)
			reconnectTimerRef.current = null
		}
		openStream(slice.runId, slice.lastSeenIdx)
	}, [conversationId, getSlice, openStream, resetReconnect])

	// autoStart effect (D-24): if a runId already exists for this conversation
	// (e.g. user is returning to the page after a refresh), re-open the
	// EventSource with ?after=lastSeenIdx. Does NOT POST /start automatically
	// — that requires a user-supplied task.
	useEffect(() => {
		if (!autoStart) return
		const slice = getSlice()
		if (!slice) return
		if (!slice.runId) return
		if (TERMINAL_STATUSES.has(slice.status)) return
		openStream(slice.runId, slice.lastSeenIdx)
		// We intentionally only run this on mount + when conversationId changes.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [conversationId, autoStart])

	// Cleanup on unmount: close EventSource, clear pending reconnect timer.
	useEffect(() => {
		return () => {
			closeStream()
		}
	}, [closeStream])

	const slice = conv ?? makeEmptyConversationState(conversationId)
	return {
		messages: slice.messages,
		snapshots: slice.snapshots,
		status: slice.status,
		currentStatus: slice.currentStatus ?? null,
		sendMessage,
		stop,
		runId: slice.runId,
		retry,
	}
}
