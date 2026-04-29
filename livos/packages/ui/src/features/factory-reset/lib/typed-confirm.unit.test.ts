// Phase 38 Plan 01 — D-CF-02 strict-equality matcher tests.
//
// Locked-down invariant: the type-to-confirm gate uses strict `===` against
// the literal 'FACTORY RESET'. NO trim, NO lowercase, NO regex, NO unicode
// normalization. Variants like `factory reset`, `FactoryReset`, `FACTORY-RESET`,
// leading/trailing whitespace, and double-space MUST keep the gate disabled.

import {describe, expect, it} from 'vitest'

import {EXPECTED_CONFIRM_PHRASE, isFactoryResetTrigger} from './typed-confirm'

describe('isFactoryResetTrigger (D-CF-02 strict equality)', () => {
	it('accepts the exact phrase', () => {
		expect(isFactoryResetTrigger('FACTORY RESET')).toBe(true)
	})

	// ── Negative variants (D-CF-02 requires ≥6) ──────────────────────────────
	it('rejects lowercase', () => {
		expect(isFactoryResetTrigger('factory reset')).toBe(false)
	})
	it('rejects mixed case (FactoryReset)', () => {
		expect(isFactoryResetTrigger('FactoryReset')).toBe(false)
	})
	it('rejects hyphenated (FACTORY-RESET)', () => {
		expect(isFactoryResetTrigger('FACTORY-RESET')).toBe(false)
	})
	it('rejects leading whitespace ( FACTORY RESET)', () => {
		expect(isFactoryResetTrigger(' FACTORY RESET')).toBe(false)
	})
	it('rejects trailing whitespace (FACTORY RESET )', () => {
		expect(isFactoryResetTrigger('FACTORY RESET ')).toBe(false)
	})
	it('rejects double-space variant (FACTORY  RESET)', () => {
		expect(isFactoryResetTrigger('FACTORY  RESET')).toBe(false)
	})
	it('rejects empty string', () => {
		expect(isFactoryResetTrigger('')).toBe(false)
	})

	// ── Constant export ──────────────────────────────────────────────────────
	it('exposes EXPECTED_CONFIRM_PHRASE === "FACTORY RESET"', () => {
		expect(EXPECTED_CONFIRM_PHRASE).toBe('FACTORY RESET')
	})
})
