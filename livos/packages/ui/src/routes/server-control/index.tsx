import {useState, useEffect, useRef, Fragment} from 'react'
import {useIsMobile} from '@/hooks/use-is-mobile'
import {motion, AnimatePresence} from 'framer-motion'
import {
	IconCpu,
	IconDatabase,
	IconRefresh,
	IconPlayerPlay,
	IconPlayerStop,
	IconRotateClockwise,
	IconCircuitResistor,
	IconLock,
	IconNetwork,
	IconBrandDocker,
	IconActivity,
	IconChevronDown,
	IconChevronRight,
	IconArrowUp,
	IconArrowDown,
	IconTemperature,
} from '@tabler/icons-react'
import {Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip as RechartsTooltip} from 'recharts'

import {useCpuForUi} from '@/hooks/use-cpu'
import {useCpuTemperature} from '@/hooks/use-cpu-temperature'
import {useSystemMemoryForUi} from '@/hooks/use-memory'
import {useSystemDiskForUi} from '@/hooks/use-disk'
import {trpcReact} from '@/trpc/trpc'
import {useContainers} from '@/hooks/use-containers'
import {formatBytes} from '@/hooks/use-images'
import {useNetworkStats, useDiskIO, useProcesses} from '@/hooks/use-monitoring'
import {usePM2} from '@/hooks/use-pm2'
import {useEngineInfo} from '@/hooks/use-engine-info'
import {useEnvironments} from '@/hooks/use-environments'
import {useEnvironmentStore} from '@/stores/environment-store'
// Cross-import from new Docker app home (relocated in Phase 27-02).
import {DomainsTab} from '../docker/resources/domains-tab'
import {Progress} from '@/shadcn-components/ui/progress'
import {Tabs, TabsList, TabsTrigger, TabsContent} from '@/shadcn-components/ui/tabs'
import {Table, TableHeader, TableBody, TableHead, TableRow, TableCell} from '@/shadcn-components/ui/table'
import {Button} from '@/shadcn-components/ui/button'
import {cn} from '@/shadcn-lib/utils'

// Phase 22 MH-03 — yellow warning when the selected environment is an agent
// type whose websocket is currently offline. Plan 22-03 will set agentStatus
// to 'online' once the agent connects.
function OfflineAgentBanner() {
	const {data: environments} = useEnvironments()
	const {selectedEnvironmentId} = useEnvironmentStore()
	const current = environments?.find((e) => e.id === selectedEnvironmentId)
	if (!current || current.type !== 'agent' || current.agentStatus === 'online') return null
	return (
		<div className='shrink-0 mx-4 sm:mx-6 mb-3 rounded-radius-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300'>
			Agent for <strong>{current.name}</strong> is offline — Docker calls will fail until it reconnects.
		</div>
	)
}

