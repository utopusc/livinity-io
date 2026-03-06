import {TbLayoutGrid, TbList} from 'react-icons/tb'

import {usePreferences} from '@/features/files/hooks/use-preferences'
import {ViewPreferences} from '@/features/files/types'
import {cn} from '@/shadcn-lib/utils'
import {t} from '@/utils/i18n'

export function ViewToggle() {
	const {preferences, setView, isLoading, isError} = usePreferences()

	const viewModes: ViewPreferences['view'][] = ['icons', 'list']

	const {view} = preferences ?? {view: 'list'}

	return (
		<div className={cn('flex items-center rounded-lg bg-neutral-100 p-0.5', (isLoading || isError) && 'opacity-0')}>
			{viewModes.map((mode) => (
				<button
					key={mode}
					onClick={() => setView(mode)}
					className={cn(
						'flex h-7 w-8 items-center justify-center rounded-md transition-all duration-150',
						view === mode ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-400 hover:text-neutral-600',
					)}
					aria-label={t(`files-view.${mode}`)}
				>
					{mode === 'icons' ? (
						<TbLayoutGrid className='h-4 w-4' strokeWidth={2} />
					) : (
						<TbList className='h-4 w-4' strokeWidth={2} />
					)}
				</button>
			))}
		</div>
	)
}
