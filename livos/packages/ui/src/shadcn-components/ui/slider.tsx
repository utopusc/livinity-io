'use client'

import * as SliderPrimitive from '@radix-ui/react-slider'
import {cva, type VariantProps} from 'class-variance-authority'
import * as React from 'react'

import {cn} from '@/shadcn-lib/utils'

/*
 * Slider — shadcn-style Radix primitive (NEW in Phase 66 / DESIGN-07).
 *
 * Standard shadcn pattern: a thin styling wrapper around `@radix-ui/react-slider`.
 * Variants are routed via cva to per-slot descendant selectors so callers can swap
 * the entire surface with a single `variant="..."` prop.
 *
 * - default      — codebase-default brand colour for thumb/range, neutral track
 * - liv-slider   — Liv Design System v1: cyan track + cyan thumb + soft cyan glow
 *                  (per v31-DRAFT line 253; tokens from Plan 66-01).
 */

const sliderVariants = cva('relative flex w-full touch-none select-none items-center', {
	variants: {
		variant: {
			default:
				'[&_[data-slot=track]]:bg-surface-2 [&_[data-slot=range]]:bg-brand [&_[data-slot=thumb]]:bg-white [&_[data-slot=thumb]]:border-brand',
			'liv-slider':
				'[&_[data-slot=track]]:bg-[color:var(--liv-bg-elevated)] [&_[data-slot=range]]:bg-[color:var(--liv-accent-cyan)] [&_[data-slot=thumb]]:bg-[color:var(--liv-accent-cyan)] [&_[data-slot=thumb]]:border-[color:var(--liv-accent-cyan)] [&_[data-slot=thumb]]:shadow-[0_0_8px_rgba(77,208,225,0.4)]',
		},
	},
	defaultVariants: {
		variant: 'default',
	},
})

export type SliderVariant = NonNullable<VariantProps<typeof sliderVariants>['variant']>

const Slider = React.forwardRef<
	React.ElementRef<typeof SliderPrimitive.Root>,
	React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & VariantProps<typeof sliderVariants>
>(({className, variant, ...props}, ref) => (
	<SliderPrimitive.Root ref={ref} className={cn(sliderVariants({variant}), className)} {...props}>
		<SliderPrimitive.Track
			data-slot='track'
			className='relative h-1.5 w-full grow overflow-hidden rounded-full'
		>
			<SliderPrimitive.Range data-slot='range' className='absolute h-full' />
		</SliderPrimitive.Track>
		<SliderPrimitive.Thumb
			data-slot='thumb'
			className='block h-4 w-4 rounded-full border-2 ring-offset-background transition-transform focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/20 disabled:pointer-events-none disabled:opacity-50 hover:scale-110'
		/>
	</SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export {Slider, sliderVariants}
