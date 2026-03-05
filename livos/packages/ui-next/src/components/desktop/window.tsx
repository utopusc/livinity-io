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
  stiffness: 480,
  damping: 38,
  mass: 0.75,
};

/* ------------------------------------------------------------------ */
/*  Window Title Bar                                                   */
/* ------------------------------------------------------------------ */

type TitleBarProps = {
  title: string;
  isFocused: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onPointerDown: (e: ReactPointerEvent) => void;
};

function TitleBar({ title, isFocused, onClose, onMinimize, onPointerDown }: TitleBarProps) {
  const [hovering, setHovering] = useState(false);

  return (
    <div
      className={cn(
        'flex h-10 shrink-0 items-center px-3',
        'cursor-grab select-none active:cursor-grabbing',
        'border-b border-black/[0.05]',
        isFocused ? 'bg-white/80' : 'bg-neutral-50/80',
        'transition-colors duration-150',
      )}
      onPointerDown={onPointerDown}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {/* macOS-style window controls — left side */}
      <div
        className="flex items-center gap-1.5"
        onPointerDown={(e) => e.stopPropagation()}
        onMouseEnter={() => setHovering(true)}
      >
        {/* Close — red */}
        <button
          className={cn(
            'group flex h-2.5 w-2.5 items-center justify-center rounded-full',
            'transition-all duration-150',
            isFocused ? 'bg-[#ff5f57]' : 'bg-neutral-300',
          )}
          onClick={onClose}
          aria-label="Close window"
        >
          <X
            className={cn(
              'h-1.5 w-1.5 text-[#820005] transition-opacity duration-100',
              hovering && isFocused ? 'opacity-100' : 'opacity-0',
            )}
            strokeWidth={2.5}
          />
        </button>

        {/* Minimize — yellow */}
        <button
          className={cn(
            'group flex h-2.5 w-2.5 items-center justify-center rounded-full',
            'transition-all duration-150',
            isFocused ? 'bg-[#febc2e]' : 'bg-neutral-300',
          )}
          onClick={onMinimize}
          aria-label="Minimize window"
        >
          <Minus
            className={cn(
              'h-1.5 w-1.5 text-[#714e00] transition-opacity duration-100',
              hovering && isFocused ? 'opacity-100' : 'opacity-0',
            )}
            strokeWidth={2.5}
          />
        </button>
      </div>

      {/* Title — centered absolutely so dots don't affect it */}
      <span className="pointer-events-none absolute inset-x-0 text-center text-xs font-medium text-neutral-400">
        {title}
      </span>
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
  isFocused: boolean;
};

export function Window({ window: win, children, isFocused }: WindowProps) {
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
        'fixed flex flex-col overflow-hidden rounded-xl',
        'bg-white/95 backdrop-blur-xl',
        'border border-black/[0.06]',
        isFocused
          ? 'shadow-[0_8px_32px_oklch(0_0_0/0.12),0_2px_8px_oklch(0_0_0/0.06),0_0_0_0.5px_oklch(0_0_0/0.06)]'
          : 'shadow-[0_4px_16px_oklch(0_0_0/0.07),0_1px_4px_oklch(0_0_0/0.04),0_0_0_0.5px_oklch(0_0_0/0.04)]',
        'transition-shadow duration-200',
      )}
      style={{
        left: win.position.x,
        top: win.position.y,
        width: win.size.width,
        height: win.size.height,
        zIndex: win.zIndex,
      }}
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 10 }}
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
      data-no-context-menu
    >
      <TitleBar
        title={win.title}
        isFocused={isFocused}
        onClose={() => closeWindow(win.id)}
        onMinimize={() => minimizeWindow(win.id)}
        onPointerDown={handleDragStart}
      />

      {/* Content area */}
      <div className="relative flex-1 overflow-auto">{children}</div>

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
  const maxZIndex = visibleWindows.reduce(
    (max, w) => Math.max(max, w.zIndex),
    0,
  );

  return (
    <AnimatePresence mode="popLayout">
      {visibleWindows.map((win) => (
        <Window
          key={win.id}
          window={win}
          isFocused={win.zIndex === maxZIndex}
        >
          {renderContent(win)}
        </Window>
      ))}
    </AnimatePresence>
  );
}
