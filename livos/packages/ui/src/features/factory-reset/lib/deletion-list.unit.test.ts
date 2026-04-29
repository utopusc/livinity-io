// Phase 38 Plan 01 — D-MD-01 verbatim deletion list tests.
//
// Locks the consent-surface text. Plan 03 renders this list as the modal body.
// If a future commit accidentally rewrites or reorders an item, this test fails
// and forces an explicit conscious change to D-MD-01.

import {describe, expect, it} from 'vitest'

import {DELETION_LIST} from './deletion-list'

describe('DELETION_LIST (D-MD-01 verbatim)', () => {
	it('has exactly 7 items', () => {
		expect(DELETION_LIST.length).toBe(7)
	})

	it('every item is a non-empty string', () => {
		for (const item of DELETION_LIST) {
			expect(typeof item).toBe('string')
			expect(item.length).toBeGreaterThan(0)
		}
	})

	// ── Verbatim items (D-MD-01) ─────────────────────────────────────────────
	it('item 0 is verbatim "All installed apps and their data"', () => {
		expect(DELETION_LIST[0]).toBe('All installed apps and their data')
	})
	it('item 1 is verbatim "All user accounts (admin, members, guests)"', () => {
		expect(DELETION_LIST[1]).toBe('All user accounts (admin, members, guests)')
	})
	it('item 2 is verbatim "All sessions, JWT tokens, and stored secrets"', () => {
		expect(DELETION_LIST[2]).toBe('All sessions, JWT tokens, and stored secrets')
	})
	it('item 3 mentions AI keys with provider names (Anthropic, OpenAI, Kimi)', () => {
		expect(DELETION_LIST[3]).toBe('All AI keys (Anthropic, OpenAI, Kimi, etc.)')
	})
	it('item 4 is verbatim "All schedules and automations"', () => {
		expect(DELETION_LIST[4]).toBe('All schedules and automations')
	})
	it('item 5 mentions Docker volumes managed by LivOS (R6 mitigation — scoped, not global)', () => {
		expect(DELETION_LIST[5]).toBe('All Docker volumes managed by LivOS')
	})
	it('item 6 is verbatim "All system settings and preferences"', () => {
		expect(DELETION_LIST[6]).toBe('All system settings and preferences')
	})

	// ── Convenience .contains() assertions ───────────────────────────────────
	it('contains the AI-keys entry with provider names', () => {
		expect(DELETION_LIST).toContain('All AI keys (Anthropic, OpenAI, Kimi, etc.)')
	})
	it('contains the LivOS-scoped Docker volume entry', () => {
		expect(DELETION_LIST).toContain('All Docker volumes managed by LivOS')
	})
})
