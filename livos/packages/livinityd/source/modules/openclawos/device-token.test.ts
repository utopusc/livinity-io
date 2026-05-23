/**
 * Phase 203-05 — Ed25519 device token mint/verify tests.
 *
 * Covers ≥4 cases per Plan Task 1 done-criteria:
 *   1.  mint → verify roundtrip returns userId
 *   2.  expired token (exp < now) rejected → null
 *   3.  tampered signature rejected → null
 *   4.  wrong keypair rejected → null
 *
 * Plus additional coverage for the Redis cache layer + Task 2 contracts:
 *   5.  mint TTL = 300 seconds (5-min) exactly per T-203-02
 *   6.  jti is unique per call
 *   7.  Redis SET happens with EX 300 when redis passed
 *   8.  Verify returns null when jti not in Redis (revoked)
 *   9.  Verify ignores Redis when not supplied (signature-only path)
 *  10.  Malformed token shapes (no dot / two dots / empty / garbage) → null
 *
 * Uses an in-process keypair (fresh per test) so the on-disk
 * `loadOrCreateKeypair()` path stays untouched.
 */

import {generateKeyPairSync, type KeyObject} from 'node:crypto'
import {beforeEach, describe, expect, test} from 'vitest'
import {
	_internals,
	_resetKeypairCacheForTests,
	mintToken,
	verifyToken,
} from './device-token.js'

interface FakeRedis {
	store: Map<string, {value: string; expiresAtMs: number}>
	set: (key: string, value: string, mode: 'EX', ttl: number) => Promise<'OK'>
	get: (key: string) => Promise<string | null>
}

function makeFakeRedis(): FakeRedis {
	const store = new Map<string, {value: string; expiresAtMs: number}>()
	return {
		store,
		async set(key, value, _mode, ttl) {
			store.set(key, {value, expiresAtMs: Date.now() + ttl * 1000})
			return 'OK'
		},
		async get(key) {
			const entry = store.get(key)
			if (!entry) return null
			if (entry.expiresAtMs < Date.now()) {
				store.delete(key)
				return null
			}
			return entry.value
		},
	}
}

function makeKeypair() {
	const {privateKey, publicKey} = generateKeyPairSync('ed25519')
	return {privateKey, publicKey}
}

let keypair: {privateKey: KeyObject; publicKey: KeyObject}

beforeEach(() => {
	_resetKeypairCacheForTests()
	keypair = makeKeypair()
})

describe('Phase 203-05 — device-token', () => {
	test('1. mint → verify roundtrip returns the userId we passed in', async () => {
		const {token} = await mintToken('admin-1', {keypair})
		const verified = await verifyToken(token, {keypair})
		expect(verified).not.toBeNull()
		expect(verified?.userId).toBe('admin-1')
	})

	test('2. expired token (exp < now) rejected → null', async () => {
		const minted = await mintToken('admin-1', {keypair, now: 1_000_000_000_000})
		// Verify 400 seconds later — TTL is 300, so this is past exp
		const verified = await verifyToken(minted.token, {keypair, now: 1_000_000_400_000})
		expect(verified).toBeNull()
	})

	test('3. tampered signature rejected → null', async () => {
		const {token} = await mintToken('admin-1', {keypair})
		// Flip a character in the signature half
		const dotIdx = token.indexOf('.')
		const corrupted =
			token.slice(0, dotIdx + 1) +
			(token.charAt(dotIdx + 1) === 'A' ? 'B' : 'A') +
			token.slice(dotIdx + 2)
		const verified = await verifyToken(corrupted, {keypair})
		expect(verified).toBeNull()
	})

	test('4. wrong keypair rejected → null', async () => {
		const {token} = await mintToken('admin-1', {keypair})
		const otherKeypair = makeKeypair()
		const verified = await verifyToken(token, {keypair: otherKeypair})
		expect(verified).toBeNull()
	})

	test('5. mint exp - iat exactly 300 seconds (T-203-02)', async () => {
		const fixedNow = 1_700_000_000_000
		const minted = await mintToken('admin-1', {keypair, now: fixedNow})
		const expectedExpMs = (Math.floor(fixedNow / 1000) + 300) * 1000
		expect(minted.expiresAt).toBe(expectedExpMs)
	})

	test('6. jti is unique per call', async () => {
		const seen = new Set<string>()
		for (let i = 0; i < 8; i++) {
			const {jti} = await mintToken('admin-1', {keypair})
			expect(seen.has(jti)).toBe(false)
			seen.add(jti)
		}
	})

	test('7. Redis SET happens with TTL=300 when redis is supplied', async () => {
		const redis = makeFakeRedis()
		const {jti, expiresAt} = await mintToken('admin-1', {keypair, redis: redis as never})
		const stored = redis.store.get(`${_internals.REDIS_KEY_PREFIX}${jti}`)
		expect(stored).toBeDefined()
		expect(stored?.value).toBe(String(expiresAt))
		const ttlMs = stored!.expiresAtMs - Date.now()
		// TTL should be roughly 300_000ms (allow ±2s for test scheduling jitter)
		expect(ttlMs).toBeGreaterThan(298_000)
		expect(ttlMs).toBeLessThanOrEqual(300_000)
	})

	test('8. Verify returns null when jti absent from Redis (revoked path)', async () => {
		const redis = makeFakeRedis()
		const {token, jti} = await mintToken('admin-1', {keypair, redis: redis as never})
		// Simulate revocation
		redis.store.delete(`${_internals.REDIS_KEY_PREFIX}${jti}`)
		const verified = await verifyToken(token, {keypair, redis: redis as never})
		expect(verified).toBeNull()
	})

	test('9. Verify without Redis succeeds (signature-only path)', async () => {
		const {token} = await mintToken('admin-1', {keypair})
		const verified = await verifyToken(token, {keypair})
		expect(verified).not.toBeNull()
		expect(verified?.userId).toBe('admin-1')
	})

	test('10. Malformed token shapes rejected → null', async () => {
		expect(await verifyToken('', {keypair})).toBeNull()
		expect(await verifyToken('no-dot-here', {keypair})).toBeNull()
		expect(await verifyToken('two.dots.here', {keypair})).toBeNull()
		expect(await verifyToken('.startswithdot', {keypair})).toBeNull()
		expect(await verifyToken('endswithdot.', {keypair})).toBeNull()
		expect(await verifyToken('abc.def', {keypair})).toBeNull() // bad base64
	})

	test('11. payload with wrong alg / v rejected → null', async () => {
		// Forge a token with a valid signature for a payload that has alg="HS256"
		const wrongPayload = {alg: 'HS256', v: 1, sub: 'x', iat: 1, exp: 9_999_999_999, jti: 'x'}
		const encoded = _internals.base64UrlEncode(Buffer.from(JSON.stringify(wrongPayload), 'utf8'))
		const {sign} = await import('node:crypto')
		const sig = sign(null, Buffer.from(encoded, 'utf8'), keypair.privateKey)
		const sigEnc = _internals.base64UrlEncode(sig)
		const token = `${encoded}.${sigEnc}`
		expect(await verifyToken(token, {keypair})).toBeNull()
	})

	test('12. mintToken throws on empty userId', async () => {
		await expect(mintToken('', {keypair})).rejects.toThrow(/userId is required/)
	})
})
