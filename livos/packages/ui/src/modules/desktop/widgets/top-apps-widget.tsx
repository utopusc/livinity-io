import {useMemo} from 'react'

import {useCpu} from '@/hooks/use-cpu'
import {useMemory} from '@/hooks/use-memory'

import {WidgetContainer} from './widget-container'

interface AppUsage {
	name: string
	cpuPct: number
	memPct: number
	score: number
}

export function TopAppsWidget() {
	const cpu = useCpu({poll: true})
	const mem = useMemory({poll: true})

	const topApps = useMemo((): AppUsage[] => {
		if (!cpu.data?.apps && !mem.data?.apps) return []

		const map = new Map<string, AppUsage>()

		for (const app of cpu.data?.apps ?? []) {
			map.set(app.id, {
				name: app.id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
				cpuPct: app.used ?? 0,
				memPct: 0,
				score: 0,
			})
		}

		const totalMem = mem.data?.size ?? 1
		for (const app of mem.data?.apps ?? []) {
			const pct = totalMem > 0 ? ((app.used ?? 0) / totalMem) * 100 : 0
			const existing = map.get(app.id)
			if (existing) {
				existing.memPct = pct
			} else {
				map.set(app.id, {name: app.id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()), cpuPct: 0, memPct: pct, score: 0})
			}
		}

		for (const app of map.values()) app.score = app.cpuPct * 2 + app.memPct

		return [...map.values()].filter((a) => a.score > 0.1).sort((a, b) => b.score - a.score).slice(0, 3)
	}, [cpu.data, mem.data])

	if (cpu.isLoading && mem.isLoading) {
		return (
			<WidgetContainer>
				<div className='flex flex-1 items-center justify-center'>
					<div className='h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-gray-500' />
				</div>
			</WidgetContainer>
		)
	}

	const colors = ['#3b82f6', '#8b5cf6', '#f59e0b']

	return (
		<WidgetContainer>
			<div className='px-4 pt-2.5 pb-1'>
				<span className='text-[10px] font-bold uppercase tracking-wider text-gray-400'>Top Apps</span>
			</div>
			<div className='flex flex-1 flex-col justify-center gap-2 px-4 pb-3'>
				{topApps.length === 0 ? (
					<span className='text-center text-[11px] text-gray-300'>Waiting for data...</span>
				) : (
					topApps.map((app, i) => (
						<div key={app.name}>
							<div className='mb-0.5 flex items-center justify-between'>
								<span className='truncate text-[11px] font-semibold text-gray-700'>{app.name}</span>
								<div className='flex gap-2'>
									<span className='text-[9px] font-bold tabular-nums text-blue-500'>{app.cpuPct.toFixed(1)}%</span>
									<span className='text-[9px] font-bold tabular-nums text-emerald-500'>{app.memPct.toFixed(1)}%</span>
								</div>
							</div>
							<div className='h-[4px] w-full overflow-hidden rounded-full bg-black/[0.04]'>
								<div
									className='h-full rounded-full'
									style={{
										width: `${Math.min(app.score, 100)}%`,
										backgroundColor: colors[i],
										transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
									}}
								/>
							</div>
						</div>
					))
				)}
			</div>
		</WidgetContainer>
	)
}
