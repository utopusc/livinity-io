/**
 * WebSearchToolView — Phase 69-03 (VIEWS-06).
 *
 * Spec: 69-CONTEXT.md D-24 + .planning/v31-DRAFT.md lines 451-454.
 *
 * Renders a web-search tool snapshot as:
 *   1. Header: LivIcons.webSearch icon + "Web Search" label.
 *   2. Query line: "Query: {query}" — pulled from
 *      `assistantCall.input.{query|q|search|searchQuery}`.
 *   3. Result cards: favicon (Google s2 favicons URL) + title + URL +
 *      snippet/description, each wrapped in `<a target='_blank' rel='noopener noreferrer'>`.
 *   4. Caps at MAX_VISIBLE = 10; over-cap shows `+{N} more` text (no
 *      "show more" button in P69 — that's P70 polish per CONTEXT D-24).
 *
 * Pending state: 'Searching...'.
 * Empty/malformed results: 'No results'.
 *
 * Pure helpers (`extractResults`, `extractQuery`, `getFavicon`) are
 * exported so vitest can drive them directly — D-NO-NEW-DEPS-friendly.
 */

import {LivIcons} from '@/icons/liv-icons'

import type {ToolViewProps} from './types'

interface SearchResult {
	title?: string
	url?: string
	snippet?: string
	description?: string
}

export function extractResults(output: unknown): SearchResult[] {
	if (Array.isArray(output)) return output as SearchResult[]
	if (output && typeof output === 'object') {
		const r = (output as {results?: unknown}).results
		if (Array.isArray(r)) return r as SearchResult[]
	}
	return []
}

export function extractQuery(input: Record<string, unknown>): string {
	const candidates = ['query', 'q', 'search', 'searchQuery']
	for (const k of candidates) {
		const v = input[k]
		if (typeof v === 'string') return v
	}
	return ''
}

export function getFavicon(url: string | undefined): string | null {
	if (!url) return null
	try {
		const host = new URL(url).hostname
		return `https://www.google.com/s2/favicons?domain=${host}&sz=32`
	} catch {
		return null
	}
}

const MAX_VISIBLE = 10

export function WebSearchToolView({snapshot}: ToolViewProps) {
	const Icon = LivIcons.webSearch
	const query = extractQuery(snapshot.assistantCall.input)
	const results = snapshot.toolResult ? extractResults(snapshot.toolResult.output) : []
	const visible = results.slice(0, MAX_VISIBLE)
	const remaining = Math.max(0, results.length - MAX_VISIBLE)

	if (!snapshot.toolResult) {
		return (
			<div className='flex flex-col gap-3 p-3' data-testid='liv-web-search-tool-view'>
				<header className='flex items-center gap-2'>
					<Icon className='size-4 text-[color:var(--liv-text-secondary)]' />
					<span className='text-13'>Web Search</span>
				</header>
				{query && (
					<div className='text-12 text-[color:var(--liv-text-secondary)]'>Query: {query}</div>
				)}
				<div className='text-12 text-[color:var(--liv-text-secondary)]'>Searching...</div>
			</div>
		)
	}

	return (
		<div className='flex flex-col gap-3 p-3' data-testid='liv-web-search-tool-view'>
			<header className='flex items-center gap-2'>
				<Icon className='size-4 text-[color:var(--liv-text-secondary)]' />
				<span className='text-13'>Web Search</span>
			</header>
			{query && (
				<div className='text-12 text-[color:var(--liv-text-secondary)]'>Query: {query}</div>
			)}
			{visible.length === 0 ? (
				<div className='text-12 text-[color:var(--liv-text-secondary)]'>No results</div>
			) : (
				<ul className='flex flex-col gap-2'>
					{visible.map((r, idx) => {
						const favicon = getFavicon(r.url)
						const desc = r.snippet || r.description || ''
						return (
							<li key={idx}>
								<a
									href={r.url}
									target='_blank'
									rel='noopener noreferrer'
									className='block rounded px-3 py-2 transition-colors hover:bg-[color:var(--liv-bg-elevated)]'
								>
									<div className='flex items-center gap-2'>
										{favicon && <img src={favicon} alt='' className='h-4 w-4' />}
										<span className='truncate text-13 font-medium'>{r.title || r.url}</span>
									</div>
									{r.url && (
										<div className='truncate text-12 text-[color:var(--liv-text-secondary)]'>
											{r.url}
										</div>
									)}
									{desc && <div className='mt-1 text-12'>{desc}</div>}
								</a>
							</li>
						)
					})}
				</ul>
			)}
			{remaining > 0 && (
				<div className='text-12 text-[color:var(--liv-text-secondary)]'>+{remaining} more</div>
			)}
		</div>
	)
}
