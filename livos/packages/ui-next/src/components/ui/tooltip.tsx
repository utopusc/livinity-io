'use client';

import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom';
  className?: string;
  delay?: number;
}

function Tooltip({ content, children, side = 'top', className, delay = 300 }: TooltipProps) {
  const [open, setOpen] = useState(false);
  let timer: ReturnType<typeof setTimeout>;

  const show = () => {
    timer = setTimeout(() => setOpen(true), delay);
  };

  const hide = () => {
    clearTimeout(timer);
    setOpen(false);
  };

  return (
    <span
      className="relative inline-flex"
      onPointerEnter={show}
      onPointerLeave={hide}
    >
      {children}
      <AnimatePresence>
        {open && (
          <motion.span
            className={cn(
              'absolute left-1/2 z-[var(--z-tooltip)] whitespace-nowrap',
              'rounded-lg bg-neutral-900 px-2.5 py-1 text-caption text-white shadow-md',
              side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
              className,
            )}
            initial={{ opacity: 0, x: '-50%', y: side === 'top' ? 4 : -4 }}
            animate={{ opacity: 1, x: '-50%', y: 0 }}
            exit={{ opacity: 0, x: '-50%', y: side === 'top' ? 4 : -4 }}
            transition={{ duration: 0.15 }}
          >
            {content}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

export { Tooltip };
