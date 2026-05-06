// v32-redo Stage 2b — thread view. Renders messages for the currently
// selected conversation, with the composer pinned at the bottom for
// follow-up sends.
//
// Two message sources merged in display order:
//   - Persisted: trpc.conversations.listMessages — the source-of-truth
//     for completed turns. Survives refresh.
//   - Live: useLivAgentStream messages — assistant text actively being
//     streamed in, before persistence lands.
//
// Merge rule:
//   - Persisted messages render first.
//   - If the most-recent persisted message is a user turn (i.e. we're
//     actively waiting for an assistant turn), append the live in-memory
//     assistant message from the SSE stream below it.
//   - When the SSE stream reaches `complete`, append the assistant
//     message via conversations.appendMessage and invalidate the list
//     query so the next render comes purely from persistence.
//
// User messages right-aligned with a soft bg, assistant messages
// left-aligned without a bubble (Suna-style; matches the prose
// readability tradeoff noted in the brief).

import {useEffect, useMemo, useRef, useState} from 'react'
import {AlertTriangle} from 'lucide-react'

import {trpcReact} from '@/trpc/trpc'
import {useLivAgentStream} from '@/lib/use-liv-agent-stream'
import {Markdown} from '@/components/markdown'
import {cn} from '@/shadcn-lib/utils'

import {Composer} from './composer'

interface ThreadPageProps {
	conversationId: string
}

type DisplayMessage = {
	id: string
	role: 'user' | 'assistant' | 'system' | 'tool'
	content: string
	reasoning?: string | null
	source: 'persisted' | 'live'
}

