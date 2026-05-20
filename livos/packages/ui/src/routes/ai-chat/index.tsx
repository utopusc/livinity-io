// Phase 175-05 — AI Chat route simplified after Phase 168 deletion.
//
// Pre-175-05: this route mounted <SessionSidebar> from @/features/cc-sessions
// (now deleted) alongside the Terminal | Vault Graph tab nav. The session
// lifecycle (list / create / rename / delete) is now owned by Phase 174's
// SidebarTree + Phase 175's AddItemModal — they live in the global dock
// sidebar, NOT inside this route. The AI Chat route surface degrades
// gracefully to "Vault Graph only" + an empty-state hint for the Terminal
// tab; clicking a Chat item in the global SidebarTree mounts ChatDetail
// (Phase 175-03) inside a dock window, which is the new entry point.
//
// Future: a follow-up plan (likely Phase 181 mobile CC PTY) may either
// delete this route entirely OR repurpose it as the mobile-only entry.

import {useState} from 'react'

import {VaultGraph} from '@/features/vault-graph'
import {useIsMobile} from '@/hooks/use-is-mobile'

type Tab = 'terminal' | 'graph'

export default function AiChatRoute() {
	const isMobile = useIsMobile()
	const [activeTab, setActiveTab] = useState<Tab>('terminal')

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
		<div className='flex h-full flex-col overflow-hidden'>
			{/* Tab nav */}
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
					<div className='flex h-full items-center justify-center p-8 text-center text-text-secondary'>
						<div className='flex flex-col gap-2'>
							<p>Open a Chat from the sidebar to attach a terminal.</p>
							<p className='text-xs'>
								Phase 175 — terminals now live in the dock window manager.
							</p>
						</div>
					</div>
				) : (
					<VaultGraph />
				)}
			</div>
		</div>
	)
}
