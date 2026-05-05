// @vitest-environment jsdom
//
// Phase 69 Plan 69-01 — CommandToolView unit tests (VIEWS-03).
//
// `@testing-library/react` is NOT installed in this UI package
// (D-NO-NEW-DEPS — see livos/packages/ui/src/routes/ai-chat/tool-views/
// generic-tool-view.unit.test.tsx for the canonical "RTL absent"
// posture). 69-CONTEXT D-31 explicitly permits using
// `react-dom/server`'s `renderToStaticMarkup` for source-text
// invariants instead of full RTL setup.
//
// Coverage maps to plan 69-01 must_haves:
//   - "renders command in cyan accent"  (D-21)
//   - "renders stdout output"  (D-21)
//   - "shows exit 0 emerald badge for success"  (D-21)
//   - "shows exit N rose badge for non-zero exit"  (D-21)
//   - "infers exit 1 from isError when exitCode missing"
//   - "infers exit 0 from isError=false when exitCode missing"
//   - "handles output as plain string"  (D-21 dual shape)
//   - "shows Running... when toolResult absent"
//   - "shows <no command> when command field missing"
//   - "accepts cmd as alternate field name"
//
// References:
//   - .planning/phases/69-per-tool-views-suite/69-CONTEXT.md (D-21)
//   - .planning/phases/69-per-tool-views-suite/69-01-PLAN.md (must_haves)

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {renderToStaticMarkup} from 'react-dom/server'
import {describe, expect, it} from 'vitest'

import {CommandToolView} from './command-tool-view'
import type {ToolCallSnapshot} from './types'

// ─────────────────────────────────────────────────────────────────────
// Test fixture: a happy-path snapshot for an `execute-command` call
// that completed successfully with stdout + exit 0. Override fields
// per test via `mkSnapshot({...})`.
// ─────────────────────────────────────────────────────────────────────

const mkSnapshot = (overrides: Partial<ToolCallSnapshot> = {}): ToolCallSnapshot => ({
	toolId: 'tool-x',
	toolName: 'execute-command',
	category: 'terminal',
	assistantCall: {input: {command: 'git status'}, ts: 1000},
	status: 'done',
	startedAt: 1000,
	completedAt: 2000,
	toolResult: {
		output: {stdout: 'On branch main\nnothing to commit', exitCode: 0},
		isError: false,
		ts: 2000,
	},
	...overrides,
})

const renderHtml = (s: ToolCallSnapshot) =>
	renderToStaticMarkup(<CommandToolView snapshot={s} isActive={true} />)

// ─────────────────────────────────────────────────────────────────────
// 1. Render-shape tests — covers D-21 user-visible contract.
// ─────────────────────────────────────────────────────────────────────

