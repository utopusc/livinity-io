'use client';
import { ReactNode } from 'react';
import type { Transition, Variant } from 'motion/react';

import { TransitionPanel } from '@/components/motion-primitives/transition-panel';

/**
 * Liv design-system directional panel entrance.
 *
 * Composes the existing `motion-primitives/transition-panel.tsx` (D-09)
 * with a directional preset. Used by P68 side panel and any drawer-style
 * surface that slides in from a screen edge.
 *
 * Direction map (per 66-02-PLAN <interfaces>):
 *   - right  → enter from `x: 100%`,  exit to `x: 100%`
 *   - left   → enter from `x: -100%`, exit to `x: -100%`
 *   - top    → enter from `y: -100%`, exit to `y: -100%`
 *   - bottom → enter from `y: 100%`,  exit to `y: 100%`
 *
 * Per D-07 framer-motion `variantsOverride` and `transition` are passed
 * through so consumers can customize per-key overrides.
 */
export type SlideInDirection = 'right' | 'left' | 'top' | 'bottom';

const directionMap: Record<
  SlideInDirection,
  { enter: Variant; center: Variant; exit: Variant }
> = {
  right: {
    enter: { x: '100%', opacity: 0 },
    center: { x: 0, opacity: 1 },
    exit: { x: '100%', opacity: 0 },
  },
  left: {
    enter: { x: '-100%', opacity: 0 },
    center: { x: 0, opacity: 1 },
    exit: { x: '-100%', opacity: 0 },
  },
  top: {
    enter: { y: '-100%', opacity: 0 },
    center: { y: 0, opacity: 1 },
    exit: { y: '-100%', opacity: 0 },
  },
  bottom: {
    enter: { y: '100%', opacity: 0 },
    center: { y: 0, opacity: 1 },
    exit: { y: '100%', opacity: 0 },
  },
};

export type SlideInPanelProps = {
  /** Direction the panel enters from (required). */
  from: SlideInDirection;
  /**
   * Single child — the panel content. Internally wrapped in an array because
   * `TransitionPanel` keys children by `activeIndex`.
   */
  children: ReactNode;
  className?: string;
  /** Duration in seconds (default 0.35 = `--liv-dur-normal`). */
  duration?: number;
  /** D-07: per-variant overrides merged on top of the directional preset. */
  variantsOverride?: {
    enter?: Variant;
    center?: Variant;
    exit?: Variant;
  };
  /** D-07: full transition override. */
  transition?: Transition;
};

export function SlideInPanel({
  from,
  children,
  className,
  duration = 0.35,
  variantsOverride,
  transition,
}: SlideInPanelProps) {
  const base = directionMap[from];
  const variants = {
    enter: { ...base.enter, ...(variantsOverride?.enter ?? {}) },
    center: { ...base.center, ...(variantsOverride?.center ?? {}) },
    exit: { ...base.exit, ...(variantsOverride?.exit ?? {}) },
  };

  const resolvedTransition: Transition =
    transition ?? { duration, ease: [0.16, 1, 0.3, 1] };

  return (
    <TransitionPanel
      activeIndex={0}
      variants={variants}
      transition={resolvedTransition}
      className={className}
    >
      {[children]}
    </TransitionPanel>
  );
}
