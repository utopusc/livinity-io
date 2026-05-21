// Phase 175-05 — AI Chat route simplified after Phase 168 deletion.
//
// Pre-175-05: this route mounted <SessionSidebar> from @/features/cc-sessions
// (now deleted) alongside the Terminal | Vault Graph tab nav. The session
// lifecycle (list / create / rename / delete) is now owned by Phase 174's
// SidebarTree + Phase 175's AddItemModal.
//
// Phase 176-04 — when vault has no Items, show LivWelcomeTerminal (Liv's
// auto-spawned tmux CC session) instead of the plain empty-state hint.
// The "Open a Chat" hint is preserved behind a hasItems=true guard so
// existing Chat-flow remains discoverable once the operator creates Items.
//
// Phase 185-01 — SidebarTree now mounts inside this route as the left pane.
// Split layout: fixed 280px left pane (SidebarTree + AddItemModal trigger) +
// flex-1 right pane (Terminal | Vault Graph tab nav + content).
//
// Phase 185-02 — selectedItemId state wires SidebarTree onSelect to right-pane
// item routing: Chat → ChatDetail, Project → ProjectDetail, Agent → AgentDetail.
//
// Phase 185-03 — Mobile collapse: sidebarOpen defaults to false on mobile
// (true on desktop). Hamburger toggle in the tab-nav row shows/hides the left
// pane on narrow viewports. AddItemModal "+" button at top of left pane.
//
// Note: the mobile early-return ("AI Chat requires a desktop browser") from
// Phase 175-05 was replaced in Phase 185-03. The /chat-mobile link is preserved
// in the /chat-mobile route itself; this route now always renders the split
// layout (sidebar collapsed by default on mobile).
//
// Phase 190-03 — Replace static Terminal|MCP tab bar with TerminalTabStrip.
//   - MCP Server tab REMOVED (MCP component files stay on disk for Phase 191)
//   - Sidebar agent/chat item selection opens/focuses a tab
//   - Claude icon → new ad-hoc claude tab; Terminal icon → new bare bash tab
//   - Tab close removes tab from state and kills tmux session
//   - Projects still route via selectedItem (no tab)
//
// Phase 190-04 — localStorage tab persistence (additive, 300ms debounce).

import {useCallback, useEffect, useState} from 'react'

import {Menu, Plus} from 'lucide-react'

import {trpcReact} from '@/trpc/trpc'
import {useIsMobile} from '@/hooks/use-is-mobile'
import {useCurrentUser} from '@/hooks/use-current-user'
import {LivWelcomeTerminal} from '@/features/liv-welcome/LivWelcomeTerminal'
import {SidebarTree} from '@/features/sidebar-tree'
import {ChatDetail, ProjectDetail, AddItemModal} from '@/features/item-detail'
// Phase 189-01 — AgentDetail replaced by AgentTerminalPane in the right-pane switch.
// AgentDetail.tsx stays on disk (Phase 191 may revive it as a settings panel).
import {AgentTerminalPane} from '@/features/agent-terminal/AgentTerminalPane'
import {TerminalTabStrip} from '@/features/terminal-tabs/TerminalTabStrip'
import {BareTerminal} from '@/features/cc-terminal/BareTerminal'
import {CcTerminal} from '@/features/cc-terminal/CcTerminal'
import type {TerminalTabInfo} from '@/features/terminal-tabs/types'

// Phase 190-04 — user-scoped localStorage key for tab persistence.
const LS_TABS_KEY = (uid: string) => `liv:ai-chat:tabs:${uid}`

