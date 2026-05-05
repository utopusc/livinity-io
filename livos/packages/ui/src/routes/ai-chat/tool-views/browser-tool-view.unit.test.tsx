// @vitest-environment jsdom
//
// Phase 69 Plan 69-01 — BrowserToolView unit tests (VIEWS-02).
//
// `@testing-library/react` is NOT installed in this UI package
// (D-NO-NEW-DEPS — see livos/packages/ui/src/routes/ai-chat/tool-views/
// generic-tool-view.unit.test.tsx for the canonical "RTL absent"
// posture). 69-CONTEXT D-31 explicitly permits using
// `react-dom/server`'s `renderToStaticMarkup` for source-text
// invariants instead of full RTL setup.
//
// Coverage maps to plan 69-01 must_haves:
//   - "renders live mode placeholder for computer-use category"  (D-17)
//   - "renders static mode with screenshot from extractScreenshot" (D-17)
//   - "shows Screenshot pending... for running browser without image"
//     and "shows No screenshot available for done browser without image"
//   - "renders URL bar footer when url present in input" (D-18)
//   - "renders Navigating to URL line for browser-navigate while running"
//   - "renders progress bar at 95% when running" / "100% when done" (D-20)
//   - "renders Running status badge with cyan accent" (D-19)
//   - URL field fallbacks (`href`, `targetUrl`).
//
// References:
//   - .planning/phases/69-per-tool-views-suite/69-CONTEXT.md (D-17..D-20)
//   - .planning/phases/69-per-tool-views-suite/69-01-PLAN.md (must_haves)
//   - livos/packages/ui/src/routes/ai-chat/tool-views/generic-tool-view.unit.test.tsx
//     (RTL-absent precedent, P68-02)

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {renderToStaticMarkup} from 'react-dom/server'
import {describe, expect, it} from 'vitest'

import {BrowserToolView} from './browser-tool-view'
import type {ToolCallSnapshot} from './types'

// ─────────────────────────────────────────────────────────────────────
// Test fixture: a happy-path snapshot for a `browser-navigate` tool
// call that completed successfully and produced a screenshot.
// Override individual fields per test via `mkSnapshot({...})`.
// ─────────────────────────────────────────────────────────────────────

const mkSnapshot = (overrides: Partial<ToolCallSnapshot> = {}): ToolCallSnapshot => ({
	toolId: 'tool-x',
	toolName: 'browser-navigate',
	category: 'browser',
	assistantCall: {input: {url: 'https://example.com'}, ts: 1000},
	status: 'done',
	startedAt: 1000,
	completedAt: 2000,
	toolResult: {
		output: {image_url: 'https://cdn.example.com/screenshot.png'},
		isError: false,
		ts: 2000,
	},
	...overrides,
})

const renderHtml = (s: ToolCallSnapshot) =>
	renderToStaticMarkup(<BrowserToolView snapshot={s} isActive={true} />)

// ─────────────────────────────────────────────────────────────────────
// 1. Render-shape tests — covers D-17..D-20 user-visible contract.
// ─────────────────────────────────────────────────────────────────────

