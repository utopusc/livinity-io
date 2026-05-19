// Phase 165-02 — Settings UI: autonomous agents panel.
//
// Surfaces what Phase 164's scheduler + budget-gate built:
//   - Editable daily budget cap (writes REDIS_KEY_DAILY_BUDGET_CAP via
//     setDailyBudgetCap mutation; budget-gate re-reads on next runAgent)
//   - Read-only daily spend progress bar (spent / cap, %)
//   - Per-agent table: name / schedule / model / enabled toggle / last-run
//     timestamp / last-run cost / Run Now button
//
// CONTEXT.md decision Plan 165-02 §AutonomousAgentsPanel.tsx:
//   "Budget cap editor (Mini PC daily cap)" — the cap input is mandatory,
//   not a v1 omission. Apply button writes Redis; new cap takes effect on
//   the next scheduler tick (no livinityd restart).

import {useEffect, useState} from 'react'

import {Button} from '@/shadcn-components/ui/button'
import {trpcReact} from '@/trpc/trpc'

function formatLastRun(at: string | null, status: string | null): string {
	if (!at) return '—'
	const d = new Date(at)
	if (Number.isNaN(d.getTime())) return at
	const ts = d.toLocaleString()
	return status ? `${ts} (${status})` : ts
}

function formatCost(c: number | null): string {
	if (c == null) return '—'
	return `$${c.toFixed(4)}`
}

export function AutonomousAgentsPanel() {
	const utils = trpcReact.useUtils()
	const listQ = trpcReact.autonomous.list.useQuery()
	const spendQ = trpcReact.autonomous.getDailySpend.useQuery()
	const toggle = trpcReact.autonomous.toggle.useMutation({
		onSuccess: () => utils.autonomous.list.invalidate(),
	})
	const runNow = trpcReact.autonomous.runNow.useMutation({
		onSuccess: () => {
			utils.autonomous.getDailySpend.invalidate()
			utils.autonomous.list.invalidate()
		},
	})
	// Phase 165-02 — CONTEXT.md decision: editable budget cap (Mini PC daily cap).
	// Writes REDIS_KEY_DAILY_BUDGET_CAP via setDailyBudgetCap mutation; budget-gate
	// re-reads the new value on the next runAgent invocation (no livinityd restart).
	const setBudgetMutation = trpcReact.autonomous.setDailyBudgetCap.useMutation({
		onSuccess: () => utils.autonomous.getDailySpend.invalidate(),
	})
	const [capDollarsDraft, setCapDollarsDraft] = useState<string>('')

	const agents = listQ.data ?? []
	const spent = spendQ.data?.spentCents ?? 0
	const cap = spendQ.data?.capCents ?? 5000
	const pct = Math.min(100, Math.round((spent / cap) * 100))
	// Seed cap-editor draft from server value on first arrival / refetch.
	useEffect(() => {
		if (spendQ.data && capDollarsDraft === '') {
			setCapDollarsDraft((spendQ.data.capCents / 100).toFixed(2))
		}
	}, [spendQ.data, capDollarsDraft])
	const capDollarsServer = (cap / 100).toFixed(2)
	const capDirty = capDollarsDraft !== '' && capDollarsDraft !== capDollarsServer
	const onApplyCap = () => {
		const dollars = Number.parseFloat(capDollarsDraft)
		if (!Number.isFinite(dollars) || dollars < 0) return
		setBudgetMutation.mutate({capCents: Math.round(dollars * 100)})
	}

	return (
		<div className='space-y-6'>
			<section className='budget-cap-editor'>
				<h3 className='font-medium mb-2 text-text-primary'>
					Daily budget ({spendQ.data?.date ?? '—'})
				</h3>
				<div className='flex items-center gap-2 mb-2 text-text-primary'>
					<label className='text-sm'>Cap: $</label>
					<input
						type='number'
						min={0}
						max={1000}
						step={0.01}
						value={capDollarsDraft}
						onChange={(e) => setCapDollarsDraft(e.target.value)}
						className='w-24 px-2 py-1 border rounded text-sm bg-transparent text-text-primary'
						disabled={setBudgetMutation.isPending}
					/>
					<Button
						size='sm'
						variant='outline'
						onClick={onApplyCap}
						disabled={!capDirty || setBudgetMutation.isPending}
					>
						{setBudgetMutation.isPending ? 'Applying…' : 'Apply'}
					</Button>
				</div>
				<div className='w-full h-2 bg-gray-200 rounded spend-bar'>
					<div
						className='h-2 bg-blue-500 rounded filled'
						style={{width: `${pct}%`}}
					/>
				</div>
				<p className='text-xs text-text-secondary mt-1'>
					${(spent / 100).toFixed(2)} / ${capDollarsServer} used today ({pct}%)
				</p>
			</section>
			<section>
				<h3 className='font-medium mb-2 text-text-primary'>Agents</h3>
				<table className='w-full text-sm text-text-primary'>
					<thead>
						<tr className='text-text-secondary'>
							<th className='text-left'>Name</th>
							<th className='text-left'>Schedule</th>
							<th className='text-left'>Model</th>
							<th className='text-left'>Enabled</th>
							<th className='text-left'>Last run</th>
							<th className='text-left'>Last cost</th>
							<th className='text-left'>Actions</th>
						</tr>
					</thead>
					<tbody>
						{agents.map((a) => (
							<tr key={a.name} className='border-t'>
								<td>{a.name}</td>
								<td>
									<code>{a.schedule}</code>
								</td>
								<td>{a.model}</td>
								<td>
									<input
										type='checkbox'
										checked={a.enabled}
										disabled={toggle.isPending}
										onChange={(e) =>
											toggle.mutate({name: a.name, enabled: e.target.checked})
										}
									/>
								</td>
								<td className='text-xs'>
									{formatLastRun(a.lastRunAt, a.lastRunStatus)}
								</td>
								<td className='text-xs'>{formatCost(a.lastRunCostUsd)}</td>
								<td>
									<Button
										size='sm'
										variant='outline'
										disabled={runNow.isPending}
										onClick={() => runNow.mutate({name: a.name})}
									>
										Run now
									</Button>
								</td>
							</tr>
						))}
						{agents.length === 0 && (
							<tr>
								<td colSpan={7} className='text-center py-4 text-text-secondary'>
									No agents installed.
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</section>
		</div>
	)
}
