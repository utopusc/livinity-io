import {TextShimmerWave} from '@/components/motion-primitives/text-shimmer-wave'
import {greetingMessage} from '@/modules/desktop/greeting-message'
import {cn} from '@/shadcn-lib/utils'

export function Header({userName}: {userName: string}) {
	const name = userName
	return (
		<div className={cn('relative z-10', name ? '' : 'invisible')}>
			<div className='flex flex-col items-center px-4'>
				<TextShimmerWave
					as='h1'
					className='text-center text-heading font-bold drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)] md:text-display-lg [--base-color:rgba(255,255,255,0.75)] [--base-gradient-color:rgba(255,255,255,1)]'
					duration={1.5}
					spread={1.2}
					zDistance={4}
					yDistance={-1}
					scaleDistance={1.02}
					rotateYDistance={4}
				>
					{greetingMessage(name)}
				</TextShimmerWave>
			</div>
		</div>
	)
}
