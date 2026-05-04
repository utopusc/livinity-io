'use client';
import { ReactNode } from 'react';
import type { Transition, UseInViewOptions, Variant } from 'motion/react';

import { InView } from '@/components/motion-primitives/in-view';

/**
 * Liv design-system entrance primitive.
 *
 * Thin wrapper over the existing `motion-primitives/in-view.tsx` (D-09: wrap,
 * don't rewrite). Fades opacity 0→1 and translates `y` px→0 over `duration`
 * with the `--liv-ease-out` curve (cubic-bezier(0.16, 1, 0.3, 1)).
 *
 * Consumers in P68-P75 compose this around cards, lists, and panels:
 * `<FadeIn delay={0.1}><Card .../></FadeIn>`.
 *
 * Per D-07, framer-motion `initial`/`animate`/`exit` overrides are accepted
 * via the `variantsOverride` slot so callers can fully customize the
 * variants; default behavior is the design-system fade-up.
 */
export type FadeInProps = {
  children: ReactNode;
  /** Delay (seconds) before the entrance animation begins. */
  delay?: number;
  /** Vertical translation distance in px (default 8). */
  y?: number;
  /** Duration in seconds (default 0.35 = `--liv-dur-normal`). */
  duration?: number;
  className?: string;
  /** Render-as element forwarded to `<InView>` (default `div`). */
  as?: React.ElementType;
  /** Animate only on first viewport entry. */
  once?: boolean;
  /** Override the in-view trigger options. */
  viewOptions?: UseInViewOptions;
  /** Per-variant overrides (D-07: framer-motion pass-through). */
  variantsOverride?: {
    hidden?: Variant;
    visible?: Variant;
  };
  /** Override the framer-motion transition entirely. */
  transition?: Transition;
};

export function FadeIn({
  children,
  delay = 0,
  y = 8,
  duration = 0.35,
  className,
  as = 'div',
  once,
  viewOptions,
  variantsOverride,
  transition,
}: FadeInProps) {
  const variants = {
    hidden: { opacity: 0, y, ...(variantsOverride?.hidden ?? {}) },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration, delay, ease: [0.16, 1, 0.3, 1] as const },
      ...(variantsOverride?.visible ?? {}),
    },
  };

  return (
    <InView
      variants={variants}
      transition={transition}
      viewOptions={viewOptions}
      as={as}
      once={once}
    >
      <div className={className}>{children}</div>
    </InView>
  );
}
