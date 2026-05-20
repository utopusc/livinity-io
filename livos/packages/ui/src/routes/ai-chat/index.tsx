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

import {useCallback, useEffect, useState} from 'react'

import {Menu, Plus} from 'lucide-react'

import {trpcReact} from '@/trpc/trpc'
import {VaultGraph} from '@/features/vault-graph'
import {useIsMobile} from '@/hooks/use-is-mobile'
import {useCurrentUser} from '@/hooks/use-current-user'
import {LivWelcomeTerminal} from '@/features/liv-welcome/LivWelcomeTerminal'
import {SidebarTree} from '@/features/sidebar-tree'
import {ChatDetail, ProjectDetail, AgentDetail, AddItemModal} from '@/features/item-detail'
import {McpServerList, type McpServerConfig, type McpServerStatus} from '@/components/mcp/McpServerList'
import {McpServerDetail} from '@/components/mcp/McpServerDetail'
import {FeaturedMcpInstaller} from '@/components/mcp/FeaturedMcpInstaller'
import {type FeaturedMcp} from '@/components/mcp/featured-mcps'

type Tab = 'terminal' | 'graph' | 'mcp'

export default function AiChatRoute() {
	const isMobile = useIsMobile()
	const [activeTab, setActiveTab] = useState<Tab>('terminal')

	// Phase 176-04 — vault.items.list query for Liv empty-state detection.
	// staleTime: 10_000 prevents tight refetch loop; loading skeleton prevents
	// CcTerminal mount on undefined userId (T-176-04-03).
	const itemList = trpcReact.vault.items.list.useQuery(undefined, {staleTime: 10_000})
	const {userId} = useCurrentUser()
	const hasItems = (itemList.data?.items?.length ?? 0) > 0

	// Phase 185-02 — item selection state for right-pane routing.
	const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
	const handleItemSelect = (id: string | null) => setSelectedItemId(id)
	const items = itemList.data?.items ?? []
	const selectedItem = selectedItemId
		? items.find((it: {id: string}) => it.id === selectedItemId) ?? null
		: null

	// Phase 185-03 — sidebar open state: collapsed on mobile, visible on desktop.
	const [sidebarOpen, setSidebarOpen] = useState(!isMobile)
	const [addModalOpen, setAddModalOpen] = useState(false)

	// Phase 186-01 — MCP tab state (mirrors routes/settings/mcp-servers.tsx pattern).
	const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([])
	const [mcpStatuses, setMcpStatuses] = useState<Record<string, McpServerStatus>>({})
	const [mcpLoading, setMcpLoading] = useState(false)
	const [mcpSelectedName, setMcpSelectedName] = useState<string | null>(null)

	const fetchMcpServers = useCallback(async () => {
		if (activeTab !== 'mcp') return
		try {
			setMcpLoading(true)
			const res = await fetch('/api/mcp/servers', {credentials: 'include'})
			if (res.ok) {
				const data = (await res.json()) as {
					servers: McpServerConfig[]
					statuses: Record<string, McpServerStatus>
				}
				setMcpServers(data.servers ?? [])
				setMcpStatuses(data.statuses ?? {})
			}
		} catch {
			/* silent */
		} finally {
			setMcpLoading(false)
		}
	}, [activeTab])

	useEffect(() => {
		if (activeTab !== 'mcp') return
		fetchMcpServers()
		const interval = setInterval(fetchMcpServers, 15_000)
		return () => clearInterval(interval)
	}, [activeTab, fetchMcpServers])

	const mcpServerItems = mcpServers.map((s) => ({name: s.name, config: s, status: mcpStatuses[s.name]}))
	const mcpSelectedServer = mcpSelectedName
		? (mcpServerItems.find((s) => s.name === mcpSelectedName) ?? null)
		: null
	const mcpInstalledNames = new Set(mcpServers.map((s) => s.name))

	const handleInstallFeaturedMcp = useCallback(
		async (mcp: FeaturedMcp) => {
			const body: Record<string, unknown> = {
				name: mcp.name,
				transport: mcp.transport,
				description: mcp.description,
			}
			if (mcp.transport === 'stdio') {
				body.command = mcp.customCommand ?? 'npx'
				body.args = mcp.customArgs ?? (mcp.npmPackage ? ['-y', mcp.npmPackage] : [])
			} else {
				body.url = mcp.remoteUrl ?? ''
			}
			try {
				await fetch('/api/mcp/servers', {
					method: 'POST',
					credentials: 'include',
					headers: {'Content-Type': 'application/json'},
					body: JSON.stringify(body),
				})
				await fetchMcpServers()
			} catch {
				/* silent */
			}
		},
		[fetchMcpServers],
	)

	const handleMcpToggle = async (name: string, enabled: boolean) => {
		try {
			await fetch(`/api/mcp/servers/${encodeURIComponent(name)}`, {
				method: 'PUT',
				credentials: 'include',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({enabled}),
			})
			await fetchMcpServers()
		} catch {
			/* silent */
		}
	}

	const handleMcpRemove = async (name: string) => {
		try {
			await fetch(`/api/mcp/servers/${encodeURIComponent(name)}`, {method: 'DELETE', credentials: 'include'})
			setMcpSelectedName(null)
			await fetchMcpServers()
		} catch {
			/* silent */
		}
	}


	// Right-pane terminal tab content — routes based on selectedItem type (185-02).
	const terminalContent = selectedItem ? (
		(selectedItem as {type: string}).type === 'chat' ? (
			<ChatDetail item={selectedItem as Parameters<typeof ChatDetail>[0]['item']} />
		) : (selectedItem as {type: string}).type === 'project' ? (
			<ProjectDetail item={selectedItem as Parameters<typeof ProjectDetail>[0]['item']} />
		) : (selectedItem as {type: string}).type === 'agent' ? (
			<AgentDetail item={selectedItem as Parameters<typeof AgentDetail>[0]['item']} />
		) : null
	) : hasItems ? (
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
				{/* Right pane — tab nav + content (Phase 185-01). */}
				<div
					data-testid='ai-chat-right-pane'
					className='flex flex-1 flex-col overflow-hidden'
				>
					{/* Tab nav */}
					<div className='flex border-b border-border bg-bg-secondary'>
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
						<button
							type='button'
							onClick={() => setActiveTab('mcp')}
							className={`px-4 py-2 text-sm ${activeTab === 'mcp' ? 'border-b-2 border-primary text-primary' : 'text-text-secondary'}`}
						>
							MCP Servers
						</button>
					</div>
					<div className='flex-1 overflow-hidden'>
						{activeTab === 'terminal' ? (
							terminalContent
						) : activeTab === 'graph' ? (
							<VaultGraph />
						) : (
							<div data-testid='mcp-tab-content' className='flex h-full flex-col overflow-hidden'>
								{/* Featured installer — shown when no server selected */}
								{!mcpSelectedName && (
									<div className='shrink-0 border-b border-border p-3 overflow-y-auto'>
										<FeaturedMcpInstaller
											installedNames={mcpInstalledNames}
											onInstall={handleInstallFeaturedMcp}
										/>
									</div>
								)}
								<div className='flex flex-1 overflow-hidden'>
									<div className='w-64 shrink-0 border-r border-border'>
										<McpServerList
											servers={mcpServerItems}
											selectedName={mcpSelectedName}
											onSelect={setMcpSelectedName}
											onToggleEnabled={handleMcpToggle}
											onRemove={handleMcpRemove}
											isLoading={mcpLoading}
										/>
									</div>
									<div className='flex-1 min-w-0'>
										<McpServerDetail
											server={mcpSelectedServer}
											onClose={() => setMcpSelectedName(null)}
											onToggleEnabled={handleMcpToggle}
										/>
									</div>
								</div>
							</div>
						)}
					</div>
				</div>
			</div>
			{/* AddItemModal — Radix Dialog portals to document.body (Phase 185-03) */}
			<AddItemModal open={addModalOpen} onClose={() => setAddModalOpen(false)} />
		</>
	)
}
