// @vitest-environment jsdom
//
// Phase 62 Plan 62-05 — useUsageFilter hook tests (FR-BROKER-E2-02).
//
// Pure-helper-as-fixture pattern (mirrors use-recent-searches.unit.test.ts):
// loadFilter / saveFilter are pure and tested in isolation; the hook layer
// is exercised via React's useState by importing it and invoking it through
// a tiny renderer-free probe (call the hook function inside a test
// component and read state via re-renders is not possible without RTL —
// instead we test the hook's contract by isolating loadFilter/saveFilter
// helpers, which is identical in surface area).
//
// Tests cover the 7 contract points from 62-05-PLAN.md Task 1:
//   1. loadFilter returns null on empty localStorage
//   2. loadFilter returns saved UUID
//   3. saveFilter(null) removes the key
//   4. saveFilter(uuid) writes the key
//   5. round-trip: save then load returns same value
//   6. saveFilter swallows quota errors silently
//   7. KEY === 'livinity:usage:filter:apiKeyId' (verbatim guard)

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {KEY, loadFilter, saveFilter} from './use-usage-filter'

const TEST_UUID_1 = '00000000-0000-4000-8000-000000000001'
const TEST_UUID_2 = '00000000-0000-4000-8000-000000000002'

describe('useUsageFilter helpers (FR-BROKER-E2-02)', () => {
	beforeEach(() => {
		localStorage.clear()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	test('1. KEY constant equals the CONTEXT.md verbatim string', () => {
		expect(KEY).toBe('livinity:usage:filter:apiKeyId')
	})

	test('2. loadFilter returns null when localStorage is empty', () => {
		expect(loadFilter()).toBeNull()
	})

	test('3. loadFilter returns the saved UUID when present', () => {
		localStorage.setItem(KEY, TEST_UUID_1)
		expect(loadFilter()).toBe(TEST_UUID_1)
	})

	test('4. loadFilter returns null when stored value is empty string', () => {
		localStorage.setItem(KEY, '')
		expect(loadFilter()).toBeNull()
	})

	test('5. saveFilter(uuid) writes the key to localStorage', () => {
		saveFilter(TEST_UUID_1)
		expect(localStorage.getItem(KEY)).toBe(TEST_UUID_1)
	})

	test('6. saveFilter(null) removes the key from localStorage', () => {
		localStorage.setItem(KEY, TEST_UUID_1)
		saveFilter(null)
		expect(localStorage.getItem(KEY)).toBeNull()
	})

	test('7. round-trip: saveFilter then loadFilter returns same value', () => {
		saveFilter(TEST_UUID_2)
		expect(loadFilter()).toBe(TEST_UUID_2)
		saveFilter(null)
		expect(loadFilter()).toBeNull()
	})

	test('8. saveFilter swallows quota errors silently', () => {
		const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			const err = new Error('QuotaExceededError') as Error & {name: string}
			err.name = 'QuotaExceededError'
			throw err
		})

		// Should NOT throw.
		expect(() => saveFilter(TEST_UUID_1)).not.toThrow()
		expect(setItemSpy).toHaveBeenCalledTimes(1)
	})

	test('9. loadFilter swallows getItem errors silently', () => {
		const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new Error('SecurityError')
		})

		expect(() => loadFilter()).not.toThrow()
		expect(loadFilter()).toBeNull()
		expect(getItemSpy).toHaveBeenCalled()
	})
})

describe('useUsageFilter hook export shape', () => {
	test('module exports useUsageFilter function', async () => {
		const mod = await import('./use-usage-filter')
		expect(typeof mod.useUsageFilter).toBe('function')
		expect(typeof mod.loadFilter).toBe('function')
		expect(typeof mod.saveFilter).toBe('function')
		expect(typeof mod.KEY).toBe('string')
	})
})
