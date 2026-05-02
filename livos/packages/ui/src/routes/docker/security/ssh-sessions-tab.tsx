// Phase 48 Plan 48-02 — SshSessionsTab (FR-SSH-02).
//
// Live-tail table of sshd journal events streamed from the livinityd
// /ws/ssh-sessions WebSocket (Plan 48-01). Wire format per event:
//   {timestamp: string, message: string, ip: string | null, hostname?: string}
//
// Killer feature: each row's IP cell exposes a click-to-copy button AND a
// click-to-ban button. Click-to-ban delegates UP to security-section.tsx
// which opens the Phase 46 BanIpModal with the IP pre-populated.
//
// Pitfall handling encoded:
//   - close 4403 → "admin role required" banner
//   - close 4404 → "journalctl unavailable on host" banner
//   - close 1006/1011/1000 → reconnect-button banner
//   - 5000-event ring buffer (mirrors Phase 28 docker-logs cross-container aggregator)
//   - 4px scroll-tolerance auto-disable + explicit "Resume tailing" button
//   - "no IP" rows still render but click-to-ban is hidden (only click-to-copy on the
//     timestamp / message; no ban affordance because there's nothing to ban)
//
// D-NO-NEW-DEPS upheld — uses native WebSocket, native useState/useRef/useEffect, no
// react-window / no virtualization library (Phase 28 also uses native approach).

import {useEffect, useMemo, useRef, useState, useCallback} from 'react'
import {IconCopy, IconBan, IconArrowDown} from '@tabler/icons-react'

import {Badge} from '@/shadcn-components/ui/badge'
import {Button} from '@/shadcn-components/ui/button'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/shadcn-components/ui/table'

const RING_BUFFER_LIMIT = 5_000
const SCROLL_TOLERANCE_PX = 4

interface SshSessionEvent {
	timestamp: string
	message: string
	ip: string | null
	hostname?: string
}

interface SshSessionsTabProps {
	// Lifted-up callback — security-section.tsx opens the BanIpModal with the IP pre-populated.
	onBanIp: (ip: string) => void
}

type ConnectionState =
	| {kind: 'connecting'}
	| {kind: 'connected'}
	| {kind: 'closed-admin'} // 4403
	| {kind: 'closed-missing'} // 4404
	| {kind: 'closed-network'; code: number; reason: string}
	| {kind: 'closed-server'; code: number; reason: string}

function getJwtFromStorage(): string | null {
	// Mirrors the existing pattern from container-detail-sheet.tsx / exec-tab-pane.tsx /
	// terminal/_shared.tsx / voice-button.tsx — UI uses localStorage 'jwt' for WS auth.
	try {
		return localStorage.getItem('jwt')
	} catch {
		return null
	}
}

function buildWsUrl(): string {
	const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
	const port = window.location.port ? `:${window.location.port}` : ''
	const token = getJwtFromStorage()
	const tokenQs = token ? `?token=${encodeURIComponent(token)}` : ''
	return `${proto}//${window.location.hostname}${port}/ws/ssh-sessions${tokenQs}`
}

function formatTs(microsStr: string): string {
	const ms = Number(microsStr) / 1000
	if (!Number.isFinite(ms)) return microsStr
	const d = new Date(ms)
	// Local-time HH:mm:ss (operator-friendly; full ISO date in tooltip).
	return d.toLocaleTimeString()
}

function isAtBottom(el: HTMLElement, tolerance: number): boolean {
	return el.scrollHeight - el.scrollTop - el.clientHeight <= tolerance
}