export default function AiChatRoute() {
	const isMobile = useIsMobile()

	// Phase 176-04 — vault.items.list query for Liv empty-state detection.
	// staleTime: 10_000 prevents tight refetch loop; loading skeleton prevents
	// CcTerminal mount on undefined userId (T-176-04-03).
	const itemList = trpcReact.vault.items.list.useQuery(undefined, {staleTime: 10_000})
	const {userId} = useCurrentUser()
	const hasItems = (itemList.data?.items?.length ?? 0) > 0

	// Phase 185-02 — item selection state for right-pane routing.
	const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
	const items = itemList.data?.items ?? []
	const selectedItem = selectedItemId
		? items.find((it: {id: string}) => it.id === selectedItemId) ?? null
		: null

	// Phase 185-03 — sidebar open state: collapsed on mobile, visible on desktop.
	const [sidebarOpen, setSidebarOpen] = useState(!isMobile)
	const [addModalOpen, setAddModalOpen] = useState(false)

	// Phase 190-03 — Dynamic tab state replacing the old static Tab union.
	const [tabs, setTabs] = useState<TerminalTabInfo[]>([])
	const [activeTabId, setActiveTabId] = useState<string | null>(null)

	// Derive the currently active tab object.
	const activeTab = tabs.find((t) => t.id === activeTabId) ?? null

	// Phase 190-04 — restore tabs from localStorage on mount (additive).
	useEffect(() => {
		if (!userId) return
		try {
			const raw = localStorage.getItem(LS_TABS_KEY(userId))
			if (!raw) return
			const saved = JSON.parse(raw) as TerminalTabInfo[]
			if (Array.isArray(saved) && saved.length > 0) {
				setTabs(saved)
				setActiveTabId(saved[0].id)
			}
		} catch {
			/* invalid JSON — start empty */
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [userId]) // userId stable after first auth resolve; run once on mount

	// Phase 190-04 — persist tabs to localStorage (300ms debounce).
	useEffect(() => {
		if (!userId) return
		const id = setTimeout(() => {
			try {
				localStorage.setItem(LS_TABS_KEY(userId), JSON.stringify(tabs))
			} catch {
				/* storage full or sandboxed — silent */
			}
		}, 300)
		return () => clearTimeout(id)
	}, [tabs, userId])

	// ── Tab helpers ────────────────────────────────────────────────────

	function deriveTabId(item: {id: string; type: string}): string {
		if (item.type === 'agent') return `liv-agent-${item.id}`
		if (item.type === 'chat') return `liv-chat-${item.id}`
		return `liv-proj-${item.id}` // projects get no tab — fallback only
	}

	function deriveTabLabel(item: {type: string; name?: string; title?: string}): string {
		return (item as any).name ?? (item as any).title ?? item.type
	}

	// Sidebar selection → open or focus tab (agent/chat), or use selectedItem routing (project).
	const handleItemSelect = useCallback(
		(id: string | null) => {
			setSelectedItemId(id)
			if (!id) {
				setActiveTabId(null)
				return
			}
			const item = items.find((it: any) => it.id === id)
			if (!item) return
			// Projects: keep selectedItem routing (no tab)
			if ((item as any).type === 'project') {
				setActiveTabId(null)
				return
			}
			const tabId = deriveTabId(item as any)
			const existing = tabs.find((t) => t.id === tabId)
			if (existing) {
				setActiveTabId(tabId)
			} else {
				const newTab: TerminalTabInfo = {
					id: tabId,
					label: deriveTabLabel(item as any),
					type: (item as any).type as 'agent' | 'chat',
					sessionId: tabId,
				}
				setTabs((prev) => [...prev, newTab])
				setActiveTabId(tabId)
			}
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[items, tabs],
	)

	// Claude icon → new ad-hoc claude tab.
	const handleAddClaude = useCallback(() => {
		const n = tabs.filter((t) => t.type === 'claude').length + 1
		const id = `liv-adhoc-claude-${crypto.randomUUID()}`
		const newTab: TerminalTabInfo = {id, label: `Claude ${n}`, type: 'claude', sessionId: id}
		setTabs((prev) => [...prev, newTab])
		setActiveTabId(id)
	}, [tabs])

	// Terminal icon → new bare bash tab.
	const handleAddBareTerminal = useCallback(() => {
		const n = tabs.filter((t) => t.type === 'terminal').length + 1
		const id = `liv-bare-${crypto.randomUUID()}`
		const newTab: TerminalTabInfo = {id, label: `Terminal ${n}`, type: 'terminal', sessionId: id}
		setTabs((prev) => [...prev, newTab])
		setActiveTabId(id)
	}, [tabs])

	// Tab close → remove from state; shift focus to previous tab if it was active.
	const handleCloseTab = useCallback(
		(id: string) => {
			setTabs((prev) => {
				const idx = prev.findIndex((t) => t.id === id)
				const next = prev.filter((t) => t.id !== id)
				if (activeTabId === id) {
					const prevTab = idx > 0 ? next[idx - 1] : next[0]
					setActiveTabId(prevTab?.id ?? null)
				}
				return next
			})
		},
		[activeTabId],
	)

	// ── Right-pane content switch ────────────────────────────────────

	let rightPaneContent: React.ReactNode = null

	if (activeTab?.type === 'agent') {
		const agentItem = items.find((it: any) => it.id === activeTab.id.replace('liv-agent-', ''))
		if (agentItem) {
			rightPaneContent = (
				<AgentTerminalPane
					agentItem={agentItem as {id: string; name: string; type: string}}
					userId={userId ?? ''}
				/>
			)
		}
	} else if (activeTab?.type === 'terminal') {
		rightPaneContent = <BareTerminal sessionId={activeTab.sessionId} />
	} else if (activeTab?.type === 'claude') {
		rightPaneContent = <CcTerminal sessionId={activeTab.sessionId} />
	} else if (activeTab?.type === 'chat') {
		const chatItem = items.find((it: any) => it.id === activeTab.id.replace('liv-chat-', ''))
		if (chatItem) {
			rightPaneContent = (
				<ChatDetail item={chatItem as Parameters<typeof ChatDetail>[0]['item']} />
			)
		}
	} else if (!activeTab && selectedItem && (selectedItem as any).type === 'project') {
		rightPaneContent = (
			<ProjectDetail item={selectedItem as Parameters<typeof ProjectDetail>[0]['item']} />
		)
	} else if (!activeTab && !selectedItem) {
		rightPaneContent = hasItems ? (
			<div className='flex h-full items-center justify-center p-8 text-center text-text-secondary'>
				<div className='flex flex-col gap-2'>
					<p>Open a Chat from the sidebar to attach a terminal.</p>
					<p className='text-xs'>
						Phase 175 — terminals now live in the dock window manager.
					</p>
				</div>
			</div>
		) : (
			<LivWelcomeTerminal userId={userId ?? ''} loading={itemList.isLoading} />
		)
	}

	return (
		<>
			<div className='flex h-full overflow-hidden'>
				{/* Left pane — SidebarTree (Phase 185-01). Width fixed at 280px. */}
				{sidebarOpen && (
					<div
						data-testid='ai-chat-sidebar'
						className='flex w-[280px] shrink-0 flex-col border-r border-border'
					>
						{/* "+ Add" header row (Phase 185-03) */}
						<div className='flex items-center justify-between border-b border-border px-3 py-2'>
							<span className='text-xs font-medium text-text-secondary'>Workspace</span>
							<button
								type='button'
								data-testid='add-item-btn'
								aria-label='Add item'
								onClick={() => setAddModalOpen(true)}
								className='rounded p-1 text-text-secondary hover:bg-surface-2'
							>
								<Plus size={16} />
							</button>
						</div>
						<SidebarTree onSelect={handleItemSelect} />
					</div>
				)}
				{/* Right pane — tab strip + content (Phase 185-01 + 190-03). */}
				<div
					data-testid='ai-chat-right-pane'
					className='flex flex-1 flex-col overflow-hidden'
				>
					{/* Tab nav row: hamburger (mobile) + TerminalTabStrip */}
					<div className='flex items-center border-b border-border'>
						{/* Hamburger toggle — mobile only (Phase 185-03) */}
						{isMobile && (
							<button
								type='button'
								data-testid='sidebar-toggle-btn'
								aria-label='Toggle sidebar'
								onClick={() => setSidebarOpen((prev) => !prev)}
								className='px-3 py-2 text-text-secondary'
							>
								<Menu size={18} />
							</button>
						)}
						{/* Phase 190-03 — TerminalTabStrip replaces the old static tab buttons */}
						<div className='flex-1 min-w-0'>
							<TerminalTabStrip
								data-testid='terminal-tab-strip'
								tabs={tabs}
								activeId={activeTabId}
								onSelect={setActiveTabId}
								onClose={handleCloseTab}
								onAddClaude={handleAddClaude}
								onAddBareTerminal={handleAddBareTerminal}
							/>
						</div>
					</div>
					<div className='flex-1 overflow-hidden'>
						{rightPaneContent}
					</div>
				</div>
			</div>
			{/* AddItemModal — Radix Dialog portals to document.body (Phase 185-03) */}
			<AddItemModal open={addModalOpen} onClose={() => setAddModalOpen(false)} />
		</>
	)
}
