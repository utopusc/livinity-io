import {TbX} from 'react-icons/tb'

import {Magnetic} from '@/components/motion-primitives/magnetic'

type WindowChromeProps = {
	title: string
	icon?: string
	onClose: () => void
}

export function WindowChrome({title, icon, onClose}: WindowChromeProps) {
	return (
		<div className='relative flex items-center'>
			{/* Close button - positioned to the left, with magnetic attraction.
			    2026-05-15 — dark-mode pass: bg flips to a translucent black, the X
			    glyph reads as zinc-400 (subtle enough to disappear into the chrome
			    but legible). Destructive hover state is unchanged in both themes. */}
			<div className='absolute right-full mr-3'>
				<Magnetic intensity={0.3} range={60} springOptions={{stiffness: 200, damping: 12, mass: 0.15}}>
					<button
						type='button'
						onClick={(e) => {
							e.stopPropagation()
							onClose()
						}}
						className='group flex items-center justify-center w-9 h-9 rounded-full bg-card-bg/50 dark:bg-zinc-800/70 backdrop-blur-3xl backdrop-saturate-150 border border-dash-line dark:border-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.4)] hover:bg-destructive dark:hover:bg-destructive hover:border-destructive/80 transition-all duration-200'
						aria-label='Close window'
					>
						<TbX className='h-4 w-4 text-neutral-400 dark:text-neutral-500 group-hover:text-white dark:group-hover:text-white transition-colors' strokeWidth={2.5} />
					</button>
				</Magnetic>
			</div>

			{/* Title pill - this is what gets centered */}
			{/* v36 (micro): match the dock's glass formula — bg /50 + blur-3xl
			    + saturate-150 — so title pill and dock read as the same surface.
			    2026-05-15 dark-mode pass: title pill follows the dark dock — same
			    `bg-zinc-800/70` glass + zinc-200 text for high contrast. */}
			<div className='flex items-center px-4 py-2 bg-card-bg/50 dark:bg-zinc-800/70 backdrop-blur-3xl backdrop-saturate-150 rounded-full border border-dash-line dark:border-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.4)]'>
				<span className='text-[13px] font-semibold text-neutral-700 dark:text-neutral-200 tracking-tight whitespace-nowrap select-none'>
					{title}
				</span>
			</div>
		</div>
	)
}
