/**
 * PinnedMessagesRepository — pure DAO over the pinned_messages table. Phase 75-03.
 *
 * Persistence layer for MEM-07: user-pinned messages auto-injected into the
 * agent system prompt at run time. Pure data-access — no logger, no env reads,
 * no business logic. The system-prompt wiring lives in plan 75-07; this repo
 * just exposes `getContextString()` which formats pins per CONTEXT D-19.
 *
 * Security boundaries:
 *  - T-75-03-01 (SQLi): every value goes through parameterized `$1, $2, ...`
 *    placeholders. Zero string concatenation of user input.
 *  - T-75-03-02 (cross-user pin access): every read/update/delete is scoped
 *    by `WHERE user_id = $userId`. Tests assert this substring at the SQL level.
 *  - T-75-03-04 (DoS pin-spam): listForUser caps at `limit` (default 50);
 *    getContextString hard-caps the fetch at 100 pins regardless of caller.
 */
import pg from 'pg'

// ── Types ────────────────────────────────────────────────────────────────────

export type PinnedMessageRow = {
	id: string
	userId: string
	conversationId: string | null
	messageId: string | null
	content: string
	label: string | null
	pinnedAt: Date
}

export type PinInput = {
	userId: string
	messageId?: string // omitted = free-form pin (no FK to messages.id)
	conversationId?: string
	content: string
	label?: string // optional; getContextString falls back to first 60 chars of content
}

// ── Constants (CONTEXT D-19 prompt-section format) ───────────────────────────

const PINNED_HEADER =
	'## Pinned Memory\n' +
	'The user has pinned the following items as always-relevant context:\n'

const HARD_PIN_CAP = 100 // upper bound for getContextString fetches (T-75-03-04)

// ── Repository ───────────────────────────────────────────────────────────────

export class PinnedMessagesRepository {
	constructor(private readonly pool: pg.Pool) {}

	/**
	 * Pin a message (or a free-form note when messageId is omitted).
	 *
	 * The unique constraint `UNIQUE(user_id, message_id)` makes re-pinning the
	 * same message idempotent: ON CONFLICT DO NOTHING; the existing pin's id is
	 * fetched and returned. Returns '' only if both the INSERT and the fallback
	 * SELECT come back empty (defensive — should not happen in practice).
	 */
	async pin(input: PinInput): Promise<string> {
		const insertSql = `
			INSERT INTO pinned_messages (user_id, conversation_id, message_id, content, label)
			VALUES ($1, $2, $3, $4, $5)
			ON CONFLICT (user_id, message_id) DO NOTHING
			RETURNING id
		`
		const inserted = await this.pool.query(insertSql, [
			input.userId,
			input.conversationId ?? null,
			input.messageId ?? null,
			input.content,
			input.label ?? null,
		])
		if (inserted.rows.length > 0) {
			return inserted.rows[0].id as string
		}
		// ON CONFLICT DO NOTHING ⇒ existing pin; fetch its id by the unique key.
		const existing = await this.pool.query(
			`SELECT id FROM pinned_messages WHERE user_id = $1 AND message_id = $2`,
			[input.userId, input.messageId ?? null],
		)
		return (existing.rows[0]?.id as string | undefined) ?? ''
	}

	/**
	 * Unpin by (userId, messageId) — the natural user-facing path
	 * ("unpin THIS message"). Idempotent — DELETE on a non-existent row is a no-op.
	 */
	async unpin(userId: string, messageId: string): Promise<void> {
		await this.pool.query(
			`DELETE FROM pinned_messages WHERE user_id = $1 AND message_id = $2`,
			[userId, messageId],
		)
	}

	/**
	 * Unpin by pin id — used for free-form pins that have no messageId, and as
	 * an explicit "delete this pin entry" path from the pins-list UI.
	 */
	async unpinById(userId: string, pinId: string): Promise<void> {
		await this.pool.query(
			`DELETE FROM pinned_messages WHERE user_id = $1 AND id = $2`,
			[userId, pinId],
		)
	}

	/**
	 * List the user's pins, newest first. Default cap 50 — UI page size.
	 * Scoped by user_id (T-75-03-02 multi-user privacy boundary).
	 */
	async listForUser(userId: string, limit: number = 50): Promise<PinnedMessageRow[]> {
		const {rows} = await this.pool.query(
			`SELECT id, user_id, conversation_id, message_id, content, label, pinned_at
			 FROM pinned_messages
			 WHERE user_id = $1
			 ORDER BY pinned_at DESC
			 LIMIT $2`,
			[userId, limit],
		)
		return rows.map(mapPinnedRow)
	}

	/**
	 * Format the user's pins as a system-prompt section per CONTEXT D-19.
	 *
	 * Format:
	 *   ## Pinned Memory
	 *   The user has pinned the following items as always-relevant context:
	 *   - <label>: <content>
	 *   - <label>: <content>
	 *
	 * - Newest pins first (sort `pinned_at DESC`); over-budget oldest pins are
	 *   truncated by walking the list and stopping when the next line would
	 *   burst `maxChars`.
	 * - When `label` is null, falls back to the first 60 chars of `content`
	 *   (trimmed). This keeps the line scannable.
	 * - Returns '' when zero pins. Returns '' when only the header would fit
	 *   (caller skips the section entirely).
	 *
	 * Plan 75-07 will call this and concatenate the result onto the agent
	 * system prompt. This repo intentionally returns a string (not a structured
	 * value) so the integration site is a one-liner.
	 */
	async getContextString(userId: string, maxChars: number = 4096): Promise<string> {
		const pins = await this.listForUser(userId, HARD_PIN_CAP)
		if (pins.length === 0) return ''

		let out = PINNED_HEADER
		for (const p of pins) {
			const label =
				p.label !== null && p.label !== undefined && p.label.length > 0
					? p.label
					: p.content.slice(0, 60).trim()
			const line = `- ${label}: ${p.content}\n`
			if (out.length + line.length > maxChars) break
			out += line
		}

		// If only the header fit (no lines added), suppress the section entirely.
		if (out === PINNED_HEADER) return ''
		return out
	}
}

// ── Row mapper (snake_case → camelCase) ──────────────────────────────────────

function mapPinnedRow(r: any): PinnedMessageRow {
	return {
		id: r.id,
		userId: r.user_id,
		conversationId: r.conversation_id ?? null,
		messageId: r.message_id ?? null,
		content: r.content,
		label: r.label ?? null,
		pinnedAt: r.pinned_at,
	}
}
