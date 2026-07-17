// Content-search results renderer (337-03). Each matched file is shown with its
// icon + name + a match-count badge, followed by the highlighted snippet(s) and
// their 1-based line numbers. SearchResultItem is structurally assignable to
// FileSystemItem, so the shared primitives (FileItemIcon / navigateToItem) take
// each item directly — no casts (plan W5).

import {FileItemIcon} from '@/features/files/components/shared/file-item-icon'
import {useNavigate} from '@/features/files/hooks/use-navigate'
import type {ContentMatch, SearchResultItem} from '@/features/files/types'
import {formatItemName} from '@/features/files/utils/format-filesystem-name'
import {t} from '@/utils/i18n'

export function SearchContentResults({
	results,
	query,
	isLoading,
	error,
}: {
	results: SearchResultItem[]
	query: string
	isLoading: boolean
	error?: unknown
}) {
	const {navigateToItem} = useNavigate()

	if (error) {
		const busy = String((error as {message?: string})?.message ?? '').includes('content-search-busy')
		return <Centered>{busy ? t('files-search.busy') : t('files-search.error')}</Centered>
	}
	if (isLoading) return <Centered>{t('files-search.searching')}</Centered>
	if (query.trim() === '') return <Centered>{t('files-search.content-default')}</Centered>
	if (results.length === 0) return <Centered>{t('files-search.content-no-results', {query})}</Centered>

	return (
		<div className='flex flex-col gap-2 p-2'>
			{results.map((item) => (
				<div key={item.path} className='rounded-lg border border-line-strong/40 bg-[color:var(--bg-2)] p-2'>
					<button className='flex w-full items-center gap-2 text-left' onClick={() => navigateToItem(item)}>
						<FileItemIcon item={item} className='h-5 w-5 shrink-0' />
						<span className='truncate text-[13px] text-[color:var(--fg)]'>
							{formatItemName({name: item.name, maxLength: 60})}
						</span>
						{typeof item.matchCount === 'number' && (
							<span className='ml-auto shrink-0 rounded-full bg-[color:var(--bg)] px-2 py-0.5 text-[11px] text-[color:var(--fg-mute)]'>
								{t('files-search.matches', {count: item.matchCount})}
							</span>
						)}
					</button>
					<div className='mt-1 flex flex-col gap-0.5 pl-7'>
						{(item.contentMatches ?? []).map((m: ContentMatch, i: number) => (
							<div key={i} className='flex gap-2 font-mono text-[11px] text-[color:var(--fg-mute)]'>
								<span className='shrink-0 tabular-nums opacity-60'>{m.line}</span>
								<span className='truncate'>
									<Highlighted match={m} />
								</span>
							</div>
						))}
						{typeof item.matchCount === 'number' && item.matchCount > (item.contentMatches?.length ?? 0) && (
							<span className='text-[11px] opacity-60'>
								{t('files-search.more-matches', {count: item.matchCount - (item.contentMatches?.length ?? 0)})}
							</span>
						)}
					</div>
				</div>
			))}
		</div>
	)
}

// Bold the matched substring using the server-provided offsets; fall back to the
// plain snippet if offsets are missing or invalid (never throws).
function Highlighted({match}: {match: ContentMatch}) {
	const {snippet, matchStart, matchEnd} = match
	if (matchStart == null || matchEnd == null || matchStart >= matchEnd) return <>{snippet}</>
	return (
		<>
			{snippet.slice(0, matchStart)}
			<mark className='rounded bg-yellow-300/30 text-[color:var(--fg)]'>{snippet.slice(matchStart, matchEnd)}</mark>
			{snippet.slice(matchEnd)}
		</>
	)
}

function Centered({children}: {children: React.ReactNode}) {
	return <div className='flex h-full items-center justify-center text-xs text-neutral-500'>{children}</div>
}
