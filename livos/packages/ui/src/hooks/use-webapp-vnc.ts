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
}

const BACKOFF_LADDER_MS = [1000, 2000, 4000, 8000]

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

		rfb.addEventListener('connect', onConnect)
		rfb.addEventListener('disconnect', onDisconnect)
		rfb.addEventListener('securityfailure', onSecurityFailure)
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

	return {
		containerRef,
		status,
		errorMessage,
		reconnect,
		sendKey,
		requestFullscreen,
	}
}
