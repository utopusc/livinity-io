// Phase 100-04 — WebAppChatDrawer.
//
// V33-MULTI-04 / G-100-D D2: hosts the v32 chat surface lifted from the
// pre-100-03 inline `WebAppAgentPanel` (read from pinned
// `pre_100_03_sha = 688887fd66dec645f3eb314d40eb7555181ee671`). The body
// preserves the original ChatMessageItem render + ChatInput composer
// wiring; the inline mode-pill row is dropped (replaced by the bottom
// 4-icon action-bar in webapp-stream-window.tsx) and the parent only
// hands the `webappId` to drive `useWebAppAgent`.
//
// Mounted by webapp-stream-window.tsx inside the right-side <Sheet>
// drawer when `openDrawer === 'chat'`.

import {useCallback, useState} from 'react'

import {useWebAppAgent} from '@/hooks/use-webapp-agent'
import {ChatInput, type FileAttachment} from '@/routes/ai-chat/chat-input'
import {ChatMessageItem} from '@/routes/ai-chat/chat-messages'

export interface WebAppChatDrawerProps {
	webappId: string
}

export function WebAppChatDrawer({webappId}: WebAppChatDrawerProps) {
	const agent = useWebAppAgent(webappId)

	const [composerValue, setComposerValue] = useState('')

	const onSend = useCallback(
		(attachments?: FileAttachment[]) => {
			const text = composerValue.trim()
			if (!text) return
			agent.sendMessage(text, attachments)
			setComposerValue('')
		},
		[agent, composerValue],
	)

	const onStop = useCallback(() => {
		agent.interrupt()
	}, [agent])

	return (
		<div className='flex h-full w-full flex-col bg-surface-base'>
			<div className='flex shrink-0 items-center justify-between border-b border-border-default px-4 py-3'>
				<h2 className='text-sm font-medium text-text-primary'>Chat</h2>
				<div className='text-caption-sm text-text-tertiary'>Liv Default</div>
			</div>

			<div className='flex-1 overflow-y-auto px-3 py-2'>
				{agent.sessionStatus === 'session-ended' ? (
					<div className='flex h-full flex-col items-center justify-center gap-3'>
						<div className='text-body text-text-secondary'>This session has ended.</div>
						<button
							type='button'
							onClick={agent.startNewSession}
							className='inline-flex h-8 items-center gap-2 rounded-radius-sm bg-surface-1 px-3 text-caption-sm text-text-primary hover:bg-surface-2'
						>
							Start new session
						</button>
					</div>
				) : agent.messages.length === 0 ? (
					<div className='flex h-full items-center justify-center text-caption-sm text-text-tertiary'>
						Send a message to start chatting about this WebApp.
					</div>
				) : (
					<div className='flex flex-col gap-2'>
						{agent.messages.map((m) => (
							<ChatMessageItem key={m.id} message={m} />
						))}
					</div>
				)}
			</div>

			<div className='shrink-0 border-t border-border-default'>
				<ChatInput
					value={composerValue}
					onChange={setComposerValue}
					onSend={onSend}
					onStop={onStop}
					isStreaming={agent.isStreaming}
					isConnected={agent.isConnected}
					disabled={false}
				/>
			</div>
		</div>
	)
}

export default WebAppChatDrawer
