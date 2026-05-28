/**
 * Phase 243-01 Task 1 — Redis session metadata writer.
 *
 * Persists `PtySessionMetadata` at the Redis key `livos:pty:session:{id}`
 * (per L-243-E). v43 MVP is single-session-per-WS but the schema already
 * carries `user_id` so v44+ multi-user does not require a migration.
 *
 * No TTL is set in v43 MVP — TTL GC is v44+ deferred work. WS-close in
 * Plan 243-02 calls `deleteSessionMetadata` for clean teardown.
 */

import type {
	PtyMetadataRedisClient,
	PtySessionMetadata,
} from './types.js'

/**
 * Redis key prefix for session metadata. Drift-locked by
 * `metadata.test.ts` test case 1 — DO NOT change without bumping the
 * schema version + migration.
 */
export const PTY_SESSION_REDIS_PREFIX = 'livos:pty:session:' as const

function prefixedKey(sessionId: string): string {
	return PTY_SESSION_REDIS_PREFIX + sessionId
}

/**
 * Write the 5-field metadata hash for a session.
 *
 * All fields are stored as strings (Redis HSET native type). ioredis
 * accepts `Record<string,string>` as a single positional arg.
 */
export async function writeSessionMetadata(
	redis: PtyMetadataRedisClient,
	sessionId: string,
	meta: PtySessionMetadata,
): Promise<void> {
	const fields: Record<string, string> = {
		user_id: meta.user_id,
		name: meta.name,
		createdAt: meta.createdAt,
		lastAttachAt: meta.lastAttachAt,
		cwd: meta.cwd,
	}
	await redis.hset(prefixedKey(sessionId), fields)
}

/**
 * Read metadata for a session. Returns `null` when the key is missing
 * (ioredis contract: missing hash and empty hash both yield `{}`).
 */
export async function readSessionMetadata(
	redis: PtyMetadataRedisClient,
	sessionId: string,
): Promise<PtySessionMetadata | null> {
	const raw = await redis.hgetall(prefixedKey(sessionId))
	if (!raw || Object.keys(raw).length === 0) {
		return null
	}
	return {
		user_id: raw.user_id ?? '',
		name: raw.name ?? '',
		createdAt: raw.createdAt ?? '',
		lastAttachAt: raw.lastAttachAt ?? '',
		cwd: raw.cwd ?? '',
	}
}

/** Delete the metadata hash for a session. */
export async function deleteSessionMetadata(
	redis: PtyMetadataRedisClient,
	sessionId: string,
): Promise<void> {
	await redis.del(prefixedKey(sessionId))
}
