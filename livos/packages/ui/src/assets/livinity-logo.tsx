import {forwardRef, SVGProps} from 'react'

/**
 * Canonical Livinity mark — the donut (per Downloads/logo.html, 2026-05-15).
 *
 * The mark is a solid circle with a centred hole. Uses `currentColor` for the
 * outer ring so it inherits text colour from its parent, and an inner cut-out
 * filled with `var(--bg)` so it inverts cleanly on dark surfaces.
 *
 * Replaces the previous Phosphor "ai brain" silhouette. All existing
 * consumers (`<LivinityLogo />`) keep working — the export shape and ref-
 * forwarding is preserved.
 */
const ForwardedSvgComponent = ({style, width = 96, ...props}: SVGProps<SVGSVGElement>, ref: React.Ref<SVGSVGElement>) => (
	<svg
		xmlns='http://www.w3.org/2000/svg'
		width={width}
		viewBox='0 0 32 32'
		fill='none'
		{...props}
		style={{
			...style,
			viewTransitionName: 'livinity-logo',
		}}
		ref={ref}
	>
		{/* Outer ring — inherits text colour from the parent. */}
		<circle cx='16' cy='16' r='16' fill='currentColor' />
		{/* Inner hole — uses the page background token so it inverts in dark mode. */}
		<circle cx='16' cy='16' r='8.6' fill='var(--bg, #ffffff)' />
	</svg>
)
export default forwardRef(ForwardedSvgComponent)
