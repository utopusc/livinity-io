// Phase 84 V32-MCP — BrowseDialog (modal MCP server discovery).
//
// Layout:
//   ┌───────────────────────────────────────────────────────┐
//   │ [Official] [Smithery (gated)]    [search input ░░░░] │
//   ├──────────┬────────────────────────────────────────────┤
//   │ Cats     │ Server cards grid (75%)                    │
//   │ • All    │ ┌──────┐ ┌──────┐ ┌──────┐                │
//   │ • Search │ │ name │ │ name │ │ name │                │
//   │ • Dev    │ │ desc │ │ desc │ │ desc │                │
//   │ • DB     │ │ inst │ │ inst │ │ inst │                │
//   │   (25%)  │ │ btn  │ │ btn  │ │ btn  │                │
//   │          │ └──────┘ └──────┘ └──────┘                │
//   └──────────┴────────────────────────────────────────────┘
//
// Source toggle pill: Smithery is disabled with tooltip when
// `mcp.smitheryConfigured` returns {configured: false}.
//
// Search debounced 300ms via react-use's useDebounce (same pattern as
// MarketplaceFilters in P86).
//
// Click "Configure" → opens ConfigDialog with the selected server.
// onInstalled callback fires when ConfigDialog reports success.

import {useCallback, useMemo, useState} from 'react'
import {useDebounce} from 'react-use'
import {
	IconLoader2,
	IconPlugConnected,
	IconSearch,
	IconSparkles,
	IconWorld,
	IconAlertTriangle,
} from '@tabler/icons-react'

import {Dialog, DialogContent, DialogHeader, DialogTitle} from '@/shadcn-components/ui/dialog'
import {Input} from '@/shadcn-components/ui/input'
import {Button} from '@/shadcn-components/ui/button'
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@/shadcn-components/ui/tooltip'
import {cn} from '@/shadcn-lib/utils'

import {useMcpSearch, useSmitheryConfigured} from './mcp-api'
import {ConfigDialog} from './ConfigDialog'
import type {McpRegistryServer, McpSource} from './types'

interface BrowseDialogProps {
	open: boolean
	onClose: () => void
	agentId: string
	onInstalled: () => void
}

const ALL_CATEGORY = '__all__'

