// Phase 68-04 → 69-05 — getToolView routing tests (CONTEXT D-20 + 69-CONTEXT D-28).
//
// P68 shipped this test file with all cases asserting `toBe(GenericToolView)`
// because the dispatcher fell through to the safe fallback. P69-05 wires the
// 8 specific views, so each routing assertion now flips to its specific view
// (BrowserToolView, CommandToolView, etc.). The default fallback path is
// preserved and verified for unknown tool names.
//
// D-NO-NEW-DEPS: pure-function dispatcher, no React rendering required.
// useToolView is intentionally NOT exercised here — testing a hook
// requires @testing-library/react which P68 forbids. The hook is a thin
// useMemo wrapper around getToolView; covering getToolView covers the
// useful behavior.

import type {FC} from 'react'
import {describe, expect, it} from 'vitest'

import {BrowserToolView} from './browser-tool-view'
import {CommandToolView} from './command-tool-view'
import {getToolView} from './dispatcher'
import {FileOperationToolView} from './file-operation-tool-view'
import {GenericToolView} from './generic-tool-view'
import {McpToolView} from './mcp-tool-view'
import {StrReplaceToolView} from './str-replace-tool-view'
import {WebCrawlToolView} from './web-crawl-tool-view'
import {WebScrapeToolView} from './web-scrape-tool-view'
import {WebSearchToolView} from './web-search-tool-view'

describe('getToolView (CONTEXT D-20 + 69-CONTEXT D-28)', () => {
	describe('Browser routing', () => {
		it('routes browser-* to BrowserToolView', () => {
			expect(getToolView('browser-navigate')).toBe(BrowserToolView)
			expect(getToolView('browser-click')).toBe(BrowserToolView)
			expect(getToolView('browser-screenshot')).toBe(BrowserToolView)
		})
		it('routes computer-use-* to BrowserToolView', () => {
			expect(getToolView('computer-use-screenshot')).toBe(BrowserToolView)
			expect(getToolView('computer-use-click')).toBe(BrowserToolView)
			expect(getToolView('computer-use-type')).toBe(BrowserToolView)
		})
		it('routes screenshot tools to BrowserToolView', () => {
			expect(getToolView('screenshot')).toBe(BrowserToolView)
			expect(getToolView('screenshot-region')).toBe(BrowserToolView)
		})
	})

	describe('Command routing', () => {
		it('routes execute-* to CommandToolView', () => {
			expect(getToolView('execute-command')).toBe(CommandToolView)
			expect(getToolView('execute-shell')).toBe(CommandToolView)
		})
		it('routes run-command exact match', () => {
			expect(getToolView('run-command')).toBe(CommandToolView)
		})
	})

	describe('FileOperation routing', () => {
		it('routes file-* to FileOperationToolView', () => {
			expect(getToolView('file-read')).toBe(FileOperationToolView)
			expect(getToolView('file-write')).toBe(FileOperationToolView)
			expect(getToolView('file-delete')).toBe(FileOperationToolView)
		})
		it('routes read-file / write-file exact matches', () => {
			expect(getToolView('read-file')).toBe(FileOperationToolView)
			expect(getToolView('write-file')).toBe(FileOperationToolView)
		})
	})

	describe('StrReplace routing', () => {
		it('routes str-replace and str-replace-editor', () => {
			expect(getToolView('str-replace')).toBe(StrReplaceToolView)
			expect(getToolView('str-replace-editor')).toBe(StrReplaceToolView)
		})
	})

	describe('Web routing', () => {
		it('routes web-search / search-web to WebSearchToolView', () => {
			expect(getToolView('web-search')).toBe(WebSearchToolView)
			expect(getToolView('search-web')).toBe(WebSearchToolView)
		})
		it('routes web-crawl / crawl-website to WebCrawlToolView', () => {
			expect(getToolView('web-crawl')).toBe(WebCrawlToolView)
			expect(getToolView('crawl-website')).toBe(WebCrawlToolView)
		})
		it('routes web-scrape / scrape-page to WebScrapeToolView', () => {
			expect(getToolView('web-scrape')).toBe(WebScrapeToolView)
			expect(getToolView('scrape-page')).toBe(WebScrapeToolView)
		})
	})

	describe('MCP routing', () => {
		it('routes mcp_* and mcp-* to McpToolView', () => {
			expect(getToolView('mcp_brave_search')).toBe(McpToolView)
			expect(getToolView('mcp-anthropic-search')).toBe(McpToolView)
			expect(getToolView('mcp_filesystem_read')).toBe(McpToolView)
		})
	})

	describe('Fallback', () => {
		it('returns GenericToolView for unknown tool names', () => {
			expect(getToolView('completely-unknown-tool')).toBe(GenericToolView)
			expect(getToolView('')).toBe(GenericToolView)
		})
		it('returns same component reference on repeated calls (no closure leak)', () => {
			const a = getToolView('browser-navigate')
			const b = getToolView('browser-navigate')
			expect(a).toBe(b)
		})
	})

	describe('Routing exclusivity (no overlap regressions)', () => {
		// Each major category must NOT route to GenericToolView
		const cases: Array<[string, FC<unknown>]> = [
			['browser-navigate', BrowserToolView as FC<unknown>],
			['computer-use-click', BrowserToolView as FC<unknown>],
			['screenshot', BrowserToolView as FC<unknown>],
			['execute-command', CommandToolView as FC<unknown>],
			['file-read', FileOperationToolView as FC<unknown>],
			['str-replace', StrReplaceToolView as FC<unknown>],
			['web-search', WebSearchToolView as FC<unknown>],
			['web-crawl', WebCrawlToolView as FC<unknown>],
			['web-scrape', WebScrapeToolView as FC<unknown>],
			['mcp_brave_search', McpToolView as FC<unknown>],
		]
		it.each(cases)('routes "%s" to its specific view (NOT GenericToolView)', (toolName, expected) => {
			const view = getToolView(toolName)
			expect(view).toBe(expected)
			expect(view).not.toBe(GenericToolView)
		})
	})
})
