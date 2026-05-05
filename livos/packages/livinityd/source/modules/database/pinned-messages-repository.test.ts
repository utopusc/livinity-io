/**
 * PinnedMessagesRepository unit tests (Phase 75-03).
 *
 * Mocks pg.Pool — no real Postgres. Covers pin / unpin / unpinById /
 * listForUser / getContextString behavior:
 *  - pin returns id from first INSERT result
 *  - pin returns id from fallback SELECT when ON CONFLICT DO NOTHING triggered
 *  - pin SQL contains `ON CONFLICT (user_id, message_id) DO NOTHING`
 *  - pin allows missing messageId (free-form pin)
 *  - unpin uses parameterized userId+messageId (T-75-03-01 SQLi mitigation)
 *  - unpinById uses parameterized userId+pinId
 *  - listForUser uses ORDER BY pinned_at DESC LIMIT $2 (default 50)
 *  - listForUser maps rows to camelCase PinnedMessageRow
 *  - getContextString returns '' for zero pins
 *  - getContextString builds formatted block with header + items
 *  - getContextString uses first 60 chars of content as label fallback when null
 *  - getContextString truncates when adding a line exceeds maxChars budget
 *  - All queries scoped by user_id (T-75-03-02 privacy boundary)
 *  - SQL injection mitigation (T-75-03-01) — content with metacharacters parameterized
 *
 * @vitest-environment node
 */
import {describe, it, expect, beforeEach} from 'vitest'
import pg from 'pg'

import {
	PinnedMessagesRepository,
	type PinnedMessageRow,
} from './pinned-messages-repository.js'

type RecordedQuery = {text: string; values: unknown[]}

function createMockPool() {
	const queries: RecordedQuery[] = []
	const queue: Array<{rows: unknown[]; rowCount?: number}> = []
	let defaultResult: {rows: unknown[]; rowCount?: number} = {rows: [], rowCount: 0}
	const pool = {
		query: async (text: string, values: unknown[] = []) => {
			queries.push({text, values})
			return queue.length > 0 ? queue.shift()! : defaultResult
		},
	} as unknown as pg.Pool
	return {
		pool,
		queries,
		setNextResult: (r: {rows: unknown[]; rowCount?: number}) => {
			defaultResult = r
		},
		enqueueResult: (r: {rows: unknown[]; rowCount?: number}) => {
			queue.push(r)
		},
	}
}