export function BrowseDialog({open, onClose, agentId, onInstalled}: BrowseDialogProps) {
	const [source, setSource] = useState<McpSource>('official')
	const [searchInput, setSearchInput] = useState('')
	const [debouncedSearch, setDebouncedSearch] = useState('')
	const [activeCategory, setActiveCategory] = useState<string>(ALL_CATEGORY)
	const [selectedServer, setSelectedServer] = useState<McpRegistryServer | null>(null)

	useDebounce(
		() => {
			setDebouncedSearch(searchInput.trim())
		},
		300,
		[searchInput],
	)

	const smitheryConfiguredQuery = useSmitheryConfigured()
	const smitheryAvailable = smitheryConfiguredQuery.data?.configured === true

	const searchQuery = useMcpSearch({
		query: debouncedSearch || undefined,
		source,
		limit: 30,
		enabled: open,
	})

	const allServers = useMemo<McpRegistryServer[]>(() => {
		return (searchQuery.data?.servers ?? []) as McpRegistryServer[]
	}, [searchQuery.data])

	// Derive categories from result tags. Each unique first-tag becomes a
	// sidebar entry; servers with no tags collapse into "Other".
	const categories = useMemo(() => {
		const counts = new Map<string, number>()
		for (const s of allServers) {
			const cat = s.category ?? s.tags?.[0] ?? 'Other'
			counts.set(cat, (counts.get(cat) ?? 0) + 1)
		}
		return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]))
	}, [allServers])

	const filteredServers = useMemo(() => {
		if (activeCategory === ALL_CATEGORY) return allServers
		return allServers.filter((s) => {
			const cat = s.category ?? s.tags?.[0] ?? 'Other'
			return cat === activeCategory
		})
	}, [allServers, activeCategory])

	const handleSelectSource = (next: McpSource) => {
		if (next === 'smithery' && !smitheryAvailable) return
		setSource(next)
		setActiveCategory(ALL_CATEGORY)
	}

	const handleConfigured = useCallback(() => {
		setSelectedServer(null)
		onInstalled()
		onClose()
	}, [onInstalled, onClose])

	const handleClose = (next: boolean) => {
		if (!next) {
			setSelectedServer(null)
			onClose()
		}
	}

	return (
		<>
			<Dialog open={open && !selectedServer} onOpenChange={handleClose}>
				<DialogContent
					className='flex h-[80vh] max-w-5xl flex-col gap-0 overflow-hidden p-0'
					data-testid='mcp-browse-dialog'
				>
					<DialogHeader className='border-b border-liv-border px-6 py-4'>
						<DialogTitle className='flex items-center gap-2 text-liv-foreground'>
							<IconPlugConnected size={18} className='text-liv-primary' />
							Browse MCP Servers
						</DialogTitle>
					</DialogHeader>

					{/* Toolbar: source pills + search */}
					<div className='flex flex-wrap items-center gap-3 border-b border-liv-border bg-liv-card px-6 py-3'>
						<TooltipProvider delayDuration={200}>
							<div className='inline-flex items-center gap-1 rounded-lg bg-liv-muted p-1'>
								<SourcePill
									label='Official'
									icon={<IconWorld size={14} />}
									active={source === 'official'}
									onClick={() => handleSelectSource('official')}
								/>
								<Tooltip>
									<TooltipTrigger asChild>
										<span>
											<SourcePill
												label='Smithery'
												icon={<IconSparkles size={14} />}
												active={source === 'smithery'}
												disabled={!smitheryAvailable}
												onClick={() => handleSelectSource('smithery')}
											/>
										</span>
									</TooltipTrigger>
									{!smitheryAvailable && (
										<TooltipContent>
											Smithery API key required. Add it in Settings &gt; Integrations &gt; Smithery.
										</TooltipContent>
									)}
								</Tooltip>
							</div>
						</TooltipProvider>

						<div className='relative flex-1 min-w-[240px]'>
							<IconSearch
								size={16}
								className='pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-liv-muted-foreground'
							/>
							<Input
								type='search'
								placeholder='Search servers…'
								value={searchInput}
								onChange={(e) => setSearchInput(e.target.value)}
								className='pl-9'
								data-testid='mcp-browse-search'
							/>
						</div>
					</div>

					{/* Body: categorized sidebar + cards grid */}
					<div className='flex min-h-0 flex-1 overflow-hidden'>
						{/* Sidebar (25%) */}
						<aside className='hidden w-1/4 flex-shrink-0 overflow-y-auto border-r border-liv-border bg-liv-card md:block'>
							<nav className='p-3' aria-label='MCP categories'>
								<button
									type='button'
									onClick={() => setActiveCategory(ALL_CATEGORY)}
									className={cn(
										'mb-1 block w-full rounded-md px-3 py-2 text-left text-sm transition-colors',
										activeCategory === ALL_CATEGORY
											? 'bg-liv-primary/10 font-medium text-liv-primary'
											: 'text-liv-muted-foreground hover:bg-liv-muted hover:text-liv-foreground',
									)}
								>
									All
									<span className='float-right text-xs'>{allServers.length}</span>
								</button>
								{categories.map(([cat, count]) => (
									<button
										type='button'
										key={cat}
										onClick={() => setActiveCategory(cat)}
										className={cn(
											'mb-1 block w-full rounded-md px-3 py-2 text-left text-sm transition-colors',
											activeCategory === cat
												? 'bg-liv-primary/10 font-medium text-liv-primary'
												: 'text-liv-muted-foreground hover:bg-liv-muted hover:text-liv-foreground',
										)}
									>
										{cat}
										<span className='float-right text-xs'>{count}</span>
									</button>
								))}
							</nav>
						</aside>

						{/* Grid (75%) */}
						<section
							className='flex-1 overflow-y-auto px-6 py-4'
							data-testid='mcp-browse-results'
						>
							{searchQuery.isLoading ? (
								<LoadingState />
							) : searchQuery.error ? (
								<ErrorState
									message={searchQuery.error.message}
									source={source}
								/>
							) : filteredServers.length === 0 ? (
								<EmptyState query={debouncedSearch} source={source} />
							) : (
								<div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
									{filteredServers.map((server) => (
										<ServerCard
											key={`${server.source}:${server.name}`}
											server={server}
											onConfigure={() => setSelectedServer(server)}
										/>
									))}
								</div>
							)}
						</section>
					</div>
				</DialogContent>
			</Dialog>

			{/* Nested ConfigDialog — opens on top when a server is selected. */}
			{selectedServer && (
				<ConfigDialog
					server={selectedServer}
					agentId={agentId}
					onInstalled={handleConfigured}
					onCancel={() => setSelectedServer(null)}
				/>
			)}
		</>
	)
}

