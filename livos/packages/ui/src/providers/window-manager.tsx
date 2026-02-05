import React, {createContext, useCallback, useContext, useReducer} from 'react'

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

export type WindowState = {
	id: WindowId
	appId: string
	route: string
	position: Position
	size: Size
	zIndex: number
	isMinimized: boolean
	title: string
	icon: string
}

type WindowManagerState = {
	windows: WindowState[]
	nextZIndex: number
}

type WindowManagerContextT = {
	windows: WindowState[]
	openWindow: (appId: string, route: string, title: string, icon: string) => WindowId
	closeWindow: (windowId: WindowId) => void
	focusWindow: (windowId: WindowId) => void
	minimizeWindow: (windowId: WindowId) => void
	restoreWindow: (windowId: WindowId) => void
	updateWindowPosition: (windowId: WindowId, position: Position) => void
}

// Get responsive window size based on screen dimensions
function getResponsiveSize(baseWidth: number, baseHeight: number): Size {
	const screenW = typeof window !== 'undefined' ? window.innerWidth : 1920
	const screenH = typeof window !== 'undefined' ? window.innerHeight : 1080

	// Max 85% of screen, min reasonable size
	const maxW = Math.min(baseWidth, screenW * 0.85)
	const maxH = Math.min(baseHeight, screenH * 0.85)

	return {
		width: Math.max(400, maxW),
		height: Math.max(400, maxH),
	}
}

// Default window sizes per app - matching original page layouts
const DEFAULT_WINDOW_SIZES: Record<string, Size> = {
	'LIVINITY_app-store': {width: 1500, height: 750},
	'LIVINITY_files': {width: 1000, height: 1230},
	'LIVINITY_settings': {width: 800, height: 900},
	'LIVINITY_live-usage': {width: 650, height: 500},
	'LIVINITY_ai-chat': {width: 1300, height: 850},
	'LIVINITY_server-control': {width: 1000, height: 700},
	'LIVINITY_subagents': {width: 950, height: 650},
	'LIVINITY_schedules': {width: 950, height: 650},
	'LIVINITY_terminal': {width: 900, height: 600},
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

	const openWindow = useCallback((appId: string, route: string, title: string, icon: string): WindowId => {
		const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)
		const baseSize = DEFAULT_WINDOW_SIZES[appId] || DEFAULT_WINDOW_SIZES.default
		const size = getResponsiveSize(baseSize.width, baseSize.height)
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
			},
		})

		return id
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	const closeWindow = useCallback((windowId: WindowId) => {
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
