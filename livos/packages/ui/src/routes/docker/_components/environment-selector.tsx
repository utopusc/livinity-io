// Phase 22 MH-03 — Environment selector dropdown for the Server Control header.
//
// Shows the current Docker host name and lets the admin switch between every
// row in `environments` (local + remote tcp-tls + agent envs from 22-03).
// Selecting an item updates the zustand store, which causes every Docker hook
// to re-fetch automatically because environmentId is part of each queryKey.
//
// Defensive: if the persisted env id is no longer in the env list (e.g. it
// was deleted in another tab), reset to LOCAL_ENV_ID. The Settings >
// Environments link at the bottom uses react-router-dom Link to stay SPA.

import {Link} from 'react-router-dom'
import {useEffect} from 'react'
import {
	IconBrandDocker,
	IconWifi,
	IconWifiOff,
	IconSettings,
} from '@tabler/icons-react'

import {
	Select,
	SelectContent,
	SelectItem,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from '@/shadcn-components/ui/select'
import {useEnvironments} from '@/hooks/use-environments'
import {LOCAL_ENV_ID, useEnvironmentStore} from '@/stores/environment-store'

export function EnvironmentSelector() {
	const {data: environments, isLoading} = useEnvironments()
	const {selectedEnvironmentId, setEnvironment} = useEnvironmentStore()

	// Defensive: if the persisted id is missing from the list (deleted in
	// another tab), reset to LOCAL_ENV_ID so the user isn't stranded.
	useEffect(() => {
		if (!environments || environments.length === 0) return
		const found = environments.find((e) => e.id === selectedEnvironmentId)
		if (!found) setEnvironment(LOCAL_ENV_ID)
	}, [environments, selectedEnvironmentId, setEnvironment])

	const current = environments?.find((e) => e.id === selectedEnvironmentId)

	return (
		<Select value={selectedEnvironmentId} onValueChange={setEnvironment}>
			<SelectTrigger className='h-9 w-full sm:w-[240px]'>
				<div className='flex items-center gap-2 min-w-0'>
					<IconBrandDocker size={14} className='shrink-0 text-text-secondary' />
					<SelectValue>
						<span className='truncate'>{isLoading ? 'Loading…' : current?.name ?? 'local'}</span>
					</SelectValue>
				</div>
			</SelectTrigger>
			<SelectContent>
				{(environments ?? []).map((env) => (
					<SelectItem key={env.id} value={env.id}>
						<div className='flex items-center justify-between gap-3 min-w-0'>
							<span className='truncate'>{env.name}</span>
							<span className='flex shrink-0 items-center gap-1.5 text-xs text-text-tertiary'>
								{env.type === 'agent' ? (
									<>
										{env.agentStatus === 'online' ? (
											<IconWifi size={12} className='text-emerald-500' />
										) : (
											<IconWifiOff size={12} className='text-amber-500' />
										)}
										agent · {env.agentStatus}
									</>
								) : (
									env.type
								)}
							</span>
						</div>
					</SelectItem>
				))}
				<SelectSeparator />
				<Link
					to='/settings'
					className='flex items-center gap-2 px-2 py-1.5 text-sm text-text-secondary hover:bg-surface-2 rounded-radius-sm cursor-pointer'
				>
					<IconSettings size={14} />
					Manage Environments…
				</Link>
			</SelectContent>
		</Select>
	)
}
