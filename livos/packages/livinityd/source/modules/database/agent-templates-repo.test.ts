/**
 * Phase 76 Plan 76-01 — agent_templates repository tests.
 *
 * Test backend selection (per plan step 5):
 *   - pg-mem: NOT in livinityd devDeps → skipped.
 *   - DATABASE_URL: not required for CI; if set, fall through to mocked-pool
 *     anyway — these tests assert the SQL contract, not Postgres behavior
 *     (matching existing project test discipline, e.g. api-keys/database.test.ts
 *     and usage-tracking/database.test.ts which mock getPool()).
 *   - Mocked pool: chosen mode (Claude's discretion clause). Each test
 *     stubs pool.query() to verify (a) the exact SQL emitted by each repo
 *     function, (b) the parameter shape, (c) the row→type mapping.
 *
 * 5 cases (per plan tasks step 5):
 *   1. listAgentTemplates returns [] on empty table
 *   2. listAgentTemplates returns row after INSERT (row→camelCase mapping)
 *   3. listAgentTemplates({tags:[...]}) emits the @> containment query
 *   4. getAgentTemplate returns null for missing slug (no throw)
 *   5. incrementCloneCount roundtrip + miss case
 */

import {beforeEach, describe, expect, test, vi} from 'vitest'

import {
	listAgentTemplates,
	getAgentTemplate,
	incrementCloneCount,
	type AgentTemplate,
} from './agent-templates-repo.js'

const queryMock = vi.fn()
const fakePool = {query: queryMock} as any

