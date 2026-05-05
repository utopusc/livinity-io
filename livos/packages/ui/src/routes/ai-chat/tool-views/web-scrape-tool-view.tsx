/**
 * WebScrapeToolView — Phase 69-03 (VIEWS-08).
 *
 * Spec: 69-CONTEXT.md D-26 + .planning/v31-DRAFT.md lines 461-463.
 *
 * Renders a web-scrape tool snapshot as:
 *   1. Header: LivIcons.webScrape icon + target URL (font-mono, truncated).
 *   2. Body: react-markdown (default export, v9) rendering the scraped
 *      content. Content is pulled from output.content | output.markdown |
 *      string output. Wrapped in `<div className='prose prose-invert
 *      max-w-none text-13'>` (Tailwind Typography is configured per
 *      package.json devDeps `@tailwindcss/typography`).
 *
 * Pending state: 'Scraping...'.
 * Empty content: 'No content'.
 *
 * MARKDOWN COMPONENT CHOICE: Using `react-markdown` directly (NOT the
 * project-wide `@/components/markdown.tsx` wrapper). Rationale:
 *   - The project Markdown wrapper remaps h1..h6 → h4 ("Don't want big
 *     headings in user content"), which is wrong for tool-result content
 *     where the agent has explicitly chosen heading levels.
 *   - That wrapper also depends on `useLocation()` (react-router) for
 *     community-app-store branching — out-of-place for this tool view.
 *   - react-markdown v9 sanitizes by default (T-69-03-02 mitigated): no
 *     raw HTML, no scripts, no `javascript:` URLs. We do NOT enable
 *     `rehype-raw`. CONTEXT D-12 forbids new plugins; we add nothing.
 *   - NO image gallery in P69 (CONTEXT D-26 deferral).
 *
 * Pure helpers (`extractTargetUrl`, `extractContent`) exported for
 * vitest hammering — D-NO-NEW-DEPS-friendly.
 */

import ReactMarkdown from 'react-markdown'

import {LivIcons} from '@/icons/liv-icons'

import type {ToolViewProps} from './types'

export function extractTargetUrl(input: Record<string, unknown>): string {
	for (const k of ['url', 'target', 'page']) {
		const v = input[k]
		if (typeof v === 'string') return v
	}
	return ''
}

export function extractContent(output: unknown): string {
	if (typeof output === 'string') return output
	if (output && typeof output === 'object') {
		const c = (output as {content?: unknown}).content
		if (typeof c === 'string') return c
		const m = (output as {markdown?: unknown}).markdown
		if (typeof m === 'string') return m
	}
	return ''
}

export function WebScrapeToolView({snapshot}: ToolViewProps) {
	const Icon = LivIcons.webScrape
	const targetUrl = extractTargetUrl(snapshot.assistantCall.input)

	if (!snapshot.toolResult) {
		return (
			<div className='flex flex-col gap-3 p-3' data-testid='liv-web-scrape-tool-view'>
				<header className='flex items-center gap-2'>
					<Icon className='size-4 text-[color:var(--liv-text-secondary)]' />
					<code className='truncate font-mono text-13'>{targetUrl || 'Web Scrape'}</code>
				</header>
				<div className='text-12 text-[color:var(--liv-text-secondary)]'>Scraping...</div>
			</div>
		)
	}

	const content = extractContent(snapshot.toolResult.output)

	return (
		<div className='flex flex-col gap-3 p-3' data-testid='liv-web-scrape-tool-view'>
			<header className='flex items-center gap-2'>
				<Icon className='size-4 text-[color:var(--liv-text-secondary)]' />
				<code className='truncate font-mono text-13'>{targetUrl || 'Web Scrape'}</code>
			</header>
			{content ? (
				<div className='prose prose-invert max-w-none text-13'>
					<ReactMarkdown>{content}</ReactMarkdown>
				</div>
			) : (
				<div className='text-12 text-[color:var(--liv-text-secondary)]'>No content</div>
			)}
		</div>
	)
}
