import {useState, useEffect, useRef, useCallback} from 'react'
import {
	IconInfoCircle,
	IconFileText,
	IconChartBar,
	IconTerminal2,
	IconFolder,
	IconX,
	IconRefresh,
	IconLoader2,
	IconAlertTriangle,
	IconPencil,
	IconCopy,
	IconSearch,
	IconDownload,
	IconTrash,
} from '@tabler/icons-react'
import {Terminal} from '@xterm/xterm'
import {FitAddon} from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

import {useContainerDetail} from '@/hooks/use-container-detail'
import {trpcReact} from '@/trpc/trpc'
import {Sheet, SheetContent} from '@/shadcn-components/ui/sheet'
import {Tabs, TabsList, TabsTrigger, TabsContent} from '@/shadcn-components/ui/tabs'
import {cn} from '@/shadcn-lib/utils'

import {FilesTab} from './container-files-tab'

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
// xterm theme (shared by ConsoleTab and LogsTab — hoisted to module scope)
// ---------------------------------------------------------------------------

const XTERM_THEME = {
	background: '#171717',
	foreground: '#e5e5e5',
	cursor: '#a3a3a3',
	selectionBackground: '#404040',
	black: '#171717',
	red: '#f87171',
	green: '#4ade80',
	yellow: '#facc15',
	blue: '#60a5fa',
	magenta: '#c084fc',
	cyan: '#22d3ee',
	white: '#e5e5e5',
	brightBlack: '#525252',
	brightRed: '#fca5a5',
	brightGreen: '#86efac',
	brightYellow: '#fde68a',
	brightBlue: '#93c5fd',
	brightMagenta: '#d8b4fe',
	brightCyan: '#67e8f9',
	brightWhite: '#fafafa',
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
				<div className='grid grid-cols-1 gap-y-2 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-3'>
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
					<div className='overflow-x-auto'>
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
					</div>
				)}
			</section>

			{/* Volumes / Mounts */}
			<section>
				<SectionTitle>Volumes</SectionTitle>
				{detail.mounts.length === 0 ? (
					<p className='text-xs text-text-tertiary'>No mounts</p>
				) : (
					<div className='overflow-x-auto'>
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
// Logs Tab — live WebSocket stream via /ws/docker/logs (QW-01)
// ---------------------------------------------------------------------------

function LogsTab({containerName}: {containerName: string}) {
	const [tailLines, setTailLines] = useState(500)
	const [connected, setConnected] = useState(false)
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const [_autoScroll, _setAutoScroll] = useState(true) // reserved for future scroll lock
	const [searchTerm, setSearchTerm] = useState('')

	const terminalRef = useRef<Terminal | null>(null)
	const wsRef = useRef<WebSocket | null>(null)
	const containerRef = useRef<HTMLDivElement>(null)
	const fitAddonRef = useRef<FitAddon | null>(null)
	const resizeObserverRef = useRef<ResizeObserver | null>(null)
	// Bounded log buffer for the Download button. Trim front to cap memory.
	const logBufferRef = useRef<string[]>([])

	const disconnect = useCallback(() => {
		if (wsRef.current) {
			wsRef.current.close()
			wsRef.current = null
		}
		if (terminalRef.current) {
			terminalRef.current.dispose()
			terminalRef.current = null
		}
		fitAddonRef.current = null
		setConnected(false)
	}, [])

	const connect = useCallback(() => {
		disconnect()
		if (!containerRef.current) return

		// Create new xterm terminal — same theme/font as ConsoleTab for consistency
		const terminal = new Terminal({
			fontSize: 13,
			fontFamily: 'SF Mono, SFMono-Regular, ui-monospace, DejaVu Sans Mono, Menlo, Consolas, monospace',
			theme: XTERM_THEME,
			disableStdin: true,
			scrollback: 10000,
			convertEol: true,
		})
		terminalRef.current = terminal

		const fitAddon = new FitAddon()
		fitAddonRef.current = fitAddon
		terminal.loadAddon(fitAddon)
		terminal.open(containerRef.current)
		try {
			fitAddon.fit()
		} catch {
			// Ignore fit errors during initial mount
		}

		// Build WebSocket URL — same token pattern as ConsoleTab
		const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
		const port = window.location.port ? `:${window.location.port}` : ''
		const token = localStorage.getItem('jwt') || ''
		const params = new URLSearchParams({
			container: containerName,
			tail: String(tailLines),
			token,
		})
		const wsUrl = `${wsProtocol}//${window.location.hostname}${port}/ws/docker/logs?${params}`

		const ws = new WebSocket(wsUrl)
		ws.binaryType = 'arraybuffer' // consistency with ConsoleTab
		wsRef.current = ws

		ws.onopen = () => {
			setConnected(true)
			terminal.writeln('\x1b[90m[Connected to logs stream]\x1b[0m')
		}

		ws.onmessage = (event) => {
			const chunk =
				typeof event.data === 'string'
					? event.data
					: new TextDecoder().decode(new Uint8Array(event.data as ArrayBuffer))
			terminal.write(chunk)
			logBufferRef.current.push(chunk)
			// Bound memory — drop oldest 500 once we exceed 2000 chunks
			if (logBufferRef.current.length > 2000) {
				logBufferRef.current.splice(0, 500)
			}
		}

		ws.onclose = () => {
			setConnected(false)
			if (terminalRef.current) {
				terminalRef.current.writeln('\r\n\x1b[31m[Stream closed]\x1b[0m')
			}
		}

		ws.onerror = () => {
			setConnected(false)
		}
	}, [containerName, tailLines, disconnect])

	// Auto-connect on mount / when containerName or tail changes
	useEffect(() => {
		if (!containerName) return
		connect()
		return () => {
			disconnect()
		}
		// We intentionally don't include `connect` (stable via useCallback deps) to avoid
		// reconnect loops; changing tailLines triggers reconnect via its own button.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [containerName])

	// ResizeObserver to refit terminal when sheet dimensions change
	useEffect(() => {
		const el = containerRef.current
		if (!el) return
		const observer = new ResizeObserver(() => {
			if (fitAddonRef.current && terminalRef.current) {
				try {
					fitAddonRef.current.fit()
				} catch {
					// Ignore fit errors during cleanup
				}
			}
		})
		observer.observe(el)
		resizeObserverRef.current = observer
		return () => {
			observer.disconnect()
			resizeObserverRef.current = null
		}
	}, [])

	const handleSearch = useCallback((term: string) => {
		setSearchTerm(term)
		// TODO(QW-01/search): wire xterm search addon in v28
		terminalRef.current?.focus()
	}, [])

	const handleReconnect = useCallback(() => {
		connect()
	}, [connect])

	const handleTailChange = useCallback(
		(next: number) => {
			setTailLines(next)
			// Reconnect with new tail seed on next tick (state update is async)
			setTimeout(() => connect(), 0)
		},
		[connect],
	)

	const handleDownload = useCallback(() => {
		const blob = new Blob([logBufferRef.current.join('')], {type: 'text/plain'})
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = `${containerName}-logs-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.log`
		a.click()
		URL.revokeObjectURL(url)
	}, [containerName])

	const handleClear = useCallback(() => {
		terminalRef.current?.clear()
		logBufferRef.current.length = 0
	}, [])

	return (
		<div className='flex h-full flex-col gap-3'>
			{/* Row 1: Search (v1 placeholder) + connection indicator */}
			<div className='flex shrink-0 flex-wrap items-center gap-3'>
				<div className='relative flex items-center'>
					<IconSearch size={12} className='absolute left-2 text-text-tertiary' />
					<input
						type='text'
						value={searchTerm}
						onChange={(e) => handleSearch(e.target.value)}
						placeholder='Search logs (v28)...'
						className='w-48 rounded-lg border border-border-default bg-surface-1 py-1 pl-7 pr-2 text-xs text-text-primary placeholder:text-text-tertiary'
					/>
				</div>
				<div className='flex-1' />
				<div className='flex items-center gap-1.5 text-xs text-text-secondary'>
					<span
						className={cn(
							'inline-block h-2 w-2 rounded-full',
							connected ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]' : 'bg-red-500',
						)}
						aria-label={connected ? 'connected' : 'disconnected'}
					/>
					<span className='tabular-nums'>{connected ? 'live' : 'disconnected'}</span>
				</div>
			</div>

			{/* Row 2: Tail slider + reconnect + download + clear */}
			<div className='flex shrink-0 flex-wrap items-center gap-4'>
				<div className='flex items-center gap-2'>
					<span className='text-xs font-medium text-text-secondary'>Tail:</span>
					<input
						type='range'
						min={100}
						max={1000}
						step={100}
						value={tailLines}
						onChange={(e) => handleTailChange(Number(e.target.value))}
						className='h-1.5 w-28 cursor-pointer appearance-none rounded-full bg-surface-2 accent-brand [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand'
					/>
					<span className='w-10 text-xs tabular-nums text-text-tertiary'>{tailLines}</span>
				</div>
				<button
					onClick={handleReconnect}
					className='flex items-center gap-1.5 rounded-lg bg-surface-1 px-2.5 py-1 text-xs text-text-secondary transition-colors hover:bg-surface-2'
				>
					<IconRefresh size={12} />
					Reconnect
				</button>
				<button
					onClick={handleDownload}
					className='flex items-center gap-1.5 rounded-lg bg-surface-1 px-2.5 py-1 text-xs text-text-secondary transition-colors hover:bg-surface-2'
				>
					<IconDownload size={12} />
					Download
				</button>
				<button
					onClick={handleClear}
					className='flex items-center gap-1.5 rounded-lg bg-surface-1 px-2.5 py-1 text-xs text-text-secondary transition-colors hover:bg-surface-2'
				>
					<IconTrash size={12} />
					Clear
				</button>
			</div>

			{/* Terminal area — xterm renders ANSI colors natively */}
			<div ref={containerRef} className='h-full min-h-0 w-full flex-1 rounded-lg bg-neutral-950 p-1' />
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
// Console Tab
// ---------------------------------------------------------------------------

function ConsoleTab({containerName}: {containerName: string}) {
	const [shell, setShell] = useState<'bash' | 'sh' | 'ash'>('bash')
	const [user, setUser] = useState('')
	const [connected, setConnected] = useState(false)

	const terminalRef = useRef<Terminal | null>(null)
	const wsRef = useRef<WebSocket | null>(null)
	const containerRef = useRef<HTMLDivElement>(null)
	const fitAddonRef = useRef<FitAddon | null>(null)
	const resizeObserverRef = useRef<ResizeObserver | null>(null)

	// Query container state to determine if running (cached from Info tab)
	const inspectQuery = trpcReact.docker.inspectContainer.useQuery(
		{name: containerName},
		{enabled: !!containerName, retry: false},
	)
	const containerState = inspectQuery.data?.state ?? 'unknown'
	const isRunning = containerState === 'running'

	const disconnect = useCallback(() => {
		if (wsRef.current) {
			wsRef.current.close()
			wsRef.current = null
		}
		if (terminalRef.current) {
			terminalRef.current.dispose()
			terminalRef.current = null
		}
		if (fitAddonRef.current) {
			fitAddonRef.current = null
		}
		setConnected(false)
	}, [])

	const connect = useCallback(() => {
		// Clean up previous instances
		disconnect()

		if (!containerRef.current) return

		// Create new terminal
		const terminal = new Terminal({
			fontSize: 13,
			fontFamily: 'SF Mono, SFMono-Regular, ui-monospace, DejaVu Sans Mono, Menlo, Consolas, monospace',
			cursorBlink: true,
			theme: XTERM_THEME,
		})
		terminalRef.current = terminal

		// Create and load FitAddon
		const fitAddon = new FitAddon()
		fitAddonRef.current = fitAddon
		terminal.loadAddon(fitAddon)

		// Open terminal in container
		terminal.open(containerRef.current)

		// Build WebSocket URL
		const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
		const port = window.location.port ? `:${window.location.port}` : ''
		const token = localStorage.getItem('jwt')
		const params = new URLSearchParams({container: containerName, shell, token: token || ''})
		if (user) params.set('user', user)
		const wsUrl = `${wsProtocol}//${window.location.hostname}${port}/ws/docker-exec?${params}`

		// Create WebSocket
		const ws = new WebSocket(wsUrl)
		ws.binaryType = 'arraybuffer'
		wsRef.current = ws

		ws.onopen = () => {
			fitAddon.fit()
			terminal.focus()
			setConnected(true)
		}

		ws.onmessage = (event) => {
			terminal.write(new Uint8Array(event.data))
		}

		ws.onclose = () => {
			setConnected(false)
			if (terminalRef.current) {
				terminalRef.current.write('\r\n\x1b[31m[Disconnected]\x1b[0m\r\n')
			}
		}

		ws.onerror = () => {
			setConnected(false)
		}

		// Terminal -> WebSocket
		terminal.onData((data) => {
			if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
				wsRef.current.send(data)
			}
		})

		// Terminal resize -> WebSocket
		terminal.onResize(({cols, rows}) => {
			if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
				wsRef.current.send(JSON.stringify({type: 'resize', cols, rows}))
			}
		})
	}, [containerName, shell, user, disconnect])

	// ResizeObserver to refit terminal when container dimensions change
	useEffect(() => {
		const el = containerRef.current
		if (!el) return

		const observer = new ResizeObserver(() => {
			if (fitAddonRef.current && terminalRef.current) {
				try {
					fitAddonRef.current.fit()
				} catch {
					// Ignore fit errors during cleanup
				}
			}
		})
		observer.observe(el)
		resizeObserverRef.current = observer

		return () => {
			observer.disconnect()
			resizeObserverRef.current = null
		}
	}, [])

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (wsRef.current) {
				wsRef.current.close()
				wsRef.current = null
			}
			if (terminalRef.current) {
				terminalRef.current.dispose()
				terminalRef.current = null
			}
		}
	}, [])

	return (
		<div className='flex h-full flex-col gap-3'>
			{/* Controls */}
			<div className='flex shrink-0 items-center gap-3'>
				{isRunning ? (
					<>
						<select
							value={shell}
							onChange={(e) => setShell(e.target.value as 'bash' | 'sh' | 'ash')}
							disabled={connected}
							className='rounded-lg border border-border-default bg-surface-1 px-2.5 py-1 text-xs text-text-primary disabled:opacity-50'
						>
							<option value='bash'>bash</option>
							<option value='sh'>sh</option>
							<option value='ash'>ash</option>
						</select>
						<input
							type='text'
							value={user}
							onChange={(e) => setUser(e.target.value)}
							disabled={connected}
							placeholder='user (optional)'
							className='w-[120px] rounded-lg border border-border-default bg-surface-1 px-2.5 py-1 text-xs text-text-primary placeholder:text-text-tertiary disabled:opacity-50'
						/>
						{connected ? (
							<button
								onClick={disconnect}
								className='rounded-lg bg-red-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-red-700'
							>
								Disconnect
							</button>
						) : (
							<button
								onClick={connect}
								className='rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-emerald-700'
							>
								Connect
							</button>
						)}
					</>
				) : (
					<p className='text-xs text-text-tertiary'>Container must be running to open a console</p>
				)}
			</div>

			{/* Terminal area */}
			<div ref={containerRef} className='h-full min-h-0 w-full flex-1 rounded-lg bg-neutral-950 p-1' />
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
	onEdit,
	onDuplicate,
}: {
	containerName: string | null
	open: boolean
	onOpenChange: (open: boolean) => void
	onEdit?: (name: string) => void
	onDuplicate?: (name: string) => void
}) {
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side='right'
				className='!w-full !max-w-full sm:!w-[600px] sm:!max-w-[600px] overflow-hidden'
				closeButton={false}
			>
				<div className='relative z-10 flex h-full flex-col'>
					{/* Header */}
					<div className='flex shrink-0 items-center justify-between border-b border-border-default p-4'>
						<div className='min-w-0 flex-1'>
							<h2 className='truncate text-lg font-bold text-text-primary'>{containerName}</h2>
						</div>
						<div className='flex items-center gap-1.5'>
							{onEdit && containerName && (
								<button
									onClick={() => { onEdit(containerName); onOpenChange(false) }}
									className='rounded-lg p-2 sm:p-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-text-tertiary transition-colors hover:bg-surface-2 hover:text-blue-500'
									title='Edit'
								>
									<IconPencil size={16} />
								</button>
							)}
							{onDuplicate && containerName && (
								<button
									onClick={() => { onDuplicate(containerName); onOpenChange(false) }}
									className='rounded-lg p-2 sm:p-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-text-tertiary transition-colors hover:bg-surface-2 hover:text-blue-500'
									title='Duplicate'
								>
									<IconCopy size={16} />
								</button>
							)}
							<button
								onClick={() => onOpenChange(false)}
								className='ml-3 rounded-lg p-2 sm:p-1.5 text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-primary'
							>
								<IconX size={18} />
							</button>
						</div>
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
								<TabsTrigger value='files' className='flex items-center gap-1.5'>
									<IconFolder size={14} />
									Files
								</TabsTrigger>
								<TabsTrigger value='console' className='flex items-center gap-1.5'>
									<IconTerminal2 size={14} />
									Console
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
							<TabsContent value='files' className='flex min-h-0 flex-1 flex-col p-4'>
								<FilesTab containerName={containerName} />
							</TabsContent>
							<TabsContent value='console' className='flex min-h-0 flex-1 flex-col p-4'>
								<ConsoleTab containerName={containerName} />
							</TabsContent>
						</Tabs>
					)}
				</div>
			</SheetContent>
		</Sheet>
	)
}
