/**
 * Phase 44 Plan 44-04 — Sortable per-app stats table.
 *
 * Click column headers to toggle sort key + direction. Empty rows render a
 * single italic "no usage yet" message instead of an empty table.
 */

import {useState} from 'react'

type PerAppStat = {
	app_id: string | null
	request_count: number
	prompt_tokens: number
	completion_tokens: number
	last_used_at: string | Date
}

type SortKey = 'app_id' | 'request_count' | 'prompt_tokens' | 'completion_tokens' | 'last_used_at'

export function PerAppTable({rows}: {rows: PerAppStat[]}) {
	const [sortKey, setSortKey] = useState<SortKey>('request_count')
	const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

	const sorted = [...rows].sort((a, b) => {
		let av: number | string = 0
		let bv: number | string = 0
		if (sortKey === 'last_used_at') {
			av = new Date(a.last_used_at).getTime()
			bv = new Date(b.last_used_at).getTime()
		} else if (sortKey === 'app_id') {
			av = a.app_id ?? ''
			bv = b.app_id ?? ''
		} else {
			av = (a[sortKey] as number) ?? 0
			bv = (b[sortKey] as number) ?? 0
		}
		if (av === bv) return 0
		if (sortDir === 'desc') return av < bv ? 1 : -1
		return av < bv ? -1 : 1
	})

	const toggleSort = (key: SortKey) => {
		if (key === sortKey) {
			setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
		} else {
			setSortKey(key)
			setSortDir('desc')
		}
	}

	if (rows.length === 0) {
		return <div className='text-body-sm text-text-secondary italic'>No marketplace app usage yet.</div>
	}

	const Th = ({k, label}: {k: SortKey; label: string}) => (
		<th
			onClick={() => toggleSort(k)}
			className='cursor-pointer select-none text-left text-caption font-medium text-text-secondary py-2 px-2 hover:text-text-primary'
		>
			{label} {sortKey === k ? (sortDir === 'desc' ? '↓' : '↑') : ''}
		</th>
	)

	return (
		<div className='overflow-x-auto'>
			<table className='w-full text-body-sm'>
				<thead>
					<tr className='border-b border-border-default'>
						<Th k='app_id' label='App' />
						<Th k='request_count' label='Requests' />
						<Th k='prompt_tokens' label='Prompt tokens' />
						<Th k='completion_tokens' label='Completion tokens' />
						<Th k='last_used_at' label='Last used' />
					</tr>
				</thead>
				<tbody>
					{sorted.map((r, i) => (
						<tr
							key={`${r.app_id ?? 'unknown'}-${i}`}
							className='border-b border-border-default/50'
						>
							<td className='py-2 px-2'>{r.app_id ?? '(unresolved)'}</td>
							<td className='py-2 px-2 text-text-secondary'>{r.request_count}</td>
							<td className='py-2 px-2 text-text-secondary'>{r.prompt_tokens.toLocaleString()}</td>
							<td className='py-2 px-2 text-text-secondary'>{r.completion_tokens.toLocaleString()}</td>
							<td className='py-2 px-2 text-text-secondary text-caption'>
								{new Date(r.last_used_at).toLocaleString()}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	)
}
