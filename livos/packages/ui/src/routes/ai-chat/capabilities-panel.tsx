import {useState, useEffect} from 'react'
import {IconCode, IconPlug, IconWebhook, IconRobot, IconPuzzle, IconArrowLeft, IconLoader2, IconSearch, IconFileText, IconChartBar, IconTrash} from '@tabler/icons-react'
import {formatDistanceToNow} from 'date-fns'
import {trpcReact} from '@/trpc/trpc'
import {cn} from '@/shadcn-lib/utils'

// ── Types ──────────────────────────────────────────────────────

type CapabilityTab = 'skill' | 'mcp' | 'hook' | 'agent' | 'prompts' | 'analytics'
type PanelView = {mode: 'list'} | {mode: 'detail'; capabilityId: string} | {mode: 'prompts'} | {mode: 'analytics'}

interface CapabilityManifest {
	id: string
	type: string
	name: string
	description: string
	semantic_tags: string[]
	triggers: string[]
	provides_tools: string[]
	requires: string[]
	conflicts: string[]
	context_cost: number
	tier: string
	source: string
	status: string
	last_error?: string
	last_used_at: number
	registered_at: number
	metadata?: Record<string, unknown>
}

// ── Constants ──────────────────────────────────────────────────

const TABS: {key: CapabilityTab; label: string; icon: typeof IconCode}[] = [
	{key: 'skill', label: 'Skills', icon: IconCode},
	{key: 'mcp', label: 'MCPs', icon: IconPlug},
	{key: 'hook', label: 'Hooks', icon: IconWebhook},
	{key: 'agent', label: 'Agents', icon: IconRobot},
	{key: 'prompts', label: 'Prompts', icon: IconFileText},
	{key: 'analytics', label: 'Analytics', icon: IconChartBar},
]

const TAB_ICON_COLORS: Record<CapabilityTab, string> = {
	skill: 'text-cyan-400',
	mcp: 'text-green-400',
	hook: 'text-amber-400',
	agent: 'text-blue-400',
	prompts: 'text-orange-400',
	analytics: 'text-pink-400',
}

const EMPTY_STATES: Record<CapabilityTab, {title: string; subtitle: string}> = {
	skill: {title: 'No skills registered', subtitle: 'Skills will appear here when installed'},
	mcp: {title: 'No MCP servers registered', subtitle: 'MCP servers will appear here when configured'},
	hook: {title: 'No hooks registered', subtitle: 'Hooks will be available after Phase 34'},
	agent: {title: 'No agents registered', subtitle: 'Create agents from the Agents page or let AI create them'},
	prompts: {title: 'No prompts yet', subtitle: 'Create custom prompts or use built-in templates'},
	analytics: {title: 'No capability data yet', subtitle: 'Analytics will populate as capabilities are used'},
}

function getTabIcon(type: string) {
	const tab = TABS.find((t) => t.key === type)
	return tab ? tab.icon : IconCode
}

// ── StatusDot ──────────────────────────────────────────────────

function StatusDot({status}: {status: string}) {
	const colorClass =
		status === 'active'
			? 'bg-green-500'
			: status === 'inactive'
				? 'bg-yellow-500'
				: 'bg-red-500'

	return <span className={cn('inline-block h-2 w-2 rounded-full', colorClass)} />
}

// ── CapabilityRow ──────────────────────────────────────────────

