/**
 * Phase 246-02 Task 1 — scrollback.test.ts (RED→GREEN)
 *
 * Unit tests for the Redis scrollback ring buffer + lastAttachAt touch.
 *
 * D-V44-TERMINAL-SCROLLBACK-RING: 10000-line Redis ring per session.
 *   - LIST at `livos:pty:session:<id>:scrollback`
 *   - LTRIM key -10000 -1 after every RPUSH
 *
 * Drift-locks:
 *   - PTY_SESSION_SCROLLBACK_SUFFIX === ':scrollback'
 *   - SCROLLBACK_MAX_LINES === 10000
 *   - buildScrollbackKey reuses Phase 243's PTY_SESSION_REDIS_PREFIX
 *   - touchLastAttachAt writes to the metadata HASH key (NOT the scrollback key)
 */

import {beforeEach, describe, expect, test, vi} from 'vitest'

import {
	appendScrollback,
	buildScrollbackKey,
	deleteScrollback,
	PTY_SESSION_SCROLLBACK_SUFFIX,
	readScrollback,
	SCROLLBACK_MAX_LINES,
	touchLastAttachAt,
} from '../scrollback.js'
import type {PtyScrollbackRedisClient} from '../scrollback.js'

function makeFakeRedis(): PtyScrollbackRedisClient & {
	rpush: ReturnType<typeof vi.fn>
	ltrim: ReturnType<typeof vi.fn>
	lrange: ReturnType<typeof vi.fn>
	del: ReturnType<typeof vi.fn>
	hset: ReturnType<typeof vi.fn>
} {
	return {
		rpush: vi.fn().mockResolvedValue(1),
		ltrim: vi.fn().mockResolvedValue('OK'),
		lrange: vi.fn().mockResolvedValue([]),
		del: vi.fn().mockResolvedValue(1),
		hset: vi.fn().mockResolvedValue(1),
	}
}

describe('PTY_SESSION_SCROLLBACK_SUFFIX — drift-lock', () => {
	test('exact literal === ":scrollback"', () => {
		expect(PTY_SESSION_SCROLLBACK_SUFFIX).toBe(':scrollback')
	})
})

describe('SCROLLBACK_MAX_LINES — drift-lock (D-V44-TERMINAL-SCROLLBACK-RING)', () => {
	test('exact value === 10000', () => {
		expect(SCROLLBACK_MAX_LINES).toBe(10000)
	})
})

describe('buildScrollbackKey', () => {
	test("buildScrollbackKey('abc') === 'livos:pty:session:abc:scrollback'", () => {
		expect(buildScrollbackKey('abc')).toBe('livos:pty:session:abc:scrollback')
	})
})

describe('appendScrollback', () => {
	let redis: ReturnType<typeof makeFakeRedis>

	beforeEach(() => {
		redis = makeFakeRedis()
	})

	test('calls redis.rpush with the scrollback key + chunk', async () => {
		await appendScrollback(redis, 'abc', 'hello world')
		expect(redis.rpush).toHaveBeenCalledTimes(1)
		expect(redis.rpush).toHaveBeenCalledWith(
			'livos:pty:session:abc:scrollback',
			'hello world',
		)
	})

	test('calls redis.ltrim with (key, -10000, -1) AFTER rpush', async () => {
		await appendScrollback(redis, 'abc', 'hello world')
		expect(redis.ltrim).toHaveBeenCalledTimes(1)
		expect(redis.ltrim).toHaveBeenCalledWith(
			'livos:pty:session:abc:scrollback',
			-10000,
			-1,
		)
		// Order check: rpush invoked before ltrim
		const rpushOrder = redis.rpush.mock.invocationCallOrder[0]
		const ltrimOrder = redis.ltrim.mock.invocationCallOrder[0]
		expect(rpushOrder).toBeLessThan(ltrimOrder)
	})

	test('calls rpush + ltrim exactly once each per invocation', async () => {
		await appendScrollback(redis, 'abc', 'one')
		expect(redis.rpush).toHaveBeenCalledTimes(1)
		expect(redis.ltrim).toHaveBeenCalledTimes(1)
	})
})

describe('readScrollback', () => {
	let redis: ReturnType<typeof makeFakeRedis>

	beforeEach(() => {
		redis = makeFakeRedis()
	})

	test('calls redis.lrange with (key, 0, -1) and returns its result', async () => {
		redis.lrange.mockResolvedValueOnce(['line1', 'line2'])
		const result = await readScrollback(redis, 'abc')
		expect(redis.lrange).toHaveBeenCalledWith(
			'livos:pty:session:abc:scrollback',
			0,
			-1,
		)
		expect(result).toEqual(['line1', 'line2'])
	})

	test('returns [] when redis.lrange returns []', async () => {
		const result = await readScrollback(redis, 'missing')
		expect(result).toEqual([])
	})
})

describe('deleteScrollback', () => {
	test('calls redis.del with the scrollback key (NOT the metadata key)', async () => {
		const redis = makeFakeRedis()
		await deleteScrollback(redis, 'abc')
		expect(redis.del).toHaveBeenCalledTimes(1)
		expect(redis.del).toHaveBeenCalledWith('livos:pty:session:abc:scrollback')
		expect(redis.del.mock.calls[0][0]).toContain(':scrollback')
	})
})

describe('touchLastAttachAt', () => {
	test('calls redis.hset with metadata key (NO :scrollback suffix), field lastAttachAt', async () => {
		const redis = makeFakeRedis()
		await touchLastAttachAt(redis, 'abc', '2026-05-28T00:00:00.000Z')
		expect(redis.hset).toHaveBeenCalledTimes(1)
		expect(redis.hset).toHaveBeenCalledWith(
			'livos:pty:session:abc',
			'lastAttachAt',
			'2026-05-28T00:00:00.000Z',
		)
		// Drift-lock: target the metadata HASH, not the scrollback LIST.
		expect(redis.hset.mock.calls[0][0]).not.toContain(':scrollback')
	})
})