// Resource Card Component - matches Live Usage style
function ResourceCard({
	title,
	icon: Icon,
	value,
	valueSub,
	progressLabel,
	progress = 0,
	chart,
	active,
	onClick,
}: {
	title: string
	icon: React.ComponentType<{size?: number; className?: string}>
	value: string
	valueSub?: string
	progressLabel?: string
	progress?: number
	chart?: Array<{value: number}>
	active?: boolean
	onClick?: () => void
}) {
	return (
		<motion.button
			onClick={onClick}
			className='relative w-full text-left focus:outline-none'
			whileHover={{scale: 1.02}}
			whileTap={{scale: 0.98}}
		>
			<motion.div className='relative p-[2px]'>
				<motion.div
					className='absolute left-0 top-0 z-[-1] h-full w-full rounded-[16px] bg-gradient-to-b from-brand/90 to-brand/15'
					initial={{opacity: 0}}
					animate={{opacity: active ? 1 : 0}}
					transition={active ? {duration: 0.3, delay: 0.1} : {duration: 0.3}}
				/>
				<motion.div
					className='relative overflow-hidden rounded-[14px] border border-border-default bg-surface-base backdrop-blur-xl'
					initial={{backgroundColor: 'rgba(255, 255, 255, 0.5)'}}
					animate={{backgroundColor: active ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.5)'}}
				>
					{/* Background Chart */}
					{chart && (
						<ResponsiveContainer
							style={{position: 'absolute', bottom: -1, left: '-0.5%', zIndex: 0}}
							width='101%'
							height='100%'
						>
							<AreaChart data={chart} margin={{bottom: 0}}>
								<defs>
									<linearGradient id={`${title}GradientChartColor`} x1='0' y1='0' x2='0' y2='1'>
										<stop
											offset='5%'
											style={{stopColor: active ? 'hsl(var(--color-brand) / 0.3)' : 'rgba(0, 0, 0, 0.05)'}}
										/>
										<stop
											offset='95%'
											style={{stopColor: active ? 'hsl(var(--color-brand) / 0)' : 'rgba(0, 0, 0, 0)'}}
										/>
									</linearGradient>
								</defs>
								<YAxis domain={[0, 100]} hide={true} />
								<XAxis hide={true} />
								<Area
									isAnimationActive={false}
									type='monotone'
									dataKey='value'
									style={{stroke: active ? 'hsl(var(--color-brand) / 0.2)' : 'rgba(0, 0, 0, 0.05)'}}
									fillOpacity={1}
									fill={`url(#${title}GradientChartColor)`}
									legendType='none'
									dot={false}
								/>
							</AreaChart>
						</ResponsiveContainer>
					)}

					<div className='relative z-10 p-4'>
						<div className='mb-3 flex items-center gap-2'>
							<Icon size={16} className='text-text-secondary' />
							<span className='text-xs font-bold uppercase tracking-wider text-text-secondary'>{title}</span>
						</div>
						<div className='flex min-w-0 items-end gap-1.5'>
							<span className='text-2xl font-semibold leading-none tracking-tight text-text-primary'>{value}</span>
							{valueSub && <span className='text-sm font-medium text-text-tertiary'>{valueSub}</span>}
						</div>
						<div className='mt-3 space-y-2'>
							{progressLabel && <div className='text-xs font-medium text-text-tertiary'>{progressLabel}</div>}
							<Progress value={progress * 100} variant='primary' />
						</div>
					</div>
				</motion.div>
			</motion.div>
		</motion.button>
	)
}

// Action Button Component
function ActionButton({
	icon: Icon,
	onClick,
	disabled,
	color,
	title,
}: {
	icon: React.ComponentType<{size?: number}>
	onClick: () => void
	disabled?: boolean
	color: 'emerald' | 'amber' | 'blue' | 'red'
	title: string
}) {
	const colorClasses = {
		emerald: 'hover:bg-emerald-500/20 hover:text-emerald-400',
		amber: 'hover:bg-amber-500/20 hover:text-amber-400',
		blue: 'hover:bg-blue-500/20 hover:text-blue-400',
		red: 'hover:bg-red-500/20 hover:text-red-400',
	}

	return (
		<button
			onClick={onClick}
			disabled={disabled}
			title={title}
			className={cn(
				'rounded-lg p-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-text-tertiary transition-colors disabled:opacity-30 disabled:cursor-not-allowed',
				colorClasses[color],
			)}
		>
			<Icon size={16} />
		</button>
	)
}

// Format port mappings for display
function formatPorts(ports: Array<{hostPort: number | null; containerPort: number; protocol: string}>) {
	if (!ports.length) return '-'
	return ports
		.map((p) => (p.hostPort != null ? `${p.hostPort}:${p.containerPort}/${p.protocol}` : `${p.containerPort}/${p.protocol}`))
		.join(', ')
}

// State badge with color coding
function StateBadge({state}: {state: string}) {
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

// Placeholder tab content for future phases
function PlaceholderTab({title, icon: Icon}: {title: string; icon: React.ComponentType<{size?: number; className?: string}>}) {
	return (
		<div className='flex flex-col items-center justify-center py-20'>
			<Icon size={40} className='mb-3 text-text-tertiary' />
			<p className='text-sm font-medium text-text-secondary'>{title}</p>
			<p className='mt-1 text-xs text-text-tertiary'>Coming soon</p>
		</div>
	)
}

// Format bytes/sec to human-readable speed string
function formatSpeed(bytesPerSec: number): string {
	if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`
	if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
	if (bytesPerSec < 1024 * 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
	return `${(bytesPerSec / (1024 * 1024 * 1024)).toFixed(2)} GB/s`
}

// Custom tooltip for monitoring charts
function MonitoringChartTooltip({active, payload, labels}: {active?: boolean; payload?: any[]; labels: [string, string]}) {
	if (!active || !payload?.length) return null
	return (
		<div className='rounded-lg border border-border-default bg-surface-base px-3 py-2 shadow-sm'>
			{payload.map((entry: any, i: number) => (
				<div key={entry.dataKey} className='flex items-center gap-2 text-xs'>
					<span className='h-2 w-2 rounded-full' style={{backgroundColor: entry.color}} />
					<span className='text-text-secondary'>{labels[i]}:</span>
					<span className='font-medium text-text-primary'>{formatSpeed(entry.value)}</span>
				</div>
			))}
		</div>
	)
}

// Process state badge for monitoring tab
function ProcessStateBadge({state}: {state: string}) {
	const colorClasses: Record<string, string> = {
		running: 'bg-emerald-500/20 text-emerald-600',
		sleeping: 'bg-neutral-500/20 text-neutral-500',
		stopped: 'bg-red-500/20 text-red-600',
		zombie: 'bg-amber-500/20 text-amber-600',
	}
	const classes = colorClasses[state] ?? 'bg-neutral-500/20 text-neutral-500'
	return (
		<span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide', classes)}>
			{state}
		</span>
	)
}

// Docker Engine Info -- collapsible key-value grid (ENGINE-01, UI-06)
function EngineInfoSection() {
	const {engineInfo, isLoading, isError} = useEngineInfo()
	const [expanded, setExpanded] = useState(true)

	if (isLoading) return (
		<div className='rounded-xl border border-border-default bg-surface-base/50 p-4'>
			<div className='text-sm text-text-tertiary'>Loading engine info...</div>
		</div>
	)

	if (isError || !engineInfo) return null

	const formatMemory = (bytes: number) => {
		const gb = bytes / (1024 * 1024 * 1024)
		return `${gb.toFixed(1)} GB`
	}

	const fields = [
		{label: 'Version', value: engineInfo.version},
		{label: 'API Version', value: engineInfo.apiVersion},
		{label: 'OS', value: engineInfo.os},
		{label: 'Architecture', value: engineInfo.architecture},
		{label: 'Kernel', value: engineInfo.kernelVersion},
		{label: 'Storage Driver', value: engineInfo.storageDriver},
		{label: 'Logging Driver', value: engineInfo.loggingDriver},
		{label: 'CPUs', value: String(engineInfo.cpus)},
		{label: 'Memory', value: formatMemory(engineInfo.totalMemory)},
		{label: 'Docker Root', value: engineInfo.dockerRootDir},
		{label: 'Containers', value: String(engineInfo.containers)},
		{label: 'Images', value: String(engineInfo.images)},
	]

	return (
		<div className='rounded-xl border border-border-default bg-surface-base/50'>
			<button
				onClick={() => setExpanded(!expanded)}
				className='flex w-full items-center justify-between p-4 text-left'
			>
				<div className='flex items-center gap-2'>
					<IconBrandDocker size={16} className='text-text-secondary' />
					<span className='text-xs font-bold uppercase tracking-wider text-text-secondary'>Docker Engine</span>
				</div>
				{expanded ? <IconChevronDown size={14} className='text-text-tertiary' /> : <IconChevronRight size={14} className='text-text-tertiary' />}
			</button>
			{expanded && (
				<div className='grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border-default px-4 pb-4 pt-3 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4'>
					{fields.map((field) => (
						<div key={field.label}>
							<div className='text-[10px] font-bold uppercase tracking-wider text-text-tertiary'>{field.label}</div>
							<div className='text-sm font-medium text-text-primary truncate' title={field.value}>{field.value}</div>
						</div>
					))}
				</div>
			)}
		</div>
	)
}


// Overview tab - system health dashboard landing page
function OverviewTab() {
	// System resource hooks (tRPC query caching shares the same cache as parent -- no duplicate calls)
	const cpuUsage = useCpuForUi({poll: true})
	const memoryUsage = useSystemMemoryForUi({poll: true})
	const diskUsage = useSystemDiskForUi({poll: true})
	const {temperature, warning: tempWarning, isLoading: tempLoading} = useCpuTemperature()

	// Container and PM2 summaries
	const {runningCount: containerRunning, totalCount: containerTotal, isLoading: containersLoading} = useContainers()
	const {onlineCount: pm2Online, totalCount: pm2Total, isLoading: pm2Loading} = usePM2()

	// Network throughput
	const {data: networkData, isLoading: networkLoading} = useNetworkStats()

	// Chart data ring buffers for sparklines
	const [cpuChartData, setCpuChartData] = useState<Array<{value: number}>>(new Array(30).fill({value: 0}))
	const [memoryChartData, setMemoryChartData] = useState<Array<{value: number}>>(new Array(30).fill({value: 0}))

	useEffect(() => {
		setCpuChartData((prev) => [...prev.slice(1), {value: cpuUsage.progress * 100 || 0}])
	}, [cpuUsage.progress])

	useEffect(() => {
		setMemoryChartData((prev) => [...prev.slice(1), {value: memoryUsage.progress * 100 || 0}])
	}, [memoryUsage.progress])

	// Aggregate network speed
	const currentRx = networkData.reduce((sum, iface) => sum + (iface.rxSec ?? 0), 0)
	const currentTx = networkData.reduce((sum, iface) => sum + (iface.txSec ?? 0), 0)

	// Status dot color helpers
	const containerStatusColor = containerTotal === 0
		? 'bg-neutral-400'
		: containerRunning === containerTotal
			? 'bg-emerald-500'
			: containerRunning === 0
				? 'bg-red-500'
				: 'bg-amber-500'

	const pm2StatusColor = pm2Total === 0
		? 'bg-neutral-400'
		: pm2Online === pm2Total
			? 'bg-emerald-500'
			: pm2Online === 0
				? 'bg-red-500'
				: 'bg-amber-500'

	// Temperature color
	const tempColor = tempWarning ? 'text-red-500' : (temperature ?? 0) > 70 ? 'text-amber-500' : 'text-text-primary'

	return (
		<div className='space-y-3 p-3 sm:space-y-4 sm:p-4'>
			{/* Row 1: System Health Cards */}
			<div className='grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4'>
				{/* CPU Card */}
				<div className='relative overflow-hidden rounded-xl border border-border-default bg-surface-base p-3 sm:p-4'>
					{/* Background sparkline */}
					<div className='absolute inset-0 z-0'>
						<ResponsiveContainer width='100%' height='100%'>
							<AreaChart data={cpuChartData} margin={{bottom: 0}}>
								<defs>
									<linearGradient id='overviewCpuGradient' x1='0' y1='0' x2='0' y2='1'>
										<stop offset='5%' style={{stopColor: 'rgba(0, 0, 0, 0.04)'}} />
										<stop offset='95%' style={{stopColor: 'rgba(0, 0, 0, 0)'}} />
									</linearGradient>
								</defs>
								<YAxis domain={[0, 100]} hide />
								<XAxis hide />
								<Area
									isAnimationActive={false}
									type='monotone'
									dataKey='value'
									style={{stroke: 'rgba(0, 0, 0, 0.06)'}}
									fillOpacity={1}
									fill='url(#overviewCpuGradient)'
									dot={false}
								/>
							</AreaChart>
						</ResponsiveContainer>
					</div>
					<div className='relative z-10'>
						<div className='mb-2 flex items-center gap-2'>
							<IconCpu size={14} className='text-text-secondary' />
							<span className='text-xs font-bold uppercase tracking-wider text-text-secondary'>CPU</span>
						</div>
						<div className='text-2xl font-semibold text-text-primary'>{cpuUsage.value}</div>
						<div className='mt-2'>
							<Progress value={cpuUsage.progress * 100} variant='primary' />
						</div>
						<div className='mt-1 text-xs text-text-tertiary'>{cpuUsage.secondaryValue}</div>
					</div>
				</div>

				{/* RAM Card */}
				<div className='relative overflow-hidden rounded-xl border border-border-default bg-surface-base p-3 sm:p-4'>
					<div className='absolute inset-0 z-0'>
						<ResponsiveContainer width='100%' height='100%'>
							<AreaChart data={memoryChartData} margin={{bottom: 0}}>
								<defs>
									<linearGradient id='overviewMemGradient' x1='0' y1='0' x2='0' y2='1'>
										<stop offset='5%' style={{stopColor: 'rgba(0, 0, 0, 0.04)'}} />
										<stop offset='95%' style={{stopColor: 'rgba(0, 0, 0, 0)'}} />
									</linearGradient>
								</defs>
								<YAxis domain={[0, 100]} hide />
								<XAxis hide />
								<Area
									isAnimationActive={false}
									type='monotone'
									dataKey='value'
									style={{stroke: 'rgba(0, 0, 0, 0.06)'}}
									fillOpacity={1}
									fill='url(#overviewMemGradient)'
									dot={false}
								/>
							</AreaChart>
						</ResponsiveContainer>
					</div>
					<div className='relative z-10'>
						<div className='mb-2 flex items-center gap-2'>
							<IconCircuitResistor size={14} className='text-text-secondary' />
							<span className='text-xs font-bold uppercase tracking-wider text-text-secondary'>RAM</span>
						</div>
						<div className='flex items-end gap-1.5'>
							<span className='text-2xl font-semibold text-text-primary'>{memoryUsage.value}</span>
							{memoryUsage.valueSub && <span className='text-sm text-text-tertiary'>{memoryUsage.valueSub}</span>}
						</div>
						<div className='mt-2'>
							<Progress value={memoryUsage.progress * 100} variant='primary' />
						</div>
						<div className='mt-1 text-xs text-text-tertiary'>{memoryUsage.secondaryValue}</div>
					</div>
				</div>

				{/* Disk Card */}
				<div className='rounded-xl border border-border-default bg-surface-base p-3 sm:p-4'>
					<div className='mb-2 flex items-center gap-2'>
						<IconDatabase size={14} className='text-text-secondary' />
						<span className='text-xs font-bold uppercase tracking-wider text-text-secondary'>Disk</span>
					</div>
					<div className='flex items-end gap-1.5'>
						<span className='text-2xl font-semibold text-text-primary'>{diskUsage.value}</span>
						{diskUsage.valueSub && <span className='text-sm text-text-tertiary'>{diskUsage.valueSub}</span>}
					</div>
					<div className='mt-2'>
						<Progress value={diskUsage.progress * 100} variant='primary' />
					</div>
					<div className='mt-1 text-xs text-text-tertiary'>{diskUsage.secondaryValue}</div>
				</div>

				{/* Temperature Card */}
				<div className='rounded-xl border border-border-default bg-surface-base p-3 sm:p-4'>
					<div className='mb-2 flex items-center gap-2'>
						<IconTemperature size={14} className='text-text-secondary' />
						<span className='text-xs font-bold uppercase tracking-wider text-text-secondary'>Temp</span>
					</div>
					<div className={cn('text-2xl font-semibold', tempColor)}>
						{tempLoading ? '--' : temperature != null ? `${Math.round(temperature)}°C` : 'N/A'}
					</div>
					<div className='mt-2 text-xs text-text-tertiary'>
						{tempWarning ? 'High temperature!' : temperature != null ? (temperature > 70 ? 'Warm' : 'Normal') : 'Unavailable'}
					</div>
				</div>
			</div>

			{/* Row 2: Summary Cards */}
			<div className='grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4'>
				{/* Docker Containers */}
				<div className='rounded-xl border border-border-default bg-surface-base p-3 sm:p-4'>
					<div className='mb-3 flex items-center gap-2'>
						<IconBrandDocker size={16} className='text-text-secondary' />
						<span className='text-xs font-bold uppercase tracking-wider text-text-secondary'>Docker Containers</span>
					</div>
					{containersLoading ? (
						<div className='text-sm text-text-tertiary'>Loading...</div>
					) : (
						<div className='flex items-center gap-3'>
							<div className={cn('h-2 w-2 rounded-full', containerStatusColor)} />
							<div>
								<div className='text-2xl font-semibold text-text-primary'>
									{containerRunning} <span className='text-base font-normal text-text-tertiary'>/ {containerTotal}</span>
								</div>
								<div className='text-xs uppercase tracking-wider text-text-secondary'>containers running</div>
							</div>
						</div>
					)}
				</div>

				{/* PM2 Processes */}
				<div className='rounded-xl border border-border-default bg-surface-base p-3 sm:p-4'>
					<div className='mb-3 flex items-center gap-2'>
						<IconActivity size={16} className='text-text-secondary' />
						<span className='text-xs font-bold uppercase tracking-wider text-text-secondary'>PM2 Processes</span>
					</div>
					{pm2Loading ? (
						<div className='text-sm text-text-tertiary'>Loading...</div>
					) : (
						<div className='flex items-center gap-3'>
							<div className={cn('h-2 w-2 rounded-full', pm2StatusColor)} />
							<div>
								<div className='text-2xl font-semibold text-text-primary'>
									{pm2Online} <span className='text-base font-normal text-text-tertiary'>/ {pm2Total}</span>
								</div>
								<div className='text-xs uppercase tracking-wider text-text-secondary'>processes online</div>
							</div>
						</div>
					)}
				</div>

				{/* Network Throughput */}
				<div className='rounded-xl border border-border-default bg-surface-base p-3 sm:p-4'>
					<div className='mb-3 flex items-center gap-2'>
						<IconNetwork size={16} className='text-text-secondary' />
						<span className='text-xs font-bold uppercase tracking-wider text-text-secondary'>Network</span>
					</div>
					{networkLoading ? (
						<div className='text-sm text-text-tertiary'>Loading...</div>
					) : networkData.length === 0 ? (
						<div className='text-sm text-text-tertiary'>Calculating...</div>
					) : (
						<div className='space-y-1.5'>
							<div className='flex items-center gap-2'>
								<IconArrowDown size={14} className='text-blue-500' />
								<span className='text-sm font-medium text-text-primary'>{formatSpeed(currentRx)}</span>
								<span className='text-xs text-text-tertiary'>in</span>
							</div>
							<div className='flex items-center gap-2'>
								<IconArrowUp size={14} className='text-emerald-500' />
								<span className='text-sm font-medium text-text-primary'>{formatSpeed(currentTx)}</span>
								<span className='text-xs text-text-tertiary'>out</span>
							</div>
						</div>
					)}
				</div>
			</div>

			{/* Row 3: Docker Engine Info (ENGINE-01, UI-06) */}
			<EngineInfoSection />
		</div>
	)
}

// Monitoring tab - network I/O, disk I/O, and process list
function MonitoringTab() {
	const {history: networkHistory, data: networkData, isLoading: networkLoading} = useNetworkStats()
	const {history: diskHistory, isLoading: diskLoading} = useDiskIO()
	const [sortBy, setSortBy] = useState<'cpu' | 'memory'>('cpu')
	const {processes, isLoading: processesLoading} = useProcesses(sortBy)

	// Current aggregate network speed
	const currentRx = networkData.reduce((sum, iface) => sum + (iface.rxSec ?? 0), 0)
	const currentTx = networkData.reduce((sum, iface) => sum + (iface.txSec ?? 0), 0)

	// Current disk I/O speed
	const latestDisk = diskHistory.length > 0 ? diskHistory[diskHistory.length - 1] : null

	return (
		<div className='space-y-4 p-3 sm:space-y-6 sm:p-4'>
			{/* Section 1: Network I/O */}
			<div className='rounded-xl border border-border-default bg-surface-base/50 p-3 sm:p-4'>
				<div className='mb-3 flex items-center justify-between'>
					<div>
						<h3 className='text-sm font-semibold text-text-primary'>Network Traffic</h3>
						{networkHistory.length > 1 ? (
							<p className='mt-0.5 text-xs text-text-tertiary'>
								<span className='text-blue-500'>RX {formatSpeed(currentRx)}</span>
								{' / '}
								<span className='text-emerald-500'>TX {formatSpeed(currentTx)}</span>
							</p>
						) : (
							<p className='mt-0.5 text-xs text-text-tertiary'>Calculating...</p>
						)}
					</div>
				</div>
				{networkLoading || networkHistory.length < 2 ? (
					<div className='flex h-[200px] items-center justify-center'>
						<p className='text-xs text-text-tertiary'>
							{networkLoading ? 'Loading...' : 'Calculating...'}
						</p>
					</div>
				) : (
					<ResponsiveContainer width='100%' height={200}>
						<AreaChart data={networkHistory} margin={{top: 5, right: 5, bottom: 5, left: 5}}>
							<defs>
								<linearGradient id='networkRxGradient' x1='0' y1='0' x2='0' y2='1'>
									<stop offset='5%' stopColor='hsl(210, 80%, 60%)' stopOpacity={0.3} />
									<stop offset='95%' stopColor='hsl(210, 80%, 60%)' stopOpacity={0} />
								</linearGradient>
								<linearGradient id='networkTxGradient' x1='0' y1='0' x2='0' y2='1'>
									<stop offset='5%' stopColor='hsl(160, 80%, 45%)' stopOpacity={0.3} />
									<stop offset='95%' stopColor='hsl(160, 80%, 45%)' stopOpacity={0} />
								</linearGradient>
							</defs>
							<XAxis dataKey='time' hide />
							<YAxis hide />
							<RechartsTooltip content={<MonitoringChartTooltip labels={['Download', 'Upload']} />} />
							<Area
								type='monotone'
								dataKey='rxSec'
								stroke='hsl(210, 80%, 60%)'
								fill='url(#networkRxGradient)'
								fillOpacity={1}
								dot={false}
								isAnimationActive={false}
							/>
							<Area
								type='monotone'
								dataKey='txSec'
								stroke='hsl(160, 80%, 45%)'
								fill='url(#networkTxGradient)'
								fillOpacity={1}
								dot={false}
								isAnimationActive={false}
							/>
						</AreaChart>
					</ResponsiveContainer>
				)}
			</div>

			{/* Section 2: Disk I/O */}
			<div className='rounded-xl border border-border-default bg-surface-base/50 p-3 sm:p-4'>
				<div className='mb-3 flex items-center justify-between'>
					<div>
						<h3 className='text-sm font-semibold text-text-primary'>Disk I/O</h3>
						{latestDisk ? (
							<p className='mt-0.5 text-xs text-text-tertiary'>
								<span className='text-amber-500'>Read {formatSpeed(latestDisk.rIOSec)}</span>
								{' / '}
								<span className='text-violet-500'>Write {formatSpeed(latestDisk.wIOSec)}</span>
							</p>
						) : (
							<p className='mt-0.5 text-xs text-text-tertiary'>Calculating...</p>
						)}
					</div>
				</div>
				{diskLoading || diskHistory.length < 2 ? (
					<div className='flex h-[200px] items-center justify-center'>
						<p className='text-xs text-text-tertiary'>
							{diskLoading ? 'Loading...' : 'Calculating...'}
						</p>
					</div>
				) : (
					<ResponsiveContainer width='100%' height={200}>
						<AreaChart data={diskHistory} margin={{top: 5, right: 5, bottom: 5, left: 5}}>
							<defs>
								<linearGradient id='diskReadGradient' x1='0' y1='0' x2='0' y2='1'>
									<stop offset='5%' stopColor='hsl(40, 90%, 50%)' stopOpacity={0.3} />
									<stop offset='95%' stopColor='hsl(40, 90%, 50%)' stopOpacity={0} />
								</linearGradient>
								<linearGradient id='diskWriteGradient' x1='0' y1='0' x2='0' y2='1'>
									<stop offset='5%' stopColor='hsl(270, 70%, 55%)' stopOpacity={0.3} />
									<stop offset='95%' stopColor='hsl(270, 70%, 55%)' stopOpacity={0} />
								</linearGradient>
							</defs>
							<XAxis dataKey='time' hide />
							<YAxis hide />
							<RechartsTooltip content={<MonitoringChartTooltip labels={['Read', 'Write']} />} />
							<Area
								type='monotone'
								dataKey='rIOSec'
								stroke='hsl(40, 90%, 50%)'
								fill='url(#diskReadGradient)'
								fillOpacity={1}
								dot={false}
								isAnimationActive={false}
							/>
							<Area
								type='monotone'
								dataKey='wIOSec'
								stroke='hsl(270, 70%, 55%)'
								fill='url(#diskWriteGradient)'
								fillOpacity={1}
								dot={false}
								isAnimationActive={false}
							/>
						</AreaChart>
					</ResponsiveContainer>
				)}
			</div>

			{/* Section 3: Process List */}
			<div className='rounded-xl border border-border-default bg-surface-base/50 p-3 sm:p-4'>
				<div className='mb-3 flex items-center justify-between'>
					<h3 className='text-sm font-semibold text-text-primary'>Top Processes</h3>
					<div className='flex items-center gap-1'>
						<Button
							variant={sortBy === 'cpu' ? 'default' : 'ghost'}
							size='sm'
							className='h-7 px-2.5 text-xs'
							onClick={() => setSortBy('cpu')}
						>
							CPU
						</Button>
						<Button
							variant={sortBy === 'memory' ? 'default' : 'ghost'}
							size='sm'
							className='h-7 px-2.5 text-xs'
							onClick={() => setSortBy('memory')}
						>
							Memory
						</Button>
					</div>
				</div>
				{processesLoading ? (
					<div className='flex h-40 items-center justify-center'>
						<p className='text-xs text-text-tertiary'>Loading...</p>
					</div>
				) : processes.length === 0 ? (
					<div className='flex h-40 items-center justify-center'>
						<p className='text-xs text-text-tertiary'>No processes found</p>
					</div>
				) : (
					<div className='overflow-x-auto'>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className='w-16 text-xs'>PID</TableHead>
									<TableHead className='text-xs'>Name</TableHead>
									<TableHead className='w-20 text-right text-xs'>CPU%</TableHead>
									<TableHead className='w-20 text-right text-xs'>Mem%</TableHead>
									<TableHead className='w-24 text-xs'>State</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{processes.map((proc) => (
									<TableRow key={proc.pid}>
										<TableCell className='font-mono text-xs text-text-secondary'>{proc.pid}</TableCell>
										<TableCell className='max-w-[200px] truncate text-xs font-medium'>{proc.name}</TableCell>
										<TableCell className='text-right font-mono text-xs'>{proc.cpu.toFixed(1)}%</TableCell>
										<TableCell className='text-right font-mono text-xs'>{proc.memory.toFixed(1)}%</TableCell>
										<TableCell><ProcessStateBadge state={proc.state} /></TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				)}
			</div>
		</div>
	)
}


// Format uptime in milliseconds to human-readable string
function formatUptime(ms: number): string {
	if (!ms) return 'N/A'
	const seconds = Math.floor(ms / 1000)
	if (seconds < 60) return `${seconds}s`
	const minutes = Math.floor(seconds / 60)
	if (minutes < 60) return `${minutes}m`
	const hours = Math.floor(minutes / 60)
	const remainingMinutes = minutes % 60
	if (hours < 24) return `${hours}h ${remainingMinutes}m`
	const days = Math.floor(hours / 24)
	const remainingHours = hours % 24
	return `${days}d ${remainingHours}h`
}

// PM2 status badge with color coding
function PM2StatusBadge({status}: {status: string}) {
	const colorClasses: Record<string, string> = {
		online: 'bg-emerald-500/20 text-emerald-600',
		stopped: 'bg-red-500/20 text-red-600',
		errored: 'bg-amber-500/20 text-amber-600',
		launching: 'bg-blue-500/20 text-blue-600',
	}
	const classes = colorClasses[status] ?? 'bg-neutral-500/20 text-neutral-600'
	return (
		<span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide', classes)}>
			{status}
		</span>
	)
}

// PM2 Detail Panel - shown when a process row is expanded
function PM2DetailPanel({name}: {name: string}) {
	const describeQuery = trpcReact.pm2.describe.useQuery({name})
	const [logLines, setLogLines] = useState(200)
	const [autoScroll, setAutoScroll] = useState(true)
	const preRef = useRef<HTMLPreElement>(null)

	const logsQuery = trpcReact.pm2.logs.useQuery({name, lines: logLines}, {enabled: true})

	useEffect(() => {
		if (autoScroll && preRef.current && logsQuery.data) {
			preRef.current.scrollTop = preRef.current.scrollHeight
		}
	}, [logsQuery.data, autoScroll])

	const detail = describeQuery.data

	return (
		<div className='flex flex-col gap-4 p-3 sm:flex-row sm:p-4'>
			{/* Info Section */}
			<div className='w-full sm:w-[280px] sm:shrink-0 space-y-2'>
				<h4 className='text-xs font-semibold uppercase tracking-wider text-text-secondary mb-3'>Process Info</h4>
				{describeQuery.isLoading ? (
					<div className='space-y-2'>
						{Array.from({length: 7}).map((_, i) => (
							<div key={i} className='h-4 rounded bg-surface-2 animate-pulse' />
						))}
					</div>
				) : detail ? (
					<div className='space-y-1.5 text-xs'>
						{([
							['PID', detail.pid ? String(detail.pid) : 'N/A'],
							['Script', detail.script],
							['Working Dir', detail.cwd],
							['Node', detail.nodeVersion],
							['Mode', detail.execMode],
							['Restarts', String(detail.restarts)],
							['Uptime', formatUptime(detail.uptime)],
						] as const).map(([label, value]) => (
							<div key={label} className='flex items-start gap-2'>
								<span className='w-20 shrink-0 font-medium text-text-secondary'>{label}</span>
								<span className='truncate text-text-primary font-mono' title={value}>{value}</span>
							</div>
						))}
					</div>
				) : (
					<p className='text-xs text-text-tertiary'>Failed to load details</p>
				)}
			</div>

			{/* Log Section */}
			<div className='flex flex-1 flex-col min-w-0'>
				<div className='mb-2 flex items-center gap-3'>
					<h4 className='text-xs font-semibold uppercase tracking-wider text-text-secondary'>Logs</h4>
					<div className='flex items-center gap-1'>
						<input
							type='range'
							min={50}
							max={500}
							step={50}
							value={logLines}
							onChange={(e) => setLogLines(Number(e.target.value))}
							className='w-24 accent-brand'
						/>
						<span className='text-xs text-text-tertiary ml-1'>{logLines} lines</span>
					</div>
					<button
						onClick={() => logsQuery.refetch()}
						disabled={logsQuery.isFetching}
						className='ml-auto flex items-center gap-1 rounded-lg bg-surface-1 px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-surface-2 disabled:opacity-50'
					>
						<IconRefresh size={12} className={logsQuery.isFetching ? 'animate-spin' : ''} />
						Refresh
					</button>
				</div>
				<pre
					ref={preRef}
					className='flex-1 max-h-[300px] overflow-y-auto rounded-lg bg-neutral-900/50 p-3 font-mono text-xs text-neutral-200 leading-relaxed'
				>
					{logsQuery.isLoading ? 'Loading logs...' : logsQuery.data ?? 'No logs available'}
				</pre>
			</div>
		</div>
	)
}

// PM2 Tab Component
function PM2Tab() {
	const {
		processes,
		isLoading,
		isError,
		error,
		isFetching,
		refetch,
		manage,
		isManaging,
		actionResult,
		onlineCount,
		totalCount,
	} = usePM2()

	const [expandedProcess, setExpandedProcess] = useState<string | null>(null)

	return (
		<>
			{/* Summary Row */}
			<div className='mb-4 flex flex-wrap items-center justify-between gap-2'>
				<div className='text-sm text-text-secondary'>
					<span className='font-medium text-emerald-500'>{onlineCount}</span>
					<span className='mx-1'>/</span>
					<span>{totalCount}</span>
					<span className='ml-1'>online</span>
				</div>
				<button
					onClick={() => refetch()}
					disabled={isFetching}
					className='flex items-center gap-2 rounded-lg bg-surface-1 px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-2 disabled:opacity-50'
				>
					<IconRefresh size={14} className={isFetching ? 'animate-spin' : ''} />
					Refresh
				</button>
			</div>

			{/* Action Result Toast */}
			<AnimatePresence>
				{actionResult && (
					<motion.div
						initial={{opacity: 0, y: -10}}
						animate={{opacity: 1, y: 0}}
						exit={{opacity: 0, y: -10}}
						className={cn(
							'mb-4 rounded-lg px-4 py-3 text-sm font-medium',
							actionResult.type === 'success'
								? 'bg-emerald-500/20 text-emerald-600 border border-emerald-500/30'
								: 'bg-red-500/20 text-red-600 border border-red-500/30',
						)}
					>
						{actionResult.message}
					</motion.div>
				)}
			</AnimatePresence>

			{/* Process Table */}
			{isLoading ? (
				<div className='rounded-xl border border-border-default bg-surface-base p-12 text-center'>
					<IconRefresh size={24} className='mx-auto mb-3 animate-spin text-text-tertiary' />
					<p className='text-sm text-text-tertiary'>Loading PM2 processes...</p>
				</div>
			) : isError ? (
				<div className='rounded-xl border border-red-500/20 bg-red-500/10 p-8 text-center'>
					<IconActivity size={24} className='mx-auto mb-3 text-red-400' />
					<p className='text-sm text-red-400'>Failed to load PM2 processes</p>
					<p className='mt-1 text-xs text-red-400/60'>{error?.message}</p>
				</div>
			) : !processes.length ? (
				<div className='rounded-xl border border-border-default bg-surface-base p-12 text-center'>
					<IconActivity size={32} className='mx-auto mb-3 text-text-tertiary' />
					<p className='text-sm text-text-tertiary'>No PM2 processes found</p>
				</div>
			) : (
				<div className='overflow-x-auto'>
				<div className='rounded-xl border border-border-default bg-surface-base overflow-hidden'>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className='pl-4'>Name</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>CPU</TableHead>
								<TableHead>Memory</TableHead>
								<TableHead>Uptime</TableHead>
								<TableHead>Restarts</TableHead>
								<TableHead className='text-right pr-4'>Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{processes.map((process) => {
								const isOnline = process.status === 'online'
								const isExpanded = expandedProcess === process.name
								return (
									<Fragment key={process.name}>
										<TableRow
											onClick={() => setExpandedProcess(isExpanded ? null : process.name)}
											className={cn('cursor-pointer transition-colors hover:bg-surface-1/50', isExpanded && 'bg-surface-1')}
										>
											<TableCell className='pl-4 font-medium'>
												<div className='flex items-center gap-2'>
													{isExpanded ? (
														<IconChevronDown size={14} className='shrink-0 text-text-tertiary' />
													) : (
														<IconChevronRight size={14} className='shrink-0 text-text-tertiary' />
													)}
													{process.isProtected && (
														<IconLock size={14} className='shrink-0 text-amber-500' title='Protected process' />
													)}
													<span className='truncate' title={process.name}>
														{process.name}
													</span>
												</div>
											</TableCell>
											<TableCell>
												<PM2StatusBadge status={process.status} />
											</TableCell>
											<TableCell>
												<span className='text-sm text-text-secondary'>{process.cpu.toFixed(1)}%</span>
											</TableCell>
											<TableCell>
												<span className='text-sm text-text-secondary'>{formatBytes(process.memory)}</span>
											</TableCell>
											<TableCell>
												<span className='text-sm text-text-secondary'>{formatUptime(process.uptime)}</span>
											</TableCell>
											<TableCell>
												<span className='text-sm text-text-secondary'>{process.restarts}</span>
											</TableCell>
											<TableCell className='text-right pr-4'>
												<div className='flex items-center justify-end gap-1'>
													<span onClick={(e) => e.stopPropagation()}>
														<ActionButton
															icon={IconPlayerPlay}
															onClick={() => manage(process.name, 'start')}
															disabled={isManaging || isOnline}
															color='emerald'
															title='Start'
														/>
													</span>
													<span onClick={(e) => e.stopPropagation()}>
														<ActionButton
															icon={IconPlayerStop}
															onClick={() => manage(process.name, 'stop')}
															disabled={isManaging || !isOnline || process.isProtected}
															color='red'
															title={process.isProtected ? 'Protected -- cannot stop' : 'Stop'}
														/>
													</span>
													<span onClick={(e) => e.stopPropagation()}>
														<ActionButton
															icon={IconRotateClockwise}
															onClick={() => manage(process.name, 'restart')}
															disabled={isManaging}
															color='blue'
															title='Restart'
														/>
													</span>
												</div>
											</TableCell>
										</TableRow>
										{isExpanded && (
											<TableRow key={`${process.name}-detail`}>
												<TableCell colSpan={7} className='p-0 border-t border-border-default bg-surface-1/30'>
													<PM2DetailPanel name={process.name} />
												</TableCell>
											</TableRow>
										)}
									</Fragment>
								)
							})}
						</TableBody>
					</Table>
				</div>
				</div>
			)}
		</>
	)
}

export default function ServerControl() {
	const isMobile = useIsMobile()

	// System resource hooks
	const cpuUsage = useCpuForUi({poll: true})
	const memoryUsage = useSystemMemoryForUi({poll: true})
	const diskUsage = useSystemDiskForUi({poll: true})

	// Chart data state
	const [cpuChartData, setCpuChartData] = useState<Array<{value: number}>>(new Array(30).fill({value: 0}))
	const [memoryChartData, setMemoryChartData] = useState<Array<{value: number}>>(new Array(30).fill({value: 0}))

	// Update charts
	useEffect(() => {
		setCpuChartData((prev) => [...prev.slice(1), {value: cpuUsage.progress * 100 || 0}])
	}, [cpuUsage.progress])

	useEffect(() => {
		setMemoryChartData((prev) => [...prev.slice(1), {value: memoryUsage.progress * 100 || 0}])
	}, [memoryUsage.progress])

	return (
		<div className={cn('flex flex-col', !isMobile && 'h-full')}>
			<OfflineAgentBanner />

			{/* Resource Cards */}
			<div className='shrink-0 grid grid-cols-1 gap-3 px-4 pb-3 sm:grid-cols-3 sm:gap-4 sm:px-6 sm:pb-4'>
				<ResourceCard
					title='CPU'
					icon={IconCpu}
					value={cpuUsage.value}
					progressLabel={cpuUsage.secondaryValue}
					progress={cpuUsage.progress}
					chart={cpuChartData}
				/>
				<ResourceCard
					title='Memory'
					icon={IconCircuitResistor}
					value={memoryUsage.value}
					valueSub={memoryUsage.valueSub}
					progressLabel={memoryUsage.secondaryValue}
					progress={memoryUsage.progress}
					chart={memoryChartData}
				/>
				<ResourceCard
					title='Storage'
					icon={IconDatabase}
					value={diskUsage.value}
					valueSub={diskUsage.valueSub}
					progressLabel={diskUsage.secondaryValue}
					progress={diskUsage.progress}
				/>
			</div>

			{/* Tabbed Interface — Docker management surface lives in the Docker app
			    (Phase 27-02). Server Management is now Overview / PM2 / Monitoring / Domains only. */}
			<Tabs defaultValue='overview' className={cn('flex flex-col px-4 pb-3 sm:px-6 sm:pb-4', !isMobile && 'min-h-0 flex-1')}>
				<div className='shrink-0 overflow-x-auto -mx-4 px-4 sm:-mx-0 sm:px-0' style={{scrollbarWidth: 'none', msOverflowStyle: 'none'}}>
					<TabsList className='shrink-0 w-max justify-start gap-1 bg-transparent p-0 sm:w-full'>
						<TabsTrigger value='overview'>Overview</TabsTrigger>
						<TabsTrigger value='pm2'>PM2</TabsTrigger>
						<TabsTrigger value='monitoring'>Monitoring</TabsTrigger>
						<TabsTrigger value='domains'>Domains</TabsTrigger>
					</TabsList>
				</div>

				<TabsContent value='overview' className={isMobile ? '' : 'flex-1 overflow-auto'}>
					<OverviewTab />
				</TabsContent>
				<TabsContent value='pm2' className={isMobile ? '' : 'flex-1 overflow-auto'}>
					<PM2Tab />
				</TabsContent>
				<TabsContent value='monitoring' className={isMobile ? '' : 'flex-1 overflow-auto'}>
					<MonitoringTab />
				</TabsContent>
				<TabsContent value='domains' className={isMobile ? '' : 'flex-1 overflow-auto'}>
					<DomainsTab />
				</TabsContent>
			</Tabs>
		</div>
	)
}
