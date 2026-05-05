// Phase 85 (UI slice) — /agents grid route.
//
// Top-level route component that renders:
//   - Header bar: "Agents" h1 + count + "+ New Agent" + search input + sort
//   - 4-col responsive grid (sm:2 md:3 lg:4 xl:5) of AgentCard
//   - Empty state with two CTAs (create + browse marketplace)
//   - Loading state (8 placeholder cards)
//   - Error state with retry
//
// Consumes the agents.* tRPC procedures via the agents-api hooks.
// Uses StaggerList from @/components/motion for the entrance animation
// (same primitive used by /agent-marketplace 76-04).

import {useMemo, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {IconPlus, IconSearch} from '@tabler/icons-react'
import {toast} from 'sonner'

import {StaggerList} from '@/components/motion'
import {Button} from '@/shadcn-components/ui/button'
import {Input} from '@/shadcn-components/ui/input'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/shadcn-components/ui/select'
import {cn} from '@/shadcn-lib/utils'

import {AgentCard} from './agent-card'
import {useAgents, useCreateAgent, useDeleteAgent, type Agent} from './agents-api'

type SortKey = 'created_at' | 'updated_at' | 'name' | 'download_count'

const SORT_LABELS: Record<SortKey, string> = {
	created_at: 'Newest',
	updated_at: 'Recently updated',
	name: 'Name (A-Z)',
	download_count: 'Most cloned',
}

// Default emoji + color used when creating a blank "+ New Agent" so the
// empty-state card isn't all-grey.
const DEFAULT_NEW_AVATAR = '🤖'
const DEFAULT_NEW_COLOR = '#6366f1' // indigo-500

export default function AgentsRoute() {
	const navigate = useNavigate()
	const [search, setSearch] = useState('')
	const [sort, setSort] = useState<SortKey>('created_at')

	const query = useAgents({
		search: search.trim() || undefined,
		sort,
		order: sort === 'name' ? 'asc' : 'desc',
		limit: 100,
		includePublic: true,
	})

	const createMutation = useCreateAgent()
	const deleteMutation = useDeleteAgent()

	// The 5 v32 system seeds are listed first, then user-owned rows. The
	// repo already returns them in a consistent order; this client-side
	// partition just guarantees system seeds always appear at the top
	// regardless of the active sort column.
	const partitioned = useMemo(() => {
		const rows = query.data?.rows ?? []
		const system: Agent[] = []
		const owned: Agent[] = []
		for (const row of rows) {
			if (row.userId === null) system.push(row)
			else owned.push(row)
		}
		return {system, owned, all: [...system, ...owned]}
	}, [query.data])

	const handleCreate = () => {
		createMutation.mutate(
			{
				name: 'Untitled agent',
				description: '',
				systemPrompt: 'You are a helpful assistant.',
				modelTier: 'sonnet',
				avatar: DEFAULT_NEW_AVATAR,
				avatarColor: DEFAULT_NEW_COLOR,
			},
			{
				onSuccess: (created) => {
					toast.success('Agent created')
					navigate(`/agents/${created.id}`)
				},
				onError: (err) => {
					toast.error(`Could not create agent: ${err.message}`)
				},
			},
		)
	}

	const handleDelete = (agentId: string) => {
		deleteMutation.mutate(
			{agentId},
			{
				onSuccess: ({deleted}) => {
					if (deleted) toast.success('Agent deleted')
					else toast.error('Agent not found or already deleted')
				},
				onError: (err) => {
					toast.error(`Could not delete: ${err.message}`)
				},
			},
		)
	}

	return (
		<div className='min-h-screen bg-liv-background text-liv-foreground'>
			<div className='container mx-auto max-w-7xl px-4 py-8'>
				{/* Header */}
				<div className='mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between'>
					<div>
						<h1 className='text-3xl font-semibold tracking-tight text-liv-foreground'>
							Agents
						</h1>
						<p className='mt-1 text-sm text-liv-muted-foreground'>
							{query.isLoading
								? 'Loading…'
								: `${partitioned.all.length} ${partitioned.all.length === 1 ? 'agent' : 'agents'} in your library`}
						</p>
					</div>
					<div className='flex flex-wrap items-center gap-2'>
						<div className='relative'>
							<IconSearch
								size={16}
								className='pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-liv-muted-foreground'
							/>
							<Input
								type='search'
								placeholder='Search agents…'
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								className='w-64 pl-9'
								data-testid='agents-search'
							/>
						</div>
						<Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
							<SelectTrigger className='w-[180px]' data-testid='agents-sort'>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
									<SelectItem key={key} value={key}>
										{SORT_LABELS[key]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Button
							onClick={handleCreate}
							disabled={createMutation.isPending}
							className='gap-1'
							data-testid='agents-new-button'
						>
							<IconPlus size={16} />
							New Agent
						</Button>
					</div>
				</div>

				{/* Body — loading / error / empty / grid */}
				{query.isLoading ? (
					<SkeletonGrid />
				) : query.error ? (
					<ErrorState message={query.error.message} onRetry={() => query.refetch()} />
				) : partitioned.all.length === 0 ? (
					<EmptyState onCreate={handleCreate} onBrowse={() => navigate('/agent-marketplace')} />
				) : (
					<StaggerList
						staggerMs={50}
						className='grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
					>
						{partitioned.all.map((agent) => (
							<AgentCard
								key={agent.id}
								agent={agent}
								onDelete={agent.userId === null ? undefined : handleDelete}
								isDeleting={
									deleteMutation.isPending && deleteMutation.variables?.agentId === agent.id
								}
							/>
						))}
					</StaggerList>
				)}
			</div>
		</div>
	)
}

// ─── Page-state subcomponents ──────────────────────────────────────────

function SkeletonGrid() {
	return (
		<div
			className='grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
			data-testid='agents-skeleton'
		>
			{Array.from({length: 8}).map((_, i) => (
				<div
					key={i}
					className='h-[300px] animate-pulse rounded-2xl border border-liv-border bg-liv-muted'
				/>
			))}
		</div>
	)
}

function ErrorState({message, onRetry}: {message: string; onRetry: () => void}) {
	return (
		<div
			className={cn(
				'flex flex-col items-center justify-center gap-3 rounded-2xl border border-liv-border bg-liv-card px-6 py-16 text-center',
			)}
			role='alert'
			data-testid='agents-error'
		>
			<p className='text-lg font-semibold text-liv-card-foreground'>Could not load agents</p>
			<p className='max-w-md text-sm text-liv-muted-foreground'>{message}</p>
			<Button variant='default' onClick={onRetry}>
				Retry
			</Button>
		</div>
	)
}

function EmptyState({onCreate, onBrowse}: {onCreate: () => void; onBrowse: () => void}) {
	return (
		<div
			className='flex flex-col items-center justify-center gap-3 rounded-2xl border border-liv-border bg-liv-card px-6 py-16 text-center'
			data-testid='agents-empty'
		>
			<p className='text-lg font-semibold text-liv-card-foreground'>No agents yet</p>
			<p className='max-w-md text-sm text-liv-muted-foreground'>
				Create one from scratch, or browse the marketplace for opinionated presets.
			</p>
			<div className='mt-2 flex flex-wrap items-center justify-center gap-2'>
				<Button onClick={onCreate} className='gap-1'>
					<IconPlus size={16} />
					Create your first agent
				</Button>
				<Button variant='default' onClick={onBrowse}>
					Browse the marketplace
				</Button>
			</div>
		</div>
	)
}
