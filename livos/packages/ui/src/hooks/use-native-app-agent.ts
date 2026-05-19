// Phase 159 — useNativeAppAgent: per-NativeApp agent session wrapper (Workstream A).
//
// Mirrors useWebAppAgent's public interface (UseWebAppAgentResult) so
// downstream consumers (webapp-floating-action-bar.tsx, Plan 07) can
// hold either result behind a single UseStreamAppAgentResult alias.
//
// Differences from useWebAppAgent:
//   - Uses `apps.native.list` instead of `webapp.list` for ActiveAppMeta
//   - No window-list query (native binaries own their Xvfb display 1:1; no wid)
//   - No session persistence endpoints (deferred per RESEARCH A4)
//   - Conversation IDs prefixed `native:<id>:<short-uuid>` (vs `webapp:<id>:...`)
//   - sessionStatus: 'no-session' until first sendMessage, then 'ready' (never 'loading')
//
// Tests: source-text invariants in use-native-app-agent.test.ts.
// Sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f (sdk-agent-runner.ts) unchanged.

import {useCallback, useMemo, useState} from 'react'

import {
	useAgentSocket,
	type ActiveAppMetaPayload,
} from '@/hooks/use-agent-socket'
import type {UseWebAppAgentResult, WebAppSessionStatus} from '@/hooks/use-webapp-agent'
import {trpcReact} from '@/trpc/trpc'

/**
 * Phase 159 — type alias so a consumer holding either hook's result
 * (webapp OR native) can use a single type. The shape is identical;
 * the alias is documentation-only.
 */
export type UseStreamAppAgentResult = UseWebAppAgentResult

function makeFreshConversationId(nativeAppId: string): string {
	const rand =
		typeof crypto !== 'undefined' && crypto.randomUUID
			? crypto.randomUUID().slice(0, 8)
			: Math.random().toString(36).slice(2, 10)
	return `native:${nativeAppId}:${rand}`
}

export function useNativeAppAgent(nativeAppId: string): UseStreamAppAgentResult {
	// Guard tRPC queries on UUID shape (mirrors useWebAppAgent guard) so empty
	// strings / non-UUID values don't crash zod before resolution.
	const isUuid = !!nativeAppId && /^[0-9a-f-]{36}$/i.test(nativeAppId)

	const listQuery = trpcReact.apps.native.list.useQuery(undefined, {
		enabled: isUuid,
		staleTime: 30_000,
	})

	const cfg = useMemo(
		() => listQuery.data?.find((c) => c.id === nativeAppId) ?? null,
		[listQuery.data, nativeAppId],
	)

	const activeAppMeta = useMemo<ActiveAppMetaPayload | undefined>(() => {
		if (!cfg) return undefined
		return {
			appId: nativeAppId,
			kind: 'native',
			title: cfg.name,
		}
	}, [cfg, nativeAppId])

	// useAgentSocket has no `nativeAppId` slot — passing `activeAppMeta.kind`
	// is enough per RESEARCH A1 + use-agent-socket.ts:164. The WS envelope's
	// `webappId` stays undefined → broker treats as host scope, kind-aware
	// snippet injection happens via activeAppMeta.
	const agent = useAgentSocket({activeAppMeta})

	// No session persistence (RESEARCH A4 — deferred). Mint a fresh
	// conversation id on first sendMessage; reset on startNewSession.
	const [freshConversationId, setFreshConversationId] = useState<string | null>(null)
	const conversationId = freshConversationId

	const sessionStatus: WebAppSessionStatus = useMemo(() => {
		if (freshConversationId) return 'ready'
		return 'no-session'
	}, [freshConversationId])

	const sendMessage = useCallback(
		(
			text: string,
			attachments?: Array<{name: string; mimeType: string; data: string; size: number}>,
		) => {
			let convId = conversationId
			if (!convId) {
				convId = makeFreshConversationId(nativeAppId)
				setFreshConversationId(convId)
			}
			agent.sendMessage(text, undefined, convId, attachments)
		},
		[agent, conversationId, nativeAppId],
	)

	const startNewSession = useCallback(() => {
		setFreshConversationId(makeFreshConversationId(nativeAppId))
		agent.clearMessages()
	}, [agent, nativeAppId])

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
		stopStreaming: agent.interrupt,
		clearMessages: agent.clearMessages,
		startNewSession,
	}
}
