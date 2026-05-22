/**
 * Phase 197-06 — LivAiChatWindow.
 *
 * Main chat surface mounted by app-contents/liv-ai-content.tsx. Layout:
 *   - ThreadSidebar (left, 256px)
 *   - Message list (center, scrollable)
 *   - ApprovalModal (floating)
 *   - Input box (bottom: textarea + Send + Cancel-when-streaming)
 */

import {useEffect, useRef, useState} from 'react'

import {ApprovalModal} from './approval-modal'
import {MessageBubble} from './message-bubble'
import {ThreadSidebar} from './thread-sidebar'
import {useLivAi} from './use-liv-ai'

function newThreadId(): string {
	return `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function LivAiChatWindow() {
	const [threadId, setThreadId] = useState<string>(() => newThreadId())
	const [input, setInput] = useState('')
	const scrollRef = useRef<HTMLDivElement>(null)

	const {messages, pendingApproval, isStreaming, sendMessage, approve, cancel, reset} =
		useLivAi(threadId)

	useEffect(() => {
		// Auto-scroll on new message
		const el = scrollRef.current
		if (el) el.scrollTop = el.scrollHeight
	}, [messages])

	const handleSend = () => {
		if (!input.trim() || isStreaming) return
		sendMessage(input.trim())
		setInput('')
	}

	const handleNewThread = () => {
		setThreadId(newThreadId())
		reset()
	}

	return (
		<div className='flex h-full overflow-hidden bg-white dark:bg-neutral-950'>
			<ThreadSidebar
				currentThreadId={threadId}
				onSelect={(id) => {
					setThreadId(id)
					reset()
				}}
				onNew={handleNewThread}
			/>
			<main className='relative flex flex-1 flex-col'>
				<div ref={scrollRef} className='flex-1 overflow-y-auto'>
					{messages.length === 0 ? (
						<div className='flex h-full items-center justify-center text-center text-sm text-neutral-500'>
							<div>
								<p className='mb-2 text-base font-medium'>Liv AI</p>
								<p>Ask me to take a screenshot, list windows, or chat about anything.</p>
							</div>
						</div>
					) : (
						messages.map((m) => <MessageBubble key={m.id} message={m} />)
					)}
				</div>
				<div className='border-t border-neutral-200 p-3 dark:border-neutral-800'>
					<div className='flex items-end gap-2'>
						<textarea
							value={input}
							onChange={(e) => setInput(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter' && !e.shiftKey) {
									e.preventDefault()
									handleSend()
								}
							}}
							placeholder='Type a message…'
							rows={2}
							className='flex-1 resize-none rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900'
							disabled={isStreaming}
						/>
						{isStreaming ? (
							<button
								type='button'
								onClick={cancel}
								className='rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700'
							>
								Cancel
							</button>
						) : (
							<button
								type='button'
								onClick={handleSend}
								disabled={!input.trim()}
								className='rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50'
							>
								Send
							</button>
						)}
					</div>
				</div>
				<ApprovalModal
					pending={pendingApproval}
					onApprove={() => approve(true)}
					onReject={() => approve(false)}
				/>
			</main>
		</div>
	)
}
