/**
 * Phase 204-01 — ProviderKeyStore unit tests.
 *
 * Verifies the boundary contracts the router + env-file writer depend on:
 *
 *   1. set + get round-trips correctly.
 *   2. list() returns ONLY the redacted preview (INV-204-04).
 *   3. delete() is idempotent + returns boolean.
 *   4. get() on missing returns null (no throw).
 *   5. set() overwrites (last-write-wins on the key, addedAt updated).
 *   6. redactKey() format `<provider>-***<last4>`.
 */

import {describe, expect, test} from 'vitest'

import {
	PROVIDER_KEYS_HASH,
	ProviderKeyStore,
	redactKey,
	type ProviderKeyStoreRedis,
} from './key-store.js'

/**
 * In-memory mock of the narrow ioredis surface we depend on.
 */
function makeMockRedis(): ProviderKeyStoreRedis & {dump(): Record<string, string>} {
	const store = new Map<string, Map<string, string>>()
	const ensureHash = (key: string): Map<string, string> => {
		let h = store.get(key)
		if (!h) {
			h = new Map<string, string>()
			store.set(key, h)
		}
		return h
	}
	return {
		async hget(key, field) {
			return ensureHash(key).get(field) ?? null
		},
		async hset(key, field, value) {
			ensureHash(key).set(field, value)
			return 1
		},
		async hdel(key, field) {
			const h = ensureHash(key)
			if (!h.has(field)) return 0
			h.delete(field)
			return 1
		},
		async hgetall(key) {
			const h = store.get(key)
			if (!h) return {}
			return Object.fromEntries(h.entries())
		},
		dump() {
			const h = store.get(PROVIDER_KEYS_HASH)
			return h ? Object.fromEntries(h.entries()) : {}
		},
	}
}

describe('ProviderKeyStore', () => {
	test('1. set(xai, ...) then get(xai) round-trips the raw key + addedAt', async () => {
		const redis = makeMockRedis()
		const store = new ProviderKeyStore({redis})
		await store.set('xai', 'xai-abc12345')
		const got = await store.get('xai')
		expect(got).not.toBeNull()
		expect(got?.key).toBe('xai-abc12345')
		// addedAt is an ISO-8601 string parseable by Date.
		expect(typeof got?.addedAt).toBe('string')
		expect(Number.isFinite(Date.parse(got!.addedAt))).toBe(true)
	})

	test('2. list() returns redacted preview + addedAt (NEVER raw key) — INV-204-04', async () => {
		const redis = makeMockRedis()
		const store = new ProviderKeyStore({redis})
		await store.set('xai', 'xai-abcdefgh1234')
		const rows = await store.list()
		expect(rows).toHaveLength(1)
		const [row] = rows
		expect(row!.provider).toBe('xai')
		expect(row!.preview).toBe('xai-***1234')
		// Critical: the raw key MUST NOT appear anywhere in the public shape.
		expect(JSON.stringify(rows)).not.toContain('abcdefgh1234')
	})

	test('3. delete() returns true when removing existing; subsequent get returns null', async () => {
		const redis = makeMockRedis()
		const store = new ProviderKeyStore({redis})
		await store.set('groq', 'gsk_abcdefgh')
		const removed = await store.delete('groq')
		expect(removed).toBe(true)
		const afterDelete = await store.get('groq')
		expect(afterDelete).toBeNull()
		// Idempotent — a second delete returns false but does NOT throw.
		const removedAgain = await store.delete('groq')
		expect(removedAgain).toBe(false)
	})

	test('4. get() on empty store returns null (no throw)', async () => {
		const redis = makeMockRedis()
		const store = new ProviderKeyStore({redis})
		await expect(store.get('anthropic')).resolves.toBeNull()
	})

	test('5. set() overwrites previous value; addedAt is refreshed', async () => {
		const redis = makeMockRedis()
		const store = new ProviderKeyStore({redis})
		await store.set('xai', 'old-key1234')
		const first = await store.get('xai')
		// Small sleep so the addedAt timestamps are observably different
		// (1ms is enough — ISO-8601 has ms precision).
		await new Promise((resolve) => setTimeout(resolve, 2))
		await store.set('xai', 'new-key5678')
		const second = await store.get('xai')
		expect(second?.key).toBe('new-key5678')
		expect(first?.addedAt).not.toBe(second?.addedAt)
		// Only ONE field in the hash — overwrite, not append.
		const rows = await store.list()
		expect(rows).toHaveLength(1)
	})

	test('6. redactKey() emits <provider>-***<last4>', () => {
		expect(redactKey('groq', 'gsk_abcdefgh')).toBe('groq-***efgh')
		expect(redactKey('xai', 'xai-abc12345')).toBe('xai-***2345')
		// Edge case: keys shorter than 4 chars (would be zod-rejected upstream)
		// emit no suffix, just `<provider>-***`.
		expect(redactKey('ollama', 'abc')).toBe('ollama-***')
	})
})
