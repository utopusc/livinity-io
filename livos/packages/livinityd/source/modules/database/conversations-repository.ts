/**
 * ConversationsRepository — pure DAO over the conversations table. Phase 75-01.
 *
 * Pure data-access: no business logic, no logger, no env reads. Receives a
 * pg.Pool via constructor and runs ONLY parameterized queries (T-75-01-01
 * SQL-injection mitigation). Every read/write/delete enforces a
 * `WHERE user_id = $userId` clause (T-75-01-02 multi-user privacy boundary).
 *
 * Errors bubble up to callers — repositories do not catch / log / wrap.
 */
import pg from 'pg'

export type ConversationRow = {
	id: string
	userId: string
	title: string
	createdAt: Date
	updatedAt: Date
}

export class ConversationsRepository {
	constructor(private readonly pool: pg.Pool) {}

	/**
	 * Upsert a conversation. On conflict (id), updates title + updated_at only.
	 * createdAt/updatedAt may be omitted — server-side `COALESCE($N, NOW())`
	 * defaults them to the current timestamp.
	 */
	async upsert(conv: {
		id: string
		userId: string
		title: string
		createdAt?: Date
		updatedAt?: Date
	}): Promise<void> {
		const sql = `
			INSERT INTO conversations (id, user_id, title, created_at, updated_at)
			VALUES ($1, $2, $3, COALESCE($4, NOW()), COALESCE($5, NOW()))
			ON CONFLICT (id) DO UPDATE SET
				title = EXCLUDED.title,
				updated_at = EXCLUDED.updated_at
		`
		await this.pool.query(sql, [
			conv.id,
			conv.userId,
			conv.title,
			conv.createdAt ?? null,
			conv.updatedAt ?? null,
		])
	}

	/**
	 * Get a conversation by id, scoped to the owning user. Returns null if not
	 * found OR if the conversation belongs to a different user (privacy).
	 */
	async getById(id: string, userId: string): Promise<ConversationRow | null> {
		const sql = `SELECT id, user_id, title, created_at, updated_at FROM conversations WHERE id = $1 AND user_id = $2`
		const {rows} = await this.pool.query(sql, [id, userId])
		if (rows.length === 0) return null
		return mapConversationRow(rows[0])
	}

	/**
	 * List a user's conversations, most-recently-updated first. Default limit 50.
	 */
	async listForUser(userId: string, limit: number = 50): Promise<ConversationRow[]> {
		const sql = `SELECT id, user_id, title, created_at, updated_at FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT $2`
		const {rows} = await this.pool.query(sql, [userId, limit])
		return rows.map(mapConversationRow)
	}

	/**
	 * Hard-delete a conversation (CASCADE wipes child messages). Scoped by user.
	 */
	async deleteById(id: string, userId: string): Promise<void> {
		await this.pool.query(`DELETE FROM conversations WHERE id = $1 AND user_id = $2`, [id, userId])
	}
}

function mapConversationRow(r: any): ConversationRow {
	return {
		id: r.id,
		userId: r.user_id,
		title: r.title,
		createdAt: r.created_at,
		updatedAt: r.updated_at,
	}
}
