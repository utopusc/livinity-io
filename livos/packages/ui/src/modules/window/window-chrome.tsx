import {TbX} from 'react-icons/tb'

type WindowChromeProps = {
	title: string
	icon?: string
	onClose: () => void
}

export function WindowChrome({title, icon, onClose}: WindowChromeProps) {
	return (
		<div className='relative flex items-center'>
			{/* Close button - positioned to the left, not affecting center */}
			<button
				type='button'
				onClick={(e) => {
					e.stopPropagation()
					onClose()
				}}
				className='absolute right-full mr-3 group flex items-center justify-center w-9 h-9 rounded-full bg-black/80 backdrop-blur-lg border border-border-emphasis shadow-elevation-md hover:bg-destructive hover:border-destructive/80 transition-all duration-200'
				aria-label='Close window'
			>
				<TbX className='h-icon-md w-icon-md text-text-secondary group-hover:text-white transition-colors' strokeWidth={2.5} />
			</button>

			{/* Title pill - this is what gets centered */}
			<div className='flex items-center gap-3 px-4 py-2 bg-black/80 backdrop-blur-lg rounded-full border border-border-emphasis shadow-elevation-md cursor-grab active:cursor-grabbing'>
				{icon && <img src={icon} alt='' className='h-icon-md w-icon-md rounded-md' />}
				<span className='text-body font-medium text-text-primary tracking-tight whitespace-nowrap select-none'>
					{title}
				</span>
			</div>
		</div>
	)
}
