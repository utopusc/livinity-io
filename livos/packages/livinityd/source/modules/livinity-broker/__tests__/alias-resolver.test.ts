// Phase 61 Plan 03 Wave 0 — RED tests for the Redis-backed model alias resolver.
//
// Covers (per 61-03-PLAN.md must_haves.truths):
//   - known alias from Redis (case-insensitive)
//   - unknown alias warns + falls through to `default` Redis key
//   - claude-* prefix passthrough verbatim (no warn)
//   - 5-second in-memory TTL cache
//   - Redis error → hardcoded fallback (claude-sonnet-4-6 + warn=true) per RESEARCH.md Open Q4
//
// Initially RED — imports `../alias-resolver.js` which doesn't exist until Task 2.

import {beforeEach, describe, expect, it, vi} from 'vitest'

import {_resetAliasCacheForTest, resolveModelAlias} from '../alias-resolver.js'

interface FakeRedis {
	store: Map<string, string>
	getCalls: number
	throwOnGet: boolean
	get(key: string): Promise<string | null>
}

function makeFakeRedis(): FakeRedis {
	const store = new Map<string, string>()
	const r: FakeRedis = {
		store,
		getCalls: 0,
		throwOnGet: false,
		async get(key: string): Promise<string | null> {
			r.getCalls++
			if (r.throwOnGet) throw new Error('redis down')
			return store.has(key) ? store.get(key)! : null
		},
	}
	return r
}

beforeEach(() => {
	_resetAliasCacheForTest()
})

describe('resolveModelAlias (Phase 61 Plan 03)', () => {
	it('resolves a known alias from redis', async () => {
		const r = makeFakeRedis()
		r.store.set('livinity:broker:alias:opus', 'claude-opus-4-7')
		const out = await resolveModelAlias(r, 'opus')
		expect(out).toEqual({actualModel: 'claude-opus-4-7', warn: false})
	})

	it('resolves case-insensitively (uppercase input → lowercased lookup)', async () => {
		const r = makeFakeRedis()
		r.store.set('livinity:broker:alias:opus', 'claude-opus-4-7')
		const out = await resolveModelAlias(r, 'OPUS')
		expect(out).toEqual({actualModel: 'claude-opus-4-7', warn: false})
	})

	it('unknown alias warns and falls through to the default key', async () => {
		const r = makeFakeRedis()
		r.store.set('livinity:broker:alias:default', 'claude-sonnet-4-6')
		const out = await resolveModelAlias(r, 'foo-bar')
		expect(out).toEqual({actualModel: 'claude-sonnet-4-6', warn: true})
	})

	it('claude-* prefix passes through verbatim with no warn (no Redis hit needed)', async () => {
		const r = makeFakeRedis()
		const out = await resolveModelAlias(r, 'claude-3-5-sonnet-20241022')
		expect(out).toEqual({actualModel: 'claude-3-5-sonnet-20241022', warn: false})
	})

	it('caches lookups for 5 seconds (second call within TTL skips Redis)', async () => {
		vi.useFakeTimers()
		try {
			const r = makeFakeRedis()
			r.store.set('livinity:broker:alias:opus', 'claude-opus-4-7')
			await resolveModelAlias(r, 'opus')
			const callsAfterFirst = r.getCalls
			// Second call inside the 5s window — must be a cache hit (no new Redis call).
			await resolveModelAlias(r, 'opus')
			expect(r.getCalls).toBe(callsAfterFirst)
			// Advance past the 5s TTL — third call must hit Redis again.
			vi.advanceTimersByTime(5_001)
			await resolveModelAlias(r, 'opus')
			expect(r.getCalls).toBe(callsAfterFirst + 1)
		} finally {
			vi.useRealTimers()
		}
	})

	it('Redis error falls back to hardcoded claude-sonnet-4-6 with warn=true (does not throw)', async () => {
		const r = makeFakeRedis()
		r.throwOnGet = true
		const out = await resolveModelAlias(r, 'foo')
		expect(out).toEqual({actualModel: 'claude-sonnet-4-6', warn: true})
	})

	it('trims whitespace before lookup', async () => {
		const r = makeFakeRedis()
		r.store.set('livinity:broker:alias:opus', 'claude-opus-4-7')
		const out = await resolveModelAlias(r, '  opus  ')
		expect(out).toEqual({actualModel: 'claude-opus-4-7', warn: false})
	})
})
