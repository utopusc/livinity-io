/**
 * Liv design-system motion primitives — barrel export.
 *
 * Five named exports form the entire surface (D-06). Consumers in P68-P75
 * import from this module:
 *
 *   import { FadeIn, GlowPulse, SlideInPanel, TypewriterCaret, StaggerList }
 *     from '@/components/motion';
 *
 * Four are thin wrappers over `motion-primitives/*` (D-09: wrap, don't
 * rewrite). `TypewriterCaret` is the only genuinely new component.
 */
export { FadeIn } from './FadeIn';
export type { FadeInProps } from './FadeIn';

export { GlowPulse } from './GlowPulse';
export type { GlowPulseProps, GlowPulseColor } from './GlowPulse';

export { SlideInPanel } from './SlideInPanel';
export type { SlideInPanelProps, SlideInDirection } from './SlideInPanel';

export { TypewriterCaret } from './TypewriterCaret';
export type { TypewriterCaretProps } from './TypewriterCaret';

export { StaggerList } from './StaggerList';
export type { StaggerListProps } from './StaggerList';
