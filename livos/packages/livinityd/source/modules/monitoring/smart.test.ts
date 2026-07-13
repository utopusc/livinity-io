import {describe, expect, test} from 'vitest'

import {evaluateNvmeHealth, evaluateSataHealth, evaluateTemperature} from './smart.js'

// ─────────────────────────────────────────────────────────────────────────
// Task 1 — PURE threshold evaluators (no disk I/O, no subprocess).
// These are the Backblaze-5 SATA + NVMe critical-warning rules, plus the
// DISPLAY-ONLY temperature dimension (never a health-severity input).
// ─────────────────────────────────────────────────────────────────────────

describe('evaluateSataHealth', () => {
	test('Reallocated_Sector_Ct raw > 0 (but <= 50) → warning', () => {
		const evalResult = evaluateSataHealth({
			smart_status: {passed: true},
			ata_smart_attributes: {table: [{id: 5, name: 'Reallocated_Sector_Ct', raw: {value: 3}, when_failed: ''}]},
		})
		expect(evalResult.severity).toBe('warning')
		expect(evalResult.reasons.join(' ')).toMatch(/Reallocated_Sector_Ct/)
		// Temperature must NEVER leak into the health-severity reasons.
		expect(evalResult.reasons.join(' ')).not.toMatch(/temperature/i)
	})

	test('smart_status.passed === false → critical (drive firmware own aggregate FAIL)', () => {
		const evalResult = evaluateSataHealth({
			smart_status: {passed: false},
			ata_smart_attributes: {table: [{id: 5, name: 'Reallocated_Sector_Ct', raw: {value: 0}, when_failed: ''}]},
		})
		expect(evalResult.severity).toBe('critical')
	})

	test('an attribute with when_failed set → critical', () => {
		const evalResult = evaluateSataHealth({
			smart_status: {passed: true},
			ata_smart_attributes: {table: [{id: 197, name: 'Current_Pending_Sector', raw: {value: 2}, when_failed: 'now'}]},
		})
		expect(evalResult.severity).toBe('critical')
	})

	test('Reallocated_Sector_Ct raw > 50 → critical', () => {
		const evalResult = evaluateSataHealth({
			smart_status: {passed: true},
			ata_smart_attributes: {table: [{id: 5, name: 'Reallocated_Sector_Ct', raw: {value: 120}, when_failed: ''}]},
		})
		expect(evalResult.severity).toBe('critical')
	})

	test('Command_Timeout has a noise floor of 5 (raw 3 → null, raw 9 → warning)', () => {
		const quiet = evaluateSataHealth({
			smart_status: {passed: true},
			ata_smart_attributes: {table: [{id: 188, name: 'Command_Timeout', raw: {value: 3}, when_failed: ''}]},
		})
		expect(quiet.severity).toBeNull()
		const noisy = evaluateSataHealth({
			smart_status: {passed: true},
			ata_smart_attributes: {table: [{id: 188, name: 'Command_Timeout', raw: {value: 9}, when_failed: ''}]},
		})
		expect(noisy.severity).toBe('warning')
	})

	test('all Backblaze-5 attrs clean + passed=true → null severity (healthy input)', () => {
		const evalResult = evaluateSataHealth({
			smart_status: {passed: true},
			ata_smart_attributes: {
				table: [
					{id: 5, name: 'Reallocated_Sector_Ct', raw: {value: 0}, when_failed: ''},
					{id: 187, name: 'Reported_Uncorrect', raw: {value: 0}, when_failed: ''},
					{id: 197, name: 'Current_Pending_Sector', raw: {value: 0}, when_failed: ''},
					{id: 198, name: 'Offline_Uncorrectable', raw: {value: 0}, when_failed: ''},
				],
			},
		})
		expect(evalResult.severity).toBeNull()
	})
})

describe('evaluateNvmeHealth', () => {
	test('critical_warning !== 0 → critical', () => {
		const evalResult = evaluateNvmeHealth({critical_warning: 4, percentage_used: 10, media_errors: 0, available_spare: 100, available_spare_threshold: 10})
		expect(evalResult.severity).toBe('critical')
		expect(evalResult.reasons.join(' ')).toMatch(/critical_warning/)
	})

	test('percentage_used >= 90 → warning, >= 100 → critical', () => {
		const warn = evaluateNvmeHealth({critical_warning: 0, percentage_used: 95, media_errors: 0, available_spare: 100, available_spare_threshold: 10})
		expect(warn.severity).toBe('warning')
		const crit = evaluateNvmeHealth({critical_warning: 0, percentage_used: 100, media_errors: 0, available_spare: 100, available_spare_threshold: 10})
		expect(crit.severity).toBe('critical')
	})

	test('media_errors > 0 → warning', () => {
		const evalResult = evaluateNvmeHealth({critical_warning: 0, percentage_used: 5, media_errors: 3, available_spare: 100, available_spare_threshold: 10})
		expect(evalResult.severity).toBe('warning')
	})

	test('available_spare <= available_spare_threshold → critical', () => {
		const evalResult = evaluateNvmeHealth({critical_warning: 0, percentage_used: 5, media_errors: 0, available_spare: 8, available_spare_threshold: 10})
		expect(evalResult.severity).toBe('critical')
	})

	test('healthy NVMe input → null severity', () => {
		const evalResult = evaluateNvmeHealth({critical_warning: 0, percentage_used: 5, media_errors: 0, available_spare: 100, available_spare_threshold: 10})
		expect(evalResult.severity).toBeNull()
	})
})

describe('evaluateTemperature (display-only)', () => {
	test('66 → hot, 56 → warm, 40 → ok', () => {
		expect(evaluateTemperature(66)).toBe('hot')
		expect(evaluateTemperature(56)).toBe('warm')
		expect(evaluateTemperature(40)).toBe('ok')
	})

	test('boundary 65 → hot, 55 → warm', () => {
		expect(evaluateTemperature(65)).toBe('hot')
		expect(evaluateTemperature(55)).toBe('warm')
	})

	test('null/undefined → ok (never throws)', () => {
		expect(evaluateTemperature(null)).toBe('ok')
		expect(evaluateTemperature(undefined)).toBe('ok')
	})
})
