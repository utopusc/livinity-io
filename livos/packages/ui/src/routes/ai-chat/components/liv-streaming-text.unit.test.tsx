// Phase 70 Plan 70-04 — LivStreamingText pure-helper + gate-consistency tests.
//
// Coverage scope (per plan must-haves: 6+ tests covering caret toggle + edge
// cases + markdown-vs-fallback render path detection):
//   1. shouldRenderCaret — caret rendered when streaming + non-empty content.
//   2. shouldRenderCaret — NO caret when streaming + empty content (orphan guard).
//   3. shouldRenderCaret — NO caret when not streaming (regardless of content).
//   4. shouldRenderCaret — false-false combo returns false.
//   5. isMarkdownAvailable — returns a boolean.
//   6. isMarkdownAvailable — agrees with the source-file's render path
//      (meta-test: catches drift if someone flips one without the other).
//   7. isMarkdownAvailable — agrees with package.json reality (markdown gate).
//
// Per established UI-package precedent (`@testing-library/react` is NOT
// installed — see livos/packages/ui/src/lib/use-liv-agent-stream.unit.test.tsx
// + livos/packages/ui/src/components/inline-tool-pill.unit.test.tsx for the
// canonical "RTL absent" posture), we test the pure helpers directly + use
// source-text invariants for the gate-consistency check. Component DOM render
// is exercised in the 70-08 integration plan against the live chat shell.

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {describe, expect, it} from 'vitest'

import {isMarkdownAvailable, shouldRenderCaret} from './liv-streaming-text'

// ─────────────────────────────────────────────────────────────────────
// 1-4. shouldRenderCaret — caret toggle (D-09, D-33)
// ─────────────────────────────────────────────────────────────────────

describe('shouldRenderCaret (D-09, D-33)', () => {
	it('returns true when streaming and content non-empty', () => {
		expect(shouldRenderCaret({isStreaming: true, content: 'hi'})).toBe(true)
		expect(shouldRenderCaret({isStreaming: true, content: 'a'})).toBe(true)
		expect(shouldRenderCaret({isStreaming: true, content: 'a much longer assistant response'})).toBe(true)
	})

	it('returns false when streaming and content empty (orphan-caret guard)', () => {
		expect(shouldRenderCaret({isStreaming: true, content: ''})).toBe(false)
	})

	it('returns false when not streaming regardless of content', () => {
		expect(shouldRenderCaret({isStreaming: false, content: 'hi'})).toBe(false)
		expect(shouldRenderCaret({isStreaming: false, content: 'final answer text'})).toBe(false)
	})

	it('returns false when both not streaming and content empty', () => {
		expect(shouldRenderCaret({isStreaming: false, content: ''})).toBe(false)
	})
})

// ─────────────────────────────────────────────────────────────────────
// 5-7. isMarkdownAvailable + gate consistency (D-07, D-33)
// ─────────────────────────────────────────────────────────────────────

describe('isMarkdownAvailable (D-07, D-33)', () => {
	it('returns a boolean', () => {
		const result = isMarkdownAvailable()
		expect(typeof result).toBe('boolean')
		expect([true, false]).toContain(result)
	})

	it('agrees with the source-file render path (no internal drift)', () => {
		// Meta-test: read this directory's liv-streaming-text.tsx and check
		// that its render path (markdown vs <pre> fallback) matches what
		// `isMarkdownAvailable()` reports. If someone flips one and not the
		// other, this test catches it before integration.
		const sourcePath = resolve(__dirname, 'liv-streaming-text.tsx')
		const source = readFileSync(sourcePath, 'utf8')
		const usesReactMarkdown = source.includes("from 'react-markdown'")
		const usesRemarkGfm = source.includes("from 'remark-gfm'")
		const sourceUsesMarkdown = usesReactMarkdown && usesRemarkGfm
		expect(isMarkdownAvailable()).toBe(sourceUsesMarkdown)
	})

	it('agrees with package.json reality (D-NO-NEW-DEPS gate)', () => {
		// Meta-test: read livos/packages/ui/package.json and check that the
		// gate decision (markdown vs fallback) matches whether react-markdown
		// AND remark-gfm are both declared as deps. D-07 forbids new deps —
		// this test is the canary that the executor honored the gate.
		const pkgPath = resolve(__dirname, '../../../../package.json')
		const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
			dependencies?: Record<string, string>
			devDependencies?: Record<string, string>
		}
		const allDeps = {...pkg.dependencies, ...pkg.devDependencies}
		const hasMarkdown = 'react-markdown' in allDeps && 'remark-gfm' in allDeps
		expect(isMarkdownAvailable()).toBe(hasMarkdown)
	})
})
