/**
 * Phase 255-01 (Wave 0 RED) — clock-helpers pure-function contract.
 *
 * RED-before-GREEN (Nyquist): `desktop/clock-helpers.ts` does NOT exist yet —
 * the import below is unresolved, so the whole suite errors at collection
 * (RED for the right reason: the module is unimplemented). The GREEN comes in
 * plan 255-04, which extracts the WMO-glyph map + the Turkish greeting bands
 * out of top-bar.tsx into two pure, testable functions:
 *
 *   wmoGlyph(code: number): string   — WMO weather_code → emoji glyph
 *   greeting(hour: number, name?: string): string — Turkish time-of-day greeting
 *
 * WMO map (research §5 / PATTERNS.md): 0→☀️, 1-2→⛅, 3→☁️, 45-48→🌫️,
 * 51-67→🌧️, 71-77→❄️, 80-82→🌧️, 95-99→⛈️, unknown→☁️ (fallback).
 * Greeting bands (user_language.md): h<6 'İyi geceler' | h<12 'Günaydın' |
 * h<18 'İyi günler' | else 'İyi akşamlar'. With a name → `${greet}, ${name}`,
 * without → just `${greet}`.
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

describe('greeting — Turkish time-of-day greeting (RED until 255-04)', () => {
	it('hour=2 (pre-dawn) → İyi geceler, Bruce', () => {
		expect(greeting(2, 'Bruce')).toBe('İyi geceler, Bruce')
	})

	it('hour=9 (morning) → Günaydın, Bruce', () => {
		expect(greeting(9, 'Bruce')).toBe('Günaydın, Bruce')
	})

	it('hour=14 (afternoon) → İyi günler, Bruce', () => {
		expect(greeting(14, 'Bruce')).toBe('İyi günler, Bruce')
	})

	it('hour=20 (evening) → İyi akşamlar, Bruce', () => {
		expect(greeting(20, 'Bruce')).toBe('İyi akşamlar, Bruce')
	})

	it('no name → bare greeting (no trailing comma+name)', () => {
		expect(greeting(9)).toBe('Günaydın')
	})
})
