/**
 * Phase 74 Plan 04 (F5 identity preservation) — RED unit tests for
 * `IdentityCache`. Implementation lands in the same wave as this test file;
 * tests are authored first per `tdd="true"` plan flag.
 *
 * Coverage (per <reference_test_cases>):
 *   1. miss on first call, hit after `set`
 *   2. hit within TTL window
 *   3. miss after TTL expiry (lazy eviction on read)
 *   4. LRU eviction at MAX_ENTRIES (1024)
 *   5. per-user isolation (same conversationId, different userId)
 *   6. failed-lookup-not-cached enforced AT auth.ts (smoke here: set never auto-fires)
 *   7. multi-user-mode flip invalidates entries
 *   8. `get` promotes recency for LRU (read-touch beats older insert)
 *
 * Per CONTEXT D-16..D-20:
 *   - In-process Map (no Redis) — D-16
 *   - 30-min TTL — D-18
 *   - 1024 LRU cap — D-20
 *   - Cached value: { userId, claudeDir, multiUserMode, cachedAt } — D-19
 *
 * Time mocking: vitest fake timers via `vi.useFakeTimers()` + `vi.setSystemTime()`.
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {IdentityCache, identityCache, type CachedIdentity} from './identity-cache.js'

const TTL_MS = 30 * 60 * 1000
const MAX_ENTRIES = 1024

function makeValue(userId: string, multiUserMode: boolean = true): CachedIdentity {
	return {
		userId,
		claudeDir: `/opt/livos/data/users/${userId}/.claude`,
		multiUserMode,
		cachedAt: Date.now(),
	}
}

describe('IdentityCache', () => {
	let cache: IdentityCache

	beforeEach(() => {
		cache = new IdentityCache()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('miss on first call, set on resolve, hit on second call within TTL', () => {
		expect(cache.get('u1:c1', true)).toBeUndefined()
		cache.set('u1:c1', makeValue('u1'))
		const hit = cache.get('u1:c1', true)
		expect(hit).toBeDefined()
		expect(hit!.userId).toBe('u1')
	})

	it('hit within TTL window (29 minutes after set)', () => {
		vi.useFakeTimers()
		const start = new Date('2026-01-01T00:00:00Z')
		vi.setSystemTime(start)
		cache.set('u1:c1', makeValue('u1'))

		// Advance 29 minutes (still inside 30-min TTL)
		vi.setSystemTime(new Date(start.getTime() + 29 * 60 * 1000))
		const hit = cache.get('u1:c1', true)
		expect(hit).toBeDefined()
		expect(hit!.userId).toBe('u1')
	})

	it('miss after TTL expiry (31 minutes), entry lazy-evicted', () => {
		vi.useFakeTimers()
		const start = new Date('2026-01-01T00:00:00Z')
		vi.setSystemTime(start)
		cache.set('u1:c1', makeValue('u1'))
		expect(cache.size()).toBe(1)

		// Advance 31 minutes (past 30-min TTL)
		vi.setSystemTime(new Date(start.getTime() + 31 * 60 * 1000))
		expect(cache.get('u1:c1', true)).toBeUndefined()
		// Lazy-eviction MUST drop the entry on read miss
		expect(cache.size()).toBe(0)
	})

	it('LRU eviction at MAX_ENTRIES — first key evicted on overflow', () => {
		// Fill to capacity
		for (let i = 0; i < MAX_ENTRIES; i++) {
			cache.set(`u${i}:c`, makeValue(`u${i}`))
		}
		expect(cache.size()).toBe(MAX_ENTRIES)

		// Insert one more → first key (u0:c) should be evicted
		cache.set('u_new:c', makeValue('u_new'))
		expect(cache.size()).toBe(MAX_ENTRIES)
		expect(cache.get('u0:c', true)).toBeUndefined()
		expect(cache.get('u_new:c', true)).toBeDefined()
		// Last legitimately-inserted is still present
		expect(cache.get(`u${MAX_ENTRIES - 1}:c`, true)).toBeDefined()
	})

	it('per-user isolation: same conversationId different userId → different slots', () => {
		const valueA = makeValue('u1')
		const valueB = makeValue('u2')
		cache.set('u1:conv-shared', valueA)
		cache.set('u2:conv-shared', valueB)

		const a = cache.get('u1:conv-shared', true)
		const b = cache.get('u2:conv-shared', true)
		expect(a?.userId).toBe('u1')
		expect(b?.userId).toBe('u2')
		// Sanity: distinct stored values
		expect(a).not.toBe(b)
	})

	it('failed-lookup-not-cached: cache stays empty when caller skips set()', () => {
		// In auth.ts, failed lookups (404 / 403) bypass `cache.set`. The cache
		// itself enforces nothing — this test asserts the no-op semantics: a
		// `get` followed by no `set` leaves size at 0.
		expect(cache.get('u1:c1', true)).toBeUndefined()
		expect(cache.size()).toBe(0)
		// Still nothing cached after multiple misses
		cache.get('u2:c2', true)
		cache.get('u3:c3', true)
		expect(cache.size()).toBe(0)
	})

	it('multi-user-mode flip invalidates cached entry on read', () => {
		// Cached entry says multi-user-mode WAS true at write time
		cache.set('u1:c1', makeValue('u1', true))
		expect(cache.size()).toBe(1)

		// Reader passes currentMultiUserMode=false (mode toggled between calls)
		// → cache MUST treat as miss + evict
		expect(cache.get('u1:c1', false)).toBeUndefined()
		expect(cache.size()).toBe(0)
	})

	it('get() promotes recency: oldest read survives next eviction round', () => {
		// Fill to capacity
		for (let i = 0; i < MAX_ENTRIES; i++) {
			cache.set(`u${i}:c`, makeValue(`u${i}`))
		}
		// Read u0:c → promotes it to most-recent insertion order
		const promoted = cache.get('u0:c', true)
		expect(promoted).toBeDefined()

		// Insert one more → least-recently-used is now u1:c (since u0 was promoted)
		cache.set('u_new:c', makeValue('u_new'))
		expect(cache.size()).toBe(MAX_ENTRIES)
		expect(cache.get('u0:c', true)).toBeDefined() // promoted, survived
		expect(cache.get('u1:c', true)).toBeUndefined() // evicted in u0's place
		expect(cache.get('u_new:c', true)).toBeDefined()
	})

	it('invalidate() removes a single key', () => {
		cache.set('u1:c1', makeValue('u1'))
		cache.set('u2:c2', makeValue('u2'))
		expect(cache.size()).toBe(2)
		cache.invalidate('u1:c1')
		expect(cache.size()).toBe(1)
		expect(cache.get('u1:c1', true)).toBeUndefined()
		expect(cache.get('u2:c2', true)).toBeDefined()
	})
})

describe('identityCache module-singleton', () => {
	beforeEach(() => {
		identityCache._resetForTest()
	})

	it('module-level singleton instance shares state across imports', () => {
		identityCache.set('u1:c1', makeValue('u1'))
		expect(identityCache.size()).toBe(1)
		expect(identityCache.get('u1:c1', true)?.userId).toBe('u1')
	})

	it('_resetForTest() clears all entries', () => {
		identityCache.set('u1:c1', makeValue('u1'))
		identityCache.set('u2:c2', makeValue('u2'))
		expect(identityCache.size()).toBe(2)
		identityCache._resetForTest()
		expect(identityCache.size()).toBe(0)
	})
})
