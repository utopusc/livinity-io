import React, {createContext, useCallback, useContext, useEffect, useReducer, useRef} from 'react'

import {isShortcutKind} from '@/modules/shortcuts/shortcut-window-route'
import {trpcReact} from '@/trpc/trpc'

// Types
export type WindowId = string

export type Position = {
	x: number
	y: number
}

export type Size = {
	width: number
	height: number
}

export type OriginRect = {
	x: number
	y: number
	width: number
	height: number
}

export type WindowState = {
	id: WindowId
	appId: string
	route: string
	position: Position
	size: Size
	zIndex: number
	isMinimized: boolean
	// Phase 130-09 — when true, the window is "docked" to the TopBar shelf.
	// Visually it collapses (scale 0.05 / opacity 0) toward the shelf chip
	// position; semantically the window stays alive in the manager so it
	// keeps running in the background (future: AI controls).
	isPinnedToTopBar?: boolean
	title: string
	icon: string
	originRect?: OriginRect
}

type WindowManagerState = {
	windows: WindowState[]
	nextZIndex: number
}

// Phase 159 — close-handler registry. Window-manager-mediated teardown
// ensures the handler runs while the React tree is still mounted, so
// refs (tRPC mutation refs, etc.) are fresh and the WS transport is
// live. Replaces the per-component unmount-cleanup race (H1 of
// 159-RESEARCH.md Workstream B).
//
// Sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f (sdk-agent-runner.ts) unchanged.
export type CloseHandler = () => void | Promise<void>

type WindowManagerContextT = {
	windows: WindowState[]
	openWindow: (appId: string, route: string, title: string, icon: string, originRect?: OriginRect, suggested?: {width: number; height: number}) => WindowId
	closeWindow: (windowId: WindowId) => void
	focusWindow: (windowId: WindowId) => void
	minimizeWindow: (windowId: WindowId) => void
	restoreWindow: (windowId: WindowId) => void
	updateWindowPosition: (windowId: WindowId, position: Position) => void
	updateWindowSize: (windowId: WindowId, size: Size) => void
	pinWindowToTopBar: (windowId: WindowId) => void
	unpinWindowFromTopBar: (windowId: WindowId) => void
	// Phase 159 — close-handler registry (Workstream B).
	registerCloseHandler: (windowId: WindowId, handler: CloseHandler) => void
	unregisterCloseHandler: (windowId: WindowId) => void
	// Phase 260.1 (SC-B) — close a DISPLAY_ window: tear the backend `:N`
	// down via the displays.close tRPC route (Plan 02) AND remove the window
	// from UI state. A non-display window simply skips the mutate and runs
	// the normal close path.
	closeDisplay: (windowId: WindowId) => void
}

// Get responsive window size based on screen dimensions.
//
// `preserveAspect` (Phase 100-06.2): when true, the window scales down
// proportionally if it doesn't fit the viewport — preserves W/H aspect.
// Used for WebApp windows so a 1280x720 (16:9) base never becomes portrait
// just because the user's browser is narrow. Non-WebApp apps keep the
// original independent clamp behavior so a 1500x750 store window degrades
// to "max width, max height" independently.
function getResponsiveSize(
	baseWidth: number,
	baseHeight: number,
	preserveAspect = false,
): Size {
	const screenW = typeof window !== 'undefined' ? window.innerWidth : 1920
	const screenH = typeof window !== 'undefined' ? window.innerHeight : 1080
	const maxAllowedW = screenW * 0.85
	const maxAllowedH = screenH * 0.85

	if (preserveAspect) {
		const aspect = baseWidth / baseHeight
		let w = baseWidth
		let h = baseHeight
		if (w > maxAllowedW) {
			w = maxAllowedW
			h = w / aspect
		}
		if (h > maxAllowedH) {
			h = maxAllowedH
			w = h * aspect
		}
		return {
			width: Math.max(400, Math.round(w)),
			height: Math.max(400, Math.round(h)),
		}
	}

	// Original independent clamp (non-WebApp apps).
	const maxW = Math.min(baseWidth, maxAllowedW)
	const maxH = Math.min(baseHeight, maxAllowedH)
	return {
		width: Math.max(400, maxW),
		height: Math.max(400, maxH),
	}
}

