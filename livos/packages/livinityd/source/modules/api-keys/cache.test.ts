/**
 * Phase 59 Plan 59-01 — cache.ts unit tests (RED phase).
 *
 * Wave 0: production module does NOT yet exist. These tests describe the
 * exact contract Wave 2's `cache.ts` must satisfy:
 *
 *   - Positive cache: 60s TTL on `setValid(hash, {userId, id})`.
 *   - Negative cache: 5s TTL on `setInvalid(hash)` — mitigates brute-force
 *     probing per CONTEXT.md Specific Ideas.
 *   - Explicit invalidate(hash): synchronous removal — closes RESEARCH.md
 *     Pitfall 1 + Open Question 3 (revoke must propagate immediately, not
 *     wait for the 60s positive TTL to expire).
 *   - touchLastUsed(hash) + flushLastUsed(): batches debounced updates so
 *     the hot auth path doesn't write PG on every successful Bearer auth
 *     (CONTEXT.md last_used_at debouncing — ≤1 write/min/key).
 *
 * Strategy: vi.useFakeTimers() to control TTL expiry deterministically.
 * Mock `getPool()` for the flush test (mirrors database.test.ts pattern).
 *
 * RED expectation: import of `./cache.js` fails with module-not-found
 * because Wave 2 has not yet created the file.
 */

import {beforeEach, afterEach, describe, expect, test, vi} from 'vitest'

const queryMock = vi.fn()

vi.mock('../database/index.js', () => ({
	getPool: () => ({query: queryMock}),
}))

// Import AFTER mock setup. Wave 2 will provide these exports.
import {createApiKeyCache} from './cache.js'

describe('api-keys cache Plan 59-01 (RED)', () => {
	beforeEach(() => {
		queryMock.mockReset()
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	test('T1 — setValid persists for 60s; expires after >60s', () => {
		const cache = createApiKeyCache()
		const hash = 'a'.repeat(64)
		cache.setValid(hash, {userId: 'user-A', id: 'key-1'})

		// Within 60s — still valid
		const hit = cache.get(hash)
		expect(hit).toEqual({kind: 'valid', userId: 'user-A', id: 'key-1'})

		// Advance 59s — still valid
		vi.advanceTimersByTime(59_000)
		expect(cache.get(hash)).toEqual({kind: 'valid', userId: 'user-A', id: 'key-1'})

		// Advance past 60s — expired
		vi.advanceTimersByTime(2_000)
		expect(cache.get(hash)).toBeUndefined()
	})

	test('T2 — setInvalid persists for 5s (negative cache); expires after >5s', () => {
		const cache = createApiKeyCache()
		const hash = 'b'.repeat(64)
		cache.setInvalid(hash)

		expect(cache.get(hash)).toEqual({kind: 'invalid'})

		vi.advanceTimersByTime(4_000)
		expect(cache.get(hash)).toEqual({kind: 'invalid'})

		vi.advanceTimersByTime(2_000)
		expect(cache.get(hash)).toBeUndefined()
	})

	test('T3 — invalidate(hash) IMMEDIATELY removes a previously-valid entry (RESEARCH.md Pitfall 1)', () => {
		const cache = createApiKeyCache()
		const hash = 'c'.repeat(64)
		cache.setValid(hash, {userId: 'user-A', id: 'key-2'})
		expect(cache.get(hash)).toBeDefined()

		// Synchronous invalidation — no time advance needed.
		cache.invalidate(hash)
		expect(cache.get(hash)).toBeUndefined()
	})

	test('T4 — touchLastUsed queues + flushLastUsed issues a single batched UPDATE for queued hashes; queue empties after flush', async () => {
		const cache = createApiKeyCache()
		queryMock.mockResolvedValue({rows: [], rowCount: 2})

		cache.touchLastUsed('h1')
		cache.touchLastUsed('h2')

		// Flush triggers PG writes for both queued hashes.
		await cache.flushLastUsed()

		expect(queryMock).toHaveBeenCalled()
		// All issued queries must be UPDATEs against api_keys with last_used_at.
		// Implementation may batch into one query or issue per-key updates;
		// either is acceptable as long as both hashes are written.
		const allSql = queryMock.mock.calls.map((c) => c[0] as string).join('\n')
		expect(allSql).toMatch(/UPDATE api_keys/)
		expect(allSql).toMatch(/last_used_at/)
		const allParams = queryMock.mock.calls.flatMap((c) => (c[1] ?? []) as unknown[])
		expect(allParams).toEqual(expect.arrayContaining(['h1', 'h2']))

		// After flush, queue is empty — a second flush should NOT re-issue.
		queryMock.mockClear()
		await cache.flushLastUsed()
		expect(queryMock).not.toHaveBeenCalled()
	})

	test('T5 — multiple touchLastUsed on the same hash within 1 minute coalesce into ONE flushed write (debouncing)', async () => {
		const cache = createApiKeyCache()
		queryMock.mockResolvedValue({rows: [], rowCount: 1})

		cache.touchLastUsed('h1')
		vi.advanceTimersByTime(10_000) // +10s
		cache.touchLastUsed('h1')
		vi.advanceTimersByTime(20_000) // +20s (cumulative 30s)
		cache.touchLastUsed('h1')

		await cache.flushLastUsed()

		// Coalesced: at most ONE row's worth of PG write activity for h1.
		// Walk the queries and count how many target h1.
		const h1Targeted = queryMock.mock.calls.filter((c) => {
			const params = (c[1] ?? []) as unknown[]
			return params.includes('h1')
		})
		expect(h1Targeted.length).toBe(1)
	})
})
