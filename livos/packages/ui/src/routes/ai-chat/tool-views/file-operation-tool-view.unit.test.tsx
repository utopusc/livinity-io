// @vitest-environment jsdom
//
// Phase 69 Plan 69-02 — FileOperationToolView unit tests (VIEWS-04).
//
// `@testing-library/react` is NOT installed in this UI package
// (D-NO-NEW-DEPS — see livos/packages/ui/src/routes/ai-chat/tool-views/
// generic-tool-view.unit.test.tsx for the canonical "RTL absent"
// posture). 69-CONTEXT D-31 explicitly permits using
// `react-dom/server`'s `renderToStaticMarkup` for source-text
// invariants instead of full RTL setup.
//
// Coverage maps to plan 69-02 must_haves:
//   - "renders read-file with path + Read badge + line/char count"
//   - "renders write-file with Created badge"
//   - "renders delete-file with Deleted badge"
//   - "renders list-files with List badge"
//   - "falls back to <no path> when no path field present"
//   - "uses fallback path field file_path when path absent"
//   - "shows Pending... when toolResult undefined"
//   - "applies rose accent on error status"
//
// References:
//   - .planning/phases/69-per-tool-views-suite/69-CONTEXT.md (D-22)
//   - .planning/phases/69-per-tool-views-suite/69-02-PLAN.md (must_haves)

import {renderToStaticMarkup} from 'react-dom/server'
import {describe, expect, it} from 'vitest'

import {FileOperationToolView} from './file-operation-tool-view'
import type {ToolCallSnapshot} from './types'

// ─────────────────────────────────────────────────────────────────────
// Test fixture: a happy-path read-file snapshot. Override per test
// via `mkSnapshot({...})`.
// ─────────────────────────────────────────────────────────────────────

const mkSnapshot = (overrides: Partial<ToolCallSnapshot> = {}): ToolCallSnapshot => ({
	toolId: 'tool-x',
	toolName: 'read-file',
	category: 'file',
	assistantCall: {input: {path: '/tmp/a.txt'}, ts: 1000},
	status: 'done',
	startedAt: 1000,
	completedAt: 2000,
	toolResult: {output: 'hello\nworld', isError: false, ts: 2000},
	...overrides,
})

const renderHtml = (s: ToolCallSnapshot) =>
	renderToStaticMarkup(<FileOperationToolView snapshot={s} isActive={true} />)

// ─────────────────────────────────────────────────────────────────────
// Render-shape tests — covers D-22 user-visible contract.
// ─────────────────────────────────────────────────────────────────────

describe('FileOperationToolView (D-22)', () => {
	it('renders read-file with path + Read badge + line/char count', () => {
		const html = renderHtml(mkSnapshot())
		expect(html).toContain('/tmp/a.txt')
		expect(html).toContain('Read')
		expect(html).toContain('hello')
		expect(html).toContain('world')
		expect(html).toContain('2 lines')
		expect(html).toContain('11 chars')
	})

	it('renders write-file with Created badge (emerald)', () => {
		const html = renderHtml(
			mkSnapshot({
				toolName: 'write-file',
				toolResult: {output: 'OK', isError: false, ts: 2000},
			}),
		)
		expect(html).toContain('Created')
		expect(html).toContain('emerald')
	})

	it('renders create-file with Created badge', () => {
		const html = renderHtml(
			mkSnapshot({
				toolName: 'create-file',
				toolResult: {output: 'OK', isError: false, ts: 2000},
			}),
		)
		expect(html).toContain('Created')
	})

	it('renders delete-file with Deleted badge (rose)', () => {
		const html = renderHtml(
			mkSnapshot({
				toolName: 'delete-file',
				toolResult: {output: '', isError: false, ts: 2000},
			}),
		)
		expect(html).toContain('Deleted')
		expect(html).toContain('rose')
	})

	it('renders list-files with List badge', () => {
		const html = renderHtml(
			mkSnapshot({
				toolName: 'list-files',
				toolResult: {output: 'a.txt\nb.txt', isError: false, ts: 2000},
			}),
		)
		expect(html).toContain('List')
	})

	it('falls back to <no path> when no path field present', () => {
		const html = renderHtml(mkSnapshot({assistantCall: {input: {}, ts: 1000}}))
		// React escapes < and > in text children — check the escaped form.
		expect(html).toContain('&lt;no path&gt;')
	})

	it('uses fallback path field file_path when path absent', () => {
		const html = renderHtml(mkSnapshot({assistantCall: {input: {file_path: '/etc/foo'}, ts: 1000}}))
		expect(html).toContain('/etc/foo')
	})

	it('uses fallback path field target_file when path/file_path/filePath absent', () => {
		const html = renderHtml(
			mkSnapshot({assistantCall: {input: {target_file: '/var/log/app.log'}, ts: 1000}}),
		)
		expect(html).toContain('/var/log/app.log')
	})

	it('shows Pending... when toolResult undefined', () => {
		const html = renderHtml(mkSnapshot({toolResult: undefined, status: 'running'}))
		expect(html).toContain('Pending')
	})

	it('applies rose accent on error status', () => {
		const html = renderHtml(
			mkSnapshot({
				status: 'error',
				toolResult: {output: 'permission denied', isError: true, ts: 2000},
			}),
		)
		expect(html).toContain('rose')
	})

	it('renders unknown toolName as File Op fallback badge', () => {
		const html = renderHtml(
			mkSnapshot({
				toolName: 'totally-unknown-fs-op',
				toolResult: {output: '', isError: false, ts: 2000},
			}),
		)
		expect(html).toContain('File Op')
	})

	it('does NOT show line/char stats for non-read operations', () => {
		const html = renderHtml(
			mkSnapshot({
				toolName: 'write-file',
				toolResult: {output: 'big content here', isError: false, ts: 2000},
			}),
		)
		// `lines` should not appear in stats line for non-read ops.
		expect(html).not.toContain('lines · ')
	})

	it('handles output as {content: string} object shape', () => {
		const html = renderHtml(
			mkSnapshot({
				toolResult: {output: {content: 'wrapped\nfile\nbody'}, isError: false, ts: 2000},
			}),
		)
		expect(html).toContain('wrapped')
		expect(html).toContain('body')
		expect(html).toContain('3 lines')
	})
})