// Default window sizes per app - matching original page layouts.
//
// Phase 199-01 (D-199-01): exported so the regression-lock vitest cases
// in window-manager.test.tsx can import the runtime value. The Liv AI
// entry must not silently fall through to `default` (900x600) — operator
// directive 2026-05-22 mandates a bigger initial window.
export const DEFAULT_WINDOW_SIZES: Record<string, Size> = {
	'LIVINITY_app-store': {width: 1500, height: 750},
	'LIVINITY_files': {width: 1000, height: 1230},
	'LIVINITY_settings': {width: 1100, height: 980},
	'LIVINITY_ai-chat': {width: 1300, height: 850},
	'LIVINITY_docker': {width: 1400, height: 900},
	'LIVINITY_my-devices': {width: 900, height: 650},
	'LIVINITY_subagents': {width: 950, height: 650},
	'LIVINITY_schedules': {width: 950, height: 650},
	'LIVINITY_terminal': {width: 900, height: 600},
	// Phase 234-02 (D-234-WINDOW) — explicit default for the Liv AI window
	// (the v42 AionUi-backed chat surface, registered as LIVINITY_liv-assistant
	// in apps.tsx). Pre-Phase-234 this lookup fell through to the {900, 600}
	// default which felt cramped for the iframe SPA's left-rail + chat layout.
	// Operator directive 2026-05-27 night: bump to {1280, 800}.
	//
	// The legacy LIVINITY_liv-ai entry (Phase 199-01 / Hot-fix N at {1400, 900})
	// was removed in this same plan per 234-01-INVESTIGATION.md Section G.1 —
	// LIVINITY_liv-assistant absorbed the 'Liv AI' brand identity and is now
	// the sole v42 chat surface, so the legacy entry was dead config.
	'LIVINITY_liv-assistant': {width: 1280, height: 800},
	default: {width: 900, height: 600},
}

// Get initial position with offset for stacking
function getInitialPosition(windowCount: number, windowSize?: Size, appId?: string): Position {
	const width = windowSize?.width || 900
	const height = windowSize?.height || 600
	const offset = (windowCount % 10) * 30 // Cycle after 10 windows

	// Files opens at top right corner
	if (appId === 'LIVINITY_files') {
		const baseX = Math.max(50, window.innerWidth - width - 50)
		const baseY = 30
		return {
			x: baseX - offset,
			y: baseY + offset,
		}
	}

	// Other apps open centered
	const baseX = Math.max(50, (window.innerWidth - width) / 2)
	const baseY = Math.max(50, (window.innerHeight - height) / 2)

	return {
		x: baseX + offset,
		y: baseY + offset,
	}
}

// Reducer actions
type WindowAction =
	| {type: 'OPEN_WINDOW'; payload: Omit<WindowState, 'zIndex'>}
	| {type: 'CLOSE_WINDOW'; payload: WindowId}
	| {type: 'FOCUS_WINDOW'; payload: WindowId}
	| {type: 'MINIMIZE_WINDOW'; payload: WindowId}
	| {type: 'RESTORE_WINDOW'; payload: WindowId}
	| {type: 'UPDATE_POSITION'; payload: {id: WindowId; position: Position}}
	| {type: 'UPDATE_SIZE'; payload: {id: WindowId; size: Size}}
	| {type: 'PIN_TO_TOPBAR'; payload: WindowId}
	| {type: 'UNPIN_FROM_TOPBAR'; payload: WindowId}

