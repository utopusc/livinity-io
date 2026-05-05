// @vitest-environment jsdom
//
// Phase 69 Plan 69-04 — McpToolView unit tests.
//
// Pattern: react-dom/server's `renderToStaticMarkup` for static-HTML
// invariants — sufficient because McpToolView has NO ticking effects
// and NO event handlers (it's a pure projection of `snapshot.*` to JSX).
// Established `react-dom/client` mount harness from inline-tool-pill is
// reserved for components with effects + interactions (LivToolRow).
//
// Coverage (matches 69-04-PLAN.md must-have "5+ tests"):
//   1. extractServerName parsing — 4 helper-level tests:
//      - mcp_<server>_<tool> three-segment underscore form
//      - mcp-<server>-<tool> three-segment hyphen form
//      - mcp_<short> two-segment fallback ('MCP')
//      - non-mcp prefix fallback ('MCP')
//   2. JSX rendering — 4 component-level tests:
//      - args block renders pretty JSON
//      - result block renders pretty JSON when present
//      - 'Pending...' shown when toolResult undefined
//      - error status applies rose accent class
//
// References:
//   - .planning/phases/69-per-tool-views-suite/69-CONTEXT.md (D-27)
//   - .planning/v31-DRAFT.md lines 465-468

import {renderToStaticMarkup} from 'react-dom/server'
import {describe, expect, it} from 'vitest'

import {extractServerName, McpToolView} from './mcp-tool-view'
import type {ToolCallSnapshot} from './types'

const mkSnapshot = (overrides: Partial<ToolCallSnapshot> = {}): ToolCallSnapshot => ({
	toolId: 'tool-x',
	toolName: 'mcp_brave_search',
	category: 'mcp',
	assistantCall: {input: {query: 'liv ramen', count: 5}, ts: 1000},
	status: 'done',
	startedAt: 1000,
	completedAt: 2000,
	toolResult: {
		output: {results: [{title: 'a', url: 'https://x.com'}]},
		isError: false,
		ts: 2000,
	},
	...overrides,
})

const renderHtml = (s: ToolCallSnapshot) =>
	renderToStaticMarkup(<McpToolView snapshot={s} isActive={true} />)

// ─────────────────────────────────────────────────────────────────────
// 1. extractServerName — pure helper parsing tests
// ─────────────────────────────────────────────────────────────────────

describe('extractServerName (D-27 — Mcp toolName parsing)', () => {
	it('parses mcp_<server>_<tool> underscore form', () => {
		expect(extractServerName('mcp_brave_search')).toBe('brave')
	})

	it('parses mcp-<server>-<tool> hyphen form', () => {
		expect(extractServerName('mcp-anthropic-search')).toBe('anthropic')
	})

	it('parses mcp_<server>_<tool> with extra suffix segments', () => {
		// `mcp_only_two` has 3 parts → returns parts[1]='only' (length>=3 satisfied).
		expect(extractServerName('mcp_only_two')).toBe('only')
	})

	it('falls back to MCP when only mcp_ prefix without tool segment', () => {
		expect(extractServerName('mcp_one')).toBe('MCP')
	})

	it('falls back to MCP when only mcp- prefix without tool segment', () => {
		expect(extractServerName('mcp-one')).toBe('MCP')
	})

	it('falls back to MCP when no mcp prefix', () => {
		expect(extractServerName('not-mcp')).toBe('MCP')
		expect(extractServerName('execute-command')).toBe('MCP')
	})
})

// ─────────────────────────────────────────────────────────────────────
// 2. McpToolView — component-level static-HTML invariants
// ─────────────────────────────────────────────────────────────────────

describe('McpToolView (D-27)', () => {
	it('parses mcp_<server>_<tool> server name into Badge', () => {
		const html = renderHtml(mkSnapshot({toolName: 'mcp_brave_search'}))
		expect(html).toContain('brave')
		expect(html).toContain('mcp_brave_search')
	})

	it('parses mcp-<server>-<tool> alternate format into Badge', () => {
		const html = renderHtml(mkSnapshot({toolName: 'mcp-anthropic-search'}))
		expect(html).toContain('anthropic')
	})

	it('falls back to MCP for unparseable name (only mcp_)', () => {
		const html = renderHtml(mkSnapshot({toolName: 'mcp_only'}))
		expect(html).toContain('MCP')
	})

	it('renders args as pretty JSON', () => {
		const html = renderHtml(mkSnapshot())
		expect(html).toContain('Args')
		expect(html).toContain('liv ramen')
		expect(html).toContain('&quot;count&quot;: 5')
	})

	it('renders result as pretty JSON when present', () => {
		const html = renderHtml(mkSnapshot())
		expect(html).toContain('Result')
		expect(html).toContain('&quot;title&quot;: &quot;a&quot;')
	})

	it('shows Pending... when toolResult undefined', () => {
		const html = renderHtml(mkSnapshot({toolResult: undefined, status: 'running'}))
		expect(html).toContain('Pending')
	})

	it('applies rose accent on error status', () => {
		const html = renderHtml(
			mkSnapshot({
				status: 'error',
				toolResult: {output: {error: 'rate-limited'}, isError: true, ts: 2000},
			}),
		)
		expect(html).toContain('rose')
	})
})
