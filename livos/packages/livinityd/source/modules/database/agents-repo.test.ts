/**
 * Phase 85 V32-AGENT-02 — agents-repo tests (v32 milestone Wave 1).
 *
 * Test backend: mocked pool, matching the Phase 76 test discipline
 * (agent-templates-repo.test.ts). pg-mem is NOT in livinityd devDeps and a
 * DATABASE_URL skip-fallback would silently no-op in CI; mocked-pool
 * deterministically asserts the SQL contract (column names, parameter
 * indices, parameterized $N placeholders, row→camelCase mapping).
 *
 * Coverage:
 *   T1  — listAgents returns {rows: [], total: 0} on empty table
 *   T2  — listAgents row→camelCase mapping (jsonb fields, tags, etc.)
 *   T3  — listAgents emits ILIKE search clause when opts.search is set
 *   T4  — listAgents whitelisted sort columns (rejects injection)
 *   T5  — listAgents includePublic merges system seeds + public rows
 *   T6  — getAgent returns null for missing id
 *   T7  — getAgent enforces user_id OR public visibility
 *   T8  — createAgent inserts with defaults + JSONB serialization
 *   T9  — updateAgent dynamic SET clause + updated_at = NOW()
 *   T10 — updateAgent with no fields is a no-op (returns getAgent result)
 *   T11 — deleteAgent returns true on hit, false on miss
 *   T12 — cloneAgentToLibrary copies source row + bumps download_count
 *   T13 — cloneAgentToLibrary refuses non-public source
 *   T14 — setMarketplacePublished true sets is_public + timestamp
 *   T15 — setMarketplacePublished false clears timestamp
 *   T16 — listPublicAgents WHERE is_public = TRUE
 */

import {beforeEach, describe, expect, test, vi} from 'vitest'

import {
	listAgents,
	listPublicAgents,
	getAgent,
	createAgent,
	updateAgent,
	deleteAgent,
	cloneAgentToLibrary,
	setMarketplacePublished,
	type Agent,
} from './agents-repo.js'

const queryMock = vi.fn()
const fakePool = {query: queryMock} as any

const SAMPLE_USER_ID = '00000000-0000-4000-8000-000000000001'
const SAMPLE_AGENT_ID = '99999999-9999-4999-8999-999999999999'

function makeRow(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
	return {
		id: SAMPLE_AGENT_ID,
		user_id: SAMPLE_USER_ID,
		name: 'Test Agent',
		description: 'a test agent',
		system_prompt: 'You are helpful.',
		model_tier: 'sonnet',
		configured_mcps: [],
		agentpress_tools: {terminal: true},
		avatar: '🤖',
		avatar_color: '#3b82f6',
		is_default: false,
		is_public: false,
		marketplace_published_at: null,
		download_count: 0,
		tags: ['test'],
		created_at: new Date('2026-05-05T00:00:00Z'),
		updated_at: new Date('2026-05-05T00:00:00Z'),
		...over,
	}
}

