import {memo, useDeferredValue, useEffect, useMemo, useRef, useState} from 'react'
import {TbArrowLeft, TbDots, TbSearch} from 'react-icons/tb'

import {Loading} from '@/components/ui/loading'
import {appsGridClass, AppStoreSheetInner, cardFaintClass, sectionTitleClass, slideInFromBottomClass} from '@/modules/app-store/shared'
import {UpdatesButton} from '@/modules/app-store/updates-button'
import {useWindowRouter} from '@/providers/window-router'
import {useAvailableApps} from '@/providers/available-apps'
import {cn} from '@/shadcn-lib/utils'
import {t} from '@/utils/i18n'
import {createSearch} from '@/utils/search'

import {AppWithDescriptionWindow} from './shared-components'

type AppStoreLayoutWindowProps = {
	children: React.ReactNode
}

export default function AppStoreLayoutWindow({children}: AppStoreLayoutWindowProps) {
	const title = t('app-store.title')
	const {navigate, goBack, canGoBack, currentRoute} = useWindowRouter()

	const [searchQuery, setSearchQuery] = useState('')
	const deferredSearchQuery = useDeferredValue(searchQuery)
	const inputRef = useRef<HTMLInputElement>(null)

	// Show back button when not on main discover page
	const showBackButton = canGoBack || currentRoute !== '/'

	const handleBack = () => {
		if (canGoBack) {
			goBack()
		} else {
			navigate('/')
		}
	}

	return (
		<div className='flex h-full flex-col'>
			{/* Header */}
			<div className='flex items-center justify-between border-b border-white/5 px-4 py-3'>
				<div className='flex items-center gap-3'>
					{showBackButton && (
						<button
							onClick={handleBack}
							className='flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10 transition-colors'
						>
							<TbArrowLeft className='h-5 w-5' />
						</button>
					)}
					<h1 className='text-15 font-semibold'>{title}</h1>
				</div>
				<div className='flex items-center gap-3'>
					<UpdatesButton />
					<SearchInput inputRef={inputRef} value={searchQuery} onValueChange={setSearchQuery} />
				</div>
			</div>

			{/* Content */}
			<div className='flex-1 overflow-auto p-4'>
				<div className='flex flex-col gap-5'>
					{deferredSearchQuery ? <SearchResultsMemoized query={deferredSearchQuery} /> : children}
				</div>
			</div>
		</div>
	)
}

function SearchInput({
	value,
	onValueChange,
	inputRef,
}: {
	value: string
	onValueChange: (query: string) => void
	inputRef?: React.Ref<HTMLInputElement>
}) {
	return (
		<div className='-ml-2 flex min-w-0 items-center rounded-full border border-transparent bg-transparent pl-2 transition-colors focus-within:border-white/5 focus-within:bg-white/6 hover:border-white/5 hover:bg-white/6'>
			<TbSearch className='h-4 w-4 shrink-0 opacity-50' />
			<input
				ref={inputRef}
				className='w-[160px] bg-transparent p-1 text-15 outline-none placeholder:text-white/40'
				placeholder={t('app-store.search-apps')}
				value={value}
				onChange={(e) => onValueChange(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === 'Escape') {
						onValueChange('')
						e.preventDefault()
					}
				}}
			/>
		</div>
	)
}

function SearchResults({query}: {query: string}) {
	const {isLoading, apps} = useAvailableApps()

	const search = useMemo(
		() =>
			createSearch(apps ?? [], [
				{name: 'name', weight: 3},
				{name: 'tagline', weight: 1},
				{name: 'description', weight: 1},
				{name: 'website', weight: 1},
			]),
		[apps],
	)

	const appResults = search(query)

	if (isLoading) {
		return <Loading />
	}

	const title = (
		<span>
			<span className='opacity-60'>{t('app-store.search.results-for')}</span> {query}
		</span>
	)

	return (
		<div className={cn(cardFaintClass, slideInFromBottomClass)}>
			<h3 className={cn(sectionTitleClass, 'p-2.5')}>{title}</h3>
			<div className={appsGridClass}>
				{appResults?.map((app) => <AppWithDescriptionWindow key={app.id} app={app} />)}
			</div>
			{(!appResults || appResults.length === 0) && <NoResults />}
		</div>
	)
}

const NoResults = () => (
	<div className='py-4 text-center'>
		<span className='opacity-50'>{t('app-store.search.no-results')}</span>
	</div>
)

const SearchResultsMemoized = memo(SearchResults)