describe('agent-templates-repo (Phase 76 MARKET-01)', () => {
	beforeEach(() => {
		queryMock.mockReset()
	})

	test('T1 — listAgentTemplates returns [] on empty table', async () => {
		queryMock.mockResolvedValueOnce({rows: [], rowCount: 0})

		const result = await listAgentTemplates(fakePool)

		expect(result).toEqual([])
		expect(queryMock).toHaveBeenCalledTimes(1)
		const [sql, params] = queryMock.mock.calls[0]
		expect(sql).toContain('SELECT * FROM agent_templates')
		expect(sql).toContain('ORDER BY created_at ASC')
		expect(sql).not.toContain('@>')
		// No-tag overload: query is single-arg (no $1 params)
		expect(params).toBeUndefined()
	})

	test('T2 — listAgentTemplates returns one row after INSERT (row→camelCase mapping)', async () => {
		const createdAt = new Date('2026-05-04T00:00:00Z')
		queryMock.mockResolvedValueOnce({
			rows: [
				{
					slug: 'test-1',
					name: 'Test One',
					description: 'a test template',
					system_prompt: 'You are a helpful test assistant.',
					tools_enabled: ['Bash', 'Read'],
					tags: ['research', 'test'],
					mascot_emoji: '🧪',
					clone_count: 0,
					created_at: createdAt,
				},
			],
			rowCount: 1,
		})

		const result = await listAgentTemplates(fakePool)

		expect(result).toHaveLength(1)
		const row: AgentTemplate = result[0]
		expect(row.slug).toBe('test-1')
		expect(row.name).toBe('Test One')
		expect(row.description).toBe('a test template')
		expect(row.systemPrompt).toBe('You are a helpful test assistant.')
		expect(Array.isArray(row.toolsEnabled)).toBe(true)
		expect(row.toolsEnabled).toEqual(['Bash', 'Read'])
		expect(row.tags).toEqual(['research', 'test'])
		expect(row.mascotEmoji).toBe('🧪')
		expect(row.cloneCount).toBe(0)
		expect(row.createdAt).toBe(createdAt)
	})

	test('T2b — rowToTemplate falls back to [] when tools_enabled is not an array (defensive)', async () => {
		queryMock.mockResolvedValueOnce({
			rows: [
				{
					slug: 'odd-row',
					name: 'Odd',
					description: 'd',
					system_prompt: 'p',
					tools_enabled: null, // PG could return null in theory
					tags: [],
					mascot_emoji: '🤖',
					clone_count: 0,
					created_at: new Date(),
				},
			],
			rowCount: 1,
		})

		const result = await listAgentTemplates(fakePool)

		expect(result[0].toolsEnabled).toEqual([])
	})

	test('T3 — listAgentTemplates({tags:["research"]}) filters via GIN @> containment', async () => {
		queryMock.mockResolvedValueOnce({
			rows: [
				{
					slug: 'hit',
					name: 'Hit',
					description: 'has the right tag',
					system_prompt: 'p',
					tools_enabled: [],
					tags: ['research', 'extra'],
					mascot_emoji: '🤖',
					clone_count: 0,
					created_at: new Date(),
				},
			],
			rowCount: 1,
		})

		const result = await listAgentTemplates(fakePool, {tags: ['research']})

		expect(result).toHaveLength(1)
		expect(result[0].slug).toBe('hit')
		expect(queryMock).toHaveBeenCalledTimes(1)
		const [sql, params] = queryMock.mock.calls[0]
		expect(sql).toContain('tags @> $1::text[]')
		expect(sql).toContain('ORDER BY created_at ASC')
		expect(params).toEqual([['research']])
	})

	test('T3b — listAgentTemplates({tags: []}) treats empty filter as no-filter', async () => {
		queryMock.mockResolvedValueOnce({rows: [], rowCount: 0})

		await listAgentTemplates(fakePool, {tags: []})

		const [sql, params] = queryMock.mock.calls[0]
		expect(sql).not.toContain('@>')
		expect(params).toBeUndefined()
	})

	test('T4 — getAgentTemplate returns null for missing slug (NEVER throws)', async () => {
		queryMock.mockResolvedValueOnce({rows: [], rowCount: 0})

		const result = await getAgentTemplate(fakePool, 'nope')

		expect(result).toBeNull()
		const [sql, params] = queryMock.mock.calls[0]
		expect(sql).toContain('SELECT * FROM agent_templates WHERE slug = $1')
		expect(params).toEqual(['nope'])
	})

	test('T4b — getAgentTemplate returns mapped row when slug hits', async () => {
		queryMock.mockResolvedValueOnce({
			rows: [
				{
					slug: 'general-assistant',
					name: 'General',
					description: 'd',
					system_prompt: 'sp',
					tools_enabled: ['Bash'],
					tags: [],
					mascot_emoji: '🤖',
					clone_count: 7,
					created_at: new Date(),
				},
			],
			rowCount: 1,
		})

		const result = await getAgentTemplate(fakePool, 'general-assistant')

		expect(result).not.toBeNull()
		expect(result!.slug).toBe('general-assistant')
		expect(result!.systemPrompt).toBe('sp')
		expect(result!.cloneCount).toBe(7)
	})

	test('T5 — incrementCloneCount returns true on hit, false on miss; uses atomic UPDATE', async () => {
		// Hit case
		queryMock.mockResolvedValueOnce({rows: [], rowCount: 1})
		const hit = await incrementCloneCount(fakePool, 'general-assistant')
		expect(hit).toBe(true)

		// Miss case
		queryMock.mockResolvedValueOnce({rows: [], rowCount: 0})
		const miss = await incrementCloneCount(fakePool, 'nope')
		expect(miss).toBe(false)

		// Verify atomic UPDATE pattern (no SELECT-then-UPDATE race)
		expect(queryMock).toHaveBeenCalledTimes(2)
		for (const call of queryMock.mock.calls) {
			const [sql, params] = call
			expect(sql).toContain('UPDATE agent_templates')
			expect(sql).toContain('clone_count = clone_count + 1')
			expect(sql).toContain('WHERE slug = $1')
			expect(Array.isArray(params)).toBe(true)
		}
		expect(queryMock.mock.calls[0][1]).toEqual(['general-assistant'])
		expect(queryMock.mock.calls[1][1]).toEqual(['nope'])
	})

	test('T5b — incrementCloneCount handles undefined rowCount as false (PG driver edge)', async () => {
		queryMock.mockResolvedValueOnce({rows: []})
		const result = await incrementCloneCount(fakePool, 'whatever')
		expect(result).toBe(false)
	})
})
