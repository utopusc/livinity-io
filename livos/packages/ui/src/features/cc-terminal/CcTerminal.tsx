// Phase 167-01 — <CcTerminal sessionId> component
//
// Mounts xterm.js into a DOM container, wires the FitAddon for terminal
// fit-on-resize, and bridges stdin/stdout via the Plan 167-02 CcPtyWsClient.
//
// Lifecycle:
//   - sessionId-keyed useEffect creates Terminal + WS, returns cleanup
//   - theme-keyed useEffect reassigns term.options.theme WITHOUT remount
//   - cleanup order: ro.disconnect() → ws.detach() → term.dispose()
//
// Theme handling: Plan 167-03 replaces the inline livosThemeToXtermTheme
// stub with the canonical implementation in `./terminal-theme.ts`. For now
// the stub returns a minimal valid ITheme based on `resolvedTheme`.
//
// Deviation (Rule 3) — D-NEW-DEPS-v35: only `@xterm/xterm` and
// `@xterm/addon-fit` are in pnpm-lock.yaml. The plan referenced
// `@xterm/addon-web-links` + `@xterm/addon-canvas` but those are NOT
// installed; adding them would violate D-NEW-DEPS-v35 (no package.json
// changes in Phase 167). The terminal still renders correctly with just
// the fit addon — links become plain text (clickable detection is a
// "nice-to-have"), and the default DOM renderer replaces the canvas
// renderer (slightly slower but functional). Adding these addons is
// deferred to a future phase that explicitly authorizes the deps.

import {useEffect, useRef} from 'react'
import {Terminal} from '@xterm/xterm'
import {FitAddon} from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

import {useTheme} from '@/hooks/use-theme'
import {CcPtyWsClient} from './terminal-ws-client'

// Inline stub — Plan 167-03 replaces with the canonical
// livosThemeToXtermTheme from './terminal-theme'.
function livosThemeToXtermTheme(resolvedTheme: 'light' | 'dark' | 'iridescent') {
	const isDark = resolvedTheme === 'dark' || resolvedTheme === 'iridescent'
	return {
		background: isDark ? '#0a0a0a' : '#ffffff',
		foreground: isDark ? '#e5e5e5' : '#1a1a1a',
		cursor: isDark ? '#06b6d4' : '#0891b2',
	}
}

function wsUrl() {
	return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`
}

export function CcTerminal({sessionId}: {sessionId: string}) {
	const containerRef = useRef<HTMLDivElement>(null)
	const termRef = useRef<Terminal | null>(null)
	const fitRef = useRef<FitAddon | null>(null)
	const wsRef = useRef<CcPtyWsClient | null>(null)
	const {resolvedTheme} = useTheme()

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
			url: `${wsUrl()}/ws/cc-pty`,
			sessionId,
			onStdout: (data) => term.write(data),
			onAttached: (_env) => {
				/* sidebar metadata sync — Phase 168 */
			},
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
		// resolvedTheme intentionally NOT in deps — the theme-reactive effect
		// below updates term.options.theme without remount.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [sessionId])

	// Theme reactive update (no remount)
	useEffect(() => {
		const term = termRef.current
		if (!term) return
		// xterm v5: term.options.theme = ... (setOption deprecated).
		// Both branches kept for safety.
		if ('options' in term && term.options) {
			;(term.options as any).theme = livosThemeToXtermTheme(resolvedTheme)
		} else if ((term as any).setOption) {
			;(term as any).setOption('theme', livosThemeToXtermTheme(resolvedTheme))
		}
	}, [resolvedTheme])

	return <div ref={containerRef} className='h-full w-full bg-bg' />
}
