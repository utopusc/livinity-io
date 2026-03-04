'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type WindowId = string;

export type Position = { x: number; y: number };
export type Size = { width: number; height: number };

export type WindowState = {
  id: WindowId;
  appId: string;
  route: string;
  position: Position;
  size: Size;
  zIndex: number;
  isMinimized: boolean;
  title: string;
  icon: string;
};

type State = {
  windows: WindowState[];
  nextZIndex: number;
};

/* ------------------------------------------------------------------ */
/*  Default sizes per app                                              */
/* ------------------------------------------------------------------ */

const DEFAULT_SIZES: Record<string, Size> = {
  'LIVINITY_app-store': { width: 1500, height: 750 },
  'LIVINITY_files': { width: 1000, height: 1230 },
  'LIVINITY_settings': { width: 800, height: 900 },
  'LIVINITY_live-usage': { width: 650, height: 500 },
  'LIVINITY_ai-chat': { width: 1300, height: 850 },
  'LIVINITY_server-control': { width: 1000, height: 700 },
  'LIVINITY_subagents': { width: 950, height: 650 },
  'LIVINITY_schedules': { width: 950, height: 650 },
  'LIVINITY_terminal': { width: 900, height: 600 },
};

const DEFAULT_SIZE: Size = { width: 900, height: 600 };
const MIN_SIZE: Size = { width: 400, height: 400 };

function clampSize(size: Size): Size {
  const maxW = typeof window !== 'undefined' ? window.innerWidth * 0.85 : 1200;
  const maxH = typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800;
  return {
    width: Math.max(MIN_SIZE.width, Math.min(size.width, maxW)),
    height: Math.max(MIN_SIZE.height, Math.min(size.height, maxH)),
  };
}

function centerPosition(size: Size, offset = 0): Position {
  if (typeof window === 'undefined') return { x: 100, y: 100 };
  return {
    x: Math.max(0, (window.innerWidth - size.width) / 2 + offset),
    y: Math.max(50, (window.innerHeight - size.height) / 2 + offset),
  };
}

/* ------------------------------------------------------------------ */
/*  Reducer                                                            */
/* ------------------------------------------------------------------ */

type Action =
  | { type: 'OPEN'; payload: Omit<WindowState, 'zIndex'> }
  | { type: 'CLOSE'; payload: WindowId }
  | { type: 'FOCUS'; payload: WindowId }
  | { type: 'MINIMIZE'; payload: WindowId }
  | { type: 'RESTORE'; payload: WindowId }
  | { type: 'UPDATE_POSITION'; payload: { id: WindowId; position: Position } }
  | { type: 'UPDATE_SIZE'; payload: { id: WindowId; size: Size } };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'OPEN': {
      const existing = state.windows.find(
        (w) => w.appId === action.payload.appId,
      );
      if (existing) {
        // Focus existing window instead of opening duplicate
        return reducer(state, { type: 'RESTORE', payload: existing.id });
      }
      return {
        windows: [
          ...state.windows,
          { ...action.payload, zIndex: state.nextZIndex },
        ],
        nextZIndex: state.nextZIndex + 1,
      };
    }
    case 'CLOSE':
      return {
        ...state,
        windows: state.windows.filter((w) => w.id !== action.payload),
      };
    case 'FOCUS':
      return {
        windows: state.windows.map((w) =>
          w.id === action.payload ? { ...w, zIndex: state.nextZIndex } : w,
        ),
        nextZIndex: state.nextZIndex + 1,
      };
    case 'MINIMIZE':
      return {
        ...state,
        windows: state.windows.map((w) =>
          w.id === action.payload ? { ...w, isMinimized: true } : w,
        ),
      };
    case 'RESTORE': {
      return {
        windows: state.windows.map((w) =>
          w.id === action.payload
            ? { ...w, isMinimized: false, zIndex: state.nextZIndex }
            : w,
        ),
        nextZIndex: state.nextZIndex + 1,
      };
    }
    case 'UPDATE_POSITION':
      return {
        ...state,
        windows: state.windows.map((w) =>
          w.id === action.payload.id
            ? { ...w, position: action.payload.position }
            : w,
        ),
      };
    case 'UPDATE_SIZE':
      return {
        ...state,
        windows: state.windows.map((w) =>
          w.id === action.payload.id
            ? { ...w, size: action.payload.size }
            : w,
        ),
      };
    default:
      return state;
  }
}

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

type WindowManagerContextT = {
  windows: WindowState[];
  openWindow: (
    appId: string,
    route: string,
    title: string,
    icon: string,
  ) => WindowId;
  closeWindow: (id: WindowId) => void;
  focusWindow: (id: WindowId) => void;
  minimizeWindow: (id: WindowId) => void;
  restoreWindow: (id: WindowId) => void;
  updateWindowPosition: (id: WindowId, position: Position) => void;
  updateWindowSize: (id: WindowId, size: Size) => void;
  getWindowByAppId: (appId: string) => WindowState | undefined;
};

const WindowManagerContext = createContext<WindowManagerContextT | null>(null);

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

export function WindowManagerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    windows: [],
    nextZIndex: 40,
  });

  const openWindow = useCallback(
    (appId: string, route: string, title: string, icon: string): WindowId => {
      const id = crypto.randomUUID();
      const baseSize = DEFAULT_SIZES[appId] ?? DEFAULT_SIZE;
      const size = clampSize(baseSize);
      const offset = (state.windows.length % 8) * 30;
      const position = centerPosition(size, offset);

      dispatch({
        type: 'OPEN',
        payload: { id, appId, route, position, size, isMinimized: false, title, icon },
      });
      return id;
    },
    [state.windows.length],
  );

  const closeWindow = useCallback(
    (id: WindowId) => dispatch({ type: 'CLOSE', payload: id }),
    [],
  );

  const focusWindow = useCallback(
    (id: WindowId) => dispatch({ type: 'FOCUS', payload: id }),
    [],
  );

  const minimizeWindow = useCallback(
    (id: WindowId) => dispatch({ type: 'MINIMIZE', payload: id }),
    [],
  );

  const restoreWindow = useCallback(
    (id: WindowId) => dispatch({ type: 'RESTORE', payload: id }),
    [],
  );

  const updateWindowPosition = useCallback(
    (id: WindowId, position: Position) =>
      dispatch({ type: 'UPDATE_POSITION', payload: { id, position } }),
    [],
  );

  const updateWindowSize = useCallback(
    (id: WindowId, size: Size) =>
      dispatch({ type: 'UPDATE_SIZE', payload: { id, size } }),
    [],
  );

  const getWindowByAppId = useCallback(
    (appId: string) => state.windows.find((w) => w.appId === appId),
    [state.windows],
  );

  const ctx = useMemo(
    () => ({
      windows: state.windows,
      openWindow,
      closeWindow,
      focusWindow,
      minimizeWindow,
      restoreWindow,
      updateWindowPosition,
      updateWindowSize,
      getWindowByAppId,
    }),
    [
      state.windows,
      openWindow,
      closeWindow,
      focusWindow,
      minimizeWindow,
      restoreWindow,
      updateWindowPosition,
      updateWindowSize,
      getWindowByAppId,
    ],
  );

  return (
    <WindowManagerContext.Provider value={ctx}>
      {children}
    </WindowManagerContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

export function useWindowManager() {
  const ctx = useContext(WindowManagerContext);
  if (!ctx) throw new Error('useWindowManager must be used within WindowManagerProvider');
  return ctx;
}

export function useWindowManagerOptional() {
  return useContext(WindowManagerContext);
}
