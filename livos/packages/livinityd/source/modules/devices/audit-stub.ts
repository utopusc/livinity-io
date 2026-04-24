/**
 * Phase 12 AUTHZ-02: Stub device-authorization audit log.
 *
 * Writes failed-authorization events to a Redis list at key
 * `nexus:device:audit:failures`. Capped at 1000 entries via LTRIM.
 *
 * Phase 15 (AUDIT-01/AUDIT-02) will REPLACE this stub with an append-only
 * PostgreSQL `device_audit_log` table with INSERT/SELECT-only DB role.
 * Callsites written in Plan 12-02 should import from `../devices` (barrel)
 * so Phase 15 can swap the implementation without touching callers.
 *
 * Contract: fire-and-forget. MUST NOT throw — audit is best-effort and must
 * not block the error response to the caller.
 */

import type {Redis} from 'ioredis'
import type {AuthFailReason} from './authorize.js'

export const AUTH_FAILURES_REDIS_KEY = 'nexus:device:audit:failures'
export const AUTH_FAILURES_MAX_ENTRIES = 1000

export interface AuthFailureEntry {
	timestamp: string // ISO 8601
	userId: string // caller-supplied; '' when missing_user
	deviceId: string
	action: string // e.g. 'devices.rename', 'device_tool_call:shell', '/internal/device-tool-execute'
	error: AuthFailReason | string // the AuthResult.reason, or a human-readable label
}

/**
 * Append an authorization-failure entry to the Redis stub audit list.
 * Fire-and-forget: never throws. On Redis failure, logs to console.error
 * (or the provided logger) and returns.
 */
export async function recordAuthFailure(
	redis: Redis,
	entry: Omit<AuthFailureEntry, 'timestamp'>,
	logger: {error: (...args: unknown[]) => void} = console,
): Promise<void> {
	const full: AuthFailureEntry = {
		timestamp: new Date().toISOString(),
		...entry,
	}
	try {
		await redis.lpush(AUTH_FAILURES_REDIS_KEY, JSON.stringify(full))
		// LTRIM 0 (MAX-1) keeps the MAX newest entries (LPUSH adds to head)
		await redis.ltrim(AUTH_FAILURES_REDIS_KEY, 0, AUTH_FAILURES_MAX_ENTRIES - 1)
	} catch (err) {
		logger.error('[device-audit-stub] Failed to record auth failure:', err)
		// swallow — audit is best-effort
	}
}
