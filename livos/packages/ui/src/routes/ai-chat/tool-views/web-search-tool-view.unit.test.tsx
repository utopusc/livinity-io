// @vitest-environment jsdom
//
// Phase 69 Plan 69-03 — WebSearchToolView unit tests (D-24).
//
// Uses `renderToStaticMarkup` from `react-dom/server` (react-dom is
// already a dep — D-NO-NEW-DEPS preserved). No `@testing-library/react`
// required — we assert against the static HTML string output.
//
// Test surface:
//  1. results rendering (title + URL + snippet)
//  2. favicon URL construction (Google s2 service)
//  3. empty results → "No results"
//  4. missing toolResult → "Searching..."
//  5. malformed output (string) → "No results"
//  6. output as array directly (not wrapped in {results: ...})
//  7. +N more cap (over MAX_VISIBLE = 10)
//  8. security attrs (target=_blank, rel=noopener noreferrer)
//  9. fallback to URL when title missing
//  10. pure-helper unit tests (extractResults, extractQuery, getFavicon)

import {describe, expect, it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'

import {extractQuery, extractResults, getFavicon, WebSearchToolView} from './web-search-tool-view'
import type {ToolCallSnapshot} from './types'

const mkSnapshot = (overrides: Partial<ToolCallSnapshot> = {}): ToolCallSnapshot => ({
	toolId: 'tool-x',
	toolName: 'web-search',
	category: 'webSearch',
	assistantCall: {input: {query: 'best ramen NYC'}, ts: 1000},
	status: 'done',
	startedAt: 1000,
	completedAt: 2000,
	toolResult: {
		output: {
			results: [
				{
					title: 'Top 10 Ramen Spots',
					url: 'https://example.com/ramen',
					snippet: 'A guide to NYC ramen.',
				},
				{title: 'Ramen Lab', url: 'https://lab.example.com', snippet: 'Reviews and recipes.'},
			],
		},
		isError: false,
		ts: 2000,
	},
	...overrides,
})

const renderHtml = (s: ToolCallSnapshot) =>
	renderToStaticMarkup(<WebSearchToolView snapshot={s} isActive={true} />)

describe('WebSearchToolView (D-24)', () => {
	it('renders query and results with favicon URLs', () => {
		const html = renderHtml(mkSnapshot())
		expect(html).toContain('best ramen NYC')
		expect(html).toContain('Top 10 Ramen Spots')
		expect(html).toContain('Ramen Lab')
		expect(html).toContain('s2/favicons?domain=example.com')
	})

	it('shows Searching... when toolResult undefined', () => {
		const html = renderHtml(mkSnapshot({toolResult: undefined, status: 'running'}))
		expect(html).toContain('Searching')
	})

	it('shows No results for empty results array', () => {
		const html = renderHtml(
			mkSnapshot({toolResult: {output: {results: []}, isError: false, ts: 2000}}),
		)
		expect(html).toContain('No results')
	})

	it('handles output as array directly (not wrapped in {results: ...})', () => {
		const html = renderHtml(
			mkSnapshot({
				toolResult: {
					output: [{title: 'Direct Array', url: 'https://x.com', snippet: 'works'}],
					isError: false,
					ts: 2000,
				},
			}),
		)
		expect(html).toContain('Direct Array')
	})

	it('handles malformed output (string, no results)', () => {
		const html = renderHtml(
			mkSnapshot({
				toolResult: {output: 'I searched and found stuff', isError: false, ts: 2000},
			}),
		)
		expect(html).toContain('No results')
	})

	it('renders +N more when results exceed 10', () => {
		const many = Array.from({length: 15}, (_, i) => ({
			title: `Result ${i}`,
			url: `https://example.com/${i}`,
			snippet: 'snippet',
		}))
		const html = renderHtml(
			mkSnapshot({toolResult: {output: {results: many}, isError: false, ts: 2000}}),
		)
		expect(html).toContain('+5 more')
	})

	it('uses target=_blank with rel=noopener noreferrer (security attrs)', () => {
		const html = renderHtml(mkSnapshot())
		expect(html).toContain('target="_blank"')
		expect(html).toContain('rel="noopener noreferrer"')
	})

	it('falls back to URL when title missing', () => {
		const html = renderHtml(
			mkSnapshot({
				toolResult: {
					output: {results: [{url: 'https://only-url.com'}]},
					isError: false,
					ts: 2000,
				},
			}),
		)
		expect(html).toContain('https://only-url.com')
	})

	it('uses description as fallback when snippet missing', () => {
		const html = renderHtml(
			mkSnapshot({
				toolResult: {
					output: {
						results: [
							{title: 'Hit', url: 'https://hit.example', description: 'desc-only payload'},
						],
					},
					isError: false,
					ts: 2000,
				},
			}),
		)
		expect(html).toContain('desc-only payload')
	})
})

// ─────────────────────────────────────────────────────────────────────
// Pure helper coverage — D-NO-NEW-DEPS-friendly direct invocation
// ─────────────────────────────────────────────────────────────────────

describe('extractQuery', () => {
	it('finds query field', () => {
		expect(extractQuery({query: 'foo'})).toBe('foo')
	})
	it('finds q alias', () => {
		expect(extractQuery({q: 'bar'})).toBe('bar')
	})
	it('finds search alias', () => {
		expect(extractQuery({search: 'baz'})).toBe('baz')
	})
	it('finds searchQuery alias', () => {
		expect(extractQuery({searchQuery: 'qux'})).toBe('qux')
	})
	it('returns empty string when no candidate matches', () => {
		expect(extractQuery({other: 'value'})).toBe('')
	})
	it('ignores non-string values for known keys', () => {
		expect(extractQuery({query: 42 as unknown as string})).toBe('')
	})
})

describe('extractResults', () => {
	it('returns array directly when output is an array', () => {
		const a = [{title: 't', url: 'https://x.com'}]
		expect(extractResults(a)).toBe(a)
	})
	it('returns output.results when output is an object with results array', () => {
		const r = [{title: 't'}]
		expect(extractResults({results: r})).toBe(r)
	})
	it('returns empty array for null', () => {
		expect(extractResults(null)).toEqual([])
	})
	it('returns empty array for primitive string', () => {
		expect(extractResults('not a results payload')).toEqual([])
	})
	it('returns empty array for object without results key', () => {
		expect(extractResults({other: 'thing'})).toEqual([])
	})
	it('returns empty array for object with non-array results key', () => {
		expect(extractResults({results: 'not-array'})).toEqual([])
	})
})

describe('getFavicon', () => {
	it('returns Google s2 URL for valid http URL', () => {
		expect(getFavicon('https://example.com/path')).toBe(
			'https://www.google.com/s2/favicons?domain=example.com&sz=32',
		)
	})
	it('returns null for undefined input', () => {
		expect(getFavicon(undefined)).toBeNull()
	})
	it('returns null for empty string', () => {
		expect(getFavicon('')).toBeNull()
	})
	it('returns null for invalid URL (does not throw)', () => {
		expect(() => getFavicon('not-a-url')).not.toThrow()
		expect(getFavicon('not-a-url')).toBeNull()
	})
})
