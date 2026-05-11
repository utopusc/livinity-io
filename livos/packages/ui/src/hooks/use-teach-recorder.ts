// Phase 101-08 — useTeachRecorder v3 (SelfClaude action-driven pattern).
//
// REPLACES the interval-driven recorder (Phase 96-03 / 100-09-06). The
// per-second wait emission is REMOVED — the recorder is now purely
// DOM-event-driven, matching the SelfClaude pattern verified by
// 101-RESEARCH.md Pattern 3 / lines 457-553 (Apache-2.0 port from
// github.com/utopusc/selfclaude).
//
// New flow:
//   start({webappId, vncRef})
//     1. Mints sessionId = crypto.randomUUID().
//     2. Records startedAt = Date.now().
//     3. Locates the noVNC <canvas> inside vncRef.current.
//     4. Attaches CAPTURE-PHASE listeners:
//          - canvas.addEventListener('mousedown', onMouseDown, true)
//          - window.addEventListener('keydown', onKeyDown, true)
//     5. (No interval, no scroll/wheel — v3 captures only meaningful
//        actions: click + key + note; that's what makes drift recovery
//        possible per CONTEXT D-101-TEACH-V3 step 5-7.)
//   On mousedown:
//     - Read canvas.getBoundingClientRect() → compute scaleX/scaleY.
//     - Transform ev.offsetX/Y → canvas-pixel coords (1280×720 frame space).
//     - Map ev.button: 0 → 1 (left), 2 → 3 (right), other → 2 (middle).
//     - Push {type:'click', button, x, y, ts} to events.
//     - 100ms later: fire onAfterClick({x, y, button}) callback (lets
//       noVNC forward the click to streamed Chrome first).
//     - Optionally upload a screenshot frame for later drift detection.
//   On keydown:
//     - Push {type:'key', key, ts} (no modifiers in v3 schema per
//       RESEARCH.md Pattern 3 line 480-484).
//   pushNote(text):
//     - text.trim().slice(0, 512) → push {type:'note', text, ts}.
//     - Empty/whitespace → no-op.
//   stop():
//     - Detach listeners, return ActionLogV3:
//       {version:3, webappId, startedAt, endedAt, events}.
//
// Backwards-compat: legacy v1/v2 ActionEvent types are retained in the
// exported union so consumers that historically read this module's event
// types continue to typecheck. New recordings emit v3 click + key + note
// shapes only.
//
// Sacred SHA: sdk-agent-runner.ts file unchanged (verified by parent commit).

import {useCallback, useEffect, useRef, useState} from 'react'

import {trpcClient} from '@/trpc/trpc'

// ───────── Legacy v1/v2 action-event types (kept for type-level compat) ────

export type ActionEventClick = {
	type: 'click'
	button: 'left' | 'middle' | 'right'
	coords: {x: number; y: number}
	ts: number
	screenshotRef: string
	screenshot_b64?: string
	viewport?: {w: number; h: number}
}

export type ActionEventKey = {
	type: 'key'
	key: string
	modifiers: string[]
	ts: number
	screenshotRef: string
	screenshot_b64?: string
	viewport?: {w: number; h: number}
}

export type ActionEventWheel = {
	type: 'wheel'
	dx: number
	dy: number
	ts: number
	screenshotRef: string
	screenshot_b64?: string
	viewport?: {w: number; h: number}
}

export type ActionEventScroll = {
	type: 'scroll'
	coords: {x: number; y: number}
	dx: number
	dy: number
	ts: number
	screenshotRef: string
	screenshot_b64?: string
	viewport?: {w: number; h: number}
}

export type ActionEventWait = {
	type: 'wait'
	durationMs: number
	ts: number
	screenshotRef: string
	screenshot_b64?: string
	viewport?: {w: number; h: number}
}

// ───────── Phase 101-08 v3 action-event types (SelfClaude verbatim port) ───

/** v3 click: flattened {x, y} (no coords sub-object) + numeric button 1|2|3. */
export type ClickStep = {
	type: 'click'
	button: 1 | 2 | 3
	x: number
	y: number
	ts: number
}

