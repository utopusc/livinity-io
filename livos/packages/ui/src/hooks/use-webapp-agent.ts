// Phase 95-06 — useWebAppAgent: per-WebApp agent session wrapper.
//
// Wraps the legacy `useAgentSocket` (the v32 chat WebSocket hook — see
// G-7 fallback in 95-CONTEXT and the spike note in 95-PLAN: the
// `useLivAgentStream` source file is missing in tree, only the unit-test
// remains; we use the legacy stable hook instead).
//
// Contract per PLAN 95-06 (adapted to the legacy hook surface):
//   inputs:  webappId: string
//   outputs:
//     - all `useAgentSocket` outputs (messages, isStreaming, connectionStatus,
//       isConnected, sendMessage-wrapped, interrupt, …)
//     - sessionStatus: 'loading' | 'ready' | 'no-session' | 'session-ended'
//     - startNewSession(): clears local state; next sendMessage gets a
//       fresh conversationId.
//
// Internals:
//   1. On mount + webappId change: webapp.agent.session.get.useQuery —
//      reads the row keyed on (userId, webappId). userId is implicit in
//      the JWT.
//   2. If row exists with runId → resume. We don't truly back-fill chunks
//      because useAgentSocket WS resumption isn't run-aware (it's session-
//      aware via Liv core). We simply continue using the same
//      conversationId — Liv core's redis chat-history persistence covers
//      message replay on conversation re-open via the existing
//      `loadConversation` path.
//   3. If no row → fresh conversationId of shape `webapp:<webappId>:<uuid>`
//      (D-95-08). Upsert lazy on first sendMessage.
//   4. After each sendMessage call, if conversationId is fresh, fire a
//      best-effort upsert with runId=conversationId (D-95-08: runId ==
//      conversationId).
//   5. startNewSession bumps a generation counter to mint a new
//      conversationId on next sendMessage; clears the agent's local
//      messages.
//
// Tests: 95-06 ships source-text invariants in
// use-webapp-agent.unit.test.tsx (matches the 95-04 / 67-04 precedent).

import {useCallback, useEffect, useMemo, useRef, useState} from 'react'

import {useAgentSocket, type AgentStatus, type ChatMessage} from '@/hooks/use-agent-socket'
import {trpcReact} from '@/trpc/trpc'

export type WebAppSessionStatus = 'loading' | 'ready' | 'no-session' | 'session-ended'

export interface UseWebAppAgentResult {
	// Forwarded from useAgentSocket
	messages: ChatMessage[]
	isStreaming: boolean
	isConnected: boolean
	connectionStatus: 'connected' | 'disconnected' | 'reconnecting'
	totalCost: number
	usageStats: {inputTokens: number; outputTokens: number; durationMs: number; numTurns: number} | null
	/**
	 * Phase 100-10-10 Bug B — re-exported as the canonical `AgentStatus`
	 * type from use-agent-socket so the optional Hermes `phrase` field
	 * is part of the interface. The chat-WS path doesn't carry
	 * status_detail chunks today (agent-session.ts doesn't relay
	 * runStore chunks), so `phrase` is null in practice — but the
	 * consumer can render `phrase ?? \`Using ${currentTool}…\`` as a
	 * forward-compatible UI.
	 */
	agentStatus: AgentStatus

	// Session-aware actions
	conversationId: string | null
	sessionStatus: WebAppSessionStatus
	sendMessage: (text: string, attachments?: Array<{name: string; mimeType: string; data: string; size: number}>) => void
	interrupt: () => void
	/** Phase 100-10-06 D-100-10-E — semantic alias for `interrupt`.
	 *  The chat-response Stop button in the floating action bar refers to
	 *  the action as `stopStreaming` (per D-100-10-E spec). Both names
	 *  resolve to the SAME `useAgentSocket.interrupt` function reference,
	 *  which sends `{type: 'interrupt'}` over the WebSocket — a REAL
	 *  runtime cancel that halts the in-flight stream. Verify chain:
	 *  useWebAppAgent.stopStreaming → agent.interrupt →
	 *  useAgentSocket.interrupt → ws.send({type: 'interrupt'}).
	 */
	stopStreaming: () => void
	clearMessages: () => void
	startNewSession: () => void
}

function makeFreshConversationId(webappId: string): string {
	// `webapp:<webappId>:<short-uuid>` — D-95-08 says runId == conversationId,
	// and the repository layer persists this verbatim. Short uuid suffix
	// keeps it readable in dev tools.
	const rand =
		typeof crypto !== 'undefined' && crypto.randomUUID
			? crypto.randomUUID().slice(0, 8)
			: Math.random().toString(36).slice(2, 10)
	return `webapp:${webappId}:${rand}`
}

