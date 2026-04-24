import {TRPCError} from '@trpc/server'
import {z} from 'zod'

import {adminProcedure, router} from '../server/trpc/trpc.js'
import {getPool} from '../database/index.js'

/**
 * Phase 15 AUDIT-02: admin-only query over the append-only device_audit_log table.
 *
 * Filters:
 *   - userId  (optional UUID)   — show events for this user only
 *   - deviceId (optional string) — show events for this device only
 *   - limit   (default 50, max 200)
 *   - offset  (default 0)
 *
 * Returns rows ordered by timestamp DESC (newest first) plus a total count
 * matching the same filters (so the UI can render pagination without a
 * second trip).
 *
 * Enforcement: adminProcedure — requireRole('admin') in trpc.ts. A member-role
 * user receives a tRPC FORBIDDEN error before the handler runs.
 */

export interface DeviceAuditRow {
	id: string
	userId: string
	deviceId: string
	toolName: string
	paramsDigest: string
	success: boolean
	error: string | null
	timestamp: Date
}

function rowToAudit(row: any): DeviceAuditRow {
	return {
		id: row.id,
		userId: row.user_id,
		deviceId: row.device_id,
		toolName: row.tool_name,
		paramsDigest: row.params_digest,
		success: row.success,
		error: row.error,
		timestamp: row.timestamp,
	}
}

export default router({
	listDeviceEvents: adminProcedure
		.input(
			z.object({
				userId: z.string().uuid().optional(),
				deviceId: z.string().min(1).optional(),
				limit: z.number().int().min(1).max(200).default(50),
				offset: z.number().int().min(0).default(0),
			}),
		)
		.query(async ({input}) => {
			const pool = getPool()
			if (!pool) {
				throw new TRPCError({
					code: 'SERVICE_UNAVAILABLE',
					message: 'Audit log database is not initialized',
				})
			}

			// Build a parameterized WHERE clause — no string interpolation of user input.
			const conditions: string[] = []
			const values: Array<string | number> = []
			if (input.userId) {
				values.push(input.userId)
				conditions.push(`user_id = $${values.length}`)
			}
			if (input.deviceId) {
				values.push(input.deviceId)
				conditions.push(`device_id = $${values.length}`)
			}
			const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

			// Total count for pagination.
			const countResult = await pool.query<{count: string}>(
				`SELECT COUNT(*)::text AS count FROM device_audit_log ${whereSql}`,
				values,
			)
			const total = Number.parseInt(countResult.rows[0]?.count ?? '0', 10)

			// Page of rows.
			values.push(input.limit)
			const limitParam = `$${values.length}`
			values.push(input.offset)
			const offsetParam = `$${values.length}`

			const {rows} = await pool.query(
				`SELECT id, user_id, device_id, tool_name, params_digest, success, error, timestamp
				 FROM device_audit_log
				 ${whereSql}
				 ORDER BY timestamp DESC
				 LIMIT ${limitParam} OFFSET ${offsetParam}`,
				values,
			)

			return {
				total,
				limit: input.limit,
				offset: input.offset,
				events: rows.map(rowToAudit),
			}
		}),
})
