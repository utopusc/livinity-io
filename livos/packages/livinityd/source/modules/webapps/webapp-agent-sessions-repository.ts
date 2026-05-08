// Phase 95-05 — webapp_agent_sessions repository.
//
// Two operations:
//   - findByWebapp(userId, webappId) → row | null
//   - upsert({userId, webappId, runId?, lastSeenIdx?}) → row
//
// upsert relies on the unique index on (user_id, webapp_id). On conflict it
// patches run_id (when supplied), last_seen_idx (when supplied), and
// always bumps last_active_at to NOW(). Fields not supplied are left at
// their existing values.
//
// All queries are scoped by user_id at the SQL level. Cross-user reads are
// impossible by construction.
//
// Test concerns: cascade rules + ownership checks live in the integration
// tests of this module + the tRPC router section in trpc-router.ts.

import type pg from 'pg'

export type WebAppAgentSessionRow = {
	id: string
	userId: string
	webappId: string
	runId: string | null
	createdAt: Date
	lastActiveAt: Date
	lastSeenIdx: number
}

function toDate(value: unknown): Date {
	return value instanceof Date ? value : new Date(value as string | number)
}

function rowToSession(row: any): WebAppAgentSessionRow {
	return {
		id: row.id,
		userId: row.user_id,
		webappId: row.webapp_id,
		runId: row.run_id,
		createdAt: toDate(row.created_at),
		lastActiveAt: toDate(row.last_active_at),
		lastSeenIdx: typeof row.last_seen_idx === 'number' ? row.last_seen_idx : Number(row.last_seen_idx),
	}
}

export async function findWebAppAgentSession(
	pool: pg.Pool,
	userId: string,
	webappId: string,
): Promise<WebAppAgentSessionRow | null> {
	const {rows} = await pool.query(
		`SELECT id, user_id, webapp_id, run_id, created_at, last_active_at, last_seen_idx
		 FROM webapp_agent_sessions
		 WHERE user_id = $1 AND webapp_id = $2
		 LIMIT 1`,
		[userId, webappId],
	)
	if (rows.length === 0) return null
	return rowToSession(rows[0])
}

export type UpsertWebAppAgentSessionInput = {
	userId: string
	webappId: string
	runId?: string | null
	lastSeenIdx?: number
}

/**
 * Upsert keyed on the unique index (user_id, webapp_id). On conflict, the
 * supplied fields overwrite existing values; unsupplied fields keep theirs.
 * `last_active_at` always bumps to NOW().
 */
export async function upsertWebAppAgentSession(
	pool: pg.Pool,
	input: UpsertWebAppAgentSessionInput,
): Promise<WebAppAgentSessionRow> {
	const runIdProvided = Object.prototype.hasOwnProperty.call(input, 'runId')
	const lastSeenIdxProvided = Object.prototype.hasOwnProperty.call(input, 'lastSeenIdx')

	const {rows} = await pool.query(
		`INSERT INTO webapp_agent_sessions
		   (user_id, webapp_id, run_id, last_seen_idx, last_active_at)
		 VALUES ($1, $2, $3, $4, NOW())
		 ON CONFLICT (user_id, webapp_id) DO UPDATE SET
		   run_id = CASE WHEN $5::boolean THEN EXCLUDED.run_id ELSE webapp_agent_sessions.run_id END,
		   last_seen_idx = CASE WHEN $6::boolean THEN EXCLUDED.last_seen_idx ELSE webapp_agent_sessions.last_seen_idx END,
		   last_active_at = NOW()
		 RETURNING id, user_id, webapp_id, run_id, created_at, last_active_at, last_seen_idx`,
		[
			input.userId,
			input.webappId,
			runIdProvided ? input.runId ?? null : null,
			lastSeenIdxProvided ? input.lastSeenIdx ?? -1 : -1,
			runIdProvided,
			lastSeenIdxProvided,
		],
	)
	return rowToSession(rows[0])
}
