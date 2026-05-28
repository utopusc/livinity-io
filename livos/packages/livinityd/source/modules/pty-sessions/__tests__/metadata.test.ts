/**
 * Phase 243-01 Task 1 — metadata.test.ts (RED→GREEN)
 *
 * Unit tests for the pty-sessions/metadata.ts Redis writer.
 *
 * D-243-PER-USER-READY: `PtySessionMetadata.user_id` field present from day one
 *   so v44+ multi-user does not require a schema migration.
 *
 * Drift-locks:
 *   - `PTY_SESSION_REDIS_PREFIX === 'livos:pty:session:'` (L-243-E literal).
 *   - All 5 metadata fields (user_id, name, createdAt, lastAttachAt, cwd)
 *     must serialize as strings to Redis HSET.
 */

import {beforeEach, describe, expect, test, vi} from 'vitest'

import {
	deleteSessionMetadata,
	PTY_SESSION_REDIS_PREFIX,
	readSessionMetadata,
	writeSessionMetadata,
} from '../metadata.js'
import type {
	PtyMetadataRedisClient,
	PtySessionMetadata,
} from '../types.js'

function makeFakeRedis(): PtyMetadataRedisClient & {
	hset: ReturnType<typeof vi.fn>
	hgetall: ReturnType<typeof vi.fn>
	del: ReturnType<typeof vi.fn>
} {
	return {
		hset: vi.fn().mockResolvedValue(5),
		hgetall: vi.fn().mockResolvedValue({}),
		del: vi.fn().mockResolvedValue(1),
	}
}

const SAMPLE_META: PtySessionMetadata = {
	user_id: 'user-bruce-uid-1',
	name: 'shell',
	createdAt: '2026-05-28T10:00:00.000Z',
	lastAttachAt: '2026-05-28T10:00:00.000Z',
	cwd: '/home/bruce',
}

describe('PTY_SESSION_REDIS_PREFIX — drift-lock (L-243-E)', () => {
	test('exact literal === "livos:pty:session:"', () => {
		expect(PTY_SESSION_REDIS_PREFIX).toBe('livos:pty:session:')
	})
})

describe('writeSessionMetadata', () => {
	let redis: ReturnType<typeof makeFakeRedis>

	beforeEach(() => {
		redis = makeFakeRedis()
	})

	test('calls redis.hset with the prefixed key', async () => {
		await writeSessionMetadata(redis, 'abc-123', SAMPLE_META)
		expect(redis.hset).toHaveBeenCalledTimes(1)
		const callArgs = redis.hset.mock.calls[0]
		expect(callArgs[0]).toBe('livos:pty:session:abc-123')
	})

	test('serializes all 5 fields (user_id, name, createdAt, lastAttachAt, cwd) as strings', async () => {
		await writeSessionMetadata(redis, 'abc-123', SAMPLE_META)
		const fields = redis.hset.mock.calls[0][1] as Record<string, string>
		expect(fields.user_id).toBe('user-bruce-uid-1')
		expect(fields.name).toBe('shell')
		expect(fields.createdAt).toBe('2026-05-28T10:00:00.000Z')
		expect(fields.lastAttachAt).toBe('2026-05-28T10:00:00.000Z')
		expect(fields.cwd).toBe('/home/bruce')
		expect(typeof fields.user_id).toBe('string')
		expect(typeof fields.name).toBe('string')
		expect(typeof fields.createdAt).toBe('string')
		expect(typeof fields.lastAttachAt).toBe('string')
		expect(typeof fields.cwd).toBe('string')
	})
})

describe('readSessionMetadata', () => {
	let redis: ReturnType<typeof makeFakeRedis>

	beforeEach(() => {
		redis = makeFakeRedis()
	})

	test('returns null when hgetall returns {} (Redis missing-key contract)', async () => {
		redis.hgetall.mockResolvedValueOnce({})
		const result = await readSessionMetadata(redis, 'missing-id')
		expect(result).toBeNull()
		expect(redis.hgetall).toHaveBeenCalledWith('livos:pty:session:missing-id')
	})

	test('returns the parsed PtySessionMetadata object when hgetall returns all 5 fields', async () => {
		redis.hgetall.mockResolvedValueOnce({
			user_id: 'user-bruce-uid-1',
			name: 'shell',
			createdAt: '2026-05-28T10:00:00.000Z',
			lastAttachAt: '2026-05-28T10:00:00.000Z',
			cwd: '/home/bruce',
		})
		const result = await readSessionMetadata(redis, 'abc-123')
		expect(result).toEqual(SAMPLE_META)
	})
})

describe('deleteSessionMetadata', () => {
	test('calls redis.del with the prefixed key', async () => {
		const redis = makeFakeRedis()
		await deleteSessionMetadata(redis, 'abc-123')
		expect(redis.del).toHaveBeenCalledTimes(1)
		expect(redis.del).toHaveBeenCalledWith('livos:pty:session:abc-123')
	})
})
