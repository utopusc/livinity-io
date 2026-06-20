/**
 * Phase 243-03 + Phase 246-04 — Persistent UI Terminal panel.
 *
 * Multi-tab host. Each tab is a long-lived xterm.js instance backed by a
 * server-side PtySession. Tabs survive browser reload via the
 * `livos.v44.terminal.session.<tabKey>` localStorage map: on mount the
 * panel iterates that prefix, mints one `TerminalTabPane` per entry in
 * attach mode, and the panel renders ?attach=<sessionId> WS connections
 * in parallel. Switching tabs flips a CSS `hidden` class — inactive
 * panes keep their WS open and their xterm DOM attached, so scroll
 * position + state never tear down.
 *
 * Theme matches Phase 243 spec verbatim (background `#0b0b0c`, foreground
 * `#e7e7e8`, accent `#7dd3fc`). The Phase 243 dock entry and the
 * window-content route swap (`useTerminalPanelEnabled` gate) are
 * UNCHANGED — this is a drop-in upgrade of the single-pane panel.
 *
 * D-V44-SACRED preserved: `liv/packages/core/src/sdk-agent-runner.ts`
 * blob SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED — this
 * file lives under `livos/packages/ui/` and does not touch `liv/`.
 */
import {FitAddon} from '@xterm/addon-fit'
import {WebglAddon} from '@xterm/addon-webgl'
import {WebLinksAddon} from '@xterm/addon-web-links'
import {Terminal} from '@xterm/xterm'
import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {createPortal} from 'react-dom'
import {uuidv7} from 'uuidv7'

import {TerminalTabBar, type TerminalTab} from './TerminalTabBar'
import {registerActiveSenderForTab, setActiveTerminalSender, setNewTabOpener} from './terminal-command-queue'
import {
	readAllTabSessions,
	removeTabSession,
	writeTabSession,
} from './terminal-session-storage'
import {useTerminalWs, type ClientToServer, type ServerToClient} from './use-terminal-ws'

import '@xterm/xterm/css/xterm.css'

const TERMINAL_THEME = {
	background: '#0b0b0c',
	foreground: '#e7e7e8',
	cursor: '#7dd3fc',
	selectionBackground: '#1f2937',
} as const

// Prefer each OS's native terminal monospace so the panel matches the
// system terminal: ui-monospace → SF Mono on macOS / Cascadia Mono on
// Windows 11; explicit Cascadia/Menlo/Consolas fallbacks cover the rest.
// (Phase 246 hot-fix — the old stack led with macOS-only 'SF Mono', so on
// Windows it silently fell through to Consolas under the DOM renderer.)
const FONT_FAMILY =
	"ui-monospace, 'Cascadia Mono', 'Cascadia Code', 'SF Mono', SFMono-Regular, Menlo, Monaco, Consolas, 'DejaVu Sans Mono', 'Liberation Mono', monospace"

/**
 * Tab state owned by `PersistentTerminalPanel`. Each tab maps to one
 * `TerminalTabPane` child, which owns the actual xterm instance + WS
 * via `useTerminalWs`. The parent only needs the metadata required to
 * render the tab strip + dispatch handlers.
 */
interface ParentTabState {
	tabKey: string
	/** Server-side session id once `{type:'ready'|'reattached'}` arrives. */
	sessionId: string | null
	/** Initial WS mode — never changes for a given tab pane mount. */
	initialMode: 'create' | 'attach'
	/** Initial sessionId carried over from localStorage in attach mode. */
	initialSessionId: string | null
	name: string
	status: 'connecting' | 'live' | 'exited' | 'expired'
}

function makeInitialTabs(): ParentTabState[] {
	const stored = readAllTabSessions()
	const entries = Object.entries(stored)
	if (entries.length === 0) {
		// First-ever mount (or cleared storage): one fresh tab in create mode.
		// Feels identical to Phase 243 single-session.
		return [
			{
				tabKey: uuidv7(),
				sessionId: null,
				initialMode: 'create',
				initialSessionId: null,
				name: 'Terminal',
				status: 'connecting',
			},
		]
	}
	return entries.map(([tabKey, sessionId], idx) => ({
		tabKey,
		sessionId,
		initialMode: 'attach' as const,
		initialSessionId: sessionId,
		name: idx === 0 ? 'Terminal' : `Terminal ${idx + 1}`,
		status: 'connecting' as const,
	}))
}