function CapabilityRow({capability, onClick}: {capability: CapabilityManifest; onClick: () => void}) {
	const Icon = getTabIcon(capability.type)
	const iconColor = TAB_ICON_COLORS[capability.type as CapabilityTab] || 'text-text-secondary'
	const toolCount = capability.provides_tools.length
	const successRate = capability.metadata?.success_rate
	const hasSuccessRate = typeof successRate === 'number'

	return (
		<button
			onClick={onClick}
			className='flex w-full items-start gap-2.5 rounded-radius-sm border border-border-subtle bg-surface-base p-2.5 text-left transition-all hover:border-border-default hover:bg-surface-1'
		>
			<Icon size={16} className={cn('mt-0.5 flex-shrink-0', iconColor)} />
			<div className='min-w-0 flex-1'>
				<div className='flex items-center gap-1.5'>
					<span className='truncate text-body-sm font-medium text-text-primary'>
						{capability.name}
					</span>
				</div>
				<div className='mt-0.5 flex items-center gap-1'>
					<span className='rounded-full bg-surface-2 px-1.5 text-[10px] font-medium text-text-tertiary'>
						{capability.tier}
					</span>
					<span className='text-[10px] text-text-tertiary'>
						{toolCount} tool{toolCount !== 1 ? 's' : ''} {'\u00B7'} {hasSuccessRate ? `${successRate}%` : '\u2014'}
					</span>
				</div>
				{capability.last_used_at > 0 && (
					<span className='mt-0.5 block text-[10px] text-text-tertiary'>
						{formatDistanceToNow(capability.last_used_at, {addSuffix: true})}
					</span>
				)}
			</div>
			<StatusDot status={capability.status} />
		</button>
	)
}

// ── CapabilityDetail ───────────────────────────────────────────

