// Phase 69 Plan 69-02 — utils.tsx unit tests (CONTEXT D-09).
//
// Covers:
//   - getUserFriendlyToolName (4 cases)
//   - getToolIcon (8 cases — all 9 ladder branches + fallback)
//   - colorizeDiff (5 cases — empty, +, -, context, mixed)
//   - extractScreenshot (9 cases — 4 strategies + null/undefined/unmatched)
//   - isVisualTool re-export (2 cases — store delegation)
//
// Total: 28 it() cases, well above the 12+ minimum specified in
// 69-02-PLAN.md must_haves.
//
// D-NO-NEW-DEPS: tests use only `vitest` + `react`'s `isValidElement`.
// No RTL, no JSDOM render. `colorizeDiff` returns React.ReactNode[];
// we inspect the `props.className` of each element directly — the same
// pattern is used by `dispatcher.unit.test.tsx` (Phase 68-04) and
// `generic-tool-view.unit.test.tsx` (Phase 68-02).

import {isValidElement} from 'react'

import {describe, expect, it} from 'vitest'

import {LivIcons} from '@/icons/liv-icons'

import {
	colorizeDiff,
	extractScreenshot,
	getToolIcon,
	getUserFriendlyToolName,
	isVisualTool,
} from './utils'

// ─────────────────────────────────────────────────────────────────────
// 1. getUserFriendlyToolName (D-09 — Suna title-case pattern)
// ─────────────────────────────────────────────────────────────────────

describe('getUserFriendlyToolName (D-09)', () => {
	it('title-cases hyphenated names', () => {
		expect(getUserFriendlyToolName('browser-navigate')).toBe('Browser Navigate')
	})

	it('title-cases underscored names', () => {
		expect(getUserFriendlyToolName('execute_command')).toBe('Execute Command')
	})

	it('handles mcp prefix (snake_case multi-word)', () => {
		expect(getUserFriendlyToolName('mcp_brave_search')).toBe('Mcp Brave Search')
	})

	it('returns empty for empty input', () => {
		expect(getUserFriendlyToolName('')).toBe('')
	})
})

// ─────────────────────────────────────────────────────────────────────
// 2. getToolIcon (D-09 — prefix ladder)
// ─────────────────────────────────────────────────────────────────────

describe('getToolIcon (D-09)', () => {
	it('returns browser icon for browser-* tools', () => {
		expect(getToolIcon('browser-navigate')).toBe(LivIcons.browser)
		expect(getToolIcon('browser-click')).toBe(LivIcons.browser)
	})

	it('returns screenShare icon for computer-use and screenshot', () => {
		expect(getToolIcon('computer-use-click')).toBe(LivIcons.screenShare)
		expect(getToolIcon('screenshot')).toBe(LivIcons.screenShare)
	})

	it('returns terminal icon for execute-* tools', () => {
		expect(getToolIcon('execute-command')).toBe(LivIcons.terminal)
		expect(getToolIcon('run-command')).toBe(LivIcons.terminal)
	})

	it('returns fileEdit for str-replace', () => {
		expect(getToolIcon('str-replace')).toBe(LivIcons.fileEdit)
	})

	it('returns file for read/write/delete file ops', () => {
		expect(getToolIcon('read-file')).toBe(LivIcons.file)
		expect(getToolIcon('file-write')).toBe(LivIcons.file)
		expect(getToolIcon('delete-file')).toBe(LivIcons.file)
		expect(getToolIcon('list')).toBe(LivIcons.file)
	})

	it('returns web icons for web tools', () => {
		expect(getToolIcon('web-search')).toBe(LivIcons.webSearch)
		expect(getToolIcon('web-crawl')).toBe(LivIcons.webCrawl)
		expect(getToolIcon('web-scrape')).toBe(LivIcons.webScrape)
	})

	it('returns mcp for mcp_ and mcp- prefixes', () => {
		expect(getToolIcon('mcp_brave_search')).toBe(LivIcons.mcp)
		expect(getToolIcon('mcp-anthropic-search')).toBe(LivIcons.mcp)
	})

	it('returns generic fallback for unknown', () => {
		expect(getToolIcon('totally-unknown-tool')).toBe(LivIcons.generic)
		expect(getToolIcon('')).toBe(LivIcons.generic)
	})
})

// ─────────────────────────────────────────────────────────────────────
// 3. colorizeDiff (D-09 — emerald +, rose -, muted other)
// ─────────────────────────────────────────────────────────────────────

