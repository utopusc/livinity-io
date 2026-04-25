// Phase 29 Plan 29-01 — single-tab xterm session (DOC-15).
//
// One ExecTabPane = one xterm Terminal + one WebSocket = one container shell.
// Lifted verbatim from container-detail-sheet.tsx ConsoleTab (Phase 17 QW-01)
// with two adjustments:
//   1. envId added to the WS URL params (consumes Plan 29-01 Task 1's
//      env-aware /ws/docker-exec handler).
//   2. isActive prop drives display:none rather than unmount — switching
//      tabs keeps each session's xterm + WS alive (no remount = no session
//      loss). Tabs only tear down when explicitly closed by the parent.
//
// Cross-env tabs (D-06): when the user switches the global envId, EXISTING
// tabs from the prior env continue running with their original envId. The
// xterm + WS were instantiated with the old envId and are unaffected by env
// changes elsewhere. If the underlying container goes away (e.g. agent env
// disconnects), the WS closes naturally and the xterm shows the existing
// red [Disconnected] line. Explicit user action (click X) is required to
// reclaim the tab.
//
// xterm css must be imported once per file that mounts a Terminal —
// container-detail-sheet.tsx already does this; the import is idempotent at
// the bundler level so doubling it here is safe.

import {Terminal} from '@xterm/xterm'
import {FitAddon} from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import {useEffect, useRef} from 'react'

interface ExecTabPaneProps {
	containerName: string
	envId: string
	isActive: boolean
}

// Shared xterm theme — matches ContainerDetailSheet ConsoleTab + LogsTab.
const XTERM_THEME = {
	background: '#0a0a0a',
	foreground: '#e5e5e5',
	cursor: '#e5e5e5',
	black: '#000000',
	red: '#ef4444',
	green: '#22c55e',
	yellow: '#eab308',
	blue: '#3b82f6',
	magenta: '#a855f7',
	cyan: '#06b6d4',
	white: '#e5e5e5',
	brightBlack: '#525252',
	brightRed: '#f87171',
	brightGreen: '#4ade80',
	brightYellow: '#facc15',
	brightBlue: '#60a5fa',
	brightMagenta: '#c084fc',
	brightCyan: '#22d3ee',
	brightWhite: '#fafafa',
} as const

export function ExecTabPane({containerName, envId, isActive}: ExecTabPaneProps) {
	const terminalRef = useRef<Terminal | null>(null)
	const wsRef = useRef<WebSocket | null>(null)
	const containerRef = useRef<HTMLDivElement>(null)
	const fitAddonRef = useRef<FitAddon | null>(null)
	const resizeObserverRef = useRef<ResizeObserver | null>(null)
	const startedRef = useRef(false)

	// Mount xterm + WS exactly once per pane (lifetime = parent's tab entry).
	useEffect(() => {
		if (!containerRef.current || startedRef.current) return
		startedRef.current = true

		const terminal = new Terminal({
			fontSize: 13,
			fontFamily: 'SF Mono, SFMono-Regular, ui-monospace, DejaVu Sans Mono, Menlo, Consolas, monospace',
			cursorBlink: true,
			theme: XTERM_THEME,
		})
		terminalRef.current = terminal

		const fitAddon = new FitAddon()
		fitAddonRef.current = fitAddon
		terminal.loadAddon(fitAddon)
		terminal.open(containerRef.current)

		// Build WebSocket URL — mirrors container-detail-sheet.tsx ConsoleTab
		// verbatim PLUS the envId param (Plan 29-01 Task 1 consumer).
		const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
		const port = window.location.port ? `:${window.location.port}` : ''
		const token = localStorage.getItem('jwt') || ''
		const params = new URLSearchParams({
			container: containerName,
			envId,
			shell: 'bash',
			token,
		})
		const wsUrl = `${wsProtocol}//${window.location.hostname}${port}/ws/docker-exec?${params}`

		const ws = new WebSocket(wsUrl)
		ws.binaryType = 'arraybuffer'
		wsRef.current = ws

		ws.onopen = () => {
			try {
				fitAddon.fit()
			} catch {
				/* ignore — pane may not be mounted yet on first frame */
			}
			if (isActive) terminal.focus()
		}

		ws.onmessage = (event) => {
			terminal.write(new Uint8Array(event.data as ArrayBuffer))
		}

		ws.onclose = () => {
			if (terminalRef.current) {
				terminalRef.current.write('\r\n\x1b[31m[Disconnected]\x1b[0m\r\n')
			}
		}

		ws.onerror = () => {
			// onclose will fire after; the [Disconnected] line lands there.
		}

		// Terminal -> WebSocket
		terminal.onData((data) => {
			if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
				wsRef.current.send(data)
			}
		})

		// Terminal resize -> WebSocket (JSON resize protocol from Phase 17)
		terminal.onResize(({cols, rows}) => {
			if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
				wsRef.current.send(JSON.stringify({type: 'resize', cols, rows}))
			}
		})

		// ResizeObserver to refit terminal when container dimensions change
		const observer = new ResizeObserver(() => {
			if (fitAddonRef.current && terminalRef.current) {
				try {
					fitAddonRef.current.fit()
				} catch {
					// Ignore fit errors during cleanup
				}
			}
		})
		observer.observe(containerRef.current)
		resizeObserverRef.current = observer

		// Cleanup runs only on TRUE unmount (parent removes the tab) — not on
		// active-tab toggles, since isActive change does NOT re-run this effect
		// (deps array is empty).
		return () => {
			try {
				observer.disconnect()
			} catch {
				/* ignore */
			}
			resizeObserverRef.current = null
			if (wsRef.current) {
				try {
					wsRef.current.close()
				} catch {
					/* ignore */
				}
				wsRef.current = null
			}
			if (terminalRef.current) {
				try {
					terminalRef.current.dispose()
				} catch {
					/* ignore */
				}
				terminalRef.current = null
			}
			if (fitAddonRef.current) {
				fitAddonRef.current = null
			}
			startedRef.current = false
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []) // mount once; envId/containerName captured at first run

	// When the pane becomes active, refit (the container may have been hidden
	// with display:none which causes xterm dimensions to drift).
	useEffect(() => {
		if (!isActive) return
		if (fitAddonRef.current) {
			try {
				fitAddonRef.current.fit()
			} catch {
				/* ignore */
			}
		}
		if (terminalRef.current) {
			terminalRef.current.focus()
		}
	}, [isActive])

	return (
		<div
			ref={containerRef}
			style={{display: isActive ? 'block' : 'none'}}
			className='size-full rounded-lg bg-neutral-950 p-1'
		/>
	)
}