/**
 * Phase 252 — robust clipboard copy. The async Clipboard API
 * (navigator.clipboard.writeText) silently rejects in some contexts
 * (permission denied, non-top-level, older browsers). Fall back to a
 * hidden-textarea + document.execCommand("copy"), which only needs a user
 * gesture (no Clipboard-API permission / secure-context gate). Returns true
 * on success.
 */
async function copyTextRobust(text: string): Promise<boolean> {
	if (!text) return false
	try {
		if (navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(text)
			return true
		}
	} catch {
		// fall through to execCommand
	}
	try {
		const ta = document.createElement("textarea")
		ta.value = text
		ta.setAttribute("readonly", "")
		ta.style.position = "fixed"
		ta.style.top = "-9999px"
		ta.style.opacity = "0"
		document.body.appendChild(ta)
		ta.select()
		ta.setSelectionRange(0, ta.value.length)
		const ok = document.execCommand("copy")
		document.body.removeChild(ta)
		return ok
	} catch {
		return false
	}
}

export default function PersistentTerminalPanel() {
	const [tabs, setTabs] = useState<ParentTabState[]>(() => makeInitialTabs())
	const [activeTabKey, setActiveTabKey] = useState<string>(() => tabs[0]?.tabKey ?? '')
	// Ref-keyed map of tabKey → close-sender so the parent can ask the
	// pane to dispatch `{type:'close'}` on its WS without prop-drilling
	// a per-tab ref pattern through React state.
	const closeSendersRef = useRef<Map<string, () => void>>(new Map())

	const handleSessionResolved = useCallback((tabKey: string, sessionId: string) => {
		writeTabSession(tabKey, sessionId)
		setTabs((prev) =>
			prev.map((t) =>
				t.tabKey === tabKey ? {...t, sessionId, status: 'live'} : t,
			),
		)
	}, [])

	const handleExited = useCallback((tabKey: string) => {
		removeTabSession(tabKey)
		setTabs((prev) =>
			prev.map((t) => (t.tabKey === tabKey ? {...t, status: 'exited'} : t)),
		)
	}, [])

	const handleExpired = useCallback((tabKey: string) => {
		removeTabSession(tabKey)
		setTabs((prev) =>
			prev.map((t) => (t.tabKey === tabKey ? {...t, status: 'expired'} : t)),
		)
	}, [])

	const registerCloseSender = useCallback((tabKey: string, fn: (() => void) | null) => {
		if (fn === null) {
			closeSendersRef.current.delete(tabKey)
		} else {
			closeSendersRef.current.set(tabKey, fn)
		}
	}, [])

	const onActivate = useCallback((tabKey: string) => {
		setActiveTabKey(tabKey)
	}, [])

	// Phase 290 R2 — onCreate RETURNS the minted tabKey so the terminal-command
	// queue can address the freshly-created tab specifically (keyed delivery,
	// never a busy tab). TerminalTabBar's onCreate prop is `() => void` (M3) — a
	// `() => string` is assignable to it (return-type widening), so the bar usage
	// below is unchanged; the bar just ignores the returned key.
	const onCreate = useCallback((): string => {
		const tabKey = uuidv7()
		setTabs((prev) => [
			...prev,
			{
				tabKey,
				sessionId: null,
				initialMode: 'create',
				initialSessionId: null,
				name: prev.length === 0 ? 'Terminal' : `Terminal ${prev.length + 1}`,
				status: 'connecting',
			},
		])
		setActiveTabKey(tabKey)
		return tabKey
	}, [])

	// GC-A/GC-B / Phase 290 R2 — let the Liv AI CLI-auth/install bridge AND the
	// Add-Shortcut launcher open a clean new tab (via requestTerminalCommandInNewTab)
	// so a `<cli> auth login` / a launcher command never lands in a tab that
	// already has a CLI running. The opener returns the minted tabKey (B3: on
	// register, a command stashed before mount gets a fresh tab immediately).
	useEffect(() => {
		setNewTabOpener(onCreate)
		return () => setNewTabOpener(null)
	}, [onCreate])

	const onRename = useCallback((tabKey: string, newName: string) => {
		setTabs((prev) => prev.map((t) => (t.tabKey === tabKey ? {...t, name: newName} : t)))
	}, [])

	const onClose = useCallback((tabKey: string) => {
		// Ask the pane to fire `{type:'close'}` on its WS first. The pane
		// then receives `{type:'exit'}` (server replies before closing)
		// and the parent removes the tab from state below.
		const sender = closeSendersRef.current.get(tabKey)
		try {
			sender?.()
		} catch {
			// no-op — best-effort
		}
		removeTabSession(tabKey)
		closeSendersRef.current.delete(tabKey)
		setTabs((prev) => {
			const filtered = prev.filter((t) => t.tabKey !== tabKey)
			// If we just closed the active tab, pick a new active.
			setActiveTabKey((current) => {
				if (current !== tabKey) return current
				return filtered[0]?.tabKey ?? ''
			})
			return filtered
		})
	}, [])

	const tabBarItems: TerminalTab[] = useMemo(
		() =>
			tabs.map((t) => ({
				tabKey: t.tabKey,
				name: t.name,
				status: t.status,
			})),
		[tabs],
	)

	return (
		<div className='flex h-full w-full flex-col bg-[#0b0b0c]'>
			<TerminalTabBar
				tabs={tabBarItems}
				activeTabKey={activeTabKey || null}
				onActivate={onActivate}
				onCreate={onCreate}
				onRename={onRename}
				onClose={onClose}
			/>
			<div className='relative flex-1 overflow-hidden'>
				{tabs.map((t) => (
					<TerminalTabPane
						key={t.tabKey}
						tabKey={t.tabKey}
						initialMode={t.initialMode}
						initialSessionId={t.initialSessionId}
						isActive={t.tabKey === activeTabKey}
						onSessionResolved={handleSessionResolved}
						onExited={handleExited}
						onExpired={handleExpired}
						registerCloseSender={registerCloseSender}
					/>
				))}
			</div>
		</div>
	)
}