function windowReducer(state: WindowManagerState, action: WindowAction): WindowManagerState {
	switch (action.type) {
		case 'OPEN_WINDOW':
			return {
				windows: [...state.windows, {...action.payload, zIndex: state.nextZIndex}],
				nextZIndex: state.nextZIndex + 1,
			}

		case 'CLOSE_WINDOW':
			return {
				...state,
				windows: state.windows.filter((w) => w.id !== action.payload),
			}

		case 'FOCUS_WINDOW':
			return {
				windows: state.windows.map((w) => (w.id === action.payload ? {...w, zIndex: state.nextZIndex} : w)),
				nextZIndex: state.nextZIndex + 1,
			}

		case 'MINIMIZE_WINDOW':
			return {
				...state,
				windows: state.windows.map((w) => (w.id === action.payload ? {...w, isMinimized: true} : w)),
			}

		case 'RESTORE_WINDOW':
			return {
				windows: state.windows.map((w) =>
					w.id === action.payload ? {...w, isMinimized: false, zIndex: state.nextZIndex} : w,
				),
				nextZIndex: state.nextZIndex + 1,
			}

		case 'UPDATE_POSITION':
			return {
				...state,
				windows: state.windows.map((w) =>
					w.id === action.payload.id ? {...w, position: action.payload.position} : w,
				),
			}

		case 'UPDATE_SIZE':
			return {
				...state,
				windows: state.windows.map((w) =>
					w.id === action.payload.id ? {...w, size: action.payload.size} : w,
				),
			}

		case 'PIN_TO_TOPBAR':
			return {
				...state,
				windows: state.windows.map((w) =>
					w.id === action.payload ? {...w, isPinnedToTopBar: true} : w,
				),
			}

		case 'UNPIN_FROM_TOPBAR':
			return {
				windows: state.windows.map((w) =>
					w.id === action.payload ? {...w, isPinnedToTopBar: false, zIndex: state.nextZIndex} : w,
				),
				nextZIndex: state.nextZIndex + 1,
			}

		default:
			return state
	}
}

// Context
const WindowManagerContext = createContext<WindowManagerContextT | null>(null)

