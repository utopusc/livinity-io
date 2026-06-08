// Phase 260.2 — Displays strip (PRESENTATIONAL).
//
// A bare, side-by-side row of live display thumbnails. NO card chrome, NO
// background panel, NO metadata text — just the displays, labelled by NAME.
// Data + callbacks come via PROPS (no tRPC here) so the SAME component renders
// in the real app (container wires tRPC + windowManager) AND in the no-auth dev
// harness (mock data). This split is what makes the choreography testable
// without a login (see .planning/phases/260.2-.../CONTEXT.md §5).

import {AnimatePresence, motion, type PanInfo, type Transition, type Variants} from 'framer-motion'
import {useRef} from 'react'
import {GripHorizontal, Monitor, X} from 'lucide-react'

import {cn} from '@/shadcn-lib/utils'

export type DisplayVM = {
	/** Unique display id — the `:N` string in the real app. */
	id: string
	/** User-facing name (shown instead of the port). */
	name: string
	width: number
	height: number
	/** Latest ~2s screenshot data URL, if available. */
	screenshotUrl?: string
	/** AI / luse is actively driving this display (last_input_at < ~3s) → glow. */
	active?: boolean
	/**
	 * Framer shared-layout id (R3 morph). When a dragged stream window with the
	 * SAME layoutId unmounts as this tile mounts, Framer morphs the window box
	 * into this tile — the "window shrinks into a thumbnail" transform. Optional;
	 * only set on a tile that was just docked from a window.
	 */
	morphLayoutId?: string
}

// On-brand LivOS night accent for the activity glow.
const ACCENT_RGB = '122, 162, 255' // #7aa2ff

export const stripVariants: Variants = {
	hidden: {},
	show: {transition: {staggerChildren: 0.06, delayChildren: 0.02}},
}
const tileVariants: Variants = {
	hidden: {opacity: 0, scale: 0.86, y: 12},
	show: {opacity: 1, scale: 1, y: 0, transition: {type: 'spring', stiffness: 420, damping: 30}},
}

export type DisplaysStripViewProps = {
	displays: DisplayVM[]
	/** A drag-dock is in progress → tiles are a pure drop backdrop (non-interactive). */
	dropMode?: boolean
	/** The cursor is over the strip during a drag (highlight the dock / placeholder). */
	isOver?: boolean
	/** Click / tap a tile → open (recall) the display. */
	onOpen?: (d: DisplayVM) => void
	/** × → close (tear down) the display. */
	onClose?: (d: DisplayVM) => void
	/** Fullscreen control. */
	onFullscreen?: (d: DisplayVM) => void
	/** Tile dragged DOWN past the threshold (toolbar grab) → recall to a window. */
	onRecallDragDown?: (d: DisplayVM, info: PanInfo) => void
	/** Override the window↔tile morph (R3) layout-animation timing. */
	morphTransition?: Transition
}

// Default morph feel: a crisp spring that reads as the window "settling" into
// the strip (~500ms). Override via `morphTransition` (e.g. slow it for debugging).
const DEFAULT_MORPH: Transition = {type: 'spring', stiffness: 420, damping: 34}

export function DisplaysStripView({
	displays,
	dropMode = false,
	isOver = false,
	onOpen,
	onClose,
	onRecallDragDown,
	morphTransition,
}: DisplaysStripViewProps) {
	return (
		<motion.div
			variants={stripVariants}
			initial='hidden'
			animate='show'
			className={cn(
				'flex items-stretch justify-center gap-3',
				// During a drag-dock the tiles must NOT be individually clickable
				// (a drop's mouseup would also fire a tile click → double-open).
				dropMode && 'pointer-events-none',
			)}
		>
			{displays.length === 0 ? (
				dropMode ? (
					<motion.div
						variants={tileVariants}
						className={cn(
							'grid h-[124px] w-[230px] place-items-center rounded-2xl border-2 border-dashed transition-colors',
							isOver
								? 'border-white/80 bg-white/10 text-white'
								: 'border-white/25 text-white/70',
						)}
					>
						<div className='flex flex-col items-center gap-2'>
							<Monitor className='h-6 w-6 opacity-80' />
							<span className='text-[12px] font-medium'>Drag here</span>
						</div>
					</motion.div>
				) : (
					<div className='grid h-[124px] w-[230px] place-items-center text-[12px] text-white/50'>
						No active displays
					</div>
				)
			) : (
				displays.map((d) => (
					<DisplayTileView
						key={d.id}
						d={d}
						morphTransition={morphTransition ?? DEFAULT_MORPH}
						onOpen={onOpen}
						onClose={onClose}
						onRecallDragDown={onRecallDragDown}
					/>
				))
			)}
		</motion.div>
	)
}

