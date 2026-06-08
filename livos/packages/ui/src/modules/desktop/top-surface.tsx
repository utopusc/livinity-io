// Phase 260.2 — TopSurface (PRESENTATIONAL crossfade container).
//
// ONE persistent fixed top-center container holding TWO always-mounted layers:
//   - the navbar pill (passed in as `navbar`)
//   - the displays strip (passed in as `strip`)
// We CROSSFADE between them with opacity + translateY. We do NOT mount/unmount
// via AnimatePresence — that mount/unmount thrash is exactly what caused the
// 260.1 jank + the morph-target flip. Both layers stay in the DOM; the hidden
// one is opacity:0 + pointer-events:none so clicks fall through to the desktop.
//
// Both layers are stacked in the SAME css-grid cell (col/row-start-1) so the
// container is self-sizing and the two layers overlap perfectly with no
// absolute-positioning coordinate math. Same split as displays-strip: this is
// presentational (mode + slots via props) so it renders identically in the real
// app and in the no-auth dev harness. See .planning/phases/260.2-.../CONTEXT.md §3.

import {motion} from 'framer-motion'
import type {ReactNode} from 'react'

export type TopSurfaceMode = 'navbar' | 'displays'

// Spring shared by both layers so they move as one choreographed swap.
const SWAP_SPRING = {type: 'spring', stiffness: 320, damping: 30} as const

export function TopSurface({
	mode,
	navbar,
	strip,
}: {
	mode: TopSurfaceMode
	navbar: ReactNode
	strip: ReactNode
}) {
	const showDisplays = mode === 'displays'

	return (
		<div className='pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center'>
			<div className='grid'>
				{/* Navbar layer — slides UP and away when displays show. */}
				<motion.div
					className='col-start-1 row-start-1 flex justify-center'
					initial={false}
					animate={showDisplays ? {y: -56, opacity: 0} : {y: 0, opacity: 1}}
					transition={SWAP_SPRING}
					style={{pointerEvents: showDisplays ? 'none' : 'auto'}}
					aria-hidden={showDisplays}
				>
					{navbar}
				</motion.div>

				{/* Displays layer — slides DOWN into place when shown. */}
				<motion.div
					className='col-start-1 row-start-1 flex justify-center'
					initial={false}
					animate={showDisplays ? {y: 0, opacity: 1} : {y: -24, opacity: 0}}
					transition={SWAP_SPRING}
					style={{pointerEvents: showDisplays ? 'auto' : 'none'}}
					aria-hidden={!showDisplays}
				>
					{strip}
				</motion.div>
			</div>
		</div>
	)
}