describe('CommandToolView (D-21)', () => {
	it('renders command in cyan accent', () => {
		const html = renderHtml(mkSnapshot())
		expect(html).toContain('git status')
		// Cyan accent token is emitted via [color:var(--liv-accent-cyan)]
		// className wrapper around the `$ {cmd}` line.
		expect(html).toContain('cyan')
		expect(html).toContain('$ ')
	})

	it('renders stdout output', () => {
		const html = renderHtml(mkSnapshot())
		expect(html).toContain('On branch main')
		expect(html).toContain('nothing to commit')
	})

	it('shows exit 0 emerald badge for success', () => {
		const html = renderHtml(mkSnapshot())
		expect(html).toContain('exit 0')
		expect(html).toContain('emerald')
	})

	it('shows exit N rose badge for non-zero exit', () => {
		const html = renderHtml(
			mkSnapshot({
				toolResult: {
					output: {stdout: 'fatal: not a git repository', exitCode: 128},
					isError: true,
					ts: 2000,
				},
			}),
		)
		expect(html).toContain('exit 128')
		expect(html).toContain('rose')
	})

	it('infers exit 1 from isError when exitCode missing', () => {
		const html = renderHtml(
			mkSnapshot({
				toolResult: {output: 'oops', isError: true, ts: 2000},
			}),
		)
		expect(html).toContain('exit 1')
		expect(html).toContain('rose')
	})

	it('infers exit 0 from isError=false when exitCode missing', () => {
		const html = renderHtml(
			mkSnapshot({
				toolResult: {output: 'plain string output', isError: false, ts: 2000},
			}),
		)
		expect(html).toContain('exit 0')
	})

	it('handles output as plain string', () => {
		const html = renderHtml(
			mkSnapshot({
				toolResult: {output: 'just a string', isError: false, ts: 2000},
			}),
		)
		expect(html).toContain('just a string')
	})

	it('handles {output: string} alternate shape', () => {
		const html = renderHtml(
			mkSnapshot({
				toolResult: {output: {output: 'alt-shape stdout', exitCode: 0}, isError: false, ts: 2000},
			}),
		)
		expect(html).toContain('alt-shape stdout')
	})

	it('shows Running... when toolResult absent and status=running', () => {
		const html = renderHtml(mkSnapshot({status: 'running', toolResult: undefined}))
		expect(html).toContain('Running')
	})

	it('shows (no output) for done status with no stdout', () => {
		const html = renderHtml(
			mkSnapshot({
				toolResult: {output: {stdout: '', exitCode: 0}, isError: false, ts: 2000},
			}),
		)
		expect(html).toContain('(no output)')
	})

	it('shows <no command> (HTML-escaped) when command field missing', () => {
		const html = renderHtml(
			mkSnapshot({
				assistantCall: {input: {}, ts: 1000},
			}),
		)
		// React escapes `<` and `>` in text-children, so the rendered
		// HTML contains the entity-encoded form.
		expect(html).toContain('&lt;no command&gt;')
	})

	it('accepts cmd as alternate field name', () => {
		const html = renderHtml(
			mkSnapshot({
				assistantCall: {input: {cmd: 'ls -la'}, ts: 1000},
			}),
		)
		expect(html).toContain('ls -la')
	})

	it('accepts shell as alternate field name', () => {
		const html = renderHtml(
			mkSnapshot({
				assistantCall: {input: {shell: 'echo hi'}, ts: 1000},
			}),
		)
		expect(html).toContain('echo hi')
	})

	it('omits exit-code footer when toolResult is undefined', () => {
		const html = renderHtml(mkSnapshot({status: 'running', toolResult: undefined}))
		expect(html).not.toMatch(/\bexit\s+\d+\b/)
	})

	it('handles exit_code (snake_case) alternate field', () => {
		const html = renderHtml(
			mkSnapshot({
				toolResult: {
					output: {stdout: 'done', exit_code: 2},
					isError: true,
					ts: 2000,
				},
			}),
		)
		expect(html).toContain('exit 2')
	})
})

// ─────────────────────────────────────────────────────────────────────
// 2. Source-text invariants — lock the wire-level rendering contract.
// ─────────────────────────────────────────────────────────────────────

describe('command-tool-view.tsx source-text invariants', () => {
	const sourcePath = resolve(
		process.cwd(),
		'src/routes/ai-chat/tool-views/command-tool-view.tsx',
	)
	const source = readFileSync(sourcePath, 'utf8')

	it('imports LivIcons.terminal from P66-04 icon map', () => {
		expect(source).toMatch(/from\s+['"]@\/icons\/liv-icons['"]/)
		expect(source).toMatch(/LivIcons\.terminal/)
	})

	it('imports Badge from the shadcn primitives', () => {
		expect(source).toMatch(/from\s+['"]@\/shadcn-components\/ui\/badge['"]/)
	})

	it('uses dark surface token (--liv-bg-deep) for terminal aesthetic', () => {
		expect(source).toMatch(/--liv-bg-deep/)
	})

	it('uses cyan accent token for the $ command line (D-21)', () => {
		expect(source).toMatch(/--liv-accent-cyan/)
	})

	it('uses emerald token for success exit and rose for failure (D-21)', () => {
		expect(source).toMatch(/--liv-accent-emerald/)
		expect(source).toMatch(/--liv-accent-rose/)
	})

	it('renders output via <pre> with whitespace-pre-wrap (D-21)', () => {
		expect(source).toMatch(/<pre\b/)
		expect(source).toMatch(/whitespace-pre-wrap/)
	})

	it('uses font-mono and text-12 for terminal monospace look (D-21)', () => {
		expect(source).toMatch(/font-mono/)
		expect(source).toMatch(/text-12/)
	})

	it('caps stdout with max-h-[40vh] overflow-auto (T-69-01-05 mitigation)', () => {
		expect(source).toMatch(/max-h-\[40vh\]/)
		expect(source).toMatch(/overflow-auto/)
	})

	it('does NOT add Hermes streaming caret (CONTEXT D-21 — defer to P70)', () => {
		expect(source).not.toMatch(/TypewriterCaret/)
	})
})
