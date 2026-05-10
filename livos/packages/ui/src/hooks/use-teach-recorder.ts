// Phase 96-03 — useTeachRecorder: arms / disarms Teach-mode recording.
//
// Lifecycle:
//   start({webappId, vncRef})
//     1. Mints sessionId = crypto.randomUUID()
//     2. Records startedAt = Date.now()
//     3. Attaches DOM event listeners (mousedown / keydown / wheel / scroll)
//        on the supplied vncRef (the noVNC container element from
//        useWebAppVnc — DOM events bubble from the inner canvas).
//     4. Starts a 1Hz heartbeat that emits {type:'wait', durationMs:1000}.
//     5. Starts a 10-minute auto-stop safety timer.
//   For each input event:
//     - Snapshot the current VNC canvas via `canvas.toDataURL('image/png')`.
//     - POST to webapps.skills.uploadFrame, await screenshotRef.
//     - Push the canonical ActionEvent to the in-memory log.
//   stop():
//     - Clears intervals, detaches listeners, computes endedAt, returns
//       the assembled actionLog: { version: 1, webappId, startedAt,
//       endedAt, events, meta: { droppedCount, sessionId } }.
//   On unmount or webappId change while recording → call discard.
//
// Strict canonicalization (96-CONTEXT §gray-area #3):
//   VNC events not mapping to the modelled discriminated union are
//   dropped, droppedCount++, with a console.warn in dev mode only.
//
// Tests: source-text invariants in use-teach-recorder.unit.test.tsx
// (matching the use-webapp-vnc.unit.test.tsx precedent — no RTL in this
// package, D-NO-NEW-DEPS).

import {useCallback, useEffect, useRef, useState} from 'react'

import {trpcClient} from '@/trpc/trpc'

// ───────── Canonical action-log types (mirror skills-router zod schema). ─────

export type ActionEventClick = {
	type: 'click'
	button: 'left' | 'middle' | 'right'
	coords: {x: number; y: number}
	ts: number
	screenshotRef: string
	/** Phase 100-09-06: optional inline thumbnail base64 (256x256). */
	screenshot_b64?: string
	/** Phase 100-09-06: viewport at capture time (handles window resize). */
	viewport?: {w: number; h: number}
}

export type ActionEventKey = {
	type: 'key'
	key: string
	modifiers: string[]
	ts: number
	screenshotRef: string
	/** Phase 100-09-06: optional inline thumbnail base64 (256x256). */
	screenshot_b64?: string
	/** Phase 100-09-06: viewport at capture time (handles window resize). */
	viewport?: {w: number; h: number}
}

export type ActionEventWheel = {
	type: 'wheel'
	dx: number
	dy: number
	ts: number
	screenshotRef: string
	/** Phase 100-09-06: optional inline thumbnail base64 (256x256). */
	screenshot_b64?: string
	/** Phase 100-09-06: viewport at capture time (handles window resize). */
	viewport?: {w: number; h: number}
}

export type ActionEventScroll = {
	type: 'scroll'
	coords: {x: number; y: number}
	dx: number
	dy: number
	ts: number
	screenshotRef: string
	/** Phase 100-09-06: optional inline thumbnail base64 (256x256). */
	screenshot_b64?: string
	/** Phase 100-09-06: viewport at capture time (handles window resize). */
	viewport?: {w: number; h: number}
}

export type ActionEventWait = {
	type: 'wait'
	durationMs: number
	ts: number
	screenshotRef: string
	/** Phase 100-09-06: optional inline thumbnail base64 (256x256). */
	screenshot_b64?: string
	/** Phase 100-09-06: viewport at capture time (handles window resize). */
	viewport?: {w: number; h: number}
}

export type ActionEvent =
	| ActionEventClick
	| ActionEventKey
	| ActionEventWheel
	| ActionEventScroll
	| ActionEventWait

// Phase 100-09-06 — version 2 schema is emitted on all NEW recordings.
// v1 logs remain valid in storage; the daemon-side discriminated union
// (skills-router.ts) accepts BOTH literals so existing webapp_skills rows
// from the P96 era continue to load + replay. The lazy-upgrade pattern
// avoids any DB migration (action_log is JSONB; additive fields).
export type ActionLog = {
	version: 1 | 2
	webappId: string
	startedAt: number
	endedAt: number
	events: ActionEvent[]
	meta: {
		droppedCount: number
		sessionId: string
	}
	/** Phase 100-09-06: optional session-level metadata (v2 only — populated on stop()). */
	metadata?: {
		browser_url?: string
		page_title?: string
		recorded_by_user_id?: string
	}
}