export function SshSessionsTab({onBanIp}: SshSessionsTabProps) {
	const [events, setEvents] = useState<SshSessionEvent[]>([])
	const [conn, setConn] = useState<ConnectionState>({kind: 'connecting'})
	const [liveTail, setLiveTail] = useState<boolean>(true)
	const [reconnectKey, setReconnectKey] = useState<number>(0)
	const [copiedIp, setCopiedIp] = useState<string | null>(null)
	const scrollRef = useRef<HTMLDivElement | null>(null)

	// WebSocket lifecycle — re-establish when reconnectKey bumps.
	useEffect(() => {
		const url = buildWsUrl()
		let ws: WebSocket | null = null
		try {
			ws = new WebSocket(url)
		} catch (err) {
			setConn({kind: 'closed-network', code: 1006, reason: (err as Error)?.message || 'connect failed'})
			return
		}
		setConn({kind: 'connecting'})

		ws.onopen = () => setConn({kind: 'connected'})
		ws.onmessage = (msg) => {
			try {
				const parsed = JSON.parse(msg.data) as SshSessionEvent
				// Defensive — only push if the shape looks right.
				if (typeof parsed.timestamp !== 'string' || typeof parsed.message !== 'string') return
				setEvents((prev) => {
					const next =
						prev.length >= RING_BUFFER_LIMIT
							? prev.slice(prev.length - RING_BUFFER_LIMIT + 1)
							: prev
					return [...next, parsed]
				})
			} catch {
				// ignore malformed
			}
		}
		ws.onerror = () => {
			// onclose will fire next with code; let it set the terminal state.
		}
		ws.onclose = (ev) => {
			if (ev.code === 4403) setConn({kind: 'closed-admin'})
			else if (ev.code === 4404) setConn({kind: 'closed-missing'})
			else if (ev.code === 1011 || ev.code === 1000)
				setConn({kind: 'closed-server', code: ev.code, reason: ev.reason || ''})
			else setConn({kind: 'closed-network', code: ev.code, reason: ev.reason || ''})
		}

		return () => {
			try {
				ws?.close(1000, 'unmount')
			} catch {
				// ignore — closing a never-opened WS can throw in some browsers
			}
		}
	}, [reconnectKey])

	// Auto-scroll-to-bottom when liveTail is on and new events arrive.
	useEffect(() => {
		if (liveTail && scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight
		}
	}, [events.length, liveTail])

	const onScroll = useCallback(
		(e: React.UIEvent<HTMLDivElement>) => {
			// 4px scroll tolerance — if user scrolled up by more than 4px, disable live-tail.
			if (!isAtBottom(e.currentTarget, SCROLL_TOLERANCE_PX)) {
				if (liveTail) setLiveTail(false)
			}
		},
		[liveTail],
	)

	const onResumeTailing = useCallback(() => {
		setLiveTail(true)
		if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
	}, [])

	const onCopyIp = useCallback(async (ip: string) => {
		try {
			await navigator.clipboard.writeText(ip)
			setCopiedIp(ip)
			setTimeout(() => setCopiedIp((current) => (current === ip ? null : current)), 1500)
		} catch {
			// clipboard blocked — fallback: degrade silently for v29.4.
		}
	}, [])

	const reconnect = useCallback(() => setReconnectKey((k) => k + 1), [])

	// Connection-state banner (rendered above the table).
	const banner = useMemo(() => {
		switch (conn.kind) {
			case 'connecting':
				return (
					<div className='m-4 rounded-radius-md border border-border-default bg-surface-2 px-4 py-2 text-body-sm text-text-secondary'>
						Connecting to SSH session stream…
					</div>
				)
			case 'connected':
				return null
			case 'closed-admin':
				return (
					<div className='m-4 rounded-radius-md border border-destructive2/40 bg-destructive2/10 px-4 py-3 text-body-sm text-destructive2'>
						<strong>Admin role required.</strong> Only admins can view live SSH session traffic.
					</div>
				)
			case 'closed-missing':
				return (
					<div className='m-4 rounded-radius-md border border-amber-200 bg-amber-50 px-4 py-3 text-body-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200'>
						<strong>journalctl unavailable on host.</strong> Live SSH session viewer requires
						journalctl. (Mini PC always has it; this banner indicates a deployment
						misconfiguration.)
					</div>
				)
			case 'closed-network':
				return (
					<div className='m-4 flex items-center gap-3 rounded-radius-md border border-amber-200 bg-amber-50 px-4 py-3 text-body-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200'>
						<span>
							<strong>Connection lost</strong> (code {conn.code}).
						</span>
						<Button size='sm' variant='default' onClick={reconnect}>
							Reconnect
						</Button>
					</div>
				)
			case 'closed-server':
				return (
					<div className='m-4 flex items-center gap-3 rounded-radius-md border border-amber-200 bg-amber-50 px-4 py-3 text-body-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200'>
						<span>
							Server closed connection ({conn.code}
							{conn.reason ? `: ${conn.reason}` : ''}).
						</span>
						<Button size='sm' variant='default' onClick={reconnect}>
							Reconnect
						</Button>
					</div>
				)
		}
	}, [conn, reconnect])

	return (
		<div className='flex h-full min-h-0 flex-col'>
			{/* Header — controls + counter */}
			<div className='flex shrink-0 items-center justify-between border-b border-border-default px-4 py-2'>
				<div className='flex items-center gap-2'>
					<h3 className='text-body font-semibold text-text-primary'>SSH Sessions</h3>
					<Badge variant={conn.kind === 'connected' ? 'primary' : 'outline'}>
						{conn.kind === 'connected' ? 'Live' : 'Disconnected'}
					</Badge>
					<span className='text-caption text-text-secondary'>
						{events.length.toLocaleString()} / {RING_BUFFER_LIMIT.toLocaleString()} events
					</span>
				</div>
				<div className='flex items-center gap-2'>
					{!liveTail ? (
						<Button size='sm' variant='primary' onClick={onResumeTailing}>
							<IconArrowDown size={14} className='mr-1' />
							Resume tailing
						</Button>
					) : null}
				</div>
			</div>

			{banner}

			{/* Table — scroll container is the ref for auto-scroll + scroll-detect */}
			<div ref={scrollRef} onScroll={onScroll} className='min-h-0 flex-1 overflow-y-auto'>
				{events.length === 0 ? (
					<div className='py-12 text-center text-body-sm text-text-secondary'>
						{conn.kind === 'connected' ? 'Listening for SSH events…' : '—'}
					</div>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className='w-32'>Time</TableHead>
								<TableHead>Message</TableHead>
								<TableHead className='w-56'>IP</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{events.map((ev, i) => (
								<TableRow key={`${ev.timestamp}-${i}`}>
									<TableCell
										className='font-mono text-caption text-text-secondary'
										title={(() => {
											const ms = Number(ev.timestamp) / 1000
											return Number.isFinite(ms) ? new Date(ms).toISOString() : ev.timestamp
										})()}
									>
										{formatTs(ev.timestamp)}
									</TableCell>
									<TableCell className='break-all font-mono text-caption text-text-primary'>
										{ev.message}
									</TableCell>
									<TableCell>
										{ev.ip ? (
											<div className='flex items-center gap-1'>
												<span className='font-mono text-caption text-text-primary'>{ev.ip}</span>
												<Button
													size='sm'
													variant='default'
													title='Copy IP'
													onClick={() => onCopyIp(ev.ip!)}
												>
													<IconCopy size={12} />
													{copiedIp === ev.ip ? <span className='ml-1 text-caption'>copied</span> : null}
												</Button>
												<Button
													size='sm'
													variant='destructive'
													title='Ban IP via fail2ban'
													onClick={() => onBanIp(ev.ip!)}
												>
													<IconBan size={12} />
												</Button>
											</div>
										) : (
											<span className='text-caption text-text-secondary'>—</span>
										)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</div>
		</div>
	)
}
