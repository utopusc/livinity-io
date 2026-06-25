// Phase 95-04 — useWebAppVnc: thin wrapper around @novnc/novnc's RFB class.
//
// Lifecycle: on mount (or wsUrl change) construct an RFB instance pointed at
// `wsUrl`, attach a small ResizeObserver so canvas reflows on parent resize,
// listen for the standard noVNC events (connect / disconnect / securityfailure),
// and clean up on unmount.
//
// D-95-02 — autoresize via `scaleViewport = true` only. We deliberately do
// NOT set `resizeSession`, because that would tell x11vnc to resize the host
// X window which P96/P97 will rely on for stable screenshots.
//
// D-95-13 — VNC input is always live when the canvas is focused. The mode
// selector (Watch/Teach/Auto/Chat) is recording-scope, not input-scope.
//
// Phase 303 — clipboard bridge (both directions), wired here so EVERY stream
// surface (webapp, native app, X11 display, master-chrome-login — all
// viewOnly:false consumers) gets copy/paste for free with no per-component
// wiring:
//   • Copy (guest→host): noVNC fires a 'clipboard' event (detail.text) when
//     the streamed app copies; we mirror it into the LOCAL browser clipboard.
//     noVNC suppresses this in viewOnly mode, so it self-gates.
//   • Paste (host→guest): Ctrl/Cmd+V is intercepted in the CAPTURE phase on
//     the container (noVNC's own keydown handler is a bubble-phase listener on
//     the child <canvas>, so capture-on-parent runs first). We read the host
//     clipboard (gesture-gated by the keydown), push it into the guest X
//     CLIPBOARD selection via rfb.clipboardPasteFrom, then re-synthesize the
//     paste keystroke so the focused guest app pastes the fresh buffer.
//   Requires a secure context (HTTPS — the box) + clipboard permission;
//   every failure path is swallowed so a denied clipboard never breaks input.

import {useCallback, useEffect, useRef, useState} from 'react'

// noVNC ships browser-friendly ESM at `@novnc/novnc/lib/rfb`. Types are not
// bundled — we declare a local interface stub matching the API surface we
// touch (see node_modules/@novnc/novnc/docs/API.md for the full surface).

/** Subset of noVNC RFB events we listen to. */
type RfbEventName = 'connect' | 'disconnect' | 'securityfailure' | 'clipboard' | 'credentialsrequired'

interface RfbEventListener {
	(event: Event): void
}

interface RfbInstance {
	scaleViewport: boolean
	clipViewport: boolean
	resizeSession: boolean
	/** When true, RFB does not forward mouse/keyboard input to x11vnc.
	 *  WebApp + native streams pass viewOnly:false so RFB forwards real
	 *  pointer/keyboard/scroll events straight to x11vnc (XTest into the
	 *  stream's own Xvfb display). Phase 270-RFB retired the old WebApp
	 *  viewOnly:true + tRPC `webapp.input.*` xdotool-forwarding path. */
	viewOnly: boolean
	disconnect: () => void
	sendKey: (keysym: number, code: string, down?: boolean) => void
	/** Phase 303 — host→guest clipboard paste. noVNC sends the text to x11vnc,
	 *  which takes ownership of the guest X CLIPBOARD selection. No-ops when the
	 *  RFB is not connected or is viewOnly (see node_modules/@novnc/.../rfb.js
	 *  clipboardPasteFrom — early-returns on `!connected || _viewOnly`). */
	clipboardPasteFrom: (text: string) => void
	addEventListener: (name: RfbEventName, listener: RfbEventListener) => void
	removeEventListener: (name: RfbEventName, listener: RfbEventListener) => void
}

interface RfbConstructor {
	new (
		target: HTMLElement,
		url: string,
		options?: {
			credentials?: {username?: string; password?: string; target?: string}
			shared?: boolean
		},
	): RfbInstance
}

export type WebAppVncStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'

export interface UseWebAppVncOptions {
	credentials?: {password?: string}
	viewOnly?: boolean
}

export interface UseWebAppVncResult {
	containerRef: React.RefObject<HTMLDivElement>
	status: WebAppVncStatus
	errorMessage: string | null
	reconnect: () => void
	sendKey: (keysym: number, code: string, down?: boolean) => void
	requestFullscreen: () => Promise<void>
	/** Phase 303 — push host text into the guest clipboard (host→guest). The
	 *  Ctrl/Cmd+V keydown bridge calls this; also exposed for a future explicit
	 *  "paste" UI affordance + unit tests. No-op when not connected/viewOnly. */
	pasteToGuest: (text: string) => void
}

const BACKOFF_LADDER_MS = [1000, 2000, 4000, 8000]

