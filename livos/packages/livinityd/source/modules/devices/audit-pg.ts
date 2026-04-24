/**
 * Phase 15 AUDIT-01 / AUDIT-02: PostgreSQL-backed device audit writer.
 *
 * Replaces the Phase 12 Redis stub (audit-stub.ts#recordAuthFailure) as the
 * primary device-audit sink. Every device tool invocation — both successful
 * and authorization-failed — appends exactly one row to the append-only
 * `device_audit_log` table.
 *
 * Append-only enforcement lives at the DB level: a BEFORE UPDATE OR DELETE
 * trigger on device_audit_log raises 'device_audit_log is append-only' so
 * no application path (this writer, a tRPC mutation, a direct SQL injection)
 * can mutate history.
 *
 * Contract: fire-and-forget. MUST NOT throw. On PG outage, falls back to the
 * Redis stub writer so audit data is captured even during a DB restart.
 *
 * Callsites wired in Plan 15-02:
 *   - DeviceBridge.executeOnDevice (success + auth failure)
 *   - routes.ts#ensureOwnership (tRPC auth failures)
 *   - server/index.ts /internal/device-tool-execute (Nexus REST path)
 */

import {createHash} from 'node:crypto'
import type {Redis} from 'ioredis'

import {getPool} from '../database/index.js'
import {recordAuthFailure} from './audit-stub.js'

export interface DeviceAuditEvent {
	userId: string // '' if missing_user (pre-auth)
	deviceId: string
	toolName: string // e.g. 'shell', 'files_read', 'devices.rename'
	params: unknown // hashed to SHA-256 — plaintext never stored
	success: boolean
	error?: string | null // populated only on failure (e.g. 'device_not_owned')
}

/**
 * Deterministic SHA-256 hex digest of the tool params. Falsy params map to
 * the digest of the empty string so the column is never NULL.
 */
export function computeParamsDigest(params: unknown): string {
	let serialized: string
	try {
		serialized = params === undefined || params === null ? '' : JSON.stringify(params)
	} catch {
		// Circular / non-serializable — fall back to a stable marker so we still
		// record SOMETHING. Realistic device tool params are always JSON-safe.
		serialized = '[unserializable]'
	}
	return createHash('sha256').update(serialized).digest('hex')
}

/**
 * Append one row to device_audit_log. Fire-and-forget.
 *
 * On PG failure (pool missing, connection error, trigger raise for UPDATE/DELETE
 * which cannot happen on INSERT — included for defense-in-depth), falls back
 * to the Phase 12 Redis stub so the event is not lost.
 *
 * @param redis - ioredis client for the Redis-stub fallback path
 * @param event - audit payload
 * @param logger - optional; defaults to console for fallback error logs
 */
export async function recordDeviceEvent(
	redis: Redis,
	event: DeviceAuditEvent,
	logger: {error: (...args: unknown[]) => void} = console,
): Promise<void> {
	const pool = getPool()
	const paramsDigest = computeParamsDigest(event.params)

	if (pool) {
		try {
			await pool.query(
				`INSERT INTO device_audit_log
				   (user_id, device_id, tool_name, params_digest, success, error)
				 VALUES ($1, $2, $3, $4, $5, $6)`,
				[
					// user_id is UUID NOT NULL in schema; '' would violate the type, so
					// fall back to the nil UUID for missing_user rows so we still log.
					event.userId && event.userId.length > 0 ? event.userId : '00000000-0000-0000-0000-000000000000',
					event.deviceId,
					event.toolName,
					paramsDigest,
					event.success,
					event.error ?? null,
				],
			)
			return
		} catch (err) {
			logger.error('[device-audit-pg] INSERT failed, falling back to Redis stub:', err)
			// fall through to Redis-stub fallback
		}
	}

	// PG unavailable or INSERT failed — fall back to the Phase 12 stub so we
	// still capture something. Stub is fire-and-forget and cannot throw.
	void recordAuthFailure(
		redis,
		{
			userId: event.userId,
			deviceId: event.deviceId,
			action: `${event.toolName}${event.success ? ':ok' : ':fail'}`,
			error: event.error || (event.success ? 'ok' : 'unknown'),
		},
		logger,
	)
}
