import {TbDeviceDesktop} from 'react-icons/tb'

import {useSystemDiskForUi} from '@/hooks/use-disk'
import {useNavigate} from '@/features/files/hooks/use-navigate'
import {cn} from '@/shadcn-lib/utils'

export function SidebarStorage() {
	const sysDisk = useSystemDiskForUi({poll: true})
	const {navigateToDirectory, currentPath} = useNavigate()

	if (sysDisk.isLoading) return null

	const pct = Math.min(sysDisk.progress * 100, 100)
	const barColor = sysDisk.isDiskLow || sysDisk.isDiskFull ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-blue-500'
	const isActive = currentPath === '/Home'

	return (
		<button
			onClick={() => navigateToDirectory('/Home')}
			className={cn(
				'group flex w-full flex-col gap-2 rounded-xl px-2.5 py-2.5 text-left transition-all duration-200',
				'hover:bg-neutral-100/80',
				isActive
					? 'bg-neutral-100 shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
					: 'text-neutral-500 hover:text-neutral-800',
			)}
		>
			<div className='flex items-center gap-2.5'>
				<div className={cn('flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105', 'bg-slate-100')}>
					<TbDeviceDesktop className='h-3.5 w-3.5 text-slate-600' strokeWidth={2.5} />
				</div>
				<div className='flex flex-1 flex-col'>
					<span className={cn('text-[13px] leading-tight', isActive ? 'font-semibold text-neutral-900' : 'text-neutral-700')}>System</span>
					<span className='text-[10px] tabular-nums text-neutral-400'>
						{sysDisk.value} {sysDisk.valueSub}
					</span>
				</div>
			</div>
			<div className='w-full'>
				<div className='h-[5px] w-full overflow-hidden rounded-full bg-neutral-200/60'>
					<div
						className={cn('h-full rounded-full transition-all duration-500', barColor)}
						style={{width: `${pct}%`}}
					/>
				</div>
				<span className='mt-0.5 block text-[9px] tabular-nums text-neutral-400'>{sysDisk.secondaryValue}</span>
			</div>
		</button>
	)
}
