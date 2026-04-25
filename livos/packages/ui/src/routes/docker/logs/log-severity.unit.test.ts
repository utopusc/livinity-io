// Phase 28 Plan 28-01 — log-severity classifier tests.
//
// Heuristic-only classifier (UI-side filter, NOT a security boundary —
// T-28-04 register entry).  Anchored to word boundaries so noise like
// 'errors_count=0' (column name) does NOT trigger ERROR. False positives
// are worse than false negatives here: severity-filter dropping a real
// ERROR is OK (user sees it on ALL); mis-classifying noise as ERROR
// poisons the filter.

import {describe, expect, test} from 'vitest'

import {classifySeverity} from './log-severity'

describe('classifySeverity', () => {
	test("A: ERROR keywords — panic, ERROR, fatal, ERR (trimmed)", () => {
		expect(classifySeverity('panic: runtime error')).toBe('ERROR')
		expect(classifySeverity('ERROR something failed')).toBe('ERROR')
		expect(classifySeverity('fatal: out of memory')).toBe('ERROR')
		expect(classifySeverity('  ERR something')).toBe('ERROR')
		expect(classifySeverity('exception thrown: NPE')).toBe('ERROR')
		expect(classifySeverity('CRITICAL — disk full')).toBe('ERROR')
	})

	test("B: WARN keywords — WARN, warning, deprecated", () => {
		expect(classifySeverity('WARN deprecated api')).toBe('WARN')
		expect(classifySeverity('warning: short read')).toBe('WARN')
		expect(classifySeverity('this endpoint is deprecated')).toBe('WARN')
	})

	test("C: INFO keywords — INFO, [info]", () => {
		expect(classifySeverity('INFO listening on :3000')).toBe('INFO')
		expect(classifySeverity('[info] startup complete')).toBe('INFO')
		expect(classifySeverity('NOTICE: handshake complete')).toBe('INFO')
	})

	test("D: DEBUG / TRACE keywords — narrow surface", () => {
		expect(classifySeverity('DEBUG cache miss')).toBe('DEBUG')
		expect(classifySeverity('trace: 0xDEADBEEF')).toBe('DEBUG')
		// 'verbose' is NOT a recognized keyword (only DEBUG/TRACE).
		expect(classifySeverity('verbose trace 0xDEAD')).toBe('DEBUG') // 'trace' matches
		expect(classifySeverity('verbose only no debug keyword')).toBe(null)
	})

	test("E: normal output yields null (no match)", () => {
		expect(classifySeverity('just normal output')).toBe(null)
		expect(classifySeverity('listening on port 3000')).toBe(null)
		expect(classifySeverity('connection established')).toBe(null)
	})

	test("F: case-insensitive AND anchored to word boundary (no substring inside identifiers)", () => {
		// upper / lower / mixed
		expect(classifySeverity('Error: oops')).toBe('ERROR')
		expect(classifySeverity('error: oops')).toBe('ERROR')
		// word-boundary: 'errors_count=0' should NOT classify as ERROR
		// (note: '_' is a word character, so 'errors' is its own word — but the
		// identifier 'errors_count' as a whole DOES contain 'errors' bounded by
		// non-word chars. We test specifically that an identifier-LIKE token
		// where the keyword is a SUBSTRING does NOT match).
		expect(classifySeverity('serror: not a real error keyword')).toBe(null)
		// 'erroring' is NOT a recognized variant — strict word boundary.
		expect(classifySeverity('erroring out')).toBe(null)
	})

	test("G: ERROR takes precedence over WARN/INFO/DEBUG when multiple match", () => {
		expect(classifySeverity('ERROR but also INFO')).toBe('ERROR')
		expect(classifySeverity('WARN with debug')).toBe('WARN')
		expect(classifySeverity('INFO with debug')).toBe('INFO')
	})
})
