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
//
// Phase 181-01 — forward-declare CcTerminalHandle type; full forwardRef in 181-03.
// Phase 181-03 — converted to forwardRef + touch gesture handlers (additive).
//   Gesture summary:
//     - pinch-zoom: 2 touches, 1pt per 20px spread, clamped [10,22]pt, localStorage persisted
//     - two-finger tap: clipboard paste into PTY stdin
//     - three-finger swipe-down: ws.detach() (deltaY > 60px)
//     - sendStdin ref: CcTerminalHandle.sendStdin → wsRef.current.sendStdin
//   Existing 31 Phase-167 assertions unmodified.

import {useEffect, useRef, forwardRef, useImperativeHandle} from 'react'
import {Terminal} from '@xterm/xterm'
import {FitAddon} from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

import {useTheme} from '@/hooks/use-theme'
import {CcPtyWsClient} from './terminal-ws-client'
import {livosThemeToXtermTheme} from './terminal-theme'
import {JWT_LOCAL_STORAGE_KEY} from '@/modules/auth/shared'

// Phase 181-03 — Public handle interface for key bar wiring (chat-mobile/index.tsx)
export interface CcTerminalHandle {
	sendStdin: (data: string) => void
}

const LS_FONT_SIZE_KEY = 'cc-pty-font-size'
const FONT_MIN = 10
const FONT_MAX = 22
const FONT_DEFAULT = 13

function readStoredFontSize(): number {
	try {
		const v = localStorage.getItem(LS_FONT_SIZE_KEY)
		const n = v ? parseInt(v, 10) : NaN
		return Number.isFinite(n) && n >= FONT_MIN && n <= FONT_MAX ? n : FONT_DEFAULT
	} catch {
		return FONT_DEFAULT
	}
}

