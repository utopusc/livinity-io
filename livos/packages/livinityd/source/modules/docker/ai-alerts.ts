// Phase 23 (AID-02) — AI Alerts PG CRUD module.
//
// Mirrors scheduler/store.ts shape — getPool() per call, parameterised
// queries, no module-load connection. Used by:
//   - ai-resource-watch.ts (handler)         — insertAiAlert + findRecentAlertByKind
//   - routes.ts (3 new tRPC routes)          — list / dismiss / dismissAll
//
// Dedupe contract: findRecentAlertByKind returns the latest un-dismissed
// alert for (container_name, kind) within the last N minutes, or null.
// The handler uses a 60-minute window so the same stressed container
// doesn't generate a fresh Kimi call every 5-min scheduler tick.

import {getPool} from '../database/index.js'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type AiAlertKind =
	| 'memory-pressure'
	| 'cpu-throttle'
	| 'restart-loop'
	| 'disk-pressure'
	| 'other'

export type AiAlertSeverity = 'info' | 'warning' | 'critical'

export interface AiAlert {
	id: string
	containerName: string
	environmentId: string | null
	severity: AiAlertSeverity
	kind: AiAlertKind
	message: string
	payloadJson: Record<string, unknown>
	createdAt: string
	dismissedAt: string | null
}

// ---------------------------------------------------------------------------
// Row -> domain mapper (private)
// ---------------------------------------------------------------------------

interface AiAlertRow {
	id: string
	container_name: string
	environment_id: string | null
	severity: AiAlertSeverity
	kind: AiAlertKind
	message: string
	payload_json: Record<string, unknown>
	created_at: Date
	dismissed_at: Date | null
}

function rowToAlert(row: AiAlertRow): AiAlert {
	return {
		id: row.id,
		containerName: row.container_name,
		environmentId: row.environment_id,
		severity: row.severity,
		kind: row.kind,
		message: row.message,
		payloadJson: (row.payload_json ?? {}) as Record<string, unknown>,
		createdAt:
			row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
		dismissedAt:
			row.dismissed_at == null
				? null
				: row.dismissed_at instanceof Date
					? row.dismissed_at.toISOString()
					: String(row.dismissed_at),
	}
}

const SELECT_COLS = `id, container_name, environment_id, severity, kind, message, payload_json, created_at, dismissed_at`
const MAX_MESSAGE_LEN = 4096 // defensive cap against runaway Kimi output

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * List alerts. By default returns only un-dismissed alerts ordered by
 * created_at DESC. Limit defaults to 50, capped to 200.
 */
export async function listAiAlerts(opts?: {
	includeDismissed?: boolean
	limit?: number
}): Promise<AiAlert[]> {
	const pool = getPool()
	if (!pool) return []

	const includeDismissed = opts?.includeDismissed === true
	const limit = Math.min(Math.max(1, opts?.limit ?? 50), 200)

	const where = includeDismissed ? '' : 'WHERE dismissed_at IS NULL'
	const {rows} = await pool.query<AiAlertRow>(
		`SELECT ${SELECT_COLS} FROM ai_alerts ${where} ORDER BY created_at DESC LIMIT $1`,
		[limit],
	)
	return rows.map(rowToAlert)
}

/**
 * Insert a new alert row. Message is truncated to MAX_MESSAGE_LEN as a
 * defensive cap against runaway Kimi output.
 */
export async function insertAiAlert(input: {
	containerName: string
	environmentId: string | null
	severity: AiAlertSeverity
	kind: AiAlertKind
	message: string
	payloadJson: Record<string, unknown>
}): Promise<AiAlert> {
	const pool = getPool()
	if (!pool) throw new Error('Database not initialized')

	const safeMessage =
		input.message.length > MAX_MESSAGE_LEN
			? input.message.slice(0, MAX_MESSAGE_LEN)
			: input.message

	const {rows} = await pool.query<AiAlertRow>(
		`INSERT INTO ai_alerts (container_name, environment_id, severity, kind, message, payload_json)
		 VALUES ($1, $2, $3, $4, $5, $6::jsonb)
		 RETURNING ${SELECT_COLS}`,
		[
			input.containerName,
			input.environmentId,
			input.severity,
			input.kind,
			safeMessage,
			JSON.stringify(input.payloadJson ?? {}),
		],
	)
	return rowToAlert(rows[0])
}

/**
 * Mark a single alert as dismissed. Returns true if a row was actually
 * dismissed (i.e. it existed and was previously un-dismissed).
 */
export async function dismissAiAlert(id: string): Promise<boolean> {
	const pool = getPool()
	if (!pool) throw new Error('Database not initialized')

	const result = await pool.query(
		`UPDATE ai_alerts SET dismissed_at = NOW() WHERE id = $1 AND dismissed_at IS NULL`,
		[id],
	)
	return (result.rowCount ?? 0) > 0
}

/**
 * Mark every un-dismissed alert as dismissed. Returns the number of rows
 * affected so the caller can show "Dismissed N alerts" toast.
 */
export async function dismissAllAiAlerts(): Promise<number> {
	const pool = getPool()
	if (!pool) throw new Error('Database not initialized')

	const result = await pool.query(
		`UPDATE ai_alerts SET dismissed_at = NOW() WHERE dismissed_at IS NULL`,
	)
	return result.rowCount ?? 0
}

/**
 * Look up the most recent un-dismissed alert for (container_name, kind)
 * within the last `withinMinutes` minutes. Used by the ai-resource-watch
 * handler's dedupe path: if non-null, skip the Kimi call and don't insert
 * a duplicate row.
 */
export async function findRecentAlertByKind(
	containerName: string,
	kind: AiAlertKind,
	withinMinutes: number,
): Promise<AiAlert | null> {
	const pool = getPool()
	if (!pool) return null

	// PG doesn't allow parameterising the INTERVAL literal directly — use
	// arithmetic on a NUMERIC parameter to produce a typed interval.
	const minutes = Math.max(0, Math.floor(withinMinutes))
	const {rows} = await pool.query<AiAlertRow>(
		`SELECT ${SELECT_COLS} FROM ai_alerts
		 WHERE container_name = $1
		   AND kind = $2
		   AND dismissed_at IS NULL
		   AND created_at >= NOW() - ($3::int * INTERVAL '1 minute')
		 ORDER BY created_at DESC
		 LIMIT 1`,
		[containerName, kind, minutes],
	)
	if (rows.length === 0) return null
	return rowToAlert(rows[0])
}