export function DisplayTileView({
	d,
	morphTransition,
	onOpen,
	onClose,
	onRecallDragDown,
}: {
	d: DisplayVM
	morphTransition?: Transition
	onOpen?: (d: DisplayVM) => void
	onClose?: (d: DisplayVM) => void
	onRecallDragDown?: (d: DisplayVM, info: PanInfo) => void
}) {
	// Drag-vs-click guard: a real drag (onDragStart fired) must not also fire the
	// thumbnail's click-open. Reset on every pointer-down so each interaction is
	// clean; onDragStart only fires once framer passes its movement threshold.
	const draggedRef = useRef(false)

	const handleClick = () => {
		if (draggedRef.current) {
			draggedRef.current = false
			return
		}
		onOpen?.(d)
	}
	const handleDragEnd = (_e: unknown, info: PanInfo) => {
		if (info.offset.y > 80) onRecallDragDown?.(d, info)
	}

	return (
		<motion.div
			variants={tileVariants}
			// R3 morph: a just-docked tile shares its layoutId with the stream
			// window that produced it, so Framer animates the window box shrinking
			// into this tile instead of a pop-in. Plain entrance for normal tiles.
			layoutId={d.morphLayoutId}
			className='group relative w-[212px] shrink-0'
			whileHover={{translateY: -6}}
			// hover uses the snappy spring; the layout (R3 morph) uses morphTransition.
			transition={{type: 'spring', stiffness: 500, damping: 28, layout: morphTransition}}
			// Recall-by-drag (R4): grab the tile (toolbar handle) and pull DOWN.
			drag
			dragSnapToOrigin
			dragElastic={0.2}
			dragTransition={{bounceStiffness: 500, bounceDamping: 28}}
			onPointerDown={() => {
				draggedRef.current = false
			}}
			onDragStart={() => {
				draggedRef.current = true
			}}
			onDragEnd={handleDragEnd}
		>
			{/* AI/luse activity glow — pulsing on-brand edge ring, fades when idle. */}
			<AnimatePresence>
				{d.active && (
					<motion.div
						key='glow'
						className='pointer-events-none absolute -inset-px z-10 rounded-2xl'
						initial={{opacity: 0}}
						animate={{
							opacity: 1,
							boxShadow: [
								`0 0 0 0 rgba(${ACCENT_RGB}, 0.0)`,
								`0 0 18px 3px rgba(${ACCENT_RGB}, 0.7)`,
								`0 0 0 0 rgba(${ACCENT_RGB}, 0.0)`,
							],
						}}
						exit={{opacity: 0}}
						transition={{
							boxShadow: {duration: 1.5, repeat: Infinity, ease: 'easeInOut'},
							opacity: {duration: 0.3},
						}}
						aria-hidden
					/>
				)}
			</AnimatePresence>

			{/* Bare thumbnail (no card chrome). */}
			<button
				type='button'
				onClick={handleClick}
				className={cn(
					'relative block aspect-video w-full overflow-hidden rounded-2xl text-left',
					'ring-1 ring-line/70 transition-[box-shadow] duration-200',
					'shadow-[0_12px_34px_-14px_rgba(0,0,0,0.6)] hover:ring-2 hover:ring-[color:var(--fg)]/15',
				)}
				title={d.name}
			>
				{d.screenshotUrl ? (
					<img src={d.screenshotUrl} alt={d.name} className='h-full w-full object-cover' draggable={false} />
				) : (
					<div className='grid h-full w-full place-items-center bg-[color:var(--bg-2)] text-[22px] opacity-40' aria-hidden>
						🖥️
					</div>
				)}

				{/* Name overlay — gradient scrim + NAME only. */}
				<span className='pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/75 via-black/25 to-transparent px-3 pb-2 pt-7 text-[12.5px] font-medium tracking-[-0.005em] text-white'>
					{d.name}
				</span>

				{d.active && (
					<span
						className='absolute right-2 top-2 h-2 w-2 rounded-full'
						style={{background: `rgb(${ACCENT_RGB})`, boxShadow: `0 0 8px rgb(${ACCENT_RGB})`}}
						aria-hidden
					/>
				)}
			</button>

			{/* Toolbar / drag handle (R4) — the grab region to pull the tile back
			    down into a window. Hover-revealed grip at the top edge. */}
			<div className='pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center pt-1 opacity-0 transition-opacity group-hover:opacity-100'>
				<span className='flex h-5 w-10 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white/80 backdrop-blur' aria-hidden>
					<GripHorizontal className='h-3.5 w-3.5' />
				</span>
			</div>

			{/* Phase 260.2 — fullscreen control REMOVED from strip tiles per operator
			    ("Pencereler bölümünden büyültmeyi kaldır"). Tiles keep × + drag handle. */}

			{/* Hover: × close (top-right). */}
			<button
				type='button'
				aria-label='Close display'
				title='Close display'
				onClick={(e) => {
					e.stopPropagation()
					onClose?.(d)
				}}
				className={cn(
					'absolute right-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-full',
					'border border-white/15 bg-black/45 text-white/90 shadow-sm backdrop-blur',
					'opacity-0 transition-opacity group-hover:opacity-100 hover:border-red-400/70 hover:bg-red-500 hover:text-white',
				)}
			>
				<X className='h-3.5 w-3.5' strokeWidth={2.5} />
			</button>
		</motion.div>
	)
}
