// @vitest-environment jsdom
//
// Phase 75-06 — HighlightedText unit tests.
//
// `@testing-library/react` is NOT installed (D-NO-NEW-DEPS); this test
// follows the established RTL-absent pattern in
// livos/packages/ui/src/components/inline-tool-pill.unit.test.tsx —
// direct react-dom/client mounts against jsdom + a pure-helper coverage
// pass on `parseMarks` so the parser semantics are locked down without
// depending on render output.
//
// Coverage (CONTEXT D-27 / threat T-75-06-03):
//   1. parseMarks('plain') → [{type:'text', content:'plain'}]
//   2. parseMarks('foo <mark>bar</mark> baz') → 3 segments
//   3. parseMarks('a <mark>b</mark> c <mark>d</mark>') → 4 segments
//   4. parseMarks with HTML special chars in surrounding text — special
//      chars survive in `text` segments (React escapes at render time).
//   5. parseMarks with unbalanced <mark> falls back to plain text.
//   6. <HighlightedText> source contains NO `dangerouslySetInnerHTML`
//      (greppable safety invariant).
//   7. Component renders <mark> elements at the correct positions.
//   8. Component does NOT execute injected <script> tags (XSS smoke).

import {readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

import {HighlightedText, parseMarks} from './highlighted-text'

// ── Pure-helper coverage ──────────────────────────────────────────────────

describe('parseMarks (D-27 helper)', () => {
	it('returns a single text segment for plain input', () => {
		const out = parseMarks('hello world')
		expect(out).toHaveLength(1)
		expect(out[0]).toEqual({type: 'text', content: 'hello world'})
	})

	it('returns three segments for one <mark> in the middle', () => {
		const out = parseMarks('foo <mark>bar</mark> baz')
		expect(out).toHaveLength(3)
		expect(out[0]).toEqual({type: 'text', content: 'foo '})
		expect(out[1]).toEqual({type: 'mark', content: 'bar'})
		expect(out[2]).toEqual({type: 'text', content: ' baz'})
	})

	it('handles multiple <mark> tags in a single string', () => {
		const out = parseMarks('a <mark>b</mark> c <mark>d</mark>')
		expect(out).toHaveLength(4)
		expect(out[0]).toEqual({type: 'text', content: 'a '})
		expect(out[1]).toEqual({type: 'mark', content: 'b'})
		expect(out[2]).toEqual({type: 'text', content: ' c '})
		expect(out[3]).toEqual({type: 'mark', content: 'd'})
	})

	it('preserves HTML special chars in text segments (React escapes at render)', () => {
		const out = parseMarks('<script>alert(1)</script> <mark>hit</mark>')
		// Parser emits the `<script>` literal as-is in the text segment;
		// React's text-node escaping is what blocks XSS at render time.
		expect(out).toHaveLength(2)
		expect(out[0]).toEqual({type: 'text', content: '<script>alert(1)</script> '})
		expect(out[1]).toEqual({type: 'mark', content: 'hit'})
	})

	it('falls back to plain text on unbalanced <mark>', () => {
		const out = parseMarks('foo <mark>bar without close')
		// Defensive: if no closing tag, treat the entire `<mark>...` chunk as
		// plain text rather than emitting a half-open mark element.
		expect(out.some((s) => s.type === 'mark')).toBe(false)
		const joined = out.map((s) => s.content).join('')
		expect(joined).toBe('foo <mark>bar without close')
	})

	it('handles empty input', () => {
		const out = parseMarks('')
		expect(out).toEqual([])
	})
})

// ── Source-text invariant: no dangerouslySetInnerHTML ────────────────────

describe('HighlightedText source-text invariants', () => {
	const src = readFileSync(
		join(dirname(fileURLToPath(import.meta.url)), 'highlighted-text.tsx'),
		'utf8',
	)

	it('NEVER uses dangerouslySetInnerHTML (CONTEXT D-27 / T-75-06-03)', () => {
		expect(src).not.toContain('dangerouslySetInnerHTML')
	})

	it('exports HighlightedText component', () => {
		expect(src).toMatch(/export\s+function\s+HighlightedText/)
	})
})

// ── Render-level smoke (react-dom/client, no RTL) ────────────────────────

describe('<HighlightedText> render', () => {
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

	it('renders <mark> DOM element when input contains <mark> tags', () => {
		act(() => {
			root!.render(<HighlightedText html="foo <mark>bar</mark> baz" />)
		})
		const marks = container!.querySelectorAll('mark')
		expect(marks).toHaveLength(1)
		expect(marks[0].textContent).toBe('bar')
		// Surrounding text is preserved.
		expect(container!.textContent).toBe('foo bar baz')
	})

	it('does NOT execute a <script> payload inside the input (XSS smoke)', () => {
		// React text-node escaping turns the literal `<script>` into a text
		// node, NOT an executable element. Assert no <script> child created.
		act(() => {
			root!.render(<HighlightedText html="<script>window.__pwned=1</script>safe" />)
		})
		const scripts = container!.querySelectorAll('script')
		expect(scripts).toHaveLength(0)
		// And the literal text is shown verbatim.
		expect(container!.textContent).toContain('<script>')
		// The XSS sentinel did not run.
		expect((window as any).__pwned).toBeUndefined()
	})
})
