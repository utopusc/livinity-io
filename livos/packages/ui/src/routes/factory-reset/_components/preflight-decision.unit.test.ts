// Phase 38 Plan 03 — preflight-decision unit tests.
//
// Pure function, no DOM/RTL needed. Covers the full precedence chain plus a
// negative assertion that no message references Server4/Server5.

import {describe, expect, it} from 'vitest'

import {computeConfirmEnabled} from './preflight-decision'

const baseEnabled = {
	typedConfirm: true,
	updateRunning: false,
	networkReachable: true,
	preflightInFlight: false,
	mutationPending: false,
}

describe('computeConfirmEnabled (D-PF-01 + D-CF-02 precedence)', () => {
	it('all-clear -> enabled, no reason', () => {
		expect(computeConfirmEnabled(baseEnabled)).toEqual({enabled: true, reason: null})
	})

	it('mutationPending -> disabled, "Reset already in progress…"', () => {
		expect(computeConfirmEnabled({...baseEnabled, mutationPending: true})).toEqual({
			enabled: false,
			reason: 'Reset already in progress…',
		})
	})

	it('updateRunning -> disabled, mentions "update is currently running"', () => {
		const got = computeConfirmEnabled({...baseEnabled, updateRunning: true})
		expect(got.enabled).toBe(false)
		expect(got.reason).toContain('update is currently running')
	})

	it('preflightInFlight=true -> disabled, "Checking network…"', () => {
		expect(
			computeConfirmEnabled({...baseEnabled, preflightInFlight: true, networkReachable: null}).reason,
		).toBe('Checking network…')
	})

	it('networkReachable=null -> disabled, "Checking network…"', () => {
		expect(computeConfirmEnabled({...baseEnabled, networkReachable: null}).reason).toBe(
			'Checking network…',
		)
	})

	it('networkReachable=false -> disabled, mentions "Cannot reach livinity.io"', () => {
		const got = computeConfirmEnabled({...baseEnabled, networkReachable: false})
		expect(got.enabled).toBe(false)
		expect(got.reason).toContain('Cannot reach livinity.io')
	})

	it('typedConfirm=false -> disabled, mentions "FACTORY RESET (case-sensitive)"', () => {
		const got = computeConfirmEnabled({...baseEnabled, typedConfirm: false})
		expect(got.enabled).toBe(false)
		expect(got.reason).toContain('FACTORY RESET (case-sensitive)')
	})

	// ─ Precedence ───────────────────────────────────────────────────────────

	it('precedence: mutationPending wins over updateRunning', () => {
		expect(
			computeConfirmEnabled({...baseEnabled, mutationPending: true, updateRunning: true}).reason,
		).toContain('Reset already in progress')
	})

	it('precedence: updateRunning wins over preflight states', () => {
		expect(
			computeConfirmEnabled({
				...baseEnabled,
				updateRunning: true,
				preflightInFlight: true,
				networkReachable: null,
			}).reason,
		).toContain('update is currently running')
	})

	it('precedence: preflight-in-flight wins over network-unreachable', () => {
		expect(
			computeConfirmEnabled({
				...baseEnabled,
				preflightInFlight: true,
				networkReachable: false,
			}).reason,
		).toBe('Checking network…')
	})

	it('precedence: network-unreachable wins over typedConfirm=false', () => {
		expect(
			computeConfirmEnabled({...baseEnabled, networkReachable: false, typedConfirm: false}).reason,
		).toContain('Cannot reach livinity.io')
	})

	// ─ Server4/Server5 negative assertion ───────────────────────────────────

	it('NO reason references Server4 or Server5', () => {
		const allCases = [
			computeConfirmEnabled({...baseEnabled, mutationPending: true}),
			computeConfirmEnabled({...baseEnabled, updateRunning: true}),
			computeConfirmEnabled({...baseEnabled, preflightInFlight: true, networkReachable: null}),
			computeConfirmEnabled({...baseEnabled, networkReachable: false}),
			computeConfirmEnabled({...baseEnabled, typedConfirm: false}),
		]
		for (const c of allCases) {
			expect(c.reason).not.toContain('Server4')
			expect(c.reason).not.toContain('Server5')
		}
	})
})
