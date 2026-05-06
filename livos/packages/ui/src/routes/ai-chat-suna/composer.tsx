// v32-redo Stage 2b-fix — thin wrapper around the LEGACY <LivComposer />.
//
// Stage 2b shipped a custom Composer that sent via useLivAgentStream
// (SSE-only) and never spoke to the WebSocket the rest of LivOS uses.
// Result: send button did nothing visible, no streaming text, no tool
// calls. This file replaces that body with a wrapper that:
//
//   1. Holds the textarea state (LivComposer is controlled).
//   2. On first send (conversationId === null): creates a conversation
//      row via tRPC conversations.create, flips the chat-router to the
//      new id, then calls agent.sendMessage(...) with the new id.
//   3. On follow-up sends (conversationId !== null): if streaming →
//      agent.sendFollowUp; else agent.sendMessage with the existing id.
//   4. Mirrors the user turn into conversations.appendMessage so the
//      Stage 2b-PostgreSQL sidebar list reorders. (The WebSocket itself
//      writes the canonical Redis turn — this mirror only feeds the
//      sidebar.)
//
// All UI surface — auto-grow textarea, attachments, drag/drop/paste,
// slash menu, mention menu, stop button, model badge, voice — comes from
// LivComposer untouched. We are NOT modifying that file.

import {useCallback, useState} from 'react'
import {toast} from 'sonner'

import {trpcReact} from '@/trpc/trpc'
import {LivComposer, type FileAttachment} from '@/routes/ai-chat/liv-composer'

import {useAgentContext} from './lib/agent-context'
import {useChatRouter} from './lib/chat-router'
// Note: useChatRouter exposes selectConversation + clearSelection.

const MAX_TITLE_LEN = 120

function deriveTitle(task: string): string {
	const trimmed = task.trim().replace(/\s+/g, ' ')
	if (!trimmed) return 'New conversation'
	if (trimmed.length <= MAX_TITLE_LEN) return trimmed
	return trimmed.slice(0, MAX_TITLE_LEN - 1).trimEnd() + '…'
}

interface ComposerProps {
	/** When set, follow-up sends append to this conversation. When null, the
	 * first send creates a new conversation (only meaningful for the
	 * dashboard hero — the thread view always passes a real id). */
	conversationId: string | null
}

export function Composer({conversationId}: ComposerProps) {
	const [value, setValue] = useState('')
	const utils = trpcReact.useUtils()
	const agent = useAgentContext()
	const {selectConversation, clearSelection} = useChatRouter()

	const createConversation = trpcReact.conversations.create.useMutation()
	const appendMessage = trpcReact.conversations.appendMessage.useMutation()

	const handleSend = useCallback(
		async (attachments?: FileAttachment[]) => {
			const text = value.trim()
			if (!text && (!attachments || attachments.length === 0)) return

			// Capture + clear input immediately so the user sees responsive
			// feedback (LivComposer handles textarea height reset internally
			// via useLayoutEffect on `value`).
			const taskText = text
			setValue('')

			try {
				let activeConvId = conversationId

				if (!activeConvId) {
					// First send: create the conversation row, flip the layout,
					// then kick the agent. Do NOT await the layout swap — React
					// batches the setState; the WS message goes out next tick.
					const created = await createConversation.mutateAsync({
						title: deriveTitle(taskText || 'New conversation'),
					})
					activeConvId = created.id
					selectConversation(activeConvId)
				}

				// Mirror the user turn to PostgreSQL so the sidebar list
				// reorders. Fire-and-forget — the WebSocket itself is the
				// canonical chat store; this mirror is just for the sidebar
				// query (`conversations.list`). On failure we log; we do NOT
				// surface to the user because the chat itself is unaffected.
				if (taskText) {
					appendMessage
						.mutateAsync({
							conversationId: activeConvId,
							role: 'user',
							content: taskText,
						})
						.then(() => {
							void utils.conversations.list.invalidate()
						})
						.catch((err) => {
							// eslint-disable-next-line no-console
							console.warn('Sidebar mirror failed (chat unaffected):', err)
						})
				}

				// Drive the WebSocket. Same dispatch pattern as legacy
				// routes/ai-chat/index.tsx handleSend: while a stream is mid-
				// flight, follow-up; otherwise send a fresh turn (which will
				// open a new run on the server).
				if (agent.isConnected && agent.connectionStatus === 'connected') {
					if (agent.isStreaming) {
						agent.sendFollowUp(taskText)
					} else {
						agent.sendMessage(
							taskText || 'Describe these files',
							undefined,
							activeConvId,
							attachments,
						)
					}
				} else {
					toast.error('Agent disconnected — try again in a moment')
				}
			} catch (err) {
				const msg = err instanceof Error ? err.message : 'Send failed'
				toast.error(msg)
			}
		},
		[
			agent,
			appendMessage,
			conversationId,
			createConversation,
			selectConversation,
			utils,
			value,
		],
	)

	const handleStop = useCallback(() => {
		agent.interrupt()
	}, [agent])

	const handleSlashAction = useCallback(
		(action: string) => {
			if (action === '/new') {
				agent.clearMessages()
				// Drop selection so dashboard hero re-renders.
				clearSelection()
			}
		},
		[agent, clearSelection],
	)

	return (
		<LivComposer
			value={value}
			onChange={setValue}
			onSend={handleSend}
			onStop={handleStop}
			isStreaming={agent.isStreaming}
			isConnected={agent.isConnected}
			onSlashAction={handleSlashAction}
		/>
	)
}