describe('BrowserToolView (D-17..D-20)', () => {
	it('renders static mode with screenshot from extractScreenshot', () => {
		const html = renderHtml(mkSnapshot())
		expect(html).toContain('Browser')
		expect(html).toContain('https://cdn.example.com/screenshot.png')
		expect(html).toContain('<img')
	})

	it('renders live mode placeholder for computer-use category', () => {
		const html = renderHtml(
			mkSnapshot({category: 'computer-use', toolName: 'computer-use-click'}),
		)
		expect(html).toContain('Computer Use')
		expect(html).toContain('Phase 71')
	})

	it('shows Screenshot pending... for running browser without image', () => {
		const html = renderHtml(
			mkSnapshot({
				status: 'running',
				toolResult: {output: {}, isError: false, ts: 2000},
			}),
		)
		expect(html).toContain('Screenshot pending')
	})

	it('shows No screenshot available for done browser without image', () => {
		const html = renderHtml(
			mkSnapshot({
				toolResult: {output: {}, isError: false, ts: 2000},
			}),
		)
		expect(html).toContain('No screenshot available')
	})

	it('renders URL bar footer when url present in input', () => {
		const html = renderHtml(mkSnapshot())
		expect(html).toContain('https://example.com')
		expect(html).toContain('truncate')
	})

	it('renders Navigating to URL line for browser-navigate while running', () => {
		const html = renderHtml(
			mkSnapshot({
				status: 'running',
				toolResult: undefined,
			}),
		)
		expect(html).toContain('Navigating to')
		expect(html).toContain('https://example.com')
	})

	it('does NOT render Navigating line for non-navigate tool', () => {
		const html = renderHtml(
			mkSnapshot({
				toolName: 'browser-click',
				status: 'running',
				toolResult: undefined,
			}),
		)
		expect(html).not.toContain('Navigating to')
	})

	it('renders progress bar at 95% when running', () => {
		const html = renderHtml(mkSnapshot({status: 'running'}))
		expect(html).toMatch(/width:\s*95%/)
	})

	it('renders progress bar at 100% when done', () => {
		const html = renderHtml(mkSnapshot({status: 'done'}))
		expect(html).toMatch(/width:\s*100%/)
	})

	it('does NOT render progress bar when status === error', () => {
		const html = renderHtml(
			mkSnapshot({
				status: 'error',
				toolResult: {output: {}, isError: true, ts: 2000},
			}),
		)
		expect(html).not.toMatch(/width:\s*95%/)
		expect(html).not.toMatch(/width:\s*100%/)
	})

	it('renders Running status badge with cyan accent variant', () => {
		const html = renderHtml(mkSnapshot({status: 'running'}))
		expect(html).toContain('Running')
		// Badge variant `liv-status-running` injects --liv-accent-cyan into
		// the className; this is the wire-level proof of D-19 contract.
		expect(html).toContain('--liv-accent-cyan')
	})

	it('extracts URL from href fallback', () => {
		const html = renderHtml(
			mkSnapshot({
				assistantCall: {input: {href: 'https://alt.example.com'}, ts: 1000},
			}),
		)
		expect(html).toContain('https://alt.example.com')
	})

	it('extracts URL from targetUrl fallback', () => {
		const html = renderHtml(
			mkSnapshot({
				assistantCall: {input: {targetUrl: 'https://target.example.com'}, ts: 1000},
			}),
		)
		expect(html).toContain('https://target.example.com')
	})

	it('omits URL footer when no url/href/targetUrl in input', () => {
		const html = renderHtml(
			mkSnapshot({
				assistantCall: {input: {}, ts: 1000},
			}),
		)
		expect(html).not.toContain('truncate')
	})
})

// ─────────────────────────────────────────────────────────────────────
// 2. Source-text invariants — lock the wire-level rendering contract
//    (mirrors P68-02's generic-tool-view.unit.test.tsx pattern).
// ─────────────────────────────────────────────────────────────────────

describe('browser-tool-view.tsx source-text invariants', () => {
	const sourcePath = resolve(
		process.cwd(),
		'src/routes/ai-chat/tool-views/browser-tool-view.tsx',
	)
	const source = readFileSync(sourcePath, 'utf8')

	it('imports extractScreenshot from ./utils (Plan 69-02 dependency)', () => {
		expect(source).toMatch(/from\s+['"]\.\/utils['"]/)
		expect(source).toMatch(/\bextractScreenshot\b/)
	})

	it('imports LivIcons from P66-04 icon map', () => {
		expect(source).toMatch(/from\s+['"]@\/icons\/liv-icons['"]/)
		expect(source).toMatch(/LivIcons\.browser/)
		expect(source).toMatch(/LivIcons\.screenShare/)
	})

	it('imports Badge from the shadcn primitives', () => {
		expect(source).toMatch(/from\s+['"]@\/shadcn-components\/ui\/badge['"]/)
		expect(source).toMatch(/\bBadge\b/)
	})

	it('uses Badge variant="liv-status-running" for running state (D-19)', () => {
		expect(source).toMatch(/variant=['"]liv-status-running['"]/)
	})

	it('does NOT import react-vnc or VncScreen (D-12 forbids new deps)', () => {
		expect(source).not.toMatch(/from\s+['"]react-vnc['"]/)
		expect(source).not.toMatch(/\bVncScreen\b/)
	})

	it('uses liv-glass utility class on the live-mode placeholder (D-17)', () => {
		expect(source).toMatch(/\bliv-glass\b/)
	})

	it('progress bar uses 95% width while running and 100% when done (D-20)', () => {
		expect(source).toMatch(/width:\s*['"]95%['"]/)
		expect(source).toMatch(/width:\s*['"]100%['"]/)
	})

	it('done-state progress bar uses transition-all duration-200 (D-20)', () => {
		expect(source).toMatch(/transition-all\s+duration-200/)
	})

	it('URL footer truncates with max-w-[200px] (D-18)', () => {
		expect(source).toMatch(/max-w-\[200px\]/)
	})
})
