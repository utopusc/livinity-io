'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useWindowManager,
  type WindowState,
  type Position,
  type Size,
} from '@/providers/window-manager';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MIN_WIDTH = 400;
const MIN_HEIGHT = 400;
const HANDLE_SIZE = 6;

const springTransition = {
  type: 'spring' as const,
  stiffness: 500,
  damping: 35,
  mass: 0.8,
};

/* ------------------------------------------------------------------ */
/*  Window Title Bar                                                   */
/* ------------------------------------------------------------------ */

type TitleBarProps = {
  title: string;
  onClose: () => void;
  onMinimize: () => void;
  onPointerDown: (e: ReactPointerEvent) => void;
};

function TitleBar({ title, onClose, onMinimize, onPointerDown }: TitleBarProps) {
  return (
    <div
      className={cn(
        'flex h-10 shrink-0 items-center justify-between px-3',
        'cursor-grab select-none active:cursor-grabbing',
        'border-b border-white/5',
      )}
      onPointerDown={onPointerDown}
    >
      {/* Title */}
      <span className="text-xs font-medium text-text-secondary">{title}</span>

      {/* Window controls */}
      <div className="flex items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
        <button
          className="flex h-6 w-6 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-white/10 hover:text-text"
          onClick={onMinimize}
        >
          <Minus className="h-3 w-3" />
        </button>
        <button
          className="flex h-6 w-6 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-error/20 hover:text-error"
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Resize handles                                                     */
/* ------------------------------------------------------------------ */

type ResizeDirection =
  | 'n' | 's' | 'e' | 'w'
  | 'ne' | 'nw' | 'se' | 'sw';

const cursorMap: Record<ResizeDirection, string> = {
  n: 'cursor-n-resize',
  s: 'cursor-s-resize',
  e: 'cursor-e-resize',
  w: 'cursor-w-resize',
  ne: 'cursor-ne-resize',
  nw: 'cursor-nw-resize',
  se: 'cursor-se-resize',
  sw: 'cursor-sw-resize',
};

type ResizeHandleProps = {
  direction: ResizeDirection;
  onPointerDown: (e: ReactPointerEvent, direction: ResizeDirection) => void;
};

function ResizeHandle({ direction, onPointerDown }: ResizeHandleProps) {
  const isCorner = direction.length === 2;
  const size = isCorner ? HANDLE_SIZE * 2 : HANDLE_SIZE;

  const positionStyles: Record<ResizeDirection, string> = {
    n: 'top-0 left-0 right-0 h-[6px]',
    s: 'bottom-0 left-0 right-0 h-[6px]',
    e: 'top-0 right-0 bottom-0 w-[6px]',
    w: 'top-0 left-0 bottom-0 w-[6px]',
    ne: 'top-0 right-0 h-3 w-3',
    nw: 'top-0 left-0 h-3 w-3',
    se: 'bottom-0 right-0 h-3 w-3',
    sw: 'bottom-0 left-0 h-3 w-3',
  };

  return (
    <div
      className={cn('absolute z-10', cursorMap[direction], positionStyles[direction])}
      onPointerDown={(e) => onPointerDown(e, direction)}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Window                                                             */
/* ------------------------------------------------------------------ */

type WindowProps = {
  window: WindowState;
  children: ReactNode;
};

export function Window({ window: win, children }: WindowProps) {
  const {
    closeWindow,
    focusWindow,
    minimizeWindow,
    updateWindowPosition,
    updateWindowSize,
  } = useWindowManager();

  const dragRef = useRef<{
    startX: number;
    startY: number;
    startPos: Position;
  } | null>(null);

  const resizeRef = useRef<{
    startX: number;
    startY: number;
    startPos: Position;
    startSize: Size;
    direction: ResizeDirection;
  } | null>(null);

  /* ---- Drag ---- */
  const handleDragStart = useCallback(
    (e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      focusWindow(win.id);
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startPos: { ...win.position },
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [focusWindow, win.id, win.position],
  );

  const handleDragMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      const x = Math.max(
        -win.size.width + 100,
        Math.min(dragRef.current.startPos.x + dx, window.innerWidth - 100),
      );
      const y = Math.max(
        0,
        Math.min(dragRef.current.startPos.y + dy, window.innerHeight - 100),
      );
      updateWindowPosition(win.id, { x, y });
    },
    [win.id, win.size.width, updateWindowPosition],
  );

  const handleDragEnd = useCallback(() => {
    dragRef.current = null;
  }, []);

  /* ---- Resize ---- */
  const handleResizeStart = useCallback(
    (e: ReactPointerEvent, direction: ResizeDirection) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      focusWindow(win.id);
      resizeRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startPos: { ...win.position },
        startSize: { ...win.size },
        direction,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [focusWindow, win.id, win.position, win.size],
  );

  const handleResizeMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!resizeRef.current) return;
      const { startX, startY, startPos, startSize, direction } = resizeRef.current;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      let newX = startPos.x;
      let newY = startPos.y;
      let newW = startSize.width;
      let newH = startSize.height;

      if (direction.includes('e')) newW = Math.max(MIN_WIDTH, startSize.width + dx);
      if (direction.includes('w')) {
        newW = Math.max(MIN_WIDTH, startSize.width - dx);
        newX = startPos.x + startSize.width - newW;
      }
      if (direction.includes('s')) newH = Math.max(MIN_HEIGHT, startSize.height + dy);
      if (direction.includes('n')) {
        newH = Math.max(MIN_HEIGHT, startSize.height - dy);
        newY = startPos.y + startSize.height - newH;
      }

      updateWindowPosition(win.id, { x: newX, y: newY });
      updateWindowSize(win.id, { width: newW, height: newH });
    },
    [win.id, updateWindowPosition, updateWindowSize],
  );

  const handleResizeEnd = useCallback(() => {
    resizeRef.current = null;
  }, []);

  return (
    <motion.div
      className={cn(
        'fixed overflow-hidden rounded-2xl',
        'bg-bg/90 backdrop-blur-2xl',
        'border border-white/8',
        'shadow-float',
        'flex flex-col',
      )}
      style={{
        left: win.position.x,
        top: win.position.y,
        width: win.size.width,
        height: win.size.height,
        zIndex: win.zIndex,
      }}
      initial={{ opacity: 0, scale: 0.92, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: 20 }}
      transition={springTransition}
      onPointerDown={() => focusWindow(win.id)}
      onPointerMove={(e) => {
        handleDragMove(e);
        handleResizeMove(e);
      }}
      onPointerUp={() => {
        handleDragEnd();
        handleResizeEnd();
      }}
    >
      <TitleBar
        title={win.title}
        onClose={() => closeWindow(win.id)}
        onMinimize={() => minimizeWindow(win.id)}
        onPointerDown={handleDragStart}
      />

      {/* Content area */}
      <div className="flex-1 overflow-auto">{children}</div>

      {/* Resize handles */}
      {(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as ResizeDirection[]).map(
        (dir) => (
          <ResizeHandle
            key={dir}
            direction={dir}
            onPointerDown={handleResizeStart}
          />
        ),
      )}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Windows Container                                                  */
/* ------------------------------------------------------------------ */

export function WindowsContainer({
  renderContent,
}: {
  renderContent: (win: WindowState) => ReactNode;
}) {
  const { windows } = useWindowManager();
  const visibleWindows = windows.filter((w) => !w.isMinimized);

  return (
    <AnimatePresence mode="popLayout">
      {visibleWindows.map((win) => (
        <Window key={win.id} window={win}>
          {renderContent(win)}
        </Window>
      ))}
    </AnimatePresence>
  );
}
