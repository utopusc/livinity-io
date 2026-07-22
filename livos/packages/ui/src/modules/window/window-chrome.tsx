import {Maximize2, Minus} from 'lucide-react'
import type {ReactNode} from 'react'
import {TbX} from 'react-icons/tb'

import {Magnetic} from '@/components/motion-primitives/magnetic'

// Phase 260.2 — window chrome reduced to a clean control row:
//   [ X close | ⤢ fullscreen | − minimize ] · drag-bar(title)
// The per-app Chat action area + Skills button were removed (operator
// "chat'i kaldır"). The drag bar now `flex-1`s to fill the remaining width
// (no manual width math → no overflow) and left-aligns the title so it sits
// right next to the controls (operator "drag kısmı çok uzakta butonlardan").
// onFullscreen / onMinimize are optional; window.tsx only passes onMinimize
// for VNC/stream windows so the − button is stream-only.

type WindowChromeProps = {
	title: string
	icon?: string
	// Phase 356 (VMWIN-01) — an additive render-time glyph (e.g. a VM's per-OS
	// icon) shown in the drag-bar pill next to the title. SEPARATE from the dead
	// `icon?: string` field above: this is a ReactNode derived in WindowsContainer
	// at render time and NEVER persisted to WindowState / the pinned-window
	// Postgres icon:string field (a ReactNode cannot round-trip).
	titleIcon?: ReactNode
	onClose: () => void
	windowWidth: number
	// Kept for call-site compatibility (windows-container passes them); the chat
	// action area that consumed them was removed, so they're no longer read here.
	webappId?: string
	nativeAppId?: string
	// Browser-fullscreen the window content (window.tsx supplies the bound call).
	onFullscreen?: () => void
	// Phase 260.2 — − minimize: sends the window back to the docked "windows"
	// surface (pin-to-topbar, keep-alive). window.tsx passes it ONLY for
	// VNC/stream windows, so the button is stream-only.
	onMinimize?: () => void
}

// Sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f (sdk-agent-runner.ts) unchanged.

const PILL_BASE =
	'flex shrink-0 items-center justify-center w-9 h-9 rounded-full bg-white/95 dark:bg-zinc-800/95 border border-dash-line dark:border-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.4)] transition-colors duration-200'

export function WindowChrome({title, titleIcon, windowWidth, onClose, onFullscreen, onMinimize}: WindowChromeProps) {
	return (
		<div className='relative flex items-center gap-2' style={{width: windowWidth}}>
			{/* Close pill — far left. Destructive hover (teardown). For stream
			    windows window.tsx routes this to closeDisplay (closes the port). */}
			<Magnetic
				intensity={0.3}
				range={60}
				springOptions={{stiffness: 200, damping: 12, mass: 0.15}}
			>
				<button
					type='button'
					onClick={(e) => {
						e.stopPropagation()
						onClose()
					}}
					onMouseDown={(e) => e.stopPropagation()}
					className={`group ${PILL_BASE} hover:bg-destructive dark:hover:bg-destructive hover:border-destructive/80`}
					aria-label='Close window'
				>
					<TbX
						className='h-4 w-4 text-neutral-500 dark:text-neutral-400 group-hover:text-white transition-colors'
						strokeWidth={2.5}
					/>
				</button>
			</Magnetic>

			{/* Fullscreen pill — neutral hover. Browser Fullscreen API on the
			    content element (window.tsx supplies the call). */}
			{onFullscreen && (
				<button
					type='button'
					onClick={(e) => {
						e.stopPropagation()
						onFullscreen?.()
					}}
					onMouseDown={(e) => e.stopPropagation()}
					className={`${PILL_BASE} hover:bg-[color:var(--bg-2)]`}
					aria-label='Fullscreen'
					title='Fullscreen'
				>
					<Maximize2 className='h-4 w-4 text-neutral-500 dark:text-neutral-400' strokeWidth={2.5} />
				</button>
			)}

			{/* Minimize pill — neutral hover (reversible dock, keep-alive). Only
			    rendered for VNC/stream windows (window.tsx gates onMinimize). */}
			{onMinimize && (
				<button
					type='button'
					onClick={(e) => {
						e.stopPropagation()
						onMinimize?.()
					}}
					onMouseDown={(e) => e.stopPropagation()}
					className={`${PILL_BASE} hover:bg-[color:var(--bg-2)]`}
					aria-label='Minimize to windows'
					title='Minimize'
				>
					<Minus className='h-4 w-4 text-neutral-500 dark:text-neutral-400' strokeWidth={2.5} />
				</button>
			)}

			{/* Drag bar — fills the remaining width (flex-1, no manual math).
			    Title left-aligned so it sits next to the controls. The whole
			    chrome row is the drag handle (window.tsx onMouseDown). */}
			<div className='flex h-9 min-w-0 flex-1 items-center justify-start gap-2 rounded-full border border-dash-line bg-white/95 px-4 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:border-white/10 dark:bg-zinc-800/95 dark:shadow-[0_2px_8px_rgba(0,0,0,0.4)] cursor-grab active:cursor-grabbing'>
				{titleIcon ? <span className='flex h-4 w-4 shrink-0 items-center justify-center'>{titleIcon}</span> : null}
				<span className='truncate text-[13px] font-semibold tracking-tight text-neutral-700 dark:text-neutral-200 select-none'>
					{title}
				</span>
			</div>
		</div>
	)
}
