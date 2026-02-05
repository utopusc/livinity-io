import {useState, useEffect} from 'react'
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
	IconChevronDown,
	IconChevronUp,
	IconBox,
	IconCircuitResistor,
} from '@tabler/icons-react'
import {Area, AreaChart, ResponsiveContainer, XAxis, YAxis} from 'recharts'

import {useCpuForUi} from '@/hooks/use-cpu'
import {useSystemMemoryForUi} from '@/hooks/use-memory'
import {useSystemDiskForUi} from '@/hooks/use-disk'
import {Progress} from '@/shadcn-components/ui/progress'
import {trpcReact} from '@/trpc/trpc'
import {cn} from '@/shadcn-lib/utils'

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
					className='relative overflow-hidden rounded-[14px] border border-white/10 bg-neutral-900/80 backdrop-blur-xl'
					initial={{backgroundColor: 'rgba(23, 23, 23, 0.8)'}}
					animate={{backgroundColor: active ? 'rgba(23, 23, 23, 1)' : 'rgba(23, 23, 23, 0.8)'}}
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
											style={{stopColor: active ? 'hsl(var(--color-brand) / 0.3)' : 'rgba(255, 255, 255, 0.05)'}}
										/>
										<stop
											offset='95%'
											style={{stopColor: active ? 'hsl(var(--color-brand) / 0)' : 'rgba(255, 255, 255, 0)'}}
										/>
									</linearGradient>
								</defs>
								<YAxis domain={[0, 100]} hide={true} />
								<XAxis hide={true} />
								<Area
									isAnimationActive={false}
									type='monotone'
									dataKey='value'
									style={{stroke: active ? 'hsl(var(--color-brand) / 0.2)' : 'rgba(255, 255, 255, 0.05)'}}
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
							<Icon size={16} className='text-white/50' />
							<span className='text-xs font-bold uppercase tracking-wider text-white/50'>{title}</span>
						</div>
						<div className='flex min-w-0 items-end gap-1.5'>
							<span className='text-2xl font-semibold leading-none tracking-tight text-white/90'>{value}</span>
							{valueSub && <span className='text-sm font-medium text-white/40'>{valueSub}</span>}
						</div>
						<div className='mt-3 space-y-2'>
							{progressLabel && <div className='text-xs font-medium text-white/40'>{progressLabel}</div>}
							<Progress value={progress * 100} variant='primary' />
						</div>
					</div>
				</motion.div>
			</motion.div>
		</motion.button>
	)
}

