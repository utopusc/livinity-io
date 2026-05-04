// @vitest-environment jsdom
//
// Phase 68 Plan 68-03 — InlineToolPill component tests.
//
// `@testing-library/react` is NOT installed in this UI package
// (D-NO-NEW-DEPS, established Phase 25/30/33/38/62/67-04 precedent — see
// livos/packages/ui/src/lib/use-liv-agent-stream.unit.test.tsx for the
// canonical "RTL absent" testing posture).
//
// Per that precedent, this file ships **direct react-dom/client renders**
// against the jsdom DOM — covering the same behaviours that
// @testing-library/react would (mount, query by data-testid / text content,
// dispatch click events) without requiring a new dependency. This is a
// strict superset of the smoke + source-text invariant pattern: real DOM
// render + real click event + real className assertions.
//
// Coverage:
//   1. getUserFriendlyToolName — pure helper, 4 transformation cases.
//   2. InlineToolPill rendering — name display, visual-tool border,
//      non-visual no-border.
//   3. InlineToolPill interactions — click handler fires, animate-pulse on
//      running status, no animate-pulse on done status.
//
// References:
//   - .planning/phases/68-side-panel-tool-view-dispatcher/68-CONTEXT.md (D-26..D-28a)
//   - .planning/phases/68-side-panel-tool-view-dispatcher/68-03-PLAN.md
//   - livos/packages/ui/src/lib/use-liv-agent-stream.unit.test.tsx — RTL-absent precedent

import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {
	InlineToolPill,
	getUserFriendlyToolName,
	isVisualTool,
	type ToolCallSnapshot,
} from './inline-tool-pill'

// ─────────────────────────────────────────────────────────────────────
// Test harness — minimal react-dom/client mount that mimics
// @testing-library/react's render/cleanup lifecycle.
// ─────────────────────────────────────────────────────────────────────

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
	container = document.createElement('div')
	document.body.appendChild(container)
	root = createRoot(container)
})

afterEach(() => {
	if (root) {
		act(() => {
			root!.unmount()
		})
		root = null
	}
	if (container && container.parentNode) {
		container.parentNode.removeChild(container)
	}
	container = null
})

const renderPill = (props: Parameters<typeof InlineToolPill>[0]) => {
	act(() => {
		root!.render(<InlineToolPill {...props} />)
	})
	return container!
}

const makeSnapshot = (overrides: Partial<ToolCallSnapshot> = {}): ToolCallSnapshot => ({
	toolId: 't-1',
	toolName: 'execute-command',
	category: 'terminal',
	assistantCall: {input: {}, ts: 1000},
	status: 'running',
	startedAt: 1000,
	...overrides,
})

// ─────────────────────────────────────────────────────────────────────
// 1. getUserFriendlyToolName — pure helper transformation tests
// ─────────────────────────────────────────────────────────────────────

describe('getUserFriendlyToolName', () => {
	it('converts hyphens to spaces and title-cases (browser-navigate)', () => {
		expect(getUserFriendlyToolName('browser-navigate')).toBe('Browser Navigate')
	})

	it('converts underscores to spaces and title-cases (execute_command)', () => {
		expect(getUserFriendlyToolName('execute_command')).toBe('Execute Command')
	})

	it('handles mixed separators (mcp_brave-search)', () => {
		expect(getUserFriendlyToolName('mcp_brave-search')).toBe('Mcp Brave Search')
	})

	it('returns empty string for empty input', () => {
		expect(getUserFriendlyToolName('')).toBe('')
	})

	it('handles all-uppercase input by lowercasing then capitalizing', () => {
		expect(getUserFriendlyToolName('UPPERCASE')).toBe('Uppercase')
	})

	it('handles 3-segment hyphenated names (computer-use-screenshot)', () => {
		expect(getUserFriendlyToolName('computer-use-screenshot')).toBe('Computer Use Screenshot')
	})
})

// ─────────────────────────────────────────────────────────────────────
// 2. isVisualTool — regex-driven helper (re-declared locally per
//    plan's wave-1 safety; TODO consolidates after 68-01 ships)
// ─────────────────────────────────────────────────────────────────────

describe('isVisualTool', () => {
	it('matches browser-* prefix', () => {
		expect(isVisualTool('browser-navigate')).toBe(true)
		expect(isVisualTool('browser-click')).toBe(true)
	})

	it('matches computer-use-* prefix', () => {
		expect(isVisualTool('computer-use-screenshot')).toBe(true)
		expect(isVisualTool('computer-use-click')).toBe(true)
	})

	it('matches screenshot exactly', () => {
		expect(isVisualTool('screenshot')).toBe(true)
	})

	it('does NOT match non-visual tools', () => {
		expect(isVisualTool('execute-command')).toBe(false)
		expect(isVisualTool('mcp_brave_search')).toBe(false)
		expect(isVisualTool('file-write')).toBe(false)
	})
})

