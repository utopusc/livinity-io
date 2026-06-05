// Phase 255-04 — merged Displays popover (cards + screenshot thumbs + folded
// windows rows).
//
// This is the single navbar display/windows surface (GOAL-255-DISPLAYS-POPOVER):
// it replaces BOTH the 254-04 top-edge hover strip (deleted in Task 4) AND the
// Phase 159 LayoutGrid windows-manager popover (folded in below). The TopBar
// renders this body inside a Radix PopoverContent; the 🖥️ trigger lives in
// top-bar.tsx and passes the Popover's open state via the `open` prop so the
// tRPC polls are gated (zero requests while closed — T-255-14).
//
// Each display card shows an auto-refreshing (~2s) JPEG screenshot thumbnail
// via displays.screenshot (plan 255-02) — NOT a live RFB socket
// (D-255-THUMBS-SCREENSHOT / T-255-13). Clicking a card opens the existing
// interactive VNC window (DISPLAY_:N openWindow, verbatim 254-03 contract).

import {useEffect, useState} from 'react'
import {AnimatePresence, motion, type PanInfo} from 'framer-motion'
import {Maximize2, X} from 'lucide-react'

import {trpcReact} from '@/trpc/trpc'
import {useWindowManagerOptional} from '@/providers/window-manager'
import {useIsMobile} from '@/hooks/use-is-mobile'
import {cn} from '@/shadcn-lib/utils'
import {WindowsManagerPanel} from './windows-manager-panel'

// Structural shape of a displays.list record. running_apps is a count list
// (its element type is irrelevant here — only `.length` is read), so the
// permissive `unknown[]` keeps the card decoupled from the backend element
// type while still type-checking `.length`.
//
// Phase 260.1 (SC-F) — `last_input_at` is the ISO timestamp of the latest
// luse/computer-use INPUT action on this display (Plan 01 surfaces it through
// displays.list). The card derives a live "AI is acting on this" pulse-glow
// from its recency (<~3s).
type DisplayRecord = {
	display: string
	width: number
	height: number
	running_apps: unknown[]
	last_input_at?: string
}

// Phase 260.1 (SC-F) — on-brand LivOS dark night accent for the activity glow
// (same #7aa2ff the navbar uses). Kept as rgb channels so the pulsing
// box-shadow keyframes can vary only the alpha.
const ACCENT_RGB = '122, 162, 255' // #7aa2ff
// A display "is active" (AI/luse acted on it) when its last input was within
// this window; the glow fades out once recency lapses.
const ACTIVITY_WINDOW_MS = 3000

/**
 * The merged popover body. `open` gates polling so we issue zero tRPC requests
 * while the popover is closed (mirrors active-displays-panel's `enabled: open`
 * pattern). Default true so a standalone render still works.
 */
export function DisplaysPopover({open = true}: {open?: boolean}) {
	const isMobile = useIsMobile()

	// Poll the active-displays list only while the popover is open so a display
	// created via computer_create_display (or a spawned WebApp, plan 255-03)
	// shows up within ~4s; do NOT poll while closed.
	const displaysQuery = trpcReact.displays.list.useQuery(undefined, {
		enabled: open,
		refetchInterval: 4000,
	})

	if (isMobile) return null

	const displays = (displaysQuery.data?.displays ?? []) as DisplayRecord[]

	return (
		// Phase 260.1 (SC-C) — widened from w-[360px] so the side-by-side
		// wrapping card row reads well (~2-3 cards abreast at w-[160px] each).
		<div className='flex max-h-[560px] w-[520px] flex-col gap-3 overflow-y-auto rounded-2xl border border-line bg-card-bg/78 p-3 backdrop-blur-2xl backdrop-saturate-150 dark:bg-black/55'>
			{/* ── Section A — Displays ─────────────────────────────────── */}
			<div className='flex flex-col gap-2'>
				<div className='text-[11px] font-semibold uppercase tracking-wide text-text-secondary'>
					Displays ({displays.length})
				</div>
				{displays.length === 0 ? (
					<p className='px-1 py-1.5 text-[12px] text-text-tertiary'>No active displays</p>
				) : (
					// Phase 260.1 (SC-C) — side-by-side wrapping flex row (was a
					// grid-cols-2 stack). Each card has a fixed basis so they sit
					// abreast and wrap.
					<div className='flex flex-wrap gap-2'>
						{displays.map((d) => (
							<DisplayCard
								key={d.display}
								d={d}
								open={open}
								onClosed={() => void displaysQuery.refetch()}
							/>
						))}
					</div>
				)}
			</div>

			{/* ── Section B — Docked windows (recall surface, Phase 260-04 / SC3) ─ */}
			<DockedWindowsSection />

			{/* ── Section C — Windows (folded-in Phase 159 panel) ──────── */}
			<div className='border-t border-line pt-1'>
				<WindowsManagerPanel />
			</div>
		</div>
	)
}

