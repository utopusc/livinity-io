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
			{/* Close button - positioned to the left, with magnetic attraction */}
			<div className='absolute right-full mr-3'>
				<Magnetic intensity={0.3} range={60} springOptions={{stiffness: 200, damping: 12, mass: 0.15}}>
					<button
						type='button'
						onClick={(e) => {
							e.stopPropagation()
							onClose()
						}}
						className='group flex items-center justify-center w-9 h-9 rounded-full bg-card-bg/50 backdrop-blur-3xl backdrop-saturate-150 border border-dash-line shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:bg-destructive hover:border-destructive/80 transition-all duration-200'
						aria-label='Close window'
					>
						<TbX className='h-4 w-4 text-neutral-400 group-hover:text-white transition-colors' strokeWidth={2.5} />
					</button>
				</Magnetic>
			</div>

			{/* Title pill - this is what gets centered */}
			{/* v36 (micro): match the dock's glass formula — bg /50 + blur-3xl
			    + saturate-150 — so title pill and dock read as the same surface. */}
			<div className='flex items-center px-4 py-2 bg-card-bg/50 backdrop-blur-3xl backdrop-saturate-150 rounded-full border border-dash-line shadow-[0_2px_8px_rgba(0,0,0,0.08)]'>
				<span className='text-[13px] font-semibold text-neutral-700 tracking-tight whitespace-nowrap select-none'>
					{title}
				</span>
			</div>
		</div>
	)
}