// ─── SourcePill ────────────────────────────────────────────────────────

function SourcePill({
	label,
	icon,
	active,
	disabled,
	onClick,
}: {
	label: string
	icon: React.ReactNode
	active: boolean
	disabled?: boolean
	onClick: () => void
}) {
	return (
		<button
			type='button'
			onClick={onClick}
			disabled={disabled}
			className={cn(
				'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors',
				active
					? 'bg-liv-card text-liv-foreground shadow-sm'
					: 'text-liv-muted-foreground hover:text-liv-foreground',
				disabled && 'cursor-not-allowed opacity-50',
			)}
			data-testid={`mcp-source-${label.toLowerCase()}`}
			data-active={active ? 'true' : 'false'}
		>
			{icon}
			<span>{label}</span>
		</button>
	)
}

// ─── ServerCard ────────────────────────────────────────────────────────

function ServerCard({
	server,
	onConfigure,
}: {
	server: McpRegistryServer
	onConfigure: () => void
}) {
	return (
		<div
			className='flex flex-col gap-3 rounded-2xl border border-liv-border bg-liv-card p-4 shadow-sm transition-all hover:border-liv-primary/40 hover:shadow-md'
			data-testid='mcp-server-card'
		>
			<div className='flex items-start gap-3'>
				<div className='flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-liv-primary/20 to-liv-secondary/20'>
					{server.iconUrl ? (
						<img
							src={server.iconUrl}
							alt=''
							className='h-6 w-6 rounded'
							loading='lazy'
						/>
					) : (
						<IconPlugConnected size={18} className='text-liv-primary' />
					)}
				</div>
				<div className='min-w-0 flex-1'>
					<h3 className='truncate text-sm font-semibold text-liv-foreground'>
						{server.displayName ?? server.name}
					</h3>
					<p className='font-mono text-xs text-liv-muted-foreground truncate'>
						{server.qualifiedName ?? server.name}
					</p>
				</div>
				{typeof server.installCount === 'number' && server.installCount > 0 && (
					<span className='inline-flex items-center rounded-full bg-liv-muted px-2 py-0.5 text-xs text-liv-muted-foreground'>
						{server.installCount.toLocaleString()}
					</span>
				)}
			</div>

			{server.description && (
				<p className='line-clamp-3 text-xs text-liv-muted-foreground'>
					{server.description}
				</p>
			)}

			<div className='mt-auto flex items-center justify-between'>
				<span className='text-xs text-liv-muted-foreground capitalize'>
					{server.source}
				</span>
				<Button size='sm' onClick={onConfigure} data-testid='mcp-server-configure'>
					Configure
				</Button>
			</div>
		</div>
	)
}

// ─── State components ──────────────────────────────────────────────────

function LoadingState() {
	return (
		<div className='flex h-full items-center justify-center text-liv-muted-foreground'>
			<IconLoader2 size={28} className='animate-spin' />
		</div>
	)
}

function ErrorState({message, source}: {message: string; source: McpSource}) {
	return (
		<div className='mx-auto max-w-md rounded-2xl border border-liv-border bg-liv-card p-6 text-center'>
			<IconAlertTriangle size={28} className='mx-auto mb-2 text-liv-destructive' />
			<p className='text-sm font-semibold text-liv-foreground'>Could not load registry</p>
			<p className='mt-1 text-xs text-liv-muted-foreground'>{message}</p>
			{source === 'smithery' && (
				<p className='mt-3 text-xs text-liv-muted-foreground'>
					Tip: ensure your Smithery API key is configured under Settings &gt;
					Integrations &gt; Smithery.
				</p>
			)}
		</div>
	)
}

function EmptyState({query, source}: {query: string; source: McpSource}) {
	return (
		<div className='mx-auto flex h-full max-w-md flex-col items-center justify-center text-center text-liv-muted-foreground'>
			<IconSearch size={28} className='mb-2' />
			<p className='text-sm font-semibold text-liv-foreground'>
				{query ? `No matches for "${query}"` : 'No servers available'}
			</p>
			<p className='mt-1 text-xs'>
				{source === 'smithery'
					? 'Try a different keyword, or switch to Official.'
					: 'Try a different keyword, or switch to Smithery.'}
			</p>
		</div>
	)
}
