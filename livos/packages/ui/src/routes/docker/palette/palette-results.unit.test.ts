// Phase 29 Plan 29-01 — buildPaletteResults unit tests.
//
// Locks down the palette result-building algorithm:
//   - Empty query → all items grouped by category, alpha sorted, capped.
//   - Non-empty query → substring match (case-insensitive); prefix > suffix
//     scoring (lower indexOf is better).
//   - Query length cap at 200 chars (T-29-01 ReDoS-class defensive bound).
//   - No dedupe across categories — a name shared across containers + stacks
//     appears in both groups (intentional; categories are the primary axis).
//   - Each category capped at 8 results.
//   - Sections category — always present, matches against section ids/labels.
//
// Pure helper, no React. Imports: just the result builder + types.

import {describe, expect, test} from 'vitest'

import {buildPaletteResults, type PaletteResultsInput} from './palette-results.js'

const baseInput: PaletteResultsInput = {
	query: '',
	containers: [],
	stacks: [],
	images: [],
	volumes: [],
	networks: [],
	environments: [],
}

const containers = [
	{name: 'n8n'},
	{name: 'web'},
	{name: 'database'},
	{name: 'redis'},
	{name: 'postgres'},
]

const stacks = [{name: 'web'}, {name: 'analytics'}, {name: 'media'}]

const images = [
	{id: 'sha256:aaa', repoTags: ['nginx:latest']},
	{id: 'sha256:bbb', repoTags: ['n8nio/n8n:1.0.0']},
	{id: 'sha256:ccc', repoTags: ['<none>:<none>']},
]

const volumes = [{name: 'n8n_data'}, {name: 'redis_data'}]

const networks = [
	{id: 'net-1', name: 'bridge'},
	{id: 'net-2', name: 'host'},
]

const environments = [
	{id: '00000000-0000-0000-0000-000000000000', name: 'local'},
	{id: 'env-2', name: 'production-server'},
]

describe('buildPaletteResults', () => {
	test('A: empty query → all categories present, sections always included', () => {
		const out = buildPaletteResults({
			...baseInput,
			query: '',
			containers,
			stacks,
			images,
			volumes,
			networks,
			environments,
		})
		expect(out.containers.length).toBe(5)
		expect(out.stacks.length).toBe(3)
		expect(out.images.length).toBeGreaterThan(0)
		expect(out.volumes.length).toBe(2)
		expect(out.networks.length).toBe(2)
		expect(out.environments.length).toBe(2)
		// Sections always populated regardless of query.
		expect(out.sections.length).toBeGreaterThan(0)
	})

	test('B: query=n8 → containers/images/volumes with n8 substring (case-insensitive)', () => {
		const out = buildPaletteResults({
			...baseInput,
			query: 'n8',
			containers,
			images,
			volumes,
		})
		expect(out.containers.map((r) => r.id)).toEqual(['n8n'])
		// nginx does NOT contain 'n8' — only n8nio/n8n matches.
		const imageIds = out.images.map((r) => r.label.toLowerCase())
		expect(imageIds.some((label) => label.includes('n8n'))).toBe(true)
		expect(imageIds.some((label) => label.includes('nginx'))).toBe(false)
		expect(out.volumes.map((r) => r.id)).toEqual(['n8n_data'])
	})

	test('B2: prefix matches score higher than mid-substring matches', () => {
		const ranked = buildPaletteResults({
			...baseInput,
			query: 'web',
			containers: [{name: 'midweb'}, {name: 'web'}, {name: 'webapp'}],
		})
		// 'web' (prefix, indexOf 0) and 'webapp' (prefix, indexOf 0) should
		// come before 'midweb' (mid-substring, indexOf 3). Tie-break alpha-asc.
		expect(ranked.containers.map((r) => r.id)).toEqual(['web', 'webapp', 'midweb'])
	})

	test('C: query length cap — 500-char input is sliced to 200 before matching', () => {
		const longQuery = 'a'.repeat(500)
		const out = buildPaletteResults({
			...baseInput,
			query: longQuery,
			containers: [{name: 'aaaa'}],
		})
		// Must NOT throw, must NOT spend O(n × 500) on each item. The actual
		// behavioural check: a query of 500 'a's, sliced to 200 'a's, then
		// .toLowerCase().indexOf('aaa…200) on 'aaaa' → -1 (no match, since
		// 200 > 4). Result: empty.
		expect(out.containers).toEqual([])
	})

	test('D: query with no matches → empty CategorizedResults (UI shows CommandEmpty)', () => {
		const out = buildPaletteResults({
			...baseInput,
			query: 'xyzzz-no-match',
			containers,
			stacks,
			images,
		})
		expect(out.containers).toEqual([])
		expect(out.stacks).toEqual([])
		expect(out.images).toEqual([])
	})

	test('E: shared name "web" → appears in both containers AND stacks (no cross-category dedupe)', () => {
		const out = buildPaletteResults({
			...baseInput,
			query: 'web',
			containers,
			stacks,
		})
		expect(out.containers.find((r) => r.id === 'web')).toBeTruthy()
		expect(out.stacks.find((r) => r.id === 'web')).toBeTruthy()
	})

	test('F: max 8 results per category (prevent overflow on large workspaces)', () => {
		const manyContainers = Array.from({length: 20}, (_, i) => ({name: `c${i}`}))
		const out = buildPaletteResults({
			...baseInput,
			query: 'c',
			containers: manyContainers,
		})
		expect(out.containers.length).toBe(8)
	})

	test('G: section-id matching — query="set" matches the "settings" section', () => {
		const out = buildPaletteResults({...baseInput, query: 'set'})
		const ids = out.sections.map((r) => r.id)
		expect(ids).toContain('settings')
	})
})