// ───────── Hook surface. ─────────

export type TeachRecorderState = 'idle' | 'recording' | 'saving'

export interface UseTeachRecorderResult {
	state: TeachRecorderState
	recording: boolean
	sessionId: string | null
	eventCount: number
	droppedCount: number
	autoStopped: boolean
	/** Phase 100-09-06: read-only view of captured events for popup-per-event UI. */
	events: readonly ActionEvent[]
	start: (input: StartInput) => void
	stop: () => Promise<ActionLog | null>
	resetAutoStop: () => void
}

export interface StartInput {
	webappId: string
	vncRef: React.RefObject<HTMLElement | null>
}

// 1Hz heartbeat — see 96-CONTEXT §gray-area #1.
const HEARTBEAT_MS = 1_000
// 10-minute defensive auto-stop — see 96-CONTEXT §In-scope.
const AUTO_STOP_MS = 10 * 60 * 1_000

function buttonName(btn: number): 'left' | 'middle' | 'right' | null {
	if (btn === 0) return 'left'
	if (btn === 1) return 'middle'
	if (btn === 2) return 'right'
	return null
}

function keyboardModifiers(ev: KeyboardEvent): string[] {
	const m: string[] = []
	if (ev.ctrlKey) m.push('ctrl')
	if (ev.shiftKey) m.push('shift')
	if (ev.altKey) m.push('alt')
	if (ev.metaKey) m.push('meta')
	return m
}

function findCanvas(host: HTMLElement | null): HTMLCanvasElement | null {
	if (!host) return null
	if (host instanceof HTMLCanvasElement) return host
	return host.querySelector('canvas')
}

function pngFromCanvas(canvas: HTMLCanvasElement): {data: string; mime: 'image/png'} | null {
	try {
		const url = canvas.toDataURL('image/png')
		// Strip the `data:image/png;base64,` prefix.
		const idx = url.indexOf(',')
		if (idx < 0) return null
		return {data: url.slice(idx + 1), mime: 'image/png'}
	} catch {
		return null
	}
}

/**
 * useTeachRecorder — hooks into VNC DOM events, captures screenshots,
 * uploads them via tRPC, and emits a canonical action log on Stop.
 *
 * Pure local state — no shared globals — so multiple WebApp windows can
 * each instantiate independent recorders (96-CONTEXT §gray-area #7).
 */
