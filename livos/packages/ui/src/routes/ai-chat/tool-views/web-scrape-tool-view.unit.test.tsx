// @vitest-environment jsdom
//
// Phase 69 Plan 69-03 — WebScrapeToolView unit tests (D-26).
//
// renderToStaticMarkup + react-markdown v9 — D-NO-NEW-DEPS preserved
// (react-markdown ^9.0.1 is already in `livos/packages/ui/package.json`).

import {describe, expect, it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'

import {extractContent, extractTargetUrl, WebScrapeToolView} from './web-scrape-tool-view'
import type {ToolCallSnapshot} from './types'

const mkSnapshot = (overrides: Partial<ToolCallSnapshot> = {}): ToolCallSnapshot => ({
	toolId: 'tool-x',
	toolName: 'web-scrape',
	category: 'webScrape',
	assistantCall: {input: {url: 'https://blog.example.com/post'}, ts: 1000},
	status: 'done',
	startedAt: 1000,
	completedAt: 2000,
	toolResult: {
		output: {content: '# Hello World\n\nThis is **markdown**.'},
		isError: false,
		ts: 2000,
	},
	...overrides,
})

const renderHtml = (s: ToolCallSnapshot) =>
	renderToStaticMarkup(<WebScrapeToolView snapshot={s} isActive={true} />)

describe('WebScrapeToolView (D-26)', () => {
	it('renders target URL + markdown content (h1 + strong)', () => {
		const html = renderHtml(mkSnapshot())
		expect(html).toContain('https://blog.example.com/post')
		expect(html).toContain('<h1')
		expect(html).toContain('Hello World')
		expect(html).toContain('<strong>markdown</strong>')
	})

	it('handles plain string output (not wrapped in {content: ...})', () => {
		const html = renderHtml(
			mkSnapshot({toolResult: {output: '# Direct String', isError: false, ts: 2000}}),
		)
		expect(html).toContain('<h1')
		expect(html).toContain('Direct String')
	})

	it('handles output.markdown alternate field', () => {
		const html = renderHtml(
			mkSnapshot({toolResult: {output: {markdown: '## Alt Field'}, isError: false, ts: 2000}}),
		)
		expect(html).toContain('<h2')
		expect(html).toContain('Alt Field')
	})

	it('shows Scraping... when toolResult undefined', () => {
		const html = renderHtml(mkSnapshot({toolResult: undefined, status: 'running'}))
		expect(html).toContain('Scraping')
	})

	it('shows No content when content empty', () => {
		const html = renderHtml(mkSnapshot({toolResult: {output: {}, isError: false, ts: 2000}}))
		expect(html).toContain('No content')
	})

	it('uses prose + prose-invert wrapper for dark theme readability', () => {
		const html = renderHtml(mkSnapshot())
		expect(html).toContain('prose')
		expect(html).toContain('prose-invert')
	})

	it('falls back to "Web Scrape" header when input has no URL field', () => {
		const html = renderHtml(
			mkSnapshot({
				assistantCall: {input: {}, ts: 1000},
				toolResult: {output: '# something', isError: false, ts: 2000},
			}),
		)
		expect(html).toContain('Web Scrape')
	})

	it('does NOT inject raw HTML script tags from scraped content (T-69-03-02)', () => {
		const malicious = '# Title\n\n<script>alert("xss")</script>\n\nNormal text'
		const html = renderHtml(
			mkSnapshot({toolResult: {output: malicious, isError: false, ts: 2000}}),
		)
		// react-markdown v9 default config does NOT render raw HTML; the
		// <script> token is treated as text or stripped, never injected.
		expect(html).not.toContain('<script>alert')
		expect(html).toContain('Title')
		expect(html).toContain('Normal text')
	})
})

// ─────────────────────────────────────────────────────────────────────
// Pure helper coverage
// ─────────────────────────────────────────────────────────────────────

describe('extractTargetUrl (web-scrape)', () => {
	it('finds url field', () => {
		expect(extractTargetUrl({url: 'https://x.com'})).toBe('https://x.com')
	})
	it('finds target alias', () => {
		expect(extractTargetUrl({target: 'https://t.com'})).toBe('https://t.com')
	})
	it('finds page alias', () => {
		expect(extractTargetUrl({page: 'https://p.com'})).toBe('https://p.com')
	})
	it('returns empty string when no candidate matches', () => {
		expect(extractTargetUrl({other: 'value'})).toBe('')
	})
})

describe('extractContent', () => {
	it('returns string output as-is', () => {
		expect(extractContent('# raw markdown')).toBe('# raw markdown')
	})
	it('returns output.content field', () => {
		expect(extractContent({content: 'C'})).toBe('C')
	})
	it('returns output.markdown field', () => {
		expect(extractContent({markdown: 'M'})).toBe('M')
	})
	it('prefers content over markdown when both present', () => {
		expect(extractContent({content: 'C', markdown: 'M'})).toBe('C')
	})
	it('returns empty string for null', () => {
		expect(extractContent(null)).toBe('')
	})
	it('returns empty string for object without known fields', () => {
		expect(extractContent({other: 'x'})).toBe('')
	})
	it('returns empty string for non-string content field', () => {
		expect(extractContent({content: 42 as unknown as string})).toBe('')
	})
})
