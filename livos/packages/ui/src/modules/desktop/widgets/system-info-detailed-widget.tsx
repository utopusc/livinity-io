import {useCpu} from '@/hooks/use-cpu'
import {useSystemMemory} from '@/hooks/use-memory'
import {useSystemDisk} from '@/hooks/use-disk'
import {useCpuTemperature} from '@/hooks/use-cpu-temperature'
import {maybePrettyBytes} from '@/utils/pretty-bytes'

import {WidgetContainer} from './widget-container'

function Ring({value, label, sub, color, bg}: {value: number; label: string; sub: string; color: string; bg: string}) {
	const r = 30
	const circ = 2 * Math.PI * r
	const offset = circ - (Math.min(value, 100) / 100) * circ

	return (
		<div className='flex flex-col items-center'>
			<div className='relative'>
				<svg width='76' height='76' viewBox='0 0 76 76'>
					<circle cx='38' cy='38' r={r} fill='none' stroke={bg} strokeWidth='6' />
					<circle
						cx='38' cy='38' r={r} fill='none' stroke={color} strokeWidth='6' strokeLinecap='round'
						strokeDasharray={circ} strokeDashoffset={offset}
						transform='rotate(-90 38 38)'
						style={{transition: 'stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1)'}}
					/>
				</svg>
				<div className='absolute inset-0 flex flex-col items-center justify-center'>
					<span className='text-[15px] font-bold tabular-nums text-gray-800'>{label}</span>
				</div>
			</div>
			<span className='mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400'>{sub}</span>
		</div>
	)
}

export function SystemInfoDetailedWidget() {
	const cpu = useCpu({poll: true})
	const mem = useSystemMemory({poll: true})
	const disk = useSystemDisk({poll: true})
	const temp = useCpuTemperature()

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

	return (
		<WidgetContainer>
			<div className='flex flex-1 items-center justify-around px-3'>
				<Ring value={cpuPct} label={`${Math.round(cpuPct)}%`} sub='CPU' color='#3b82f6' bg='rgba(59,130,246,0.1)' />
				<Ring value={ramPct} label={maybePrettyBytes(mem.used)} sub='RAM' color='#10b981' bg='rgba(16,185,129,0.1)' />
				<Ring value={diskPct} label={maybePrettyBytes(disk.used)} sub='Disk' color='#8b5cf6' bg='rgba(139,92,246,0.1)' />
				{temp.temperature != null && (
					<div className='flex flex-col items-center'>
						<div className='flex h-[76px] items-center'>
							<span className='text-[28px] font-[200] tabular-nums text-gray-700'>
								{Math.round(temp.temperature)}°
							</span>
						</div>
						<span className='mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400'>Temp</span>
					</div>
				)}
			</div>
		</WidgetContainer>
	)
}
