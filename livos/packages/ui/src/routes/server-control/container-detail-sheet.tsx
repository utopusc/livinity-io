import {useState, useEffect, useRef, useCallback} from 'react'
import {
	IconInfoCircle,
	IconFileText,
	IconChartBar,
	IconX,
	IconRefresh,
	IconArrowDown,
	IconLoader2,
	IconAlertTriangle,
} from '@tabler/icons-react'

import {useContainerDetail} from '@/hooks/use-container-detail'
import {Sheet, SheetContent} from '@/shadcn-components/ui/sheet'
import {Tabs, TabsList, TabsTrigger, TabsContent} from '@/shadcn-components/ui/tabs'
import {Progress} from '@/shadcn-components/ui/progress'
import {cn} from '@/shadcn-lib/utils'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 B'
	const units = ['B', 'KB', 'MB', 'GB', 'TB']
	const i = Math.floor(Math.log(bytes) / Math.log(1024))
	const value = bytes / Math.pow(1024, i)
	return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function formatDate(iso: string): string {
	try {
		return new Date(iso).toLocaleString()
	} catch {
		return iso
	}
}

// Color class for CPU/memory progress bars based on percentage
function progressColor(percent: number): string {
	if (percent > 80) return 'bg-red-500'
	if (percent > 50) return 'bg-amber-500'
	return 'bg-emerald-500'
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionTitle({children}: {children: React.ReactNode}) {
	return <h3 className='mb-2 text-xs font-bold uppercase tracking-wider text-text-secondary'>{children}</h3>
}

function KeyValue({label, children}: {label: string; children: React.ReactNode}) {
	return (
		<div className='flex flex-col gap-0.5'>
			<span className='text-[11px] font-medium text-text-tertiary'>{label}</span>
			<span className='text-sm text-text-primary'>{children}</span>
		</div>
	)
}

function HealthBadge({status}: {status: string | null}) {
	if (!status) return <span className='text-text-tertiary'>No healthcheck</span>
	const color: Record<string, string> = {
		healthy: 'text-emerald-600 bg-emerald-500/20',
		unhealthy: 'text-red-600 bg-red-500/20',
		starting: 'text-amber-600 bg-amber-500/20',
	}
	const classes = color[status] ?? 'text-text-secondary bg-surface-2'
	return (
		<span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium', classes)}>
			{status}
		</span>
	)
}

function StateBadgeInline({state}: {state: string}) {
	const color: Record<string, string> = {
		running: 'text-emerald-600 bg-emerald-500/20',
		exited: 'text-red-600 bg-red-500/20',
		paused: 'text-amber-600 bg-amber-500/20',
	}
	const classes = color[state] ?? 'text-text-secondary bg-surface-2'
	return (
		<span
			className={cn(
				'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide',
				classes,
			)}
		>
			{state}
		</span>
	)
}

// ---------------------------------------------------------------------------
// Info Tab
// ---------------------------------------------------------------------------

function InfoTab({containerName}: {containerName: string}) {
	const {detail, detailLoading, detailError} = useContainerDetail(containerName)

	if (detailLoading) {
		return (
			<div className='flex items-center justify-center py-16'>
				<IconLoader2 size={24} className='animate-spin text-text-tertiary' />
			</div>
		)
	}

	if (detailError) {
		return (
			<div className='flex flex-col items-center justify-center py-16'>
				<IconAlertTriangle size={24} className='mb-2 text-red-400' />
				<p className='text-sm text-red-400'>{detailError.message}</p>
			</div>
		)
	}

	if (!detail) return null

	return (
		<div className='space-y-6'>
			{/* General */}
			<section>
				<SectionTitle>General</SectionTitle>
				<div className='grid grid-cols-2 gap-x-6 gap-y-3'>
					<KeyValue label='State'>
						<StateBadgeInline state={detail.state} />
					</KeyValue>
					<KeyValue label='Created'>{formatDate(detail.created)}</KeyValue>
					<KeyValue label='Platform'>{detail.platform || '-'}</KeyValue>
					<KeyValue label='Restart Policy'>{detail.restartPolicy}</KeyValue>
					<KeyValue label='Restart Count'>{detail.restartCount}</KeyValue>
					<KeyValue label='Health Status'>
						<HealthBadge status={detail.healthStatus} />
					</KeyValue>
				</div>
			</section>

			{/* Ports */}
			<section>
				<SectionTitle>Ports</SectionTitle>
				{detail.ports.length === 0 ? (
					<p className='text-xs text-text-tertiary'>No port mappings</p>
				) : (
					<div className='overflow-hidden rounded-lg border border-border-default'>
						<table className='w-full text-xs'>
							<thead>
								<tr className='border-b border-border-default bg-surface-1/50'>
									<th className='px-3 py-1.5 text-left font-medium text-text-secondary'>Host Port</th>
									<th className='px-3 py-1.5 text-left font-medium text-text-secondary'>Container Port</th>
									<th className='px-3 py-1.5 text-left font-medium text-text-secondary'>Protocol</th>
								</tr>
							</thead>
							<tbody>
								{detail.ports.map((p, i) => (
									<tr key={i} className='border-b border-border-default last:border-0'>
										<td className='px-3 py-1.5 font-mono text-text-primary'>
											{p.hostPort != null ? p.hostPort : '-'}
										</td>
										<td className='px-3 py-1.5 font-mono text-text-primary'>{p.containerPort}</td>
										<td className='px-3 py-1.5 text-text-secondary'>{p.protocol}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>

			{/* Volumes / Mounts */}
			<section>
				<SectionTitle>Volumes</SectionTitle>
				{detail.mounts.length === 0 ? (
					<p className='text-xs text-text-tertiary'>No mounts</p>
				) : (
					<div className='overflow-hidden rounded-lg border border-border-default'>
						<table className='w-full text-xs'>
							<thead>
								<tr className='border-b border-border-default bg-surface-1/50'>
									<th className='px-3 py-1.5 text-left font-medium text-text-secondary'>Type</th>
									<th className='px-3 py-1.5 text-left font-medium text-text-secondary'>Source</th>
									<th className='px-3 py-1.5 text-left font-medium text-text-secondary'>Destination</th>
									<th className='px-3 py-1.5 text-left font-medium text-text-secondary'>Mode</th>
								</tr>
							</thead>
							<tbody>
								{detail.mounts.map((m, i) => (
									<tr key={i} className='border-b border-border-default last:border-0'>
										<td className='px-3 py-1.5 text-text-secondary'>{m.type}</td>
										<td className='max-w-[180px] truncate px-3 py-1.5 font-mono text-text-primary' title={m.source}>
											{m.source}
										</td>
										<td
											className='max-w-[180px] truncate px-3 py-1.5 font-mono text-text-primary'
											title={m.destination}
										>
											{m.destination}
										</td>
										<td className='px-3 py-1.5 text-text-secondary'>{m.mode}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>

			{/* Environment Variables */}
			<section>
				<SectionTitle>Environment Variables</SectionTitle>
				{detail.envVars.length === 0 ? (
					<p className='text-xs text-text-tertiary'>No environment variables</p>
				) : (
					<div className='max-h-48 overflow-auto rounded-lg border border-border-default bg-neutral-950 p-3'>
						{detail.envVars.map((env, i) => (
							<div key={i} className='truncate font-mono text-xs leading-relaxed text-neutral-200' title={env}>
								{env}
							</div>
						))}
					</div>
				)}
			</section>

			{/* Networks */}
			<section>
				<SectionTitle>Networks</SectionTitle>
				<p className='text-sm text-text-primary'>{detail.networks.length > 0 ? detail.networks.join(', ') : 'none'}</p>
			</section>
		</div>
	)
}

// ---------------------------------------------------------------------------
// Logs Tab
// ---------------------------------------------------------------------------

function LogsTab({containerName}: {containerName: string}) {
	const [tailLines, setTailLines] = useState(500)
	const [autoScroll, setAutoScroll] = useState(true)
	const preRef = useRef<HTMLPreElement>(null)

	const {logs, logsLoading, logsError, refetchLogs} = useContainerDetail(containerName, {tail: tailLines})

	// Auto-scroll to bottom when logs change
	useEffect(() => {
		if (autoScroll && preRef.current) {
			preRef.current.scrollTo(0, preRef.current.scrollHeight)
		}
	}, [logs, autoScroll])

	const handleScroll = useCallback(() => {
		const el = preRef.current
		if (!el) return
		const isAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 20
		setAutoScroll(isAtBottom)
	}, [])

	const jumpToBottom = useCallback(() => {
		if (preRef.current) {
			preRef.current.scrollTo(0, preRef.current.scrollHeight)
			setAutoScroll(true)
		}
	}, [])

	return (
		<div className='flex h-full flex-col gap-3'>
			{/* Controls */}
			<div className='flex shrink-0 items-center gap-4'>
				<div className='flex items-center gap-2'>
					<span className='text-xs font-medium text-text-secondary'>Tail:</span>
					<input
						type='range'
						min={100}
						max={1000}
						step={100}
						value={tailLines}
						onChange={(e) => setTailLines(Number(e.target.value))}
						className='h-1.5 w-28 cursor-pointer appearance-none rounded-full bg-surface-2 accent-brand [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand'
					/>
					<span className='w-10 text-xs tabular-nums text-text-tertiary'>{tailLines}</span>
				</div>
				<button
					onClick={() => refetchLogs()}
					className='flex items-center gap-1.5 rounded-lg bg-surface-1 px-2.5 py-1 text-xs text-text-secondary transition-colors hover:bg-surface-2'
				>
					<IconRefresh size={12} />
					Refresh
				</button>
			</div>

			{/* Log output */}
			<div className='relative min-h-0 flex-1'>
				{logsLoading ? (
					<div className='flex items-center justify-center py-16'>
						<IconLoader2 size={24} className='animate-spin text-text-tertiary' />
						<span className='ml-2 text-sm text-text-tertiary'>Loading logs...</span>
					</div>
				) : logsError ? (
					<div className='flex flex-col items-center justify-center py-16'>
						<IconAlertTriangle size={24} className='mb-2 text-red-400' />
						<p className='text-sm text-red-400'>{logsError.message}</p>
					</div>
				) : (
					<>
						<pre
							ref={preRef}
							onScroll={handleScroll}
							className='h-full overflow-auto whitespace-pre-wrap break-all rounded-lg bg-neutral-950 p-4 font-mono text-xs leading-relaxed text-neutral-200'
						>
							{logs || 'No logs available'}
						</pre>
						{!autoScroll && (
							<button
								onClick={jumpToBottom}
								className='absolute bottom-3 right-3 flex items-center gap-1 rounded-lg bg-brand/90 px-2.5 py-1 text-xs font-medium text-white shadow-lg transition-colors hover:bg-brand'
							>
								<IconArrowDown size={12} />
								Jump to bottom
							</button>
						)}
					</>
				)}
			</div>
		</div>
	)
}

// ---------------------------------------------------------------------------
// Stats Tab
// ---------------------------------------------------------------------------

function StatsTab({containerName}: {containerName: string}) {
	const {stats, statsLoading, statsError} = useContainerDetail(containerName)

	if (statsLoading) {
		return (
			<div className='flex items-center justify-center py-16'>
				<IconLoader2 size={24} className='animate-spin text-text-tertiary' />
				<span className='ml-2 text-sm text-text-tertiary'>Loading stats...</span>
			</div>
		)
	}

	if (statsError) {
		return (
			<div className='flex flex-col items-center justify-center py-16'>
				<IconAlertTriangle size={24} className='mb-2 text-amber-400' />
				<p className='text-sm text-text-secondary'>Container not running</p>
				<p className='mt-1 text-xs text-text-tertiary'>Stats are only available for running containers</p>
			</div>
		)
	}

	if (!stats) return null

	const cpuColor = progressColor(stats.cpuPercent)
	const memColor = progressColor(stats.memoryPercent)

	return (
		<div className='space-y-6'>
			{/* CPU */}
			<section>
				<div className='mb-2 flex items-end justify-between'>
					<SectionTitle>CPU Usage</SectionTitle>
					<span className='text-sm font-semibold text-text-primary'>{stats.cpuPercent.toFixed(1)}%</span>
				</div>
				<div className='relative h-2.5 w-full overflow-hidden rounded-full bg-surface-2'>
					<div
						className={cn('h-full rounded-full transition-all duration-700', cpuColor)}
						style={{width: `${Math.min(stats.cpuPercent, 100)}%`}}
					/>
				</div>
			</section>

			{/* Memory */}
			<section>
				<div className='mb-2 flex items-end justify-between'>
					<SectionTitle>Memory Usage</SectionTitle>
					<span className='text-sm font-semibold text-text-primary'>
						{stats.memoryPercent.toFixed(1)}%{' '}
						<span className='text-xs font-normal text-text-tertiary'>
							({formatBytes(stats.memoryUsage)} / {formatBytes(stats.memoryLimit)})
						</span>
					</span>
				</div>
				<div className='relative h-2.5 w-full overflow-hidden rounded-full bg-surface-2'>
					<div
						className={cn('h-full rounded-full transition-all duration-700', memColor)}
						style={{width: `${Math.min(stats.memoryPercent, 100)}%`}}
					/>
				</div>
			</section>

			{/* Network I/O */}
			<section>
				<SectionTitle>Network I/O</SectionTitle>
				<div className='grid grid-cols-2 gap-4'>
					<div className='rounded-lg border border-border-default bg-surface-1/50 p-3'>
						<p className='text-[11px] font-medium text-text-tertiary'>Received</p>
						<p className='mt-0.5 text-sm font-semibold text-text-primary'>{formatBytes(stats.networkRx)}</p>
					</div>
					<div className='rounded-lg border border-border-default bg-surface-1/50 p-3'>
						<p className='text-[11px] font-medium text-text-tertiary'>Transmitted</p>
						<p className='mt-0.5 text-sm font-semibold text-text-primary'>{formatBytes(stats.networkTx)}</p>
					</div>
				</div>
			</section>

			{/* PIDs */}
			<section>
				<SectionTitle>Active Processes</SectionTitle>
				<p className='text-2xl font-semibold text-text-primary'>{stats.pids}</p>
			</section>
		</div>
	)
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ContainerDetailSheet({
	containerName,
	open,
	onOpenChange,
}: {
	containerName: string | null
	open: boolean
	onOpenChange: (open: boolean) => void
}) {
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side='right'
				className='!w-[600px] !max-w-[600px] !sm:max-w-[600px] overflow-hidden'
				closeButton={false}
			>
				<div className='relative z-10 flex h-full flex-col'>
					{/* Header */}
					<div className='flex shrink-0 items-center justify-between border-b border-border-default p-4'>
						<div className='min-w-0 flex-1'>
							<h2 className='truncate text-lg font-bold text-text-primary'>{containerName}</h2>
						</div>
						<button
							onClick={() => onOpenChange(false)}
							className='ml-3 rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-primary'
						>
							<IconX size={18} />
						</button>
					</div>

					{/* Tabs */}
					{containerName && (
						<Tabs defaultValue='info' className='flex min-h-0 flex-1 flex-col'>
							<TabsList className='shrink-0 w-full justify-start gap-1 bg-transparent px-4 pt-2'>
								<TabsTrigger value='info' className='flex items-center gap-1.5'>
									<IconInfoCircle size={14} />
									Info
								</TabsTrigger>
								<TabsTrigger value='logs' className='flex items-center gap-1.5'>
									<IconFileText size={14} />
									Logs
								</TabsTrigger>
								<TabsTrigger value='stats' className='flex items-center gap-1.5'>
									<IconChartBar size={14} />
									Stats
								</TabsTrigger>
							</TabsList>

							<TabsContent value='info' className='flex-1 overflow-auto p-4'>
								<InfoTab containerName={containerName} />
							</TabsContent>
							<TabsContent value='logs' className='flex min-h-0 flex-1 flex-col p-4'>
								<LogsTab containerName={containerName} />
							</TabsContent>
							<TabsContent value='stats' className='flex-1 overflow-auto p-4'>
								<StatsTab containerName={containerName} />
							</TabsContent>
						</Tabs>
					)}
				</div>
			</SheetContent>
		</Sheet>
	)
}
