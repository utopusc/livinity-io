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
				className='absolute right-full mr-3 group flex items-center justify-center w-10 h-10 rounded-full bg-black/70 backdrop-blur-xl border-2 border-[hsl(var(--color-brand)/0.6)] shadow-xl hover:bg-red-500 hover:border-red-400 transition-all duration-200'
				aria-label='Close window'
			>
				<TbX className='h-5 w-5 text-white/70 group-hover:text-white transition-colors' strokeWidth={2.5} />
			</button>

			{/* Title pill - this is what gets centered */}
			<div className='flex items-center gap-3 px-5 py-2.5 bg-black/70 backdrop-blur-xl rounded-full border-2 border-[hsl(var(--color-brand)/0.6)] shadow-xl cursor-grab active:cursor-grabbing'>
				{icon && <img src={icon} alt='' className='h-5 w-5 rounded-md' />}
				<span className='text-14 font-medium text-white/90 tracking-tight whitespace-nowrap select-none'>
					{title}
				</span>
			</div>
		</div>
	)
}
