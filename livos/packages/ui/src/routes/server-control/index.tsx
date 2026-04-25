import {useState, useEffect, useRef, useCallback, Fragment} from 'react'
import {useIsMobile} from '@/hooks/use-is-mobile'
import {motion, AnimatePresence} from 'framer-motion'
import {
	IconServer,
	IconCpu,
	IconDatabase,
	IconRefresh,
	IconPlayerPlay,
	IconPlayerStop,
	IconRotateClockwise,
	IconTrash,
	IconBox,
	IconCircuitResistor,
	IconLock,
	IconPhoto,
	IconFolder,
	IconNetwork,
	IconBrandDocker,
	IconActivity,
	IconSearch,
	IconX,
	IconPlus,
	IconChevronDown,
	IconChevronRight,
	IconArrowUp,
	IconArrowDown,
	IconTemperature,
	IconPencil,
	IconCopy,
	IconCheck,
	IconTag,
	IconDownload,
	IconHandStop,
	IconPlayerPause,
	IconUnlink,
	IconStack2,
	IconCloudDownload,
	IconShieldCheck,
	IconExternalLink,
	IconBrain,
	IconLoader2,
	IconSparkles,
} from '@tabler/icons-react'
import {Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip as RechartsTooltip} from 'recharts'

import {useCpuForUi} from '@/hooks/use-cpu'
import {useCpuTemperature} from '@/hooks/use-cpu-temperature'
import {useSystemMemoryForUi} from '@/hooks/use-memory'
import {useSystemDiskForUi} from '@/hooks/use-disk'
import {trpcReact} from '@/trpc/trpc'
import {useContainers} from '@/hooks/use-containers'
import {useImages, formatBytes} from '@/hooks/use-images'
import {useAiDiagnostics} from '@/hooks/use-ai-diagnostics'
import {useNetworkStats, useDiskIO, useProcesses} from '@/hooks/use-monitoring'
import {usePM2} from '@/hooks/use-pm2'
import {useVolumes} from '@/hooks/use-volumes'
import {useNetworks} from '@/hooks/use-networks'
import {useStacks} from '@/hooks/use-stacks'
import {useDockerEvents, type EventTypeFilter, type TimeRangeKey} from '@/hooks/use-docker-events'
import {useEngineInfo} from '@/hooks/use-engine-info'
import {useEnvironments} from '@/hooks/use-environments'
import {useEnvironmentStore} from '@/stores/environment-store'
import {EnvironmentSelector} from './environment-selector'
import {ContainerCreateForm} from './container-create-form'
import {ContainerDetailSheet} from './container-detail-sheet'
import {DomainsTab} from './domains-tab'
import {ComposeGraphViewer} from './compose-graph-viewer'
import {Progress} from '@/shadcn-components/ui/progress'
import {Tabs, TabsList, TabsTrigger, TabsContent} from '@/shadcn-components/ui/tabs'
import {Table, TableHeader, TableBody, TableHead, TableRow, TableCell} from '@/shadcn-components/ui/table'
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from '@/shadcn-components/ui/dialog'
import {Button} from '@/shadcn-components/ui/button'
import {Input} from '@/shadcn-components/ui/input'
import {Label} from '@/shadcn-components/ui/label'
import {Checkbox} from '@/shadcn-components/ui/checkbox'
import {Select, SelectTrigger, SelectValue, SelectContent, SelectItem} from '@/shadcn-components/ui/select'
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

