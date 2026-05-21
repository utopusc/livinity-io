// Phase 190-01 — BareTerminal: plain bash PTY sibling of CcTerminal.
//
// MUST NOT modify CcTerminal.tsx (Phase 167 sacred).
// Reuses CcPtyWsClient + xterm infrastructure identically.
// sessionId contract: callers must pass 'liv-bare-{uuid}' prefix ids.
//
// The WS attach envelope for BareTerminal does NOT send sessionType field
// directly — BareTerminal connects with its sessionId (liv-bare-*) prefix
// which the ws-handler uses to auto-create a bare bash session on-the-fly
// when the session is not found in the store (Plan 190-01 inline create).
//
// No wizard prompt, no agent-specific overlay panes — just a raw bash PTY.

import {useEffect, useRef, forwardRef, useImperativeHandle} from 'react'
import {Terminal} from '@xterm/xterm'
import {FitAddon} from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

import {useTheme} from '@/hooks/use-theme'
import {CcPtyWsClient} from './terminal-ws-client'
import {livosThemeToXtermTheme} from './terminal-theme'
import {JWT_LOCAL_STORAGE_KEY} from '@/modules/auth/shared'

export interface BareTerminalHandle {
	sendStdin: (data: string) => void
}

function ccPtyWsUrl(): string {
	const base = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws/cc-pty`
	const jwt = typeof localStorage !== 'undefined' ? localStorage.getItem(JWT_LOCAL_STORAGE_KEY) : null
	return jwt ? `${base}?token=${encodeURIComponent(jwt)}` : base
}

export const BareTerminal = forwardRef<BareTerminalHandle, {sessionId: string}>(
	function BareTerminal({sessionId}, ref) {
		const containerRef = useRef<HTMLDivElement>(null)
		const wsRef = useRef<CcPtyWsClient | null>(null)
		const termRef = useRef<Terminal | null>(null)
		const fitRef = useRef<FitAddon | null>(null)
		const {resolvedTheme} = useTheme()

		useImperativeHandle(ref, () => ({
			sendStdin: (data) => wsRef.current?.sendStdin(data),
		}), [])

		useEffect(() => {
			if (!containerRef.current) return

			const term = new Terminal({
				fontFamily: '"JetBrains Mono", monospace',
				fontSize: 13,
				cursorBlink: true,
				theme: livosThemeToXtermTheme(resolvedTheme),
				allowProposedApi: true,
				scrollback: 5000,
			})

			const fit = new FitAddon()
			term.loadAddon(fit)
			term.open(containerRef.current)
			fit.fit()

			const ws = new CcPtyWsClient({
				url: ccPtyWsUrl(),
				sessionId,
				onStdout: (data) => term.write(data),
				onAttached: () => {},
				onError: (msg) => term.write(`\r\n\x1b[31m[error] ${msg}\x1b[0m\r\n`),
			})

			term.onData((data) => ws.sendStdin(data))

			const ro = new ResizeObserver(() => {
				fit.fit()
				ws.sendResize(term.cols, term.rows)
			})
			ro.observe(containerRef.current)

			termRef.current = term
			fitRef.current = fit
			wsRef.current = ws

			return () => {
				ro.disconnect()
				ws.detach()
				term.dispose()
			}
			// resolvedTheme intentionally NOT in deps — the theme-reactive effect below handles it.
			// eslint-disable-next-line react-hooks/exhaustive-deps
		}, [sessionId])

		// Theme reactive update (no remount)
		useEffect(() => {
			const term = termRef.current
			if (!term) return
			if ('options' in term && term.options) {
				;(term.options as any).theme = livosThemeToXtermTheme(resolvedTheme)
			}
		}, [resolvedTheme])

		return (
			<div
				ref={containerRef}
				className='h-full w-full bg-bg'
				style={{overscrollBehavior: 'contain', touchAction: 'pan-y'}}
			/>
		)
	},
)

BareTerminal.displayName = 'BareTerminal'
