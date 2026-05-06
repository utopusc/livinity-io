// v32-redo Stage 2b — internal navigation context for the AI Chat window.
//
// The ai-chat-suna module is rendered inside a LivOS desktop window
// (window/app-contents/ai-chat-content.tsx), NOT under React Router.
// Mutating the host app's URL (e.g. with ?conv=<id>) would surprise the
// rest of LivOS and break the back button. So we keep the
// "which conversation is currently open" state in a small Provider
// scoped to <DashboardLayout>.
//
// Three consumers:
//   - dashboard.tsx renders when selectedConversationId is null
//     (the empty-state composer + hero).
//   - thread.tsx renders when selectedConversationId is set.
//   - sidebar/nav-agents.tsx writes via selectConversation on item
//     click and clears via clearSelection on the "+" / new-chat button.
//
// The provider also exposes a helper "open new conversation" path used
// by the dashboard composer's first-send flow:
//   1. composer creates a conversation row,
//   2. composer calls selectConversation(newId) so the layout swaps,
//   3. composer kicks off the SSE run.

import {createContext, useCallback, useContext, useMemo, useState, type ReactNode} from 'react'

interface ChatRouterValue {
	selectedConversationId: string | null
	selectConversation: (id: string) => void
	clearSelection: () => void
}

const ChatRouterContext = createContext<ChatRouterValue | null>(null)

export function ChatRouterProvider({children}: {children: ReactNode}) {
	const [selectedConversationId, setSelected] = useState<string | null>(null)

	const selectConversation = useCallback((id: string) => {
		setSelected(id)
	}, [])

	const clearSelection = useCallback(() => {
		setSelected(null)
	}, [])

	const value = useMemo<ChatRouterValue>(
		() => ({selectedConversationId, selectConversation, clearSelection}),
		[selectedConversationId, selectConversation, clearSelection],
	)

	return <ChatRouterContext.Provider value={value}>{children}</ChatRouterContext.Provider>
}

export function useChatRouter(): ChatRouterValue {
	const ctx = useContext(ChatRouterContext)
	if (!ctx) {
		throw new Error('useChatRouter must be used inside <ChatRouterProvider>')
	}
	return ctx
}
