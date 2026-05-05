/**
 * ConversationsRepository unit tests (Phase 75-01).
 *
 * Mocks pg.Pool with a minimal recorder — NO real Postgres. Verifies SQL shape
 * (parameterized $-placeholders, ON CONFLICT semantics, user_id scoping) and
 * row-mapping (snake_case columns -> camelCase fields).
 *
 * @vitest-environment node
 */
import {describe, it, expect, beforeEach} from 'vitest'
import pg from 'pg'

import {ConversationsRepository, type ConversationRow} from './conversations-repository.js'

// ── Mock pool ───────────────────────────────────────────────────────────
type RecordedQuery = {text: string; values: unknown[]}

function createMockPool() {
	const queries: RecordedQuery[] = []
	let nextResult: {rows: unknown[]; rowCount?: number} = {rows: []}
	const pool = {
		query: async (text: string, values: unknown[] = []) => {
			queries.push({text, values})
			return nextResult
		},
	} as unknown as pg.Pool
	return {
		pool,
		queries,
		setNextResult: (r: {rows: unknown[]; rowCount?: number}) => {
			nextResult = r
		},
	}
}

describe('ConversationsRepository', () => {
	let mock: ReturnType<typeof createMockPool>
	let repo: ConversationsRepository

	beforeEach(() => {
		mock = createMockPool()
		repo = new ConversationsRepository(mock.pool)
	})

	describe('upsert', () => {
		it('issues INSERT INTO conversations ... ON CONFLICT (id) DO UPDATE with 5 parameterized values', async () => {
			const createdAt = new Date('2026-01-01T00:00:00Z')
			const updatedAt = new Date('2026-01-02T00:00:00Z')
			await repo.upsert({id: 'c1', userId: 'u1', title: 'My Convo', createdAt, updatedAt})

			expect(mock.queries).toHaveLength(1)
			const q = mock.queries[0]
			expect(q.text).toContain('INSERT INTO conversations')
			expect(q.text).toContain('ON CONFLICT (id) DO UPDATE')
			expect(q.text).toContain('title = EXCLUDED.title')
			expect(q.text).toContain('updated_at = EXCLUDED.updated_at')
			expect(q.values).toHaveLength(5)
			expect(q.values[0]).toBe('c1')
			expect(q.values[1]).toBe('u1')
			expect(q.values[2]).toBe('My Convo')
			expect(q.values[3]).toBe(createdAt)
			expect(q.values[4]).toBe(updatedAt)
		})

		it('passes null for createdAt/updatedAt when omitted (COALESCE($N, NOW()) takes over server-side)', async () => {
			await repo.upsert({id: 'c1', userId: 'u1', title: 'T'})
			expect(mock.queries).toHaveLength(1)
			expect(mock.queries[0].values[3]).toBeNull()
			expect(mock.queries[0].values[4]).toBeNull()
		})
	})

	describe('getById', () => {
		it('returns mapped ConversationRow when row present (camelCase mapping)', async () => {
			const now = new Date('2026-01-01T12:34:56Z')
			mock.setNextResult({
				rows: [{id: 'c1', user_id: 'u1', title: 'Title', created_at: now, updated_at: now}],
			})

			const result = await repo.getById('c1', 'u1')

			expect(mock.queries).toHaveLength(1)
			expect(mock.queries[0].text).toContain('SELECT')
			expect(mock.queries[0].text).toContain('FROM conversations')
			expect(mock.queries[0].text).toContain('WHERE id = $1 AND user_id = $2')
			expect(mock.queries[0].values).toEqual(['c1', 'u1'])

			expect(result).not.toBeNull()
			const row = result as ConversationRow
			expect(row.id).toBe('c1')
			expect(row.userId).toBe('u1') // camelCase from user_id
			expect(row.title).toBe('Title')
			expect(row.createdAt).toBe(now)
			expect(row.updatedAt).toBe(now)
		})

		it('returns null when no rows', async () => {
			mock.setNextResult({rows: []})
			const result = await repo.getById('missing', 'u1')
			expect(result).toBeNull()
			expect(mock.queries).toHaveLength(1)
		})
	})

	describe('listForUser', () => {
		it('issues query with WHERE user_id = $1 ORDER BY updated_at DESC LIMIT $2 (default 50)', async () => {
			mock.setNextResult({rows: []})
			await repo.listForUser('u1')

			expect(mock.queries).toHaveLength(1)
			const q = mock.queries[0]
			expect(q.text).toContain('FROM conversations')
			expect(q.text).toContain('WHERE user_id = $1')
			expect(q.text).toContain('ORDER BY updated_at DESC')
			expect(q.text).toContain('LIMIT $2')
			expect(q.values).toEqual(['u1', 50])
		})

		it('honors explicit limit', async () => {
			mock.setNextResult({rows: []})
			await repo.listForUser('u1', 10)
			expect(mock.queries[0].values).toEqual(['u1', 10])
		})

		it('maps rows to camelCase ConversationRow[]', async () => {
			const t1 = new Date('2026-01-01T00:00:00Z')
			const t2 = new Date('2026-01-02T00:00:00Z')
			mock.setNextResult({
				rows: [
					{id: 'c1', user_id: 'u1', title: 'A', created_at: t1, updated_at: t1},
					{id: 'c2', user_id: 'u1', title: 'B', created_at: t2, updated_at: t2},
				],
			})

			const rows = await repo.listForUser('u1', 50)
			expect(rows).toHaveLength(2)
			expect(rows[0]).toEqual({id: 'c1', userId: 'u1', title: 'A', createdAt: t1, updatedAt: t1})
			expect(rows[1].id).toBe('c2')
		})
	})

	describe('deleteById', () => {
		it('issues DELETE FROM conversations parameterized by id and userId', async () => {
			await repo.deleteById('c1', 'u1')
			expect(mock.queries).toHaveLength(1)
			const q = mock.queries[0]
			expect(q.text).toContain('DELETE FROM conversations')
			expect(q.text).toContain('WHERE id = $1 AND user_id = $2')
			expect(q.values).toEqual(['c1', 'u1'])
		})
	})

	describe('SQL injection mitigation (T-75-01-01)', () => {
		it('upsert values flow positionally — id field with semicolons stays in $1, never spliced into SQL', async () => {
			const malicious = `c1'; DROP TABLE conversations; --`
			await repo.upsert({id: malicious, userId: 'u1', title: 'T'})
			// Critical: the malicious string must appear in values[0], NOT in the SQL text.
			expect(mock.queries[0].values[0]).toBe(malicious)
			expect(mock.queries[0].text).not.toContain('DROP TABLE')
		})
	})

	describe('multi-user privacy boundary (T-75-01-02)', () => {
		it('every method scopes by user_id', async () => {
			mock.setNextResult({rows: []})
			await repo.getById('c1', 'u1')
			await repo.listForUser('u1')
			await repo.deleteById('c1', 'u1')
			for (const q of mock.queries) {
				expect(q.text).toMatch(/user_id\s*=/)
			}
		})
	})
})
