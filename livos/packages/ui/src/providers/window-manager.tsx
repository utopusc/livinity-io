import React, {createContext, useCallback, useContext, useEffect, useReducer, useRef} from 'react'

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
	'LIVINITY_live-usage': {width: 650, height: 500},
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
	const hydratedRef = useRef(false)
	useEffect(() => {
		if (hydratedRef.current) return
		const rows = pinnedListQuery.data
		if (!rows || rows.length === 0) return
		hydratedRef.current = true
		for (const row of rows) {
			// Skip rows whose window is already mounted (defense in depth).
			if (windowsRef.current.some((w) => w.id === row.windowId)) continue
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
	}, [pinnedListQuery.data])

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
		const baseSize = suggested ?? ((isWebApp || isNative)
			? {width: 1280, height: 720}
			: (DEFAULT_WINDOW_SIZES[appId] || DEFAULT_WINDOW_SIZES.default))
		const size = getResponsiveSize(baseSize.width, baseSize.height, isWebApp || isNative || isDisplay || suggested != null)
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

	return (
		<WindowManagerContext.Provider
			value={{
				windows: state.windows,
				openWindow,
				closeWindow,
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
