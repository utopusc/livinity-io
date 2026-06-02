/**
 * Phase 255-01 (Wave 0 RED) — clock-helpers pure-function contract.
 *
 * RED-before-GREEN (Nyquist): `desktop/clock-helpers.ts` does NOT exist yet —
 * the import below is unresolved, so the whole suite errors at collection
 * (RED for the right reason: the module is unimplemented). The GREEN comes in
 * plan 255-04, which extracts the WMO-glyph map + the English greeting bands
 * out of top-bar.tsx into two pure, testable functions:
 *
 *   wmoGlyph(code: number): string   — WMO weather_code → emoji glyph
 *   greeting(hour: number, name?: string): string — English time-of-day greeting
 *
 * WMO map (research §5 / PATTERNS.md): 0→☀️, 1-2→⛅, 3→☁️, 45-48→🌫️,
 * 51-67→🌧️, 71-77→❄️, 80-82→🌧️, 95-99→⛈️, unknown→☁️ (fallback).
 * Greeting bands (English — product UI is not localized): h<6 'Good night' |
 * h<12 'Good morning' | h<18 'Good afternoon' | else 'Good evening'. With a
 * name → `${greet}, ${name}`, without → just `${greet}`.
 */

import {describe, expect, it} from 'vitest'

import {greeting, wmoGlyph} from './clock-helpers'

describe('wmoGlyph — WMO weather_code → glyph (RED until 255-04)', () => {
	it.each<[number, string]>([
		[0, '☀️'], // clear
		[1, '⛅'], // mainly clear
		[2, '⛅'], // partly cloudy
		[3, '☁️'], // overcast
		[45, '🌫️'], // fog
		[48, '🌫️'], // depositing rime fog
		[51, '🌧️'], // drizzle
		[67, '🌧️'], // freezing rain (upper rain band)
		[71, '❄️'], // snow
		[77, '❄️'], // snow grains (upper snow band)
		[80, '🌧️'], // rain showers
		[82, '🌧️'], // violent rain showers
		[95, '⛈️'], // thunderstorm
		[99, '⛈️'], // thunderstorm w/ hail
		[200, '☁️'], // unknown high code → fallback
	])('code %i → %s', (code, glyph) => {
		expect(wmoGlyph(code)).toBe(glyph)
	})
})

describe('greeting — English time-of-day greeting', () => {
	it('hour=2 (pre-dawn) → Good night, Bruce', () => {
		expect(greeting(2, 'Bruce')).toBe('Good night, Bruce')
	})

	it('hour=9 (morning) → Good morning, Bruce', () => {
		expect(greeting(9, 'Bruce')).toBe('Good morning, Bruce')
	})

	it('hour=14 (afternoon) → Good afternoon, Bruce', () => {
		expect(greeting(14, 'Bruce')).toBe('Good afternoon, Bruce')
	})

	it('hour=20 (evening) → Good evening, Bruce', () => {
		expect(greeting(20, 'Bruce')).toBe('Good evening, Bruce')
	})

	it('no name → bare greeting (no trailing comma+name)', () => {
		expect(greeting(9)).toBe('Good morning')
	})
})
