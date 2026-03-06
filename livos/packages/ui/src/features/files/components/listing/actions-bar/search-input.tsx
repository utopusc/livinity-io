import {useEffect, useRef, useState} from 'react'
import {TbSearch} from 'react-icons/tb'
import {useLocation, useNavigate as useRouterNavigate, useSearchParams} from 'react-router-dom'

import {BorderTrail} from '@/components/motion-primitives/border-trail'
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
	const [isFocused, setIsFocused] = useState(false)

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
		<div
			className={cn(
				'relative flex items-center gap-1.5 h-8 px-2.5 rounded-xl bg-neutral-100/60 border border-transparent transition-all duration-300',
				isFocused && 'bg-white border-neutral-200 shadow-sm',
			)}
		>
			{isFocused && (
				<BorderTrail
					size={40}
					className='bg-gradient-to-l from-blue-300/50 via-blue-200/30 to-transparent'
					transition={{
						repeat: Infinity,
						duration: 3,
						ease: 'linear',
					}}
				/>
			)}
			<TbSearch
				className='h-3.5 w-3.5 shrink-0 cursor-text text-neutral-400'
				strokeWidth={2.5}
				onClick={() => inputRef.current?.focus()}
			/>
			<Input
				className={cn(
					'h-full !border-none !bg-transparent !p-0 text-[13px] text-neutral-700 placeholder:text-neutral-400 !outline-none !ring-0 transition-all duration-300 w-24 focus:w-36',
					{
						'w-36': query.length > 0,
					},
				)}
				ref={inputRef}
				placeholder={t('files-search.placeholder')}
				value={query}
				onChange={onQueryChange}
				onFocus={() => setIsFocused(true)}
				onBlur={() => setIsFocused(false)}
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
