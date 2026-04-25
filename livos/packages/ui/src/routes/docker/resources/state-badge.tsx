// Phase 26 Plan 26-01 — Container state colour badge.
//
// Verbatim port of legacy routes/server-control/index.tsx:246-258 (deleted Phase 27-02).

import {cn} from '@/shadcn-lib/utils'

export function StateBadge({state}: {state: string}) {
	const colorClasses: Record<string, string> = {
		running: 'bg-emerald-500/20 text-emerald-600',
		exited: 'bg-red-500/20 text-red-600',
		paused: 'bg-amber-500/20 text-amber-600',
	}
	const classes = colorClasses[state] ?? 'bg-neutral-500/20 text-neutral-600'
	return (
		<span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide', classes)}>
			{state}
		</span>
	)
}
