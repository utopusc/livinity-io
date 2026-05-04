'use client';
import React, { ReactNode } from 'react';
import type { Variants } from 'motion/react';

import { AnimatedGroup } from '@/components/motion-primitives/animated-group';

/**
 * Liv design-system staggered list primitive.
 *
 * Wraps `motion-primitives/animated-group.tsx` (D-09) with a 50ms-staggered
 * default preset (per D-06). Used by P69 tool list, P75 reasoning cards, and
 * any other phase that renders a sequential cluster of children.
 *
 * Default child entrance: opacity 0→1, y 8→0 over 350ms.
 *
 * Per D-07 the framer-motion `variantsOverride` slot accepts container/item
 * variant overrides that merge on top of the default preset.
 */
export type StaggerListProps = {
  children: ReactNode;
  className?: string;
  /** Stagger between children, in milliseconds (default 50ms = D-06). */
  staggerMs?: number;
  /** Optional initial delay before the first child appears, in seconds. */
  delaySeconds?: number;
  /** Duration of each child entrance, in seconds (default 0.35). */
  itemDuration?: number;
  /** Vertical translation distance for each child, in px (default 8). */
  y?: number;
  /** Render-as element forwarded to `AnimatedGroup` (default `div`). */
  as?: React.ElementType;
  /** Render-as for each child wrapper (default `div`). */
  asChild?: React.ElementType;
  /** D-07: variant overrides merged on top of the preset. */
  variantsOverride?: {
    container?: Variants;
    item?: Variants;
  };
};

export function StaggerList({
  children,
  className,
  staggerMs = 50,
  delaySeconds = 0,
  itemDuration = 0.35,
  y = 8,
  as = 'div',
  asChild = 'div',
  variantsOverride,
}: StaggerListProps) {
  const staggerSeconds = staggerMs / 1000; // 0.05 by default (50ms per D-06)

  const containerVariants: Variants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: staggerSeconds,
        delayChildren: delaySeconds,
        ...(variantsOverride?.container?.visible &&
        typeof variantsOverride.container.visible === 'object'
          ? (variantsOverride.container.visible as Record<string, unknown>).transition ?? {}
          : {}),
      },
      ...(variantsOverride?.container?.visible &&
      typeof variantsOverride.container.visible === 'object'
        ? variantsOverride.container.visible
        : {}),
    },
    ...(variantsOverride?.container ?? {}),
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: itemDuration, ease: [0.16, 1, 0.3, 1] as const },
    },
    ...(variantsOverride?.item ?? {}),
  };

  return (
    <AnimatedGroup
      className={className}
      as={as}
      asChild={asChild}
      variants={{ container: containerVariants, item: itemVariants }}
    >
      {children}
    </AnimatedGroup>
  );
}
