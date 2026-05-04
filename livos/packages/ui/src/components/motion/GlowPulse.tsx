'use client';
import { ReactNode } from 'react';
import type { Transition } from 'motion/react';

import { GlowEffect } from '@/components/motion-primitives/glow-effect';
import { cn } from '@/shadcn-lib/utils';

/**
 * Liv design-system breathing glow primitive.
 *
 * Wraps the existing `motion-primitives/glow-effect.tsx` (D-09) and exposes a
 * compact `color` knob mapped to the v31 accent trio. Used for reasoning
 * cards (`color="amber"`), agent-thinking states (`color="cyan"`), and rare
 * highlights (`color="violet"`).
 *
 * Color → hex mapping matches Plan 66-01 token values:
 *   - amber  → #ffbd38  → `--liv-accent-amber`
 *   - cyan   → #4dd0e1  → `--liv-accent-cyan`
 *   - violet → #a78bfa  → `--liv-accent-violet`
 *
 * Per D-07 the framer-motion `transition` override is accepted as pass-through.
 */
export type GlowPulseColor = 'amber' | 'cyan' | 'violet';

const colorMap: Record<GlowPulseColor, string> = {
  amber: '#ffbd38',
  cyan: '#4dd0e1',
  violet: '#a78bfa',
};

export type GlowPulseProps = {
  children?: ReactNode;
  /** Accent color from the v31 palette (default `amber`). */
  color?: GlowPulseColor;
  /** Animation mode forwarded to `GlowEffect` (default `breathe`). */
  mode?: 'pulse' | 'breathe' | 'static';
  /** Blur preset forwarded to `GlowEffect` (default `medium`). */
  blur?: 'softest' | 'soft' | 'medium' | 'strong' | 'stronger' | 'strongest' | 'none' | number;
  /** Pulse scale (default 1.0). */
  intensity?: number;
  /** Loop duration in seconds (default 3). */
  duration?: number;
  /** Wrapper className (the underlying glow itself is positioned absolutely). */
  className?: string;
  /** Override the glow-effect className target. */
  glowClassName?: string;
  /** D-07: framer-motion transition override. */
  transition?: Transition;
};

export function GlowPulse({
  children,
  color = 'amber',
  mode = 'breathe',
  blur = 'medium',
  intensity = 1,
  duration = 3,
  className,
  glowClassName,
  transition,
}: GlowPulseProps) {
  const hex = colorMap[color];

  return (
    <div className={cn('relative', className)}>
      <GlowEffect
        colors={[hex]}
        mode={mode}
        blur={blur}
        scale={intensity}
        duration={duration}
        transition={transition}
        className={glowClassName}
      />
      {children ? <div className='relative z-10'>{children}</div> : null}
    </div>
  );
}
