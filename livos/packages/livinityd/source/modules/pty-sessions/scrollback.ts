/**
 * Phase 246-02 — Redis scrollback ring buffer + lastAttachAt persistence.
 *
 * Per D-V44-TERMINAL-SCROLLBACK-RING:
 *   - Per-session LIST at `livos:pty:session:<id>:scrollback`
 *   - LTRIM to 10000 most-recent lines after every RPUSH
 *
 * Per 246-CONTEXT (Reload-survive reattach):
 *   - `touchLastAttachAt` updates the HASH field on the EXISTING metadata key
 *     written by Phase 243's writeSessionMetadata. The TTL GC in 246-05 reads
 *     this field to decide whether a session is idle > 24h.
 *
 * The module is stateless — every function takes a redis client. No singletons.
 * Mirrors Phase 243's `metadata.ts` DI shape.
 */

import {PTY_SESSION_REDIS_PREFIX} from './metadata.js'

/**
 * Drift-locked literal — combined with PTY_SESSION_REDIS_PREFIX to form the
 * per-session LIST key. Tested by scrollback.test.ts case 1.
 */
export const PTY_SESSION_SCROLLBACK_SUFFIX = ':scrollback' as const

/**
 * Drift-lock per D-V44-TERMINAL-SCROLLBACK-RING. The LTRIM ceiling is
 * `-SCROLLBACK_MAX_LINES, -1` so the ring keeps the most-recent N entries.
 */
export const SCROLLBACK_MAX_LINES = 10000 as const

/**
 * Narrow Redis surface consumed by scrollback.ts.
 *
 * Defined HERE (not in types.ts) so PtyMetadataRedisClient stays unchanged —
 * per SC-05, Phase 243's narrow contract is preserved.
 */
export interface PtyScrollbackRedisClient {
	rpush(key: string, value: string): Promise<number>
	ltrim(key: string, start: number, stop: number): Promise<'OK' | string>
	lrange(key: string, start: number, stop: number): Promise<string[]>
	del(key: string): Promise<number>
	hset(key: string, field: string, value: string): Promise<number>
}

/** Builds the scrollback LIST key for a session. */
export function buildScrollbackKey(sessionId: string): string {
	return PTY_SESSION_REDIS_PREFIX + sessionId + PTY_SESSION_SCROLLBACK_SUFFIX
}

/**
 * Append one chunk to the per-session scrollback ring.
 *
 * RPUSHes the chunk and then LTRIMs the LIST to the most-recent
 * SCROLLBACK_MAX_LINES entries. Both calls awaited in order.
 */
export async function appendScrollback(
	redis: PtyScrollbackRedisClient,
	sessionId: string,
	chunk: string,
): Promise<void> {
	const key = buildScrollbackKey(sessionId)
	await redis.rpush(key, chunk)
	await redis.ltrim(key, -SCROLLBACK_MAX_LINES, -1)
}

/**
 * Read the full per-session scrollback ring (LRANGE 0 -1).
 * Returns an empty array when the key is missing (Redis contract).
 */
export async function readScrollback(
	redis: PtyScrollbackRedisClient,
	sessionId: string,
): Promise<string[]> {
	return redis.lrange(buildScrollbackKey(sessionId), 0, -1)
}

/** Delete the scrollback LIST for a session (used by 246-05 GC). */
export async function deleteScrollback(
	redis: PtyScrollbackRedisClient,
	sessionId: string,
): Promise<void> {
	await redis.del(buildScrollbackKey(sessionId))
}

/**
 * Update the `lastAttachAt` field on the EXISTING metadata hash written by
 * Phase 243's writeSessionMetadata. Targets the metadata key (no
 * `:scrollback` suffix). The TTL GC in 246-05 reads this field to decide
 * whether a session is idle > 24h.
 */
export async function touchLastAttachAt(
	redis: PtyScrollbackRedisClient,
	sessionId: string,
	isoTimestamp: string,
): Promise<void> {
	await redis.hset(
		PTY_SESSION_REDIS_PREFIX + sessionId,
		'lastAttachAt',
		isoTimestamp,
	)
}
