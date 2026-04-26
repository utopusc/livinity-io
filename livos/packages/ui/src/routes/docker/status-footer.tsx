// Round 2 hot-patch — Docker app sticky bottom StatusFooter.
//
// Hosts all the system stat pills that previously lived in StatusBar.
// Mounted as the LAST child of <main> in DockerApp (after the section scroll
// container). Uses sticky bottom-0 so it stays visible regardless of the
// active section's content height.
//
// Data sources match the original StatusBar (zero new backend):
//   - Docker version + cores + total RAM → useEngineInfo (docker.engineInfo)
//   - Free disk                          → trpcReact.system.systemDiskUsage
//   - Uptime                             → trpcReact.system.uptime
//   - Socket type                        → useEnvironments → current env.type
//   - Current time                       → useNow() (1s tick)
//   - Live indicator                     → useTrpcConnection() (1s WS poll)
//
// Visual consistency requirement (per Round 2 task spec): mirrors StatusBar's
// border-zinc-200 + bg-white/95 backdrop classes — only border-t / bottom-0
// differ from the header.

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
import {useNow} from './use-now'
import {useTrpcConnection} from './use-trpc-connection'

export function StatusFooter() {
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
		<footer
			className={cn(
				'sticky bottom-0 z-10 flex h-12 shrink-0 items-center gap-3 border-t border-zinc-200 bg-white/95 px-3 backdrop-blur',
				'dark:border-zinc-800 dark:bg-zinc-900/95',
			)}
		>
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
		</footer>
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
