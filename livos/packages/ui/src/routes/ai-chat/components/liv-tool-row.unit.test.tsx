// @vitest-environment jsdom
//
// Phase 69 Plan 69-04 — LivToolRow component tests.
//
// Pattern: react-dom/server's `renderToStaticMarkup` for static-HTML
// invariants. SSR does not run `useEffect` (tickers stay quiet) but
// `useState(initializer)` DOES execute, so the elapsed-timer initial
// value reflects the mocked `Date.now()` — perfect for a snapshot of
// the rendered timer text without juggling fake timers in jsdom.
//
// `@testing-library/react` is NOT installed (D-NO-NEW-DEPS, Phase
// 25/30/33/38/62/67-04 precedent). The renderToStaticMarkup approach
// is the same pattern used by McpToolView (sibling test) and matches
// 69-04-PLAN.md reference signatures.
//
// Coverage (≥ 7 tests per plan must-have, this file ships 13):
//   1. running status → cyan + animate-pulse dot
//   2. done status → emerald static dot
//   3. error status → rose static dot
//   4. visual tool (browser-*) → border-l-2 + data-visual=true
//   5. visual tool (computer-use-*) → border-l-2 + data-visual=true
//   6. non-visual tool → NO border-l-2 + data-visual=false
//   7. user-friendly name displayed
//   8. elapsed timer for done state (static math)
//   9. elapsed timer for running state (Date.now mock)
//   10. defensive completedAt undefined fallback
//   11. data-tool-id attribute
//   12. role=button + tabIndex (a11y)
//   13. chevron right icon SVG present
//
// References:
//   - .planning/phases/69-per-tool-views-suite/69-CONTEXT.md (D-13..D-16)
//   - .planning/v31-DRAFT.md lines 404-419
//   - livos/packages/ui/src/components/inline-tool-pill.unit.test.tsx
//     — sibling P68-03 pattern (react-dom/client mount; we use SSR here
//     for parity with McpToolView).

import {renderToStaticMarkup} from 'react-dom/server'
import {describe, expect, it} from 'vitest'

import {LivToolRow} from './liv-tool-row'
import type {ToolCallSnapshot} from '@/routes/ai-chat/tool-views/types'

const mkSnapshot = (overrides: Partial<ToolCallSnapshot> = {}): ToolCallSnapshot => ({
	toolId: 'tool-x',
	toolName: 'execute-command',
	category: 'terminal',
	assistantCall: {input: {command: 'ls'}, ts: 1000},
	status: 'done',
	startedAt: 1000,
	completedAt: 3500,
	...overrides,
})

const renderHtml = (s: ToolCallSnapshot, onClick: () => void = () => {}) =>
	renderToStaticMarkup(<LivToolRow toolCall={s} onClick={onClick} />)

describe('LivToolRow status dot (D-15)', () => {
	it('renders running status with cyan animate-pulse dot', () => {
		const html = renderHtml(mkSnapshot({status: 'running', completedAt: undefined}))
		expect(html).toContain('animate-pulse')
		expect(html).toContain('cyan')
	})

	it('renders done status with emerald static dot', () => {
		const html = renderHtml(mkSnapshot({status: 'done'}))
		expect(html).toContain('emerald')
		expect(html).not.toContain('animate-pulse')
	})

	it('renders error status with rose static dot', () => {
		const html = renderHtml(mkSnapshot({status: 'error'}))
		expect(html).toContain('rose')
	})
})

describe('LivToolRow visual-tool border accent (D-15)', () => {
	it('shows cyan left-border accent for visual tools (browser-*)', () => {
		const html = renderHtml(mkSnapshot({toolName: 'browser-navigate'}))
		expect(html).toContain('border-l-2')
		expect(html).toContain('data-visual="true"')
	})

	it('shows cyan left-border accent for computer-use-* tools', () => {
		const html = renderHtml(mkSnapshot({toolName: 'computer-use-click'}))
		expect(html).toContain('border-l-2')
		expect(html).toContain('data-visual="true"')
	})

	it('does NOT show left-border accent for non-visual tools', () => {
		const html = renderHtml(mkSnapshot({toolName: 'execute-command'}))
		expect(html).not.toContain('border-l-2')
		expect(html).toContain('data-visual="false"')
	})
})

describe('LivToolRow friendly name + chevron (D-15)', () => {
	it('renders user-friendly tool name', () => {
		const html = renderHtml(mkSnapshot({toolName: 'browser-navigate'}))
		expect(html).toContain('Browser Navigate')
	})

	it('renders chevron right icon (svg)', () => {
		const html = renderHtml(mkSnapshot())
		// Tabler icons render as <svg>; just confirm one is present.
		expect(html).toMatch(/<svg/)
	})
})

describe('LivToolRow elapsed timer (D-15)', () => {
	it('renders elapsed timer for done state with duration', () => {
		const html = renderHtml(mkSnapshot({startedAt: 1000, completedAt: 3500}))
		expect(html).toContain('2.5s')
	})

	it('renders elapsed timer for running with current duration (snapshot)', () => {
		// Mock Date.now to be 5000 → elapsed should be 4.0s for startedAt=1000.
		const realNow = Date.now
		Date.now = () => 5000
		try {
			const html = renderHtml(
				mkSnapshot({status: 'running', startedAt: 1000, completedAt: undefined}),
			)
			expect(html).toMatch(/[34]\.0s/) // close to 4.0s; allow rounding
		} finally {
			Date.now = realNow
		}
	})

	it('falls back gracefully when completedAt missing on done state', () => {
		// Defensive: completedAt undefined for done state (shouldn't happen
		// per data model, but should not crash).
		const html = renderHtml(mkSnapshot({status: 'done', completedAt: undefined}))
		expect(html).toContain('s</span>') // timer renders SOME value
	})
})

describe('LivToolRow accessibility + DOM hooks (D-14, D-16)', () => {
	it('sets data-tool-id attribute', () => {
		const html = renderHtml(mkSnapshot({toolId: 'unique-tool-abc'}))
		expect(html).toContain('data-tool-id="unique-tool-abc"')
	})

	it('outer container has role=button and tabIndex for keyboard a11y', () => {
		const html = renderHtml(mkSnapshot())
		expect(html).toContain('role="button"')
		expect(html).toContain('tabindex="0"')
	})
})
