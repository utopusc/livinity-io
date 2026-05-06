// v32-redo Stage 2b-fix — share a single useAgentSocket() instance across
// the dashboard hero composer, the thread message list, the thread
// composer, and the sidebar. The hook owns the live WebSocket + the
// in-memory ChatMessage[] reducer; sharing it via context (instead of
// invoking the hook in each component) keeps the connection singleton.
//
// Mirrors the pattern in legacy routes/ai-chat/index.tsx where one
// useAgentSocket() at the top wires every child via prop drilling. Context
// is a small ergonomic upgrade for the Suna shell where children are
// nested under <DashboardLayout> and prop drilling would be noisy.

import {createContext, useContext, type ReactNode} from 'react'

import type {useAgentSocket} from '@/hooks/use-agent-socket'

type AgentSocket = ReturnType<typeof useAgentSocket>

const AgentContext = createContext<AgentSocket | null>(null)

export function AgentContextProvider({
	agent,
	children,
}: {
	agent: AgentSocket
	children: ReactNode
}) {
	return <AgentContext.Provider value={agent}>{children}</AgentContext.Provider>
}

export function useAgentContext(): AgentSocket {
	const ctx = useContext(AgentContext)
	if (!ctx) {
		throw new Error('useAgentContext must be used inside <AgentContextProvider>')
	}
	return ctx
}