/**
 * Phase 260-04 (SC3) — recall-from-Displays surface.
 *
 * Lists every DOCKED (pinned) window. Clicking a row RECALLS it via
 * `windowManager.unpinWindowFromTopBar(w.id)` — which re-expands the
 * still-mounted window so its server-side x11vnc stream is reused (NEVER
 * `closeWindow`, which would tear the stream down). Hidden entirely when no
 * window is docked so the popover stays compact.
 */
function DockedWindowsSection() {
	const windowManager = useWindowManagerOptional()
	const docked = (windowManager?.windows ?? []).filter((w) => w.isPinnedToTopBar)
	if (docked.length === 0) return null

	return (
		<div className='flex flex-col gap-2 border-t border-line pt-2'>
			<div className='text-[11px] font-semibold uppercase tracking-wide text-text-secondary'>
				Docked ({docked.length})
			</div>
			<div className='flex flex-col gap-1'>
				{docked.map((w) => (
					<button
						key={w.id}
						type='button'
						// Recall = unpin only (stream stays alive — never closeWindow).
						onClick={() => windowManager?.unpinWindowFromTopBar(w.id)}
						className={cn(
							'flex items-center gap-2 rounded-md border border-line px-2 py-1.5 text-left transition-colors',
							'hover:border-line-strong hover:bg-[color:var(--bg-2)]',
						)}
						title={`Recall ${w.title}`}
					>
						<span
							className='inline-block h-5 w-5 shrink-0 rounded bg-cover bg-center'
							style={w.icon ? {backgroundImage: `url(${w.icon})`} : undefined}
							aria-hidden
						/>
						<span className='min-w-0 flex-1 truncate text-[13px] font-medium' title={w.title}>
							{w.title}
						</span>
						<span className='shrink-0 rounded px-1.5 py-0.5 text-[11px] text-[color:var(--fg-dim)]'>
							Recall
						</span>
					</button>
				))}
			</div>
		</div>
	)
}

/**
 * One display card with its own ~2s screenshot poll (scoped per-card so each
 * card's query is independent).
 *
 * Phase 260.1:
 *  • SC-C — root is a `motion.div` (was a plain <button>) so the × close and
 *    fullscreen controls can be SIBLINGS of the clickable thumbnail (no nested
 *    buttons). `whileHover={{translateY:-6}}` is the established hover-lift.
 *  • SC-D — a hover-revealed × tears the display down server-side via
 *    displays.close (works even when no DISPLAY_ window is open), then refetches
 *    the list so the card disappears + the badge decrements.
 *  • SC-E — the card is draggable to the desktop to recall the display as a
 *    window, and a fullscreen control opens it; the thumbnail click-to-open
 *    (254-03 contract) is retained as the recall fallback (Task 2).
 *  • SC-F — when `last_input_at` is within ~3s the card pulses an on-brand
 *    edge glow that fades when idle.
 */
