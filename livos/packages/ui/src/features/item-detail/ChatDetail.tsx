// Phase 175-03 — ChatDetail thin wrapper.
//
// Per CONTEXT.md: "ChatDetail = direct CC PTY attach (no detail page —
// Chat row click immediately mounts CcTerminal full-pane)". This wrapper
// exists so the dock-window router can dispatch on Item.type === 'chat'
// to a uniform component shape alongside ProjectDetail / AgentDetail.

import {CcTerminal} from '@/features/cc-terminal'

export interface ChatDetailProps {
	item: {id: string; name: string; ccSessionId?: string | null}
}

export function ChatDetail({item}: ChatDetailProps) {
	const sessionId = item.ccSessionId ?? null

	if (sessionId == null) {
		return (
			<div
				data-testid='chat-no-session'
				className='flex h-full flex-col items-center justify-center gap-2 p-4 text-center'
			>
				<h2 className='text-base font-semibold'>{item.name}</h2>
				<p className='text-sm text-text-secondary'>No CC PTY session attached yet.</p>
			</div>
		)
	}

	return <CcTerminal key={sessionId} sessionId={sessionId} />
}
