import {useCpu} from '@/hooks/use-cpu'
import {useSystemMemory} from '@/hooks/use-memory'
import {useSystemDisk} from '@/hooks/use-disk'

import {WidgetContainer} from './widget-container'

export function SystemInfoCompactWidget() {
	const cpu = useCpu({poll: true})
	const mem = useSystemMemory({poll: true})
	const disk = useSystemDisk({poll: true})

	if (cpu.isLoading && mem.isLoading && disk.isLoading) {
		return (
			<WidgetContainer>
				<div className='flex flex-1 items-center justify-center'>
					<div className='h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-gray-500' />
				</div>
			</WidgetContainer>
		)
	}

	const cpuPct = cpu.percentUsed ?? 0
	const ramPct = mem.size ? ((mem.used ?? 0) / mem.size) * 100 : 0
	const diskPct = disk.size ? ((disk.used ?? 0) / disk.size) * 100 : 0

	const items = [
		{label: 'CPU', pct: cpuPct, color: '#3b82f6', gradient: 'from-blue-400 to-blue-600'},
		{label: 'RAM', pct: ramPct, color: '#10b981', gradient: 'from-emerald-400 to-emerald-600'},
		{label: 'Disk', pct: diskPct, color: '#8b5cf6', gradient: 'from-violet-400 to-violet-600'},
	]

	return (
		<WidgetContainer>
			<div className='flex flex-1 flex-col justify-center gap-3 px-4 py-3'>
				{items.map((item) => (
					<div key={item.label}>
						<div className='mb-1 flex items-baseline justify-between'>
							<span className='text-[10px] font-semibold uppercase tracking-wider text-gray-400'>{item.label}</span>
							<span className='text-[13px] font-bold tabular-nums' style={{color: item.color}}>
								{Math.round(item.pct)}%
							</span>
						</div>
						<div className='h-[6px] w-full overflow-hidden rounded-full bg-black/[0.05]'>
							<div
								className={`h-full rounded-full bg-gradient-to-r ${item.gradient}`}
								style={{width: `${Math.min(item.pct, 100)}%`, transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)'}}
							/>
						</div>
					</div>
				))}
			</div>
		</WidgetContainer>
	)
}
