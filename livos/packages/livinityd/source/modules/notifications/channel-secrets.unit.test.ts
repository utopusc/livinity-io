// Phase 310-01 (ALERT-03, T-310-02) — channel-secrets vault unit tests.
//
// Proves the three properties ALERT-03 depends on, fully offline (fake Redis +
// stubbed DEK via the `_setKeyProvidersForTests` seam, no real disk/Redis):
//   1. Round-trip: setSecret then getSecrets returns the plaintext.
//   2. Ciphertext-at-rest: the raw Redis hash value is NOT the plaintext.
//   3. deleteAll empties the channel's hash.
//   4. Legacy-migration: a field encrypted under the legacy sha256(jwt) key is
//      still recovered by getSecrets via the lazy re-key fallback.

import crypto from 'node:crypto'

import type {Redis} from 'ioredis'
import {beforeEach, describe, expect, test, vi} from 'vitest'

// Safety stub — the DEK module reads keys through the injectable
// _setKeyProvidersForTests seam, so no real disk access happens either way.
vi.mock('node:fs/promises', () => ({
	readFile: vi.fn(async () => 'test-jwt-secret-do-not-use-in-prod'),
	writeFile: vi.fn(async () => undefined),
	mkdir: vi.fn(async () => undefined),
}))

const TEST_DEK = Buffer.alloc(32, 0x42)
const TEST_JWT = 'test-jwt-secret-do-not-use-in-prod'
const LEGACY_KEY = crypto.createHash('sha256').update(TEST_JWT.trim()).digest()

const dek = await import('../secrets/dek.js')
const {createChannelSecretStore} = await import('./channel-secrets.js')

// In-memory Redis over Map<string, Map<string,string>> — implements exactly the
// four commands the store uses (hset/hdel/hgetall/del).
class FakeRedis {
	data = new Map<string, Map<string, string>>()

	async hset(key: string, field: string, value: string): Promise<number> {
		let h = this.data.get(key)
		if (!h) {
			h = new Map()
			this.data.set(key, h)
		}
		const isNew = h.has(field) ? 0 : 1
		h.set(field, value)
		return isNew
	}

	async hdel(key: string, field: string): Promise<number> {
		const h = this.data.get(key)
		if (!h) return 0
		const removed = h.delete(field) ? 1 : 0
		if (h.size === 0) this.data.delete(key)
		return removed
	}

	async del(key: string): Promise<number> {
		return this.data.delete(key) ? 1 : 0
	}

	async hgetall(key: string): Promise<Record<string, string>> {
		const h = this.data.get(key)
		if (!h) return {}
		return Object.fromEntries(h)
	}

	// Test-only peek at the raw stored blob (bypasses decryption).
	rawField(key: string, field: string): string | undefined {
		return this.data.get(key)?.get(field)
	}
}

const CHANNEL = 'chan-1'
const REDIS_KEY = `liv:notifications:channel-secrets:${CHANNEL}`

describe('notifications/channel-secrets vault', () => {
	let fake: FakeRedis
	let store: ReturnType<typeof createChannelSecretStore>

	beforeEach(() => {
		// A present DEK file (fixed TEST_DEK) plus the legacy JWT.
		dek._setKeyProvidersForTests({
			readFileRaw: async () => Buffer.from(TEST_DEK),
			readFile: async () => TEST_JWT,
			randomBytes: (n: number) => Buffer.alloc(n, 0x99),
		})
		fake = new FakeRedis()
		store = createChannelSecretStore(fake as unknown as Redis)
	})

	test('1. round-trip: setSecret then getSecrets returns the plaintext', async () => {
		await store.setSecret(CHANNEL, 'webhookUrl', 'https://hooks.example.com/services/T/B/xyz')
		const secrets = await store.getSecrets(CHANNEL)
		expect(secrets.webhookUrl).toBe('https://hooks.example.com/services/T/B/xyz')
	})

	test('2. ciphertext-at-rest: the raw stored blob is NOT the plaintext', async () => {
		const plaintext = 'https://hooks.example.com/services/T/B/xyz'
		await store.setSecret(CHANNEL, 'webhookUrl', plaintext)
		const raw = fake.rawField(REDIS_KEY, 'webhookUrl')
		expect(raw).toBeDefined()
		expect(raw).not.toBe(plaintext)
		// It is base64 ciphertext (iv|tag|ct), not the readable URL.
		expect(raw).toMatch(/^[A-Za-z0-9+/=]+$/)
		expect(raw!.includes('hooks.example.com')).toBe(false)
	})

	test('3. deleteAll empties the channel hash', async () => {
		await store.setSecret(CHANNEL, 'webhookUrl', 'https://x/y')
		await store.setSecret(CHANNEL, 'ntfyToken', 'tk_secret_value')
		await store.deleteAll(CHANNEL)
		expect(await store.getSecrets(CHANNEL)).toEqual({})
		expect(fake.rawField(REDIS_KEY, 'webhookUrl')).toBeUndefined()
	})

	test('4. legacy-migration: a legacy sha256(jwt)-encrypted field is recovered via lazy re-key', async () => {
		// Pre-seed a field encrypted under the LEGACY key (the DEK cannot decrypt it,
		// forcing getSecrets down the getLegacyKey() fallback path).
		const legacyBlob = dek.encrypt('ntfy-legacy-token', LEGACY_KEY)
		await fake.hset(REDIS_KEY, 'ntfyToken', legacyBlob)
		// Sanity: the DEK genuinely fails on the legacy blob.
		const dekKey = await dek.getKey()
		expect(() => dek.decrypt(legacyBlob, dekKey)).toThrow()

		const secrets = await store.getSecrets(CHANNEL)
		expect(secrets.ntfyToken).toBe('ntfy-legacy-token')

		// Lazy re-key persisted the field re-encrypted under the DEK — it now
		// decrypts under the DEK directly (no longer under the legacy key).
		const reencrypted = fake.rawField(REDIS_KEY, 'ntfyToken')
		expect(reencrypted).toBeDefined()
		expect(reencrypted).not.toBe(legacyBlob)
		expect(dek.decrypt(reencrypted!, dekKey)).toBe('ntfy-legacy-token')
	})

	test('5. deleteSecret removes a single field, leaving the others intact', async () => {
		await store.setSecret(CHANNEL, 'webhookUrl', 'https://x/y')
		await store.setSecret(CHANNEL, 'ntfyToken', 'tk_value')
		await store.deleteSecret(CHANNEL, 'ntfyToken')
		const secrets = await store.getSecrets(CHANNEL)
		expect(secrets.webhookUrl).toBe('https://x/y')
		expect(secrets.ntfyToken).toBeUndefined()
	})
})
