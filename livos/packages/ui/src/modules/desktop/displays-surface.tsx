// Phase 260.2 — Displays surface (LIVE container).
//
// Wires the bare presentational strip (displays-strip.tsx) to the REAL app:
// tRPC displays.list/screenshot/close + the window manager. Each tile fetches
// its OWN ~2s screenshot (one query per tile component instance — the same
// rules-of-hooks-safe pattern as the 260.1 DisplayCard), so the container just
// maps displays.list → <LiveDisplayTile>. Rendered inside the navbar Displays
// surface in place of the old card grid.

import {motion} from 'framer-motion'
import {useEffect, useState} from 'react'

import {trpcReact} from '@/trpc/trpc'
import {useWindowManagerOptional} from '@/providers/window-manager'
import {DisplayTileView, type DisplayVM, stripVariants} from './displays-strip'

// displays.list record (mirrors the backend shape we read here). `name` is the
// user-facing label (falls back to the `:N` id when unset).
type DisplayRecord = {
	display: string
	name?: string
	width: number
	height: number
	running_apps: unknown[]
	last_input_at?: string
}

const ACTIVITY_WINDOW_MS = 3000

/**
 * The bare displays strip backed by live data. `open` gates polling (zero
 * requests while the surface is hidden). `dropMode`/`isOver` come from a
 * drag-dock in progress (later steps); default off for the plain surface.
 */
export function DisplaysSurfaceLive({
	open = true,
	dropMode = false,
	isOver = false,
	onActivate,
}: {
	open?: boolean
	dropMode?: boolean
	isOver?: boolean
	/** Called when a display is opened/recalled — lets the navbar return. */
	onActivate?: () => void
}) {
	const displaysQuery = trpcReact.displays.list.useQuery(undefined, {
		enabled: open,
		refetchInterval: 4000,
	})
	const displays = (displaysQuery.data?.displays ?? []) as DisplayRecord[]

	return (
		<motion.div
			variants={stripVariants}
			initial='hidden'
			animate='show'
			className='flex items-stretch justify-center gap-3'
		>
			{displays.length === 0 ? (
				<div className='grid h-[124px] w-[230px] place-items-center text-[12px] text-white/50'>No active displays</div>
			) : (
				displays.map((d) => (
					<LiveDisplayTile
						key={d.display}
						d={d}
						open={open}
						dropMode={dropMode}
						isOver={isOver}
						onActivate={onActivate}
						onClosed={() => void displaysQuery.refetch()}
					/>
				))
			)}
		</motion.div>
	)
}

function LiveDisplayTile({
	d,
	open,
	dropMode,
	isOver,
	onActivate,
	onClosed,
}: {
	d: DisplayRecord
	open: boolean
	dropMode: boolean
	isOver: boolean
	onActivate?: () => void
	onClosed: () => void
}) {
	const windowManager = useWindowManagerOptional()

	// Per-tile ~2s screenshot poll (independent query per tile instance).
	const shot = trpcReact.displays.screenshot.useQuery({display: d.display}, {enabled: open, refetchInterval: 2000})

	// Per-tile × close — server-side teardown; refetch so the tile drops.
	const closeMutation = trpcReact.displays.close.useMutation({onSettled: () => onClosed()})

	// 1s ticker so the AI/luse glow recency fades live between list polls.
	const [, setTick] = useState(0)
	useEffect(() => {
		const id = setInterval(() => setTick((t) => t + 1), 1000)
		return () => clearInterval(id)
	}, [])
	const active = !!d.last_input_at && Date.now() - Date.parse(d.last_input_at) < ACTIVITY_WINDOW_MS

	// Recall the display as the live interactive VNC window (254-03 contract),
	// then let the navbar return (close the surface).
	const recall = () => {
		windowManager?.openWindow(`DISPLAY_${d.display}`, '/', `Display ${d.display}`, '🖥️', undefined, {width: d.width, height: d.height})
		onActivate?.()
	}

	const vm: DisplayVM = {
		id: d.display,
		name: d.name || d.display,
		width: d.width,
		height: d.height,
		screenshotUrl: shot.data?.dataUrl,
		active,
	}

	// dropMode/isOver are accepted for future drag-dock styling; the presentational
	// tile already handles its own hover controls.
	void dropMode
	void isOver

	return (
		<DisplayTileView
			d={vm}
			onOpen={recall}
			onClose={() => closeMutation.mutate({display: d.display})}
			onRecallDragDown={recall}
		/>
	)
}
