// @vitest-environment jsdom
//
// Phase 69 Plan 69-03 — WebCrawlToolView unit tests (D-25).
//
// Mirrors web-search-tool-view.unit.test.tsx pattern (renderToStaticMarkup
// + pure helpers; no @testing-library/react). D-NO-NEW-DEPS preserved.

import {describe, expect, it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'

import {
	extractPageCount,
	extractPages,
	extractTargetUrl,
	WebCrawlToolView,
} from './web-crawl-tool-view'
import type {ToolCallSnapshot} from './types'

const mkSnapshot = (overrides: Partial<ToolCallSnapshot> = {}): ToolCallSnapshot => ({
	toolId: 'tool-x',
	toolName: 'web-crawl',
	category: 'webCrawl',
	assistantCall: {input: {url: 'https://docs.example.com'}, ts: 1000},
	status: 'done',
	startedAt: 1000,
	completedAt: 2000,
	toolResult: {
		output: {
			pagesCrawled: 3,
			pages: [
				'https://docs.example.com',
				'https://docs.example.com/intro',
				'https://docs.example.com/api',
			],
		},
		isError: false,
		ts: 2000,
	},
	...overrides,
})

const renderHtml = (s: ToolCallSnapshot) =>
	renderToStaticMarkup(<WebCrawlToolView snapshot={s} isActive={true} />)

describe('WebCrawlToolView (D-25)', () => {
	it('renders target URL header + page count + page list', () => {
		const html = renderHtml(mkSnapshot())
		expect(html).toContain('https://docs.example.com')
		expect(html).toContain('Pages crawled: 3')
		expect(html).toContain('intro')
		expect(html).toContain('/api')
	})

	it('shows Crawling... when toolResult undefined', () => {
		const html = renderHtml(mkSnapshot({toolResult: undefined, status: 'running'}))
		expect(html).toContain('Crawling')
	})

	it('shows No pages for empty pages array', () => {
		const html = renderHtml(
			mkSnapshot({toolResult: {output: {pages: []}, isError: false, ts: 2000}}),
		)
		expect(html).toContain('No pages')
	})

	it('handles array of strings directly (no wrapper)', () => {
		const html = renderHtml(
			mkSnapshot({
				toolResult: {output: ['https://a.com', 'https://b.com'], isError: false, ts: 2000},
			}),
		)
		expect(html).toContain('https://a.com')
		expect(html).toContain('https://b.com')
		expect(html).toContain('Pages crawled: 2')
	})

	it('extracts pagesCrawled from explicit field even if pages array different length', () => {
		const html = renderHtml(
			mkSnapshot({
				toolResult: {
					output: {pagesCrawled: 100, pages: ['https://a.com']},
					isError: false,
					ts: 2000,
				},
			}),
		)
		expect(html).toContain('Pages crawled: 100')
	})

	it('renders pages as clickable links with security attributes', () => {
		const html = renderHtml(mkSnapshot())
		expect(html).toContain('target="_blank"')
		expect(html).toContain('rel="noopener noreferrer"')
	})

	it('renders +N more when pages exceed 50', () => {
		const many = Array.from({length: 75}, (_, i) => `https://docs.example.com/page-${i}`)
		const html = renderHtml(
			mkSnapshot({toolResult: {output: {pages: many}, isError: false, ts: 2000}}),
		)
		expect(html).toContain('+25 more')
	})

	it('falls back to "Web Crawl" header when input has no URL field', () => {
		const html = renderHtml(
			mkSnapshot({
				assistantCall: {input: {}, ts: 1000},
				toolResult: {output: {pages: []}, isError: false, ts: 2000},
			}),
		)
		expect(html).toContain('Web Crawl')
	})

	it('extracts page URLs from array of objects with url field', () => {
		const html = renderHtml(
			mkSnapshot({
				toolResult: {
					output: {
						pages: [
							{url: 'https://obj-a.com', extra: 'noise'},
							{url: 'https://obj-b.com'},
						],
					},
					isError: false,
					ts: 2000,
				},
			}),
		)
		expect(html).toContain('https://obj-a.com')
		expect(html).toContain('https://obj-b.com')
	})
})

// ─────────────────────────────────────────────────────────────────────
// Pure helper coverage
// ─────────────────────────────────────────────────────────────────────

describe('extractTargetUrl', () => {
	it('finds url field', () => {
		expect(extractTargetUrl({url: 'https://x.com'})).toBe('https://x.com')
	})
	it('finds target alias', () => {
		expect(extractTargetUrl({target: 'https://t.com'})).toBe('https://t.com')
	})
	it('finds startUrl alias', () => {
		expect(extractTargetUrl({startUrl: 'https://s.com'})).toBe('https://s.com')
	})
	it('finds rootUrl alias', () => {
		expect(extractTargetUrl({rootUrl: 'https://r.com'})).toBe('https://r.com')
	})
	it('returns empty string when no candidate matches', () => {
		expect(extractTargetUrl({other: 'value'})).toBe('')
	})
})

describe('extractPages', () => {
	it('returns array of strings as-is', () => {
		expect(extractPages(['https://a.com', 'https://b.com'])).toEqual([
			'https://a.com',
			'https://b.com',
		])
	})
	it('extracts url from array of {url} objects', () => {
		expect(extractPages([{url: 'https://x.com'}, {url: 'https://y.com'}])).toEqual([
			'https://x.com',
			'https://y.com',
		])
	})
	it('recurses into output.pages', () => {
		expect(extractPages({pages: ['https://a.com']})).toEqual(['https://a.com'])
	})
	it('returns empty array for null', () => {
		expect(extractPages(null)).toEqual([])
	})
	it('returns empty array for primitive string', () => {
		expect(extractPages('not-an-array')).toEqual([])
	})
	it('drops items without url field from object array', () => {
		expect(extractPages([{url: 'https://x.com'}, {other: 'no url'}])).toEqual(['https://x.com'])
	})
})

describe('extractPageCount', () => {
	it('returns explicit pagesCrawled number', () => {
		expect(extractPageCount({pagesCrawled: 42})).toBe(42)
	})
	it('returns null when pagesCrawled is missing', () => {
		expect(extractPageCount({pages: []})).toBeNull()
	})
	it('returns null when pagesCrawled is non-number', () => {
		expect(extractPageCount({pagesCrawled: '42' as unknown as number})).toBeNull()
	})
	it('returns null for null input', () => {
		expect(extractPageCount(null)).toBeNull()
	})
})
