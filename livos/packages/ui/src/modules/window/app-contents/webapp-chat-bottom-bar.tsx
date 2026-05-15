// DEPRECATED 2026-05-10 (P100-09-08): persistent inline chat bar removed.
//
// Phase 101-09: animations land in webapp-floating-action-bar.tsx, NOT here.
// See 101-PATTERNS.md risk note #1.
//
// The action bar (webapp-floating-action-bar.tsx) now transforms to a
// chat input row on Chat icon click — a 2-mode state machine (icons |
// chat-input) replacing this component. Per user feedback after 09-05
// deploy: "Message Liv... kismi pencerenin icinde olmamasi lazimdi
// assagida message iconuna tikladigimda o kisimin butun olarak inputa
// donusmesi lazimdi" (the chat surface shouldn't be inside the window;
// clicking the message icon should transform that area into the input).
//
// This file is retained for revert safety; the JSX render in
// webapp-stream-window.tsx is gone and there are no other consumers.
// v34 cleanup may delete this file outright.
//
// ── Below: original 09-05 docstring preserved for archeology. ────────
//
// Phase 100-09-05 — WebAppChatBottomBar.
//
// V33-MULTI-09-05-INLINE-CHAT: replaces the Chat shadcn Sheet drawer
// (lifted from webapp-chat-drawer.tsx, which is now DEPRECATED) with a
// persistent slim text input + collapsible message log anchored at the
// bottom of the WebApp stream window.
//
// User explicit ("Chat penceresi olmasin sadece yazi yazalim. Yazilar
// sadece Alt kisimda gozuksun. Butonlar kalsin o sirada."): drop the
// chat drawer; just text input; messages appear at the bottom only;
// the floating action bar (100-06) stays.
//
// Layout (CONTEXT.md mockup, 100-09 D-100-09-C):
//   absolute inset-x-0 bottom-0 z-10 band INSIDE the stream wrapper
//   (overlays the existing pb-9 reservation that 100-03 left in place).
//
//   Collapsed (default, ~44px tall):
//     [chevron-up] [text input ............ ] [send]
//
//   Expanded (~204px tall):
//     [scrollable message log, max-h-160px]
//     [chevron-down] [text input ............ ] [send]
//
// State coupling:
//   - input value: local useState
//   - log expanded: subscribed from useWebAppDrawerStore
//     (`chatLogExpandedByWebappId[webappId]`); flipped via `toggleChatLog`
//   - chat agent (messages, sendMessage, isStreaming, isConnected,
//     interrupt): useWebAppAgent
//
// The floating action bar's Chat icon (100-06) is repurposed in
// `webapp-floating-action-bar.tsx` to call the same `toggleChatLog`
// action — clicking the Chat icon expands/collapses this bar's message
// log instead of opening any drawer.
//
// Sacred SHA: liv/packages/core/src/sdk-agent-runner.ts is unchanged
// (file untouched). UI-only addition.

import {useCallback, useState} from 'react'
import {ChevronUp} from 'lucide-react'

import {useWebAppAgent} from '@/hooks/use-webapp-agent'
import {ChatInput, type FileAttachment} from '@/routes/ai-chat/chat-input'
import {ChatMessageItem} from '@/routes/ai-chat/chat-messages'
import {ScrollArea} from '@/shadcn-components/ui/scroll-area'
import {cn} from '@/shadcn-lib/utils'

import {useWebAppDrawerStore} from '../webapp-drawer-store'

export interface WebAppChatBottomBarProps {
	webappId: string
}

export function WebAppChatBottomBar({webappId}: WebAppChatBottomBarProps) {
	const agent = useWebAppAgent(webappId)
	const expanded = useWebAppDrawerStore((s) => s.chatLogExpandedByWebappId[webappId] ?? false)
	const toggleChatLog = useWebAppDrawerStore((s) => s.toggleChatLog)
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
		<div className='absolute inset-x-0 bottom-0 z-10 border-t border-border-default bg-card-bg/95 backdrop-blur-md'>
			{expanded ? (
				<ScrollArea className='max-h-[160px] px-3 py-2'>
					{agent.messages.length === 0 ? (
						<div className='py-2 text-caption-sm text-text-tertiary'>
							No messages yet. Type below to start.
						</div>
					) : (
						<div className='flex flex-col gap-2'>
							{agent.messages.map((m) => (
								<ChatMessageItem key={m.id} message={m} />
							))}
						</div>
					)}
				</ScrollArea>
			) : null}
			<div className='flex items-center gap-2 px-2 py-1.5'>
				<button
					type='button'
					onClick={() => toggleChatLog(webappId)}
					aria-label={expanded ? 'Collapse chat log' : 'Expand chat log'}
					aria-expanded={expanded}
					className='flex h-7 w-7 shrink-0 items-center justify-center rounded-radius-sm text-text-secondary hover:bg-surface-2 hover:text-text-primary'
				>
					<ChevronUp className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
				</button>
				<div className='flex-1'>
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
		</div>
	)
}

export default WebAppChatBottomBar
