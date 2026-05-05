/**
 * MessagesRepository unit tests (Phase 75-01).
 *
 * Mocks pg.Pool — no real Postgres. Covers insertOne / upsertMany /
 * listByConversation / search behavior:
 *  - insertOne returns id (passed-through or generated)
 *  - upsertMany([]) short-circuits (no DB hit)
 *  - upsertMany batches into ONE multi-row INSERT
 *  - search('') / search('a') / search('  ') short-circuits (no DB hit) — D-30
 *  - search(>200 chars) throws 'query too long' — T-75-01-03 DoS mitigation
 *  - search SQL contains exact CONTEXT D-08 fragments (ts_headline, ts_rank,
 *    plainto_tsquery, content_tsv @@, LIMIT $3, parameterized values)
 *  - search rows mapped to camelCase SearchResult shape
 *
 * @vitest-environment node
 */
import {describe, it, expect, beforeEach} from 'vitest'
import pg from 'pg'

import {
	MessagesRepository,
	type MessageInput,
	type MessageRow,
	type SearchResult,
} from './messages-repository.js'

type RecordedQuery = {text: string; values: unknown[]}

function createMockPool() {
	const queries: RecordedQuery[] = []
	let nextResult: {rows: unknown[]; rowCount?: number} = {rows: [], rowCount: 0}
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

describe('MessagesRepository', () => {
	let mock: ReturnType<typeof createMockPool>
	let repo: MessagesRepository

	beforeEach(() => {
		mock = createMockPool()
		repo = new MessagesRepository(mock.pool)
	})

	// ── insertOne ────────────────────────────────────────────────────────
	describe('insertOne', () => {
		it('uses caller-supplied id when present and returns it', async () => {
			const id = await repo.insertOne({
				id: 'msg-fixed-1',
				conversationId: 'c1',
				userId: 'u1',
				role: 'user',
				content: 'hello',
			})
			expect(id).toBe('msg-fixed-1')
			expect(mock.queries).toHaveLength(1)
			expect(mock.queries[0].text).toContain('INSERT INTO messages')
			expect(mock.queries[0].text).toContain('ON CONFLICT (id) DO NOTHING')
			expect(mock.queries[0].values[0]).toBe('msg-fixed-1')
		})

		it('generates a UUID when id is omitted', async () => {
			const id = await repo.insertOne({
				conversationId: 'c1',
				userId: 'u1',
				role: 'assistant',
				content: 'hi',
			})
			expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
			expect(mock.queries[0].values[0]).toBe(id)
		})

		it('passes reasoning + metadata + createdAt through positionally', async () => {
			const created = new Date('2026-01-01T00:00:00Z')
			await repo.insertOne({
				id: 'm1',
				conversationId: 'c1',
				userId: 'u1',
				role: 'assistant',
				content: 'reply',
				reasoning: 'because X',
				metadata: {model: 'kimi-for-coding'},
				createdAt: created,
			})
			const v = mock.queries[0].values
			expect(v[3]).toBe('assistant') // role
			expect(v[4]).toBe('reply') // content
			expect(v[5]).toBe('because X') // reasoning
			expect(v[6]).toEqual({model: 'kimi-for-coding'}) // metadata
			expect(v[7]).toBe(created) // createdAt
		})

		it('defaults reasoning to null and metadata to {} when omitted', async () => {
			await repo.insertOne({
				id: 'm1',
				conversationId: 'c1',
				userId: 'u1',
				role: 'user',
				content: 'x',
			})
			expect(mock.queries[0].values[5]).toBeNull()
			expect(mock.queries[0].values[6]).toEqual({})
			expect(mock.queries[0].values[7]).toBeNull()
		})
	})

	// ── upsertMany ───────────────────────────────────────────────────────
	describe('upsertMany', () => {
		it('returns 0 without invoking pool.query for empty array', async () => {
			const n = await repo.upsertMany([])
			expect(n).toBe(0)
			expect(mock.queries).toHaveLength(0)
		})

		it('builds ONE multi-row INSERT with N*8 placeholders and ON CONFLICT DO NOTHING', async () => {
			mock.setNextResult({rows: [], rowCount: 3})
			const inputs: MessageInput[] = [
				{id: 'm1', conversationId: 'c1', userId: 'u1', role: 'user', content: 'a'},
				{id: 'm2', conversationId: 'c1', userId: 'u1', role: 'assistant', content: 'b'},
				{id: 'm3', conversationId: 'c1', userId: 'u1', role: 'user', content: 'c'},
			]
			const inserted = await repo.upsertMany(inputs)

			expect(mock.queries).toHaveLength(1)
			const q = mock.queries[0]
			expect(q.text).toContain('INSERT INTO messages')
			expect(q.text).toContain('ON CONFLICT (id) DO NOTHING')

			// Three placeholder groups: ($1..$8), ($9..$16), ($17..$24)
			expect(q.text).toContain('$1')
			expect(q.text).toContain('$8')
			expect(q.text).toContain('$9')
			expect(q.text).toContain('$16')
			expect(q.text).toContain('$17')
			expect(q.text).toContain('$24')

			// 3 rows × 8 cols = 24 values
			expect(q.values).toHaveLength(24)
			// First row id
			expect(q.values[0]).toBe('m1')
			// Second row id (offset 8)
			expect(q.values[8]).toBe('m2')
			// Third row id (offset 16)
			expect(q.values[16]).toBe('m3')

			expect(inserted).toBe(3)
		})

		it('returns 0 when pool reports rowCount null', async () => {
			mock.setNextResult({rows: []}) // rowCount undefined
			const inserted = await repo.upsertMany([
				{id: 'm1', conversationId: 'c1', userId: 'u1', role: 'user', content: 'a'},
			])
			expect(inserted).toBe(0)
		})
	})

	// ── listByConversation ───────────────────────────────────────────────
	describe('listByConversation', () => {
		it('uses WHERE conversation_id = $1 AND user_id = $2 ORDER BY created_at ASC LIMIT $3', async () => {
			mock.setNextResult({rows: []})
			await repo.listByConversation('c1', 'u1')
			expect(mock.queries).toHaveLength(1)
			const q = mock.queries[0]
			expect(q.text).toContain('FROM messages')
			expect(q.text).toContain('WHERE conversation_id = $1 AND user_id = $2')
			expect(q.text).toContain('ORDER BY created_at ASC')
			expect(q.text).toContain('LIMIT $3')
			expect(q.values).toEqual(['c1', 'u1', 200]) // default 200
		})

		it('honors explicit limit', async () => {
			mock.setNextResult({rows: []})
			await repo.listByConversation('c1', 'u1', 25)
			expect(mock.queries[0].values).toEqual(['c1', 'u1', 25])
		})

		it('maps rows to camelCase MessageRow', async () => {
			const t = new Date('2026-01-01T00:00:00Z')
			mock.setNextResult({
				rows: [
					{
						id: 'm1',
						conversation_id: 'c1',
						user_id: 'u1',
						role: 'user',
						content: 'hi',
						reasoning: null,
						metadata: {},
						created_at: t,
					},
				],
			})
			const rows = await repo.listByConversation('c1', 'u1')
			expect(rows).toHaveLength(1)
			const row = rows[0] as MessageRow
			expect(row.id).toBe('m1')
			expect(row.conversationId).toBe('c1')
			expect(row.userId).toBe('u1')
			expect(row.role).toBe('user')
			expect(row.content).toBe('hi')
			expect(row.reasoning).toBeNull()
			expect(row.metadata).toEqual({})
			expect(row.createdAt).toBe(t)
		})
	})

	// ── search (FTS) ─────────────────────────────────────────────────────
	describe('search (FTS)', () => {
		it('returns [] without DB hit for empty query', async () => {
			const r = await repo.search('u1', '')
			expect(r).toEqual([])
			expect(mock.queries).toHaveLength(0)
		})

		it('returns [] without DB hit for whitespace-only query', async () => {
			const r = await repo.search('u1', '    ')
			expect(r).toEqual([])
			expect(mock.queries).toHaveLength(0)
		})

		it('returns [] without DB hit for 1-char query (after trim)', async () => {
			const r = await repo.search('u1', ' a ')
			expect(r).toEqual([])
			expect(mock.queries).toHaveLength(0)
		})

		it('throws "query too long" for queries > 200 chars (T-75-01-03 DoS)', async () => {
			const huge = 'x'.repeat(201)
			await expect(repo.search('u1', huge)).rejects.toThrow('query too long')
			expect(mock.queries).toHaveLength(0)
		})

		it('valid query produces SQL with exact D-08 fragments and parameterized values', async () => {
			mock.setNextResult({rows: []})
			await repo.search('u1', 'foo bar')
			expect(mock.queries).toHaveLength(1)
			const q = mock.queries[0]
			expect(q.text).toContain("plainto_tsquery('english'")
			expect(q.text).toContain('ts_headline')
			expect(q.text).toContain('ts_rank')
			expect(q.text).toContain('content_tsv @@')
			expect(q.text).toContain('StartSel=<mark>')
			expect(q.text).toContain('StopSel=</mark>')
			expect(q.text).toContain('MaxWords=18')
			expect(q.text).toContain('MinWords=8')
			expect(q.text).toContain('MaxFragments=2')
			expect(q.text).toContain('LIMIT $3')
			expect(q.text).toContain('LEFT JOIN conversations')
			expect(q.text).toMatch(/m\.user_id\s*=\s*\$2/)
			// Parameter order: $1 = query (trimmed), $2 = userId, $3 = limit
			expect(q.values).toEqual(['foo bar', 'u1', 25]) // default limit 25
		})

		it('honors explicit limit', async () => {
			mock.setNextResult({rows: []})
			await repo.search('u1', 'foo', 5)
			expect(mock.queries[0].values[2]).toBe(5)
		})

		it('passes the trimmed query (not the original) as $1', async () => {
			mock.setNextResult({rows: []})
			await repo.search('u1', '   needle   ')
			expect(mock.queries[0].values[0]).toBe('needle')
		})

		it('maps rows to SearchResult camelCase shape', async () => {
			const t = new Date('2026-01-01T00:00:00Z')
			mock.setNextResult({
				rows: [
					{
						message_id: 'm1',
						conversation_id: 'c1',
						conversation_title: 'My Convo',
						role: 'user',
						created_at: t,
						snippet: '<mark>foo</mark> bar',
						rank: 0.42,
					},
					{
						message_id: 'm2',
						conversation_id: 'c2',
						conversation_title: null, // orphan / LEFT JOIN miss
						role: 'assistant',
						created_at: t,
						snippet: 'something <mark>foo</mark>',
						rank: 0.21,
					},
				],
			})
			const results = await repo.search('u1', 'foo')
			expect(results).toHaveLength(2)
			const r0 = results[0] as SearchResult
			expect(r0.messageId).toBe('m1')
			expect(r0.conversationId).toBe('c1')
			expect(r0.conversationTitle).toBe('My Convo')
			expect(r0.role).toBe('user')
			expect(r0.createdAt).toBe(t)
			expect(r0.snippet).toContain('<mark>foo</mark>')
			expect(r0.rank).toBe(0.42)
			expect(results[1].conversationTitle).toBeNull()
		})

		it('SQL has WHERE m.user_id = $userId — multi-user privacy boundary (T-75-01-02)', async () => {
			mock.setNextResult({rows: []})
			await repo.search('u1', 'foo')
			expect(mock.queries[0].text).toMatch(/WHERE\s+m\.user_id\s*=\s*\$2/)
		})
	})

	// ── SQL injection mitigation (T-75-01-01) ─────────────────────────────
	describe('SQL injection mitigation', () => {
		it('search query string with metacharacters is parameterized, never spliced', async () => {
			mock.setNextResult({rows: []})
			const malicious = `'; DROP TABLE messages; --`
			await repo.search('u1', malicious)
			expect(mock.queries[0].values[0]).toBe(malicious)
			expect(mock.queries[0].text).not.toContain('DROP TABLE')
		})

		it('insertOne content with metacharacters stays in values array', async () => {
			const malicious = `evil'; DELETE FROM users; --`
			await repo.insertOne({
				id: 'm1',
				conversationId: 'c1',
				userId: 'u1',
				role: 'user',
				content: malicious,
			})
			expect(mock.queries[0].values[4]).toBe(malicious)
			expect(mock.queries[0].text).not.toContain('DELETE FROM users')
		})
	})
})
