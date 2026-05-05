/**
 * Phase 76 Plan 76-05 — Tour spotlight overlay.
 *
 * Renders a full-viewport SVG dim layer with a transparent rectangular
 * cutout aligned to the active step's anchor element. When `targetSelector`
 * is omitted OR the element is not in the DOM, the SVG renders as a fully
 * opaque dim — naturally producing a "darken everything" backdrop for the
 * centered welcome / done modal steps.
 *
 * Implementation notes (per 76-05 PLAN <action>):
 *   - `useLayoutEffect` (NOT `useEffect`) so the rect is measured before
 *     paint — prevents single-frame flicker.
 *   - resize/scroll listeners are throttled via `requestAnimationFrame` —
 *     mitigates T-76-05-03 (DoS via scroll loop).
 *   - `pointer-events-none` lets the user still scroll / click underneath
 *     the cutout — the tour tooltip handles its own interactivity.
 *   - Color: `rgba(5, 11, 20, 0.8)` matches `--liv-bg-deep` at 80% opacity
 *     (Phase 66 D-04 token).
 */

import {useLayoutEffect, useRef, useState} from 'react'

export type SpotlightProps = {
	/** CSS selector for the anchor element. Omit / null for centered modal steps. */
	targetSelector?: string | null
	/** Padding (px) around the target rect for the cutout. Default 8. */
	padding?: number
	/** Corner radius (px) of the cutout. Default 12. */
	cornerRadius?: number
}

const DIM_FILL = 'rgba(5, 11, 20, 0.8)'

export function Spotlight({
	targetSelector,
	padding = 8,
	cornerRadius = 12,
}: SpotlightProps) {
	const [rect, setRect] = useState<DOMRect | null>(null)
	const rafRef = useRef<number | null>(null)

	useLayoutEffect(() => {
		if (!targetSelector) {
			setRect(null)
			return
		}

		const el = document.querySelector(targetSelector)
		if (!el) {
			// Production-safe degradation: log + render full-dim modal.
			// eslint-disable-next-line no-console
			console.warn(`[LivTour] target not found: ${targetSelector}`)
			setRect(null)
			return
		}

		const measure = () => {
			setRect(el.getBoundingClientRect())
		}

		// rAF-throttled handler so a noisy scroll/resize stream collapses to
		// at most one measurement per frame.
		const schedule = () => {
			if (rafRef.current !== null) return
			rafRef.current = window.requestAnimationFrame(() => {
				rafRef.current = null
				measure()
			})
		}

		measure()
		window.addEventListener('resize', schedule)
		window.addEventListener('scroll', schedule, true)

		return () => {
			window.removeEventListener('resize', schedule)
			window.removeEventListener('scroll', schedule, true)
			if (rafRef.current !== null) {
				window.cancelAnimationFrame(rafRef.current)
				rafRef.current = null
			}
		}
	}, [targetSelector])

	const maskId = 'liv-tour-mask'

	return (
		<svg
			role='presentation'
			aria-hidden='true'
			className='pointer-events-none fixed inset-0 z-[1000]'
			width='100%'
			height='100%'
		>
			<defs>
				<mask id={maskId}>
					{/* white = visible (dim layer renders here) */}
					<rect x='0' y='0' width='100%' height='100%' fill='white' />
					{rect && (
						<rect
							x={rect.left - padding}
							y={rect.top - padding}
							width={rect.width + padding * 2}
							height={rect.height + padding * 2}
							rx={cornerRadius}
							ry={cornerRadius}
							fill='black'
						/>
					)}
				</mask>
			</defs>
			<rect
				x='0'
				y='0'
				width='100%'
				height='100%'
				fill={DIM_FILL}
				mask={`url(#${maskId})`}
			/>
		</svg>
	)
}