// Docker Container Component - Enhanced with more features
function DockerContainer({
	container,
	onAction,
	isActioning,
	expanded,
	onToggle,
}: {
	container: {id: string; name: string; image: string; state: string; status: string}
	onAction: (op: 'start' | 'stop' | 'restart' | 'remove', name: string) => void
	isActioning: boolean
	expanded: boolean
	onToggle: () => void
}) {
	const isRunning = container.state === 'running'
	const shortId = container.id.slice(0, 12)

	return (
		<motion.div
			layout
			initial={{opacity: 0, y: 10}}
			animate={{opacity: 1, y: 0}}
			exit={{opacity: 0, y: -10}}
			className='overflow-hidden rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm'
		>
			{/* Main Row */}
			<div className='flex items-center gap-4 px-4 py-3'>
				<div className='relative'>
					<div className={cn(
						'h-3 w-3 rounded-full transition-colors',
						isRunning ? 'bg-emerald-400' : 'bg-red-400'
					)} />
					{isRunning && (
						<div className='absolute inset-0 h-3 w-3 animate-ping rounded-full bg-emerald-400 opacity-50' />
					)}
				</div>
				<div className='flex-1 min-w-0'>
					<div className='flex items-center gap-2'>
						<span className='font-medium text-white truncate'>{container.name}</span>
						<span className={cn(
							'px-2 py-0.5 text-[10px] font-medium rounded-full uppercase tracking-wide',
							isRunning ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
						)}>
							{container.state}
						</span>
					</div>
					<div className='text-xs text-white/40 truncate mt-0.5'>{container.status}</div>
				</div>

				{/* Action Buttons */}
				<div className='flex items-center gap-1'>
					{!isRunning ? (
						<ActionButton
							icon={IconPlayerPlay}
							onClick={() => onAction('start', container.name)}
							disabled={isActioning}
							color='emerald'
							title='Start'
						/>
					) : (
						<ActionButton
							icon={IconPlayerStop}
							onClick={() => onAction('stop', container.name)}
							disabled={isActioning}
							color='amber'
							title='Stop'
						/>
					)}
					<ActionButton
						icon={IconRotateClockwise}
						onClick={() => onAction('restart', container.name)}
						disabled={isActioning}
						color='blue'
						title='Restart'
					/>
					<ActionButton
						icon={IconTrash}
						onClick={() => onAction('remove', container.name)}
						disabled={isActioning}
						color='red'
						title='Remove'
					/>
					<button
						onClick={onToggle}
						className='rounded-lg p-1.5 text-white/30 hover:bg-white/10 hover:text-white/60 transition-colors'
					>
						{expanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
					</button>
				</div>
			</div>

			{/* Expanded Details */}
			<AnimatePresence>
				{expanded && (
					<motion.div
						initial={{height: 0, opacity: 0}}
						animate={{height: 'auto', opacity: 1}}
						exit={{height: 0, opacity: 0}}
						className='overflow-hidden'
					>
						<div className='border-t border-white/5 px-4 py-3 bg-black/20'>
							<div className='grid grid-cols-2 gap-4 text-xs'>
								<div>
									<span className='text-white/40'>Container ID</span>
									<div className='font-mono text-white/70 mt-1'>{shortId}</div>
								</div>
								<div>
									<span className='text-white/40'>Image</span>
									<div className='text-white/70 mt-1 truncate' title={container.image}>
										{container.image.split('@')[0]}
									</div>
								</div>
							</div>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</motion.div>
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
				'rounded-lg p-1.5 text-white/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed',
				colorClasses[color]
			)}
		>
			<Icon size={16} />
		</button>
	)
}

// Section Header Component
function SectionHeader({icon: Icon, title, action}: {icon: React.ComponentType<{size?: number; className?: string}>; title: string; action?: React.ReactNode}) {
	return (
		<div className='flex items-center justify-between mb-4'>
			<div className='flex items-center gap-2'>
				<Icon size={20} className='text-white/60' />
				<h2 className='text-lg font-semibold text-white'>{title}</h2>
			</div>
			{action}
		</div>
	)
}

export default function ServerControl() {
	const [expandedContainer, setExpandedContainer] = useState<string | null>(null)
	const [actionResult, setActionResult] = useState<{type: 'success' | 'error'; message: string} | null>(null)

	// Use the same hooks as Live Usage for consistent data
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

	// Docker containers query
	const containersQuery = trpcReact.ai.listDockerContainers.useQuery(undefined, {
		refetchInterval: 10_000,
	})

	// Docker manage mutation
	const manageMutation = trpcReact.ai.manageDockerContainer.useMutation({
		onSuccess: (data) => {
			setActionResult({type: 'success', message: data.message})
			containersQuery.refetch()
			setTimeout(() => setActionResult(null), 3000)
		},
		onError: (error) => {
			setActionResult({type: 'error', message: error.message})
			setTimeout(() => setActionResult(null), 5000)
		},
	})

	const handleDockerAction = (op: 'start' | 'stop' | 'restart' | 'remove', name: string) => {
		setActionResult(null)
		manageMutation.mutate({name, operation: op})
	}

	const runningCount = containersQuery.data?.filter(c => c.state === 'running').length ?? 0
	const totalCount = containersQuery.data?.length ?? 0

	return (
		<div className='space-y-8 pb-8'>
			{/* Header */}
			<div className='flex items-center justify-between'>
				<div>
					<h1 className='text-2xl font-bold text-white'>Server Control</h1>
					<p className='mt-1 text-sm text-white/50'>Monitor and manage your server infrastructure</p>
				</div>
			</div>

			{/* Resource Cards - Live Usage Style */}
			<div className='grid grid-cols-1 gap-4 sm:grid-cols-3'>
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

			{/* Docker Containers Section */}
			<div>
				<SectionHeader
					icon={IconBox}
					title='Docker Containers'
					action={
						<div className='flex items-center gap-3'>
							<div className='text-sm text-white/50'>
								<span className='text-emerald-400 font-medium'>{runningCount}</span>
								<span className='mx-1'>/</span>
								<span>{totalCount}</span>
								<span className='ml-1'>running</span>
							</div>
							<button
								onClick={() => containersQuery.refetch()}
								disabled={containersQuery.isFetching}
								className='flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white/70 transition-colors hover:bg-white/15 disabled:opacity-50'
							>
								<IconRefresh size={14} className={containersQuery.isFetching ? 'animate-spin' : ''} />
								Refresh
							</button>
						</div>
					}
				/>

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
									? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
									: 'bg-red-500/20 text-red-400 border border-red-500/30'
							)}
						>
							{actionResult.message}
						</motion.div>
					)}
				</AnimatePresence>

				{/* Container List */}
				{containersQuery.isLoading ? (
					<div className='rounded-xl border border-white/10 bg-white/5 p-12 text-center'>
						<IconRefresh size={24} className='mx-auto mb-3 animate-spin text-white/30' />
						<p className='text-sm text-white/40'>Loading containers...</p>
					</div>
				) : containersQuery.isError ? (
					<div className='rounded-xl border border-red-500/20 bg-red-500/10 p-8 text-center'>
						<IconServer size={24} className='mx-auto mb-3 text-red-400' />
						<p className='text-sm text-red-400'>Failed to load containers</p>
						<p className='mt-1 text-xs text-red-400/60'>{containersQuery.error.message}</p>
					</div>
				) : !containersQuery.data?.length ? (
					<div className='rounded-xl border border-white/10 bg-white/5 p-12 text-center'>
						<IconBox size={32} className='mx-auto mb-3 text-white/20' />
						<p className='text-sm text-white/40'>No Docker containers found</p>
						<p className='mt-1 text-xs text-white/30'>Install an app from the App Store to get started</p>
					</div>
				) : (
					<div className='space-y-2'>
						<AnimatePresence>
							{containersQuery.data.map((container) => (
								<DockerContainer
									key={container.id}
									container={container}
									onAction={handleDockerAction}
									isActioning={manageMutation.isPending}
									expanded={expandedContainer === container.id}
									onToggle={() => setExpandedContainer(
										expandedContainer === container.id ? null : container.id
									)}
								/>
							))}
						</AnimatePresence>
					</div>
				)}
			</div>
		</div>
	)
}
