// @vitest-environment jsdom
//
// Phase 69 Plan 69-02 — StrReplaceToolView unit tests (VIEWS-05).
//
// `@testing-library/react` is NOT installed in this UI package
// (D-NO-NEW-DEPS — see livos/packages/ui/src/routes/ai-chat/tool-views/
// generic-tool-view.unit.test.tsx for the canonical "RTL absent"
// posture). 69-CONTEXT D-31 explicitly permits using
// `react-dom/server`'s `renderToStaticMarkup` for source-text
// invariants instead of full RTL setup.
//
// Coverage maps to plan 69-02 must_haves:
//   - "renders path + +/- stats + colorized diff (standard old_str/new_str)"
//   - "counts multi-line diffs correctly"
//   - "falls back to toolResult.output when old_str/new_str missing"
//   - "shows Pending... when no diff input AND no toolResult"
//
// References:
//   - .planning/phases/69-per-tool-views-suite/69-CONTEXT.md (D-23)
//   - .planning/phases/69-per-tool-views-suite/69-02-PLAN.md (must_haves)

import {renderToStaticMarkup} from 'react-dom/server'
import {describe, expect, it} from 'vitest'

import {StrReplaceToolView} from './str-replace-tool-view'
import type {ToolCallSnapshot} from './types'

// ─────────────────────────────────────────────────────────────────────
// Test fixture: a happy-path str-replace snapshot.
// ─────────────────────────────────────────────────────────────────────

const mkSnapshot = (overrides: Partial<ToolCallSnapshot> = {}): ToolCallSnapshot => ({
	toolId: 'tool-x',
	toolName: 'str-replace',
	category: 'fileEdit',
	assistantCall: {
		input: {path: '/tmp/foo.ts', old_str: 'const x = 1', new_str: 'const x = 2'},
		ts: 1000,
	},
	status: 'done',
	startedAt: 1000,
	completedAt: 2000,
	toolResult: {output: 'replaced 1 occurrence', isError: false, ts: 2000},
	...overrides,
})

const renderHtml = (s: ToolCallSnapshot) =>
	renderToStaticMarkup(<StrReplaceToolView snapshot={s} isActive={true} />)

// ─────────────────────────────────────────────────────────────────────
// Render-shape tests — covers D-23 user-visible contract.
// ─────────────────────────────────────────────────────────────────────

describe('StrReplaceToolView (D-23)', () => {
	it('renders path + +/- stats + colorized diff', () => {
		const html = renderHtml(mkSnapshot())
		expect(html).toContain('/tmp/foo.ts')
		expect(html).toContain('+1')
		expect(html).toContain('-1')
		// colorizeDiff output must surface emerald (+) and rose (-) tokens.
		expect(html).toContain('emerald')
		expect(html).toContain('rose')
	})

	it('emits both old (-) and new (+) lines in the diff body', () => {
		const html = renderHtml(mkSnapshot())
		expect(html).toContain('const x = 1')
		expect(html).toContain('const x = 2')
	})

	it('counts multi-line diffs correctly', () => {
		const html = renderHtml(
			mkSnapshot({
				assistantCall: {input: {path: '/x', old_str: 'a\nb\nc', new_str: 'd\ne'}, ts: 1000},
			}),
		)
		expect(html).toContain('+2')
		expect(html).toContain('-3')
	})

	it('falls back to toolResult.output when old_str/new_str missing', () => {
		const html = renderHtml(
			mkSnapshot({
				assistantCall: {input: {path: '/x'}, ts: 1000},
				toolResult: {output: 'fallback message', isError: false, ts: 2000},
			}),
		)
		expect(html).toContain('fallback message')
		// Without diff input, +N/-N stats span MUST be omitted.
		expect(html).not.toContain('+0')
		expect(html).not.toContain('-0')
	})

	it('shows Pending... when no diff input AND no toolResult', () => {
		const html = renderHtml(
			mkSnapshot({
				assistantCall: {input: {path: '/x'}, ts: 1000},
				toolResult: undefined,
				status: 'running',
			}),
		)
		expect(html).toContain('Pending')
	})

	it('renders fileEdit icon (svg present)', () => {
		const html = renderHtml(mkSnapshot())
		// Tabler IconEdit renders as an inline svg; we just confirm the
		// header includes one without coupling to the exact class string.
		expect(html).toMatch(/<svg/)
	})

	it('falls back to <no path> when no path field present', () => {
		const html = renderHtml(
			mkSnapshot({
				assistantCall: {input: {old_str: 'a', new_str: 'b'}, ts: 1000},
			}),
		)
		expect(html).toContain('&lt;no path&gt;')
	})

	it('uses fallback path field file_path when path absent', () => {
		const html = renderHtml(
			mkSnapshot({
				assistantCall: {
					input: {file_path: '/etc/conf', old_str: 'a', new_str: 'b'},
					ts: 1000,
				},
			}),
		)
		expect(html).toContain('/etc/conf')
	})
})
