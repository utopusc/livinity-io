// Phase 22 MH-04 — docker_agents PG CRUD unit tests.
//
// Mocks getPool() so tests run without a live PostgreSQL.

import {describe, beforeEach, expect, test, vi} from 'vitest'

vi.mock('../database/index.js', () => {
	const fake = {query: vi.fn()}
	return {
		getPool: () => fake,
		__fakePool: fake,
	}
})

import * as dbMod from '../database/index.js'
import {
	createAgent,
	findAgentByToken,
	findAgentByTokenHash,
	hashToken,
	listAgents,
	revokeAgent,
	touchLastSeen,
} from './agents.js'

const fakePool = (dbMod as unknown as {__fakePool: {query: ReturnType<typeof vi.fn>}})
	.__fakePool

const ENV_ID = '11111111-2222-3333-4444-555555555555'
const AGENT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

const baseRow = {
	id: AGENT_ID,
	env_id: ENV_ID,
	token_hash: 'placeholder',
	created_by: null,
	created_at: new Date('2026-04-25T01:00:00Z'),
	last_seen: null,
	revoked_at: null,
}

beforeEach(() => {
	fakePool.query.mockReset()
})

describe('hashToken', () => {
	test('produces a 64-char hex SHA-256 of the input', () => {
		const h = hashToken('abc')
		expect(h).toMatch(/^[0-9a-f]{64}$/)
		// SHA-256 of 'abc'
		expect(h).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
	})

	test('different inputs produce different hashes', () => {
		expect(hashToken('a')).not.toBe(hashToken('b'))
	})
})

describe('createAgent', () => {
	test('inserts a row with SHA-256 hash, returns cleartext token (64-char hex), backfills agent_id', async () => {
		// First call: INSERT INTO docker_agents
		fakePool.query.mockResolvedValueOnce({rows: [{...baseRow, token_hash: 'will-be-overwritten'}]})
		// Second call: UPDATE environments SET agent_id
		fakePool.query.mockResolvedValueOnce({rowCount: 1})

		const {agent, token} = await createAgent({envId: ENV_ID, createdBy: null})

		// Token is 64-char hex (32 random bytes hex)
		expect(token).toMatch(/^[0-9a-f]{64}$/)

		// Two queries fired
		expect(fakePool.query).toHaveBeenCalledTimes(2)
		const [insertSql, insertParams] = fakePool.query.mock.calls[0]
		expect(insertSql).toMatch(/INSERT INTO docker_agents/)
		expect(insertParams[0]).toBe(ENV_ID)
		// Params[1] is the SHA-256 hash, must match hashToken(token)
		expect(insertParams[1]).toBe(hashToken(token))
		expect(insertParams[2]).toBeNull() // createdBy

		const [updateSql, updateParams] = fakePool.query.mock.calls[1]
		expect(updateSql).toMatch(/UPDATE environments SET agent_id/)
		expect(updateParams[0]).toBe(AGENT_ID)
		expect(updateParams[1]).toBe(ENV_ID)

		// Returned row has the camelCased fields
		expect(agent.id).toBe(AGENT_ID)
		expect(agent.envId).toBe(ENV_ID)
	})
})

describe('findAgentByTokenHash', () => {
	test('returns the row when revoked_at IS NULL', async () => {
		const row = {...baseRow, token_hash: 'somehash'}
		fakePool.query.mockResolvedValueOnce({rows: [row]})

		const result = await findAgentByTokenHash('somehash')
		expect(result).toBeTruthy()
		expect(result?.id).toBe(AGENT_ID)

		const [sql, params] = fakePool.query.mock.calls[0]
		expect(sql).toMatch(/WHERE token_hash = \$1 AND revoked_at IS NULL/)
		expect(params[0]).toBe('somehash')
	})

	test('returns null when no row matches (revoked or unknown token)', async () => {
		fakePool.query.mockResolvedValueOnce({rows: []})
		const result = await findAgentByTokenHash('bogus')
		expect(result).toBeNull()
	})
})

describe('findAgentByToken', () => {
	test('hashes the cleartext then delegates to findAgentByTokenHash', async () => {
		fakePool.query.mockResolvedValueOnce({rows: []})
		await findAgentByToken('cleartext-token')

		const [, params] = fakePool.query.mock.calls[0]
		expect(params[0]).toBe(hashToken('cleartext-token'))
	})
})

describe('revokeAgent', () => {
	test('issues UPDATE … SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL', async () => {
		fakePool.query.mockResolvedValueOnce({rowCount: 1})

		await revokeAgent(AGENT_ID)

		const [sql, params] = fakePool.query.mock.calls[0]
		expect(sql).toMatch(/UPDATE docker_agents SET revoked_at = NOW\(\)/)
		expect(sql).toMatch(/AND revoked_at IS NULL/)
		expect(params[0]).toBe(AGENT_ID)
	})

	test('subsequent findAgentByToken returns null (simulated via PG returning 0 rows)', async () => {
		// revoke
		fakePool.query.mockResolvedValueOnce({rowCount: 1})
		await revokeAgent(AGENT_ID)

		// lookup
		fakePool.query.mockResolvedValueOnce({rows: []})
		const result = await findAgentByToken('the-token')
		expect(result).toBeNull()
	})
})

describe('listAgents', () => {
	test('without envId, returns all rows ordered by created_at DESC', async () => {
		fakePool.query.mockResolvedValueOnce({rows: [baseRow]})

		const results = await listAgents()
		expect(results).toHaveLength(1)
		expect(results[0].id).toBe(AGENT_ID)

		const [sql] = fakePool.query.mock.calls[0]
		expect(sql).toMatch(/SELECT .* FROM docker_agents ORDER BY created_at DESC/)
	})

	test('with envId, filters by env_id', async () => {
		fakePool.query.mockResolvedValueOnce({rows: []})
		await listAgents(ENV_ID)

		const [sql, params] = fakePool.query.mock.calls[0]
		expect(sql).toMatch(/WHERE env_id = \$1/)
		expect(params[0]).toBe(ENV_ID)
	})
})

describe('touchLastSeen', () => {
	test('issues UPDATE … SET last_seen = NOW()', async () => {
		fakePool.query.mockResolvedValueOnce({rowCount: 1})
		await touchLastSeen(AGENT_ID)

		const [sql, params] = fakePool.query.mock.calls[0]
		expect(sql).toMatch(/UPDATE docker_agents SET last_seen = NOW\(\) WHERE id = \$1/)
		expect(params[0]).toBe(AGENT_ID)
	})
})
