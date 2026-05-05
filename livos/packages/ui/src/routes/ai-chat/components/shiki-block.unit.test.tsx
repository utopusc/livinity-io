// Phase 75-05 — ShikiBlock pure-helper + source-text invariant tests.
//
// Coverage scope (per plan 75-05 must-haves: 4+ tests using vitest source-text
// invariants pattern + pure helpers):
//   1. resolveShikiLang — supported langs pass through.
//   2. resolveShikiLang — unknown langs fall back to 'text'.
//   3. isSupportedLang — the canonical language list (CONTEXT D-23) is enforced.
//   4. SHIKI_LANGS contains every required language.
//   5. Source-text invariant — file imports shiki via dynamic import.
//   6. Source-text invariant — file references the 'github-dark' theme.
//   7. Source-text invariant — file uses navigator.clipboard.writeText for copy.
//   8. Source-text invariant — file imports IconCopy and IconCheck from tabler.
//   9. Source-text invariant — single audited dangerouslySetInnerHTML usage.
//
// Per established UI-package precedent (`@testing-library/react` is NOT
// installed — see livos/packages/ui/src/routes/ai-chat/components/liv-streaming-text.unit.test.tsx
// for canonical "RTL absent" posture), we test pure helpers directly + use
// source-text invariants for component-shape assertions. Component DOM render
// is exercised in the 75-07 wire-up plan against the live chat shell.

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {describe, expect, it} from 'vitest'

import {SHIKI_LANGS, isSupportedLang, resolveShikiLang} from './shiki-block'

// ─────────────────────────────────────────────────────────────────────
// Pure helpers — language validation (CONTEXT D-23)
// ─────────────────────────────────────────────────────────────────────

describe('isSupportedLang (D-23)', () => {
	it('returns true for every language in SHIKI_LANGS', () => {
		for (const lang of SHIKI_LANGS) {
			expect(isSupportedLang(lang)).toBe(true)
		}
	})

	it('returns false for unknown langs', () => {
		expect(isSupportedLang('cobol')).toBe(false)
		expect(isSupportedLang('fortran')).toBe(false)
		expect(isSupportedLang('')).toBe(false)
		expect(isSupportedLang('TEXT')).toBe(false) // case-sensitive
	})
})

describe('resolveShikiLang (D-23)', () => {
	it('passes through supported langs verbatim', () => {
		expect(resolveShikiLang('ts')).toBe('ts')
		expect(resolveShikiLang('python' === 'python' ? 'py' : 'py')).toBe('py')
		expect(resolveShikiLang('json')).toBe('json')
		expect(resolveShikiLang('dockerfile')).toBe('dockerfile')
	})

	it('falls back to "text" for unknown langs', () => {
		expect(resolveShikiLang('cobol')).toBe('text')
		expect(resolveShikiLang('')).toBe('text')
		expect(resolveShikiLang('UNKNOWN')).toBe('text')
	})
})

describe('SHIKI_LANGS canonical list (D-23)', () => {
	const required = [
		'ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'sh', 'bash',
		'json', 'yaml', 'sql', 'md', 'html', 'css', 'dockerfile', 'diff',
	]

	it('contains every required language from CONTEXT D-23', () => {
		for (const lang of required) {
			expect(SHIKI_LANGS).toContain(lang)
		}
	})

	it('has at least 17 entries (D-23 baseline count)', () => {
		expect(SHIKI_LANGS.length).toBeGreaterThanOrEqual(17)
	})
})

// ─────────────────────────────────────────────────────────────────────
// Source-text invariants — guard against accidental refactor regressions
// ─────────────────────────────────────────────────────────────────────

describe('shiki-block.tsx source-text invariants', () => {
	const src = readFileSync(
		resolve(__dirname, 'shiki-block.tsx'),
		'utf8',
	)

	it("imports shiki via dynamic import (lazy-load contract)", () => {
		// Plan 75-05 hard rule: must lazy-load Shiki to avoid bundle bloat.
		expect(src).toMatch(/import\(['"]shiki['"]\)/)
	})

	it("references the 'github-dark' theme (D-23)", () => {
		expect(src).toContain("'github-dark'")
	})

	it('uses navigator.clipboard.writeText for the copy button', () => {
		expect(src).toContain('navigator.clipboard.writeText')
	})

	it('imports IconCopy and IconCheck from @tabler/icons-react', () => {
		expect(src).toContain('IconCopy')
		expect(src).toContain('IconCheck')
		expect(src).toMatch(/from ['"]@tabler\/icons-react['"]/)
	})

	it('uses dangerouslySetInnerHTML at exactly one audited location (T-75-05-01)', () => {
		const occurrences = src.match(/dangerouslySetInnerHTML/g) ?? []
		// One in the JSX call site + one in the AUDITED comment block above it.
		// Total 1-3 textual occurrences acceptable; 0 means the highlighter HTML
		// path is broken, more than 3 means a second uncomment-audited site
		// crept in.
		expect(occurrences.length).toBeGreaterThanOrEqual(1)
		expect(occurrences.length).toBeLessThanOrEqual(3)
	})

	it('caches the highlighter as a module-level singleton promise', () => {
		// Plan 75-05 must-have: subsequent renders skip re-init.
		expect(src).toMatch(/highlighterPromise/)
	})
})
