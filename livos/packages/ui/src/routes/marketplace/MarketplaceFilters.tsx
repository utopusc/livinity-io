// Phase 86 V32-MKT — MarketplaceFilters component (extracted toolbar).
//
// Search input + sort select + tag filter chip strip. Memoized so the
// parent route's render churn (e.g. row accumulation on Load More) does
// not re-render this whole component. Filter changes are surfaced via
// callbacks; the parent owns the canonical filter state.
//
// D-DEBOUNCED-SEARCH: 300ms trailing-edge debounce on the search input.
//   - Local state holds the immediate input value (so the user sees their
//     typing without lag).
//   - useDebounce flushes that value into the parent's onSearchChange
//     callback after 300ms of inactivity.
//   - Sort + tag changes are NOT debounced — single-click semantics.

import {memo, useState} from 'react'
import {useDebounce} from 'react-use'
import {IconCalendar, IconSearch, IconStar, IconTrendingUp} from '@tabler/icons-react'

import {Input} from '@/shadcn-components/ui/input'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/shadcn-components/ui/select'
import {cn} from '@/shadcn-lib/utils'

import type {MarketplaceSort} from './marketplace-api'
import {SORT_OPTIONS} from './marketplace-api'

export type MarketplaceFiltersProps = {
	sort: MarketplaceSort
	tag: string | null
	tags: string[]
	tagsLoading: boolean
	onSearchChange: (search: string) => void
	onSortChange: (sort: MarketplaceSort) => void
	onTagChange: (tag: string | null) => void
}

const SORT_ICONS: Record<MarketplaceSort, React.ComponentType<{size?: number; className?: string}>> = {
	newest: IconCalendar,
	popular: IconStar,
	most_downloaded: IconTrendingUp,
}

export const MarketplaceFilters = memo(function MarketplaceFilters({
	sort,
	tag,
	tags,
	tagsLoading,
	onSearchChange,
	onSortChange,
	onTagChange,
}: MarketplaceFiltersProps) {
	// Local state for the input so the user sees their typing without lag.
	// Debounced to the parent every 300ms (D-DEBOUNCED-SEARCH).
	const [searchValue, setSearchValue] = useState('')

	useDebounce(
		() => {
			onSearchChange(searchValue)
		},
		300,
		[searchValue],
	)

	return (
		<div className='space-y-4' data-testid='marketplace-filters'>
			{/* Row 1: search + sort */}
			<div className='flex flex-col gap-3 sm:flex-row sm:items-center'>
				<div className='relative flex-1'>
					<IconSearch
						size={16}
						className='absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary'
					/>
					<Input
						sizeVariant='short'
						placeholder='Search agents…'
						value={searchValue}
						onValueChange={setSearchValue}
						className='pl-10'
						data-testid='marketplace-filters-search'
						aria-label='Search marketplace agents'
					/>
				</div>

				<Select value={sort} onValueChange={(v) => onSortChange(v as MarketplaceSort)}>
					<SelectTrigger
						className='w-full sm:w-[200px]'
						data-testid='marketplace-filters-sort'
						aria-label='Sort marketplace agents'
					>
						<SelectValue placeholder='Sort by' />
					</SelectTrigger>
					<SelectContent>
						{SORT_OPTIONS.map((opt) => {
							const Icon = SORT_ICONS[opt.value]
							return (
								<SelectItem key={opt.value} value={opt.value}>
									<div className='flex items-center gap-2'>
										<Icon size={14} />
										{opt.label}
									</div>
								</SelectItem>
							)
						})}
					</SelectContent>
				</Select>
			</div>

			{/* Row 2: tag chip strip */}
			{(tagsLoading || tags.length > 0) && (
				<div className='space-y-2'>
					<p className='text-caption font-medium text-text-secondary'>Filter by tag:</p>
					<div className='flex flex-wrap gap-2' data-testid='marketplace-filters-tags'>
						<TagChip
							label='All'
							active={tag === null}
							onClick={() => onTagChange(null)}
						/>
						{tags.map((t) => (
							<TagChip
								key={t}
								label={t}
								active={tag === t}
								onClick={() => onTagChange(tag === t ? null : t)}
							/>
						))}
					</div>
				</div>
			)}
		</div>
	)
})

// ─── Tag chip ──────────────────────────────────────────────────────────

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
			data-testid='marketplace-filters-tag-chip'
		>
			{label}
		</button>
	)
}
