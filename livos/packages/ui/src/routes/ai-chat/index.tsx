// Phase 167-04 — AI Chat dock route, swapped to CcTerminal (v35.0 D-V35-K).
// Phase 169-04 — Tab nav added (Terminal | Vault Graph).
//
// Before Phase 167: this file was the 750-line legacy SDK chat panel.
// It has been MOVED VERBATIM to `./legacy-ai-chat-panel.tsx` and is
// re-exported from `routes/chat-mobile/index.tsx` for mobile users
// (D-V35-G). Desktop users now see the new xterm.js-based CcTerminal.
//
// Sidebar (session list, lifecycle controls) is deferred to Phase 168.
// For now the desktop view shows a placeholder sidebar + a "Select or
// create a session to start" empty-state right pane.
//
// Phase 169-04: a tab strip ('Terminal' | 'Vault Graph') is rendered above
// the right pane. Terminal tab keeps the existing CcTerminal/EmptyState
// branch (Phase 167 mount untouched). Vault Graph tab mounts the 169-03
// VaultGraph component. Remount-on-switch (v1 simplicity — 169-CONTEXT.md
// L356); a CSS display:none persistence variant can be a follow-up if
// users complain about lost zoom state.

import {useState} from 'react'

import {useIsMobile} from '@/hooks/use-is-mobile'
import {CcTerminal} from '@/features/cc-terminal'
import {VaultGraph} from '@/features/vault-graph'

type Tab = 'terminal' | 'graph'

export default function AiChatRoute() {
	const isMobile = useIsMobile()
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const [activeSessionId, _setActiveSessionId] = useState<string | null>(null)
	const [activeTab, setActiveTab] = useState<Tab>('terminal')
	// Sidebar wiring deferred to Phase 168 — _setActiveSessionId will be
	// wired into the session-list click handler then.

	if (isMobile) {
		return (
			<div className='flex h-full flex-col items-center justify-center gap-4 p-8 text-center'>
				<h2 className='text-xl font-semibold'>AI Chat requires a desktop browser</h2>
				<p className='text-text-secondary'>
					The terminal UI doesn't render well on mobile. Use the simplified chat instead.
				</p>
				<a href='/chat-mobile' className='rounded-lg bg-primary px-4 py-2 text-bg'>
					Open mobile chat
				</a>
			</div>
		)
	}

	return (
		<div className='grid h-full' style={{gridTemplateColumns: '260px 1fr'}}>
			{/* Sidebar — Phase 168 wires it; placeholder for now */}
			<div className='border-r border-border bg-bg-secondary p-4'>
				<p className='text-sm text-text-secondary'>Session sidebar — Phase 168</p>
			</div>
			<div className='flex h-full flex-col overflow-hidden'>
				{/* Phase 169-04 — Terminal / Vault Graph tab nav */}
				<div className='flex border-b border-border bg-bg-secondary'>
					<button
						type='button'
						onClick={() => setActiveTab('terminal')}
						className={`px-4 py-2 text-sm ${activeTab === 'terminal' ? 'border-b-2 border-primary text-primary' : 'text-text-secondary'}`}
					>
						Terminal
					</button>
					<button
						type='button'
						onClick={() => setActiveTab('graph')}
						className={`px-4 py-2 text-sm ${activeTab === 'graph' ? 'border-b-2 border-primary text-primary' : 'text-text-secondary'}`}
					>
						Vault Graph
					</button>
				</div>
				<div className='flex-1 overflow-hidden'>
					{activeTab === 'terminal' ? (
						activeSessionId ? (
							<CcTerminal key={activeSessionId} sessionId={activeSessionId} />
						) : (
							<div className='flex h-full items-center justify-center text-text-secondary'>
								Select or create a session to start
							</div>
						)
					) : (
						<VaultGraph />
					)}
				</div>
			</div>
		</div>
	)
}
