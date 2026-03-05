import LivinityLogo from '@/assets/livinity-logo'
import {TextShimmerWave} from '@/components/motion-primitives/text-shimmer-wave'
import {greetingMessage} from '@/modules/desktop/greeting-message'
import {cn} from '@/shadcn-lib/utils'

export function Header({userName}: {userName: string}) {
	const name = userName
	// Always rendering the entire component to avoid layout thrashing
	return (
		<div className={cn('relative z-10', name ? '' : 'invisible')}>
			<div className='flex flex-col items-center gap-3 px-4 md:gap-4'>
				<LivinityLogo
					className='w-[73px] md:w-auto'
					// Need to remove `view-transition-name` because it causes the logo to
					// briefly appear over the sheets between page transitions
					ref={(ref) => {
						ref?.style?.removeProperty('view-transition-name')
					}}
				/>
				<TextShimmerWave
					as='h1'
					className='text-center text-heading font-bold md:text-display-lg [--base-color:rgba(15,23,42,0.6)] [--base-gradient-color:rgba(15,23,42,0.92)]'
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
