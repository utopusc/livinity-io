// Phase 25 Plan 25-02 — Tag filter chip row (DOC-06).
//
// Horizontal chip row that sits ABOVE the EnvCardGrid. Renders [All] + one
// chip per unique tag derived from useEnvironments(). Single-select model:
//   - Click 'All' or the active chip   → reset to null (show every env)
//   - Click a different tag chip       → swap the filter to that tag
//
// Auto-fallback: if a persisted tag is no longer present in the union (e.g.
// the user deleted the only env that had it), the chip row silently resets to
// 'All' on next mount via the useEffect below.
//
// Filtering itself happens in EnvCardGrid via filterEnvs(envs, selected) —
// this component only owns the UI affordance + persistence. Clicking chips
// triggers ZERO new tRPC requests (verified in Task 1 self-check).

import {useEffect, useMemo} from 'react'

import {useEnvironments} from '@/hooks/use-environments'
import {cn} from '@/shadcn-lib/utils'

import {deriveAllTags, useTagFilter} from './use-tag-filter'

function Chip({active, onClick, children}: {active: boolean; onClick: () => void; children: React.ReactNode}) {
	return (
		<button
			type='button'
			onClick={onClick}
			className={cn(
				'shrink-0 rounded-full border px-3 py-1 text-xs transition',
				active
					? 'border-blue-500 bg-blue-500 text-white shadow-sm'
					: 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600',
			)}
		>
			{children}
		</button>
	)
}

export function TagFilterChips() {
	const {data: envs} = useEnvironments()
	const {selected, setSelected} = useTagFilter()

	const allTags = useMemo(() => deriveAllTags(envs ?? []), [envs])

	// Auto-fallback: if the persisted tag no longer exists in the env list
	// (e.g. it was deleted in another tab), silently reset to 'All' so the
	// user doesn't see an empty grid with no obvious cause.
	useEffect(() => {
		if (selected && !allTags.includes(selected)) setSelected(null)
	}, [selected, allTags, setSelected])

	// Hide the entire chip row when zero tags exist anywhere — a row with only
	// 'All' and no alternatives is visual noise, not an affordance.
	if (allTags.length === 0) return null

	return (
		<div className='flex shrink-0 items-center gap-2 overflow-x-auto p-4 pb-2'>
			<Chip active={!selected} onClick={() => setSelected(null)}>
				All
			</Chip>
			{allTags.map((t) => (
				<Chip
					key={t}
					active={selected === t}
					onClick={() => setSelected(selected === t ? null : t)}
				>
					{t}
				</Chip>
			))}
		</div>
	)
}