// Phase 303 — clipboard paste bridge constants.
// X11 keysymdef values for the synthetic guest-side paste keystroke.
const KEYSYM_CONTROL_L = 0xffe3 // XK_Control_L
const KEYSYM_V = 0x0076 // XK_v (lowercase)
// After pushing the host text into the guest CLIPBOARD selection
// (clipboardPasteFrom → RFB ClientCutText), give x11vnc a beat to take
// selection ownership before the synthetic Ctrl+V makes the guest app request
// it — otherwise a fast paste can race the selection update and insert the
// PREVIOUS clipboard contents. 50ms is imperceptible and covers both the
// basic (immediate ClientCutText) and extended (notify round-trip) RFB
// clipboard paths.
const CLIPBOARD_PASTE_SETTLE_MS = 50

/**
 * Lazily import the noVNC RFB constructor. Kept as a function so unit tests
 * can `vi.mock('@novnc/novnc/lib/rfb')` and override before mount.
 */
async function loadRfbCtor(): Promise<RfbConstructor> {
	// @ts-expect-error — no bundled types
	const mod = await import('@novnc/novnc/lib/rfb')
	const ctor = (mod && (mod.default ?? mod)) as RfbConstructor
	return ctor
}

export function useWebAppVnc(wsUrl: string | undefined, options?: UseWebAppVncOptions): UseWebAppVncResult {
	const containerRef = useRef<HTMLDivElement>(null)
	const rfbRef = useRef<RfbInstance | null>(null)
	const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const backoffStepRef = useRef(0)
	const reconnectGenerationRef = useRef(0)
	const resizeObserverRef = useRef<ResizeObserver | null>(null)

	const [status, setStatus] = useState<WebAppVncStatus>('idle')
	const [errorMessage, setErrorMessage] = useState<string | null>(null)

	// Stash latest values in refs so reconnect doesn't capture stale closures.
	const wsUrlRef = useRef(wsUrl)
	const optionsRef = useRef(options)
	useEffect(() => {
		wsUrlRef.current = wsUrl
		optionsRef.current = options
	}, [wsUrl, options])

	const teardownRfb = useCallback(() => {
		const inst = rfbRef.current
		rfbRef.current = null
		if (inst) {
			try {
				inst.disconnect()
			} catch {
				/* noop */
			}
		}
	}, [])

	const connect = useCallback(async () => {
		if (!wsUrlRef.current || !containerRef.current) return
		const generation = ++reconnectGenerationRef.current
		setStatus('connecting')
		setErrorMessage(null)

		let RfbCtor: RfbConstructor
		try {
			RfbCtor = await loadRfbCtor()
		} catch (err) {
			if (generation !== reconnectGenerationRef.current) return
			setStatus('error')
			setErrorMessage(err instanceof Error ? err.message : 'Failed to load noVNC client')
			return
		}
		// Bail if the consumer unmounted or kicked a new generation while
		// the dynamic import was in flight.
		if (generation !== reconnectGenerationRef.current) return
		if (!containerRef.current || !wsUrlRef.current) return

		teardownRfb()

		const credentials = optionsRef.current?.credentials?.password
			? {password: optionsRef.current.credentials.password}
			: undefined

		let rfb: RfbInstance
		try {
			rfb = new RfbCtor(containerRef.current, wsUrlRef.current, credentials ? {credentials} : undefined)
		} catch (err) {
			setStatus('error')
			setErrorMessage(err instanceof Error ? err.message : 'Failed to construct RFB')
			return
		}
		// D-95-02: scaleViewport ON, resizeSession OFF (so x11vnc geometry stays
		// stable for P96/P97 screenshot replay).
		rfb.scaleViewport = true
		rfb.clipViewport = false
		// resizeSession deliberately left at the noVNC default (false).

		// Input forwarding through RFB is OFF only when the consumer explicitly
		// asks for viewOnly:true. WebApp + native streams pass viewOnly:false,
		// so noVNC forwards real pointer/keyboard/scroll events to x11vnc,
		// which XTest-dispatches them into the stream's own Xvfb display
		// (Phase 270-RFB — replaces the old WebApp xdotool-forwarding path).
		rfb.viewOnly = optionsRef.current?.viewOnly !== false

		rfbRef.current = rfb

		const onConnect: RfbEventListener = () => {
			if (generation !== reconnectGenerationRef.current) return
			backoffStepRef.current = 0
			setStatus('connected')
			setErrorMessage(null)
		}
		const onDisconnect: RfbEventListener = (event) => {
			if (generation !== reconnectGenerationRef.current) return
			setStatus('disconnected')
			// Schedule reconnect with backoff. The custom event detail tells
			// us whether the close was clean (server-initiated) or not.
			const detail = (event as CustomEvent).detail as {clean?: boolean} | undefined
			if (detail && detail.clean === true) {
				// clean disconnect — don't auto-reconnect.
				return
			}
			scheduleReconnect()
		}
		const onSecurityFailure: RfbEventListener = (event) => {
			if (generation !== reconnectGenerationRef.current) return
			const detail = (event as CustomEvent).detail as {reason?: string} | undefined
			setStatus('error')
			setErrorMessage(detail?.reason || 'VNC security failure')
		}
		// Phase 303 — guest→host copy. When the streamed app copies, x11vnc
		// sends an RFB ServerCutText and noVNC dispatches a 'clipboard' event
		// carrying the copied string in `detail.text` (verified against @novnc
		// rfb.js — NOT the event field the original plan assumed). Mirror it
		// into the LOCAL browser clipboard so the
		// user can paste outside the stream. noVNC suppresses this event in
		// viewOnly mode, so no extra gating is needed. writeText needs a secure
		// context + clipboard-write permission; failures are swallowed (a
		// denied clipboard must never disrupt the stream).
		const onClipboard: RfbEventListener = (event) => {
			const text = (event as CustomEvent<{text?: string}>).detail?.text
			if (typeof text !== 'string' || text.length === 0) return
			// Only mirror into the host clipboard while the LivOS tab is focused.
			// This stops a backgrounded (or untrusted/scripted) guest from
			// silently overwriting the user's OS clipboard, and browsers reject
			// writeText from an unfocused document anyway. No rate-limit: clipboard
			// sync is last-write-wins, and dropping a rapid second copy would make
			// the user paste the WRONG (earlier) value.
			if (typeof document !== 'undefined' && !document.hasFocus()) return
			try {
				void navigator.clipboard?.writeText(text).catch(() => {})
			} catch {
				/* clipboard API unavailable (insecure context) */
			}
		}

		rfb.addEventListener('connect', onConnect)
		rfb.addEventListener('disconnect', onDisconnect)
		rfb.addEventListener('securityfailure', onSecurityFailure)
		rfb.addEventListener('clipboard', onClipboard)
	}, [teardownRfb])

	const scheduleReconnect = useCallback(() => {
		if (reconnectTimerRef.current) {
			clearTimeout(reconnectTimerRef.current)
			reconnectTimerRef.current = null
		}
		const step = Math.min(backoffStepRef.current, BACKOFF_LADDER_MS.length - 1)
		const delay = BACKOFF_LADDER_MS[step]
		backoffStepRef.current = Math.min(backoffStepRef.current + 1, BACKOFF_LADDER_MS.length - 1)
		reconnectTimerRef.current = setTimeout(() => {
			reconnectTimerRef.current = null
			void connect()
		}, delay)
	}, [connect])

	const reconnect = useCallback(() => {
		if (reconnectTimerRef.current) {
			clearTimeout(reconnectTimerRef.current)
			reconnectTimerRef.current = null
		}
		backoffStepRef.current = 0
		void connect()
	}, [connect])

	const sendKey = useCallback((keysym: number, code: string, down?: boolean) => {
		const inst = rfbRef.current
		if (!inst) return
		try {
			inst.sendKey(keysym, code, down)
		} catch {
			/* swallow — sendKey before connect can throw */
		}
	}, [])

	// Phase 303 — push host text into the guest CLIPBOARD selection.
	const pasteToGuest = useCallback((text: string) => {
		const inst = rfbRef.current
		if (!inst || typeof text !== 'string') return
		try {
			inst.clipboardPasteFrom(text)
		} catch {
			/* swallow — no-op if not connected / viewOnly */
		}
	}, [])

	const requestFullscreen = useCallback(async () => {
		const el = containerRef.current
		if (!el) return
		// Try standards-track first; Safari only exposes the prefixed variant.
		// Both branches return Promises in modern browsers.
		const anyEl = el as HTMLDivElement & {
			webkitRequestFullscreen?: () => Promise<void> | undefined
		}
		if (typeof el.requestFullscreen === 'function') {
			await el.requestFullscreen()
		} else if (typeof anyEl.webkitRequestFullscreen === 'function') {
			await anyEl.webkitRequestFullscreen()
		}
	}, [])

	// Connect (or no-op) on mount + wsUrl change.
	useEffect(() => {
		if (!wsUrl) {
			setStatus('idle')
			return
		}
		void connect()
		return () => {
			reconnectGenerationRef.current++ // invalidate any in-flight async
			if (reconnectTimerRef.current) {
				clearTimeout(reconnectTimerRef.current)
				reconnectTimerRef.current = null
			}
			teardownRfb()
		}
	}, [wsUrl, connect, teardownRfb])

	// ResizeObserver — the canvas listens to its parent style; nudging the
	// width on each parent resize triggers a noVNC scaleViewport reflow.
	// Idempotent: a single style write per RO callback, not a thrash loop.
	useEffect(() => {
		const el = containerRef.current
		if (!el || typeof ResizeObserver === 'undefined') return
		const ro = new ResizeObserver(() => {
			// Toggle a CSS var to nudge the canvas; noVNC's internal observer
			// then refits. Reading clientWidth keeps the write side-effect-free.
			el.style.setProperty('--liv-vnc-w', `${el.clientWidth}px`)
		})
		ro.observe(el)
		resizeObserverRef.current = ro
		return () => {
			ro.disconnect()
			resizeObserverRef.current = null
		}
	}, [])

	// Phase 303 — host→guest paste bridge (Ctrl/Cmd+V). noVNC forwards a raw
	// paste keystroke to the guest IMMEDIATELY (its keydown handler is a
	// bubble-phase listener on the child <canvas>), which would paste the
	// guest's STALE clipboard before we push the host text. So we intercept in
	// the CAPTURE phase on the container — capture-on-parent runs before the
	// canvas's bubble listener — and stopPropagation so noVNC never sees the
	// key. We then read the host clipboard (allowed: the keydown is a user
	// gesture), push it into the guest selection, and re-synthesize the paste
	// keystroke so the focused guest app pastes the fresh buffer. viewOnly
	// streams are read-only, so they opt out (paste would no-op anyway). If the
	// host clipboard can't be read at all, we DON'T intercept — noVNC forwards
	// the raw Ctrl+V so the guest still pastes its own buffer (graceful
	// degradation rather than a dead paste key).
	useEffect(() => {
		const el = containerRef.current
		if (!el) return
		// Effect-scoped guards so an in-flight async paste is abandoned cleanly
		// if the component unmounts mid-flight (no zombie keystroke / dangling
		// timer after teardown).
		let cancelled = false
		let settleTimer: ReturnType<typeof setTimeout> | null = null

		const onKeyDownCapture = (e: KeyboardEvent) => {
			const isPaste = (e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'v' || e.key === 'V')
			if (!isPaste) return
			// Gate live (not once-at-mount): only INTERACTIVE streams bridge
			// paste. `!== false` matches how rfb.viewOnly is derived above, so
			// an unspecified/true viewOnly leaves the keystroke to noVNC.
			if (optionsRef.current?.viewOnly !== false) return
			// If we CAN'T read the host clipboard (insecure context / unsupported
			// / SSR), do NOT swallow the key — return BEFORE preventDefault so
			// noVNC forwards the raw Ctrl+V and the guest at least pastes its own
			// buffer. (Ordering matters: blocking first would kill paste outright.)
			if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) return
			// We will bridge the paste — take over the keystroke so noVNC doesn't
			// also forward it (which would paste the guest's STALE buffer first).
			e.preventDefault()
			e.stopPropagation()
			// One paste per physical press — ignore OS key-repeat while held.
			if (e.repeat) return

			navigator.clipboard
				.readText()
				.then((text) => {
					if (cancelled || !text) return
					pasteToGuest(text)
					// Let x11vnc take CLIPBOARD ownership before the app requests it.
					settleTimer = setTimeout(() => {
						settleTimer = null
						if (cancelled) return
						// Self-contained Ctrl+V, independent of which host modifier
						// was held or whether it was released during the async read
						// (Cmd+V on macOS maps to a guest Ctrl+V too). On Linux/
						// Windows the guest may briefly see Ctrl released while it's
						// still physically held; that self-heals on the next event.
						sendKey(KEYSYM_CONTROL_L, 'ControlLeft', true)
						sendKey(KEYSYM_V, 'KeyV', true)
						sendKey(KEYSYM_V, 'KeyV', false)
						sendKey(KEYSYM_CONTROL_L, 'ControlLeft', false)
					}, CLIPBOARD_PASTE_SETTLE_MS)
				})
				.catch(() => {
					/* permission denied / insecure context — silently no-op */
				})
		}

		el.addEventListener('keydown', onKeyDownCapture, true) // capture phase
		return () => {
			cancelled = true
			if (settleTimer) clearTimeout(settleTimer)
			el.removeEventListener('keydown', onKeyDownCapture, true)
		}
	}, [pasteToGuest, sendKey])

	return {
		containerRef,
		status,
		errorMessage,
		reconnect,
		sendKey,
		requestFullscreen,
		pasteToGuest,
	}
}
