// The search query is read directly from the URL (the `q` query parameter). We
// intentionally avoid any internal component state for the filename query so that
// - The browser's address bar always reflects the current search.
// - The browser back-button naturally returns the user to the results after
//   they navigate into a file or folder.
//
// 337-03 adds a Name | Contents toggle (also URL-backed, `mode` param). Filename
// mode is byte-identical to before. Content mode (A4) fires ONLY on explicit
// submit — keystrokes update the URL `q` but do not re-run the scan until the
// user presses "Search contents" (or switches the toggle to Contents, which
// commits the current query once).

import {useEffect, useState} from 'react'
import {useSearchParams} from 'react-router-dom'

import {Listing} from '@/features/files/components/listing'
import {useSetActionsBarConfig} from '@/features/files/components/listing/actions-bar/actions-bar-context'
import {SearchContentResults} from '@/features/files/components/listing/search-listing/search-content-results'
import {useSearchFiles} from '@/features/files/hooks/use-search-files'
import {useFilesStore} from '@/features/files/store/use-files-store'
import {cn} from '@/shadcn-lib/utils'
import {t} from '@/utils/i18n'

type SearchMode = 'filename' | 'content'

export function SearchListing() {
	const clearSelectedItems = useFilesStore((state) => state.clearSelectedItems)

	const setActionsBarConfig = useSetActionsBarConfig()

	// read the current search term + mode from the URL
	const [params, setParams] = useSearchParams()
	const queryParam = params.get('q') ?? ''
	const mode: SearchMode = params.get('mode') === 'content' ? 'content' : 'filename'

	// Content mode = explicit submit: the query passed to the backend is the
	// last *committed* value, not the live `q`. Initialised to the URL query so a
	// shared/deep-linked `?mode=content&q=…` searches immediately.
	const [committed, setCommitted] = useState(queryParam)

	useEffect(() => {
		// clear any selected items that the user may have selected from the
		// previous search results
		clearSelectedItems()
	}, [queryParam])

	useEffect(() => {
		setActionsBarConfig({
			hidePath: true,
			hideSearch: false,
		})
	}, [])

	const setMode = (next: SearchMode) => {
		setParams(
			(prev) => {
				const n = new URLSearchParams(prev)
				n.set('mode', next)
				return n
			},
			{replace: true},
		)
		// Switching TO content commits the current query once so the first search
		// is immediate; subsequent keystrokes won't re-fire until the user submits.
		if (next === 'content') setCommitted(queryParam.trim())
	}

	const submitContent = () => setCommitted(queryParam.trim())

	// query the backend – the hook internally short-circuits when provided an
	// empty string, so clearing the search box stops the requests
	const activeQuery = mode === 'content' ? committed : queryParam
	const {results, isLoading, isError, error} = useSearchFiles({query: activeQuery, mode})

	return (
		<div className='flex h-full flex-col'>
			{/* Additive header row — Name | Contents toggle (no redesign of the existing chrome). */}
			<div className='flex flex-col gap-1.5 px-2 pt-2'>
				<div className='flex items-center gap-2'>
					<div className='inline-flex items-center rounded-lg border border-line-strong bg-[color:var(--bg-2)] p-0.5'>
						<ModeButton active={mode === 'filename'} onClick={() => setMode('filename')}>
							{t('files-search.mode-name')}
						</ModeButton>
						<ModeButton active={mode === 'content'} onClick={() => setMode('content')}>
							{t('files-search.mode-contents')}
						</ModeButton>
					</div>
					{mode === 'content' && (
						<button
							onClick={submitContent}
							className='rounded-lg border border-line-strong bg-[color:var(--bg-2)] px-3 py-1 text-[12px] text-[color:var(--fg)] transition-colors hover:bg-[color:var(--bg)]'
						>
							{t('files-search.search-contents')}
						</button>
					)}
				</div>
				{mode === 'content' && (
					<p className='text-[11px] text-[color:var(--fg-mute)]'>{t('files-search.content-hint')}</p>
				)}
			</div>

			<div className='min-h-0 flex-1'>
				{mode === 'content' ? (
					<SearchContentResults
						results={results}
						query={committed}
						isLoading={isLoading}
						error={isError ? error : undefined}
					/>
				) : (
					// search results are currently returned in a single batch so we keep
					// pagination disabled
					<Listing
						items={results}
						totalItems={results.length}
						selectableItems={results}
						isLoading={isLoading}
						error={isError ? error : undefined}
						hasMore={false}
						onLoadMore={async () => false}
						CustomEmptyView={() => <EmptySearchView query={queryParam} />}
						enableFileDrop={false} // disable dropping files
					/>
				)}
			</div>
		</div>
	)
}

function ModeButton({active, onClick, children}: {active: boolean; onClick: () => void; children: React.ReactNode}) {
	return (
		<button
			onClick={onClick}
			className={cn(
				'rounded-md px-2.5 py-1 text-[12px] transition-colors',
				active ? 'bg-[color:var(--bg)] text-[color:var(--fg)]' : 'text-[color:var(--fg-mute)] hover:text-[color:var(--fg)]',
			)}
		>
			{children}
		</button>
	)
}

function EmptySearchView({query}: {query: string}) {
	return (
		<div className='flex h-full items-center justify-center text-xs text-neutral-500'>
			{query === '' ? t('files-search.default') : t('files-search.no-results', {query})}
		</div>
	)
}
