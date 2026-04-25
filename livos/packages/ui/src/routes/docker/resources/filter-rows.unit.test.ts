// Phase 26 Plan 26-01 — filterByQuery tests.
//
// The filter is the same primitive used by ContainerSection (name + image
// haystack) and ImageSection (joined repoTags haystack). Empty-query
// referential identity is a tiny perf win that lets sections skip a useMemo
// when no search is active — locked down here.

import {describe, expect, test} from 'vitest'

import {filterByQuery} from './filter-rows'

interface Row {
	name: string
	image: string
}

const ROWS: readonly Row[] = [
	{name: 'redis_main', image: 'redis:7'},
	{name: 'pg', image: 'postgres:16'},
	{name: 'app', image: 'redis-stack:latest'},
] as const

describe('filterByQuery', () => {
	test('A: empty string returns the SAME array reference (no useMemo cost)', () => {
		const rows: Row[] = [...ROWS]
		const out = filterByQuery(rows, '', (r) => `${r.name} ${r.image}`)
		expect(out).toBe(rows)
	})

	test("B: query 'redis' matches name=redis_main AND image=redis-stack:latest (substring)", () => {
		const out = filterByQuery([...ROWS], 'redis', (r) => `${r.name} ${r.image}`)
		expect(out.map((r) => r.name)).toEqual(['redis_main', 'app'])
	})

	test('C: query is case-insensitive', () => {
		const out = filterByQuery([...ROWS], 'REDIS', (r) => `${r.name} ${r.image}`)
		expect(out.map((r) => r.name)).toEqual(['redis_main', 'app'])
	})

	test('D: leading and trailing whitespace in query is trimmed', () => {
		const out = filterByQuery([...ROWS], '   redis   ', (r) => `${r.name} ${r.image}`)
		expect(out.map((r) => r.name)).toEqual(['redis_main', 'app'])
	})
})
