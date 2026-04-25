// Phase 28 Plan 28-02 — ActivityFilters chip row (DOC-14).
//
// Two horizontal single-select chip rows above the timeline:
//   - Source : All / docker / scheduler / ai
//   - Severity: All / info / warn / error
//
// Single-select (radio) — a chip click sets the value; clicking the active
// chip is a no-op (NOT a toggle to 'all'). 'All' chip is the explicit reset.
// Mirrors TagFilterChips precedent from Plan 25-02 (single-select with an
// 'All' reset).
//
// Bare <button> over shadcn Toggle — keeps the semantics simple + matches
// the dashboard's TagFilterChips look so the Activity surface inherits the
// established Docker UI rhythm.

import {type Icon, IconBrandDocker, IconCalendarTime, IconSparkles} from '@tabler/icons-react'

import {cn} from '@/shadcn-lib/utils'

import {
	ACTIVITY_SEVERITIES,
	ACTIVITY_SOURCES,
	type ActivitySeverity,
	type ActivitySource,
} from './activity-types'

export type SourceFilter = ActivitySource | 'all'
export type SeverityFilter = ActivitySeverity | 'all'

interface ActivityFiltersProps {
	source: SourceFilter
	setSource: (s: SourceFilter) => void
	severity: SeverityFilter
	setSeverity: (s: SeverityFilter) => void
}

function Chip({
	active,
	onClick,
	children,
	tone,
}: {
	active: boolean
	onClick: () => void
	children: React.ReactNode
	/** Optional severity tone — colors the active chip (info=blue, warn=amber, error=red, default=blue). */
	tone?: 'info' | 'warn' | 'error' | 'default'
}) {
	const activeStyle =
		tone === 'warn'
			? 'border-amber-500 bg-amber-500 text-white shadow-sm'
			: tone === 'error'
				? 'border-red-500 bg-red-500 text-white shadow-sm'
				: 'border-blue-500 bg-blue-500 text-white shadow-sm'

	return (
		<button
			type='button'
			onClick={onClick}
			className={cn(
				'inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1 text-xs transition',
				active
					? activeStyle
					: 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600',
			)}
		>
			{children}
		</button>
	)
}

const SOURCE_ICONS: Record<ActivitySource, Icon> = {
	docker: IconBrandDocker,
	scheduler: IconCalendarTime,
	ai: IconSparkles,
}

const SOURCE_LABELS: Record<ActivitySource, string> = {
	docker: 'docker',
	scheduler: 'scheduler',
	ai: 'ai',
}

const SEVERITY_TONES: Record<ActivitySeverity, 'info' | 'warn' | 'error'> = {
	info: 'info',
	warn: 'warn',
	error: 'error',
}

export function ActivityFilters({source, setSource, severity, setSeverity}: ActivityFiltersProps) {
	return (
		<div className='flex flex-col gap-2 px-4 pb-2 pt-1 sm:flex-row sm:items-center sm:gap-4'>
			{/* Source row */}
			<div className='flex items-center gap-2 overflow-x-auto'>
				<span className='shrink-0 text-xs font-medium text-zinc-500 dark:text-zinc-400'>Source</span>
				<Chip active={source === 'all'} onClick={() => setSource('all')}>
					All
				</Chip>
				{ACTIVITY_SOURCES.map((s) => {
					const Icon = SOURCE_ICONS[s]
					return (
						<Chip key={s} active={source === s} onClick={() => setSource(s)}>
							<Icon size={12} className='shrink-0' />
							{SOURCE_LABELS[s]}
						</Chip>
					)
				})}
			</div>
			{/* Severity row */}
			<div className='flex items-center gap-2 overflow-x-auto'>
				<span className='shrink-0 text-xs font-medium text-zinc-500 dark:text-zinc-400'>Severity</span>
				<Chip active={severity === 'all'} onClick={() => setSeverity('all')}>
					All
				</Chip>
				{ACTIVITY_SEVERITIES.map((sev) => (
					<Chip
						key={sev}
						active={severity === sev}
						onClick={() => setSeverity(sev)}
						tone={SEVERITY_TONES[sev]}
					>
						{sev}
					</Chip>
				))}
			</div>
		</div>
	)
}
