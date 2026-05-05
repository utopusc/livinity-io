/**
 * WebCrawlToolView — Phase 69-03 (VIEWS-07).
 *
 * Spec: 69-CONTEXT.md D-25 + .planning/v31-DRAFT.md lines 456-459.
 *
 * Renders a web-crawl tool snapshot as:
 *   1. Header: LivIcons.webCrawl icon + target URL (font-mono, truncated)
 *      or 'Web Crawl' fallback when no URL field present.
 *   2. Progress line: "Pages crawled: {N}" — N from explicit
 *      `output.pagesCrawled` if number, else `pages.length`.
 *   3. Flat <ul> of crawled URLs (NO depth-tree per CONTEXT D-25 P69
 *      simplification). Each entry is a clickable <a> with
 *      target='_blank' rel='noopener noreferrer'.
 *   4. Caps at 50 visible; over-cap shows `+{N} more`.
 *
 * Pending state: 'Crawling...'.
 * Empty pages: 'No pages'.
 *
 * Pure helpers (`extractTargetUrl`, `extractPages`, `extractPageCount`)
 * are exported for vitest hammering — D-NO-NEW-DEPS-friendly.
 */

import {LivIcons} from '@/icons/liv-icons'

import type {ToolViewProps} from './types'

export function extractTargetUrl(input: Record<string, unknown>): string {
	for (const k of ['url', 'target', 'startUrl', 'rootUrl']) {
		const v = input[k]
		if (typeof v === 'string') return v
	}
	return ''
}

export function extractPages(output: unknown): string[] {
	if (Array.isArray(output)) {
		return output
			.map((item) => {
				if (typeof item === 'string') return item
				if (item && typeof item === 'object' && 'url' in item) {
					return String((item as {url: unknown}).url)
				}
				return ''
			})
			.filter(Boolean)
	}
	if (output && typeof output === 'object') {
		const pages = (output as {pages?: unknown}).pages
		if (Array.isArray(pages)) return extractPages(pages)
	}
	return []
}

export function extractPageCount(output: unknown): number | null {
	if (output && typeof output === 'object' && 'pagesCrawled' in output) {
		const n = (output as {pagesCrawled: unknown}).pagesCrawled
		if (typeof n === 'number') return n
	}
	return null
}

const MAX_VISIBLE = 50

export function WebCrawlToolView({snapshot}: ToolViewProps) {
	const Icon = LivIcons.webCrawl
	const targetUrl = extractTargetUrl(snapshot.assistantCall.input)

	if (!snapshot.toolResult) {
		return (
			<div className='flex flex-col gap-3 p-3' data-testid='liv-web-crawl-tool-view'>
				<header className='flex items-center gap-2'>
					<Icon className='size-4 text-[color:var(--liv-text-secondary)]' />
					<code className='truncate font-mono text-13'>{targetUrl || 'Web Crawl'}</code>
				</header>
				<div className='text-12 text-[color:var(--liv-text-secondary)]'>Crawling...</div>
			</div>
		)
	}

	const pages = extractPages(snapshot.toolResult.output)
	const explicitCount = extractPageCount(snapshot.toolResult.output)
	const count = explicitCount ?? pages.length
	const visible = pages.slice(0, MAX_VISIBLE)
	const remaining = Math.max(0, pages.length - MAX_VISIBLE)

	return (
		<div className='flex flex-col gap-3 p-3' data-testid='liv-web-crawl-tool-view'>
			<header className='flex items-center gap-2'>
				<Icon className='size-4 text-[color:var(--liv-text-secondary)]' />
				<code className='truncate font-mono text-13'>{targetUrl || 'Web Crawl'}</code>
			</header>
			<div className='text-12 text-[color:var(--liv-text-secondary)]'>Pages crawled: {count}</div>
			{pages.length === 0 ? (
				<div className='text-12 text-[color:var(--liv-text-secondary)]'>No pages</div>
			) : (
				<ul className='flex flex-col gap-1 font-mono text-12'>
					{visible.map((p, idx) => (
						<li key={idx} className='truncate'>
							<a
								href={p}
								target='_blank'
								rel='noopener noreferrer'
								className='hover:text-[color:var(--liv-accent-cyan)]'
							>
								{p}
							</a>
						</li>
					))}
					{remaining > 0 && (
						<li className='text-[color:var(--liv-text-secondary)]'>+{remaining} more</li>
					)}
				</ul>
			)}
		</div>
	)
}
