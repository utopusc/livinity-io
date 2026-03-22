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
	IconBox,
	IconCircuitResistor,
	IconLock,
	IconPhoto,
	IconFolder,
	IconNetwork,
	IconBrandDocker,
	IconActivity,
} from '@tabler/icons-react'
import {Area, AreaChart, ResponsiveContainer, XAxis, YAxis} from 'recharts'

import {useCpuForUi} from '@/hooks/use-cpu'
import {useSystemMemoryForUi} from '@/hooks/use-memory'
import {useSystemDiskForUi} from '@/hooks/use-disk'
import {useContainers} from '@/hooks/use-containers'
import {ContainerDetailSheet} from './container-detail-sheet'
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
				'rounded-lg p-1.5 text-text-tertiary transition-colors disabled:opacity-30 disabled:cursor-not-allowed',
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

export default function ServerControl() {
	const [removeTarget, setRemoveTarget] = useState<string | null>(null)
	const [selectedContainer, setSelectedContainer] = useState<string | null>(null)

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
		actionResult,
		runningCount,
		totalCount,
	} = useContainers()

	const handleRemoveConfirm = (confirmName: string) => {
		if (!removeTarget) return
		manage(removeTarget, 'remove', {force: true, confirmName})
		setRemoveTarget(null)
	}

	return (
		<div className='flex h-full flex-col'>
			{/* Header */}
			<div className='shrink-0 px-6 pt-5 pb-4'>
				<h1 className='text-2xl font-bold text-text-primary'>Server Management</h1>
				<p className='mt-1 text-sm text-text-secondary'>Monitor and manage your server infrastructure</p>
			</div>

			{/* Resource Cards */}
			<div className='shrink-0 grid grid-cols-1 gap-4 px-6 pb-4 sm:grid-cols-3'>
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
			<Tabs defaultValue='containers' className='flex min-h-0 flex-1 flex-col px-6 pb-4'>
				<TabsList className='shrink-0 w-full justify-start gap-1 bg-transparent p-0'>
					<TabsTrigger value='containers'>Containers</TabsTrigger>
					<TabsTrigger value='images'>Images</TabsTrigger>
					<TabsTrigger value='volumes'>Volumes</TabsTrigger>
					<TabsTrigger value='networks'>Networks</TabsTrigger>
					<TabsTrigger value='pm2'>PM2</TabsTrigger>
					<TabsTrigger value='monitoring'>Monitoring</TabsTrigger>
				</TabsList>

				{/* Containers Tab */}
				<TabsContent value='containers' className='flex-1 overflow-auto'>
					{/* Summary Row */}
					<div className='mb-4 flex items-center justify-between'>
						<div className='text-sm text-text-secondary'>
							<span className='font-medium text-emerald-500'>{runningCount}</span>
							<span className='mx-1'>/</span>
							<span>{totalCount}</span>
							<span className='ml-1'>running</span>
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
					) : (
						<div className='rounded-xl border border-border-default bg-surface-base overflow-hidden'>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className='pl-4'>Name</TableHead>
										<TableHead>Image</TableHead>
										<TableHead>State</TableHead>
										<TableHead>Ports</TableHead>
										<TableHead className='text-right pr-4'>Actions</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{containers.map((container) => {
										const isRunning = container.state === 'running'
										return (
											<TableRow key={container.id} onClick={() => setSelectedContainer(container.name)} className='cursor-pointer transition-colors hover:bg-surface-1/50'>
												<TableCell className='pl-4 font-medium'>
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
														{!isRunning ? (
															<span onClick={(e) => e.stopPropagation()}>
																<ActionButton
																	icon={IconPlayerPlay}
																	onClick={() => manage(container.name, 'start')}
																	disabled={isManaging}
																	color='emerald'
																	title='Start'
																/>
															</span>
														) : (
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
				</TabsContent>

				{/* Placeholder Tabs */}
				<TabsContent value='images' className='flex-1 overflow-auto'>
					<PlaceholderTab title='Docker Images' icon={IconPhoto} />
				</TabsContent>
				<TabsContent value='volumes' className='flex-1 overflow-auto'>
					<PlaceholderTab title='Docker Volumes' icon={IconFolder} />
				</TabsContent>
				<TabsContent value='networks' className='flex-1 overflow-auto'>
					<PlaceholderTab title='Docker Networks' icon={IconNetwork} />
				</TabsContent>
				<TabsContent value='pm2' className='flex-1 overflow-auto'>
					<PlaceholderTab title='PM2 Processes' icon={IconBrandDocker} />
				</TabsContent>
				<TabsContent value='monitoring' className='flex-1 overflow-auto'>
					<PlaceholderTab title='System Monitoring' icon={IconActivity} />
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

			{/* Container Detail Sheet */}
			<ContainerDetailSheet
				containerName={selectedContainer}
				open={selectedContainer !== null}
				onOpenChange={(open) => {
					if (!open) setSelectedContainer(null)
				}}
			/>
		</div>
	)
}
