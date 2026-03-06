import {TbLayoutGrid, TbList} from 'react-icons/tb'

import {AnimatedBackground} from '@/components/motion-primitives/animated-background'
import {usePreferences} from '@/features/files/hooks/use-preferences'
import {ViewPreferences} from '@/features/files/types'
import {cn} from '@/shadcn-lib/utils'
import {t} from '@/utils/i18n'

export function ViewToggle() {
	const {preferences, setView, isLoading, isError} = usePreferences()

	const viewModes: ViewPreferences['view'][] = ['icons', 'list']

	const {view} = preferences ?? {view: 'list'}

	return (
		<div className={cn('flex items-center rounded-xl bg-neutral-100/80 p-[3px]', (isLoading || isError) && 'opacity-0')}>
			<AnimatedBackground
				defaultValue={view}
				className='rounded-lg bg-white shadow-sm'
				transition={{type: 'spring', bounce: 0.15, duration: 0.3}}
			>
				{viewModes.map((mode) => (
					<button
						key={mode}
						data-id={mode}
						onClick={() => setView(mode)}
						className={cn(
							'flex h-7 w-8 items-center justify-center text-neutral-400 transition-colors duration-150',
							view === mode && 'text-neutral-900',
						)}
						aria-label={t(`files-view.${mode}`)}
					>
						{mode === 'icons' ? (
							<TbLayoutGrid className='h-[15px] w-[15px]' strokeWidth={2.5} />
						) : (
							<TbList className='h-[15px] w-[15px]' strokeWidth={2.5} />
						)}
					</button>
				))}
			</AnimatedBackground>
		</div>
	)
}