function DisplayCard({d, open, onClosed}: {d: DisplayRecord; open: boolean; onClosed: () => void}) {
	const windowManager = useWindowManagerOptional()

	// ~2s auto-refreshing JPEG thumbnail (D-255-THUMBS-SCREENSHOT): screenshot
	// polling, NEVER an RFB / WebSocket socket. Live VNC happens only on the
	// explicit card click below.
	const shot = trpcReact.displays.screenshot.useQuery(
		{display: d.display},
		{enabled: open, refetchInterval: 2000},
	)

	// SC-D — per-card × close. Calls the backend directly (Plan 02
	// displays.close) so it works even when no DISPLAY_ window is open; the
	// server enforces owner-scope (T-260.1-10). Optimistically refetch the list
	// on settle so the card drops + badge decrements.
	const closeMutation = trpcReact.displays.close.useMutation({
		onSettled: () => onClosed(),
	})

	// SC-F — 1s ticker so the glow recency re-evaluates (and fades out) live,
	// even between the ~4s displays.list polls.
	const [, setTick] = useState(0)
	useEffect(() => {
		const id = setInterval(() => setTick((t) => t + 1), 1000)
		return () => clearInterval(id)
	}, [])
	const active = !!d.last_input_at && Date.now() - Date.parse(d.last_input_at) < ACTIVITY_WINDOW_MS

	// SC-E — recall the display to the desktop as the live interactive VNC
	// window (254-03 contract), sized to its real WxH. A fresh
	// openWindow(DISPLAY_:N) re-attaches the live `:N` stream by the verbatim
	// 254-03 contract, so opening IS a correct recall for a non-pinned display.
	// Shared by: the thumbnail click (fallback), the drag-to-desktop gesture,
	// and the per-card fullscreen button.
	const recall = () => {
		windowManager?.openWindow(`DISPLAY_${d.display}`, '/', `Display ${d.display}`, '🖥️', undefined, {width: d.width, height: d.height})
	}

	// SC-E — recall-by-drag. The popover floats near the top-right, so a
	// downward drag of meaningful distance reads as "drag onto the desktop".
	// Framer suppresses the thumbnail click when a real drag occurs, so the
	// non-drag tap (recall fallback) still works.
	const handleDragEnd = (_e: unknown, info: PanInfo) => {
		if (info.offset.y > 80) recall()
	}

	return (
		<motion.div
			className='group relative w-[160px]'
			whileHover={{translateY: -6}}
			transition={{type: 'spring', stiffness: 500, damping: 28}}
			// SC-E recall-by-drag: drag the card down onto the desktop to recall
			// the display as a window; snaps back otherwise. Bounce matches the
			// established badge spring family (stiffness ~500) so it reads native.
			drag
			dragSnapToOrigin
			dragElastic={0.2}
			dragTransition={{bounceStiffness: 500, bounceDamping: 28}}
			onDragEnd={handleDragEnd}
		>
			{/* SC-F — animated edge glow gated on the `active` recency flag.
			    Absolute overlay matching the card radius, pointer-events-none so
			    it never intercepts clicks/drag; wrapped in AnimatePresence so it
			    fades out when activity lapses. On-brand #7aa2ff accent. */}
			<AnimatePresence>
				{active && (
					<motion.div
						key='glow'
						className='pointer-events-none absolute inset-0 z-10 rounded-xl'
						initial={{opacity: 0}}
						animate={{
							opacity: 1,
							boxShadow: [
								`0 0 0 0 rgba(${ACCENT_RGB}, 0.0)`,
								`0 0 0 3px rgba(${ACCENT_RGB}, 0.55)`,
								`0 0 0 0 rgba(${ACCENT_RGB}, 0.0)`,
							],
						}}
						exit={{opacity: 0}}
						transition={{
							boxShadow: {duration: 1.4, repeat: Infinity, ease: 'easeInOut'},
							opacity: {duration: 0.3},
						}}
						aria-hidden
					/>
				)}
			</AnimatePresence>

			{/* Clickable thumbnail area — the card-click-to-open contract
			    (254-03) stays the click target. */}
			<button
				type='button'
				onClick={recall}
				className={cn(
					'flex w-full flex-col gap-1.5 rounded-xl border border-line p-2 text-left transition-colors',
					'hover:border-line-strong hover:bg-[color:var(--bg-2)]',
				)}
				title={`Open display ${d.display} (${d.width}×${d.height})`}
			>
				<div className='aspect-video w-full overflow-hidden rounded-lg bg-[color:var(--bg-2)]'>
					{shot.data?.dataUrl ? (
						<img
							src={shot.data.dataUrl}
							alt={`Display ${d.display}`}
							className='h-full w-full object-cover'
							draggable={false}
						/>
					) : (
						<div className='grid h-full w-full place-items-center text-[18px] opacity-40' aria-hidden>
							🖥️
						</div>
					)}
				</div>
				<div className='flex flex-col'>
					<span className='text-[12px] font-medium text-[color:var(--fg)]'>{d.display}</span>
					<span className='text-[10.5px] text-text-tertiary'>
						{d.width}×{d.height} · {d.running_apps.length} app(s)
					</span>
				</div>
			</button>

			{/* SC-E — hover-revealed fullscreen control (top-left). Card-fullscreen
			    behavior (chosen): ONE click RECALLS/opens the display as a live
			    window on the desktop. Browser-fullscreen itself is then one more
			    click on the window's own chrome fullscreen button (Plan 04 +
			    window.tsx Task 3) — resolving the freshly-opened content element
			    here by query is fragile, so we hand off to the chrome button
			    whose ref is the real content element. */}
			<button
				type='button'
				aria-label='Fullscreen display'
				title='Open display (then use the window fullscreen button)'
				onClick={(e) => {
					e.stopPropagation()
					recall()
				}}
				className={cn(
					'absolute left-1 top-1 z-20 flex h-6 w-6 items-center justify-center rounded-full',
					'border border-line bg-card-bg/90 text-text-secondary shadow-sm backdrop-blur',
					'opacity-0 transition-opacity group-hover:opacity-100',
					'hover:border-line-strong hover:bg-[color:var(--bg-2)]',
				)}
			>
				<Maximize2 className='h-3.5 w-3.5' strokeWidth={2.5} />
			</button>

			{/* SC-D — hover-revealed × close (top-right). stopPropagation so it
			    never triggers the thumbnail's recall click. */}
			<button
				type='button'
				aria-label='Close display'
				title='Close display'
				onClick={(e) => {
					e.stopPropagation()
					closeMutation.mutate({display: d.display})
				}}
				className={cn(
					'absolute right-1 top-1 z-20 flex h-6 w-6 items-center justify-center rounded-full',
					'border border-line bg-card-bg/90 text-text-secondary shadow-sm backdrop-blur',
					'opacity-0 transition-opacity group-hover:opacity-100',
					'hover:border-destructive/80 hover:bg-destructive hover:text-white',
				)}
			>
				<X className='h-3.5 w-3.5' strokeWidth={2.5} />
			</button>
		</motion.div>
	)
}
