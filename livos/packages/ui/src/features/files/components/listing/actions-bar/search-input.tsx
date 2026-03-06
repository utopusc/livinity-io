import {useEffect, useRef, useState} from 'react'
import {useLocation, useNavigate as useRouterNavigate, useSearchParams} from 'react-router-dom'

import {SearchIcon} from '@/features/files/assets/search-icon'
import {BASE_ROUTE_PATH, SEARCH_PATH} from '@/features/files/constants'
import {useIsTouchDevice} from '@/features/files/hooks/use-is-touch-device'
import {Input} from '@/shadcn-components/ui/input'
import {cn} from '@/shadcn-lib/utils'
import {t} from '@/utils/i18n'

export function SearchInput() {
	const navigate = useRouterNavigate()
	const location = useLocation()
	const inputRef = useRef<HTMLInputElement>(null)

	const [searchParams] = useSearchParams()

	const [query, setQuery] = useState('')

	const isTouchDevice = useIsTouchDevice()

	// sync local state with the URL when navigating into the search route via
	// back/forward browser buttons or a browser refresh, or programmatic
	// navigation from anywhere
	useEffect(() => {
		if (location.pathname.endsWith(SEARCH_PATH)) {
			// when on the search route we want the input to reflect the query param
			setQuery(searchParams.get('q') ?? '')
			// focus the input on non-touch devices
			if (!isTouchDevice) {
				inputRef.current?.focus()
			}
		} else {
			// when not on the search route we want to clear the input
			setQuery('')
		}
	}, [location.pathname, searchParams])

	// helper to push/replace the appropriate route for a given query
	const gotoSearch = (query: string, {replace}: {replace: boolean}) => {
		const encodedQuery = encodeURIComponent(query.trim())
		navigate(`${BASE_ROUTE_PATH}${SEARCH_PATH}?q=${encodedQuery}`, {replace})
	}

	const onQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const next = e.target.value
		setQuery(next)

		const trimmed = next.trim()

		// avoid navigating for empty queries – we'll stay on the current
		// directory (or the existing search page showing previous results).
		if (trimmed === '') return
		const currentlyOnSearchPage = location.pathname.endsWith(SEARCH_PATH)
		gotoSearch(trimmed, {replace: currentlyOnSearchPage})
	}

	return (
		<div className='flex items-center gap-1.5 h-7 px-2 rounded-lg bg-surface-1 border border-border-subtle focus-within:border-brand/50 focus-within:ring-1 focus-within:ring-brand/20 transition-all'>
			<SearchIcon
				className='h-3.5 w-3.5 shrink-0 cursor-text text-text-tertiary'
				onClick={() => inputRef.current?.focus()}
			/>
			<Input
				className={cn(
					'h-full !border-none !bg-transparent !p-0 text-caption text-text-primary placeholder:text-text-tertiary !outline-none !ring-0 transition-all duration-300 w-28 focus:w-36',
					{
						'w-36': query.length > 0,
					},
				)}
				ref={inputRef}
				placeholder={t('files-search.placeholder')}
				value={query}
				onChange={onQueryChange}
				// clear and blur the input on Escape
				onKeyDown={(e) => {
					if (e.key === 'Escape') {
						setQuery('')
						inputRef.current?.blur()
					}
				}}
			/>
		</div>
	)
}
