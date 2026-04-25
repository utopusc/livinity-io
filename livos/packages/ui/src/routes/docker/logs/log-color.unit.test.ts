// Phase 28 Plan 28-01 — log-color helper tests.
//
// Deterministic per-name HSL color: same name -> same string across reloads.
// Used by LogsViewer (left stripe + name prefix color) so two containers in
// the same multiplexed feed are visually distinguishable. Saturation 70 +
// lightness 55 chosen for legibility on both dark + light themes.

import {describe, expect, test} from 'vitest'

import {colorForContainer} from './log-color'

describe('colorForContainer', () => {
	test("A: deterministic — same name yields the same string across calls", () => {
		expect(colorForContainer('n8n')).toBe(colorForContainer('n8n'))
		expect(colorForContainer('redis')).toBe(colorForContainer('redis'))
	})

	test("B: distinct names usually map to distinct hues (≥30/50 random names yield unique hues)", () => {
		// 50 deterministic pseudo-random names. djb2 mod 360 has occasional
		// collisions but should produce ≥30 distinct hues on this corpus.
		const names = Array.from({length: 50}, (_, i) => `container-${i.toString(36)}-${(i * 7 + 11) % 99}`)
		const hues = new Set(names.map(colorForContainer))
		expect(hues.size).toBeGreaterThanOrEqual(30)
	})

	test("C: output matches /^hsl\\(\\d+, 70%, 55%\\)$/ — fixed S/L for theme legibility", () => {
		expect(colorForContainer('postgres')).toMatch(/^hsl\(\d+, 70%, 55%\)$/)
		expect(colorForContainer('redis')).toMatch(/^hsl\(\d+, 70%, 55%\)$/)
		expect(colorForContainer('a-very-long-container-name-with-dashes')).toMatch(/^hsl\(\d+, 70%, 55%\)$/)
	})

	test("D: empty string yields a valid HSL string (no crash)", () => {
		expect(colorForContainer('')).toMatch(/^hsl\(\d+, 70%, 55%\)$/)
	})

	test("E: hue is in [0, 360) range", () => {
		const out = colorForContainer('redis')
		const match = out.match(/^hsl\((\d+),/)
		expect(match).not.toBeNull()
		const hue = Number(match![1])
		expect(hue).toBeGreaterThanOrEqual(0)
		expect(hue).toBeLessThan(360)
	})
})
