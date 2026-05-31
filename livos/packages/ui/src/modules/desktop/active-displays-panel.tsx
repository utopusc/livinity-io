// Phase 254-04 — Active Displays hover-reveal strip.
//
// Locked decision #2: this panel lists ACTIVE X DISPLAYS ONLY
// (displays.list / displayManager.list()) — the `:1` host plus any
// `:11`/`:12` created via the luse MCP display-creation tool. It does NOT
// read the window-manager window list, does NOT enumerate per-window
// inventory, and never shows LivOS app windows. A display is the
// VNC-renderable unit.
//
// Moving the cursor to the very top edge reveals a drop-down strip; each
// row shows `:N`, `WxH`, and a running-app count. Clicking a row opens a
// live interactive VNC window (Plan 03's X11DisplayStreamWindow via the
// `DISPLAY_:N` appId) sized to the display's real WxH using Plan 03's
// trailing `suggested` openWindow param. The strip polls while open so
// newly-created displays appear within ~4s, and never polls while closed.

import {useState} from 'react'
import {AnimatePresence, motion} from 'framer-motion'

import {trpcReact} from '@/trpc/trpc'
import {useWindowManagerOptional} from '@/providers/window-manager'
import {useIsMobile} from '@/hooks/use-is-mobile'
import {cn} from '@/shadcn-lib/utils'

export function ActiveDisplaysPanel() {
	const isMobile = useIsMobile()
	const [open, setOpen] = useState(false)
	const windowManager = useWindowManagerOptional()

	// Poll while open so a display created via computer_create_display shows
	// up within ~4s; do NOT poll while closed (enabled gated on `open`).
	const displaysQuery = trpcReact.displays.list.useQuery(undefined, {
		enabled: open,
		refetchInterval: 4000,
	})

	if (isMobile) return null

	const displays = displaysQuery.data?.displays ?? []

	return (
		<>
			{/* Invisible top-edge hot-zone: hovering it reveals the strip. */}
			<div
				className='pointer-events-auto fixed inset-x-0 top-0 z-[60] h-2'
				onMouseEnter={() => setOpen(true)}
				aria-hidden
			/>

			<AnimatePresence>
				{open && (
					<motion.div
						key='active-displays-strip'
						initial={{translateY: -24, opacity: 0}}
						animate={{translateY: 0, opacity: 1}}
						exit={{translateY: -24, opacity: 0}}
						transition={{type: 'spring', stiffness: 300, damping: 26}}
						onMouseLeave={() => setOpen(false)}
						className='fixed inset-x-0 top-0 z-[55] flex justify-center px-6 pt-3'
						role='region'
						aria-label='Active displays'
					>
						<div className='pointer-events-auto flex max-w-[1180px] flex-col gap-2 rounded-2xl border border-line bg-card-bg/78 px-4 py-3 backdrop-blur-2xl backdrop-saturate-150 dark:bg-black/55'>
							<div className='text-[11px] font-semibold uppercase tracking-wide text-text-secondary'>
								Active Displays ({displays.length})
							</div>
							{displays.length === 0 ? (
								<p className='px-1 py-1.5 text-[12px] text-text-tertiary'>No active displays</p>
							) : (
								<div className='flex flex-wrap items-center gap-2'>
									{displays.map((d) => (
										<button
											key={d.display}
											type='button'
											onClick={() => {
												// Open the display as a live interactive VNC window
												// (Plan 03), sized to its real WxH via the trailing
												// `suggested` openWindow param.
												windowManager?.openWindow(`DISPLAY_${d.display}`, '/', `Display ${d.display}`, '🖥️', undefined, {width: d.width, height: d.height})
												setOpen(false)
											}}
											className={cn(
												'flex items-center gap-2.5 rounded-xl border border-line px-3 py-2 text-left transition-colors',
												'hover:border-line-strong hover:bg-[color:var(--bg-2)]',
											)}
											title={`Open display ${d.display} (${d.width}×${d.height})`}
										>
											<span aria-hidden className='text-[16px]'>🖥️</span>
											<span className='flex flex-col'>
												<span className='text-[13px] font-medium text-[color:var(--fg)]'>
													{d.display}
												</span>
												<span className='text-[11px] text-text-tertiary'>
													{d.width}×{d.height} · {d.running_apps.length} app(s)
												</span>
											</span>
										</button>
									))}
								</div>
							)}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</>
	)
}