/** v3 key step (no modifiers field per RESEARCH.md Pattern 3). */
export type KeyStep = {
	type: 'key'
	key: string
	ts: number
}

/** v3 type step — explicit free-form text typing (currently unused at capture
 *  time; reserved for future "type instead of key" UI flow). */
export type TypeStep = {
	type: 'type'
	text: string
	ts: number
}

/** v3 note step — user-supplied instruction text committed via pushNote(). */
export type NoteStep = {
	type: 'note'
	text: string
	ts: number
}

export type ActionStep = ClickStep | TypeStep | KeyStep | NoteStep

/**
 * v3 schema (Phase 101-08): {version:3, webappId, name?, startedAt, endedAt,
 * events}. No `meta`, no `metadata`, no embedded screenshot fields (per
 * Q4-RESOLVED in 101-CONTEXT — replay just dispatches actions; the
 * instruction text on `note` steps is what enables drift recovery).
 */
export type ActionLogV3 = {
	version: 3
	webappId: string
	name?: string
	startedAt: number
	endedAt: number
	events: ActionStep[]
}

// Legacy union for type-level backwards-compat with any consumer that imported
// these names. New writes emit v3 steps; storage continues to accept v1/v2
// shapes via skills-router discriminated union.
export type ActionEvent =
	| ActionEventClick
	| ActionEventKey
	| ActionEventWheel
	| ActionEventScroll
	| ActionEventWait
	| ClickStep
	| KeyStep
	| TypeStep
	| NoteStep

export type ActionLog = ActionLogV3 | LegacyActionLog

type LegacyActionLog = {
	version: 1 | 2
	webappId: string
	startedAt: number
	endedAt: number
	events: ActionEvent[]
	meta?: {droppedCount?: number; sessionId?: string}
	metadata?: {
		browser_url?: string
		page_title?: string
		recorded_by_user_id?: string
	}
}

// ───────── Hook surface ────────────────────────────────────────────────────

export type TeachRecorderState = 'idle' | 'recording' | 'saving'

export interface UseTeachRecorderResult {
	state: TeachRecorderState
	recording: boolean
	sessionId: string | null
	eventCount: number
	droppedCount: number
	autoStopped: boolean
	/** Read-only view of captured steps for the popup host. */
	events: readonly ActionStep[]
	start: (input: StartInput) => void
	stop: () => Promise<ActionLogV3 | null>
	resetAutoStop: () => void
	/** Phase 101-08 — pushNote(text) appends a v3 NoteStep with trim+512 cap. */
	pushNote: (text: string) => void
	/** Phase 101-08 — register a callback invoked 100ms after every click. */
	setOnAfterClick: (cb: ((c: {x: number; y: number; button: 1 | 2 | 3}) => void) | null) => void
}

export interface StartInput {
	webappId: string
	vncRef: React.RefObject<HTMLElement | null>
	/** Optional one-shot onAfterClick — same as calling setOnAfterClick post-start. */
	onAfterClick?: (c: {x: number; y: number; button: 1 | 2 | 3}) => void
}

// 10-minute defensive auto-stop — see 96-CONTEXT §In-scope.
const AUTO_STOP_MS = 10 * 60 * 1_000

// Maximum note length per v3 schema (RESEARCH.md Pattern 3 line 543).
const NOTE_MAX = 512

function findCanvas(host: HTMLElement | null): HTMLCanvasElement | null {
	if (!host) return null
	if (host instanceof HTMLCanvasElement) return host
	return host.querySelector('canvas')
}

function pngFromCanvas(canvas: HTMLCanvasElement): {data: string; mime: 'image/png'} | null {
	try {
		const url = canvas.toDataURL('image/png')
		const idx = url.indexOf(',')
		if (idx < 0) return null
		return {data: url.slice(idx + 1), mime: 'image/png'}
	} catch {
		return null
	}
}