// Provider
export function WindowManagerProvider({children}: {children: React.ReactNode}) {
	const [state, dispatch] = useReducer(windowReducer, {
		windows: [],
		nextZIndex: 40, // Start at z-40, below dock at z-50
	})

	// Phase 131-02 — pinned-windows persistence (D-131-A: Postgres).
	// On mount, fetch the user's pinned shelf and rehydrate the windows
	// in `isPinnedToTopBar: true` state so the chips reappear after a
	// page refresh. Tier-(a) of D-131-E. Tier-(b) — keeping the
	// underlying app session alive in the background — is Plan 131-03
	// scope (not yet implemented; chips here open fresh sessions on
	// click).
	const pinnedListQuery = trpcReact.pinnedWindows.list.useQuery(undefined, {
		// Refetch is not useful here — pinned state is mirrored locally
		// on every pin/unpin. Hydrate once on mount.
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		retry: 1,
	})
	const pinnedUpsertMutation = trpcReact.pinnedWindows.upsert.useMutation()
	const pinnedDeleteMutation = trpcReact.pinnedWindows.delete.useMutation()

	// Phase 260-05 (SC6) — server-side liveness source of truth for the
	// hydrate reconcile. After 260-02 native-app `:N` displays register into
	// the Redis-backed displayManager, so `displays.list` lists EVERY live
	// stream (luse + webapp + native). On hydrate we reconcile each persisted
	// native pin against this list: a pin whose underlying stream is no longer
	// live (e.g. the in-memory `activeNative` was cleared by a livinityd
	// RESTART — see 260-RESEARCH Assumption A5 / SC6 boundary) must be dropped
	// instead of re-opening as a dead chip that recalls into a spinner.
	//
	// "refresh" (page reload) keeps livinityd + the streams alive, so the pin
	// stays live and re-mounting re-attaches to the running stream (idempotent
	// spawn, native-app-stream-window.tsx). A livinityd RESTART is the only
	// case that produces a dead pin — that is exactly what this reconcile heals.
	//
	// We must NOT drop pins just because this list hasn't loaded yet (that
	// would erase good pins on a slow network), so the hydrate effect below is
	// gated on BOTH queries being ready before it sets hydratedRef.
	const displaysListQuery = trpcReact.displays.list.useQuery(undefined, {
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		retry: 1,
	})

	// Phase 260.1 (SC-B) — server-side display teardown. closeDisplay (below)
	// fires this for DISPLAY_:N windows so the `:N` actually tears down
	// (Redis record gone, stream stopped, badge decrements) and does NOT
	// re-appear in displays.list — fixing the "created displays can't be
	// closed" bug. Authorization is enforced entirely server-side in
	// displays.close (canAccessDisplay, Plan 02); this client only passes
	// the `:N`.
	const displaysCloseMutation = trpcReact.displays.close.useMutation()

	// Mirror state.windows in a ref so the pin/unpin mutation callbacks
	// can look up a window's full payload without taking state in their
	// dep array (which would re-create the callbacks on every reducer
	// dispatch and tear the drag-state external store subscribers).
	const windowsRef = useRef(state.windows)
	windowsRef.current = state.windows

	// Phase 159 — close-handler registry (Workstream B). Lives in a ref so
	// registration does NOT trigger context re-renders.
	const closeHandlersRef = useRef<Map<WindowId, CloseHandler>>(new Map())

	const registerCloseHandler = useCallback((windowId: WindowId, handler: CloseHandler) => {
		closeHandlersRef.current.set(windowId, handler)
	}, [])

	const unregisterCloseHandler = useCallback((windowId: WindowId) => {
		closeHandlersRef.current.delete(windowId)
	}, [])

	// One-shot hydration guard — only dispatch hydrated rows once even if
	// the query refetches under StrictMode-double-mount.
	//
	// Phase 260-05 (SC6) — the hydrate now RECONCILES each persisted pin
	// against `displays.list` (the server-side liveness truth) before
	// re-opening it. It is gated on BOTH `pinnedWindows.list` AND
	// `displays.list` being ready so a slow/pending displays query can never
	// cause a good native pin to be dropped prematurely (T-260-10).
	const hydratedRef = useRef(false)
	useEffect(() => {
		if (hydratedRef.current) return
		const rows = pinnedListQuery.data
		if (!rows || rows.length === 0) return
		// SC6 gate: wait until displays.list has resolved (success or error)
		// before reconciling. `data` is undefined while loading; once the
		// query settles it is an object (even an empty-list payload), so we
		// key on `data !== undefined`. Without this guard we would treat
		// "still loading" as "no live displays" and erase every native pin.
		const displaysData = displaysListQuery.data
		if (displaysData === undefined) return
		hydratedRef.current = true

		// Set of live display NAMES (after 260-02, a native display's `name`
		// is its app name — the same value persisted as the pin `title`).
		const liveDisplayNames = new Set(
			(displaysData.displays ?? []).map((d) => d.name),
		)

		for (const row of rows) {
			// Skip rows whose window is already mounted (defense in depth).
			if (windowsRef.current.some((w) => w.id === row.windowId)) continue

			// SC6 reconcile — NATIVE pins only. A native pin is LIVE iff a
			// displays.list entry exists whose `name` matches the pin title
			// (the native app name). The `:N` itself is allocated per-spawn
			// server-side and is NOT stored on the pinned row, so the app
			// name is the stable client-visible key. If no matching live
			// display exists the underlying stream is gone (livinityd
			// restart) → drop the pin: do NOT OPEN_WINDOW and delete the
			// dead Postgres row so it does not resurrect on the next refresh.
			//
			// WEBAPP (and any other) pins are NOT reconciled here: webapp
			// liveness is not represented in displays.list, so we keep the
			// existing behavior (re-open + let the idempotent re-spawn
			// re-attach). 260-06's webapp backend work may add a liveness
			// signal later; until then dropping webapp pins here would be a
			// false-positive. (Documented in 260-05-SUMMARY.)
			const isNative = row.appId.startsWith('NATIVE_')
			if (isNative && !liveDisplayNames.has(row.title)) {
				// Dead native pin → reap it (UI + Postgres) instead of
				// re-opening a chip that recalls into a spinner.
				pinnedDeleteMutation.mutate({windowId: row.windowId})
				continue
			}

			dispatch({
				type: 'OPEN_WINDOW',
				payload: {
					id: row.windowId,
					appId: row.appId,
					route: row.route,
					position: row.position,
					size: row.size,
					isMinimized: false,
					isPinnedToTopBar: true, // ← renders as chip, not full window
					title: row.title,
					icon: row.icon,
				},
			})
		}
	}, [pinnedListQuery.data, displaysListQuery.data, pinnedDeleteMutation])

	const openWindow = useCallback((appId: string, route: string, title: string, icon: string, originRect?: OriginRect, suggested?: {width: number; height: number}): WindowId => {
		const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)
		// Phase 100-06: WebApp windows ship with a stable 1280x720 base size
		// regardless of viewport (honored within getResponsiveSize clamp).
		// Phase 100-06.2: preserve 16:9 aspect when clamping — narrow
		// viewports were producing portrait windows because W and H were
		// being clamped independently.
		//
		// Phase 254-03: DISPLAY_:N windows pass an explicit `suggested`
		// {width,height} = the X display's real WxH (from displays.list).
		// When present, baseSize = suggested and we preserve aspect so the
		// full desktop never degrades to a portrait window on narrow viewports
		// (same clamp treatment as WebApp). Absent `suggested` keeps the
		// pre-254 behavior byte-identical.
		const isWebApp = appId.startsWith('WEBAPP_')
		const isNative = appId.startsWith('NATIVE_')
		const isDisplay = appId.startsWith('DISPLAY_')
		// Phase 290 (INV-2) — a SHORTCUT_<id> window (iframe OR browser-stream
		// mode) takes the SAME 1280x720 16:9 base + aspect-preserved clamp as a
		// normal WebApp window. Without this it fell through to the generic
		// DEFAULT_WINDOW_SIZES.default {900,600} with no aspect preservation,
		// which letterboxed the browser-stream and opened too small.
		const isShortcut = isShortcutKind(appId)
		// Native windows are sized a touch larger (+2px each axis) so that the
		// CONTENT area, once the 1px window border is subtracted on each side, is
		// exactly the 1280x720 16:9 stream — otherwise the noVNC canvas letterboxes
		// a hair inside a 1278x718 box (operator: window should seat flush with the
		// inner resolution, "bir tık büyük"). WebApp keeps its exact 1280x720.
		const baseSize = suggested ?? (isNative
			? {width: 1282, height: 722}
			: (isWebApp || isShortcut)
				? {width: 1280, height: 720}
				: (DEFAULT_WINDOW_SIZES[appId] || DEFAULT_WINDOW_SIZES.default))
		const size = getResponsiveSize(baseSize.width, baseSize.height, isWebApp || isNative || isDisplay || isShortcut || suggested != null)
		// Use current state.windows.length at call time, not as dependency
		const windowCount = state.windows.length

		dispatch({
			type: 'OPEN_WINDOW',
			payload: {
				id,
				appId,
				route,
				position: getInitialPosition(windowCount, size, appId),
				size,
				isMinimized: false,
				title,
				icon,
				originRect,
			},
		})

		return id
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	const closeWindow = useCallback((windowId: WindowId) => {
		// Phase 159 — invoke registered close handler FIRST (e.g.
		// native-app-stream-window's `apps.native.close` mutation),
		// then dispatch the reducer action. Handler runs while React
		// tree is still mounted so refs (closeMutationRef, etc.) are
		// fresh and the WS transport is live. We fire-and-forget with a
		// 2s timeout — the UI must not hang if the backend is slow.
		const handler = closeHandlersRef.current.get(windowId)
		if (handler) {
			const handlerPromise = Promise.resolve().then(() => handler())
			const timeout = new Promise<void>((resolve) => setTimeout(resolve, 2000))
			void Promise.race([handlerPromise, timeout]).catch(() => undefined)
			closeHandlersRef.current.delete(windowId)
		}
		dispatch({type: 'CLOSE_WINDOW', payload: windowId})
	}, [])

	// Phase 260.1 (SC-B) — close a display: tear the backend `:N` down via
	// displays.close (Plan 02) THEN drop the window from UI state. We do NOT
	// call closeWindow here (that would double-dispatch the close handler) —
	// instead we run the registered close handler + dispatch CLOSE_WINDOW
	// inline, exactly mirroring closeWindow's UI teardown.
	const closeDisplay = useCallback((windowId: WindowId) => {
		// Read the full window payload via the ref so state stays out of the
		// dep array (mirrors pinWindowToTopBar).
		const w = windowsRef.current.find((x) => x.id === windowId)
		// DISPLAY_ windows carry appId `DISPLAY_:N` (openWindow `DISPLAY_${d.display}`
		// — displays-popover.tsx). Derive the `:N` for the backend teardown.
		const display = w?.appId.startsWith('DISPLAY_') ? w.appId.slice('DISPLAY_'.length) : undefined
		if (display) {
			// SC-B: server-side teardown so the `:N` does NOT re-appear in
			// displays.list. Fire-and-forget — the UI must not hang on a slow
			// backend.
			displaysCloseMutation.mutate({display})
		}
		// Drop the window from the UI regardless (also runs any registered
		// close handler with the same 2s fire-and-forget race as closeWindow).
		const handler = closeHandlersRef.current.get(windowId)
		if (handler) {
			const handlerPromise = Promise.resolve().then(() => handler())
			const timeout = new Promise<void>((resolve) => setTimeout(resolve, 2000))
			void Promise.race([handlerPromise, timeout]).catch(() => undefined)
			closeHandlersRef.current.delete(windowId)
		}
		dispatch({type: 'CLOSE_WINDOW', payload: windowId})
	}, [displaysCloseMutation])

	const focusWindow = useCallback((windowId: WindowId) => {
		dispatch({type: 'FOCUS_WINDOW', payload: windowId})
	}, [])

	const minimizeWindow = useCallback((windowId: WindowId) => {
		dispatch({type: 'MINIMIZE_WINDOW', payload: windowId})
	}, [])

	const restoreWindow = useCallback((windowId: WindowId) => {
		dispatch({type: 'RESTORE_WINDOW', payload: windowId})
	}, [])

	const updateWindowPosition = useCallback((windowId: WindowId, position: Position) => {
		dispatch({type: 'UPDATE_POSITION', payload: {id: windowId, position}})
	}, [])

	const updateWindowSize = useCallback((windowId: WindowId, size: Size) => {
		dispatch({type: 'UPDATE_SIZE', payload: {id: windowId, size}})
	}, [])

	const pinWindowToTopBar = useCallback((windowId: WindowId) => {
		dispatch({type: 'PIN_TO_TOPBAR', payload: windowId})
		// Mirror to Postgres (Phase 131-02). Look up the current window
		// state via the ref so we don't take state in our dep array.
		const w = windowsRef.current.find((x) => x.id === windowId)
		if (!w) return
		pinnedUpsertMutation.mutate({
			windowId,
			appId: w.appId,
			route: w.route,
			title: w.title,
			icon: w.icon,
			position: w.position,
			size: w.size,
		})
	}, [pinnedUpsertMutation])

	const unpinWindowFromTopBar = useCallback((windowId: WindowId) => {
		dispatch({type: 'UNPIN_FROM_TOPBAR', payload: windowId})
		pinnedDeleteMutation.mutate({windowId})
	}, [pinnedDeleteMutation])

	// Phase 297 (A) — re-clamp open windows on viewport / resolution change.
	//
	// getResponsiveSize() fits a window to 85% of the viewport ONLY at open
	// time (openWindow, above). With no resize listener, shrinking the browser
	// or lowering the screen resolution AFTER a window is open left it at its
	// old (now-too-big) pixel size — overflowing the viewport and drifting
	// off-screen (operator: "çözünürlük değişince pencereler çok büyüyor"). This
	// debounced listener re-fits any window that has become oversized and pulls
	// any now-off-screen window back so its title bar stays reachable.
	//
	// Idempotency / no-loop guarantees:
	//   - It dispatches ONLY on a real delta (size or position actually
	//     changed), so a repeat resize that yields the same geometry is a no-op.
	//   - The effect reads `windowsRef.current` (a ref, not state) and depends
	//     only on the two stable (empty-dep) update callbacks, so dispatching a
	//     size/position update never re-runs the effect → no feedback loop.
	//   - It NEVER grows a window on a viewport GROW (getResponsiveSize only
	//     clamps DOWN; oversized is the only trigger) — growing would fight the
	//     user's own resize / their chosen window size.
	// REUSES getResponsiveSize so the re-fit matches open-time sizing exactly.
	useEffect(() => {
		if (typeof window === 'undefined') return
		const TOP_BAR = 42
		const DOCK = 62
		let timer: ReturnType<typeof setTimeout> | undefined

		const reclamp = () => {
			const vw = window.innerWidth
			const vh = window.innerHeight
			const availH = vh - TOP_BAR - DOCK
			for (const w of windowsRef.current) {
				// A window docked to the TopBar shelf renders as a chip, not a
				// real on-screen rectangle — skip it (its geometry is restored
				// fresh on unpin). MINIMIZED windows are intentionally NOT
				// skipped: re-clamping their stored geometry now means they
				// restore on-screen and correctly-sized after a resolution drop,
				// instead of popping back oversized / off-screen.
				if (w.isPinnedToTopBar) continue

				// Stream-ish windows preserve their aspect ratio when re-fitting,
				// matching the open-time clamp (openWindow passes the same flag
				// for WEBAPP_/NATIVE_/DISPLAY_/shortcut kinds).
				const isStreamish =
					w.appId.startsWith('WEBAPP_') ||
					w.appId.startsWith('NATIVE_') ||
					w.appId.startsWith('DISPLAY_') ||
					isShortcutKind(w.appId)

				const oversized = w.size.width > 0.9 * vw || w.size.height > 0.9 * availH
				const fitted = oversized
					? getResponsiveSize(w.size.width, w.size.height, isStreamish)
					: w.size
				if (fitted.width !== w.size.width || fitted.height !== w.size.height) {
					updateWindowSize(w.id, fitted)
				}

				// Re-pull a now-off-screen window back on-screen. Clamp x into
				// [0, vw - width] and y into [TOP_BAR, vh - DOCK - min(height,120)]
				// so at least the title-bar strip stays grabbable. The Math.max
				// guards keep the ranges valid when the window is wider/taller
				// than the viewport (range collapses to its lower bound).
				const maxX = Math.max(0, vw - fitted.width)
				const maxY = Math.max(TOP_BAR, vh - DOCK - Math.min(fitted.height, 120))
				const clampedX = Math.min(Math.max(w.position.x, 0), maxX)
				const clampedY = Math.min(Math.max(w.position.y, TOP_BAR), maxY)
				if (clampedX !== w.position.x || clampedY !== w.position.y) {
					updateWindowPosition(w.id, {x: clampedX, y: clampedY})
				}
			}
		}

		const onResize = () => {
			if (timer) clearTimeout(timer)
			timer = setTimeout(reclamp, 150)
		}

		window.addEventListener('resize', onResize)
		return () => {
			window.removeEventListener('resize', onResize)
			if (timer) clearTimeout(timer)
		}
	}, [updateWindowSize, updateWindowPosition])

	return (
		<WindowManagerContext.Provider
			value={{
				windows: state.windows,
				openWindow,
				closeWindow,
				closeDisplay,
				focusWindow,
				minimizeWindow,
				restoreWindow,
				updateWindowPosition,
				updateWindowSize,
				pinWindowToTopBar,
				unpinWindowFromTopBar,
				registerCloseHandler,
				unregisterCloseHandler,
			}}
		>
			{children}
		</WindowManagerContext.Provider>
	)
}

// Hook
export function useWindowManager() {
	const context = useContext(WindowManagerContext)
	if (!context) {
		throw new Error('useWindowManager must be used within a WindowManagerProvider')
	}
	return context
}

// Optional hook that doesn't throw (for components that may be outside provider)
export function useWindowManagerOptional() {
	return useContext(WindowManagerContext)
}