function wsUrl() {
	return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`
}

// Phase 167.1 hotfix — the livinityd upgrade handler (server/index.ts L1136)
// REQUIRES `?token=<jwt>` query param for any path mounted via the generic
// webSocketRouter; cookie auth alone gets silent socket.destroy(). Mirror the
// /ws/agent client pattern (use-agent-socket.ts L475-L483) and append the JWT
// from localStorage. Empty token = let the URL form fail-fast at server side
// rather than connect silently.
function ccPtyWsUrl(): string {
	const base = `${wsUrl()}/ws/cc-pty`
	if (typeof localStorage === 'undefined') return base
	const jwt = localStorage.getItem(JWT_LOCAL_STORAGE_KEY)
	return jwt ? `${base}?token=${encodeURIComponent(jwt)}` : base
}

function getTouchDist(touches: TouchList | Partial<Touch>[]): number {
	const arr = Array.from(touches as any) as Array<{clientX: number; clientY: number}>
	if (arr.length < 2) return 0
	const dx = arr[0].clientX - arr[1].clientX
	const dy = arr[0].clientY - arr[1].clientY
	return Math.sqrt(dx * dx + dy * dy)
}

// Phase 181-03 — forwardRef wrapper is backward-compatible:
// callers that don't pass a ref see no change.
// Phase 189-01 — added optional `cwd` prop (additive; existing callers unchanged).
// cwd is forwarded to the WS session handshake as a hint for the server-side
// createSession call. Undefined = server uses vaultPath default (backward compat).
export const CcTerminal = forwardRef<CcTerminalHandle, {sessionId: string; cwd?: string; agentName?: string}>(
	function CcTerminal({sessionId, cwd, agentName}, ref) {
		const containerRef = useRef<HTMLDivElement>(null)
		const termRef = useRef<Terminal | null>(null)
		const fitRef = useRef<FitAddon | null>(null)
		const wsRef = useRef<CcPtyWsClient | null>(null)
		const {resolvedTheme} = useTheme()

		// Phase 181-03 — expose sendStdin via imperative handle
		useImperativeHandle(ref, () => ({
			sendStdin: (data: string) => wsRef.current?.sendStdin(data),
		}), [])

		useEffect(() => {
			if (!containerRef.current) return

			// Phase 181-03 — read stored font size (defaults to 13)
			const storedFontSize = readStoredFontSize()

			const term = new Terminal({
				fontFamily: '"JetBrains Mono", monospace',
				fontSize: storedFontSize,
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
				// v38.2 hotfix — forward cwd + agentName to ws-handler for ad-hoc create.
				cwd,
				agentName,
				onStdout: (data) => term.write(data),
				onAttached: (_env) => {
					/* sidebar metadata sync — Phase 168 */
				},
				onError: (msg) => term.write(`\r\n\x1b[31m[error] ${msg}\x1b[0m\r\n`),
			})

			term.onData((data) => ws.sendStdin(data))

			// Phase 167.2 hotfix — @xterm/addon-clipboard is not in the lockfile
			// (D-NEW-DEPS-v35), so wire copy/paste through the navigator Clipboard
			// API. Convention mirrors most modern terminal emulators:
			//   - Ctrl+Shift+V / Cmd+V   → paste from clipboard into PTY stdin
			//   - Ctrl+Shift+C / Cmd+C   → copy current selection (no selection
			//                              passes Ctrl+C through to claude as SIGINT)
			// Right-click also pastes (matches xterm.js Linux convention).
			const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
			term.attachCustomKeyEventHandler((ev) => {
				if (ev.type !== 'keydown') return true
				const mod = isMac ? ev.metaKey : ev.ctrlKey
				if (!mod) return true
				// Phase 167.3 — case-insensitive ev.key. When Shift is held, browsers
				// emit `ev.key='C'` / `ev.key='V'` (uppercase) on Linux+Windows, so
				// the prior 'c'/'v' literal checks missed Ctrl+Shift+C entirely. The
				// xterm.js convention is the de-facto:
				//   • Ctrl+Shift+V  (Linux/Win)  /  Cmd+V  (Mac)  → paste
				//   • Ctrl+Shift+C  (Linux/Win)  /  Cmd+C  (Mac)  → copy selection
				//   • Ctrl+C with active selection                → copy (gnome-terminal
				//                                                   convention)
				//   • Ctrl+C without selection                    → SIGINT to claude
				const key = ev.key.toLowerCase()

				// Paste
				if (key === 'v' && (isMac ? !ev.shiftKey : ev.shiftKey)) {
					navigator.clipboard
						.readText()
						.then((text) => {
							if (text) ws.sendStdin(text)
						})
						.catch(() => {
							/* clipboard permission denied — silent */
						})
					return false
				}

				// Copy via Ctrl+Shift+C / Cmd+C
				if (key === 'c' && (isMac ? !ev.shiftKey : ev.shiftKey)) {
					const sel = term.getSelection()
					if (sel) {
						navigator.clipboard.writeText(sel).catch(() => {
							/* clipboard permission denied — silent */
						})
						return false
					}
					return false // swallow even if no selection so SIGINT is unambiguous
				}

				// Copy via plain Ctrl+C ONLY when there is an active selection
				// (gnome-terminal pattern). Otherwise let Ctrl+C through so claude
				// receives SIGINT.
				if (!isMac && ev.ctrlKey && !ev.shiftKey && key === 'c') {
					const sel = term.getSelection()
					if (sel) {
						navigator.clipboard.writeText(sel).catch(() => {})
						term.clearSelection?.()
						return false
					}
				}

				return true
			})

			const onContextMenu = (e: MouseEvent) => {
				e.preventDefault()
				navigator.clipboard
					.readText()
					.then((text) => {
						if (text) ws.sendStdin(text)
					})
					.catch(() => {
						/* clipboard permission denied — silent */
					})
			}
			containerRef.current.addEventListener('contextmenu', onContextMenu)
			const containerForCleanup = containerRef.current

			const ro = new ResizeObserver(() => {
				fit.fit()
				ws.sendResize(term.cols, term.rows)
			})
			ro.observe(containerRef.current)

			termRef.current = term
			fitRef.current = fit
			wsRef.current = ws

			// ── Phase 181-03 — Touch gesture handlers (ADDITIVE) ────────────────
			// Registered AFTER the existing setup to avoid any risk to the existing
			// code paths above.

			let touchStartDist = 0
			let threeFingerStartY = 0

			const onTouchStart = (e: TouchEvent) => {
				if (e.touches.length === 2) {
					touchStartDist = getTouchDist(e.touches)
				}
				if (e.touches.length === 3) {
					threeFingerStartY = (e.touches[0] as Touch).clientY
				}
			}

			const onTouchMove = (e: TouchEvent) => {
				if (e.touches.length === 2 && touchStartDist > 0) {
					const dist = getTouchDist(e.touches)
					const delta = dist - touchStartDist
					const steps = Math.round(delta / 20)
					if (steps !== 0) {
						const current = ((term.options as any).fontSize as number) ?? FONT_DEFAULT
						const next = Math.max(FONT_MIN, Math.min(FONT_MAX, current + steps))
						if (next !== current) {
							;(term.options as any).fontSize = next
							fitRef.current?.fit()
							try {
								localStorage.setItem(LS_FONT_SIZE_KEY, String(next))
							} catch {
								/* ignore — storage full or sandboxed */
							}
						}
						// Reset baseline so next move is incremental
						touchStartDist = dist
					}
				}
			}

			const onTouchEnd = (e: TouchEvent) => {
				const changed = Array.from(e.changedTouches)
				// Two-finger tap: 2 touches ended with < 10px distance change → paste
				if (changed.length >= 2 && touchStartDist > 0) {
					const endDist = getTouchDist(e.changedTouches)
					if (Math.abs(endDist - touchStartDist) < 10) {
						navigator.clipboard
							.readText()
							.then((text) => {
								if (text) wsRef.current?.sendStdin(text)
							})
							.catch(() => {
								/* clipboard permission denied — silent */
							})
					}
				}
				// Three-finger swipe-down: deltaY > 60px → detach
				if (changed.length >= 3 && threeFingerStartY > 0) {
					const endY = (changed[0] as Touch).clientY
					if (endY - threeFingerStartY > 60) {
						wsRef.current?.detach()
					}
				}
				touchStartDist = 0
				threeFingerStartY = 0
			}

			containerRef.current.addEventListener('touchstart', onTouchStart, {passive: true})
			containerRef.current.addEventListener('touchmove', onTouchMove, {passive: true})
			containerRef.current.addEventListener('touchend', onTouchEnd, {passive: true})

			return () => {
				ro.disconnect()
				containerForCleanup.removeEventListener('contextmenu', onContextMenu)
				containerForCleanup.removeEventListener('touchstart', onTouchStart)
				containerForCleanup.removeEventListener('touchmove', onTouchMove)
				containerForCleanup.removeEventListener('touchend', onTouchEnd)
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

		return (
			<div
				ref={containerRef}
				className='h-full w-full bg-bg'
				style={{overscrollBehavior: 'contain', touchAction: 'pan-y'}}
			/>
		)
	},
)

// Display name for React DevTools
CcTerminal.displayName = 'CcTerminal'