// ─────────────────────────────────────────────────────────────────────
// 3. InlineToolPill rendering — DOM assertions via react-dom/client
// ─────────────────────────────────────────────────────────────────────

describe('InlineToolPill rendering', () => {
	it('renders user-friendly name (browser-navigate → "Browser Navigate")', () => {
		const c = renderPill({
			snapshot: makeSnapshot({toolName: 'browser-navigate'}),
			onClick: () => {},
		})
		expect(c.textContent).toContain('Browser Navigate')
	})

	it('renders as a semantic <button type="button"> element', () => {
		const c = renderPill({
			snapshot: makeSnapshot(),
			onClick: () => {},
		})
		const pill = c.querySelector('[data-testid="inline-tool-pill"]') as HTMLButtonElement
		expect(pill).not.toBeNull()
		expect(pill.tagName).toBe('BUTTON')
		expect(pill.getAttribute('type')).toBe('button')
	})

	it('applies cyan border-l-2 for visual tools (browser-*) — data-visual=true', () => {
		const c = renderPill({
			snapshot: makeSnapshot({toolName: 'browser-navigate'}),
			onClick: () => {},
		})
		const pill = c.querySelector('[data-testid="inline-tool-pill"]') as HTMLButtonElement
		expect(pill.getAttribute('data-visual')).toBe('true')
		expect(pill.className).toContain('border-l-2')
	})

	it('applies cyan border-l-2 for computer-use-* tools', () => {
		const c = renderPill({
			snapshot: makeSnapshot({toolName: 'computer-use-screenshot'}),
			onClick: () => {},
		})
		const pill = c.querySelector('[data-testid="inline-tool-pill"]') as HTMLButtonElement
		expect(pill.getAttribute('data-visual')).toBe('true')
		expect(pill.className).toContain('border-l-2')
	})

	it('does NOT apply border-l-2 for non-visual tools (execute-command) — data-visual=false', () => {
		const c = renderPill({
			snapshot: makeSnapshot({toolName: 'execute-command'}),
			onClick: () => {},
		})
		const pill = c.querySelector('[data-testid="inline-tool-pill"]') as HTMLButtonElement
		expect(pill.getAttribute('data-visual')).toBe('false')
		expect(pill.className).not.toContain('border-l-2')
	})

	it('renders status dot with animate-pulse when status=running', () => {
		const c = renderPill({
			snapshot: makeSnapshot({status: 'running'}),
			onClick: () => {},
		})
		const pulsing = c.querySelector('.animate-pulse')
		expect(pulsing).not.toBeNull()
	})

	it('does NOT render animate-pulse when status=done', () => {
		const c = renderPill({
			snapshot: makeSnapshot({status: 'done', completedAt: 2000}),
			onClick: () => {},
		})
		const pulsing = c.querySelector('.animate-pulse')
		expect(pulsing).toBeNull()
	})

	it('does NOT render animate-pulse when status=error', () => {
		const c = renderPill({
			snapshot: makeSnapshot({status: 'error', completedAt: 2000}),
			onClick: () => {},
		})
		const pulsing = c.querySelector('.animate-pulse')
		expect(pulsing).toBeNull()
	})
})

// ─────────────────────────────────────────────────────────────────────
// 4. InlineToolPill interactions — click handler dispatches
// ─────────────────────────────────────────────────────────────────────

describe('InlineToolPill interactions', () => {
	it('fires onClick when the pill is clicked', () => {
		const onClick = vi.fn()
		const c = renderPill({
			snapshot: makeSnapshot(),
			onClick,
		})
		const pill = c.querySelector('[data-testid="inline-tool-pill"]') as HTMLButtonElement
		act(() => {
			pill.click()
		})
		expect(onClick).toHaveBeenCalledTimes(1)
	})

	it('passes className prop through to the rendered button', () => {
		const c = renderPill({
			snapshot: makeSnapshot(),
			onClick: () => {},
			className: 'custom-extra-class',
		})
		const pill = c.querySelector('[data-testid="inline-tool-pill"]') as HTMLButtonElement
		expect(pill.className).toContain('custom-extra-class')
	})
})

// ─────────────────────────────────────────────────────────────────────
// 5. Source-text invariants — lock down the wave-1 contract so it
//    cannot drift silently before 68-01 / 68-02 / 68-04 land.
// ─────────────────────────────────────────────────────────────────────

describe('inline-tool-pill source-text invariants', () => {
	it('exports the documented surface (InlineToolPill, getUserFriendlyToolName, isVisualTool)', async () => {
		const mod = await import('./inline-tool-pill')
		expect(typeof mod.InlineToolPill).toBe('function')
		expect(typeof mod.getUserFriendlyToolName).toBe('function')
		expect(typeof mod.isVisualTool).toBe('function')
	})
})