interface TerminalTabPaneProps {
	tabKey: string
	initialMode: 'create' | 'attach'
	initialSessionId: string | null
	isActive: boolean
	onSessionResolved: (tabKey: string, sessionId: string) => void
	onExited: (tabKey: string) => void
	onExpired: (tabKey: string) => void
	registerCloseSender: (tabKey: string, fn: (() => void) | null) => void
}

function TerminalTabPane({
	tabKey,
	initialMode,
	initialSessionId,
	isActive,
	onSessionResolved,
	onExited,
	onExpired,
	registerCloseSender,
}: TerminalTabPaneProps) {
	const containerRef = useRef<HTMLDivElement | null>(null)
	const terminalRef = useRef<Terminal | null>(null)
	const fitAddonRef = useRef<FitAddon | null>(null)
	const lastDimsRef = useRef<{cols: number; rows: number} | null>(null)
	const isClosedRef = useRef(false)
	const hasReadyArrivedRef = useRef(false)
	const sendRef = useRef<((msg: ClientToServer) => void) | null>(null)
	// G19.5 — set true briefly when the browser native `paste` event fires,
	// so the keydown readText() fallback does not double-paste.
	const nativePasteJustFiredRef = useRef(false)
	// Phase 252 G17 — flips true once the PTY is ready/reattached. Drives the
	// active-terminal-sender registration so the Liv AI CLI-auth bridge only
	// dispatches login commands into a TTY that can actually accept input.
	const [isLive, setIsLive] = useState(false)

	// Phase 246 hot-fix — right-click clipboard menu position (null = closed).
	const [ctxMenu, setCtxMenu] = useState<{x: number; y: number} | null>(null)

	// ── Clipboard helpers (shared by the right-click menu + key handler) ──
	// Copy: write the current xterm selection to the system clipboard.
	// Paste: read the clipboard and feed it through term.paste() which applies
	// bracketed-paste transforms and triggers onData → {type:'data'} → PTY.
	// navigator.clipboard requires a secure context (bruce.livinity.io is
	// https) and a user gesture (menu click / keypress both qualify).
	const doCopy = useCallback(() => {
		const sel = terminalRef.current?.getSelection()
		if (sel) void copyTextRobust(sel)
		setCtxMenu(null)
	}, [])

	const doPaste = useCallback(() => {
		const term = terminalRef.current
		setCtxMenu(null)
		if (!term || isClosedRef.current) return
		void navigator.clipboard
			?.readText()
			.then((text) => {
				if (text) term.paste(text)
			})
			.catch(() => {})
	}, [])

	const doSelectAll = useCallback(() => {
		terminalRef.current?.selectAll()
		setCtxMenu(null)
	}, [])

	const doClear = useCallback(() => {
		terminalRef.current?.clear()
		setCtxMenu(null)
	}, [])

	// One-shot xterm mount, mirroring Phase 243's setup verbatim.
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

		// Phase 246 hot-fix — GPU (WebGL2) renderer for crisp, native-feeling
		// glyphs. xterm's default DOM renderer (one <span> per cell) renders
		// noticeably differently from native terminals and VS Code, which use
		// this same WebGL renderer. MUST run after term.open(). Falls back to
		// the DOM renderer if WebGL2 is unavailable or the GL context is lost.
		try {
			const webgl = new WebglAddon()
			webgl.onContextLoss(() => {
				try {
					webgl.dispose() // xterm auto-reverts to the DOM renderer
				} catch {
					// no-op
				}
			})
			term.loadAddon(webgl)
		} catch {
			// WebGL2 unavailable — DOM renderer stays active (still functional).
		}

		try {
			fit.fit()
		} catch {
			// jsdom / hidden-container paths can throw; ResizeObserver retries.
		}

		terminalRef.current = term
		fitAddonRef.current = fit

		// Phase 246 hot-fix — clipboard key bindings.
		// Ctrl+Shift+C / Ctrl+Shift+V (Linux/Windows convention — plain Ctrl+C
		// must stay SIGINT) plus Cmd+C / Cmd+V on macOS. Returning false stops
		// xterm from forwarding the combo to the PTY.
		term.attachCustomKeyEventHandler((event) => {
			if (event.type !== 'keydown') return true
			const isMac =
				typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
			const isCopyCombo =
				event.code === 'KeyC' && ((event.ctrlKey && event.shiftKey) || (isMac && event.metaKey))
			// G19.4 — operator: only Ctrl+Shift+V pasted; plain Ctrl+V did not.
			// Accept BOTH (Shift optional) on Ctrl, plus Cmd+V on macOS. Plain
			// Ctrl+V in a web terminal has no useful native meaning, so claiming
			// it for paste is safe.
			const isPasteCombo =
				event.code === 'KeyV' && (event.ctrlKey || (isMac && event.metaKey))
			if (isCopyCombo) {
				const sel = term.getSelection()
				if (sel) void copyTextRobust(sel)
				return false
			}
			if (isPasteCombo) {
				// G19.5 — do NOT preventDefault: let the browser fire its native
				// `paste` event, which onPaste (below) handles WITHOUT a clipboard
				// permission (this is the path that actually works). Return false
				// only to stop xterm emitting ^V (\x16) to the PTY. readText() is a
				// best-effort fallback for the rare case the native paste event does
				// not fire; the nativePasteJustFiredRef flag prevents a double paste.
				void navigator.clipboard
					?.readText()
					.then((text) => {
						if (text && !isClosedRef.current && !nativePasteJustFiredRef.current) {
							term.paste(text)
						}
					})
					.catch(() => {})
				return false
			}
			return true
		})

		// Phase 246 hot-fix — right-click opens the clipboard context menu.
		const ctxEl = containerRef.current
		const onContextMenu = (e: MouseEvent) => {
			e.preventDefault()
			setCtxMenu({x: e.clientX, y: e.clientY})
		}
		ctxEl?.addEventListener('contextmenu', onContextMenu)

		// Phase 252 (G19.2) — native paste event = the RELIABLE paste path. The
		// async Clipboard API (navigator.clipboard.readText, which xterm uses) is
		// permission-gated and silently rejects in many Chrome contexts so paste
		// looked broken. The browser own paste DOM event (Ctrl+V and the native
		// right-click Paste) carries the data SYNCHRONOUSLY in e.clipboardData
		// with NO permission prompt. Feed it through term.paste() and
		// stopPropagation so xterm own failing handler cannot double-fire. Plain
		// DOM API so no xterm test mock needed.
		const onPaste = (e: ClipboardEvent) => {
			if (isClosedRef.current) return
			const text = e.clipboardData?.getData('text') ?? ''
			if (!text) return
			e.preventDefault()
			e.stopPropagation()
			// G19.5 — flag so the keydown readText() fallback does not also paste.
			nativePasteJustFiredRef.current = true
			setTimeout(() => {
				nativePasteJustFiredRef.current = false
			}, 150)
			term.paste(text)
		}
		ctxEl?.addEventListener('paste', onPaste, true)

		// Phase 252 (G19.2) — auto-copy on selection (PuTTY / Linux UX): selecting
		// text auto-writes it to the clipboard, so copy needs no keypress and no
		// async-Clipboard-API permission (copyTextRobust falls back to execCommand).
		// onSelectionChange returns an xterm IDisposable torn down on cleanup.
		const selDisposable = term.onSelectionChange(() => {
			const selText = term.getSelection()
			if (selText) void copyTextRobust(selText)
		})

		term.onData((data) => {
			if (isClosedRef.current) return
			sendRef.current?.({type: 'data', data})
		})

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
			ctxEl?.removeEventListener('contextmenu', onContextMenu)
			ctxEl?.removeEventListener('paste', onPaste, true)
			try {
				selDisposable?.dispose()
			} catch {
				// no-op — mock/real both tolerate
			}
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

	const {send} = useTerminalWs({
		mode: initialMode,
		sessionId: initialSessionId ?? undefined,
		onOpen: () => {
			if (initialMode !== 'create') return
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
			// Send init IMMEDIATELY on WS open (243-02 protocol for the
			// CREATE branch — ATTACH branch never sends init).
			sendRef.current?.({type: 'init', cols, rows})
		},
		onMessage: (msg: ServerToClient) => {
			const term = terminalRef.current
			if (!term) return
			switch (msg.type) {
				case 'ready':
					hasReadyArrivedRef.current = true
					setIsLive(true)
					onSessionResolved(tabKey, msg.sessionId)
					try {
						term.writeln(`\x1b[2m[session ${msg.sessionId} ready]\x1b[0m`)
					} catch {
						// no-op
					}
					break
				case 'reattached':
					hasReadyArrivedRef.current = true
					setIsLive(true)
					// Replay scrollback BEFORE live data resumes (246-03 contract).
					try {
						msg.scrollback.forEach((line) => term.write(line))
					} catch {
						// no-op
					}
					// sessionId already in localStorage from mount, but call
					// the resolver so the parent flips status: 'connecting' → 'live'.
					onSessionResolved(tabKey, msg.sessionId)
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
					setIsLive(false)
					onExited(tabKey)
					break
				case 'error':
					try {
						term.writeln(`\r\n[error] ${msg.message}`)
					} catch {
						// no-op
					}
					break
				default:
					break
			}
		},
		onClose: (event) => {
			const term = terminalRef.current
			if (term) {
				try {
					term.writeln('\r\n[disconnected]')
				} catch {
					// no-op
				}
			}
			isClosedRef.current = true
			// Attach branch: if the close arrived before any `ready`/`reattached`
			// AND the server signalled 4404, the session is gone — drop the
			// localStorage entry and flip the tab to expired so the operator
			// sees the failure surface.
			if (
				initialMode === 'attach' &&
				!hasReadyArrivedRef.current &&
				event?.code === 4404
			) {
				onExpired(tabKey)
			}
		},
	})

	// Keep send ref current for xterm.onData / ResizeObserver closures.
	sendRef.current = send

	// Register a close-sender with the parent so onClose can dispatch
	// `{type:'close'}` on this pane's WS.
	useEffect(() => {
		registerCloseSender(tabKey, () => {
			sendRef.current?.({type: 'close'})
		})
		return () => registerCloseSender(tabKey, null)
	}, [tabKey, registerCloseSender])

	// Phase 252 G17 — while THIS pane is the focused, live tab, register it as
	// the active terminal sender so the Liv AI CLI-auth bridge can dispatch a
	// `<cli> auth login` command into it. Only the active+live pane registers,
	// so a queued command always lands in the tab the operator is looking at.
	// Registering flushes any command that was requested before the Terminal
	// window finished opening (the freshly opened tab claims it on `ready`).
	useEffect(() => {
		if (!isActive || !isLive) return
		const sender = (command: string) => {
			if (isClosedRef.current) return
			sendRef.current?.({type: 'data', data: command + '\n'})
		}
		setActiveTerminalSender(sender)
		// Phase 290 R2 — keyed delivery: if a command was queued for THIS specific
		// tab (minted by onCreate via requestTerminalCommandInNewTab), deliver it
		// now and only now. This is what guarantees a launcher/auth command lands
		// in its own brand-new tab and never in a tab already running a CLI.
		registerActiveSenderForTab(tabKey, sender)
		// GC-G — claim xterm DOM focus when this pane becomes the active, live
		// tab so paste (Ctrl+V / native paste event) works immediately without
		// the operator having to click inside the terminal first. Also makes a
		// freshly opened auth/install tab (GC-A) typeable right away.
		// The pane's `hidden` class (isActive ? '' : 'hidden') is dropped on the
		// SAME render that flips isActive→true; focus() on a display:none element
		// is a browser no-op, so defer one frame until the element is visible.
		const raf =
			typeof requestAnimationFrame === 'function'
				? requestAnimationFrame(() => {
						try {
							terminalRef.current?.focus()
						} catch {
							// no-op — jsdom / disposed term
						}
				  })
				: null
		return () => {
			if (raf != null && typeof cancelAnimationFrame === 'function') {
				cancelAnimationFrame(raf)
			}
			setActiveTerminalSender(null)
			// Phase 290 R2 — keyed deregister (no-op delivery for a null sender;
			// the keyed command, if any, was already consumed on register).
			registerActiveSenderForTab(tabKey, null)
		}
	}, [isActive, isLive, tabKey])

	return (
		<>
			<div
				data-test-tab-pane={tabKey}
				className={`absolute inset-0 h-full w-full bg-[#0b0b0c] p-2 ${
					isActive ? '' : 'hidden'
				}`}
				ref={containerRef}
			/>
			{/* Phase 272 — PORTAL the clipboard menu to document.body. The terminal
			    renders inside a LivOS desktop window whose container carries a CSS
			    `transform` (window drag/position), which makes `position:fixed`
			    resolve relative to that window instead of the viewport — so the
			    viewport-based clientX/Y + innerWidth clamp landed the menu off the
			    window ("right-click shows nothing unless I enlarge the window").
			    Portaling out of the transformed subtree restores true viewport-fixed
			    positioning, so the existing coords/clamp are now correct. */}
			{ctxMenu && isActive && createPortal(
				<>
					{/* Click-away backdrop — also swallows the next right-click. */}
					<div
						className='fixed inset-0 z-40'
						onClick={() => setCtxMenu(null)}
						onContextMenu={(e) => {
							e.preventDefault()
							setCtxMenu(null)
						}}
					/>
					<div
						data-test-terminal-ctxmenu
						className='fixed z-50 min-w-[150px] overflow-hidden rounded-md border border-white/10 bg-[#161617] py-1 text-sm text-[#e7e7e8] shadow-xl'
						style={{
							left: Math.min(ctxMenu.x, (typeof window !== 'undefined' ? window.innerWidth : 9999) - 160),
							top: Math.min(ctxMenu.y, (typeof window !== 'undefined' ? window.innerHeight : 9999) - 140),
						}}
					>
						<button
							type='button'
							className='flex w-full items-center justify-between gap-6 px-3 py-1.5 text-left hover:bg-white/10'
							onClick={doCopy}
						>
							<span>Copy</span>
							<span className='text-xs text-white/40'>Ctrl+Shift+C</span>
						</button>
						<button
							type='button'
							className='flex w-full items-center justify-between gap-6 px-3 py-1.5 text-left hover:bg-white/10'
							onClick={doPaste}
						>
							<span>Paste</span>
							<span className='text-xs text-white/40'>Ctrl+Shift+V</span>
						</button>
						<button
							type='button'
							className='block w-full px-3 py-1.5 text-left hover:bg-white/10'
							onClick={doSelectAll}
						>
							Select All
						</button>
						<button
							type='button'
							className='block w-full px-3 py-1.5 text-left hover:bg-white/10'
							onClick={doClear}
						>
							Clear
						</button>
					</div>
				</>,
				document.body,
			)}
		</>
	)
}
