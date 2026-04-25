// Phase 24-02 — Docker app top StatusBar.
//
// Sticky 48px-tall header rendered as the FIRST child of <main> in DockerApp.
// Layout (left → right):
//   [EnvironmentSelector] [Docker version] [Socket] [N cores] [GB RAM]
//   [GB free] [uptime] [HH:MM] [Live/Offline]   ┄ flex-1 ┄
//   [Search ⌘K] [AlertsBell] [ThemeToggle]
//
// Data sources (all consume existing v27.0 tRPC routes — zero new backend):
//   - Docker version + cores + total RAM → useEngineInfo (docker.engineInfo)
//   - Free disk                          → trpcReact.system.systemDiskUsage
//   - Uptime                             → trpcReact.system.uptime
//   - Socket type                        → useEnvironments → current env.type
//   - Current time                       → useNow() (1s tick)
//   - Live indicator                     → useTrpcConnection() (1s WS poll)
//
// EnvironmentSelector + AlertsBell are imported VERBATIM from the legacy
// routes/server-control/ directory. Plan 27 will relocate them into
// routes/docker/ once Stacks migration consumes the last legacy import.
// Until then, the cross-route import is correct and intentional.

import {
	type Icon,
	IconBrandDocker,
	IconCircleFilled,
	IconClock,
	IconCpu,
	IconDatabase,
	IconDeviceSdCard,
} from '@tabler/icons-react'
import {type ReactNode} from 'react'

import {useEngineInfo} from '@/hooks/use-engine-info'
import {useEnvironments} from '@/hooks/use-environments'
import {AlertsBell} from '@/routes/server-control/ai-alerts-bell'
import {EnvironmentSelector} from '@/routes/server-control/environment-selector'
import {cn} from '@/shadcn-lib/utils'
import {useSelectedEnvironmentId} from '@/stores/environment-store'
import {trpcReact} from '@/trpc/trpc'

import {
	formatDiskFree,
	formatRamGb,
	formatSocketType,
	formatTimeHHMM,
	formatUptime,
	type SocketKind,
} from './format'
import {SearchButton} from './search-button'
import {ThemeToggle} from './theme-toggle'
import {useNow} from './use-now'
import {useTrpcConnection} from './use-trpc-connection'

export function StatusBar() {
	const {engineInfo} = useEngineInfo()
	const {data: environments} = useEnvironments()
	const selectedId = useSelectedEnvironmentId()
	const current = environments?.find((e) => e.id === selectedId)
	const uptimeQ = trpcReact.system.uptime.useQuery(undefined, {refetchInterval: 30_000})
	const diskQ = trpcReact.system.systemDiskUsage.useQuery(undefined, {
		refetchInterval: 30_000,
		retry: false,
	})
	const now = useNow()
	const {connected} = useTrpcConnection()

	const versionLabel = engineInfo ? `Docker ${engineInfo.version}` : 'Docker —'
	const socketLabel = current ? formatSocketType(current.type as SocketKind) : 'Socket'
	const coresLabel = engineInfo ? `${engineInfo.cpus} cores` : '— cores'
	const ramLabel = engineInfo ? formatRamGb(engineInfo.totalMemory) : '— GB RAM'
	const diskLabel =
		diskQ.data?.available != null ? formatDiskFree(diskQ.data.available) : '— free'
	const uptimeLabel = uptimeQ.data != null ? formatUptime(uptimeQ.data) : 'Up —'
	const timeLabel = formatTimeHHMM(now)

	return (
		<header
			className={cn(
				'sticky top-0 z-10 flex h-12 shrink-0 items-center gap-3 border-b border-zinc-200 bg-white/95 px-3 backdrop-blur',
				'dark:border-zinc-800 dark:bg-zinc-900/95',
			)}
		>
			{/* Left: env selector */}
			<EnvironmentSelector />

			{/* Center: stat pills */}
			<div className='flex min-w-0 flex-1 items-center gap-2 overflow-x-auto'>
				<Pill icon={IconBrandDocker}>{versionLabel}</Pill>
				<Pill>{socketLabel}</Pill>
				<Pill icon={IconCpu}>{coresLabel}</Pill>
				<Pill icon={IconDatabase}>{ramLabel}</Pill>
				<Pill icon={IconDeviceSdCard}>{diskLabel}</Pill>
				<Pill icon={IconClock}>{uptimeLabel}</Pill>
				<Pill>{timeLabel}</Pill>
				<LivePill connected={connected} />
			</div>

			{/* Right: search + alerts + theme */}
			<div className='flex shrink-0 items-center gap-1'>
				<SearchButton />
				<AlertsBell />
				<ThemeToggle />
			</div>
		</header>
	)
}

function Pill({icon: PillIcon, children}: {icon?: Icon; children: ReactNode}) {
	return (
		<span
			className={cn(
				'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs',
				'border-zinc-200 bg-zinc-50 text-zinc-700',
				'dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300',
			)}
		>
			{PillIcon && <PillIcon size={12} className='text-zinc-500 dark:text-zinc-400' />}
			<span className='whitespace-nowrap font-mono tabular-nums'>{children}</span>
		</span>
	)
}

function LivePill({connected}: {connected: boolean}) {
	return (
		<span
			className={cn(
				'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs',
				connected
					? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
					: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400',
			)}
			aria-live='polite'
			aria-label={connected ? 'WebSocket connected' : 'WebSocket disconnected'}
		>
			<IconCircleFilled
				size={8}
				className={cn(
					connected ? 'text-emerald-500' : 'text-red-500',
					connected && 'animate-pulse',
				)}
			/>
			<span className='font-medium'>{connected ? 'Live' : 'Offline'}</span>
		</span>
	)
}