describe('colorizeDiff (D-09)', () => {
	it('returns empty array for empty input', () => {
		expect(colorizeDiff('')).toEqual([])
	})

	it('produces emerald class for + lines', () => {
		const result = colorizeDiff('+added line')
		expect(result.length).toBe(1)
		const el = result[0]
		expect(isValidElement(el)).toBe(true)
		const className = (el as {props: {className: string}}).props.className
		expect(className).toContain('emerald')
	})

	it('produces rose class for - lines', () => {
		const result = colorizeDiff('-removed line')
		expect(result.length).toBe(1)
		const el = result[0]
		const className = (el as {props: {className: string}}).props.className
		expect(className).toContain('rose')
	})

	it('produces muted class for context lines', () => {
		const result = colorizeDiff('context line')
		expect(result.length).toBe(1)
		const el = result[0]
		const className = (el as {props: {className: string}}).props.className
		expect(className).toContain('text-secondary')
	})

	it('handles multi-line mixed diff with all three colors', () => {
		const result = colorizeDiff('-old\n+new\ncontext')
		expect(result.length).toBe(3)
		const cls0 = (result[0] as {props: {className: string}}).props.className
		const cls1 = (result[1] as {props: {className: string}}).props.className
		const cls2 = (result[2] as {props: {className: string}}).props.className
		expect(cls0).toContain('rose')
		expect(cls1).toContain('emerald')
		expect(cls2).toContain('text-secondary')
	})
})

// ─────────────────────────────────────────────────────────────────────
// 4. extractScreenshot (D-09 — 4-strategy Suna parser)
// ─────────────────────────────────────────────────────────────────────

describe('extractScreenshot (D-09)', () => {
	it('returns null for null/undefined', () => {
		expect(extractScreenshot(null)).toBeNull()
		expect(extractScreenshot(undefined)).toBeNull()
	})

	it('strategy 1: object with content array containing image source', () => {
		const result = extractScreenshot({
			content: [{type: 'image', source: {data: 'BASE64ABCD', media_type: 'image/jpeg'}}],
		})
		expect(result).toBe('data:image/jpeg;base64,BASE64ABCD')
	})

	it('strategy 1: defaults to image/png when media_type missing', () => {
		const result = extractScreenshot({
			content: [{type: 'image', source: {data: 'XYZ'}}],
		})
		expect(result).toBe('data:image/png;base64,XYZ')
	})

	it('strategy 1: returns null when content has no image item', () => {
		expect(extractScreenshot({content: [{type: 'text', text: 'hi'}]})).toBeNull()
	})

	it('strategy 2: ToolResult regex with URL is returned as-is', () => {
		const result = extractScreenshot("ToolResult(output='https://example.com/img.png')")
		expect(result).toBe('https://example.com/img.png')
	})

	it('strategy 2: ToolResult regex with data: URL is returned as-is', () => {
		const result = extractScreenshot("ToolResult(output='data:image/jpeg;base64,ABC')")
		expect(result).toBe('data:image/jpeg;base64,ABC')
	})

	it('strategy 2: ToolResult regex with raw base64 is best-guess wrapped', () => {
		const result = extractScreenshot("ToolResult(output='BASE64DATA')")
		expect(result).toBe('data:image/png;base64,BASE64DATA')
	})

	it('strategy 3: object with image_url field', () => {
		expect(extractScreenshot({image_url: 'https://x.com/y.png'})).toBe('https://x.com/y.png')
	})

	it('returns null when no strategy matches (object)', () => {
		expect(extractScreenshot({foo: 'bar'})).toBeNull()
	})

	it('returns null when no strategy matches (random string)', () => {
		expect(extractScreenshot('random string with no match')).toBeNull()
	})

	it('messages arg is accepted but unused in P69 (TODO P75)', () => {
		// Strategy 4 is reserved for P75; for now the messages arg is silently ignored.
		expect(extractScreenshot(null, [{role: 'assistant', content: 'hi'}])).toBeNull()
	})
})

// ─────────────────────────────────────────────────────────────────────
// 5. isVisualTool re-export (D-09 — store delegation)
// ─────────────────────────────────────────────────────────────────────

describe('isVisualTool re-export (D-09)', () => {
	it('delegates to store regex (browser-* matches)', () => {
		expect(isVisualTool('browser-navigate')).toBe(true)
	})

	it('returns false for non-visual tools', () => {
		expect(isVisualTool('execute-command')).toBe(false)
	})

	it('matches computer-use-* tools', () => {
		expect(isVisualTool('computer-use-click')).toBe(true)
	})

	it('matches screenshot tool', () => {
		expect(isVisualTool('screenshot')).toBe(true)
	})
})