export function ThreadPage({conversationId}: ThreadPageProps) {
	const utils = trpcReact.useUtils()

	const messagesQuery = trpcReact.conversations.listMessages.useQuery(
		{conversationId},
		{
			// Refresh on focus so a separate device's writes show up. The
			// composer also explicitly invalidates after each send.
			refetchOnWindowFocus: true,
			staleTime: 10_000,
		},
	)

	const conversationQuery = trpcReact.conversations.get.useQuery(
		{conversationId},
		{staleTime: 60_000},
	)

	const appendMessage = trpcReact.conversations.appendMessage.useMutation()

	// Live SSE slice for THIS conversation. The Zustand store keys by the
	// id we pass here — when conversationId changes (user clicks a different
	// thread in the sidebar) the hook re-subscribes to the new slice.
	const {messages: liveMessages, status, currentStatus} = useLivAgentStream({
		conversationId,
		autoStart: true,
	})

	// Track which assistant turns we've already persisted so the
	// status-change effect doesn't double-write on rapid re-renders.
	const persistedRunsRef = useRef<Set<string>>(new Set())

	// When a stream completes, persist the assistant message.
	useEffect(() => {
		if (status !== 'complete') return
		// Find the most recent assistant message in the live slice.
		const lastAssistant = [...liveMessages]
			.reverse()
			.find((m) => m.role === 'assistant' && m.text.trim().length > 0)
		if (!lastAssistant) return

		// Dedupe by message id so we don't double-persist on re-render.
		if (persistedRunsRef.current.has(lastAssistant.id)) return
		persistedRunsRef.current.add(lastAssistant.id)

		appendMessage
			.mutateAsync({
				conversationId,
				role: 'assistant',
				content: lastAssistant.text,
				reasoning: lastAssistant.reasoning ?? undefined,
			})
			.then(async () => {
				await utils.conversations.listMessages.invalidate({conversationId})
				await utils.conversations.list.invalidate()
			})
			.catch(() => {
				// Persistence failed — leave the live message visible so the
				// user sees the response. Drop the dedupe key so a manual
				// retry could attempt again on the next status transition.
				persistedRunsRef.current.delete(lastAssistant.id)
			})
		// We intentionally only fire on status transitions to 'complete'.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [status])

	const displayMessages: DisplayMessage[] = useMemo(() => {
		const persisted: DisplayMessage[] = (messagesQuery.data ?? []).map((m) => ({
			id: m.id,
			role: m.role,
			content: m.content,
			reasoning: m.reasoning,
			source: 'persisted' as const,
		}))

		// If we're actively streaming an assistant turn, surface the live
		// in-memory assistant message. We only append the LAST live assistant
		// message that hasn't been persisted yet — matching how the SSE
		// reducer accumulates a single rolling assistant turn per run.
		const lastLiveAssistant = [...liveMessages]
			.reverse()
			.find((m) => m.role === 'assistant' && m.text.trim().length > 0)

		const lastPersistedRole = persisted[persisted.length - 1]?.role
		const showLive =
			lastLiveAssistant &&
			(status === 'starting' || status === 'running' || status === 'reconnecting') &&
			lastPersistedRole === 'user'

		if (showLive && lastLiveAssistant) {
			return [
				...persisted,
				{
					id: `live-${lastLiveAssistant.id}`,
					role: 'assistant' as const,
					content: lastLiveAssistant.text,
					reasoning: lastLiveAssistant.reasoning ?? null,
					source: 'live' as const,
				},
			]
		}
		return persisted
	}, [messagesQuery.data, liveMessages, status])

	// Auto-scroll to bottom whenever messages change OR the live message
	// receives new tokens (length grows). We attach a ResizeObserver to the
	// last bubble so partial renders also stay pinned to the bottom.
	const scrollContainerRef = useRef<HTMLDivElement | null>(null)
	const bottomRef = useRef<HTMLDivElement | null>(null)
	useEffect(() => {
		bottomRef.current?.scrollIntoView({behavior: 'smooth', block: 'end'})
	}, [displayMessages.length, displayMessages[displayMessages.length - 1]?.content])

	const isStreaming =
		status === 'starting' || status === 'running' || status === 'reconnecting'

	return (
		<div className="flex flex-col h-screen w-full">
			{/* Header: conversation title */}
			<header className="flex h-12 items-center border-b border-border/60 px-4 shrink-0">
				<h2 className="text-sm font-medium truncate">
					{conversationQuery.data?.title ?? '…'}
				</h2>
			</header>

			{/* Scrollable message list */}
			<div
				ref={scrollContainerRef}
				className="flex-1 overflow-y-auto"
			>
				<div className="mx-auto max-w-3xl px-4 py-6 space-y-6">
					{messagesQuery.isLoading ? (
						<div className="text-sm text-muted-foreground text-center py-12">
							Loading conversation…
						</div>
					) : messagesQuery.isError ? (
						<div className="flex items-center justify-center gap-2 text-sm text-destructive py-12">
							<AlertTriangle className="h-4 w-4" />
							Failed to load conversation
						</div>
					) : displayMessages.length === 0 ? (
						<div className="text-sm text-muted-foreground text-center py-12">
							No messages yet — send one with the composer below.
						</div>
					) : (
						displayMessages.map((m) => (
							<MessageBubble key={m.id} message={m} />
						))
					)}

					{/* Status detail card (compact for Stage 2b — animated card
					    proper comes in 2c). When the agent is mid-thought
					    we show its current phrase under the live message. */}
					{isStreaming && currentStatus ? (
						<div className="text-xs text-muted-foreground italic pl-1">
							{currentStatus.phrase}
						</div>
					) : null}

					<div ref={bottomRef} />
				</div>
			</div>

			{/* Composer pinned to bottom */}
			<div className="border-t border-border/60 px-4 py-3 shrink-0">
				<div className="mx-auto max-w-3xl">
					<Composer conversationId={conversationId} compact />
				</div>
			</div>
		</div>
	)
}

function MessageBubble({message}: {message: DisplayMessage}) {
	if (message.role === 'user') {
		return (
			<div className="flex justify-end">
				<div
					className={cn(
						'max-w-[80%] rounded-2xl bg-muted px-4 py-2 text-sm whitespace-pre-wrap break-words',
					)}
				>
					{message.content}
				</div>
			</div>
		)
	}

	if (message.role === 'assistant') {
		return (
			<div className="flex justify-start">
				<div className="max-w-full text-sm">
					{message.content ? (
						<Markdown>{message.content}</Markdown>
					) : (
						<span className="text-muted-foreground italic">…</span>
					)}
				</div>
			</div>
		)
	}

	// system / tool — render as compact muted block (rare in this UI; visible
	// for debugging if persistence ever surfaces one).
	return (
		<div className="flex justify-center">
			<div className="text-xs text-muted-foreground italic px-3 py-1 rounded bg-muted/50">
				[{message.role}] {message.content}
			</div>
		</div>
	)
}
