import {GridLayoutIcon} from '@/features/files/assets/grid-layout-icon'
import {ListLayoutIcon} from '@/features/files/assets/list-layout-icon'
import {usePreferences} from '@/features/files/hooks/use-preferences'
import {ViewPreferences} from '@/features/files/types'
import {Tabs, TabsList, TabsTrigger} from '@/shadcn-components/ui/tabs'
import {cn} from '@/shadcn-lib/utils'
import {t} from '@/utils/i18n'

export function ViewToggle() {
	const {preferences, setView, isLoading, isError} = usePreferences()

	const viewModes: ViewPreferences['view'][] = ['icons', 'list']

	const {view} = preferences ?? {view: 'list'}

	return (
		// Hide the view toggle while loading preferences or if there's an error
		<Tabs
			value={view}
			onValueChange={(value) => setView(value as ViewPreferences['view'])}
			className={cn(isLoading || (isError && 'opacity-0'))}
		>
			<TabsList className='h-7 rounded-lg bg-surface-1 p-0.5'>
				{viewModes.map((mode) => (
					<TabsTrigger
						key={mode}
						value={mode}
						className={cn(
							'h-6 w-7 flex items-center justify-center transition-all duration-150 rounded-md',
							view === mode ? 'bg-white shadow-sm' : 'hover:text-text-primary text-text-tertiary',
						)}
						aria-label={t(`files-view.${mode}`)}
					>
						{mode === 'icons' ? (
							<GridLayoutIcon className={cn('h-3.5 w-3.5', view === mode ? 'text-text-primary' : 'text-text-tertiary')} />
						) : (
							<ListLayoutIcon className={cn('h-3.5 w-3.5', view === mode ? 'text-text-primary' : 'text-text-tertiary')} />
						)}
					</TabsTrigger>
				))}
			</TabsList>
		</Tabs>
	)
}
