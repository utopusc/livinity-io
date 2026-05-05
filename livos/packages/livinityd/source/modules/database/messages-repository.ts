/**
 * MessagesRepository — pure DAO over the messages table. Phase 75-01.
 *
 * Pure data-access: no business logic, no logger, no env reads. Receives a
 * pg.Pool via constructor and runs ONLY parameterized queries (T-75-01-01
 * SQL-injection mitigation). Every read/search enforces a `WHERE user_id =
 * $userId` clause (T-75-01-02 multi-user privacy boundary).
 *
 * search() applies query-length validation per CONTEXT D-30 to mitigate
 * T-75-01-03 (DoS via expensive ts_headline) — empty/short queries
 * short-circuit (return []), oversized queries throw 'query too long'.
 */
import {randomUUID} from 'node:crypto'

import pg from 'pg'

// ── Types ────────────────────────────────────────────────────────────────

export type MessageRow = {
	id: string
	conversationId: string
	userId: string
	role: 'user' | 'assistant' | 'system' | 'tool'
	content: string
	reasoning: string | null
	metadata: Record<string, unknown>
	createdAt: Date
}

export type MessageInput = {
	id?: string // optional; generated if absent
	conversationId: string
	userId: string
	role: 'user' | 'assistant' | 'system' | 'tool'
	content: string
	reasoning?: string | null
	metadata?: Record<string, unknown>
	createdAt?: Date // optional; defaults to NOW() server-side
}

export type SearchResult = {
	messageId: string
	conversationId: string
	conversationTitle: string | null // LEFT JOIN allows orphans
	role: 'user' | 'assistant' | 'system' | 'tool'
	snippet: string // contains <mark>...</mark> tags from ts_headline
	createdAt: Date
	rank: number
}

// ── Repository ───────────────────────────────────────────────────────────

export class MessagesRepository {
	constructor(private readonly pool: pg.Pool) {}

	/**
	 * Insert a single message. Returns the id (caller-supplied or generated).
	 * ON CONFLICT (id) DO NOTHING — idempotent re-inserts are safe.
	 */
	async insertOne(msg: MessageInput): Promise<string> {
		const id = msg.id ?? randomUUID()
		const sql = `
			INSERT INTO messages (id, conversation_id, user_id, role, content, reasoning, metadata, created_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, NOW()))
			ON CONFLICT (id) DO NOTHING
		`
		await this.pool.query(sql, [
			id,
			msg.conversationId,
			msg.userId,
			msg.role,
			msg.content,
			msg.reasoning ?? null,
			msg.metadata ?? {},
			msg.createdAt ?? null,
		])
		return id
	}

	/**
	 * Bulk-insert messages in a single multi-row INSERT.
	 * ON CONFLICT (id) DO NOTHING — safe to replay during backfill.
	 * Returns the rowCount reported by the driver (newly-inserted rows;
	 * conflicting rows are NOT counted).
	 */
	async upsertMany(msgs: MessageInput[]): Promise<number> {
		if (msgs.length === 0) return 0
		const cols = 8
		const placeholders: string[] = []
		const values: unknown[] = []
		for (let i = 0; i < msgs.length; i++) {
			const base = i * cols
			placeholders.push(
				`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, COALESCE($${base + 8}, NOW()))`,
			)
			const m = msgs[i]
			values.push(
				m.id ?? randomUUID(),
				m.conversationId,
				m.userId,
				m.role,
				m.content,
				m.reasoning ?? null,
				m.metadata ?? {},
				m.createdAt ?? null,
			)
		}
		const sql = `
			INSERT INTO messages (id, conversation_id, user_id, role, content, reasoning, metadata, created_at)
			VALUES ${placeholders.join(', ')}
			ON CONFLICT (id) DO NOTHING
		`
		const res = await this.pool.query(sql, values)
		return res.rowCount ?? 0
	}

	/**
	 * List messages in a conversation in chronological order. Default limit 200
	 * (one full conversation page). Scoped by user_id (privacy boundary).
	 */
	async listByConversation(
		conversationId: string,
		userId: string,
		limit: number = 200,
	): Promise<MessageRow[]> {
		const sql = `
			SELECT id, conversation_id, user_id, role, content, reasoning, metadata, created_at
			FROM messages
			WHERE conversation_id = $1 AND user_id = $2
			ORDER BY created_at ASC
			LIMIT $3
		`
		const {rows} = await this.pool.query(sql, [conversationId, userId, limit])
		return rows.map(mapMessageRow)
	}

	/**
	 * Full-text search over a user's messages.
	 *
	 * - Trims input.
	 * - Returns [] (no DB hit) if the trimmed query is < 2 chars (D-30).
	 * - Throws 'query too long' if trimmed query is > 200 chars (T-75-01-03).
	 * - Uses parameterized plainto_tsquery + content_tsv @@ predicate (GIN
	 *   index makes this sub-100ms).
	 * - ts_headline renders a <mark>-tagged snippet around each hit
	 *   (StartSel/StopSel/MaxWords/MinWords/MaxFragments per CONTEXT D-08).
	 * - ORDER BY ts_rank DESC, then created_at DESC for ties.
	 * - LEFT JOIN conversations so orphan messages still surface (rare).
	 */
	async search(userId: string, query: string, limit: number = 25): Promise<SearchResult[]> {
		const trimmed = query.trim()
		if (trimmed.length < 2) return []
		if (trimmed.length > 200) throw new Error('query too long')

		const sql = `
			SELECT m.id          AS message_id,
			       m.conversation_id,
			       c.title       AS conversation_title,
			       m.role,
			       m.created_at,
			       ts_headline('english', m.content,
			         plainto_tsquery('english', $1),
			         'StartSel=<mark>, StopSel=</mark>, MaxWords=18, MinWords=8, MaxFragments=2'
			       ) AS snippet,
			       ts_rank(m.content_tsv, plainto_tsquery('english', $1)) AS rank
			FROM messages m
			LEFT JOIN conversations c ON c.id = m.conversation_id
			WHERE m.user_id = $2
			  AND m.content_tsv @@ plainto_tsquery('english', $1)
			ORDER BY rank DESC, m.created_at DESC
			LIMIT $3
		`
		const {rows} = await this.pool.query(sql, [trimmed, userId, limit])
		return rows.map(mapSearchRow)
	}
}

// ── Row mappers (snake_case -> camelCase) ────────────────────────────────

function mapMessageRow(r: any): MessageRow {
	return {
		id: r.id,
		conversationId: r.conversation_id,
		userId: r.user_id,
		role: r.role,
		content: r.content,
		reasoning: r.reasoning,
		metadata: r.metadata ?? {},
		createdAt: r.created_at,
	}
}

function mapSearchRow(r: any): SearchResult {
	return {
		messageId: r.message_id,
		conversationId: r.conversation_id,
		conversationTitle: r.conversation_title ?? null,
		role: r.role,
		snippet: r.snippet,
		createdAt: r.created_at,
		rank: typeof r.rank === 'number' ? r.rank : Number(r.rank),
	}
}