describe('PinnedMessagesRepository', () => {
	let mock: ReturnType<typeof createMockPool>
	let repo: PinnedMessagesRepository

	beforeEach(() => {
		mock = createMockPool()
		repo = new PinnedMessagesRepository(mock.pool)
	})

	// ── pin ──────────────────────────────────────────────────────────────────
	describe('pin', () => {
		it('returns id from the first INSERT RETURNING when no conflict', async () => {
			mock.enqueueResult({rows: [{id: 'p1'}], rowCount: 1})
			const id = await repo.pin({
				userId: 'u1',
				messageId: 'm1',
				conversationId: 'c1',
				content: 'finish docs',
				label: 'todo',
			})
			expect(id).toBe('p1')
			expect(mock.queries).toHaveLength(1)
			expect(mock.queries[0].text).toContain('INSERT INTO pinned_messages')
			expect(mock.queries[0].text).toContain(
				'ON CONFLICT (user_id, message_id) DO NOTHING',
			)
		})

		it('returns id from fallback SELECT when ON CONFLICT DO NOTHING triggered', async () => {
			// First call returns no rows (conflict path). Second call returns existing id.
			mock.enqueueResult({rows: [], rowCount: 0})
			mock.enqueueResult({rows: [{id: 'p-existing'}], rowCount: 1})
			const id = await repo.pin({
				userId: 'u1',
				messageId: 'm1',
				content: 'already-pinned content',
			})
			expect(id).toBe('p-existing')
			expect(mock.queries).toHaveLength(2)
			expect(mock.queries[1].text).toContain('SELECT id FROM pinned_messages')
			expect(mock.queries[1].text).toContain('WHERE user_id = $1 AND message_id = $2')
			expect(mock.queries[1].values).toEqual(['u1', 'm1'])
		})

		it('allows missing messageId (free-form pin) — both message_id + conversation_id default to null', async () => {
			mock.enqueueResult({rows: [{id: 'p2'}], rowCount: 1})
			const id = await repo.pin({
				userId: 'u1',
				content: 'free-form note',
			})
			expect(id).toBe('p2')
			const v = mock.queries[0].values
			expect(v[0]).toBe('u1') // user_id
			expect(v[1]).toBeNull() // conversation_id
			expect(v[2]).toBeNull() // message_id
			expect(v[3]).toBe('free-form note') // content
			expect(v[4]).toBeNull() // label
		})

		it('returns empty string when fallback SELECT also has no rows (defensive)', async () => {
			mock.enqueueResult({rows: [], rowCount: 0})
			mock.enqueueResult({rows: [], rowCount: 0})
			const id = await repo.pin({
				userId: 'u1',
				messageId: 'm1',
				content: 'x',
			})
			expect(id).toBe('')
		})
	})

	// ── unpin ────────────────────────────────────────────────────────────────
	describe('unpin', () => {
		it('issues DELETE WHERE user_id = $1 AND message_id = $2 with parameterized values', async () => {
			await repo.unpin('u1', 'm1')
			expect(mock.queries).toHaveLength(1)
			const q = mock.queries[0]
			expect(q.text).toContain('DELETE FROM pinned_messages')
			expect(q.text).toContain('WHERE user_id = $1 AND message_id = $2')
			expect(q.values).toEqual(['u1', 'm1'])
		})
	})

	// ── unpinById ────────────────────────────────────────────────────────────
	describe('unpinById', () => {
		it('issues DELETE WHERE user_id = $1 AND id = $2 with parameterized values', async () => {
			await repo.unpinById('u1', 'p1')
			expect(mock.queries).toHaveLength(1)
			const q = mock.queries[0]
			expect(q.text).toContain('DELETE FROM pinned_messages')
			expect(q.text).toContain('WHERE user_id = $1 AND id = $2')
			expect(q.values).toEqual(['u1', 'p1'])
		})
	})

	// ── listForUser ──────────────────────────────────────────────────────────
	describe('listForUser', () => {
		it('uses WHERE user_id = $1 ORDER BY pinned_at DESC LIMIT $2 with default 50', async () => {
			mock.setNextResult({rows: []})
			await repo.listForUser('u1')
			expect(mock.queries).toHaveLength(1)
			const q = mock.queries[0]
			expect(q.text).toContain('FROM pinned_messages')
			expect(q.text).toContain('WHERE user_id = $1')
			expect(q.text).toContain('ORDER BY pinned_at DESC')
			expect(q.text).toContain('LIMIT $2')
			expect(q.values).toEqual(['u1', 50])
		})

		it('honors explicit limit', async () => {
			mock.setNextResult({rows: []})
			await repo.listForUser('u1', 10)
			expect(mock.queries[0].values).toEqual(['u1', 10])
		})

		it('maps rows to camelCase PinnedMessageRow', async () => {
			const t = new Date('2026-05-04T00:00:00Z')
			mock.setNextResult({
				rows: [
					{
						id: 'p1',
						user_id: 'u1',
						conversation_id: 'c1',
						message_id: 'm1',
						content: 'pinned content',
						label: 'todo',
						pinned_at: t,
					},
					{
						id: 'p2',
						user_id: 'u1',
						conversation_id: null,
						message_id: null,
						content: 'free-form',
						label: null,
						pinned_at: t,
					},
				],
			})
			const rows = await repo.listForUser('u1')
			expect(rows).toHaveLength(2)
			const r0 = rows[0] as PinnedMessageRow
			expect(r0.id).toBe('p1')
			expect(r0.userId).toBe('u1')
			expect(r0.conversationId).toBe('c1')
			expect(r0.messageId).toBe('m1')
			expect(r0.content).toBe('pinned content')
			expect(r0.label).toBe('todo')
			expect(r0.pinnedAt).toBe(t)
			expect(rows[1].label).toBeNull()
			expect(rows[1].messageId).toBeNull()
		})
	})

	// ── getContextString ─────────────────────────────────────────────────────
	describe('getContextString', () => {
		it("returns '' for zero pins (no header alone)", async () => {
			mock.setNextResult({rows: []})
			const out = await repo.getContextString('u1')
			expect(out).toBe('')
		})

		it('builds formatted block with header + items', async () => {
			const t = new Date('2026-05-04T00:00:00Z')
			mock.setNextResult({
				rows: [
					{
						id: 'p1',
						user_id: 'u1',
						conversation_id: 'c1',
						message_id: 'm1',
						content: 'finish docs',
						label: 'todo',
						pinned_at: t,
					},
				],
			})
			const out = await repo.getContextString('u1')
			expect(out).toContain('## Pinned Memory\n')
			expect(out).toContain(
				'The user has pinned the following items as always-relevant context:\n',
			)
			expect(out).toContain('- todo: finish docs\n')
		})

		it('uses first 60 chars of content as label fallback when label is null', async () => {
			const t = new Date('2026-05-04T00:00:00Z')
			const longContent = 'a'.repeat(80)
			mock.setNextResult({
				rows: [
					{
						id: 'p1',
						user_id: 'u1',
						conversation_id: null,
						message_id: null,
						content: longContent,
						label: null,
						pinned_at: t,
					},
				],
			})
			const out = await repo.getContextString('u1')
			// label fallback = first 60 chars
			const fallback = 'a'.repeat(60)
			expect(out).toContain(`- ${fallback}: ${longContent}\n`)
		})

		it("truncates when even one line would exceed maxChars (returns '')", async () => {
			const t = new Date('2026-05-04T00:00:00Z')
			const giant = 'x'.repeat(200)
			mock.setNextResult({
				rows: [
					{
						id: 'p1',
						user_id: 'u1',
						conversation_id: null,
						message_id: null,
						content: giant,
						label: null,
						pinned_at: t,
					},
				],
			})
			// maxChars=80: header is < 80 alone, but adding any line bursts the budget.
			// Per CONTEXT D-19: "If only the header would fit, return ''"
			const out = await repo.getContextString('u1', 80)
			expect(out).toBe('')
		})

		it('stops adding lines once budget exhausted but returns header + lines that fit', async () => {
			const t = new Date('2026-05-04T00:00:00Z')
			mock.setNextResult({
				rows: [
					{
						id: 'p1',
						user_id: 'u1',
						conversation_id: null,
						message_id: null,
						content: 'short',
						label: 'a',
						pinned_at: t,
					},
					{
						id: 'p2',
						user_id: 'u1',
						conversation_id: null,
						message_id: null,
						content: 'x'.repeat(500),
						label: 'big',
						pinned_at: t,
					},
				],
			})
			const out = await repo.getContextString('u1', 200)
			// First line fits, second is over budget => stops at first.
			expect(out).toContain('- a: short\n')
			expect(out).not.toContain('big')
		})
	})

	// ── SQL injection mitigation (T-75-03-01) ────────────────────────────────
	describe('SQL injection mitigation', () => {
		it('pin content with metacharacters stays in values array, never in SQL text', async () => {
			mock.enqueueResult({rows: [{id: 'p1'}], rowCount: 1})
			const malicious = `evil'; DROP TABLE pinned_messages; --`
			await repo.pin({
				userId: 'u1',
				messageId: 'm1',
				content: malicious,
				label: malicious,
			})
			expect(mock.queries[0].values[3]).toBe(malicious) // content
			expect(mock.queries[0].values[4]).toBe(malicious) // label
			expect(mock.queries[0].text).not.toContain('DROP TABLE')
		})

		it('unpin messageId with metacharacters is parameterized, never spliced', async () => {
			const malicious = `'; DELETE FROM users; --`
			await repo.unpin('u1', malicious)
			expect(mock.queries[0].values).toEqual(['u1', malicious])
			expect(mock.queries[0].text).not.toContain('DELETE FROM users')
		})
	})

	// ── multi-user privacy boundary (T-75-03-02) ─────────────────────────────
	describe('multi-user privacy boundary', () => {
		it('every read/delete query scopes by user_id', async () => {
			mock.enqueueResult({rows: [{id: 'p1'}], rowCount: 1}) // pin INSERT
			mock.setNextResult({rows: []}) // subsequent default
			await repo.pin({userId: 'u1', messageId: 'm1', content: 'x'})
			await repo.unpin('u1', 'm1')
			await repo.unpinById('u1', 'p1')
			await repo.listForUser('u1')
			// Skip the INSERT (user_id positional), check WHERE-bound queries
			for (let i = 1; i < mock.queries.length; i++) {
				expect(mock.queries[i].text).toMatch(/WHERE\s+user_id\s*=\s*\$1/)
			}
		})
	})
})
