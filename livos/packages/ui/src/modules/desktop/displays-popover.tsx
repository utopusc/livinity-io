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

import {trpcReact} from '@/trpc/trpc'
import {useWindowManagerOptional} from '@/providers/window-manager'
import {useIsMobile} from '@/hooks/use-is-mobile'
import {cn} from '@/shadcn-lib/utils'
import {WindowsManagerPanel} from './windows-manager-panel'

// Structural shape of a displays.list record. running_apps is a count list
// (its element type is irrelevant here — only `.length` is read), so the
// permissive `unknown[]` keeps the card decoupled from the backend element
// type while still type-checking `.length`.
type DisplayRecord = {display: string; width: number; height: number; running_apps: unknown[]}

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
		<div className='flex max-h-[560px] w-[360px] flex-col gap-3 overflow-y-auto rounded-2xl border border-line bg-card-bg/78 p-3 backdrop-blur-2xl backdrop-saturate-150 dark:bg-black/55'>
			{/* ── Section A — Displays ─────────────────────────────────── */}
			<div className='flex flex-col gap-2'>
				<div className='text-[11px] font-semibold uppercase tracking-wide text-text-secondary'>
					Displays ({displays.length})
				</div>
				{displays.length === 0 ? (
					<p className='px-1 py-1.5 text-[12px] text-text-tertiary'>No active displays</p>
				) : (
					<div className='grid grid-cols-2 gap-2'>
						{displays.map((d) => (
							<DisplayCard key={d.display} d={d} open={open} />
						))}
					</div>
				)}
			</div>

			{/* ── Section B — Windows (folded-in Phase 159 panel) ──────── */}
			<div className='border-t border-line pt-1'>
				<WindowsManagerPanel />
			</div>
		</div>
	)
}

/**
 * One display card with its own ~2s screenshot poll (scoped per-card so each
 * card's query is independent). Clicking opens the live interactive VNC window
 * sized to the display's real WxH — verbatim 254-03 contract.
 */
function DisplayCard({d, open}: {d: DisplayRecord; open: boolean}) {
	const windowManager = useWindowManagerOptional()

	// ~2s auto-refreshing JPEG thumbnail (D-255-THUMBS-SCREENSHOT): screenshot
	// polling, NEVER an RFB / WebSocket socket. Live VNC happens only on the
	// explicit card click below.
	const shot = trpcReact.displays.screenshot.useQuery(
		{display: d.display},
		{enabled: open, refetchInterval: 2000},
	)

	return (
		<button
			type='button'
			onClick={() => {
				// Open the display as the existing interactive VNC window
				// (254-03), sized to its real WxH via the trailing `suggested`
				// openWindow param.
				windowManager?.openWindow(`DISPLAY_${d.display}`, '/', `Display ${d.display}`, '🖥️', undefined, {width: d.width, height: d.height})
			}}
			className={cn(
				'flex flex-col gap-1.5 rounded-xl border border-line p-2 text-left transition-colors',
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
	)
}
