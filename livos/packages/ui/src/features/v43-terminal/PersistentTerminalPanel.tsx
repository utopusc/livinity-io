/**
 * Phase 243-03 — Persistent UI Terminal panel.
 *
 * Browser-side xterm.js panel that talks to the new `/livos/terminal/ws`
 * cookie-auth WebSocket endpoint (Plan 243-02) backed by the bruce-only
 * PtySession module (Plan 243-01).
 *
 * Theme matches CONTEXT spec:
 *   - background `#0b0b0c`
 *   - foreground `#e7e7e8`
 *   - accent     `#7dd3fc`
 *
 * Hidden behind the `livos:v43:terminal_panel` Redis feature flag — the
 * dock entry and the route swap in `window-content.tsx` both gate visibility
 * via `useTerminalPanelEnabled()`. When the flag is OFF the legacy
 * `terminal-content.tsx` surface is rendered instead (D-243-FLAG-ROLLBACK).
 *
 * Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED — this
 * file lives under `livos/packages/ui/` and does not touch `liv/`.
 */
import {FitAddon} from '@xterm/addon-fit'
import {WebLinksAddon} from '@xterm/addon-web-links'
import {Terminal} from '@xterm/xterm'
import {useEffect, useRef, useState} from 'react'

import {useTerminalWs, type ServerToClient} from './use-terminal-ws'

import '@xterm/xterm/css/xterm.css'

const TERMINAL_THEME = {
	background: '#0b0b0c',
	foreground: '#e7e7e8',
	cursor: '#7dd3fc',
	selectionBackground: '#1f2937',
} as const

const FONT_FAMILY =
	"'SF Mono', SFMono-Regular, ui-monospace, 'DejaVu Sans Mono', Menlo, Consolas, monospace"

export default function PersistentTerminalPanel() {
	const containerRef = useRef<HTMLDivElement | null>(null)
	const terminalRef = useRef<Terminal | null>(null)
	const fitAddonRef = useRef<FitAddon | null>(null)
	const lastDimsRef = useRef<{cols: number; rows: number} | null>(null)
	const isClosedRef = useRef(false)
	const sendRef = useRef<((msg: import('./use-terminal-ws').ClientToServer) => void) | null>(null)

	const [sessionId, setSessionId] = useState<string | null>(null)
	const [statusText, setStatusText] = useState<string>('connecting…')

	// ─── xterm mount (one-shot) ───────────────────────────────────────────
	useEffect(() => {
		if (!containerRef.current) return

		const term = new Terminal({
			fontSize: 13,
			fontFamily: FONT_FAMILY,
			cursorBlink: true,
			theme: TERMINAL_THEME,
		})
		const fit = new FitAddon()
		const links = new WebLinksAddon()
		term.loadAddon(fit)
		term.loadAddon(links)
		term.open(containerRef.current)
		try {
			fit.fit()
		} catch {
			// jsdom + headless paths can throw if the container has no layout;
			// the resize observer below will retry once a real width arrives.
		}

		terminalRef.current = term
		fitAddonRef.current = fit

		// Forward xterm keystrokes to the WS.
		term.onData((data) => {
			if (isClosedRef.current) return
			sendRef.current?.({type: 'data', data})
		})

		// Container ResizeObserver → re-fit + resize message when dims change.
		let observer: ResizeObserver | null = null
		if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
			observer = new ResizeObserver(() => {
				const f = fitAddonRef.current
				if (!f) return
				try {
					f.fit()
				} catch {
					return
				}
				const dims = f.proposeDimensions()
				if (!dims) return
				const cols = Math.max(1, Math.floor(dims.cols))
				const rows = Math.max(1, Math.floor(dims.rows))
				const prev = lastDimsRef.current
				if (!prev || prev.cols !== cols || prev.rows !== rows) {
					lastDimsRef.current = {cols, rows}
					if (!isClosedRef.current) {
						sendRef.current?.({type: 'resize', cols, rows})
					}
				}
			})
			observer.observe(containerRef.current)
		}

		return () => {
			observer?.disconnect()
			try {
				term.dispose()
			} catch {
				// no-op
			}
			terminalRef.current = null
			fitAddonRef.current = null
		}
	}, [])

	// ─── WebSocket lifecycle ──────────────────────────────────────────────
	const {send} = useTerminalWs({
		onOpen: () => {
			const fit = fitAddonRef.current
			let cols = 80
			let rows = 24
			if (fit) {
				try {
					const dims = fit.proposeDimensions()
					if (dims) {
						cols = Math.max(1, Math.floor(dims.cols))
						rows = Math.max(1, Math.floor(dims.rows))
					}
				} catch {
					// fall through with defaults
				}
			}
			lastDimsRef.current = {cols, rows}
			setStatusText('initializing…')
			// Send init IMMEDIATELY on WS open (243-02 protocol).
			send({type: 'init', cols, rows})
		},
		onMessage: (msg: ServerToClient) => {
			const term = terminalRef.current
			if (!term) return
			switch (msg.type) {
				case 'ready':
					setSessionId(msg.sessionId)
					setStatusText('connected')
					try {
						term.writeln(`\x1b[2m[session ${msg.sessionId} ready]\x1b[0m`)
					} catch {
						// no-op
					}
					break
				case 'data':
					term.write(msg.data)
					break
				case 'exit':
					try {
						term.writeln(
							`\r\n[session exited code=${msg.code} signal=${msg.signal ?? 'null'}]`,
						)
					} catch {
						// no-op
					}
					isClosedRef.current = true
					setStatusText('disconnected')
					break
				case 'error':
					try {
						term.writeln(`\r\n[error] ${msg.message}`)
					} catch {
						// no-op
					}
					// Do NOT close — server may recover for non-fatal errors.
					break
				default:
					// Unknown message — ignore (forward-compatible).
					break
			}
		},
		onClose: () => {
			const term = terminalRef.current
			if (term) {
				try {
					term.writeln('\r\n[disconnected]')
				} catch {
					// no-op
				}
			}
			isClosedRef.current = true
			setStatusText('disconnected')
		},
	})

	// Keep the send ref current so the xterm onData / ResizeObserver
	// closures always reach the latest socket reference.
	sendRef.current = send

	return (
		<div className='relative flex h-full w-full flex-col bg-[#0b0b0c]'>
			{/* Status pill */}
			<div className='pointer-events-none absolute right-3 top-3 z-10 select-none rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-mono text-[#7dd3fc] shadow-sm backdrop-blur-sm'>
				{sessionId ? `${statusText} · ${sessionId.slice(0, 8)}` : statusText}
			</div>
			<div ref={containerRef} className='h-full w-full p-2' />
		</div>
	)
}
