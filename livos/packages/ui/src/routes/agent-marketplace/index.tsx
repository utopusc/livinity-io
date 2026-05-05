// Phase 76 Plan 76-04 — Agent Marketplace route.
//
// Browseable Suna-pattern grid of opinionated agent presets seeded by
// 76-02. Wired to the 3 tRPC procedures shipped in 76-03:
//   - ai.listAgentTemplates({tags?: string[]}) — query (cached)
//   - ai.cloneAgentTemplate({slug}) — mutation (POSTs to nexus subagent
//     endpoint, increments clone_count on 200)
//
// Layout invariants (76-04 must_haves + v31-DRAFT 826-832):
//   - Responsive grid: grid-cols-2 md:grid-cols-3 lg:grid-cols-4.
//   - Entrance animation: P66 <StaggerList staggerMs=50> wrapping the grid;
//     each <AgentCard> additionally wrapped in <FadeIn delay={i*0.04}> so
//     visible cards land in cascade. (Note: StaggerList already handles
//     stagger — FadeIn adds the per-card visibility-once entrance for
//     cards that scroll into view after initial mount; harmless overlap
//     per P66 D-07.)
//   - Per-card cloning state isolated: only the button on the card whose
//     slug matches `mutation.variables?.slug` shows the spinner, others
//     stay interactive (T-76-04-03 mitigation).
//   - 4 page states: loading skeleton / error CoverMessage / empty
//     CoverMessage / data grid.
//   - Tag filter chip strip above the grid: 'All' + dedup'd tags from
//     loaded data; single-select toggle.
//   - Sonner toast on clone success/failure (existing pattern, 18+ files
//     already use `import {toast} from 'sonner'`).
//
// D-NO-NEW-DEPS preserved — all imports are existing.

import {useMemo, useState} from 'react'
import {toast} from 'sonner'

import {FadeIn, StaggerList} from '@/components/motion'
import {trpcReact} from '@/trpc/trpc'
import {cn} from '@/shadcn-lib/utils'

import {AgentCard, type AgentTemplate} from './agent-card'

export default function AgentMarketplace() {
	const [selectedTag, setSelectedTag] = useState<string | null>(null)

	const utils = trpcReact.useUtils()
	const query = trpcReact.ai.listAgentTemplates.useQuery({
		tags: selectedTag ? [selectedTag] : undefined,
	})
	const cloneMutation = trpcReact.ai.cloneAgentTemplate.useMutation()

	// Compute the universe of unique tags from CURRENTLY-LOADED data.
	// Note: when a tag filter is active, the loaded set is already filtered
	// server-side, so the chip strip "narrows" — that's fine for v1; we
	// could pre-fetch the unfiltered set if needed, BACKLOG.
	const data = (query.data ?? []) as AgentTemplate[]
	const uniqueTags = useMemo(() => {
		const set = new Set<string>()
		for (const tpl of data) {
			for (const t of tpl.tags) set.add(t)
		}
		return Array.from(set).sort()
	}, [data])

	const onClone = (slug: string) => {
		cloneMutation.mutate(
			{slug},
			{
				onSuccess: () => {
					utils.ai.listAgentTemplates.invalidate()
					utils.ai.listSubagents.invalidate()
					toast.success('Agent added to your library')
				},
				onError: (err) => {
					toast.error(`Could not add agent: ${err.message}`)
				},
			},
		)
	}

	return (
		<div className='container mx-auto max-w-7xl px-4 py-8'>
			<div className='mb-6 flex flex-col gap-2 md:flex-row md:items-baseline md:justify-between'>
				<h1 className='text-display-2 font-semibold text-text-primary'>Agent Marketplace</h1>
				<p className='text-caption text-text-secondary'>
					Browse opinionated agent presets. Click to add one to your library.
				</p>
			</div>

			{/* Tag filter chip strip */}
			<div className='mb-6 flex flex-wrap gap-2' data-testid='agent-marketplace-tag-filter'>
				<TagChip
					label='All'
					active={selectedTag === null}
					onClick={() => setSelectedTag(null)}
				/>
				{uniqueTags.map((tag) => (
					<TagChip
						key={tag}
						label={tag}
						active={selectedTag === tag}
						onClick={() => setSelectedTag(tag)}
					/>
				))}
			</div>

			{/* Page state: loading / error / empty / data */}
			{query.isLoading ? (
				<MarketplaceSkeletonGrid />
			) : query.error ? (
				<MarketplaceError message={query.error.message} onRetry={() => query.refetch()} />
			) : data.length === 0 ? (
				<MarketplaceEmpty />
			) : (
				<StaggerList
					staggerMs={50}
					className='grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4'
				>
					{data.map((tpl, i) => (
						<FadeIn key={tpl.slug} delay={i * 0.04} y={12}>
							<AgentCard
								template={tpl}
								onClone={onClone}
								isCloning={
									cloneMutation.isPending && cloneMutation.variables?.slug === tpl.slug
								}
							/>
						</FadeIn>
					))}
				</StaggerList>
			)}
		</div>
	)
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function TagChip({
	label,
	active,
	onClick,
}: {
	label: string
	active: boolean
	onClick: () => void
}) {
	return (
		<button
			type='button'
			onClick={onClick}
			className={cn(
				'inline-flex items-center rounded-full border px-3 py-1.5 text-caption font-medium transition-all duration-[var(--liv-dur-fast)]',
				active
					? 'border-[color:var(--liv-accent-cyan)]/40 bg-[color:var(--liv-accent-cyan)]/10 text-[color:var(--liv-accent-cyan)]'
					: 'border-border-subtle bg-surface-1 text-text-secondary hover:border-border-default hover:text-text-primary',
			)}
			data-active={active}
		>
			{label}
		</button>
	)
}

function MarketplaceSkeletonGrid() {
	// 8 placeholder cards — matches the 8-agent seed set so the layout
	// reflows minimally on hydration. Plain `animate-pulse` boxes (D-NO-NEW-DEPS;
	// no shadcn Skeleton primitive on disk).
	return (
		<div
			className='grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4'
			data-testid='agent-marketplace-skeleton'
		>
			{Array.from({length: 8}).map((_, i) => (
				<div
					key={i}
					className='h-48 animate-pulse rounded-radius-xl border border-border-subtle bg-surface-base'
				/>
			))}
		</div>
	)
}

function MarketplaceError({message, onRetry}: {message: string; onRetry: () => void}) {
	return (
		<div
			className='flex flex-col items-center justify-center gap-3 rounded-radius-xl border border-border-subtle bg-surface-1 px-6 py-16 text-center'
			role='alert'
			data-testid='agent-marketplace-error'
		>
			<p className='text-body font-semibold text-text-primary'>Could not load agent templates</p>
			<p className='max-w-md text-caption text-text-secondary'>{message}</p>
			<button
				type='button'
				onClick={onRetry}
				className='rounded-radius-md bg-surface-base px-4 py-2 text-caption font-medium text-text-primary hover:bg-surface-2'
			>
				Retry
			</button>
		</div>
	)
}

function MarketplaceEmpty() {
	return (
		<div
			className='flex flex-col items-center justify-center gap-2 rounded-radius-xl border border-border-subtle bg-surface-1 px-6 py-16 text-center'
			data-testid='agent-marketplace-empty'
		>
			<p className='text-body font-semibold text-text-primary'>No agent templates available</p>
			<p className='max-w-md text-caption text-text-secondary'>
				The catalog is empty. Run the database seeds (76-02) to populate the marketplace.
			</p>
		</div>
	)
}
