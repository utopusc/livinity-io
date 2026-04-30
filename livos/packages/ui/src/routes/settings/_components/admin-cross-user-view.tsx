/**
 * Phase 44 Plan 44-04 — Admin-only cross-user usage view.
 *
 * Filter chips: user_id (UUID), app_id (text), model (text). Empty filter =
 * unfiltered query. Backend (usage.getAll, Plan 44-03) is the authoritative
 * gate — this component is rendered conditionally by UsageSection based on
 * a silent admin probe.
 */

import {useState} from 'react'
import {TbLoader2} from 'react-icons/tb'

import {trpcReact} from '@/trpc/trpc'

import {PerAppTable} from './per-app-table'

export function AdminCrossUserView() {
	const [filterUserId, setFilterUserId] = useState<string>('')
	const [filterAppId, setFilterAppId] = useState<string>('')
	const [filterModel, setFilterModel] = useState<string>('')

	const allUsageQ = trpcReact.usage.getAll.useQuery({
		user_id: filterUserId || undefined,
		app_id: filterAppId || undefined,
		model: filterModel || undefined,
	})

	if (allUsageQ.isLoading) {
		return (
			<div className='flex items-center gap-2 text-body-sm text-text-secondary'>
				<TbLoader2 className='size-4 animate-spin' /> Loading cross-user usage…
			</div>
		)
	}
	if (allUsageQ.isError || !allUsageQ.data) {
		return <div className='text-body-sm text-text-secondary italic'>Cross-user data unavailable.</div>
	}

	const {stats, rows} = allUsageQ.data

	return (
		<div className='space-y-3'>
			<div className='flex flex-wrap gap-2'>
				<input
					type='text'
					placeholder='Filter by user_id (UUID)'
					value={filterUserId}
					onChange={(e) => setFilterUserId(e.target.value)}
					className='flex-1 min-w-[140px] rounded-radius-sm border border-border-default bg-surface-raised px-2 py-1 text-caption'
				/>
				<input
					type='text'
					placeholder='Filter by app_id'
					value={filterAppId}
					onChange={(e) => setFilterAppId(e.target.value)}
					className='flex-1 min-w-[120px] rounded-radius-sm border border-border-default bg-surface-raised px-2 py-1 text-caption'
				/>
				<input
					type='text'
					placeholder='Filter by model'
					value={filterModel}
					onChange={(e) => setFilterModel(e.target.value)}
					className='flex-1 min-w-[120px] rounded-radius-sm border border-border-default bg-surface-raised px-2 py-1 text-caption'
				/>
			</div>

			<div className='grid grid-cols-3 gap-2'>
				<Stat label='Total requests' value={stats.total_requests.toLocaleString()} />
				<Stat label='Prompt tokens' value={stats.cumulative_prompt_tokens.toLocaleString()} />
				<Stat label='Completion tokens' value={stats.cumulative_completion_tokens.toLocaleString()} />
			</div>

			<div>
				<div className='text-caption text-text-secondary mb-2'>
					Per app (across {rows.length} request rows)
				</div>
				<PerAppTable
					rows={stats.per_app.map((p) => ({...p, last_used_at: p.last_used_at as unknown as string}))}
				/>
			</div>
		</div>
	)
}

function Stat({label, value}: {label: string; value: string}) {
	return (
		<div className='rounded-radius-sm border border-border-default bg-surface-raised p-2'>
			<div className='text-caption text-text-secondary'>{label}</div>
			<div className='text-body-sm font-medium text-text-primary mt-0.5'>{value}</div>
		</div>
	)
}
