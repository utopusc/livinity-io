// Phase 29 Plan 29-01 — useRecentSearches unit tests.
//
// Locks down the recent-search localStorage ring buffer behaviour. Tests
// run under jsdom (vitest UI default), so window.localStorage is available.
// We clear it between tests to ensure isolation.
//
// Pure-helper-as-fixture pattern: the hook exports pure helpers
// (loadRecent, pushRecent) that the React useState wrapper calls. Tests hit
// the helpers directly — no renderHook / @testing-library dependency needed.
// The same pattern was used by Plan 28-01 (parseLogsParams + log-buffer:
// pure helpers tested in isolation, hook layer wraps them).

import {beforeEach, describe, expect, test} from 'vitest'

import {KEY, loadRecent, MAX, pushRecent} from './use-recent-searches.js'

describe('useRecentSearches helpers', () => {
	beforeEach(() => {
		localStorage.clear()
	})

	test('A: loadRecent on empty/missing localStorage → []', () => {
		expect(loadRecent()).toEqual([])
	})

	test('A2: loadRecent on invalid JSON → [] (defensive)', () => {
		localStorage.setItem(KEY, 'not-json{')
		expect(loadRecent()).toEqual([])
	})

	test("B: pushRecent([], 'foo') → ['foo']", () => {
		expect(pushRecent([], 'foo')).toEqual(['foo'])
	})

	test("C: push 'foo' then 'bar' → ['bar', 'foo'] (newest first)", () => {
		const after1 = pushRecent([], 'foo')
		const after2 = pushRecent(after1, 'bar')
		expect(after2).toEqual(['bar', 'foo'])
	})

	test("D: push 'foo' twice → ['foo'] (dedupe)", () => {
		// Initial state ['bar', 'foo']; re-adding 'foo' moves it to head.
		const out = pushRecent(['bar', 'foo'], 'foo')
		expect(out).toEqual(['foo', 'bar'])
	})

	test('E: pushing 9 distinct values → cap at MAX (drop oldest)', () => {
		let list: string[] = []
		const values = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']
		for (const v of values) {
			list = pushRecent(list, v)
		}
		expect(MAX).toBe(8)
		expect(list).toEqual(['i', 'h', 'g', 'f', 'e', 'd', 'c', 'b'])
		expect(list.length).toBe(MAX)
	})

	test('F: pushRecent on empty / whitespace input → unchanged (no-op)', () => {
		expect(pushRecent(['x'], '')).toEqual(['x'])
		expect(pushRecent(['x'], '   ')).toEqual(['x'])
		expect(pushRecent(['x'], '\t\n')).toEqual(['x'])
	})

	test("G: pushRecent('   bar   ') → trimmed; stored as 'bar'", () => {
		expect(pushRecent([], '   bar   ')).toEqual(['bar'])
	})
})
