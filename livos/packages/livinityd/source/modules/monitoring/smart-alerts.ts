// Phase 313 (SMART-02/03) — SMART Alerts PG CRUD module.
//
// Mirrors docker/ai-alerts.ts shape — getPool() per call, parameterised
// queries, no module-load connection. Used by:
//   - scheduler/jobs.ts smartHealthScanHandler — insertSmartAlert + findRecentSmartAlert
//   - (Plan 04) monitoring/routes.ts             — list / dismiss
//
// Dedupe contract: findRecentSmartAlert returns the latest un-dismissed
// alert for (device_id, kind) within the last N minutes, or null. The
// health-scan handler uses a 360-minute (6h) window so a daily scan does
// NOT re-insert the same failing condition every tick — this is the
// load-bearing piece for SMART-02's no-alert-fatigue mandate.
//
// This table is the dismissable AUDIT list only. The external-channel
// dispatch is the Phase-310 notifications bridge (notifications.add/clear) —
// this module is NOT a second dispatch path.

import {getPool} from '../database/index.js'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type SmartAlertKind =
	| 'sata-attribute'
	| 'nvme-critical'
	| 'unavailable'
	| 'permission-denied'
	| 'self-test-failed'
	| 'other'

export type SmartAlertSeverity = 'info' | 'warning' | 'critical'

export interface SmartAlert {
	id: string
	deviceId: string
	severity: SmartAlertSeverity
	kind: SmartAlertKind
	message: string
	payloadJson: Record<string, unknown>
	createdAt: string
	dismissedAt: string | null
}

// ---------------------------------------------------------------------------
// Row -> domain mapper (private)
// ---------------------------------------------------------------------------

interface SmartAlertRow {
	id: string
	device_id: string
	severity: SmartAlertSeverity
	kind: SmartAlertKind
	message: string
	payload_json: Record<string, unknown>
	created_at: Date
	dismissed_at: Date | null
}

function rowToSmartAlert(row: SmartAlertRow): SmartAlert {
	return {
		id: row.id,
		deviceId: row.device_id,
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

// No secret columns — device_id/model/counters/reasons only (STRIDE T-313-05).
const SELECT_COLS = `id, device_id, severity, kind, message, payload_json, created_at, dismissed_at`
const MAX_MESSAGE_LEN = 4096 // defensive cap against a runaway reasons[] join

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * List alerts. By default returns only un-dismissed alerts ordered by
 * created_at DESC. Limit defaults to 50, clamped to 1..200.
 */
export async function listSmartAlerts(opts?: {
	includeDismissed?: boolean
	limit?: number
}): Promise<SmartAlert[]> {
	const pool = getPool()
	if (!pool) return []

	const includeDismissed = opts?.includeDismissed === true
	const limit = Math.min(Math.max(1, opts?.limit ?? 50), 200)

	const where = includeDismissed ? '' : 'WHERE dismissed_at IS NULL'
	const {rows} = await pool.query<SmartAlertRow>(
		`SELECT ${SELECT_COLS} FROM smart_alerts ${where} ORDER BY created_at DESC LIMIT $1`,
		[limit],
	)
	return rows.map(rowToSmartAlert)
}

/**
 * Insert a new SMART alert row. Message is truncated to MAX_MESSAGE_LEN.
 * Returns null if no pool (never throws — a scheduler tick must not fail on
 * a missing DB), matching the fire-and-forget call site in the handler.
 */
export async function insertSmartAlert(input: {
	deviceId: string
	severity: SmartAlertSeverity
	kind: SmartAlertKind
	message: string
	payload?: Record<string, unknown>
}): Promise<SmartAlert | null> {
	const pool = getPool()
	if (!pool) return null

	const safeMessage =
		input.message.length > MAX_MESSAGE_LEN ? input.message.slice(0, MAX_MESSAGE_LEN) : input.message

	const {rows} = await pool.query<SmartAlertRow>(
		`INSERT INTO smart_alerts (device_id, severity, kind, message, payload_json)
		 VALUES ($1, $2, $3, $4, $5::jsonb)
		 RETURNING ${SELECT_COLS}`,
		[input.deviceId, input.severity, input.kind, safeMessage, JSON.stringify(input.payload ?? {})],
	)
	return rowToSmartAlert(rows[0])
}

/**
 * Look up the most recent un-dismissed alert for (device_id, kind) within the
 * last `withinMinutes` minutes. THE DEDUPE lookup: if non-null, the handler
 * skips the re-insert so a daily scan does not spam rows for one failing drive.
 */
export async function findRecentSmartAlert(
	deviceId: string,
	kind: string,
	withinMinutes: number,
): Promise<SmartAlert | null> {
	const pool = getPool()
	if (!pool) return null

	// PG doesn't allow parameterising the INTERVAL literal directly — use
	// arithmetic on an INT parameter to produce a typed interval.
	const minutes = Math.max(0, Math.floor(withinMinutes))
	const {rows} = await pool.query<SmartAlertRow>(
		`SELECT ${SELECT_COLS} FROM smart_alerts
		 WHERE device_id = $1
		   AND kind = $2
		   AND dismissed_at IS NULL
		   AND created_at >= NOW() - ($3::int * INTERVAL '1 minute')
		 ORDER BY created_at DESC
		 LIMIT 1`,
		[deviceId, kind, minutes],
	)
	if (rows.length === 0) return null
	return rowToSmartAlert(rows[0])
}

/**
 * Mark a single alert as dismissed. Returns true if a row was actually
 * dismissed (i.e. it existed and was previously un-dismissed).
 */
export async function dismissSmartAlert(id: string): Promise<boolean> {
	const pool = getPool()
	if (!pool) return false

	const result = await pool.query(
		`UPDATE smart_alerts SET dismissed_at = NOW() WHERE id = $1 AND dismissed_at IS NULL`,
		[id],
	)
	return (result.rowCount ?? 0) > 0
}
