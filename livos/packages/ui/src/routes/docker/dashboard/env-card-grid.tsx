// Phase 25 Plan 25-01 — Env card grid wrapper.
// Plan 25-02 — extended to filter via useTagFilter() before mapping.
//
// Maps useEnvironments() → one <EnvCard /> per row. Tailwind responsive grid
// matches the Dockhand reference (1 col mobile → 2 col sm → 3 col xl → 4 col
// 2xl). Loading state shows 3 skeleton cards (animate-pulse).
//
// Filter chips live in <TagFilterChips /> (Plan 25-02) — that component owns
// localStorage persistence and the chip UI, while this component reads the
// active selection via useTagFilter() and applies it via filterEnvs() before
// the .map(). Filtering is purely client-side: zero new tRPC requests.

import {useEnvironments} from '@/hooks/use-environments'

import {EnvCard} from './env-card'
import {filterEnvs, useTagFilter} from './use-tag-filter'

function GridSkeleton({count}: {count: number}) {
	return (
		<div className='grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'>
			{Array.from({length: count}).map((_, i) => (
				<div
					key={i}
					className='h-64 animate-pulse rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40'
				/>
			))}
		</div>
	)
}

export function EnvCardGrid() {
	const {data: envs, isLoading, isError, error} = useEnvironments()
	const {selected} = useTagFilter()

	if (isLoading) return <GridSkeleton count={3} />

	if (isError || !envs) {
		return (
			<div className='m-4 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'>
				Failed to load environments: {error?.message ?? 'unknown error'}
			</div>
		)
	}

	if (envs.length === 0) {
		return (
			<div className='m-4 rounded-md border border-zinc-200 bg-zinc-50 p-6 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400'>
				No environments configured yet. Add one from Settings &rarr; Environments.
			</div>
		)
	}

	const visibleEnvs = filterEnvs(envs, selected)

	if (visibleEnvs.length === 0) {
		return (
			<div className='m-4 rounded-md border border-zinc-200 bg-zinc-50 p-6 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400'>
				No environments match the selected tag.
			</div>
		)
	}

	return (
		<div className='grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'>
			{visibleEnvs.map((env) => (
				<EnvCard key={env.id} env={env} />
			))}
		</div>
	)
}
