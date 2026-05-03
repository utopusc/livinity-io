/**
 * Phase 44 Plan 44-02 — broker_usage row insert + query helpers.
 *
 * No-ops gracefully when getPool() returns null (pre-init or DATABASE_URL
 * unset) — matches the existing pattern in modules/database/index.ts (e.g.,
 * findUserById, listUsers).
 */

import {getPool} from '../database/index.js'

export type UsageInsertInput = {
	userId: string
	appId: string | null
	apiKeyId: string | null
	model: string
	promptTokens: number
	completionTokens: number
	requestId: string | null
	endpoint: string
}

export type UsageRow = {
	id: string
	user_id: string
	app_id: string | null
	api_key_id: string | null
	model: string
	prompt_tokens: number
	completion_tokens: number
	request_id: string | null
	endpoint: string
	created_at: Date
}

const DEFAULT_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

/**
 * Insert one broker_usage row. No-op if pool is uninitialised.
 *
 * Phase 62 FR-BROKER-E1-01 — `apiKeyId` is the resolved api_keys(id) UUID
 * when the request came in over Bearer (Phase 59 middleware sets req.apiKeyId).
 * Pass `null` for legacy URL-path traffic. The column order here MUST match
 * the schema column order at schema.sql `broker_usage` ALTER block:
 *   user_id, app_id, api_key_id, model, prompt_tokens, completion_tokens,
 *   request_id, endpoint.
 */
export async function insertUsage(input: UsageInsertInput): Promise<void> {
	const pool = getPool()
	if (!pool) return
	await pool.query(
		`INSERT INTO broker_usage
		 (user_id, app_id, api_key_id, model, prompt_tokens, completion_tokens, request_id, endpoint)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		[
			input.userId,
			input.appId,
			input.apiKeyId,
			input.model,
			input.promptTokens,
			input.completionTokens,
			input.requestId,
			input.endpoint,
		],
	)
}

/**
 * Return the calling user's usage rows since the given date (defaults to 30
 * days). Always scoped to a single user_id — the caller passes ctx.currentUser.id.
 *
 * Phase 62 FR-BROKER-E2-02 — optional `apiKeyId` filter ANDs onto the WHERE
 * (does NOT widen scope). Even if attacker passes another user's key UUID,
 * the user_id scope guarantees zero rows leak across users (T-62-02 mitigation).
 */
export async function queryUsageByUser(opts: {
	userId: string
	since?: Date
	apiKeyId?: string
}): Promise<UsageRow[]> {
	const pool = getPool()
	if (!pool) return []
	const since = opts.since ?? new Date(Date.now() - DEFAULT_LOOKBACK_MS)
	const params: unknown[] = [opts.userId, since]
	let whereExtras = ''
	if (opts.apiKeyId) {
		params.push(opts.apiKeyId)
		whereExtras = ` AND api_key_id = $${params.length}`
	}
	const result = await pool.query(
		`SELECT id, user_id, app_id, api_key_id, model, prompt_tokens, completion_tokens, request_id, endpoint, created_at
		 FROM broker_usage
		 WHERE user_id = $1 AND created_at >= $2${whereExtras}
		 ORDER BY created_at DESC`,
		params,
	)
	return result.rows as UsageRow[]
}

/**
 * Admin-only cross-user query. Built dynamically with optional filters.
 * Hard LIMIT 1000 to bound memory + DoS surface (T-44-03-03 mitigation).
 *
 * Phase 62 FR-BROKER-E2-02 — optional `apiKeyId` filter ANDs into the
 * dynamic WHERE clause via parameterized $N placeholder (T-62-01 mitigation:
 * never string-concatenated).
 */
export async function queryUsageAll(opts: {
	userId?: string
	appId?: string
	model?: string
	apiKeyId?: string
	since?: Date
}): Promise<UsageRow[]> {
	const pool = getPool()
	if (!pool) return []
	const since = opts.since ?? new Date(Date.now() - DEFAULT_LOOKBACK_MS)
	const conditions: string[] = ['created_at >= $1']
	const params: unknown[] = [since]
	if (opts.userId) {
		params.push(opts.userId)
		conditions.push(`user_id = $${params.length}`)
	}
	if (opts.appId) {
		params.push(opts.appId)
		conditions.push(`app_id = $${params.length}`)
	}
	if (opts.model) {
		params.push(opts.model)
		conditions.push(`model = $${params.length}`)
	}
	if (opts.apiKeyId) {
		params.push(opts.apiKeyId)
		conditions.push(`api_key_id = $${params.length}`)
	}
	const result = await pool.query(
		`SELECT id, user_id, app_id, api_key_id, model, prompt_tokens, completion_tokens, request_id, endpoint, created_at
		 FROM broker_usage
		 WHERE ${conditions.join(' AND ')}
		 ORDER BY created_at DESC
		 LIMIT 1000`,
		params,
	)
	return result.rows as UsageRow[]
}

/**
 * Count of broker_usage rows for `userId` since UTC midnight today.
 *
 * D-44-09: uses `CURRENT_DATE AT TIME ZONE 'UTC'` — Anthropic subscription
 * caps reset at midnight UTC, NOT local timezone. The banner copy in the UI
 * must match this (Plan 44-04: "Resets at midnight UTC").
 */
export async function countUsageToday(userId: string): Promise<number> {
	const pool = getPool()
	if (!pool) return 0
	const result = await pool.query(
		`SELECT COUNT(*)::int AS count FROM broker_usage
		 WHERE user_id = $1
		   AND created_at >= CURRENT_DATE AT TIME ZONE 'UTC'`,
		[userId],
	)
	return result.rows[0]?.count ?? 0
}