// Events tab -- filterable Docker event log (EVENT-01, EVENT-02, UI-05)
function EventsTab() {
	const {events, isLoading, isError, error, isFetching, refetch, typeFilter, setTypeFilter, timeRange, setTimeRange} = useDockerEvents()

	// Color map for event action badges
	const actionColor = (action: string): string => {
		if (action === 'create' || action === 'start') return 'bg-emerald-100 text-emerald-700 border-emerald-200'
		if (action === 'destroy' || action === 'die' || action === 'remove' || action === 'delete') return 'bg-red-100 text-red-700 border-red-200'
		if (action === 'stop' || action === 'kill' || action === 'pause') return 'bg-amber-100 text-amber-700 border-amber-200'
		if (action === 'pull' || action === 'push' || action === 'tag') return 'bg-blue-100 text-blue-700 border-blue-200'
		if (action === 'connect' || action === 'disconnect') return 'bg-purple-100 text-purple-700 border-purple-200'
		if (action === 'unpause' || action === 'restart') return 'bg-cyan-100 text-cyan-700 border-cyan-200'
		return 'bg-neutral-100 text-neutral-700 border-neutral-200'
	}

	// Color map for event type badges
	const typeColor = (type: string): string => {
		if (type === 'container') return 'bg-blue-50 text-blue-600 border-blue-200'
		if (type === 'image') return 'bg-purple-50 text-purple-600 border-purple-200'
		if (type === 'network') return 'bg-teal-50 text-teal-600 border-teal-200'
		if (type === 'volume') return 'bg-orange-50 text-orange-600 border-orange-200'
		return 'bg-neutral-50 text-neutral-600 border-neutral-200'
	}

	const formatEventTime = (unixSeconds: number): string => {
		const d = new Date(unixSeconds * 1000)
		return d.toLocaleString(undefined, {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'})
	}

	return (
		<div className='space-y-4 p-4'>
			{/* Filter Row */}
			<div className='flex flex-wrap items-center gap-2 sm:gap-3'>
				<div className='flex items-center gap-2'>
					<Label className='text-xs text-text-secondary'>Type</Label>
					<Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as EventTypeFilter)}>
						<SelectTrigger className='h-8 w-[120px] sm:w-[140px] text-xs'>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value='all'>All Types</SelectItem>
							<SelectItem value='container'>Container</SelectItem>
							<SelectItem value='image'>Image</SelectItem>
							<SelectItem value='network'>Network</SelectItem>
							<SelectItem value='volume'>Volume</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<div className='flex items-center gap-2'>
					<Label className='text-xs text-text-secondary'>Range</Label>
					<Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRangeKey)}>
						<SelectTrigger className='h-8 w-[100px] sm:w-[120px] text-xs'>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value='1h'>Last 1 hour</SelectItem>
							<SelectItem value='6h'>Last 6 hours</SelectItem>
							<SelectItem value='24h'>Last 24 hours</SelectItem>
							<SelectItem value='7d'>Last 7 days</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<button
					onClick={() => refetch()}
					disabled={isFetching}
					className='flex items-center gap-1.5 rounded-lg bg-surface-1 px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface-2 disabled:opacity-50'
				>
					<IconRefresh size={12} className={isFetching ? 'animate-spin' : ''} />
					Refresh
				</button>
				<div className='ml-auto text-xs text-text-tertiary'>
					{events.length} event{events.length !== 1 ? 's' : ''}
					{isFetching && !isLoading && ' (updating...)'}
				</div>
			</div>

			{/* Events Table */}
			{isLoading ? (
				<div className='flex items-center justify-center py-12 text-sm text-text-tertiary'>Loading events...</div>
			) : isError ? (
				<div className='rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600'>
					Failed to load events: {error?.message || 'Unknown error'}
				</div>
			) : events.length === 0 ? (
				<div className='flex items-center justify-center py-12 text-sm text-text-tertiary'>No events in selected time range</div>
			) : (
				<div className='rounded-xl border border-border-default bg-surface-base/50'>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className='w-[170px] text-xs'>Time</TableHead>
								<TableHead className='w-[100px] text-xs'>Type</TableHead>
								<TableHead className='w-[110px] text-xs'>Action</TableHead>
								<TableHead className='text-xs'>Actor</TableHead>
								<TableHead className='text-xs'>Details</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{events.map((event, idx) => (
								<TableRow key={`${event.time}-${event.actorId}-${idx}`}>
									<TableCell className='text-xs text-text-secondary font-mono'>{formatEventTime(event.time)}</TableCell>
									<TableCell>
										<span className={cn('inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase', typeColor(event.type))}>
											{event.type}
										</span>
									</TableCell>
									<TableCell>
										<span className={cn('inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold', actionColor(event.action))}>
											{event.action}
										</span>
									</TableCell>
									<TableCell className='text-xs font-medium text-text-primary max-w-[200px] truncate' title={event.actor}>{event.actor}</TableCell>
									<TableCell className='text-xs text-text-tertiary max-w-[200px] truncate' title={event.actorId}>{event.actorId.slice(0, 12)}</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
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

// Remove confirmation dialog
function RemoveDialog({
	containerName,
	open,
	onOpenChange,
	onConfirm,
	isManaging,
}: {
	containerName: string
	open: boolean
	onOpenChange: (open: boolean) => void
	onConfirm: (confirmName: string) => void
	isManaging: boolean
}) {
	const [typedName, setTypedName] = useState('')

	// Reset typed name when dialog opens/closes
	useEffect(() => {
		if (!open) setTypedName('')
	}, [open])

	const canConfirm = typedName === containerName && !isManaging

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Remove Container</DialogTitle>
					<DialogDescription>
						This action cannot be undone. Type the container name to confirm:
					</DialogDescription>
				</DialogHeader>
				<div className='py-2'>
					<p className='mb-3 text-sm text-text-secondary'>
						Container: <span className='font-bold font-mono text-text-primary'>{containerName}</span>
					</p>
					<Input
						sizeVariant='short-square'
						placeholder='Type container name...'
						value={typedName}
						onValueChange={setTypedName}
						autoFocus
					/>
				</div>
				<DialogFooter>
					<Button variant='default' size='dialog' onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						variant='destructive'
						size='dialog'
						disabled={!canConfirm}
						onClick={() => onConfirm(typedName)}
					>
						Remove
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// Rename Container Dialog
function RenameDialog({
	containerName,
	open,
	onOpenChange,
	onConfirm,
	isPending,
	error,
}: {
	containerName: string
	open: boolean
	onOpenChange: (open: boolean) => void
	onConfirm: (newName: string) => void
	isPending: boolean
	error: any
}) {
	const [newName, setNewName] = useState('')

	// Reset when dialog opens/closes
	useEffect(() => {
		if (!open) setNewName('')
	}, [open])

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Rename Container</DialogTitle>
					<DialogDescription>
						Rename <span className='font-mono font-medium'>{containerName}</span> to a new name.
					</DialogDescription>
				</DialogHeader>
				<div className='py-2'>
					<Label className='mb-1.5 block text-text-secondary'>New Name</Label>
					<Input
						sizeVariant='short-square'
						placeholder='new-container-name'
						value={newName}
						onValueChange={setNewName}
						autoFocus
					/>
					{error && (
						<p className='mt-2 text-sm text-red-400'>{error.message}</p>
					)}
				</div>
				<DialogFooter>
					<Button variant='default' size='dialog' onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						variant='default'
						size='dialog'
						onClick={() => onConfirm(newName)}
						disabled={!newName.trim() || isPending}
					>
						{isPending ? 'Renaming...' : 'Rename'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// Format unix timestamp to relative date string
function formatRelativeDate(timestamp: number): string {
	const now = Math.floor(Date.now() / 1000)
	const diff = now - timestamp
	if (diff < 60) return 'just now'
	if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
	if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
	if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`
	return `${Math.floor(diff / 2592000)}mo ago`
}

// Remove Image confirmation dialog (simple)
function RemoveImageDialog({
	imageTag,
	open,
	onOpenChange,
	onConfirm,
	isRemoving,
}: {
	imageTag: string
	open: boolean
	onOpenChange: (open: boolean) => void
	onConfirm: () => void
	isRemoving: boolean
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Remove Image</DialogTitle>
					<DialogDescription>
						Are you sure you want to remove this image? This action cannot be undone.
					</DialogDescription>
				</DialogHeader>
				<div className='py-2'>
					<p className='text-sm text-text-secondary'>
						Image: <span className='font-bold font-mono text-text-primary'>{imageTag}</span>
					</p>
				</div>
				<DialogFooter>
					<Button variant='default' size='dialog' onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						variant='destructive'
						size='dialog'
						disabled={isRemoving}
						onClick={onConfirm}
					>
						Remove
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// Prune Images confirmation dialog
function PruneImagesDialog({
	open,
	onOpenChange,
	onConfirm,
	isPruning,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	onConfirm: () => void
	isPruning: boolean
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Prune Unused Images</DialogTitle>
					<DialogDescription>
						This will remove all dangling images. Are you sure?
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant='default' size='dialog' onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						variant='destructive'
						size='dialog'
						disabled={isPruning}
						onClick={onConfirm}
					>
						Prune
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// Pull Image dialog
function PullImageDialog({
	open,
	onOpenChange,
	onConfirm,
	isPulling,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	onConfirm: (image: string) => void
	isPulling: boolean
}) {
	const [imageName, setImageName] = useState('')

	useEffect(() => {
		if (!open) setImageName('')
	}, [open])

	return (
		<Dialog open={open} onOpenChange={isPulling ? undefined : onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Pull Image</DialogTitle>
					<DialogDescription>
						Pull a Docker image from a registry.
					</DialogDescription>
				</DialogHeader>
				<div className='py-2'>
					<Label htmlFor='pull-image-name' className='mb-2 block text-sm'>Image Name</Label>
					<Input
						id='pull-image-name'
						sizeVariant='short-square'
						placeholder='e.g. nginx:latest, ubuntu:22.04'
						value={imageName}
						onValueChange={setImageName}
						autoFocus
						disabled={isPulling}
					/>
				</div>
				<DialogFooter>
					<Button variant='default' size='dialog' onClick={() => onOpenChange(false)} disabled={isPulling}>
						Cancel
					</Button>
					<Button
						variant='default'
						size='dialog'
						disabled={!imageName.trim() || isPulling}
						onClick={() => onConfirm(imageName.trim())}
					>
						{isPulling ? 'Pulling...' : 'Pull'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// Tag Image dialog
function TagImageDialog({
	open,
	onOpenChange,
	imageId,
	currentTag,
	onConfirm,
	isTagging,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	imageId: string
	currentTag: string
	onConfirm: (id: string, repo: string, tag: string) => void
	isTagging: boolean
}) {
	const [repo, setRepo] = useState('')
	const [tag, setTag] = useState('latest')

	useEffect(() => {
		if (!open) {
			setRepo('')
			setTag('latest')
		}
	}, [open])

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Tag Image</DialogTitle>
					<DialogDescription>
						Add a new tag to this image.
					</DialogDescription>
				</DialogHeader>
				<div className='space-y-3 py-2'>
					<p className='text-sm text-text-secondary'>
						Current: <span className='font-bold font-mono text-text-primary'>{currentTag}</span>
					</p>
					<div>
						<Label htmlFor='tag-repo' className='mb-2 block text-sm'>Repository</Label>
						<Input
							id='tag-repo'
							sizeVariant='short-square'
							placeholder='e.g. myapp'
							value={repo}
							onValueChange={setRepo}
							autoFocus
						/>
					</div>
					<div>
						<Label htmlFor='tag-tag' className='mb-2 block text-sm'>Tag</Label>
						<Input
							id='tag-tag'
							sizeVariant='short-square'
							placeholder='e.g. v1.0'
							value={tag}
							onValueChange={setTag}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button variant='default' size='dialog' onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						variant='default'
						size='dialog'
						disabled={!repo.trim() || !tag.trim() || isTagging}
						onClick={() => onConfirm(imageId, repo.trim(), tag.trim())}
					>
						Tag
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// Expandable image layer history (Phase 19: rendered inside a Tabs panel)
function ImageHistoryPanel({imageId}: {imageId: string}) {
	const historyQuery = trpcReact.docker.imageHistory.useQuery({id: imageId})

	if (historyQuery.isLoading) {
		return (
			<div className='flex items-center gap-2 px-4 py-3 text-sm text-text-tertiary'>
				<IconRefresh size={14} className='animate-spin' />
				Loading layer history...
			</div>
		)
	}

	if (historyQuery.isError || !historyQuery.data) {
		return (
			<div className='px-4 py-3'>
				<p className='text-sm text-red-400'>Failed to load layer history</p>
			</div>
		)
	}

	if (historyQuery.data.length === 0) {
		return (
			<div className='px-4 py-3'>
				<p className='text-sm text-text-tertiary'>No layer history available.</p>
			</div>
		)
	}

	return (
		<div className='overflow-x-auto'>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead colSpan={2} className='pl-4'>Layer command</TableHead>
						<TableHead>Size</TableHead>
						<TableHead className='text-right pr-4'>Created</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{historyQuery.data.map((layer, idx) => (
						<TableRow key={`${imageId}-layer-${idx}`} className='bg-surface-1/50'>
							<TableCell className='pl-4 pr-4' colSpan={2}>
								<span
									className='block truncate max-w-[500px] font-mono text-xs text-text-secondary'
									title={layer.createdBy}
								>
									{layer.createdBy || '(empty)'}
								</span>
							</TableCell>
							<TableCell>
								<span className='text-xs text-text-tertiary'>
									{layer.size > 0 ? formatBytes(layer.size) : '0 B'}
								</span>
							</TableCell>
							<TableCell className='text-right pr-4'>
								<span className='text-xs text-text-tertiary'>
									{formatRelativeDate(layer.created)}
								</span>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	)
}

// Remove Volume confirmation dialog (typed name required)
function RemoveVolumeDialog({
	volumeName,
	open,
	onOpenChange,
	onConfirm,
	isRemoving,
}: {
	volumeName: string
	open: boolean
	onOpenChange: (open: boolean) => void
	onConfirm: (confirmName: string) => void
	isRemoving: boolean
}) {
	const [typedName, setTypedName] = useState('')

	useEffect(() => {
		if (!open) setTypedName('')
	}, [open])

	const canConfirm = typedName === volumeName && !isRemoving

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Remove Volume</DialogTitle>
					<DialogDescription>
						This will permanently delete the volume and its data. Type the volume name to confirm.
					</DialogDescription>
				</DialogHeader>
				<div className='py-2'>
					<p className='mb-3 text-sm text-text-secondary'>
						Volume: <span className='font-bold font-mono text-text-primary'>{volumeName}</span>
					</p>
					<Input
						sizeVariant='short-square'
						placeholder='Type volume name...'
						value={typedName}
						onValueChange={setTypedName}
						autoFocus
					/>
				</div>
				<DialogFooter>
					<Button variant='default' size='dialog' onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						variant='destructive'
						size='dialog'
						disabled={!canConfirm}
						onClick={() => onConfirm(typedName)}
					>
						Remove
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// Create Network Dialog
function CreateNetworkDialog({
	open,
	onOpenChange,
	onConfirm,
	isCreating,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	onConfirm: (input: {name: string; driver: string; subnet?: string; gateway?: string}) => void
	isCreating: boolean
}) {
	const [name, setName] = useState('')
	const [driver, setDriver] = useState('bridge')
	const [subnet, setSubnet] = useState('')
	const [gateway, setGateway] = useState('')

	useEffect(() => {
		if (!open) {
			setName('')
			setDriver('bridge')
			setSubnet('')
			setGateway('')
		}
	}, [open])

	const canSubmit = name.trim().length > 0 && !isCreating

	const handleSubmit = () => {
		if (!canSubmit) return
		onConfirm({
			name: name.trim(),
			driver,
			...(subnet.trim() ? {subnet: subnet.trim()} : {}),
			...(gateway.trim() ? {gateway: gateway.trim()} : {}),
		})
		onOpenChange(false)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Create Network</DialogTitle>
					<DialogDescription>Create a new Docker network for container isolation.</DialogDescription>
				</DialogHeader>
				<div className='space-y-4 py-2'>
					<div className='space-y-2'>
						<Label>Name</Label>
						<Input
							sizeVariant='short-square'
							placeholder='my-network'
							value={name}
							onValueChange={setName}
							autoFocus
						/>
					</div>
					<div className='space-y-2'>
						<Label>Driver</Label>
						<Select value={driver} onValueChange={setDriver}>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value='bridge'>bridge</SelectItem>
								<SelectItem value='overlay'>overlay</SelectItem>
								<SelectItem value='macvlan'>macvlan</SelectItem>
								<SelectItem value='host'>host</SelectItem>
								<SelectItem value='none'>none</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className='space-y-2'>
						<Label>Subnet <span className='text-text-tertiary font-normal'>(optional)</span></Label>
						<Input
							sizeVariant='short-square'
							placeholder='172.20.0.0/16'
							value={subnet}
							onValueChange={setSubnet}
						/>
					</div>
					<div className='space-y-2'>
						<Label>Gateway <span className='text-text-tertiary font-normal'>(optional)</span></Label>
						<Input
							sizeVariant='short-square'
							placeholder='172.20.0.1'
							value={gateway}
							onValueChange={setGateway}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button variant='default' size='dialog' onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button variant='default' size='dialog' disabled={!canSubmit} onClick={handleSubmit}>
						{isCreating ? 'Creating...' : 'Create Network'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// Remove Network Confirmation Dialog
function RemoveNetworkDialog({
	open,
	onOpenChange,
	onConfirm,
	isRemoving,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	onConfirm: () => void
	isRemoving: boolean
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Remove Network</DialogTitle>
					<DialogDescription>
						Are you sure you want to remove this network? This cannot be undone.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant='default' size='dialog' onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button variant='destructive' size='dialog' disabled={isRemoving} onClick={onConfirm}>
						{isRemoving ? 'Removing...' : 'Remove'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// Create Volume Dialog
function CreateVolumeDialog({
	open,
	onOpenChange,
	onConfirm,
	isCreating,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	onConfirm: (input: {name: string; driver?: string; driverOpts?: Record<string, string>}) => void
	isCreating: boolean
}) {
	const [name, setName] = useState('')
	const [driver, setDriver] = useState('local')
	const [driverOpts, setDriverOpts] = useState<Array<{key: string; value: string}>>([])

	useEffect(() => {
		if (!open) {
			setName('')
			setDriver('local')
			setDriverOpts([])
		}
	}, [open])

	const canSubmit = name.trim().length > 0 && !isCreating

	const handleSubmit = () => {
		if (!canSubmit) return
		const opts: Record<string, string> = {}
		for (const opt of driverOpts) {
			if (opt.key.trim()) {
				opts[opt.key.trim()] = opt.value
			}
		}
		onConfirm({
			name: name.trim(),
			...(driver !== 'local' ? {driver} : {}),
			...(Object.keys(opts).length > 0 ? {driverOpts: opts} : {}),
		})
		onOpenChange(false)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Create Volume</DialogTitle>
					<DialogDescription>Create a new Docker volume for persistent data storage.</DialogDescription>
				</DialogHeader>
				<div className='space-y-4 py-2'>
					<div className='space-y-2'>
						<Label>Name</Label>
						<Input
							sizeVariant='short-square'
							placeholder='my-volume'
							value={name}
							onValueChange={setName}
							autoFocus
						/>
					</div>
					<div className='space-y-2'>
						<Label>Driver</Label>
						<Input
							sizeVariant='short-square'
							placeholder='local'
							value={driver}
							onValueChange={setDriver}
						/>
					</div>
					<div className='space-y-2'>
						<Label>Driver Options <span className='text-text-tertiary font-normal'>(optional)</span></Label>
						{driverOpts.map((opt, i) => (
							<div key={i} className='flex items-center gap-2'>
								<Input
									sizeVariant='short-square'
									placeholder='key'
									value={opt.key}
									onValueChange={(v) => {
										const next = [...driverOpts]
										next[i] = {...next[i], key: v}
										setDriverOpts(next)
									}}
									className='flex-1'
								/>
								<Input
									sizeVariant='short-square'
									placeholder='value'
									value={opt.value}
									onValueChange={(v) => {
										const next = [...driverOpts]
										next[i] = {...next[i], value: v}
										setDriverOpts(next)
									}}
									className='flex-1'
								/>
								<button
									onClick={() => setDriverOpts(driverOpts.filter((_, idx) => idx !== i))}
									className='shrink-0 rounded-lg p-1.5 text-text-tertiary hover:bg-surface-2 hover:text-red-500'
								>
									<IconX size={14} />
								</button>
							</div>
						))}
						<Button
							variant='default'
							size='sm'
							onClick={() => setDriverOpts([...driverOpts, {key: '', value: ''}])}
						>
							<IconPlus size={14} className='mr-1' />
							Add Option
						</Button>
					</div>
				</div>
				<DialogFooter>
					<Button variant='default' size='dialog' onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button variant='default' size='dialog' disabled={!canSubmit} onClick={handleSubmit}>
						{isCreating ? 'Creating...' : 'Create Volume'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// Volume Usage Panel -- shows containers using a volume
function VolumeUsagePanel({volumeName}: {volumeName: string}) {
	const usageQuery = trpcReact.docker.volumeUsage.useQuery({name: volumeName})

	if (usageQuery.isLoading) {
		return (
			<div className='p-3'>
				<div className='space-y-2'>
					{Array.from({length: 2}).map((_, i) => (
						<div key={i} className='h-4 rounded bg-surface-2 animate-pulse' />
					))}
				</div>
			</div>
		)
	}

	const containers = usageQuery.data ?? []

	if (containers.length === 0) {
		return (
			<div className='px-4 py-3'>
				<p className='text-xs text-text-tertiary'>No containers using this volume</p>
			</div>
		)
	}

	return (
		<div className='px-4 py-3'>
			<div className='rounded-lg border border-border-default overflow-hidden'>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className='pl-3 text-xs'>Container</TableHead>
							<TableHead className='text-xs'>Mount Path</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{containers.map((c, i) => (
							<TableRow key={i}>
								<TableCell className='pl-3'>
									<span className='text-xs font-medium'>{c.containerName}</span>
								</TableCell>
								<TableCell>
									<span className='font-mono text-xs text-text-secondary'>{c.mountPath}</span>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</div>
	)
}

// Phase 19 — Vulnerability scan result panel (CGV-02/03)
type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

const SEVERITY_LIST: readonly Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const

function severityBadgeClasses(sev: Severity, active: boolean): string {
	const base = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer'
	const palette = {
		CRITICAL: 'bg-red-500/20 text-red-700 hover:bg-red-500/30',
		HIGH: 'bg-orange-500/20 text-orange-700 hover:bg-orange-500/30',
		MEDIUM: 'bg-yellow-500/20 text-yellow-800 hover:bg-yellow-500/30',
		LOW: 'bg-neutral-500/20 text-neutral-600 hover:bg-neutral-500/30',
	}
	return cn(base, palette[sev], active && 'ring-2 ring-current ring-offset-1')
}

function ScanResultPanel({imageRef}: {imageRef: string}) {
	const cachedQuery = trpcReact.docker.getCachedScan.useQuery(
		{imageRef},
		{retry: false, refetchOnWindowFocus: false},
	)
	const {scanImage, isScanning, scanResult, scanError} = useImages()
	const [expandedSeverity, setExpandedSeverity] = useState<Severity | null>(null)
	// Plan 23-01 (AID-04): plain-English CVE explainer
	const {
		explainVulnerabilities,
		explanationResult,
		explanationError,
		isExplaining,
		resetExplanation,
	} = useAiDiagnostics()

	// Show fresh scan result if mutation just ran for this image, else cached, else "not scanned yet"
	const result = scanResult && scanResult.imageRef === imageRef ? scanResult : (cachedQuery.data ?? null)

	if (isScanning) {
		return (
			<div className='flex items-center gap-3 px-4 py-6 text-sm text-text-secondary'>
				<IconRefresh size={16} className='animate-spin text-text-tertiary' />
				<span>Running Trivy — first scan may take 60-90s while pulling aquasec/trivy:latest...</span>
			</div>
		)
	}

	if (scanError && (!scanResult || scanResult.imageRef !== imageRef)) {
		return (
			<div className='px-4 py-4'>
				<div className='rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600'>
					{scanError.message}
				</div>
				<Button
					size='sm'
					variant='default'
					className='mt-3'
					onClick={() => scanImage(imageRef)}
				>
					Retry scan
				</Button>
			</div>
		)
	}

	if (!result) {
		return (
			<div className='flex flex-col items-center gap-3 py-8 text-center text-sm text-text-secondary'>
				<IconShieldCheck size={28} className='text-text-tertiary' />
				<p>No scan run yet for this image.</p>
				<Button size='sm' onClick={() => scanImage(imageRef)}>
					Run vulnerability scan
				</Button>
			</div>
		)
	}

	const totalCves = result.counts.CRITICAL + result.counts.HIGH + result.counts.MEDIUM + result.counts.LOW
	const filteredCves =
		expandedSeverity !== null ? result.cves.filter((c) => c.severity === expandedSeverity) : []

	return (
		<div className='space-y-3 px-4 py-3'>
			<div className='flex flex-wrap items-center gap-2 text-xs text-text-tertiary'>
				<span>Scanned {formatRelativeDate(Math.floor(result.scannedAt / 1000))}</span>
				{result.cached && (
					<span className='inline-flex items-center rounded bg-blue-500/15 px-1.5 py-0.5 font-medium text-blue-700'>
						cached
					</span>
				)}
				<span className='text-text-tertiary/70'>· {totalCves} CVE{totalCves === 1 ? '' : 's'}</span>
				<span className='text-text-tertiary/70'>· digest <span className='font-mono'>{result.imageDigest.slice(0, 19)}…</span></span>
				<div className='ml-auto'>
					<Button
						size='sm'
						variant='default'
						onClick={() => scanImage(imageRef, true)}
						disabled={isScanning}
					>
						<IconRefresh size={12} className='mr-1' />
						Rescan
					</Button>
				</div>
			</div>

			<div className='flex flex-wrap gap-2'>
				{SEVERITY_LIST.map((sev) => (
					<button
						key={sev}
						type='button'
						onClick={() => setExpandedSeverity(expandedSeverity === sev ? null : sev)}
						className={severityBadgeClasses(sev, expandedSeverity === sev)}
						disabled={result.counts[sev] === 0}
					>
						<span>{sev}</span>
						<span className='font-mono'>{result.counts[sev]}</span>
					</button>
				))}
				{/* Plan 23-01 (AID-04): plain-English CVE explainer.
				    Hidden when there are no CRITICAL/HIGH CVEs to avoid wasting
				    Kimi tokens on clean scans. */}
				{result.counts.CRITICAL + result.counts.HIGH > 0 && (
					<Button
						size='sm'
						variant='default'
						className='ml-auto'
						onClick={() => {
							resetExplanation()
							explainVulnerabilities({imageRef})
						}}
						disabled={isExplaining}
					>
						{isExplaining ? (
							<>
								<IconLoader2 size={12} className='mr-1 animate-spin' />
								Explaining...
							</>
						) : (
							<>
								<IconBrain size={12} className='mr-1' />
								Explain CVEs
							</>
						)}
					</Button>
				)}
			</div>

			{isExplaining && (
				<div className='flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-700'>
					<IconLoader2 size={14} className='animate-spin' />
					<span>Asking Kimi to explain the most critical CVEs...</span>
				</div>
			)}
			{explanationError && (
				<div className='rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600'>
					{explanationError.message}
				</div>
			)}
			{explanationResult && !isExplaining && (
				<div className='space-y-2'>
					{explanationResult.explanation && (
						<div className='rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700'>
							<div className='mb-1 font-medium text-emerald-600'>Explanation</div>
							<p className='whitespace-pre-wrap leading-relaxed'>
								{explanationResult.explanation}
							</p>
						</div>
					)}
					{explanationResult.upgradeSuggestion && (
						<div className='rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-700'>
							<div className='mb-1 font-medium text-blue-600'>Upgrade path</div>
							<p className='whitespace-pre-wrap leading-relaxed'>
								{explanationResult.upgradeSuggestion}
							</p>
						</div>
					)}
				</div>
			)}

			{expandedSeverity !== null && (
				<div className='overflow-x-auto rounded-lg border border-border-default bg-surface-base'>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className='pl-3'>CVE</TableHead>
								<TableHead>Package</TableHead>
								<TableHead>Installed</TableHead>
								<TableHead>Fixed</TableHead>
								<TableHead>CVSS</TableHead>
								<TableHead>Title</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{filteredCves.length === 0 ? (
								<TableRow>
									<TableCell colSpan={6} className='px-3 py-3 text-center text-xs text-text-tertiary'>
										No {expandedSeverity} CVEs.
									</TableCell>
								</TableRow>
							) : (
								filteredCves.map((cve) => (
									<TableRow key={`${cve.id}-${cve.packageName}-${cve.installedVersion}`}>
										<TableCell className='pl-3 align-top'>
											{cve.primaryUrl ? (
												<a
													href={cve.primaryUrl}
													target='_blank'
													rel='noopener noreferrer'
													className='inline-flex items-center gap-1 font-mono text-xs text-blue-600 hover:underline'
													title={cve.primaryUrl}
												>
													{cve.id}
													<IconExternalLink size={10} />
												</a>
											) : (
												<span className='font-mono text-xs text-text-secondary'>{cve.id}</span>
											)}
										</TableCell>
										<TableCell className='align-top'>
											<span className='font-mono text-xs text-text-secondary'>{cve.packageName || '-'}</span>
										</TableCell>
										<TableCell className='align-top'>
											<span className='font-mono text-xs text-text-secondary'>{cve.installedVersion || '-'}</span>
										</TableCell>
										<TableCell className='align-top'>
											<span className='font-mono text-xs'>
												{cve.fixedVersion ? (
													<span className='text-emerald-600'>{cve.fixedVersion}</span>
												) : (
													<span className='text-text-tertiary italic'>unfixed</span>
												)}
											</span>
										</TableCell>
										<TableCell className='align-top'>
											<span className='font-mono text-xs text-text-secondary'>
												{cve.cvss !== null ? cve.cvss.toFixed(1) : '-'}
											</span>
										</TableCell>
										<TableCell className='align-top'>
											<span
												className='block max-w-[420px] truncate text-xs text-text-secondary'
												title={cve.description || cve.title}
											>
												{cve.title || '-'}
											</span>
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</div>
			)}
		</div>
	)
}

// Images Tab Component
function ImagesTab() {
	const {
		images,
		isLoading,
		isError,
		error,
		isFetching,
		refetch,
		removeImage,
		isRemoving,
		pullImage,
		isPulling,
		tagImage,
		isTagging,
		pruneImages,
		isPruning,
		scanImage,
		isScanning,
		actionResult,
		totalSize,
		totalCount,
	} = useImages()

	const [removeTarget, setRemoveTarget] = useState<{id: string; tag: string} | null>(null)
	const [showPruneDialog, setShowPruneDialog] = useState(false)
	const [showPullDialog, setShowPullDialog] = useState(false)
	// Per-image active tab (defaults to 'history'; flips to 'scan' when user clicks Scan)
	const [imageTabState, setImageTabState] = useState<Record<string, 'history' | 'scan'>>({})
	const getActiveImageTab = (id: string): 'history' | 'scan' => imageTabState[id] ?? 'history'
	const setActiveImageTab = (id: string, value: 'history' | 'scan') =>
		setImageTabState((prev) => ({...prev, [id]: value}))
	const [tagTarget, setTagTarget] = useState<{id: string; tag: string} | null>(null)
	const [expandedImage, setExpandedImage] = useState<string | null>(null)

	return (
		<>
			{/* Summary Row */}
			<div className='mb-4 flex flex-wrap items-center justify-between gap-2'>
				<div className='text-sm text-text-secondary'>
					<span className='font-medium text-text-primary'>{totalCount}</span>
					<span className='ml-1'>images,</span>
					<span className='ml-1 font-medium text-text-primary'>{formatBytes(totalSize)}</span>
					<span className='ml-1'>total</span>
				</div>
				<div className='flex flex-wrap items-center gap-2'>
					<Button
						variant='default'
						size='sm'
						onClick={() => setShowPullDialog(true)}
						disabled={isPulling}
					>
						<IconDownload size={14} className='mr-1.5' />
						{isPulling ? 'Pulling...' : 'Pull Image'}
					</Button>
					<Button
						variant='default'
						size='sm'
						onClick={() => setShowPruneDialog(true)}
						disabled={isPruning}
					>
						Prune Unused Images
					</Button>
					<button
						onClick={() => refetch()}
						disabled={isFetching}
						className='flex items-center gap-2 rounded-lg bg-surface-1 px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-2 disabled:opacity-50'
					>
						<IconRefresh size={14} className={isFetching ? 'animate-spin' : ''} />
						Refresh
					</button>
				</div>
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

			{/* Images Table */}
			{isLoading ? (
				<div className='rounded-xl border border-border-default bg-surface-base p-12 text-center'>
					<IconRefresh size={24} className='mx-auto mb-3 animate-spin text-text-tertiary' />
					<p className='text-sm text-text-tertiary'>Loading images...</p>
				</div>
			) : isError ? (
				<div className='rounded-xl border border-red-500/20 bg-red-500/10 p-8 text-center'>
					<IconPhoto size={24} className='mx-auto mb-3 text-red-400' />
					<p className='text-sm text-red-400'>Failed to load images</p>
					<p className='mt-1 text-xs text-red-400/60'>{error?.message}</p>
				</div>
			) : !images.length ? (
				<div className='rounded-xl border border-border-default bg-surface-base p-12 text-center'>
					<IconPhoto size={32} className='mx-auto mb-3 text-text-tertiary' />
					<p className='text-sm text-text-tertiary'>No Docker images found</p>
				</div>
			) : (
				<div className='overflow-x-auto'>
				<div className='rounded-xl border border-border-default bg-surface-base overflow-hidden'>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className='pl-4'>Repository:Tag</TableHead>
								<TableHead>Size</TableHead>
								<TableHead>Created</TableHead>
								<TableHead className='text-right pr-4'>Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{images.map((image) => {
								const isNone = image.repoTags.length === 1 && image.repoTags[0] === '<none>:<none>'
								const primaryTag = isNone ? '<none>:<none>' : image.repoTags[0]
								const extraCount = image.repoTags.length - 1
								const isExpanded = expandedImage === image.id
								return (
									<Fragment key={image.id}>
										<TableRow className='cursor-pointer' onClick={() => setExpandedImage(isExpanded ? null : image.id)}>
											<TableCell className='pl-4'>
												<div className='flex items-center gap-2'>
													{isExpanded
														? <IconChevronDown size={14} className='shrink-0 text-text-tertiary' />
														: <IconChevronRight size={14} className='shrink-0 text-text-tertiary' />
													}
													<span className={cn('truncate font-mono text-sm', isNone && 'italic text-text-tertiary')} title={image.repoTags.join(', ')}>
														{primaryTag}
													</span>
													{extraCount > 0 && (
														<span className='inline-flex items-center rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-600'>
															+{extraCount} more
														</span>
													)}
												</div>
											</TableCell>
											<TableCell>
												<span className='text-sm text-text-secondary'>{formatBytes(image.size)}</span>
											</TableCell>
											<TableCell>
												<span className='text-sm text-text-secondary'>{formatRelativeDate(image.created)}</span>
											</TableCell>
											<TableCell className='text-right pr-4'>
												<div className='flex items-center justify-end gap-0.5' onClick={(e) => e.stopPropagation()}>
													<ActionButton
														icon={IconShieldCheck}
														onClick={() => {
															setExpandedImage(image.id)
															setActiveImageTab(image.id, 'scan')
															scanImage(isNone ? image.id : primaryTag)
														}}
														disabled={isScanning || isNone}
														color='amber'
														title={isNone ? 'Cannot scan untagged image' : 'Scan for vulnerabilities'}
													/>
													<ActionButton
														icon={IconTag}
														onClick={() => setTagTarget({id: image.id, tag: primaryTag})}
														disabled={isTagging}
														color='blue'
														title='Tag image'
													/>
													<ActionButton
														icon={IconTrash}
														onClick={() => setRemoveTarget({id: image.id, tag: primaryTag})}
														disabled={isRemoving}
														color='red'
														title='Remove image'
													/>
												</div>
											</TableCell>
										</TableRow>
										{isExpanded && (
											<TableRow>
												<TableCell colSpan={4} className='p-0 border-t border-border-default bg-surface-1/30'>
													<Tabs
														value={getActiveImageTab(image.id)}
														onValueChange={(v) => setActiveImageTab(image.id, v as 'history' | 'scan')}
														className='px-4 py-3'
													>
														<TabsList className='mb-3'>
															<TabsTrigger value='history'>Layer history</TabsTrigger>
															<TabsTrigger value='scan'>Vulnerabilities</TabsTrigger>
														</TabsList>
														<TabsContent value='history'>
															<ImageHistoryPanel imageId={image.id} />
														</TabsContent>
														<TabsContent value='scan'>
															<ScanResultPanel imageRef={isNone ? image.id : primaryTag} />
														</TabsContent>
													</Tabs>
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

			{/* Remove Image Dialog */}
			{removeTarget && (
				<RemoveImageDialog
					imageTag={removeTarget.tag}
					open={!!removeTarget}
					onOpenChange={(open) => {
						if (!open) setRemoveTarget(null)
					}}
					onConfirm={() => {
						removeImage(removeTarget.id, true)
						setRemoveTarget(null)
					}}
					isRemoving={isRemoving}
				/>
			)}

			{/* Prune Images Dialog */}
			<PruneImagesDialog
				open={showPruneDialog}
				onOpenChange={setShowPruneDialog}
				onConfirm={() => {
					pruneImages()
					setShowPruneDialog(false)
				}}
				isPruning={isPruning}
			/>

			{/* Pull Image Dialog */}
			<PullImageDialog
				open={showPullDialog}
				onOpenChange={setShowPullDialog}
				onConfirm={(image) => {
					pullImage(image)
					setShowPullDialog(false)
				}}
				isPulling={isPulling}
			/>

			{/* Tag Image Dialog */}
			{tagTarget && (
				<TagImageDialog
					open={!!tagTarget}
					onOpenChange={(open) => { if (!open) setTagTarget(null) }}
					imageId={tagTarget.id}
					currentTag={tagTarget.tag}
					onConfirm={(id, repo, tag) => {
						tagImage(id, repo, tag)
						setTagTarget(null)
					}}
					isTagging={isTagging}
				/>
			)}
		</>
	)
}

// Volumes Tab Component
function VolumesTab() {
	const {
		volumes,
		isLoading,
		isError,
		error,
		isFetching,
		refetch,
		removeVolume,
		isRemoving,
		createVolume,
		isCreatingVolume,
		actionResult,
		totalCount,
	} = useVolumes()

	const [removeTarget, setRemoveTarget] = useState<string | null>(null)
	const [showCreateDialog, setShowCreateDialog] = useState(false)
	const [expandedVolume, setExpandedVolume] = useState<string | null>(null)

	return (
		<>
			{/* Summary Row */}
			<div className='mb-4 flex flex-wrap items-center justify-between gap-2'>
				<div className='text-sm text-text-secondary'>
					<span className='font-medium text-text-primary'>{totalCount}</span>
					<span className='ml-1'>volumes</span>
				</div>
				<div className='flex flex-wrap items-center gap-2'>
					<Button variant='default' size='sm' onClick={() => setShowCreateDialog(true)} disabled={isCreatingVolume}>
						<IconPlus size={14} className='mr-1.5' />
						{isCreatingVolume ? 'Creating...' : 'Create Volume'}
					</Button>
					<button
						onClick={() => refetch()}
						disabled={isFetching}
						className='flex items-center gap-2 rounded-lg bg-surface-1 px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-2 disabled:opacity-50'
					>
						<IconRefresh size={14} className={isFetching ? 'animate-spin' : ''} />
						Refresh
					</button>
				</div>
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

			{/* Volumes Table */}
			{isLoading ? (
				<div className='rounded-xl border border-border-default bg-surface-base p-12 text-center'>
					<IconRefresh size={24} className='mx-auto mb-3 animate-spin text-text-tertiary' />
					<p className='text-sm text-text-tertiary'>Loading volumes...</p>
				</div>
			) : isError ? (
				<div className='rounded-xl border border-red-500/20 bg-red-500/10 p-8 text-center'>
					<IconFolder size={24} className='mx-auto mb-3 text-red-400' />
					<p className='text-sm text-red-400'>Failed to load volumes</p>
					<p className='mt-1 text-xs text-red-400/60'>{error?.message}</p>
				</div>
			) : !volumes.length ? (
				<div className='rounded-xl border border-border-default bg-surface-base p-12 text-center'>
					<IconFolder size={32} className='mx-auto mb-3 text-text-tertiary' />
					<p className='text-sm text-text-tertiary'>No Docker volumes found</p>
				</div>
			) : (
				<div className='overflow-x-auto'>
				<div className='rounded-xl border border-border-default bg-surface-base overflow-hidden'>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className='pl-4'>Name</TableHead>
								<TableHead>Driver</TableHead>
								<TableHead>Mount Point</TableHead>
								<TableHead className='text-right pr-4'>Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{volumes.map((volume) => {
								const isExpanded = expandedVolume === volume.name
								return (
									<Fragment key={volume.name}>
										<TableRow>
											<TableCell className='pl-4'>
												<div className='flex items-center gap-2'>
													<button
														onClick={() => setExpandedVolume(isExpanded ? null : volume.name)}
														className='shrink-0 text-text-tertiary hover:text-text-primary transition-colors'
													>
														{isExpanded
															? <IconChevronDown size={14} />
															: <IconChevronRight size={14} />
														}
													</button>
													<span className='font-mono text-sm font-medium'>{volume.name}</span>
												</div>
											</TableCell>
											<TableCell>
												<span className='text-sm text-text-secondary'>{volume.driver}</span>
											</TableCell>
											<TableCell>
												<span className='truncate font-mono text-xs text-text-secondary' title={volume.mountpoint}>
													{volume.mountpoint}
												</span>
											</TableCell>
											<TableCell className='text-right pr-4'>
												<ActionButton
													icon={IconTrash}
													onClick={() => setRemoveTarget(volume.name)}
													disabled={isRemoving}
													color='red'
													title='Remove volume'
												/>
											</TableCell>
										</TableRow>
										{isExpanded && (
											<TableRow>
												<TableCell colSpan={4} className='p-0 bg-surface-1/50'>
													<VolumeUsagePanel volumeName={volume.name} />
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

			{/* Remove Volume Dialog */}
			{removeTarget && (
				<RemoveVolumeDialog
					volumeName={removeTarget}
					open={!!removeTarget}
					onOpenChange={(open) => {
						if (!open) setRemoveTarget(null)
					}}
					onConfirm={(confirmName) => {
						removeVolume(removeTarget, confirmName)
						setRemoveTarget(null)
					}}
					isRemoving={isRemoving}
				/>
			)}

			{/* Create Volume Dialog */}
			<CreateVolumeDialog
				open={showCreateDialog}
				onOpenChange={setShowCreateDialog}
				onConfirm={(input) => createVolume(input)}
				isCreating={isCreatingVolume}
			/>
		</>
	)
}

// Networks Tab Component
function NetworksTab() {
	const {
		networks,
		isLoading,
		isError,
		error,
		isFetching,
		refetch,
		inspectNetwork,
		clearInspect,
		inspectedNetworkData,
		isInspecting,
		totalCount,
		createNetwork,
		isCreatingNetwork,
		removeNetwork,
		isRemovingNetwork,
		disconnectNetwork,
		isDisconnecting,
		actionResult,
	} = useNetworks()

	const [showCreateDialog, setShowCreateDialog] = useState(false)
	const [removeTarget, setRemoveTarget] = useState<string | null>(null)

	return (
		<>
			{/* Summary Row */}
			<div className='mb-4 flex flex-wrap items-center justify-between gap-2'>
				<div className='text-sm text-text-secondary'>
					<span className='font-medium text-text-primary'>{totalCount}</span>
					<span className='ml-1'>networks</span>
				</div>
				<div className='flex flex-wrap items-center gap-2'>
					<Button variant='default' size='sm' onClick={() => setShowCreateDialog(true)} disabled={isCreatingNetwork}>
						<IconPlus size={14} className='mr-1.5' />
						{isCreatingNetwork ? 'Creating...' : 'Create Network'}
					</Button>
					<button
						onClick={() => refetch()}
						disabled={isFetching}
						className='flex items-center gap-2 rounded-lg bg-surface-1 px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-2 disabled:opacity-50'
					>
						<IconRefresh size={14} className={isFetching ? 'animate-spin' : ''} />
						Refresh
					</button>
				</div>
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

			{/* Networks Table */}
			{isLoading ? (
				<div className='rounded-xl border border-border-default bg-surface-base p-12 text-center'>
					<IconRefresh size={24} className='mx-auto mb-3 animate-spin text-text-tertiary' />
					<p className='text-sm text-text-tertiary'>Loading networks...</p>
				</div>
			) : isError ? (
				<div className='rounded-xl border border-red-500/20 bg-red-500/10 p-8 text-center'>
					<IconNetwork size={24} className='mx-auto mb-3 text-red-400' />
					<p className='text-sm text-red-400'>Failed to load networks</p>
					<p className='mt-1 text-xs text-red-400/60'>{error?.message}</p>
				</div>
			) : !networks.length ? (
				<div className='rounded-xl border border-border-default bg-surface-base p-12 text-center'>
					<IconNetwork size={32} className='mx-auto mb-3 text-text-tertiary' />
					<p className='text-sm text-text-tertiary'>No Docker networks found</p>
				</div>
			) : (
				<div className='overflow-x-auto'>
				<div className='rounded-xl border border-border-default bg-surface-base overflow-hidden'>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className='pl-4'>Name</TableHead>
								<TableHead>Driver</TableHead>
								<TableHead>Scope</TableHead>
								<TableHead>Containers</TableHead>
								<TableHead className='text-right pr-4'>Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{networks.map((network) => (
								<TableRow key={network.id}>
									<TableCell className='pl-4'>
										<span className='text-sm font-medium'>{network.name}</span>
									</TableCell>
									<TableCell>
										<span className='text-sm text-text-secondary'>{network.driver}</span>
									</TableCell>
									<TableCell>
										<span className='inline-flex items-center rounded-full bg-neutral-500/10 px-2 py-0.5 text-[11px] font-medium text-text-secondary'>
											{network.scope}
										</span>
									</TableCell>
									<TableCell>
										<span className='text-sm text-text-secondary'>{network.containerCount}</span>
									</TableCell>
									<TableCell className='text-right pr-4'>
										<div className='flex items-center justify-end gap-0.5'>
											<ActionButton
												icon={IconSearch}
												onClick={() => inspectNetwork(network.id)}
												disabled={isInspecting}
												color='blue'
												title='Inspect network'
											/>
											<ActionButton
												icon={IconTrash}
												onClick={() => setRemoveTarget(network.id)}
												disabled={isRemovingNetwork}
												color='red'
												title='Remove network'
											/>
										</div>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
				</div>
			)}

			{/* Network Inspect Card */}
			<AnimatePresence>
				{inspectedNetworkData && (
					<motion.div
						initial={{opacity: 0, y: 10}}
						animate={{opacity: 1, y: 0}}
						exit={{opacity: 0, y: 10}}
						className='mt-4 rounded-xl border border-border-default bg-surface-base p-4'
					>
						<div className='mb-3 flex items-center justify-between'>
							<div>
								<h3 className='text-sm font-semibold text-text-primary'>{inspectedNetworkData.name}</h3>
								<p className='text-xs text-text-secondary'>
									{inspectedNetworkData.driver} / {inspectedNetworkData.scope}
								</p>
							</div>
							<button
								onClick={clearInspect}
								className='rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-primary'
								title='Close'
							>
								<IconX size={16} />
							</button>
						</div>
						{inspectedNetworkData.containers.length === 0 ? (
							<p className='text-xs text-text-tertiary'>No containers connected to this network</p>
						) : (
							<div className='rounded-lg border border-border-default overflow-hidden'>
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead className='pl-3 text-xs'>Container</TableHead>
											<TableHead className='text-xs'>IPv4 Address</TableHead>
											<TableHead className='text-xs'>MAC Address</TableHead>
											<TableHead className='text-xs text-right pr-3'>Actions</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{inspectedNetworkData.containers.map((container) => (
											<TableRow key={container.name}>
												<TableCell className='pl-3'>
													<span className='text-xs font-medium'>{container.name}</span>
												</TableCell>
												<TableCell>
													<span className='font-mono text-xs text-text-secondary'>{container.ipv4 || '-'}</span>
												</TableCell>
												<TableCell>
													<span className='font-mono text-xs text-text-secondary'>{container.macAddress || '-'}</span>
												</TableCell>
												<TableCell className='text-right pr-3'>
													<ActionButton
														icon={IconUnlink}
														onClick={() => disconnectNetwork(inspectedNetworkData.id, container.name)}
														disabled={isDisconnecting}
														color='red'
														title='Disconnect container'
													/>
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>
						)}
					</motion.div>
				)}
			</AnimatePresence>

			{/* Create Network Dialog */}
			<CreateNetworkDialog
				open={showCreateDialog}
				onOpenChange={setShowCreateDialog}
				onConfirm={(input) => createNetwork(input)}
				isCreating={isCreatingNetwork}
			/>

			{/* Remove Network Dialog */}
			{removeTarget && (
				<RemoveNetworkDialog
					open={!!removeTarget}
					onOpenChange={(open) => {
						if (!open) setRemoveTarget(null)
					}}
					onConfirm={() => {
						removeNetwork(removeTarget)
						setRemoveTarget(null)
					}}
					isRemoving={isRemovingNetwork}
				/>
			)}
		</>
	)
}

// Plan 23-01 (AID-03) — natural-language compose generator. Lives inside the
// DeployStackForm Tabs primitive next to YAML / Git. Uses useAiDiagnostics
// to call docker.generateComposeFromPrompt; on success renders a read-only
// preview with a "Use this YAML" button that writes the YAML into the
// outer composeYaml state and switches the tab back to 'yaml' so the user
// can review/edit before clicking Deploy.
function AiComposeTab({
	prompt,
	setPrompt,
	onUseYaml,
}: {
	prompt: string
	setPrompt: (v: string) => void
	onUseYaml: (yaml: string) => void
}) {
	const {generateCompose, composeResult, composeError, isGeneratingCompose, resetCompose} =
		useAiDiagnostics()
	const promptValid = prompt.trim().length >= 10 && prompt.trim().length <= 2000

	return (
		<div className='space-y-3'>
			<div className='space-y-1.5'>
				<Label htmlFor='ai-compose-prompt'>Describe your stack</Label>
				<textarea
					id='ai-compose-prompt'
					value={prompt}
					onChange={(e) => setPrompt(e.target.value)}
					placeholder={`e.g. "Nextcloud with Redis and MariaDB, expose on 8080. Use latest stable images."`}
					className='w-full rounded-lg border border-border-default bg-neutral-900 px-4 py-3 text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-brand/50'
					style={{
						fontSize: '13px',
						minHeight: '100px',
						lineHeight: '1.5',
						resize: 'vertical',
					}}
					maxLength={2000}
					spellCheck={false}
				/>
				<div className='flex items-center justify-between text-xs text-text-tertiary'>
					<span>{prompt.trim().length}/2000 characters (min 10)</span>
					<Button
						type='button'
						size='sm'
						disabled={!promptValid || isGeneratingCompose}
						onClick={() => {
							resetCompose()
							generateCompose({prompt: prompt.trim()})
						}}
					>
						{isGeneratingCompose ? (
							<>
								<IconLoader2 size={14} className='mr-1 animate-spin' />
								Generating...
							</>
						) : (
							<>
								<IconSparkles size={14} className='mr-1' />
								Generate
							</>
						)}
					</Button>
				</div>
			</div>

			{isGeneratingCompose && (
				<div className='flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-700'>
					<IconLoader2 size={14} className='animate-spin' />
					<span>Asking Kimi to generate compose YAML — this can take up to 30s...</span>
				</div>
			)}

			{composeError && (
				<div className='rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600'>
					{composeError.message}
				</div>
			)}

			{composeResult && composeResult.yaml && (
				<div className='space-y-2'>
					<div className='flex items-center justify-between'>
						<Label>Generated YAML preview</Label>
						<Button
							type='button'
							size='sm'
							variant='default'
							onClick={() => onUseYaml(composeResult.yaml)}
						>
							<IconCheck size={14} className='mr-1' />
							Use this YAML
						</Button>
					</div>
					<textarea
						readOnly
						value={composeResult.yaml}
						className='w-full rounded-lg border border-border-default bg-neutral-950 px-4 py-3 text-white focus:outline-none'
						style={{
							fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
							fontSize: '12px',
							minHeight: '300px',
							lineHeight: '1.5',
							resize: 'vertical',
							tabSize: 2,
						}}
					/>
					{composeResult.warnings && composeResult.warnings.length > 0 && (
						<div className='rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 space-y-0.5'>
							{composeResult.warnings.map((w, i) => (
								<div key={i}>· {w}</div>
							))}
						</div>
					)}
				</div>
			)}

			{composeResult && !composeResult.yaml && (
				<div className='rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-600'>
					Kimi did not return a compose YAML. Try rephrasing the prompt with more specific
					service names and ports.
				</div>
			)}
		</div>
	)
}

// Deploy/Edit Stack Form (full-page overlay like ContainerCreateForm)
function DeployStackForm({
	open,
	onClose,
	editStackName,
	onDeploySuccess,
}: {
	open: boolean
	onClose: () => void
	editStackName: string | null
	onDeploySuccess: () => void
}) {
	const [stackName, setStackName] = useState('')
	const [composeYaml, setComposeYaml] = useState('')
	// `hasValue` is client-side only — signals "this is a pre-loaded stored secret;
	// leaving `value` blank means KEEP existing". `secret` flags a value that must
	// never touch disk (sent to server, server encrypts to Redis).
	const [envVars, setEnvVars] = useState<
		Array<{key: string; value: string; secret?: boolean; hasValue?: boolean}>
	>([])
	const [nameError, setNameError] = useState('')

	// Plan 21-02: Source-of-stack tab state ('yaml' = paste compose, 'git' = clone repo).
	// Plan 23-01 (AID-03): adds 'ai' = generate from natural-language prompt.
	const [tab, setTab] = useState<'yaml' | 'git' | 'ai'>('yaml')
	const [aiPrompt, setAiPrompt] = useState('')
	const [gitUrl, setGitUrl] = useState('')
	const [gitBranch, setGitBranch] = useState('main')
	const [gitComposePath, setGitComposePath] = useState('docker-compose.yml')
	const [gitCredentialId, setGitCredentialId] = useState<string | null>(null)
	const [showCredentialDialog, setShowCredentialDialog] = useState(false)

	const isEditMode = !!editStackName
	// Edit mode is YAML-only in v1. Switching a stack between YAML and git would
	// require backend support in editStack (out of scope for 21-02; v28 follow-up).
	const showGitTab = !isEditMode

	// Fetch existing compose YAML and env vars when editing
	const {data: composeData, isLoading: isLoadingCompose} = trpcReact.docker.getStackCompose.useQuery(
		{name: editStackName!},
		{enabled: isEditMode && open},
	)
	const {data: envData, isLoading: isLoadingEnv} = trpcReact.docker.getStackEnv.useQuery(
		{name: editStackName!},
		{enabled: isEditMode && open},
	)

	// Fetch git credentials list (only when form is open; refetched on demand from
	// the inline AddGitCredentialDialog).
	const credentialsQuery = trpcReact.docker.listGitCredentials.useQuery(undefined, {
		enabled: open && !isEditMode,
	})
	const credentials = (credentialsQuery.data ?? []) as Array<{id: string; name: string; type: string}>

	const {deployStack, isDeploying, editStack, isEditing, lastDeployResult, clearLastDeployResult} = useStacks()
	const isBusy = isDeploying || isEditing
	// Show webhook URL panel after a successful git deploy. The form stays open
	// until the user clicks Done — otherwise the secret would be lost on close.
	const showWebhookPanel = Boolean(lastDeployResult?.webhookSecret) && tab === 'git'

	// Populate form when edit data loads
	useEffect(() => {
		if (isEditMode && composeData) {
			setComposeYaml(composeData.yaml)
			setStackName(editStackName)
		}
	}, [composeData, isEditMode, editStackName])

	useEffect(() => {
		if (isEditMode && envData) {
			// Server returns {key, value, secret, hasValue}. Secret rows come
			// back with value='' (redacted) — the form treats blank + hasValue
			// as "keep existing" on submit.
			setEnvVars(
				envData.envVars.length > 0
					? envData.envVars.map((e: any) => ({
							key: e.key,
							value: e.value ?? '',
							secret: Boolean(e.secret),
							hasValue: Boolean(e.hasValue),
						}))
					: [],
			)
		}
	}, [envData, isEditMode])

	// Reset form when closing
	useEffect(() => {
		if (!open) {
			setStackName('')
			setComposeYaml('')
			setEnvVars([])
			setNameError('')
			// Plan 21-02: also reset git tab state + clear any lingering deploy result.
			setTab('yaml')
			setAiPrompt('')
			setGitUrl('')
			setGitBranch('main')
			setGitComposePath('docker-compose.yml')
			setGitCredentialId(null)
			setShowCredentialDialog(false)
			clearLastDeployResult()
		}
	}, [open, clearLastDeployResult])

	if (!open) return null

	// Show loading state when fetching edit data
	if (isEditMode && (isLoadingCompose || isLoadingEnv)) {
		return (
			<div className='absolute inset-0 z-50 flex flex-col items-center justify-center bg-surface-base'>
				<IconRefresh size={32} className='animate-spin text-text-tertiary' />
				<p className='mt-3 text-sm text-text-tertiary'>Loading stack configuration...</p>
			</div>
		)
	}

	const addEnvVar = () => setEnvVars([...envVars, {key: '', value: '', secret: false}])
	const removeEnvVar = (i: number) => setEnvVars(envVars.filter((_, idx) => idx !== i))
	const updateEnvVar = (i: number, field: 'key' | 'value' | 'secret', val: string | boolean) => {
		setEnvVars((prev) => prev.map((e, idx) => (idx === i ? {...e, [field]: val} : e)))
	}

	const handleSubmit = () => {
		// Validate name
		if (!isEditMode) {
			if (!stackName.trim()) {
				setNameError('Stack name is required')
				return
			}
			if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(stackName.trim())) {
				setNameError('Must start with alphanumeric and contain only [a-zA-Z0-9_.-]')
				return
			}
		}
		setNameError('')

		// Strip UI-only `hasValue`; keep {key, value, secret} for tRPC.
		// Blank-value secret rows with hasValue=true are kept as-is so the backend
		// `editStack` can recognise them as "keep existing stored secret".
		const filteredEnv = envVars
			.filter((e) => e.key.trim())
			.map((e) => ({key: e.key, value: e.value, secret: Boolean(e.secret)}))
		const baseInput = {
			name: isEditMode ? (editStackName as string) : stackName.trim(),
			envVars: filteredEnv.length > 0 ? filteredEnv : undefined,
		}

		// Plan 21-02 git path: deploy from a remote repo. Form stays open after
		// success so the webhook URL + secret panel can be shown; the user closes
		// it via the Done button (which calls onDeploySuccess + onClose).
		if (tab === 'git' && !isEditMode) {
			if (!gitUrl.trim()) return
			deployStack({
				...baseInput,
				git: {
					url: gitUrl.trim(),
					branch: gitBranch.trim() || 'main',
					credentialId: gitCredentialId,
					composePath: gitComposePath.trim() || 'docker-compose.yml',
				},
			})
			return
		}

		// YAML path (unchanged behavior).
		if (!composeYaml.trim()) return
		const input = {...baseInput, composeYaml}
		if (isEditMode) {
			editStack(input)
		} else {
			deployStack(input)
		}
		onDeploySuccess()
		onClose()
	}

	return (
		<div className='absolute inset-0 z-50 flex flex-col bg-surface-base'>
			{/* Header */}
			<div className='flex shrink-0 items-center justify-between border-b border-border-default px-6 py-4'>
				<div>
					<h2 className='text-lg font-semibold text-text-primary'>
						{isEditMode ? `Edit Stack: ${editStackName}` : 'Deploy Stack'}
					</h2>
					{isEditMode && (
						<p className='mt-0.5 text-xs text-text-tertiary'>Update compose configuration and redeploy</p>
					)}
				</div>
				<button
					onClick={onClose}
					className='rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-surface-1 hover:text-text-primary'
				>
					<IconX size={18} />
				</button>
			</div>

			{/* Body */}
			<div className='flex-1 overflow-y-auto px-6 py-5 space-y-5'>
				{/* Stack Name */}
				<div className='space-y-1.5'>
					<Label htmlFor='stack-name'>Stack Name</Label>
					<Input
						id='stack-name'
						value={stackName}
						onChange={(e) => {
							setStackName(e.target.value)
							setNameError('')
						}}
						placeholder='my-stack'
						disabled={isEditMode}
						className={cn(isEditMode && 'opacity-60 cursor-not-allowed')}
					/>
					{nameError && <p className='text-xs text-red-500'>{nameError}</p>}
				</div>

				{/* Compose source — Plan 21-02 wraps Compose YAML in a Tabs primitive
				    with a new "Deploy from Git" tab. Edit mode is YAML-only (v1). */}
				{showGitTab ? (
					<Tabs value={tab} onValueChange={(v) => setTab(v as 'yaml' | 'git' | 'ai')}>
						<TabsList className='mb-3'>
							<TabsTrigger value='yaml'>Deploy from YAML</TabsTrigger>
							<TabsTrigger value='git'>Deploy from Git</TabsTrigger>
							<TabsTrigger value='ai'>Generate from prompt</TabsTrigger>
						</TabsList>

						<TabsContent value='yaml'>
							<div className='space-y-1.5'>
								<Label htmlFor='compose-yaml'>Docker Compose YAML</Label>
								<textarea
									id='compose-yaml'
									value={composeYaml}
									onChange={(e) => setComposeYaml(e.target.value)}
									placeholder={`version: '3.8'\nservices:\n  web:\n    image: nginx:latest\n    ports:\n      - "8080:80"\n    restart: unless-stopped`}
									className='w-full rounded-lg border border-border-default bg-neutral-900 px-4 py-3 text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-brand/50'
									style={{
										fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
										fontSize: '13px',
										minHeight: '400px',
										lineHeight: '1.6',
										resize: 'vertical',
										tabSize: 2,
									}}
									spellCheck={false}
								/>
							</div>
						</TabsContent>

						<TabsContent value='git'>
							<div className='space-y-3'>
								<div className='space-y-1.5'>
									<Label htmlFor='git-url'>Git Repository URL</Label>
									<Input
										id='git-url'
										value={gitUrl}
										onChange={(e) => setGitUrl(e.target.value)}
										placeholder='https://github.com/foo/bar.git or git@github.com:foo/bar.git'
										className='font-mono text-sm'
									/>
								</div>
								<div className='grid grid-cols-2 gap-3'>
									<div className='space-y-1.5'>
										<Label htmlFor='git-branch'>Branch</Label>
										<Input
											id='git-branch'
											value={gitBranch}
											onChange={(e) => setGitBranch(e.target.value)}
											placeholder='main'
										/>
									</div>
									<div className='space-y-1.5'>
										<Label htmlFor='git-compose-path'>Compose File Path</Label>
										<Input
											id='git-compose-path'
											value={gitComposePath}
											onChange={(e) => setGitComposePath(e.target.value)}
											placeholder='docker-compose.yml'
											className='font-mono text-xs'
										/>
									</div>
								</div>
								<div className='space-y-1.5'>
									<Label>Credential (optional — leave empty for public repos)</Label>
									<div className='flex gap-2'>
										<select
											value={gitCredentialId ?? ''}
											onChange={(e) => setGitCredentialId(e.target.value || null)}
											className='flex-1 rounded-lg border border-border-default bg-surface-1 px-3 py-2 text-sm'
										>
											<option value=''>— None (public repo) —</option>
											{credentials.map((c) => (
												<option key={c.id} value={c.id}>
													{c.name} ({c.type})
												</option>
											))}
										</select>
										<Button
											type='button'
											variant='outline'
											size='sm'
											onClick={() => setShowCredentialDialog(true)}
										>
											<IconPlus size={14} className='mr-1' /> Add credential
										</Button>
									</div>
								</div>

								{/* Webhook URL + secret panel — shown after a successful git deploy.
								    Form deliberately stays open until the user clicks Done so the
								    secret can be copied (it isn't retrievable later via the API). */}
								{showWebhookPanel && lastDeployResult?.webhookSecret && (
									<div className='rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-2'>
										<div className='flex items-center gap-2'>
											<IconCheck size={16} className='text-emerald-500' />
											<span className='text-sm font-medium text-emerald-400'>Stack deployed</span>
										</div>
										<p className='text-xs text-text-secondary'>
											Configure your git provider with this webhook URL to redeploy on push:
										</p>
										<div className='flex gap-2'>
											<Input
												readOnly
												value={`${window.location.origin}/api/webhooks/git/${lastDeployResult.name}`}
												className='font-mono text-xs flex-1'
												onFocus={(e) => e.currentTarget.select()}
											/>
											<Button
												size='sm'
												variant='outline'
												onClick={() => {
													navigator.clipboard.writeText(
														`${window.location.origin}/api/webhooks/git/${lastDeployResult.name}`,
													)
												}}
											>
												<IconCopy size={14} />
											</Button>
										</div>
										<p className='text-xs text-text-secondary'>
											Webhook secret (use in <code>X-Hub-Signature-256</code>):
										</p>
										<div className='flex gap-2'>
											<Input
												readOnly
												type='password'
												value={lastDeployResult.webhookSecret}
												className='font-mono text-xs flex-1'
											/>
											<Button
												size='sm'
												variant='outline'
												onClick={() => {
													if (lastDeployResult.webhookSecret) {
														navigator.clipboard.writeText(lastDeployResult.webhookSecret)
													}
												}}
											>
												<IconCopy size={14} />
											</Button>
										</div>
										<Button
											size='sm'
											onClick={() => {
												clearLastDeployResult()
												onDeploySuccess()
												onClose()
											}}
										>
											Done
										</Button>
									</div>
								)}
							</div>
						</TabsContent>

						{/* Plan 23-01 (AID-03): natural-language compose generator via Kimi. */}
						<TabsContent value='ai'>
							<AiComposeTab
								prompt={aiPrompt}
								setPrompt={setAiPrompt}
								onUseYaml={(yaml) => {
									setComposeYaml(yaml)
									setTab('yaml')
								}}
							/>
						</TabsContent>
					</Tabs>
				) : (
					<div className='space-y-1.5'>
						<Label htmlFor='compose-yaml'>Docker Compose YAML</Label>
						<textarea
							id='compose-yaml'
							value={composeYaml}
							onChange={(e) => setComposeYaml(e.target.value)}
							placeholder={`version: '3.8'\nservices:\n  web:\n    image: nginx:latest\n    ports:\n      - "8080:80"\n    restart: unless-stopped`}
							className='w-full rounded-lg border border-border-default bg-neutral-900 px-4 py-3 text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-brand/50'
							style={{
								fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
								fontSize: '13px',
								minHeight: '400px',
								lineHeight: '1.6',
								resize: 'vertical',
								tabSize: 2,
							}}
							spellCheck={false}
						/>
					</div>
				)}

				{/* Environment Variables */}
				<div className='space-y-3'>
					<div className='flex items-center justify-between'>
						<Label>Environment Variables</Label>
						<button
							type='button'
							onClick={addEnvVar}
							className='flex items-center gap-1 rounded-lg bg-surface-1 px-2.5 py-1 text-xs text-text-secondary transition-colors hover:bg-surface-2'
						>
							<IconPlus size={12} />
							Add Variable
						</button>
					</div>
					{envVars.length === 0 ? (
						<p className='text-xs text-text-tertiary'>No environment variables. Click "Add Variable" to add one.</p>
					) : (
						<div className='space-y-2'>
							{envVars.map((env, i) => (
								<div
									key={i}
									className={cn(
										'flex items-center gap-2',
										env.secret && 'border-l-2 border-amber-500/40 pl-2',
									)}
								>
									<Input
										value={env.key}
										onChange={(e) => updateEnvVar(i, 'key', e.target.value)}
										placeholder='KEY'
										className='flex-1 font-mono text-sm'
									/>
									<span className='text-text-tertiary'>=</span>
									<Input
										type={env.secret ? 'password' : 'text'}
										value={env.value}
										onChange={(e) => updateEnvVar(i, 'value', e.target.value)}
										placeholder={
											env.secret && env.hasValue && !env.value
												? '•••••••• (stored, re-enter to change)'
												: 'value'
										}
										className='flex-1 font-mono text-sm'
									/>
									<label
										className='flex shrink-0 cursor-pointer items-center gap-1 px-1 text-xs text-text-secondary'
										title='Stored encrypted in Redis; never written to .env on disk'
									>
										<input
											type='checkbox'
											checked={!!env.secret}
											onChange={(e) => updateEnvVar(i, 'secret', e.target.checked)}
											className='accent-brand'
										/>
										<IconLock size={12} />
										secret
									</label>
									<button
										type='button'
										onClick={() => removeEnvVar(i)}
										className='shrink-0 rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-red-500/20 hover:text-red-500'
									>
										<IconX size={14} />
									</button>
								</div>
							))}
						</div>
					)}
				</div>
			</div>

			{/* Footer */}
			<div className='shrink-0 flex items-center justify-end gap-3 border-t border-border-default px-6 py-4'>
				<Button variant='outline' onClick={onClose} disabled={isBusy}>
					Cancel
				</Button>
				<Button
					onClick={handleSubmit}
					disabled={
						isBusy ||
						(tab === 'git' && !isEditMode
							? !gitUrl.trim() || showWebhookPanel
							: !composeYaml.trim())
					}
				>
					{isBusy ? (isEditMode ? 'Redeploying...' : 'Deploying...') : isEditMode ? 'Redeploy' : 'Deploy'}
				</Button>
			</div>

			{/* Inline credential creation — Plan 21-02. Lets a user add an HTTPS
			    PAT or SSH key without leaving the deploy flow. */}
			<AddGitCredentialDialog
				open={showCredentialDialog}
				onClose={() => setShowCredentialDialog(false)}
				onCreated={(id) => {
					setGitCredentialId(id)
					credentialsQuery.refetch()
				}}
			/>
		</div>
	)
}

// Plan 21-02: nested dialog inside DeployStackForm's Git tab. Creates a
// git_credentials row via tRPC; on success returns the new id so the picker
// can auto-select it. HTTPS / SSH split mirrors the schema's
// HttpsCredentialData | SshCredentialData union (data.username/password vs
// data.privateKey).
function AddGitCredentialDialog({
	open,
	onClose,
	onCreated,
}: {
	open: boolean
	onClose: () => void
	onCreated: (credentialId: string) => void
}) {
	const [name, setName] = useState('')
	const [type, setType] = useState<'https' | 'ssh'>('https')
	const [username, setUsername] = useState('')
	const [password, setPassword] = useState('')
	const [privateKey, setPrivateKey] = useState('')

	const createMutation = trpcReact.docker.createGitCredential.useMutation({
		onSuccess: (data: any) => {
			if (data?.id) onCreated(data.id)
			onClose()
			setName('')
			setUsername('')
			setPassword('')
			setPrivateKey('')
		},
	})

	if (!open) return null

	const handleCreate = () => {
		if (!name.trim()) return
		if (type === 'https') {
			if (!username.trim() || !password.trim()) return
			createMutation.mutate({name: name.trim(), type, data: {username, password}})
		} else {
			// Server-side schema requires privateKey.length >= 50 (PEM is always longer).
			if (!privateKey.trim() || privateKey.length < 50) return
			createMutation.mutate({name: name.trim(), type, data: {privateKey}})
		}
	}

	return (
		<Dialog open={open} onOpenChange={(o) => !o && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add Git Credential</DialogTitle>
					<DialogDescription>
						Stored encrypted at rest. Used only when cloning the repo on this server.
					</DialogDescription>
				</DialogHeader>
				<div className='space-y-3'>
					<div className='space-y-1.5'>
						<Label htmlFor='cred-name'>Name</Label>
						<Input
							id='cred-name'
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder='e.g. github-pat'
						/>
					</div>
					<div className='flex gap-2'>
						<button
							type='button'
							onClick={() => setType('https')}
							className={cn(
								'flex-1 rounded-lg border px-3 py-2 text-sm',
								type === 'https' ? 'border-brand bg-brand/10' : 'border-border-default',
							)}
						>
							HTTPS / PAT
						</button>
						<button
							type='button'
							onClick={() => setType('ssh')}
							className={cn(
								'flex-1 rounded-lg border px-3 py-2 text-sm',
								type === 'ssh' ? 'border-brand bg-brand/10' : 'border-border-default',
							)}
						>
							SSH Key
						</button>
					</div>
					{type === 'https' ? (
						<>
							<div className='space-y-1.5'>
								<Label htmlFor='cred-username'>Username</Label>
								<Input
									id='cred-username'
									value={username}
									onChange={(e) => setUsername(e.target.value)}
									placeholder='your-github-username'
								/>
							</div>
							<div className='space-y-1.5'>
								<Label htmlFor='cred-password'>Personal Access Token</Label>
								<Input
									id='cred-password'
									type='password'
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									placeholder='ghp_xxxxxxxxxxxxxxxxxxxx'
								/>
							</div>
						</>
					) : (
						<div className='space-y-1.5'>
							<Label htmlFor='cred-private-key'>Private Key (PEM)</Label>
							<textarea
								id='cred-private-key'
								value={privateKey}
								onChange={(e) => setPrivateKey(e.target.value)}
								placeholder={'-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----'}
								className='w-full rounded-lg border border-border-default bg-neutral-900 p-3 font-mono text-xs text-white placeholder:text-neutral-500'
								style={{minHeight: 160}}
								spellCheck={false}
							/>
						</div>
					)}
					{createMutation.isError && (
						<p className='text-xs text-red-500'>
							{createMutation.error?.message ?? 'Failed to create credential'}
						</p>
					)}
				</div>
				<DialogFooter>
					<Button variant='outline' onClick={onClose} disabled={createMutation.isPending}>
						Cancel
					</Button>
					<Button onClick={handleCreate} disabled={createMutation.isPending}>
						{createMutation.isPending ? 'Creating...' : 'Create'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// Remove Stack Dialog
function RemoveStackDialog({
	stackName,
	open,
	onOpenChange,
	onConfirm,
	isRemoving,
}: {
	stackName: string
	open: boolean
	onOpenChange: (open: boolean) => void
	onConfirm: (removeVolumes: boolean) => void
	isRemoving: boolean
}) {
	const [removeVolumes, setRemoveVolumes] = useState(false)

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Remove Stack: {stackName}</DialogTitle>
					<DialogDescription>
						This will stop and remove all containers in this stack.
					</DialogDescription>
				</DialogHeader>
				<div className='py-3'>
					<label className='flex items-center gap-2 cursor-pointer'>
						<Checkbox
							checked={removeVolumes}
							onCheckedChange={(checked) => setRemoveVolumes(checked === true)}
						/>
						<span className='text-sm text-text-secondary'>Also remove associated volumes</span>
					</label>
				</div>
				<DialogFooter>
					<Button variant='outline' onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						variant='destructive'
						onClick={() => {
							onConfirm(removeVolumes)
							setRemoveVolumes(false)
						}}
						disabled={isRemoving}
					>
						{isRemoving ? 'Removing...' : 'Remove'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// Redeploy (pull latest) Stack Dialog — QW-03
function RedeployStackDialog({
	stackName,
	open,
	onOpenChange,
	onConfirm,
	isBusy,
}: {
	stackName: string
	open: boolean
	onOpenChange: (open: boolean) => void
	onConfirm: () => void
	isBusy: boolean
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Redeploy Stack: {stackName}</DialogTitle>
					<DialogDescription>
						This will pull the latest version of every image in this stack and recreate
						containers on the new digest. Existing volumes are preserved.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant='outline' onClick={() => onOpenChange(false)} disabled={isBusy}>
						Cancel
					</Button>
					<Button onClick={onConfirm} disabled={isBusy}>
						{isBusy ? 'Redeploying...' : 'Pull & Redeploy'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// Stacks Tab Component
function StacksTab() {
	const {
		stacks,
		isLoading,
		isError,
		error,
		isFetching,
		refetch,
		controlStack,
		isControlling,
		removeStack,
		isRemoving,
		actionResult,
	} = useStacks()

	const [expandedStack, setExpandedStack] = useState<string | null>(null)
	const [deployFormOpen, setDeployFormOpen] = useState(false)
	const [editTarget, setEditTarget] = useState<string | null>(null)
	const [removeTarget, setRemoveTarget] = useState<string | null>(null)
	const [redeployTarget, setRedeployTarget] = useState<string | null>(null)

	const statusBadge = (status: 'running' | 'stopped' | 'partial') => {
		const classes: Record<string, string> = {
			running: 'bg-emerald-500/20 text-emerald-600',
			stopped: 'bg-red-500/20 text-red-600',
			partial: 'bg-amber-500/20 text-amber-600',
		}
		return (
			<span className={cn('inline-block rounded-full px-2.5 py-0.5 text-xs font-medium', classes[status] || 'bg-neutral-500/20 text-neutral-500')}>
				{status}
			</span>
		)
	}

	return (
		<>
			{/* Summary Row */}
			<div className='mb-4 flex flex-wrap items-center justify-between gap-2'>
				<div className='text-sm text-text-secondary'>
					<span className='font-medium text-text-primary'>{stacks.length}</span>
					<span className='ml-1'>stack(s)</span>
				</div>
				<div className='flex flex-wrap items-center gap-2'>
					<Button variant='default' size='sm' onClick={() => setDeployFormOpen(true)}>
						<IconPlus size={14} className='mr-1.5' />
						Deploy Stack
					</Button>
					<button
						onClick={() => refetch()}
						disabled={isFetching}
						className='flex items-center gap-2 rounded-lg bg-surface-1 px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-2 disabled:opacity-50'
					>
						<IconRefresh size={14} className={isFetching ? 'animate-spin' : ''} />
						Refresh
					</button>
				</div>
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

			{/* Stack Table */}
			{isLoading ? (
				<div className='rounded-xl border border-border-default bg-surface-base p-12 text-center'>
					<IconRefresh size={24} className='mx-auto mb-3 animate-spin text-text-tertiary' />
					<p className='text-sm text-text-tertiary'>Loading stacks...</p>
				</div>
			) : isError ? (
				<div className='rounded-xl border border-red-500/20 bg-red-500/10 p-8 text-center'>
					<IconStack2 size={24} className='mx-auto mb-3 text-red-400' />
					<p className='text-sm text-red-400'>Failed to load stacks</p>
					<p className='mt-1 text-xs text-red-400/60'>{error?.message}</p>
				</div>
			) : !stacks.length ? (
				<div className='rounded-xl border border-border-default bg-surface-base p-12 text-center'>
					<IconStack2 size={32} className='mx-auto mb-3 text-text-tertiary' />
					<p className='text-sm text-text-tertiary'>No stacks found. Deploy your first stack.</p>
				</div>
			) : (
				<div className='overflow-x-auto'>
				<div className='rounded-xl border border-border-default bg-surface-base overflow-hidden'>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className='pl-4'>Name</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Containers</TableHead>
								<TableHead className='text-right pr-4'>Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{stacks.map((stack) => {
								const isExpanded = expandedStack === stack.name
								const isRunning = stack.status === 'running'
								const isStopped = stack.status === 'stopped'
								return (
									<Fragment key={stack.name}>
										<TableRow
											onClick={() => setExpandedStack(isExpanded ? null : stack.name)}
											className={cn('cursor-pointer transition-colors hover:bg-surface-1/50', isExpanded && 'bg-surface-1')}
										>
											<TableCell className='pl-4 font-medium'>
												<div className='flex items-center gap-2'>
													{isExpanded ? (
														<IconChevronDown size={14} className='shrink-0 text-text-tertiary' />
													) : (
														<IconChevronRight size={14} className='shrink-0 text-text-tertiary' />
													)}
													<span className='truncate' title={stack.name}>
														{stack.name}
													</span>
												</div>
											</TableCell>
											<TableCell>
												{statusBadge(stack.status)}
											</TableCell>
											<TableCell>
												<span className='text-sm text-text-secondary'>{stack.containerCount}</span>
											</TableCell>
											<TableCell className='text-right pr-4'>
												<div className='flex items-center justify-end gap-1'>
													{/* Start (when stopped or partial) */}
													{(isStopped || stack.status === 'partial') && (
														<span onClick={(e) => e.stopPropagation()}>
															<ActionButton
																icon={IconPlayerPlay}
																onClick={() => controlStack(stack.name, 'up')}
																disabled={isControlling}
																color='emerald'
																title='Start'
															/>
														</span>
													)}
													{/* Stop (when running or partial) */}
													{(isRunning || stack.status === 'partial') && (
														<span onClick={(e) => e.stopPropagation()}>
															<ActionButton
																icon={IconPlayerStop}
																onClick={() => controlStack(stack.name, 'stop')}
																disabled={isControlling}
																color='amber'
																title='Stop'
															/>
														</span>
													)}
													{/* Restart */}
													<span onClick={(e) => e.stopPropagation()}>
														<ActionButton
															icon={IconRotateClockwise}
															onClick={() => controlStack(stack.name, 'restart')}
															disabled={isControlling}
															color='blue'
															title='Restart'
														/>
													</span>
													{/* Redeploy (pull latest images) — QW-03 */}
													<span onClick={(e) => e.stopPropagation()}>
														<ActionButton
															icon={IconCloudDownload}
															onClick={() => setRedeployTarget(stack.name)}
															disabled={isControlling}
															color='blue'
															title='Redeploy (pull latest images)'
														/>
													</span>
													{/* Edit */}
													<span onClick={(e) => e.stopPropagation()}>
														<ActionButton
															icon={IconPencil}
															onClick={() => setEditTarget(stack.name)}
															disabled={isControlling}
															color='blue'
															title='Edit'
														/>
													</span>
													{/* Remove */}
													<span onClick={(e) => e.stopPropagation()}>
														<ActionButton
															icon={IconTrash}
															onClick={() => setRemoveTarget(stack.name)}
															disabled={isRemoving}
															color='red'
															title='Remove'
														/>
													</span>
												</div>
											</TableCell>
										</TableRow>
										{/* Expanded row: constituent containers + compose graph */}
										{isExpanded && (
											<TableRow>
												<TableCell colSpan={4} className='p-0 border-t border-border-default bg-surface-1/30'>
													<div className='px-4 py-3'>
														<Tabs defaultValue='containers'>
															<TabsList className='mb-3'>
																<TabsTrigger value='containers'>
																	Containers ({stack.containers.length})
																</TabsTrigger>
																<TabsTrigger value='graph'>Graph</TabsTrigger>
															</TabsList>
															<TabsContent value='containers'>
																{stack.containers.length === 0 ? (
																	<p className='text-xs text-text-tertiary'>No containers running for this stack.</p>
																) : (
																	<Table>
																		<TableHeader>
																			<TableRow>
																				<TableHead className='text-xs'>Name</TableHead>
																				<TableHead className='text-xs'>Image</TableHead>
																				<TableHead className='text-xs'>State</TableHead>
																			</TableRow>
																		</TableHeader>
																		<TableBody>
																			{stack.containers.map((container) => (
																				<TableRow key={container.id}>
																					<TableCell className='py-1.5'>
																						<span className='font-mono text-xs font-medium'>{container.name}</span>
																					</TableCell>
																					<TableCell className='py-1.5'>
																						<span className='text-xs text-text-secondary'>{container.image}</span>
																					</TableCell>
																					<TableCell className='py-1.5'>
																						<span className={cn(
																							'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
																							container.state === 'running' ? 'bg-emerald-500/20 text-emerald-600' :
																							container.state === 'exited' ? 'bg-red-500/20 text-red-600' :
																							'bg-neutral-500/20 text-neutral-500',
																						)}>
																							{container.state}
																						</span>
																					</TableCell>
																				</TableRow>
																			))}
																		</TableBody>
																	</Table>
																)}
															</TabsContent>
															<TabsContent value='graph'>
																<ComposeGraphViewer stackName={stack.name} />
															</TabsContent>
														</Tabs>
													</div>
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

			{/* Deploy/Edit Stack Form */}
			<DeployStackForm
				open={deployFormOpen || !!editTarget}
				onClose={() => {
					setDeployFormOpen(false)
					setEditTarget(null)
				}}
				editStackName={editTarget}
				onDeploySuccess={() => refetch()}
			/>

			{/* Remove Stack Dialog */}
			{removeTarget && (
				<RemoveStackDialog
					stackName={removeTarget}
					open={!!removeTarget}
					onOpenChange={(open) => {
						if (!open) setRemoveTarget(null)
					}}
					onConfirm={(removeVols) => {
						removeStack(removeTarget, removeVols)
						setRemoveTarget(null)
					}}
					isRemoving={isRemoving}
				/>
			)}

			{/* Redeploy (pull latest) Stack Dialog — QW-03 */}
			{redeployTarget && (
				<RedeployStackDialog
					stackName={redeployTarget}
					open={!!redeployTarget}
					onOpenChange={(open) => {
						if (!open) setRedeployTarget(null)
					}}
					onConfirm={() => {
						controlStack(redeployTarget, 'pull-and-up')
						setRedeployTarget(null)
					}}
					isBusy={isControlling}
				/>
			)}
		</>
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
	const [removeTarget, setRemoveTarget] = useState<string | null>(null)
	const [selectedContainer, setSelectedContainer] = useState<string | null>(null)
	const [showCreateForm, setShowCreateForm] = useState(false)
	const [editTarget, setEditTarget] = useState<string | null>(null)
	const [duplicateTarget, setDuplicateTarget] = useState<string | null>(null)
	const [renameTarget, setRenameTarget] = useState<string | null>(null)
	const [selectedContainers, setSelectedContainers] = useState<Set<string>>(new Set())
	const [bulkRemoveOpen, setBulkRemoveOpen] = useState(false)

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

	// Docker containers via new hook
	const {
		containers,
		isLoading,
		isError,
		error,
		isFetching,
		refetch,
		manage,
		isManaging,
		bulkManage,
		isBulkManaging,
		actionResult,
		runningCount,
		totalCount,
	} = useContainers()

	const renameMutation = trpcReact.docker.renameContainer.useMutation({
		onSuccess: () => {
			refetch()
			setRenameTarget(null)
		},
	})

	const handleRemoveConfirm = (confirmName: string) => {
		if (!removeTarget) return
		manage(removeTarget, 'remove', {force: true, confirmName})
		setRemoveTarget(null)
	}

	// Selection helpers for bulk operations
	const toggleSelect = useCallback((name: string) => {
		setSelectedContainers((prev) => {
			const next = new Set(prev)
			if (next.has(name)) {
				next.delete(name)
			} else {
				next.add(name)
			}
			return next
		})
	}, [])

	const toggleSelectAll = useCallback(() => {
		setSelectedContainers((prev) => {
			if (prev.size === containers.length) {
				return new Set()
			}
			return new Set(containers.map((c) => c.name))
		})
	}, [containers])

	const clearSelection = useCallback(() => {
		setSelectedContainers(new Set())
	}, [])

	// Clear selection when containers list changes (remove stale references)
	useEffect(() => {
		setSelectedContainers((prev) => {
			const containerNames = new Set(containers.map((c) => c.name))
			const filtered = new Set([...prev].filter((name) => containerNames.has(name)))
			if (filtered.size !== prev.size) return filtered
			return prev
		})
	}, [containers])

	const handleBulkAction = useCallback(
		(operation: 'start' | 'stop' | 'restart' | 'kill' | 'remove') => {
			if (selectedContainers.size === 0) return
			if (operation === 'remove') {
				setBulkRemoveOpen(true)
				return
			}
			bulkManage(Array.from(selectedContainers), operation)
			clearSelection()
		},
		[selectedContainers, bulkManage, clearSelection],
	)

	const handleBulkRemoveConfirm = useCallback(() => {
		bulkManage(Array.from(selectedContainers), 'remove', {force: true})
		clearSelection()
		setBulkRemoveOpen(false)
	}, [selectedContainers, bulkManage, clearSelection])

	return (
		<div className={cn('flex flex-col', !isMobile && 'h-full')}>
			{/* Header */}
			<div className='shrink-0 px-4 pt-4 pb-3 sm:px-6 sm:pt-5 sm:pb-4'>
				<div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
					<div className='min-w-0'>
						<h1 className='text-xl sm:text-2xl font-bold text-text-primary'>Server Management</h1>
						<p className='mt-1 text-sm text-text-secondary'>Monitor and manage your server infrastructure</p>
					</div>
					<EnvironmentSelector />
				</div>
			</div>

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

			{/* Tabbed Interface */}
			<Tabs defaultValue='overview' className={cn('flex flex-col px-4 pb-3 sm:px-6 sm:pb-4', !isMobile && 'min-h-0 flex-1')}>
				<div className='shrink-0 overflow-x-auto -mx-4 px-4 sm:-mx-0 sm:px-0' style={{scrollbarWidth: 'none', msOverflowStyle: 'none'}}>
					<TabsList className='shrink-0 w-max justify-start gap-1 bg-transparent p-0 sm:w-full'>
						<TabsTrigger value='overview'>Overview</TabsTrigger>
						<TabsTrigger value='containers'>Containers</TabsTrigger>
						<TabsTrigger value='images'>Images</TabsTrigger>
						<TabsTrigger value='volumes'>Volumes</TabsTrigger>
						<TabsTrigger value='networks'>Networks</TabsTrigger>
						<TabsTrigger value='stacks'>Stacks</TabsTrigger>
						<TabsTrigger value='events'>Events</TabsTrigger>
						<TabsTrigger value='pm2'>PM2</TabsTrigger>
						<TabsTrigger value='monitoring'>Monitoring</TabsTrigger>
						<TabsTrigger value='domains'>Domains</TabsTrigger>
					</TabsList>
				</div>

				{/* Overview Tab */}
				<TabsContent value='overview' className={isMobile ? '' : 'flex-1 overflow-auto'}>
					<OverviewTab />
				</TabsContent>

				{/* Containers Tab */}
				<TabsContent value='containers' className={isMobile ? '' : 'flex-1 overflow-auto'}>
					{/* Summary Row */}
					<div className='mb-4 flex flex-wrap items-center justify-between gap-2'>
						<div className='text-sm text-text-secondary'>
							<span className='font-medium text-emerald-500'>{runningCount}</span>
							<span className='mx-1'>/</span>
							<span>{totalCount}</span>
							<span className='ml-1'>running</span>
						</div>
						<div className='flex flex-wrap items-center gap-2'>
							<button
								onClick={() => setShowCreateForm(true)}
								className='flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand/90'
							>
								<IconPlus size={14} />
								Add Container
							</button>
							<button
								onClick={() => refetch()}
								disabled={isFetching}
								className='flex items-center gap-2 rounded-lg bg-surface-1 px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-2 disabled:opacity-50'
							>
								<IconRefresh size={14} className={isFetching ? 'animate-spin' : ''} />
								Refresh
							</button>
						</div>
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

					{/* Container Table */}
					{isLoading ? (
						<div className='rounded-xl border border-border-default bg-surface-base p-12 text-center'>
							<IconRefresh size={24} className='mx-auto mb-3 animate-spin text-text-tertiary' />
							<p className='text-sm text-text-tertiary'>Loading containers...</p>
						</div>
					) : isError ? (
						<div className='rounded-xl border border-red-500/20 bg-red-500/10 p-8 text-center'>
							<IconServer size={24} className='mx-auto mb-3 text-red-400' />
							<p className='text-sm text-red-400'>Failed to load containers</p>
							<p className='mt-1 text-xs text-red-400/60'>{error?.message}</p>
						</div>
					) : !containers.length ? (
						<div className='rounded-xl border border-border-default bg-surface-base p-12 text-center'>
							<IconBox size={32} className='mx-auto mb-3 text-text-tertiary' />
							<p className='text-sm text-text-tertiary'>No Docker containers found</p>
							<p className='mt-1 text-xs text-text-tertiary'>Install an app from the App Store to get started</p>
						</div>
					) : isMobile ? (
						/* Mobile card layout */
						<div className='space-y-2'>
							{containers.map((container) => {
								const isRunning = container.state === 'running'
								const isPaused = container.state === 'paused'
								return (
									<div
										key={container.id}
										onClick={() => setSelectedContainer(container.name)}
										className={cn(
											'rounded-xl border border-border-default bg-surface-base p-3 transition-colors active:bg-surface-1',
											selectedContainers.has(container.name) && 'border-brand/30 bg-brand/5'
										)}
									>
										{/* Row 1: Checkbox + Name + State badge */}
										<div className='flex items-center gap-2'>
											<span onClick={(e) => e.stopPropagation()}>
												<Checkbox
													checked={selectedContainers.has(container.name)}
													onCheckedChange={() => toggleSelect(container.name)}
												/>
											</span>
											{container.isProtected && <IconLock size={14} className='shrink-0 text-amber-500' />}
											<span className='min-w-0 flex-1 truncate text-sm font-medium text-text-primary'>{container.name}</span>
											<StateBadge state={container.state} />
										</div>
										{/* Row 2: Image */}
										<div className='mt-1.5 pl-7 text-xs text-text-secondary truncate'>{container.image.split('@')[0]}</div>
										{/* Row 3: Ports (if any) */}
										{container.ports.length > 0 && (
											<div className='mt-1 pl-7 text-xs text-text-tertiary font-mono truncate'>{formatPorts(container.ports)}</div>
										)}
										{/* Row 4: Actions */}
										<div className='mt-2 flex flex-wrap items-center gap-1 pl-7' onClick={(e) => e.stopPropagation()}>
											<ActionButton icon={IconPencil} onClick={() => { setSelectedContainer(null); setEditTarget(container.name) }} disabled={isManaging || container.isProtected} color='blue' title='Edit' />
											<ActionButton icon={IconCopy} onClick={() => { setSelectedContainer(null); setDuplicateTarget(container.name) }} disabled={isManaging} color='blue' title='Duplicate' />
											<ActionButton icon={IconTag} onClick={() => { setSelectedContainer(null); setRenameTarget(container.name) }} disabled={isManaging || container.isProtected} color='blue' title='Rename' />
											{!isRunning && !isPaused && (
												<ActionButton icon={IconPlayerPlay} onClick={() => manage(container.name, 'start')} disabled={isManaging} color='emerald' title='Start' />
											)}
											{isRunning && (
												<ActionButton icon={IconPlayerStop} onClick={() => manage(container.name, 'stop')} disabled={isManaging || container.isProtected} color='amber' title='Stop' />
											)}
											{isRunning && (
												<ActionButton icon={IconPlayerPause} onClick={() => manage(container.name, 'pause')} disabled={isManaging || container.isProtected} color='amber' title='Pause' />
											)}
											{isPaused && (
												<ActionButton icon={IconPlayerPlay} onClick={() => manage(container.name, 'unpause')} disabled={isManaging} color='emerald' title='Resume' />
											)}
											{(isRunning || isPaused) && (
												<ActionButton icon={IconHandStop} onClick={() => manage(container.name, 'kill')} disabled={isManaging} color='red' title='Kill' />
											)}
											<ActionButton icon={IconRotateClockwise} onClick={() => manage(container.name, 'restart')} disabled={isManaging} color='blue' title='Restart' />
											<ActionButton icon={IconTrash} onClick={() => setRemoveTarget(container.name)} disabled={isManaging || container.isProtected} color='red' title='Remove' />
										</div>
									</div>
								)
							})}
						</div>
					) : (
						/* Desktop table layout */
						<div className='rounded-xl border border-border-default bg-surface-base overflow-hidden'>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className='w-10 pl-4'>
											<span onClick={(e) => e.stopPropagation()}>
												<Checkbox
													checked={containers.length > 0 && selectedContainers.size === containers.length ? true : selectedContainers.size > 0 ? 'indeterminate' : false}
													onCheckedChange={() => toggleSelectAll()}
												/>
											</span>
										</TableHead>
										<TableHead>Name</TableHead>
										<TableHead>Image</TableHead>
										<TableHead>State</TableHead>
										<TableHead>Ports</TableHead>
										<TableHead className='text-right pr-4'>Actions</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{containers.map((container) => {
										const isRunning = container.state === 'running'
										const isPaused = container.state === 'paused'
										return (
											<TableRow key={container.id} onClick={() => setSelectedContainer(container.name)} className={cn('cursor-pointer transition-colors hover:bg-surface-1/50', selectedContainers.has(container.name) && 'bg-brand/5')}>
												<TableCell className='w-10 pl-4'>
													<span onClick={(e) => e.stopPropagation()}>
														<Checkbox
															checked={selectedContainers.has(container.name)}
															onCheckedChange={() => toggleSelect(container.name)}
														/>
													</span>
												</TableCell>
												<TableCell className='font-medium'>
													<div className='flex items-center gap-2'>
														{container.isProtected && (
															<IconLock size={14} className='shrink-0 text-amber-500' title='Protected container' />
														)}
														<span className='truncate' title={container.name}>
															{container.name}
														</span>
													</div>
												</TableCell>
												<TableCell>
													<span className='truncate text-text-secondary text-xs' title={container.image}>
														{container.image.split('@')[0]}
													</span>
												</TableCell>
												<TableCell>
													<StateBadge state={container.state} />
												</TableCell>
												<TableCell>
													<span className='text-xs text-text-secondary font-mono'>
														{formatPorts(container.ports)}
													</span>
												</TableCell>
												<TableCell className='text-right pr-4'>
													<div className='flex items-center justify-end gap-1'>
														{/* Edit */}
														<span onClick={(e) => e.stopPropagation()}>
															<ActionButton
																icon={IconPencil}
																onClick={() => { setSelectedContainer(null); setEditTarget(container.name) }}
																disabled={isManaging || container.isProtected}
																color='blue'
																title={container.isProtected ? 'Protected — cannot edit' : 'Edit'}
															/>
														</span>
														{/* Duplicate */}
														<span onClick={(e) => e.stopPropagation()}>
															<ActionButton
																icon={IconCopy}
																onClick={() => { setSelectedContainer(null); setDuplicateTarget(container.name) }}
																disabled={isManaging}
																color='blue'
																title='Duplicate'
															/>
														</span>
														{/* Rename */}
														<span onClick={(e) => e.stopPropagation()}>
															<ActionButton
																icon={IconTag}
																onClick={() => { setSelectedContainer(null); setRenameTarget(container.name) }}
																disabled={isManaging || container.isProtected}
																color='blue'
																title={container.isProtected ? 'Protected — cannot rename' : 'Rename'}
															/>
														</span>
														{/* Start -- show for non-running, non-paused states */}
														{!isRunning && !isPaused && (
															<span onClick={(e) => e.stopPropagation()}>
																<ActionButton
																	icon={IconPlayerPlay}
																	onClick={() => manage(container.name, 'start')}
																	disabled={isManaging}
																	color='emerald'
																	title='Start'
																/>
															</span>
														)}
														{/* Stop -- show when running */}
														{isRunning && (
															<span onClick={(e) => e.stopPropagation()}>
																<ActionButton
																	icon={IconPlayerStop}
																	onClick={() => manage(container.name, 'stop')}
																	disabled={isManaging || container.isProtected}
																	color='amber'
																	title={container.isProtected ? 'Protected — cannot stop' : 'Stop'}
																/>
															</span>
														)}
														{/* Pause -- show when running */}
														{isRunning && (
															<span onClick={(e) => e.stopPropagation()}>
																<ActionButton
																	icon={IconPlayerPause}
																	onClick={() => manage(container.name, 'pause')}
																	disabled={isManaging || container.isProtected}
																	color='amber'
																	title={container.isProtected ? 'Protected — cannot pause' : 'Pause'}
																/>
															</span>
														)}
														{/* Resume (unpause) -- show when paused */}
														{isPaused && (
															<span onClick={(e) => e.stopPropagation()}>
																<ActionButton
																	icon={IconPlayerPlay}
																	onClick={() => manage(container.name, 'unpause')}
																	disabled={isManaging}
																	color='emerald'
																	title='Resume'
																/>
															</span>
														)}
														{/* Kill -- show when running or paused (emergency stop) */}
														{(isRunning || isPaused) && (
															<span onClick={(e) => e.stopPropagation()}>
																<ActionButton
																	icon={IconHandStop}
																	onClick={() => manage(container.name, 'kill')}
																	disabled={isManaging}
																	color='red'
																	title='Kill (SIGKILL)'
																/>
															</span>
														)}
														<span onClick={(e) => e.stopPropagation()}>
															<ActionButton
																icon={IconRotateClockwise}
																onClick={() => manage(container.name, 'restart')}
																disabled={isManaging}
																color='blue'
																title='Restart'
															/>
														</span>
														<span onClick={(e) => e.stopPropagation()}>
															<ActionButton
																icon={IconTrash}
																onClick={() => setRemoveTarget(container.name)}
																disabled={isManaging || container.isProtected}
																color='red'
																title={container.isProtected ? 'Protected — cannot remove' : 'Remove'}
															/>
														</span>
													</div>
												</TableCell>
											</TableRow>
										)
									})}
								</TableBody>
							</Table>
						</div>
					)}

					{/* Floating Bulk Action Bar */}
					<AnimatePresence>
						{selectedContainers.size > 0 && (
							<motion.div
								initial={{opacity: 0, y: 20}}
								animate={{opacity: 1, y: 0}}
								exit={{opacity: 0, y: 20}}
								transition={{duration: 0.2}}
								className='fixed bottom-4 left-3 right-3 z-50 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:bottom-6'
							>
								<div className='flex flex-wrap items-center gap-2 rounded-xl border border-border-default bg-surface-base px-3 py-2 shadow-lg sm:flex-nowrap sm:gap-3 sm:px-4 sm:py-2.5'>
									<span className='text-sm font-medium text-text-primary'>
										{selectedContainers.size} selected
									</span>
									<div className='h-4 w-px bg-border-default' />
									<div className='flex items-center gap-2'>
										<button
											onClick={() => handleBulkAction('start')}
											disabled={isBulkManaging}
											className='flex items-center gap-1.5 rounded-lg bg-emerald-500/20 px-3 py-1.5 text-[11px] sm:text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-500/30 disabled:opacity-50'
										>
											<IconPlayerPlay size={14} />
											Start
										</button>
										<button
											onClick={() => handleBulkAction('stop')}
											disabled={isBulkManaging}
											className='flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-3 py-1.5 text-[11px] sm:text-xs font-medium text-amber-600 transition-colors hover:bg-amber-500/30 disabled:opacity-50'
										>
											<IconPlayerStop size={14} />
											Stop
										</button>
										<button
											onClick={() => handleBulkAction('restart')}
											disabled={isBulkManaging}
											className='flex items-center gap-1.5 rounded-lg bg-blue-500/20 px-3 py-1.5 text-[11px] sm:text-xs font-medium text-blue-600 transition-colors hover:bg-blue-500/30 disabled:opacity-50'
										>
											<IconRotateClockwise size={14} />
											Restart
										</button>
										<button
											onClick={() => handleBulkAction('kill')}
											disabled={isBulkManaging}
											className='flex items-center gap-1.5 rounded-lg bg-red-500/20 px-3 py-1.5 text-[11px] sm:text-xs font-medium text-red-600 transition-colors hover:bg-red-500/30 disabled:opacity-50'
										>
											<IconHandStop size={14} />
											Kill
										</button>
										<button
											onClick={() => handleBulkAction('remove')}
											disabled={isBulkManaging}
											className='flex items-center gap-1.5 rounded-lg bg-red-500/20 px-3 py-1.5 text-[11px] sm:text-xs font-medium text-red-600 transition-colors hover:bg-red-500/30 disabled:opacity-50'
										>
											<IconTrash size={14} />
											Remove
										</button>
									</div>
									<div className='h-4 w-px bg-border-default' />
									<button
										onClick={clearSelection}
										className='rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-primary'
										title='Clear selection'
									>
										<IconX size={14} />
									</button>
								</div>
							</motion.div>
						)}
					</AnimatePresence>

					{/* Bulk Remove Confirmation Dialog */}
					<Dialog open={bulkRemoveOpen} onOpenChange={setBulkRemoveOpen}>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>Remove {selectedContainers.size} containers?</DialogTitle>
								<DialogDescription>
									This will force-remove the selected containers. This action cannot be undone.
								</DialogDescription>
							</DialogHeader>
							<DialogFooter>
								<Button variant='outline' onClick={() => setBulkRemoveOpen(false)}>
									Cancel
								</Button>
								<Button variant='destructive' onClick={handleBulkRemoveConfirm} disabled={isBulkManaging}>
									{isBulkManaging ? 'Removing...' : 'Confirm Remove'}
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
				</TabsContent>

				{/* Container Create Form */}
				<ContainerCreateForm
					open={showCreateForm || !!editTarget || !!duplicateTarget}
					onClose={() => { setShowCreateForm(false); setEditTarget(null); setDuplicateTarget(null) }}
					onSuccess={() => refetch()}
					editContainerName={editTarget}
					duplicateContainerName={duplicateTarget}
				/>

				{/* Images Tab */}
				<TabsContent value='images' className={isMobile ? '' : 'flex-1 overflow-auto'}>
					<ImagesTab />
				</TabsContent>
				<TabsContent value='volumes' className={isMobile ? '' : 'flex-1 overflow-auto'}>
					<VolumesTab />
				</TabsContent>
				<TabsContent value='networks' className={isMobile ? '' : 'flex-1 overflow-auto'}>
					<NetworksTab />
				</TabsContent>
				<TabsContent value='stacks' className={isMobile ? '' : 'flex-1 overflow-auto'}>
					<StacksTab />
				</TabsContent>
				<TabsContent value='events' className={isMobile ? '' : 'flex-1 overflow-auto'}>
					<EventsTab />
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

			{/* Remove Confirmation Dialog */}
			{removeTarget && (
				<RemoveDialog
					containerName={removeTarget}
					open={!!removeTarget}
					onOpenChange={(open) => {
						if (!open) setRemoveTarget(null)
					}}
					onConfirm={handleRemoveConfirm}
					isManaging={isManaging}
				/>
			)}

			{/* Rename Dialog */}
			{renameTarget && (
				<RenameDialog
					containerName={renameTarget}
					open={!!renameTarget}
					onOpenChange={(open) => { if (!open) setRenameTarget(null) }}
					onConfirm={(newName) => renameMutation.mutate({name: renameTarget, newName})}
					isPending={renameMutation.isPending}
					error={renameMutation.error}
				/>
			)}

			{/* Container Detail Sheet */}
			<ContainerDetailSheet
				containerName={selectedContainer}
				open={selectedContainer !== null}
				onOpenChange={(open) => {
					if (!open) setSelectedContainer(null)
				}}
				onEdit={(name) => { setSelectedContainer(null); setEditTarget(name) }}
				onDuplicate={(name) => { setSelectedContainer(null); setDuplicateTarget(name) }}
			/>
		</div>
	)
}