describe('agents-repo (Phase 85 V32-AGENT-02)', () => {
	beforeEach(() => {
		queryMock.mockReset()
	})

	// ── listAgents ────────────────────────────────────────────────────────

	test('T1 — listAgents returns {rows: [], total: 0} on empty table', async () => {
		queryMock.mockResolvedValueOnce({rows: [{count: '0'}], rowCount: 1})
		queryMock.mockResolvedValueOnce({rows: [], rowCount: 0})

		const result = await listAgents(fakePool, SAMPLE_USER_ID)

		expect(result).toEqual({rows: [], total: 0})
		expect(queryMock).toHaveBeenCalledTimes(2)
		const [countSql] = queryMock.mock.calls[0]
		expect(countSql).toContain('SELECT COUNT(*)')
		expect(countSql).toContain('WHERE user_id = $1')
	})

	test('T2 — listAgents row→camelCase mapping (jsonb fields, tags)', async () => {
		queryMock.mockResolvedValueOnce({rows: [{count: '1'}], rowCount: 1})
		queryMock.mockResolvedValueOnce({rows: [makeRow()], rowCount: 1})

		const result = await listAgents(fakePool, SAMPLE_USER_ID)

		expect(result.total).toBe(1)
		expect(result.rows).toHaveLength(1)
		const a: Agent = result.rows[0]
		expect(a.id).toBe(SAMPLE_AGENT_ID)
		expect(a.userId).toBe(SAMPLE_USER_ID)
		expect(a.name).toBe('Test Agent')
		expect(a.systemPrompt).toBe('You are helpful.')
		expect(a.modelTier).toBe('sonnet')
		expect(a.configuredMcps).toEqual([])
		expect(a.agentpressTools).toEqual({terminal: true})
		expect(a.avatar).toBe('🤖')
		expect(a.avatarColor).toBe('#3b82f6')
		expect(a.isDefault).toBe(false)
		expect(a.isPublic).toBe(false)
		expect(a.tags).toEqual(['test'])
	})

	test('T2b — defensive fallbacks: configured_mcps=null, agentpress_tools=null, tags=null', async () => {
		queryMock.mockResolvedValueOnce({rows: [{count: '1'}], rowCount: 1})
		queryMock.mockResolvedValueOnce({
			rows: [makeRow({configured_mcps: null, agentpress_tools: null, tags: null})],
			rowCount: 1,
		})

		const result = await listAgents(fakePool, SAMPLE_USER_ID)

		expect(result.rows[0].configuredMcps).toEqual([])
		expect(result.rows[0].agentpressTools).toEqual({})
		expect(result.rows[0].tags).toEqual([])
	})

	test('T3 — listAgents emits ILIKE search clause when opts.search is set', async () => {
		queryMock.mockResolvedValueOnce({rows: [{count: '0'}], rowCount: 1})
		queryMock.mockResolvedValueOnce({rows: [], rowCount: 0})

		await listAgents(fakePool, SAMPLE_USER_ID, {search: 'researcher'})

		const [countSql, countParams] = queryMock.mock.calls[0]
		expect(countSql).toContain('ILIKE')
		expect(countParams).toEqual([SAMPLE_USER_ID, '%researcher%'])
	})

	test('T3b — listAgents whitespace-only search treated as no-search', async () => {
		queryMock.mockResolvedValueOnce({rows: [{count: '0'}], rowCount: 1})
		queryMock.mockResolvedValueOnce({rows: [], rowCount: 0})

		await listAgents(fakePool, SAMPLE_USER_ID, {search: '   '})

		const [countSql] = queryMock.mock.calls[0]
		expect(countSql).not.toContain('ILIKE')
	})

	test('T4 — listAgents sort column is whitelisted (rejects injection attempt)', async () => {
		queryMock.mockResolvedValueOnce({rows: [{count: '0'}], rowCount: 1})
		queryMock.mockResolvedValueOnce({rows: [], rowCount: 0})

		// Attacker tries to inject; the repo should fall back to created_at.
		await listAgents(fakePool, SAMPLE_USER_ID, {sort: 'name; DROP TABLE agents;--' as any})

		const [, , rowsCallParams] = [
			queryMock.mock.calls[0][0],
			queryMock.mock.calls[1][0],
			queryMock.mock.calls[1][1],
		]
		const rowsSql = queryMock.mock.calls[1][0]
		expect(rowsSql).toContain('ORDER BY created_at')
		expect(rowsSql).not.toContain('DROP TABLE')
		expect(rowsCallParams).toBeDefined()
	})

	test('T4b — listAgents accepts whitelisted sort columns', async () => {
		queryMock.mockResolvedValueOnce({rows: [{count: '0'}], rowCount: 1})
		queryMock.mockResolvedValueOnce({rows: [], rowCount: 0})

		await listAgents(fakePool, SAMPLE_USER_ID, {sort: 'download_count', order: 'desc'})

		const rowsSql = queryMock.mock.calls[1][0]
		expect(rowsSql).toContain('ORDER BY download_count DESC')
	})

	test('T5 — listAgents includePublic merges system seeds + public rows', async () => {
		queryMock.mockResolvedValueOnce({rows: [{count: '0'}], rowCount: 1})
		queryMock.mockResolvedValueOnce({rows: [], rowCount: 0})

		await listAgents(fakePool, SAMPLE_USER_ID, {includePublic: true})

		const [countSql] = queryMock.mock.calls[0]
		expect(countSql).toContain('user_id IS NULL')
		expect(countSql).toContain('is_public = TRUE')
	})

	// ── getAgent ──────────────────────────────────────────────────────────

	test('T6 — getAgent returns null for missing id (NEVER throws)', async () => {
		queryMock.mockResolvedValueOnce({rows: [], rowCount: 0})

		const result = await getAgent(fakePool, SAMPLE_AGENT_ID, SAMPLE_USER_ID)

		expect(result).toBeNull()
		const [sql, params] = queryMock.mock.calls[0]
		expect(sql).toContain('WHERE id = $1')
		expect(sql).toContain('user_id = $2 OR user_id IS NULL OR is_public = TRUE')
		expect(params).toEqual([SAMPLE_AGENT_ID, SAMPLE_USER_ID])
	})

	test('T7 — getAgent returns mapped row when hit', async () => {
		queryMock.mockResolvedValueOnce({rows: [makeRow()], rowCount: 1})

		const result = await getAgent(fakePool, SAMPLE_AGENT_ID, SAMPLE_USER_ID)

		expect(result).not.toBeNull()
		expect(result!.id).toBe(SAMPLE_AGENT_ID)
		expect(result!.userId).toBe(SAMPLE_USER_ID)
	})

	// ── createAgent ───────────────────────────────────────────────────────

	test('T8 — createAgent inserts with defaults + JSONB serialization', async () => {
		queryMock.mockResolvedValueOnce({rows: [makeRow({name: 'New Agent'})], rowCount: 1})

		const result = await createAgent(fakePool, SAMPLE_USER_ID, {
			name: 'New Agent',
			configuredMcps: [{name: 'bytebot', enabledTools: ['screenshot']}],
			agentpressTools: {terminal: true, files: false},
			tags: ['new'],
		})

		expect(result.name).toBe('New Agent')
		const [sql, params] = queryMock.mock.calls[0]
		expect(sql).toContain('INSERT INTO agents')
		expect(sql).toContain('$7::jsonb')
		expect(sql).toContain('$8::jsonb')
		// id (param 1), userId (2), name (3), description default '' (4),
		// systemPrompt default (5), modelTier default 'sonnet' (6),
		// configuredMcps json (7), agentpressTools json (8), avatar (9),
		// avatarColor (10), isDefault (11), tags (12)
		expect(params[1]).toBe(SAMPLE_USER_ID)
		expect(params[2]).toBe('New Agent')
		expect(params[3]).toBe('')
		expect(params[4]).toBe('You are a helpful assistant.')
		expect(params[5]).toBe('sonnet')
		expect(JSON.parse(params[6])).toEqual([
			{name: 'bytebot', enabledTools: ['screenshot']},
		])
		expect(JSON.parse(params[7])).toEqual({terminal: true, files: false})
		expect(params[10]).toBe(false)
		expect(params[11]).toEqual(['new'])
	})

	// ── updateAgent ───────────────────────────────────────────────────────

	test('T9 — updateAgent builds dynamic SET clause + updated_at = NOW()', async () => {
		queryMock.mockResolvedValueOnce({rows: [makeRow({name: 'Renamed'})], rowCount: 1})

		const result = await updateAgent(fakePool, SAMPLE_AGENT_ID, SAMPLE_USER_ID, {
			name: 'Renamed',
			modelTier: 'opus',
		})

		expect(result).not.toBeNull()
		expect(result!.name).toBe('Renamed')
		const [sql] = queryMock.mock.calls[0]
		expect(sql).toContain('UPDATE agents SET')
		expect(sql).toContain('name = $1')
		expect(sql).toContain('model_tier = $2')
		expect(sql).toContain('updated_at = NOW()')
		expect(sql).toContain('WHERE id = $3 AND user_id = $4')
	})

	test('T9b — updateAgent JSONB fields use ::jsonb cast', async () => {
		queryMock.mockResolvedValueOnce({rows: [makeRow()], rowCount: 1})

		await updateAgent(fakePool, SAMPLE_AGENT_ID, SAMPLE_USER_ID, {
			agentpressTools: {terminal: false},
		})

		const [sql, params] = queryMock.mock.calls[0]
		expect(sql).toContain('agentpress_tools = $1::jsonb')
		expect(JSON.parse(params[0])).toEqual({terminal: false})
	})

	test('T10 — updateAgent with no fields is a no-op (delegates to getAgent)', async () => {
		// Empty partial → call falls through to getAgent (single SELECT)
		queryMock.mockResolvedValueOnce({rows: [makeRow()], rowCount: 1})

		const result = await updateAgent(fakePool, SAMPLE_AGENT_ID, SAMPLE_USER_ID, {})

		expect(result).not.toBeNull()
		// Only one query (the SELECT inside getAgent), no UPDATE issued.
		expect(queryMock).toHaveBeenCalledTimes(1)
		const [sql] = queryMock.mock.calls[0]
		expect(sql).toContain('SELECT')
		expect(sql).not.toContain('UPDATE')
	})

	test('T10b — updateAgent returns null when row not owned by user', async () => {
		queryMock.mockResolvedValueOnce({rows: [], rowCount: 0})

		const result = await updateAgent(fakePool, SAMPLE_AGENT_ID, SAMPLE_USER_ID, {
			name: 'Renamed',
		})

		expect(result).toBeNull()
	})

	// ── deleteAgent ───────────────────────────────────────────────────────

	test('T11 — deleteAgent returns true on hit, false on miss', async () => {
		queryMock.mockResolvedValueOnce({rows: [], rowCount: 1})
		const hit = await deleteAgent(fakePool, SAMPLE_AGENT_ID, SAMPLE_USER_ID)
		expect(hit).toBe(true)

		queryMock.mockResolvedValueOnce({rows: [], rowCount: 0})
		const miss = await deleteAgent(fakePool, SAMPLE_AGENT_ID, SAMPLE_USER_ID)
		expect(miss).toBe(false)

		expect(queryMock).toHaveBeenCalledTimes(2)
		for (const call of queryMock.mock.calls) {
			const [sql, params] = call
			expect(sql).toContain('DELETE FROM agents')
			expect(sql).toContain('WHERE id = $1 AND user_id = $2')
			expect(params).toEqual([SAMPLE_AGENT_ID, SAMPLE_USER_ID])
		}
	})

	test('T11b — deleteAgent treats undefined rowCount as false (PG driver edge)', async () => {
		queryMock.mockResolvedValueOnce({rows: []})
		const result = await deleteAgent(fakePool, SAMPLE_AGENT_ID, SAMPLE_USER_ID)
		expect(result).toBe(false)
	})

	// ── cloneAgentToLibrary ───────────────────────────────────────────────

	test('T12 — cloneAgentToLibrary copies source row + bumps download_count', async () => {
		const sourceRow = makeRow({
			id: SAMPLE_AGENT_ID,
			user_id: null,
			is_public: true,
			name: '🔬 Researcher',
			configured_mcps: [{name: 'bytebot', enabledTools: ['screenshot']}],
			agentpress_tools: {web_search: true},
			tags: ['research'],
		})
		// 1) SELECT source
		queryMock.mockResolvedValueOnce({rows: [sourceRow], rowCount: 1})
		// 2) INSERT clone
		queryMock.mockResolvedValueOnce({
			rows: [makeRow({name: '🔬 Researcher', user_id: SAMPLE_USER_ID})],
			rowCount: 1,
		})
		// 3) UPDATE download_count
		queryMock.mockResolvedValueOnce({rows: [], rowCount: 1})

		const result = await cloneAgentToLibrary(fakePool, SAMPLE_AGENT_ID, SAMPLE_USER_ID)

		expect(result).not.toBeNull()
		expect(result!.name).toBe('🔬 Researcher')
		expect(result!.userId).toBe(SAMPLE_USER_ID)

		expect(queryMock).toHaveBeenCalledTimes(3)
		const [selectSql] = queryMock.mock.calls[0]
		expect(selectSql).toContain('is_public = TRUE OR user_id IS NULL')

		const [insertSql] = queryMock.mock.calls[1]
		expect(insertSql).toContain('INSERT INTO agents')

		const [updateSql, updateParams] = queryMock.mock.calls[2]
		expect(updateSql).toContain('download_count = download_count + 1')
		expect(updateParams).toEqual([SAMPLE_AGENT_ID])
	})

	test('T13 — cloneAgentToLibrary returns null when source is not public', async () => {
		queryMock.mockResolvedValueOnce({rows: [], rowCount: 0})

		const result = await cloneAgentToLibrary(fakePool, SAMPLE_AGENT_ID, SAMPLE_USER_ID)

		expect(result).toBeNull()
		// Only the SELECT query ran; no INSERT, no UPDATE.
		expect(queryMock).toHaveBeenCalledTimes(1)
	})

	// ── setMarketplacePublished ───────────────────────────────────────────

	test('T14 — setMarketplacePublished true sets is_public + marketplace_published_at = NOW()', async () => {
		queryMock.mockResolvedValueOnce({
			rows: [makeRow({is_public: true, marketplace_published_at: new Date()})],
			rowCount: 1,
		})

		const result = await setMarketplacePublished(
			fakePool,
			SAMPLE_AGENT_ID,
			SAMPLE_USER_ID,
			true,
		)

		expect(result).not.toBeNull()
		expect(result!.isPublic).toBe(true)
		expect(result!.marketplacePublishedAt).not.toBeNull()
		const [sql, params] = queryMock.mock.calls[0]
		expect(sql).toContain('is_public = $1')
		expect(sql).toContain('CASE WHEN $1 THEN NOW() ELSE NULL END')
		expect(sql).toContain('updated_at = NOW()')
		expect(params).toEqual([true, SAMPLE_AGENT_ID, SAMPLE_USER_ID])
	})

	test('T15 — setMarketplacePublished false clears marketplace_published_at to NULL', async () => {
		queryMock.mockResolvedValueOnce({
			rows: [makeRow({is_public: false, marketplace_published_at: null})],
			rowCount: 1,
		})

		const result = await setMarketplacePublished(
			fakePool,
			SAMPLE_AGENT_ID,
			SAMPLE_USER_ID,
			false,
		)

		expect(result).not.toBeNull()
		expect(result!.isPublic).toBe(false)
		expect(result!.marketplacePublishedAt).toBeNull()
		const [, params] = queryMock.mock.calls[0]
		expect(params[0]).toBe(false)
	})

	test('T15b — setMarketplacePublished returns null when not owner', async () => {
		queryMock.mockResolvedValueOnce({rows: [], rowCount: 0})

		const result = await setMarketplacePublished(
			fakePool,
			SAMPLE_AGENT_ID,
			SAMPLE_USER_ID,
			true,
		)

		expect(result).toBeNull()
	})

	// ── listPublicAgents ──────────────────────────────────────────────────

	test('T16 — listPublicAgents WHERE is_public = TRUE, ordered by published date', async () => {
		queryMock.mockResolvedValueOnce({rows: [{count: '5'}], rowCount: 1})
		queryMock.mockResolvedValueOnce({
			rows: [makeRow({is_public: true, user_id: null})],
			rowCount: 1,
		})

		const result = await listPublicAgents(fakePool, {limit: 10})

		expect(result.total).toBe(5)
		expect(result.rows).toHaveLength(1)
		const [countSql] = queryMock.mock.calls[0]
		expect(countSql).toContain('WHERE is_public = TRUE')
		const [rowsSql] = queryMock.mock.calls[1]
		expect(rowsSql).toContain('ORDER BY marketplace_published_at DESC NULLS LAST')
	})
})
