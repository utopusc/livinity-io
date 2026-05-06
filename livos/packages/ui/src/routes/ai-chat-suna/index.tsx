// v32-redo Stage 2b-fix — entry point that wires the LEGACY chat machinery
// (`useAgentSocket` WebSocket + `useLivAgentStream` snapshot bridge) inside
// the Suna shell.
//
// Stage 2b had a custom SSE-only Composer + custom message renderer, both
// broken (no streaming, no tools, infinite "Loading conversation…"). This
// fix re-uses the production-tested components from routes/ai-chat/ —
// LivComposer + ChatMessageItem + LivToolPanel — driven by useAgentSocket
// (the SAME hook that powers /ai-chat in production).
//
// The Suna sidebar layout, "Hey, I am Liv" hero, and profile menu are
// preserved as visual shells around the legacy chat brain.

import {useEffect} from 'react'

import {useAgentSocket} from '@/hooks/use-agent-socket'
import {useLivAgentStream} from '@/lib/use-liv-agent-stream'
import {useLivToolPanelStore} from '@/stores/liv-tool-panel-store'

import DashboardLayout from './layout'
import DashboardPage from './dashboard'
import {ThreadPage} from './thread'
import {ChatRouterProvider, useChatRouter} from './lib/chat-router'
import {AgentContextProvider} from './lib/agent-context'

function ChatBody() {
	const {selectedConversationId} = useChatRouter()
	if (selectedConversationId) {
		// Key on conversationId so React fully unmounts/remounts the thread
		// when the user picks a different conversation — this resets local
		// scroll position and forces a fresh agent.loadConversation call.
		return <ThreadPage key={selectedConversationId} conversationId={selectedConversationId} />
	}
	return <DashboardPage />
}

/**
 * Snapshot bridge — same pattern as legacy routes/ai-chat/index.tsx:
 * funnel useLivAgentStream snapshots into useLivToolPanelStore so
 * <LivToolPanel /> auto-opens when tool runs land. Bound to the currently
 * selected conversationId; idle when none selected.
 */
function ToolPanelBridge({conversationId}: {conversationId: string | null}) {
	const livStream = useLivAgentStream({
		conversationId: conversationId ?? '',
		autoStart: false,
	})

	useEffect(() => {
		for (const snapshot of livStream.snapshots.values()) {
			useLivToolPanelStore.getState().handleNewSnapshot(snapshot)
		}
	}, [livStream.snapshots])

	return null
}

function AiChatSunaInner() {
	const agent = useAgentSocket()
	const {selectedConversationId} = useChatRouter()

	return (
		<AgentContextProvider agent={agent}>
			<ToolPanelBridge conversationId={selectedConversationId} />
			<DashboardLayout>
				<ChatBody />
			</DashboardLayout>
		</AgentContextProvider>
	)
}

export default function AiChatSuna() {
	return (
		<ChatRouterProvider>
			<AiChatSunaInner />
		</ChatRouterProvider>
	)
}