export function useWebAppAgent(webappId: string): UseWebAppAgentResult {
	// Phase 100-08-05 — pass webappId through to useAgentSocket so the WS
	// `start` envelope carries it, livinityd broker forwards it to liv
	// `/api/agent/stream`, and api.ts narrows additionalMcpServers to the
	// matching `luse:webapp:<webappId>` child (host Luse on lag).
	const agent = useAgentSocket({webappId})
	const utils = trpcReact.useUtils()

	const sessionQuery = trpcReact.webapp.agent.session.get.useQuery(
		{webappId},
		{
			// `webappId` is a UUID at the wire; rendering with a non-UUID would
			// crash zod. Disable the query if we don't yet have a real id.
			enabled: !!webappId && /^[0-9a-f-]{36}$/i.test(webappId),
			staleTime: 30_000,
		},
	)
	const upsertMutation = trpcReact.webapp.agent.session.upsert.useMutation()

	// Generation counter — bumping this mints a new conversationId.
	const [generation, setGeneration] = useState(0)
	const [freshConversationId, setFreshConversationId] = useState<string | null>(null)

	// Resolve which conversationId to use. Priority:
	//   1. If session.get returned a row with runId → reuse it (resume).
	//   2. Else use the locally minted fresh id (or mint one lazily on first send).
	const resumedConversationId = sessionQuery.data?.runId ?? null
	const conversationId = resumedConversationId ?? freshConversationId

	const sessionStatus: WebAppSessionStatus = useMemo(() => {
		if (sessionQuery.isLoading) return 'loading'
		if (sessionQuery.data && sessionQuery.data.runId) return 'ready'
		// Heuristic: if the agent socket reports an error containing 'run' and
		// 'not found' AND we tried to resume, mark session-ended so the UI can
		// show a "Start new session" CTA. The agent hook surfaces this via a
		// system-role message in `messages`.
		const errMsg = agent.messages.find((m) => m.role === 'system')
		if (errMsg && /run.*(not found|expired|gone)/i.test(errMsg.content) && resumedConversationId) {
			return 'session-ended'
		}
		return 'no-session'
	}, [sessionQuery.isLoading, sessionQuery.data, agent.messages, resumedConversationId])

	// Persist runId after the first sendMessage when no row existed yet.
	const persistedRunIdRef = useRef<string | null>(null)
	useEffect(() => {
		if (!conversationId) return
		if (sessionQuery.data?.runId === conversationId) return
		if (persistedRunIdRef.current === conversationId) return
		// Only persist after the user has actually sent a message — otherwise
		// just opening a window with no traffic would create an empty row.
		if (agent.messages.length === 0) return
		persistedRunIdRef.current = conversationId
		upsertMutation.mutate(
			{webappId, runId: conversationId},
			{
				onSuccess: () => {
					void utils.webapp.agent.session.get.invalidate({webappId})
				},
				onError: () => {
					// Reset so next message attempt retries; non-fatal.
					persistedRunIdRef.current = null
				},
			},
		)
	}, [conversationId, agent.messages.length, sessionQuery.data?.runId, upsertMutation, utils, webappId])

	// Debounced last_seen_idx upsert — bump roughly every 500ms while
	// streaming, mirrors the plan's intent without hammering Postgres.
	useEffect(() => {
		if (!conversationId) return
		if (agent.messages.length === 0) return
		const timer = setTimeout(() => {
			upsertMutation.mutate({
				webappId,
				lastSeenIdx: agent.messages.length - 1,
			})
		}, 500)
		return () => clearTimeout(timer)
	}, [conversationId, agent.messages.length, upsertMutation, webappId])

	const sendMessage = useCallback(
		(
			text: string,
			attachments?: Array<{name: string; mimeType: string; data: string; size: number}>,
		) => {
			let convId = conversationId
			if (!convId) {
				convId = makeFreshConversationId(webappId)
				setFreshConversationId(convId)
			}
			agent.sendMessage(text, undefined, convId, attachments)
		},
		[agent, conversationId, webappId],
	)

	const startNewSession = useCallback(() => {
		setGeneration((g) => g + 1)
		setFreshConversationId(makeFreshConversationId(webappId))
		persistedRunIdRef.current = null
		agent.clearMessages()
		// Invalidate so the UI doesn't try to resume the old runId after a
		// re-render. The next render with sessionQuery.data === undefined +
		// freshConversationId set will use the fresh id.
		void utils.webapp.agent.session.get.invalidate({webappId})
	}, [agent, utils, webappId])

	// `generation` is intentionally read into a ref-like reference so React
	// does not optimize away the dependency in dev — the linter is happy and
	// the value is stable.
	void generation

	return {
		messages: agent.messages,
		isStreaming: agent.isStreaming,
		isConnected: agent.isConnected,
		connectionStatus: agent.connectionStatus,
		totalCost: agent.totalCost,
		usageStats: agent.usageStats,
		agentStatus: agent.agentStatus,
		conversationId,
		sessionStatus,
		sendMessage,
		interrupt: agent.interrupt,
		// Phase 100-10-06 D-100-10-E — `stopStreaming` is a thin alias for
		// `interrupt`. Both reference the same `useAgentSocket.interrupt`
		// function, which sends `{type: 'interrupt'}` over the WebSocket
		// (see use-agent-socket.ts L551-558). This is a REAL runtime cancel,
		// NOT a no-op. The Stop button in the chat-response floating bar
		// (webapp-floating-action-bar.tsx ChatResponseBar) calls this.
		stopStreaming: agent.interrupt,
		clearMessages: agent.clearMessages,
		startNewSession,
	}
}