/**
 * Phase 101-08 useTeachRecorder — DOM-event-driven recorder with onAfterClick
 * popover hook + pushNote. Returns v3 ActionLog on stop().
 *
 * Pure local state — multiple WebApp windows can each instantiate independent
 * recorders (96-CONTEXT §gray-area #7).
 */
export function useTeachRecorder(): UseTeachRecorderResult {
	const [state, setState] = useState<TeachRecorderState>('idle')
	const [eventCount, setEventCount] = useState(0)
	const [droppedCount, setDroppedCount] = useState(0)
	const [sessionId, setSessionId] = useState<string | null>(null)
	const [autoStopped, setAutoStopped] = useState(false)
	const [events, setEvents] = useState<ActionStep[]>([])

	const stateRef = useRef<TeachRecorderState>('idle')
	const sessionIdRef = useRef<string | null>(null)
	const webappIdRef = useRef<string | null>(null)
	const startedAtRef = useRef<number>(0)
	const eventsRef = useRef<ActionStep[]>([])
	const droppedRef = useRef<number>(0)
	const vncRefRef = useRef<React.RefObject<HTMLElement | null> | null>(null)
	const canvasRef = useRef<HTMLCanvasElement | null>(null)
	const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const detachListenersRef = useRef<(() => void) | null>(null)
	const onAfterClickRef = useRef<
		((c: {x: number; y: number; button: 1 | 2 | 3}) => void) | null
	>(null)

	const captureFrame = useCallback(async (ts: number): Promise<string | null> => {
		const canvas = canvasRef.current ?? findCanvas(vncRefRef.current?.current ?? null)
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
			if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
				// eslint-disable-next-line no-console
				console.warn('[useTeachRecorder] uploadFrame failed', err)
			}
			return null
		}
	}, [])

	const pushStep = useCallback((step: ActionStep) => {
		eventsRef.current.push(step)
		setEventCount(eventsRef.current.length)
		// Mirror to React state so consumers (popup host) re-render. New array
		// reference on every push so React detects change.
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
		if (autoStopRef.current) {
			clearTimeout(autoStopRef.current)
			autoStopRef.current = null
		}
		if (detachListenersRef.current) {
			detachListenersRef.current()
			detachListenersRef.current = null
		}
	}, [])

	const stop = useCallback(async (): Promise<ActionLogV3 | null> => {
		if (stateRef.current !== 'recording') return null
		stateRef.current = 'saving'
		setState('saving')
		detachAll()
		const endedAt = Date.now()
		const startedAt = startedAtRef.current
		const sid = sessionIdRef.current
		const wid = webappIdRef.current
		const stepsArr = eventsRef.current.slice()
		stateRef.current = 'idle'
		setState('idle')
		if (!sid || !wid) return null
		const log: ActionLogV3 = {
			version: 3,
			webappId: wid,
			startedAt: startedAt,
			endedAt,
			events: stepsArr,
		}
		return log
	}, [detachAll])

	const resetAutoStop = useCallback(() => {
		setAutoStopped(false)
	}, [])

	// ─── pushNote ────────────────────────────────────────────────────────

	const pushNote = useCallback(
		(text: string) => {
			if (stateRef.current !== 'recording') return
			if (typeof text !== 'string') return
			const trimmed = text.trim().slice(0, NOTE_MAX)
			if (!trimmed) return
			pushStep({type: 'note', text: trimmed, ts: Date.now()})
		},
		[pushStep],
	)

	const setOnAfterClick = useCallback(
		(cb: ((c: {x: number; y: number; button: 1 | 2 | 3}) => void) | null) => {
			onAfterClickRef.current = cb
		},
		[],
	)

	// ─── Start ───────────────────────────────────────────────────────────

	const start = useCallback(
		(input: StartInput) => {
			if (stateRef.current !== 'idle') return

			const sid =
				typeof crypto !== 'undefined' && crypto.randomUUID
					? crypto.randomUUID()
					: `${Date.now()}-${Math.random().toString(16).slice(2)}`
			const startedAt = Date.now()
			eventsRef.current = []
			droppedRef.current = 0
			sessionIdRef.current = sid
			webappIdRef.current = input.webappId
			startedAtRef.current = startedAt
			vncRefRef.current = input.vncRef

			if (input.onAfterClick) {
				onAfterClickRef.current = input.onAfterClick
			}

			setSessionId(sid)
			setEventCount(0)
			setDroppedCount(0)
			setAutoStopped(false)
			setEvents([])
			stateRef.current = 'recording'
			setState('recording')

			const host = input.vncRef.current
			const canvas = findCanvas(host)
			canvasRef.current = canvas

			// ── DOM event listeners (capture phase, passive). ─────────────
			// All listeners are passive observers — we never preventDefault so
			// VNC input passes through to noVNC's own handlers (D-95-13).
			const onMouseDown = (ev: MouseEvent) => {
				const canvas = canvasRef.current
				if (!canvas) {
					bumpDropped()
					return
				}
				const rect = canvas.getBoundingClientRect()
				if (!rect.width || !rect.height) {
					bumpDropped()
					return
				}
				const scaleX = canvas.width / rect.width
				const scaleY = canvas.height / rect.height
				const x = Math.max(
					0,
					Math.min(canvas.width - 1, Math.round(ev.offsetX * scaleX)),
				)
				const y = Math.max(
					0,
					Math.min(canvas.height - 1, Math.round(ev.offsetY * scaleY)),
				)
				let button: 1 | 2 | 3
				if (ev.button === 0) button = 1
				else if (ev.button === 2) button = 3
				else button = 2
				const ts = Date.now() - startedAtRef.current
				pushStep({type: 'click', button, x, y, ts})
				// Best-effort frame capture (fire-and-forget — drift detection
				// for v3 relies on the popover's instruction text, not the
				// screenshot, per CONTEXT Q4-RESOLVED).
				void captureFrame(ts)

				// onAfterClick callback fires 100ms later (lets noVNC forward
				// the click to streamed Chrome first).
				if (onAfterClickRef.current) {
					const cb = onAfterClickRef.current
					// SelfClaude post-click delay: lets noVNC forward the
					// click to streamed Chrome before the popover appears
					// (RESEARCH.md Pattern 3 line 528).
					setTimeout(() => {
						try {
							cb({x, y, button})
						} catch (e) {
							// eslint-disable-next-line no-console
							console.error('[useTeachRecorder] onAfterClick threw', e)
						}
					}, 100)
				}
			}

			const onKeyDown = (ev: KeyboardEvent) => {
				if (!ev.key) {
					bumpDropped()
					return
				}
				const ts = Date.now() - startedAtRef.current
				pushStep({type: 'key', key: ev.key, ts})
				void captureFrame(ts)
			}

			// Capture-phase mousedown on the canvas itself (NOT the host).
			// Capture ensures we see the click BEFORE noVNC's own bubble-phase
			// handler forwards it to the remote Chrome instance.
			if (canvas) {
				canvas.addEventListener('mousedown', onMouseDown, true)
			}
			// Keydown is captured at the window level — the VNC canvas may not
			// have keyboard focus while the user types.
			window.addEventListener('keydown', onKeyDown, true)

			detachListenersRef.current = () => {
				if (canvas) {
					canvas.removeEventListener('mousedown', onMouseDown, true)
				}
				window.removeEventListener('keydown', onKeyDown, true)
			}

			// ── 10-minute auto-stop. ──────────────────────────────────────
			autoStopRef.current = setTimeout(() => {
				if (stateRef.current === 'recording') {
					setAutoStopped(true)
					// Caller observes via `autoStopped` flag and surfaces a
					// banner. The hook itself does not auto-call stop() — the
					// caller decides how to dispatch (open SaveDialog vs.
					// discard) per UX.
				}
			}, AUTO_STOP_MS)
		},
		[bumpDropped, captureFrame, pushStep],
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
		events,
		start,
		stop,
		resetAutoStop,
		pushNote,
		setOnAfterClick,
	}
}
