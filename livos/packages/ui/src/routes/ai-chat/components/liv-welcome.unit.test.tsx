/**
 * LivWelcome unit tests — Phase 70-03.
 *
 * Pure-helper coverage for the welcome screen's time-of-day greeting and
 * suggestion-array shape (CONTEXT D-41, D-42, D-43). Component-level render
 * tests are deferred to 70-08 integration; this file locks down the helpers
 * that 70-08 mounting will rely on.
 */

import {describe, expect, it} from 'vitest'

import {
	LIV_WELCOME_SUGGESTIONS,
	formatGreeting,
	getTimeOfDayGreeting,
} from './liv-welcome'

describe('getTimeOfDayGreeting (D-43)', () => {
	it('returns Good morning for 0-11', () => {
		expect(getTimeOfDayGreeting(0)).toBe('Good morning')
		expect(getTimeOfDayGreeting(8)).toBe('Good morning')
		expect(getTimeOfDayGreeting(11)).toBe('Good morning')
	})

	it('returns Good afternoon for 12-17', () => {
		expect(getTimeOfDayGreeting(12)).toBe('Good afternoon')
		expect(getTimeOfDayGreeting(15)).toBe('Good afternoon')
		expect(getTimeOfDayGreeting(17)).toBe('Good afternoon')
	})

	it('returns Good evening for 18-23', () => {
		expect(getTimeOfDayGreeting(18)).toBe('Good evening')
		expect(getTimeOfDayGreeting(20)).toBe('Good evening')
		expect(getTimeOfDayGreeting(23)).toBe('Good evening')
	})
})

describe('formatGreeting (D-43)', () => {
	it('uses provided name', () => {
		expect(formatGreeting('bruce', 8)).toBe('Good morning, bruce')
		expect(formatGreeting('Alice', 14)).toBe('Good afternoon, Alice')
		expect(formatGreeting('Liv', 20)).toBe('Good evening, Liv')
	})

	it('falls back to "there" when name undefined/null/empty', () => {
		expect(formatGreeting(undefined, 8)).toBe('Good morning, there')
		expect(formatGreeting(null, 18)).toBe('Good evening, there')
		expect(formatGreeting('', 12)).toBe('Good afternoon, there')
	})

	it('trims whitespace-only name to "there"', () => {
		expect(formatGreeting('   ', 8)).toBe('Good morning, there')
		expect(formatGreeting('\t\n', 14)).toBe('Good afternoon, there')
	})
})

describe('LIV_WELCOME_SUGGESTIONS (D-41, D-42)', () => {
	it('contains exactly 4 suggestions', () => {
		expect(LIV_WELCOME_SUGGESTIONS.length).toBe(4)
	})

	it('every suggestion has title + prompt + icon', () => {
		for (const s of LIV_WELCOME_SUGGESTIONS) {
			expect(typeof s.title).toBe('string')
			expect(s.title.length).toBeGreaterThan(0)
			expect(typeof s.prompt).toBe('string')
			expect(s.prompt.length).toBeGreaterThan(0)
			expect(typeof s.icon).toBe('string')
		}
	})

	it('every suggestion icon is one of the documented LivIcons keys', () => {
		// CONTEXT D-42 mapping: webSearch / fileEdit / terminal / screenShare.
		// The 4 default suggestions MUST stay within this set per the spec.
		const allowed = new Set(['webSearch', 'fileEdit', 'terminal', 'screenShare'])
		for (const s of LIV_WELCOME_SUGGESTIONS) {
			expect(allowed.has(s.icon)).toBe(true)
		}
	})

	it('suggestion titles are unique (cards are distinguishable)', () => {
		const titles = LIV_WELCOME_SUGGESTIONS.map((s) => s.title)
		expect(new Set(titles).size).toBe(titles.length)
	})

	it('suggestion prompts are unique (clicks send distinct prompts)', () => {
		const prompts = LIV_WELCOME_SUGGESTIONS.map((s) => s.prompt)
		expect(new Set(prompts).size).toBe(prompts.length)
	})
})