export function useTeachRecorder(): UseTeachRecorderResult {
	const [state, setState] = useState<TeachRecorderState>('idle')
	const [eventCount, setEventCount] = useState(0)
	const [droppedCount, setDroppedCount] = useState(0)
	const [sessionId, setSessionId] = useState<string | null>(null)
	const [autoStopped, setAutoStopped] = useState(false)
	// Phase 100-09-06 — expose events array to consumers (WebAppTeachPopupHost
	// subscribes to this slice for per-event toast emission). The internal
	// eventsRef remains the canonical fast-push target for async capture
	// callbacks; events state is mirrored on each push.
	const [events, setEvents] = useState<ActionEvent[]>([])

	// Live state lives in refs so async event handlers always see fresh values.
	const stateRef = useRef<TeachRecorderState>('idle')
	const sessionIdRef = useRef<string | null>(null)
	const webappIdRef = useRef<string | null>(null)
	const startedAtRef = useRef<number>(0)
	const eventsRef = useRef<ActionEvent[]>([])
	const droppedRef = useRef<number>(0)
	const vncRefRef = useRef<React.RefObject<HTMLElement | null> | null>(null)
	const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
	const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const detachListenersRef = useRef<(() => void) | null>(null)

	const captureFrame = useCallback(
		async (ts: number): Promise<string | null> => {
			const canvas = findCanvas(vncRefRef.current?.current ?? null)
			const sid = sessionIdRef.current
			if (!canvas || !sid) return null
			const png = pngFromCanvas(canvas)
			if (!png) return null
			try {
				const r = await trpcClient.webapp.skills.uploadFrame.mutate({
					sessionId: sid,
					ts,
					imageDataBase64: png.data,
					mimeType: png.mime,
				})
				return r.screenshotRef
			} catch (err) {
				if (
					typeof process !== 'undefined' &&
					process.env?.NODE_ENV !== 'production'
				) {
					// eslint-disable-next-line no-console
					console.warn('[useTeachRecorder] uploadFrame failed', err)
				}
				return null
			}
		},
		[],
	)

	const pushEvent = useCallback((event: ActionEvent) => {
		eventsRef.current.push(event)
		setEventCount(eventsRef.current.length)
		// Phase 100-09-06 — mirror to React state so consumers (popup host)
		// re-render. New array reference on every push so React detects change.
		setEvents(eventsRef.current.slice())
	}, [])

	const bumpDropped = useCallback(() => {
		droppedRef.current += 1
		setDroppedCount(droppedRef.current)
		if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
			// eslint-disable-next-line no-console
			console.warn('[useTeachRecorder] dropped unsupported event')
		}
	}, [])

	// ─── Stop + cleanup ──────────────────────────────────────────────────

	const detachAll = useCallback(() => {
		if (heartbeatRef.current) {
			clearInterval(heartbeatRef.current)
			heartbeatRef.current = null
		}
		if (autoStopRef.current) {
			clearTimeout(autoStopRef.current)
			autoStopRef.current = null
		}
		if (detachListenersRef.current) {
			detachListenersRef.current()
			detachListenersRef.current = null
		}
	}, [])

	const stop = useCallback(async (): Promise<ActionLog | null> => {
		if (stateRef.current !== 'recording') return null
		stateRef.current = 'saving'
		setState('saving')
		detachAll()
		const endedAt = Date.now() - startedAtRef.current
		const sid = sessionIdRef.current
		const wid = webappIdRef.current
		const events = eventsRef.current.slice()
		const dropped = droppedRef.current
		// Reset state.
		stateRef.current = 'idle'
		setState('idle')
		if (!sid || !wid) return null
		// Phase 100-09-06 — emit version 2 logs with optional session-level
		// metadata (browser_url + page_title from the recorder's window/document
		// context; recorded_by_user_id is left undefined here for the daemon
		// to inject server-side from ctx.currentUser.id at create time).
		const log: ActionLog = {
			version: 2,
			webappId: wid,
			startedAt: 0,
			endedAt,
			events,
			meta: {droppedCount: dropped, sessionId: sid},
			metadata: {
				browser_url: typeof window !== 'undefined' ? window.location.href : undefined,
				page_title: typeof document !== 'undefined' ? document.title : undefined,
				recorded_by_user_id: undefined,
			},
		}
		return log
	}, [detachAll])

	const resetAutoStop = useCallback(() => {
		setAutoStopped(false)
	}, [])

	// ─── Start ───────────────────────────────────────────────────────────

	const start = useCallback(
		(input: StartInput) => {
			if (stateRef.current !== 'idle') return

			const sid =
				typeof crypto !== 'undefined' && crypto.randomUUID
					? crypto.randomUUID()
					: // dev-only fallback; production browsers all support randomUUID()
					  `${Date.now()}-${Math.random().toString(16).slice(2)}`
			const startedAt = Date.now()
			eventsRef.current = []
			droppedRef.current = 0
			sessionIdRef.current = sid
			webappIdRef.current = input.webappId
			startedAtRef.current = startedAt
			vncRefRef.current = input.vncRef

			setSessionId(sid)
			setEventCount(0)
			setDroppedCount(0)
			setAutoStopped(false)
			// Phase 100-09-06 — reset events state at start of recording.
			setEvents([])
			stateRef.current = 'recording'
			setState('recording')

			const host = input.vncRef.current
			if (!host) {
				// Without a host element we can still arm timers but we won't
				// capture anything; UI surfaces this via state == 'recording'
				// + zero events.
				return
			}

			// Phase 100-09-06 — viewport snapshotter. Reads the host element's
			// bounding rect at capture time (handles window resize between
			// recording start and event capture). Returns undefined if rect
			// unavailable so the optional schema field stays absent.
			const snapshotViewport = (): {w: number; h: number} | undefined => {
				try {
					const rect = host.getBoundingClientRect()
					if (rect.width === 0 || rect.height === 0) return undefined
					return {w: Math.round(rect.width), h: Math.round(rect.height)}
				} catch {
					return undefined
				}
			}

			// ── DOM event listeners. ──────────────────────────────────────
			// All listeners are passive observers — we never preventDefault so
			// VNC input passes through to noVNC's own handlers (D-95-13).
			const onMouseDown = (ev: MouseEvent) => {
				const button = buttonName(ev.button)
				if (!button) {
					bumpDropped()
					return
				}
				const coords = {x: Math.round(ev.offsetX), y: Math.round(ev.offsetY)}
				const ts = Date.now() - startedAtRef.current
				const viewport = snapshotViewport()
				void captureFrame(ts).then((ref) => {
					pushEvent({
						type: 'click',
						button,
						coords,
						ts,
						screenshotRef: ref ?? '',
						viewport, // Phase 100-09-06
					})
				})
			}
			const onKeyDown = (ev: KeyboardEvent) => {
				if (!ev.key) {
					bumpDropped()
					return
				}
				const ts = Date.now() - startedAtRef.current
				const viewport = snapshotViewport()
				void captureFrame(ts).then((ref) => {
					pushEvent({
						type: 'key',
						key: ev.key,
						modifiers: keyboardModifiers(ev),
						ts,
						screenshotRef: ref ?? '',
						viewport, // Phase 100-09-06
					})
				})
			}
			const onWheel = (ev: WheelEvent) => {
				const ts = Date.now() - startedAtRef.current
				const viewport = snapshotViewport()
				void captureFrame(ts).then((ref) => {
					pushEvent({
						type: 'wheel',
						dx: ev.deltaX,
						dy: ev.deltaY,
						ts,
						screenshotRef: ref ?? '',
						viewport, // Phase 100-09-06
					})
				})
			}
			const onScroll = (ev: Event) => {
				const target = ev.target as HTMLElement | null
				const coords = target
					? {x: target.scrollLeft | 0, y: target.scrollTop | 0}
					: {x: 0, y: 0}
				const ts = Date.now() - startedAtRef.current
				const viewport = snapshotViewport()
				void captureFrame(ts).then((ref) => {
					pushEvent({
						type: 'scroll',
						coords,
						dx: 0,
						dy: 0,
						ts,
						screenshotRef: ref ?? '',
						viewport, // Phase 100-09-06
					})
				})
			}

			host.addEventListener('mousedown', onMouseDown, true)
			// keydown is captured at the window level — the VNC canvas may not
			// have keyboard focus while the user types, but the noVNC client
			// installs a window-level handler anyway.
			window.addEventListener('keydown', onKeyDown, true)
			host.addEventListener('wheel', onWheel, {capture: true, passive: true})
			host.addEventListener('scroll', onScroll, true)

			detachListenersRef.current = () => {
				host.removeEventListener('mousedown', onMouseDown, true)
				window.removeEventListener('keydown', onKeyDown, true)
				host.removeEventListener('wheel', onWheel, true)
				host.removeEventListener('scroll', onScroll, true)
			}

			// ── Heartbeat. ────────────────────────────────────────────────
			heartbeatRef.current = setInterval(() => {
				if (stateRef.current !== 'recording') return
				const ts = Date.now() - startedAtRef.current
				const viewport = snapshotViewport()
				void captureFrame(ts).then((ref) => {
					pushEvent({
						type: 'wait',
						durationMs: HEARTBEAT_MS,
						ts,
						screenshotRef: ref ?? '',
						viewport, // Phase 100-09-06
					})
				})
			}, HEARTBEAT_MS)

			// ── 10-minute auto-stop. ──────────────────────────────────────
			autoStopRef.current = setTimeout(() => {
				if (stateRef.current === 'recording') {
					setAutoStopped(true)
					// Caller observes via `autoStopped` flag and surfaces the
					// non-modal banner from 96-04. The hook itself does not
					// auto-call stop() here — the caller decides how to
					// dispatch (open SaveDialog vs. discard) per UX.
					// However per PLAN we MUST clear listeners/heartbeat at
					// the cap. Move state out of recording without finalising
					// the log so caller can stop() to receive it.
					if (heartbeatRef.current) {
						clearInterval(heartbeatRef.current)
						heartbeatRef.current = null
					}
					// Listener detach happens in stop() which the parent
					// component MUST call once it shows the cap banner.
				}
			}, AUTO_STOP_MS)
		},
		[bumpDropped, captureFrame, pushEvent],
	)

	// Cleanup on unmount or webappId change while recording: detach +
	// fire-and-forget discard so disk frames don't leak.
	useEffect(() => {
		return () => {
			if (stateRef.current === 'recording') {
				const sid = sessionIdRef.current
				detachAll()
				stateRef.current = 'idle'
				if (sid) {
					trpcClient.webapp.skills.discard
						.mutate({sessionId: sid})
						.catch(() => {
							/* best-effort cleanup */
						})
				}
			}
		}
	}, [detachAll])

	return {
		state,
		recording: state === 'recording',
		sessionId,
		eventCount,
		droppedCount,
		autoStopped,
		// Phase 100-09-06 — read-only events view for popup-per-event UI.
		events,
		start,
		stop,
		resetAutoStop,
	}
}
