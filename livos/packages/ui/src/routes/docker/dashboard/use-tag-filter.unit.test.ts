// Phase 25 Plan 25-02 — useTagFilter unit tests (DOC-06).
//
// Locks down the four pure helpers that back the useTagFilter hook:
//   - deriveAllTags  : derives the alphabetised, deduped tag union
//   - filterEnvs     : client-side env list filter (single-select)
//   - readPersistedTag / writePersistedTag : localStorage roundtrip
//
// The hook itself is a thin wrapper around these helpers — testing the helpers
// in isolation lets us avoid pulling in @testing-library/react (not in deps;
// adding it just for renderHook is heavy). Plan 24-02 D-12 ("smoke chain test
// for layout files") established the precedent.

import {beforeEach, describe, expect, test} from 'vitest'

import {
	deriveAllTags,
	filterEnvs,
	readPersistedTag,
	TAG_FILTER_STORAGE_KEY,
	writePersistedTag,
} from './use-tag-filter'

describe('deriveAllTags', () => {
	test('deduplicates and sorts ascending', () => {
		const envs = [{tags: []}, {tags: ['prod', 'us-east']}, {tags: ['prod', 'db']}]
		expect(deriveAllTags(envs)).toEqual(['db', 'prod', 'us-east'])
	})

	test('empty input returns []', () => {
		expect(deriveAllTags([])).toEqual([])
	})
})

describe('filterEnvs', () => {
	const envs = [
		{name: 'a', tags: ['prod', 'us-east']},
		{name: 'b', tags: ['dev']},
		{name: 'c', tags: ['prod']},
	]

	test('null selected returns all envs unchanged', () => {
		expect(filterEnvs(envs, null)).toEqual(envs)
	})

	test("returns only envs whose tags include 'prod'", () => {
		expect(filterEnvs(envs, 'prod')).toEqual([envs[0], envs[2]])
	})

	test('non-existent tag returns empty array', () => {
		expect(filterEnvs(envs, 'nonexistent')).toEqual([])
	})

	test('empty input returns empty array', () => {
		expect(filterEnvs([], 'prod')).toEqual([])
	})
})

describe('localStorage roundtrip', () => {
	beforeEach(() => {
		localStorage.clear()
	})

	test('writePersistedTag(tag) stores under the documented key', () => {
		writePersistedTag('prod')
		expect(localStorage.getItem(TAG_FILTER_STORAGE_KEY)).toBe('prod')
	})

	test('writePersistedTag(null) clears the key', () => {
		localStorage.setItem(TAG_FILTER_STORAGE_KEY, 'staging')
		writePersistedTag(null)
		expect(localStorage.getItem(TAG_FILTER_STORAGE_KEY)).toBeNull()
	})

	test('readPersistedTag returns null when no value is stored', () => {
		expect(readPersistedTag()).toBeNull()
	})

	test('readPersistedTag returns the stored value after writePersistedTag', () => {
		writePersistedTag('us-east')
		expect(readPersistedTag()).toBe('us-east')
	})
})