function CapabilityDetail({capabilityId, onBack}: {capabilityId: string; onBack: () => void}) {
	const capQuery = trpcReact.ai.getCapability.useQuery({id: capabilityId})

	if (capQuery.isLoading) {
		return (
			<div className='flex h-full items-center justify-center'>
				<IconLoader2 size={24} className='animate-spin text-text-tertiary' />
			</div>
		)
	}

	const cap = capQuery.data as CapabilityManifest | undefined
	if (!cap) {
		return (
			<div className='flex h-full flex-col items-center justify-center'>
				<p className='text-body-sm text-text-tertiary'>Capability not found</p>
				<button
					onClick={onBack}
					className='mt-2 text-caption text-brand hover:underline'
				>
					Back to list
				</button>
			</div>
		)
	}

	const successRate = cap.metadata?.success_rate
	const hasSuccessRate = typeof successRate === 'number'

	return (
		<div className='flex h-full flex-col'>
			{/* Header */}
			<div className='flex flex-shrink-0 items-center gap-3 border-b border-border-default px-4 py-3'>
				<button
					onClick={onBack}
					className='rounded-radius-sm p-1 text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary'
				>
					<IconArrowLeft size={16} />
				</button>
				<div className='min-w-0 flex-1'>
					<h3 className='truncate text-body font-semibold text-text-primary'>
						{cap.name}
					</h3>
				</div>
			</div>

			{/* Content */}
			<div className='flex-1 overflow-y-auto p-3 space-y-4'>
				{/* Status + Meta row */}
				<div className='flex flex-wrap items-center gap-2'>
					<div className='flex items-center gap-1.5'>
						<StatusDot status={cap.status} />
						<span className='text-caption text-text-secondary capitalize'>{cap.status}</span>
					</div>
					<span className='rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-text-tertiary'>
						{cap.tier}
					</span>
					<span className='rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-text-tertiary'>
						{cap.source}
					</span>
					<span className='text-[10px] text-text-tertiary'>
						~{cap.context_cost} tokens
					</span>
					<span className='text-[10px] text-text-tertiary'>
						Success rate: {hasSuccessRate ? `${successRate}%` : '\u2014'}
					</span>
				</div>

				{/* Description */}
				{cap.description && (
					<p className='text-caption text-text-secondary'>{cap.description}</p>
				)}

				{/* Provided Tools */}
				{cap.provides_tools.length > 0 && (
					<div>
						<h4 className='mb-1.5 text-caption-sm font-semibold uppercase tracking-wide text-text-tertiary'>
							Tools
						</h4>
						<div className='flex flex-wrap gap-1'>
							{cap.provides_tools.map((tool) => (
								<span
									key={tool}
									className='rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-text-secondary'
								>
									{tool}
								</span>
							))}
						</div>
					</div>
				)}

				{/* Semantic Tags */}
				{cap.semantic_tags.length > 0 && (
					<div>
						<h4 className='mb-1.5 text-caption-sm font-semibold uppercase tracking-wide text-text-tertiary'>
							Tags
						</h4>
						<div className='flex flex-wrap gap-1'>
							{cap.semantic_tags.map((tag) => (
								<span
									key={tag}
									className='rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-400'
								>
									{tag}
								</span>
							))}
						</div>
					</div>
				)}

				{/* Dependencies */}
				{cap.requires.length > 0 && (
					<div>
						<h4 className='mb-1.5 text-caption-sm font-semibold uppercase tracking-wide text-text-tertiary'>
							Requires
						</h4>
						<ul className='space-y-1'>
							{cap.requires.map((dep) => (
								<li key={dep} className='text-caption text-text-secondary'>{dep}</li>
							))}
						</ul>
					</div>
				)}

				{/* Conflicts */}
				{cap.conflicts.length > 0 && (
					<div>
						<h4 className='mb-1.5 text-caption-sm font-semibold uppercase tracking-wide text-text-tertiary'>
							Conflicts
						</h4>
						<ul className='space-y-1'>
							{cap.conflicts.map((conflict) => (
								<li key={conflict} className='text-caption text-text-secondary'>{conflict}</li>
							))}
						</ul>
					</div>
				)}

				{/* Metadata */}
				<div>
					<h4 className='mb-1.5 text-caption-sm font-semibold uppercase tracking-wide text-text-tertiary'>
						Metadata
					</h4>
					<div className='space-y-1.5 rounded-radius-sm bg-surface-1 p-3'>
						<div className='flex items-center justify-between'>
							<span className='text-caption-sm text-text-tertiary'>Registered</span>
							<span className='text-caption-sm text-text-secondary'>
								{cap.registered_at > 0
									? formatDistanceToNow(cap.registered_at, {addSuffix: true})
									: 'Unknown'}
							</span>
						</div>
						<div className='flex items-center justify-between'>
							<span className='text-caption-sm text-text-tertiary'>Last Used</span>
							<span className='text-caption-sm text-text-secondary'>
								{cap.last_used_at > 0
									? formatDistanceToNow(cap.last_used_at, {addSuffix: true})
									: 'Never'}
							</span>
						</div>
						<div className='flex items-center justify-between'>
							<span className='text-caption-sm text-text-tertiary'>Success Rate</span>
							<span className='text-caption-sm text-text-secondary'>
								{hasSuccessRate ? `${successRate}%` : '\u2014'}
							</span>
						</div>
						<div className='flex items-center justify-between'>
							<span className='text-caption-sm text-text-tertiary'>ID</span>
							<span className='font-mono text-caption-sm text-text-secondary'>{cap.id}</span>
						</div>
						{cap.last_error && (
							<div className='flex items-center justify-between'>
								<span className='text-caption-sm text-text-tertiary'>Last Error</span>
								<span className='text-caption-sm text-red-400'>{cap.last_error}</span>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}

// ── CapabilityList ─────────────────────────────────────────────

function CapabilityList({activeTab, searchQuery, onSelect}: {activeTab: CapabilityTab; searchQuery: string; onSelect: (id: string) => void}) {
	const isSearching = searchQuery.trim().length > 0

	const listQuery = trpcReact.ai.listCapabilities.useQuery(
		{type: activeTab},
		{refetchInterval: 5_000, enabled: !isSearching},
	)

	const searchQueryResult = trpcReact.ai.searchCapabilities.useQuery(
		{q: searchQuery.trim(), type: activeTab},
		{refetchInterval: 5_000, enabled: isSearching},
	)

	const isLoading = isSearching ? searchQueryResult.isLoading : listQuery.isLoading
	const capabilities: CapabilityManifest[] = isSearching
		? ((searchQueryResult.data as any)?.results ?? [])
		: ((listQuery.data as any)?.capabilities ?? [])

	if (isLoading) {
		return (
			<div className='flex h-32 items-center justify-center'>
				<IconLoader2 size={24} className='animate-spin text-text-tertiary' />
			</div>
		)
	}

	if (capabilities.length === 0) {
		const empty = EMPTY_STATES[activeTab]
		const Icon = TABS.find((t) => t.key === activeTab)?.icon ?? IconCode
		return (
			<div className='flex flex-col items-center justify-center px-4 py-12 text-center'>
				<Icon size={40} className='mb-3 text-text-tertiary' />
				<p className='text-body-sm font-medium text-text-secondary'>{empty.title}</p>
				<p className='mt-1 text-caption-sm text-text-tertiary'>{empty.subtitle}</p>
			</div>
		)
	}

	return (
		<div className='space-y-1.5'>
			{capabilities.map((cap) => (
				<CapabilityRow
					key={cap.id}
					capability={cap}
					onClick={() => onSelect(cap.id)}
				/>
			))}
		</div>
	)
}

// ── PromptsView ───────────────────────────────────────────────

function PromptsView() {
	const [showCreate, setShowCreate] = useState(false)
	const [newName, setNewName] = useState('')
	const [newDesc, setNewDesc] = useState('')
	const [newPrompt, setNewPrompt] = useState('')

	const promptsQuery = trpcReact.ai.listPrompts.useQuery(undefined, {refetchInterval: 10_000})
	const saveMutation = trpcReact.ai.savePrompt.useMutation({
		onSuccess: () => {
			promptsQuery.refetch()
			setShowCreate(false)
			setNewName('')
			setNewDesc('')
			setNewPrompt('')
		},
	})
	const deleteMutation = trpcReact.ai.deletePrompt.useMutation({onSuccess: () => promptsQuery.refetch()})

	const prompts = (promptsQuery.data as any)?.prompts ?? []

	if (promptsQuery.isLoading) {
		return (
			<div className='flex h-32 items-center justify-center'>
				<IconLoader2 size={24} className='animate-spin text-text-tertiary' />
			</div>
		)
	}

	return (
		<div className='p-3 space-y-3'>
			{/* Create button */}
			<button
				onClick={() => setShowCreate(!showCreate)}
				className='rounded-radius-sm border border-border-default bg-surface-1 px-3 py-1.5 text-caption font-medium text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary'
			>
				{showCreate ? 'Cancel' : '+ New Prompt'}
			</button>

			{/* Create form */}
			{showCreate && (
				<div className='space-y-2 rounded-radius-sm border border-border-default bg-surface-1 p-3'>
					<input
						type='text'
						value={newName}
						onChange={(e) => setNewName(e.target.value)}
						placeholder='Prompt name'
						className='w-full rounded-radius-sm border border-border-default bg-surface-base px-3 py-1.5 text-caption text-text-primary outline-none placeholder:text-text-tertiary focus:border-brand'
					/>
					<input
						type='text'
						value={newDesc}
						onChange={(e) => setNewDesc(e.target.value)}
						placeholder='Description (optional)'
						className='w-full rounded-radius-sm border border-border-default bg-surface-base px-3 py-1.5 text-caption text-text-primary outline-none placeholder:text-text-tertiary focus:border-brand'
					/>
					<textarea
						value={newPrompt}
						onChange={(e) => setNewPrompt(e.target.value)}
						placeholder='System prompt text...'
						className='min-h-[100px] w-full rounded-radius-sm border border-border-default bg-surface-base px-3 py-1.5 text-caption font-mono text-text-primary outline-none placeholder:text-text-tertiary focus:border-brand resize-y'
					/>
					<button
						onClick={() => saveMutation.mutate({name: newName, description: newDesc, prompt: newPrompt})}
						disabled={!newName.trim() || !newPrompt.trim() || saveMutation.isLoading}
						className='rounded-radius-sm bg-brand px-3 py-1.5 text-caption font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50'
					>
						Save Prompt
					</button>
				</div>
			)}

			{/* Prompt list */}
			{prompts.length === 0 ? (
				<div className='flex flex-col items-center justify-center px-4 py-12 text-center'>
					<IconFileText size={40} className='mb-3 text-text-tertiary' />
					<p className='text-body-sm font-medium text-text-secondary'>No prompts yet</p>
					<p className='mt-1 text-caption-sm text-text-tertiary'>Create custom prompts or use built-in templates</p>
				</div>
			) : (
				prompts.map((p: any) => (
					<div key={p.name} className='rounded-radius-sm border border-border-subtle bg-surface-base p-2.5'>
						<div className='flex items-center justify-between'>
							<span className='text-body-sm font-medium text-text-primary'>{p.name}</span>
							<div className='flex items-center gap-1'>
								{p.builtin && (
									<span className='rounded-full bg-violet-500/10 px-1.5 text-[10px] text-violet-400'>built-in</span>
								)}
								{!p.builtin && (
									<button
										onClick={() => deleteMutation.mutate({name: p.name})}
										className='rounded p-0.5 text-text-tertiary transition-colors hover:text-red-400'
									>
										<IconTrash size={12} />
									</button>
								)}
							</div>
						</div>
						{p.description && (
							<p className='mt-0.5 text-caption-sm text-text-tertiary'>{p.description}</p>
						)}
						<pre className='mt-1.5 max-h-20 overflow-hidden text-ellipsis whitespace-pre-wrap rounded bg-surface-1 p-2 text-[11px] font-mono text-text-secondary'>
							{p.prompt}
						</pre>
					</div>
				))
			)}
		</div>
	)
}

// ── AnalyticsView ─────────────────────────────────────────────

function AnalyticsView() {
	const analyticsQuery = trpcReact.ai.getAnalytics.useQuery(undefined, {refetchInterval: 10_000})

	if (analyticsQuery.isLoading) {
		return (
			<div className='flex h-32 items-center justify-center'>
				<IconLoader2 size={24} className='animate-spin text-text-tertiary' />
			</div>
		)
	}

	const data = analyticsQuery.data as {
		toolStats: Array<{name: string; type: string; toolCount: number; successRate: number | null; lastUsed: number}>;
		totalCapabilities: number;
		activeCapabilities: number;
		usageStats?: Array<{tool: string; totalCalls: number; successRate: number}>;
		coOccurrences?: Array<{toolA: string; toolB: string; count: number}>;
	} | undefined
	if (!data) return <p className='p-4 text-caption text-text-tertiary'>No analytics data available</p>

	const maxTools = Math.max(1, ...data.toolStats.map(s => s.toolCount))
	const totalCalls = data.usageStats?.reduce((sum, s) => sum + s.totalCalls, 0) ?? 0
	const maxCalls = Math.max(1, ...(data.usageStats?.map(s => s.totalCalls) ?? [1]))

	return (
		<div className='p-3 space-y-4'>
			{/* Summary cards row */}
			<div className='flex gap-2'>
				<div className='flex-1 rounded-radius-sm bg-surface-1 p-3 text-center'>
					<div className='text-heading-sm font-bold text-text-primary'>{data.totalCapabilities}</div>
					<div className='text-caption-sm text-text-tertiary'>Total</div>
				</div>
				<div className='flex-1 rounded-radius-sm bg-surface-1 p-3 text-center'>
					<div className='text-heading-sm font-bold text-green-400'>{data.activeCapabilities}</div>
					<div className='text-caption-sm text-text-tertiary'>Active</div>
				</div>
				{totalCalls > 0 && (
					<div className='flex-1 rounded-radius-sm bg-surface-1 p-3 text-center'>
						<div className='text-heading-sm font-bold text-cyan-400'>{totalCalls.toLocaleString()}</div>
						<div className='text-caption-sm text-text-tertiary'>Total Calls</div>
					</div>
				)}
			</div>

			{/* Tool Usage (from Redis stream) */}
			{data.usageStats && data.usageStats.length > 0 && (
				<>
					<h3 className='text-caption font-semibold uppercase tracking-wide text-text-tertiary'>Tool Usage (Last 5000 calls)</h3>

					{/* Usage table header */}
					<div className='flex items-center gap-2 px-1 text-caption-sm font-semibold uppercase tracking-wide text-text-tertiary'>
						<span className='flex-1'>Tool</span>
						<span className='w-16 text-right'>Calls</span>
						<span className='w-16 text-right'>Success</span>
					</div>

					{/* Usage rows */}
					{data.usageStats.map(stat => (
						<div key={stat.tool} className='flex items-center gap-2 rounded-radius-sm border border-border-subtle bg-surface-base p-2'>
							<div className='min-w-0 flex-1'>
								<span className='block truncate text-caption font-medium text-text-primary'>{stat.tool}</span>
								{/* CSS bar showing relative call count */}
								<div className='mt-1 h-1 w-full rounded-full bg-surface-2'>
									<div className='h-1 rounded-full bg-cyan-500' style={{width: `${(stat.totalCalls / maxCalls) * 100}%`}} />
								</div>
							</div>
							<span className='w-16 text-right text-caption-sm text-text-secondary'>{stat.totalCalls}</span>
							<span className='w-16 text-right text-caption-sm text-text-secondary'>{stat.successRate}%</span>
						</div>
					))}
				</>
			)}

			{/* Commonly Used Together (co-occurrences) */}
			{data.coOccurrences && data.coOccurrences.length > 0 && (
				<>
					<h3 className='text-caption font-semibold uppercase tracking-wide text-text-tertiary'>Commonly Used Together</h3>
					<div className='space-y-1'>
						{data.coOccurrences.map((pair, i) => (
							<div key={i} className='flex items-center gap-2 rounded-radius-sm bg-surface-1 px-2.5 py-1.5'>
								<span className='min-w-0 flex-1 truncate text-caption text-text-secondary'>
									{pair.toolA} <span className='text-text-tertiary'>+</span> {pair.toolB}
								</span>
								<span className='rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-text-tertiary'>
									{pair.count}x
								</span>
							</div>
						))}
					</div>
				</>
			)}

			{/* Registry Overview (existing capability stats) */}
			<h3 className='text-caption font-semibold uppercase tracking-wide text-text-tertiary'>Registry Overview</h3>

			{/* Table header */}
			<div className='flex items-center gap-2 px-1 text-caption-sm font-semibold uppercase tracking-wide text-text-tertiary'>
				<span className='flex-1'>Capability</span>
				<span className='w-16 text-right'>Tools</span>
				<span className='w-16 text-right'>Success</span>
				<span className='w-20 text-right'>Last Used</span>
			</div>

			{/* Table rows */}
			{data.toolStats.length === 0 ? (
				<div className='flex flex-col items-center py-8'>
					<IconChartBar size={40} className='mb-3 text-text-tertiary' />
					<p className='text-body-sm text-text-secondary'>No capability data yet</p>
					<p className='text-caption-sm text-text-tertiary'>Analytics will populate as capabilities are used</p>
				</div>
			) : (
				data.toolStats.map(stat => (
					<div key={stat.name} className='flex items-center gap-2 rounded-radius-sm border border-border-subtle bg-surface-base p-2'>
						<div className='min-w-0 flex-1'>
							<span className='block truncate text-caption font-medium text-text-primary'>{stat.name}</span>
							{/* CSS bar showing relative tool count */}
							<div className='mt-1 h-1 w-full rounded-full bg-surface-2'>
								<div className='h-1 rounded-full bg-brand' style={{width: `${(stat.toolCount / maxTools) * 100}%`}} />
							</div>
						</div>
						<span className='w-16 text-right text-caption-sm text-text-secondary'>{stat.toolCount}</span>
						<span className='w-16 text-right text-caption-sm text-text-secondary'>{stat.successRate !== null ? `${stat.successRate}%` : '\u2014'}</span>
						<span className='w-20 text-right text-caption-sm text-text-tertiary'>
							{stat.lastUsed > 0 ? formatDistanceToNow(stat.lastUsed, {addSuffix: true}) : 'Never'}
						</span>
					</div>
				))
			)}
		</div>
	)
}

// ── Main Panel ─────────────────────────────────────────────────

export default function CapabilitiesPanel() {
	const [activeTab, setActiveTab] = useState<CapabilityTab>('skill')
	const [view, setView] = useState<PanelView>({mode: 'list'})
	const [searchQuery, setSearchQuery] = useState('')

	// Reset to list when tab changes
	useEffect(() => {
		setView({mode: 'list'})
	}, [activeTab])

	return (
		<div className='flex h-full flex-col bg-surface-base'>
			{/* Header (list mode, prompts, analytics) */}
			{(view.mode === 'list' || activeTab === 'prompts' || activeTab === 'analytics') && (
				<>
					<div className='flex-shrink-0 border-b border-border-default px-4 py-3'>
						<div className='flex items-center gap-3'>
							<div className='flex h-8 w-8 items-center justify-center rounded-radius-lg bg-gradient-to-br from-violet-500/20 to-blue-500/20'>
								<IconPuzzle size={16} className='text-violet-400' />
							</div>
							<div className='flex-1'>
								<h2 className='text-body font-semibold text-text-primary'>Capabilities</h2>
								<p className='text-caption-sm text-text-tertiary'>
									Skills, MCPs, hooks, and agents
								</p>
							</div>
						</div>
					</div>

					{/* Tab bar */}
					<div className='flex gap-1 border-b border-border-default px-3 py-2'>
						{TABS.map((tab) => {
							const Icon = tab.icon
							return (
								<button
									key={tab.key}
									onClick={() => setActiveTab(tab.key)}
									className={cn(
										'flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-caption font-medium transition-colors',
										activeTab === tab.key
											? 'bg-surface-2 text-text-primary'
											: 'text-text-tertiary hover:text-text-secondary hover:bg-surface-1',
									)}
								>
									<Icon size={12} />
									{tab.label}
								</button>
							)
						})}
					</div>

					{/* Search bar (hidden for prompts/analytics) */}
					{activeTab !== 'prompts' && activeTab !== 'analytics' && (
						<div className='px-3 py-2'>
							<div className='relative'>
								<IconSearch size={14} className='absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary' />
								<input
									type='text'
									value={searchQuery}
									onChange={(e) => setSearchQuery(e.target.value)}
									placeholder='Search capabilities...'
									className='w-full rounded-radius-sm border border-border-default bg-surface-base pl-8 pr-3 py-1.5 text-caption text-text-primary outline-none placeholder:text-text-tertiary focus:border-brand'
								/>
							</div>
						</div>
					)}
				</>
			)}

			{/* Content area */}
			<div className='flex-1 overflow-y-auto'>
				{activeTab === 'prompts' ? (
					<PromptsView />
				) : activeTab === 'analytics' ? (
					<AnalyticsView />
				) : view.mode === 'list' ? (
					<div className='p-3'>
						<CapabilityList
							activeTab={activeTab}
							searchQuery={searchQuery}
							onSelect={(id) => setView({mode: 'detail', capabilityId: id})}
						/>
					</div>
				) : view.mode === 'detail' ? (
					<CapabilityDetail
						capabilityId={view.capabilityId}
						onBack={() => setView({mode: 'list'})}
					/>
				) : null}
			</div>
		</div>
	)
}
