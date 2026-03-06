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
						className='group flex items-center justify-center w-9 h-9 rounded-full bg-white/90 backdrop-blur-lg border border-border-default shadow-elevation-md hover:bg-destructive hover:border-destructive/80 transition-all duration-200'
						aria-label='Close window'
					>
						<TbX className='h-icon-md w-icon-md text-text-secondary group-hover:text-white transition-colors' strokeWidth={2.5} />
					</button>
				</Magnetic>
			</div>

			{/* Title pill - this is what gets centered */}
			<div className='flex items-center gap-3 px-4 py-2 bg-white/90 backdrop-blur-lg rounded-full border border-border-default shadow-elevation-md'>
				{icon && <img src={icon} alt='' className='h-icon-md w-icon-md rounded-md' />}
				<span className='text-body font-medium text-text-primary tracking-tight whitespace-nowrap select-none'>
					{title}
				</span>
			</div>
		</div>
	)
}
