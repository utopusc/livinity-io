// v32-redo Stage 2b-fix — thread view powered by the LEGACY chat brain.
//
// Stage 2b shipped a custom MessageBubble that only rendered raw Markdown
// content. No streaming, no tool calls, no reasoning cards, no live SSE
// surface, and the "Loading conversation…" spinner spun forever because
// the SSE EventSource started against a brand-new id with no run.
//
// This rewrite mounts the production-tested:
//   - useAgentSocket (via AgentContextProvider) — WebSocket source of
//     truth for messages, tool calls, status, cost, etc.
//   - <ChatMessageItem /> from routes/ai-chat/chat-messages — interleaved
//     text + tool blocks with reasoning cards.
//   - <LivAgentStatus /> + <LivTypingDots /> — same agent banner the
//     legacy /ai-chat surface uses.
//   - <LivToolPanel /> — auto-opens when tool snapshots arrive (the
//     snapshot bridge effect lives in the parent index.tsx).
//   - <Composer /> at the bottom — the LivComposer wrapper that does
//     follow-up sends via agent.sendFollowUp / agent.sendMessage.
//
// Conversation loading uses the LEGACY proven pattern:
//   utils.ai.getConversationMessages.fetch({id}) → agent.loadConversation(...)
// This is the same call /ai-chat uses on URL ?conv= refresh and on
// sidebar-click. It returns the persisted Redis history. If the call
// rejects (conversation expired from Redis or never existed) we just
// clear and let the user start fresh — no infinite loading state.

import {useEffect, useRef} from 'react'
import {AlertTriangle} from 'lucide-react'

import {trpcReact} from '@/trpc/trpc'
import type {ChatMessage} from '@/hooks/use-agent-socket'
import {cn} from '@/shadcn-lib/utils'

import {
	ChatMessageItem,
	LivAgentStatus,
	LivTypingDots,
} from '@/routes/ai-chat/chat-messages'
import {LivToolPanel} from '@/routes/ai-chat/liv-tool-panel'

import {Composer} from './composer'
import {useAgentContext} from './lib/agent-context'
import {SidebarTrigger, useSidebar} from './ui/sidebar'

