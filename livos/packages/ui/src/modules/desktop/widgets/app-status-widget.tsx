import {useApps} from '@/providers/apps'
import {trpcReact} from '@/trpc/trpc'

import {WidgetContainer} from './widget-container'

function StatusPill({state}: {state: string}) {
	if (state === 'running') {
		return (
			<span className='flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5'>
				<span className='relative flex h-1.5 w-1.5'>
					<span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60' />
					<span className='relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500' />
				</span>
				<span className='text-[9px] font-semibold text-emerald-700'>Running</span>
			</span>
		)
	}
	return (
		<span className='flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5'>
			<span className='h-1.5 w-1.5 rounded-full bg-gray-400' />
			<span className='text-[9px] font-semibold capitalize text-gray-500'>{state || 'stopped'}</span>
		</span>
	)
}

export function AppStatusWidget() {
	const {userApps, isLoading} = useApps()

	if (isLoading || !userApps) {
		return (
			<WidgetContainer>
				<div className='flex flex-1 items-center justify-center'>
					<div className='h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-gray-500' />
				</div>
			</WidgetContainer>
		)
	}

	return (
		<WidgetContainer>
			<div className='flex items-center justify-between px-4 pt-2.5 pb-1'>
				<span className='text-[10px] font-bold uppercase tracking-wider text-gray-400'>Containers</span>
				<span className='text-[10px] font-semibold tabular-nums text-gray-300'>{userApps.length}</span>
			</div>
			<div className='flex-1 overflow-y-auto px-2 pb-2 livinity-hide-scrollbar'>
				{userApps.length === 0 ? (
					<div className='flex flex-1 items-center justify-center py-6 text-xs text-gray-400'>No apps installed</div>
				) : (
					<div className='flex flex-col'>
						{userApps.map((app) => (
							<AppRow key={app.id} appId={app.id} name={app.name} icon={app.icon} />
						))}
					</div>
				)}
			</div>
		</WidgetContainer>
	)
}

function AppRow({appId, name, icon}: {appId: string; name: string; icon: string}) {
	const stateQ = trpcReact.apps.state.useQuery({appId}, {refetchInterval: 5000})
	const state = stateQ.data?.state ?? 'unknown'

	return (
		<div className='flex items-center gap-2.5 rounded-xl px-2 py-[6px] transition-colors hover:bg-black/[0.03]'>
			{icon ? (
				<img src={icon} alt='' className='h-6 w-6 shrink-0 rounded-lg shadow-sm' />
			) : (
				<div className='flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gray-200 text-[9px] font-bold text-gray-400'>?</div>
			)}
			<span className='flex-1 truncate text-[12px] font-medium text-gray-700'>{name}</span>
			<StatusPill state={state} />
		</div>
	)
}
