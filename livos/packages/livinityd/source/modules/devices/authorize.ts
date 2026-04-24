/**
 * Phase 12 AUTHZ-01: authorizeDeviceAccess — single source of truth for
 * "does this user own this device?" ownership check used by tRPC device
 * routes, DeviceBridge tool dispatch, and the /internal/device-tool-execute
 * callback. O(1) Redis lookup against the device cache populated by
 * DeviceBridge.onDeviceConnected (Phase 11 OWN-03).
 *
 * Deliberately does NOT throw — callers decide how to surface failures
 * (TRPCError for tRPC, JSON 403 for REST, structured tool result for the
 * agent tool loop). Callers also decide when to invoke recordAuthFailure
 * (audit-stub.ts) for failed attempts.
 */

import type {Redis} from 'ioredis'

// Must match DEVICE_REDIS_PREFIX in device-bridge.ts. Duplicated here to keep
// this module zero-import from device-bridge (avoid circular dependency when
// device-bridge later imports authorize.ts in Plan 12-02).
const DEVICE_REDIS_PREFIX = 'livos:devices:'

export type AuthFailReason = 'device_not_found' | 'device_not_owned' | 'missing_user'

export interface AuthResult {
	authorized: boolean
	reason?: AuthFailReason
}

/**
 * Check whether the given userId owns the given deviceId. Reads one Redis
 * key (`livos:devices:{deviceId}`) and compares its userId field.
 *
 * @param redis   ioredis client (must be the same instance DeviceBridge uses)
 * @param userId  Caller's user ID (from ctx.currentUser.id or equivalent)
 * @param deviceId Target device ID
 * @returns AuthResult — authorized=true only when userId matches the cache entry
 */
export async function authorizeDeviceAccess(
	redis: Redis,
	userId: string | undefined | null,
	deviceId: string,
): Promise<AuthResult> {
	// Guard: reject empty/undefined userId BEFORE hitting Redis.
	// Prevents the Phase 11 legacy "return all" fallback from leaking into
	// v7.0 multi-user deployments where ctx.currentUser must exist.
	if (!userId || typeof userId !== 'string' || userId.length === 0) {
		return {authorized: false, reason: 'missing_user'}
	}

	const raw = await redis.get(`${DEVICE_REDIS_PREFIX}${deviceId}`)
	if (!raw) {
		return {authorized: false, reason: 'device_not_found'}
	}

	let parsed: {userId?: string}
	try {
		parsed = JSON.parse(raw)
	} catch {
		// Malformed cache entry — treat as non-existent (same as device-bridge.ts:440-442)
		return {authorized: false, reason: 'device_not_found'}
	}

	if (parsed.userId !== userId) {
		return {authorized: false, reason: 'device_not_owned'}
	}

	return {authorized: true}
}
