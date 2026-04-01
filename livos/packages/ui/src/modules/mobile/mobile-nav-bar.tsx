import {ChevronLeft} from 'lucide-react'

type MobileNavBarProps = {
	title: string
	onBack: () => void
}

export function MobileNavBar({title, onBack}: MobileNavBarProps) {
	return (
		<div className='bg-white/95 backdrop-blur-md pt-safe border-b border-black/5'>
			<div className='relative flex h-11 items-center'>
				<button
					onClick={onBack}
					className='absolute left-2 rounded-lg p-1 text-text-primary active:bg-black/5'
				>
					<ChevronLeft className='h-6 w-6' />
				</button>
				<span className='flex-1 truncate px-10 text-center text-sm font-medium'>
					{title}
				</span>
			</div>
		</div>
	)
}
