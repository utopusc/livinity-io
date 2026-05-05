// Phase 86 V32-MKT — /marketplace route component.
//
// Public agent marketplace — Suna-pattern 4-col responsive grid + search +
// sort + tag filter chip strip + "Load more" pagination + optimistic
// "Add to Library" mutation.
//
// Layout invariants (D-MK-11..D-MK-17):
//   - Hero: h1 "Discover Agents" + 1-line subtitle
//   - Toolbar: MarketplaceFilters (search 300ms debounce, sort, tag chips)
//   - Grid: grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6
//   - Cards: MarketplaceCard
//   - Page states: loading skeleton / error / empty / data
//   - Pagination: "Load more" button when hasMore
//
// Anonymous browsing works (D-PUBLIC-BROWSE: list + tags are public
// procedures). Login is only required when the user clicks "Add to
// Library" — the mutation throws UNAUTHORIZED, the toast prompts login.
//
// Coexistence: this route is sibling to the legacy /agent-marketplace
// route (Phase 76). Both work during dev; P90 cutover redirects the
// legacy route to /marketplace and retires the old code path.

import {useEffect, useMemo, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {toast} from 'sonner'
import {IconLoader2, IconRefresh} from '@tabler/icons-react'

import {Button} from '@/shadcn-components/ui/button'
import {trpcReact} from '@/trpc/trpc'

import {MarketplaceCard} from './MarketplaceCard'
import {MarketplaceFilters} from './MarketplaceFilters'
import {
	useCloneToLibrary,
	useMarketplaceList,
	useMarketplaceTags,
	type MarketplaceAgent,
	type MarketplaceSort,
} from './marketplace-api'

const PAGE_SIZE = 24

export default function MarketplacePage() {
	const navigate = useNavigate()
	const utils = trpcReact.useUtils()

	// ─── Filter state (parent owns canonical values; MarketplaceFilters
	//     surfaces changes via callbacks)
	const [search, setSearch] = useState('')
	const [sort, setSort] = useState<MarketplaceSort>('newest')
	const [tag, setTag] = useState<string | null>(null)
	const [offset, setOffset] = useState(0)

	// ─── Per-card transient adding state (D-MK-14 — only the clicked card
	//     shows the spinner; other cards stay interactive)
	const [addingAgentId, setAddingAgentId] = useState<string | null>(null)

	// ─── Accumulated rows across "Load more" pages (D-MK-17). Reset
	//     whenever a filter changes (effect below).
	const [accumulated, setAccumulated] = useState<MarketplaceAgent[]>([])

	// ─── Reset offset + accumulated rows when filters change. Without this,
	//     changing search would append page 1 of new results to page 1+ of
	//     old results — confusing UX.
	useEffect(() => {
		setOffset(0)
		setAccumulated([])
	}, [search, sort, tag])

	// ─── tRPC queries
	const queryInput = useMemo(
		() => ({
			search: search || undefined,
			sort,
			tag: tag ?? undefined,
			limit: PAGE_SIZE,
			offset,
		}),
		[search, sort, tag, offset],
	)

	const listQuery = useMarketplaceList(queryInput)
	const tagsQuery = useMarketplaceTags()
	const cloneMutation = useCloneToLibrary()

	// ─── Accumulate page rows. When offset===0, replace; else append.
	useEffect(() => {
		if (!listQuery.data) return
		setAccumulated((prev) => {
			if (offset === 0) return listQuery.data.rows
			// Defensive de-dup by id in case of overlap from concurrent updates
			const seen = new Set(prev.map((r) => r.id))
			const merged = [...prev]
			for (const row of listQuery.data.rows) {
				if (!seen.has(row.id)) {
					merged.push(row)
					seen.add(row.id)
				}
			}
			return merged
		})
	}, [listQuery.data, offset])

	// ─── Total + hasMore from the latest page response
	const total = listQuery.data?.total ?? 0
	const hasMore = listQuery.data?.hasMore ?? false

	// ─── Add to Library handler — optimistic UI + cache mutation + toast
	const handleAdd = (agentId: string, agentName: string) => {
		setAddingAgentId(agentId)

		// Optimistic download_count bump in the local accumulated list
		const previousAccumulated = accumulated
		setAccumulated((rows) =>
			rows.map((r) => (r.id === agentId ? {...r, downloadCount: r.downloadCount + 1} : r)),
		)

		cloneMutation.mutate(
			{sourceAgentId: agentId},
			{
				onSuccess: () => {
					// Invalidate the marketplace query so the next refetch
					// picks up the new download_count (server-of-record).
					utils.marketplace.list.invalidate()
					// Invalidate agents.list so the user's library page
					// (P85-UI route) shows the new clone next time it mounts.
					// Fire-and-forget — failure is non-fatal.
					utils.agents.list.invalidate().catch(() => {})

					toast.success(`${agentName} added to your library`, {
						action: {
							label: 'Open Library',
							onClick: () => navigate('/agents'),
						},
					})
				},
				onError: (error) => {
					// Rollback the optimistic count bump
					setAccumulated(previousAccumulated)

					const message = error.message || 'Could not add agent to library'
					if (error.data?.code === 'UNAUTHORIZED') {
						toast.error('Please sign in to add agents to your library', {
							action: {
								label: 'Sign in',
								onClick: () => navigate('/login'),
							},
						})
					} else {
						toast.error(message, {
							action: {
								label: 'Retry',
								onClick: () => handleAdd(agentId, agentName),
							},
						})
					}
				},
				onSettled: () => {
					setAddingAgentId(null)
				},
			},
		)
	}

	const handleLoadMore = () => {
		setOffset((current) => current + PAGE_SIZE)
	}

	const handleResetFilters = () => {
		setSearch('')
		setSort('newest')
		setTag(null)
	}

	// ─── Page-state derivation
	const isInitialLoading = listQuery.isLoading && offset === 0 && accumulated.length === 0
	const isError = !!listQuery.error
	const isEmpty = !isInitialLoading && !isError && accumulated.length === 0
	const hasFiltersActive = !!search || !!tag || sort !== 'newest'

	return (
		<div className='container mx-auto max-w-7xl px-4 py-8' data-testid='marketplace-page'>
			{/* Hero */}
			<div className='mb-8 space-y-2'>
				<h1
					className='text-display-2 font-semibold tracking-tight text-text-primary'
					data-testid='marketplace-hero-title'
				>
					Discover Agents
				</h1>
				<p className='max-w-2xl text-body text-text-secondary'>
					Browse curated AI agents and add them to your personal library with one click.
				</p>
			</div>

			{/* Toolbar */}
			<div className='mb-8'>
				<MarketplaceFilters
					sort={sort}
					tag={tag}
					tags={tagsQuery.data ?? []}
					tagsLoading={tagsQuery.isLoading}
					onSearchChange={setSearch}
					onSortChange={setSort}
					onTagChange={setTag}
				/>
			</div>

			{/* Result count strip */}
			{!isInitialLoading && !isError && accumulated.length > 0 && (
				<p
					className='mb-4 text-caption text-text-secondary'
					data-testid='marketplace-result-count'
				>
					Showing {accumulated.length} of {total} agent{total === 1 ? '' : 's'}
				</p>
			)}

			{/* Page states */}
			{isInitialLoading ? (
				<MarketplaceSkeletonGrid />
			) : isError ? (
				<MarketplaceError
					message={listQuery.error?.message ?? 'Unknown error'}
					onRetry={() => listQuery.refetch()}
				/>
			) : isEmpty ? (
				<MarketplaceEmpty hasFiltersActive={hasFiltersActive} onReset={handleResetFilters} />
			) : (
				<>
					<div
						className='grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
						data-testid='marketplace-grid'
					>
						{accumulated.map((agent) => (
							<MarketplaceCard
								key={agent.id}
								agent={agent}
								onAdd={handleAdd}
								isAdding={addingAgentId === agent.id}
							/>
						))}
					</div>

					{/* Load more pagination */}
					{hasMore && (
						<div className='mt-8 flex justify-center'>
							<Button
								variant='default'
								onClick={handleLoadMore}
								disabled={listQuery.isFetching}
								data-testid='marketplace-load-more'
							>
								{listQuery.isFetching ? (
									<>
										<IconLoader2 size={14} className='animate-spin' />
										Loading…
									</>
								) : (
									'Load more'
								)}
							</Button>
						</div>
					)}
				</>
			)}
		</div>
	)
}

// ─── Sub-components: skeleton / error / empty ─────────────────────────

function MarketplaceSkeletonGrid() {
	return (
		<div
			className='grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
			data-testid='marketplace-skeleton'
		>
			{Array.from({length: 8}).map((_, i) => (
				<div
					key={i}
					className='flex h-[24rem] animate-pulse flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface-1'
				>
					<div className='h-50 bg-surface-2' />
					<div className='flex flex-1 flex-col gap-2 p-4'>
						<div className='h-5 w-3/4 rounded bg-surface-2' />
						<div className='h-3 w-1/2 rounded bg-surface-2' />
						<div className='h-3 w-1/3 rounded bg-surface-2' />
						<div className='mt-2 h-8 rounded bg-surface-2' />
						<div className='mt-auto h-9 rounded bg-surface-2' />
					</div>
				</div>
			))}
		</div>
	)
}

function MarketplaceError({message, onRetry}: {message: string; onRetry: () => void}) {
	return (
		<div
			className='flex flex-col items-center justify-center gap-3 rounded-2xl border border-border-subtle bg-surface-1 px-6 py-16 text-center'
			role='alert'
			data-testid='marketplace-error'
		>
			<p className='text-body font-semibold text-text-primary'>Could not load marketplace agents</p>
			<p className='max-w-md text-caption text-text-secondary'>{message}</p>
			<Button variant='default' onClick={onRetry}>
				<IconRefresh size={14} />
				Retry
			</Button>
		</div>
	)
}

function MarketplaceEmpty({
	hasFiltersActive,
	onReset,
}: {
	hasFiltersActive: boolean
	onReset: () => void
}) {
	return (
		<div
			className='flex flex-col items-center justify-center gap-3 rounded-2xl border border-border-subtle bg-surface-1 px-6 py-16 text-center'
			data-testid='marketplace-empty'
		>
			<p className='text-body font-semibold text-text-primary'>
				{hasFiltersActive
					? 'No agents match your filters'
					: 'No agents are available in the marketplace yet'}
			</p>
			{hasFiltersActive && (
				<>
					<p className='max-w-md text-caption text-text-secondary'>
						Try a different search term or clear the filter to see all available agents.
					</p>
					<Button variant='default' onClick={onReset}>
						Reset filters
					</Button>
				</>
			)}
		</div>
	)
}