interface ThreadPageProps {
	conversationId: string
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

export function ThreadPage({conversationId}: ThreadPageProps) {
	const agent = useAgentContext()
	const utils = trpcReact.useUtils()
	const {open: sidebarOpen} = useSidebar()

	const conversationQuery = trpcReact.conversations.get.useQuery(
		{conversationId},
		{
			staleTime: 60_000,
			retry: false,
		},
	)

	const loadStateRef = useRef<LoadState>('idle')

	// Load persisted Redis messages once per (re)mount. The parent index.tsx
	// keys ThreadPage on conversationId so a sidebar switch fully remounts
	// this component — meaning loadStateRef resets cleanly per thread.
	useEffect(() => {
		if (loadStateRef.current !== 'idle') return
		// Wait for the WebSocket to be connected so loadConversation has
		// somewhere to land. agent.loadConversation only writes to the
		// reducer + a ref; the WS connection isn't strictly required, but
		// without it sendFollowUp would later fail. Match legacy timing.
		if (!agent.isConnected) return

		loadStateRef.current = 'loading'
		utils.ai.getConversationMessages
			.fetch({id: conversationId})
			.then((result) => {
				if (result?.messages) {
					agent.loadConversation(
						result.messages as ChatMessage[],
						conversationId,
					)
				} else {
					// No history — bind the conversationId to the agent so
					// sendFollowUp / appendMessage have a route. clearMessages
					// resets the in-memory list AND sets the internal ref.
					agent.loadConversation([], conversationId)
				}
				loadStateRef.current = 'ready'
			})
			.catch(() => {
				// Conversation expired from Redis (TTL) or was never persisted.
				// Bind the id to a fresh empty thread instead of hanging on
				// "Loading…". User can immediately type a new message.
				agent.loadConversation([], conversationId)
				loadStateRef.current = 'ready'
			})
	}, [agent, conversationId, utils])

	// Mirror assistant turn completions to PostgreSQL so the sidebar list
	// reorders + previews stay reasonable. Same dedupe trick as Stage 2b's
	// thread.tsx had — but driven off agent.isStreaming transitions, which
	// are reliable (the WebSocket emits result events).
	const appendMessage = trpcReact.conversations.appendMessage.useMutation()
	const persistedRef = useRef<Set<string>>(new Set())
	const prevStreamingRef = useRef(false)
	useEffect(() => {
		if (prevStreamingRef.current && !agent.isStreaming) {
			// Streaming just ended — find the latest assistant message and
			// mirror it to PostgreSQL.
			const lastAssistant = [...agent.messages]
				.reverse()
				.find((m) => m.role === 'assistant' && (m.content?.trim().length ?? 0) > 0)
			if (lastAssistant && !persistedRef.current.has(lastAssistant.id)) {
				persistedRef.current.add(lastAssistant.id)
				appendMessage
					.mutateAsync({
						conversationId,
						role: 'assistant',
						content: lastAssistant.content,
						reasoning: lastAssistant.reasoning ?? undefined,
					})
					.then(() => {
						void utils.conversations.list.invalidate()
					})
					.catch(() => {
						// Mirror failed — drop dedupe so a manual retry could
						// re-attempt; chat itself is unaffected.
						persistedRef.current.delete(lastAssistant.id)
					})
			}
		}
		prevStreamingRef.current = agent.isStreaming
	}, [agent.isStreaming, agent.messages, appendMessage, conversationId, utils])

	// Auto-scroll to bottom on new content (unless user has scrolled up).
	const scrollContainerRef = useRef<HTMLDivElement | null>(null)
	const bottomRef = useRef<HTMLDivElement | null>(null)
	const isUserScrolledUpRef = useRef(false)
	useEffect(() => {
		if (!isUserScrolledUpRef.current) {
			bottomRef.current?.scrollIntoView({behavior: 'smooth', block: 'end'})
		}
	}, [agent.messages, agent.isStreaming])

	const handleScroll = () => {
		const el = scrollContainerRef.current
		if (!el) return
		const distance = el.scrollHeight - el.scrollTop - el.clientHeight
		isUserScrolledUpRef.current = distance > 100
	}

	const messages = agent.messages
	const lastIsUser =
		messages.length > 0 && messages[messages.length - 1].role === 'user'

	return (
		<div className="flex flex-col h-screen w-full relative">
			{/* Header: sidebar trigger (always visible so user can re-expand
			    the offcanvas sidebar) + conversation title. */}
			<header className="flex h-12 items-center gap-2 border-b border-border/60 px-4 shrink-0">
				{!sidebarOpen && (
					<SidebarTrigger className="h-8 w-8" aria-label="Open sidebar" />
				)}
				<h2 className="text-sm font-medium truncate">
					{conversationQuery.data?.title ?? '…'}
				</h2>
				<div className="ml-auto flex items-center gap-2">
					<span
						className={cn(
							'inline-block h-2 w-2 rounded-full',
							agent.connectionStatus === 'connected' && 'bg-green-500',
							agent.connectionStatus === 'reconnecting' &&
								'bg-yellow-500 animate-pulse',
							agent.connectionStatus === 'disconnected' && 'bg-red-500',
						)}
						aria-label={`Agent ${agent.connectionStatus}`}
					/>
					{agent.totalCost > 0 && (
						<span className="text-xs font-mono text-muted-foreground">
							${agent.totalCost.toFixed(4)}
						</span>
					)}
				</div>
			</header>

			{/* Scrollable message list */}
			<div
				ref={scrollContainerRef}
				onScroll={handleScroll}
				className="flex-1 overflow-y-auto"
			>
				<div className="mx-auto max-w-3xl px-4 py-6">
					{conversationQuery.isError ? (
						<div className="flex items-center justify-center gap-2 text-sm text-destructive py-12">
							<AlertTriangle className="h-4 w-4" />
							Failed to load conversation
						</div>
					) : messages.length === 0 ? (
						<div className="text-sm text-muted-foreground text-center py-12">
							No messages yet — send one with the composer below.
						</div>
					) : (
						<div className="space-y-4">
							<LivAgentStatus status={agent.agentStatus} />
							{messages.map((msg, idx) => {
								const isLast = idx === messages.length - 1
								return (
									<ChatMessageItem
										key={msg.id}
										message={msg}
										conversationId={conversationId}
										isLastMessage={isLast}
									/>
								)
							})}
							{agent.isStreaming && lastIsUser && (
								<div className="ml-4 mt-2">
									<LivTypingDots active />
								</div>
							)}
						</div>
					)}
					<div ref={bottomRef} />
				</div>
			</div>

			{/* Composer pinned to bottom */}
			<div className="border-t border-border/60 px-4 py-3 shrink-0">
				<div className="mx-auto max-w-3xl">
					<Composer conversationId={conversationId} />
				</div>
			</div>

			{/* P68 LivToolPanel — fixed right-edge overlay, auto-opens on tool
			    snapshots flowing through useLivToolPanelStore from the
			    snapshot bridge effect mounted in index.tsx. */}
			<LivToolPanel />
		</div>
	)
}
