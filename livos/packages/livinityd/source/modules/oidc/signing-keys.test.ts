// Phase 322 (IDENT-02, D-322-3) — oidc/signing-keys unit tests.
//
// Locks the crypto boundary for the OIDC signing key:
//   1. First boot GENERATES an asymmetric RS256 key and PERSISTS it
//      DEK-encrypted — the on-disk blob is base64 ciphertext, never the
//      plaintext private JWK (no cleartext private-exponent `"d"`).
//   2. A second call LOADS + decrypts the SAME key — the `kid` is stable
//      across boots so third-party apps' cached JWKS keep verifying.
//   3. The returned key is a signing JWK (alg RS256, use sig, kty RSA).
//
// Runs fully offline: the DEK is injected via dek._setKeyProvidersForTests and
// the signing-jwk file is backed by an in-memory fake fs — /opt is never touched
// and the HS256 session secret at /opt/livos/data/secrets/jwt is never read.

import {beforeEach, describe, expect, test} from 'vitest'

import * as dek from '../secrets/dek.js'

const mod = await import('./signing-keys.js')

const TEST_DEK = Buffer.alloc(32, 0x42)

describe('oidc/signing-keys', () => {
	let stored: string | null

	beforeEach(() => {
		stored = null
		// Fixed, present DEK — no /opt access, deterministic encryption key.
		dek._setKeyProvidersForTests({
			readFileRaw: async () => Buffer.from(TEST_DEK),
			readFile: async () => 'unused-jwt-secret',
			randomBytes: (n: number) => Buffer.alloc(n, 0x99),
		})
		// In-memory fake fs backing the signing-jwk file.
		mod._setFsForTests({
			readFile: async () => {
				if (stored === null) throw Object.assign(new Error('ENOENT'), {code: 'ENOENT'})
				return stored
			},
			writeFile: async (_p: string, data: string) => {
				stored = data
			},
			mkdir: async () => undefined,
		})
	})

	test('first call generates + persists an ENCRYPTED blob (no cleartext private "d")', async () => {
		const jwks = await mod.getOrCreateSigningJwks()
		expect(jwks.keys).toHaveLength(1)

		// The persisted blob is base64 ciphertext — never plaintext JSON.
		expect(stored).not.toBeNull()
		expect(stored).not.toContain('"d"')
		expect(stored).not.toContain('"kty"')

		// Sanity: it IS a DEK blob whose decrypted plaintext carries the private key.
		const plain = dek.decrypt(stored!, await dek.getKey())
		expect(plain).toContain('"d"')
	})

	test('second call LOADS the same key (stable kid across boots)', async () => {
		const first = await mod.getOrCreateSigningJwks()
		const kid1 = first.keys[0].kid
		// The blob is now persisted; the second call must read + decrypt it.
		const second = await mod.getOrCreateSigningJwks()
		const kid2 = second.keys[0].kid

		expect(kid1).toBeTruthy()
		expect(kid2).toBe(kid1)
	})

	test('returned key is an RS256 signing JWK (alg RS256, use sig, kty RSA)', async () => {
		const jwks = await mod.getOrCreateSigningJwks()
		const jwk = jwks.keys[0]
		expect(jwk.alg).toBe('RS256')
		expect(jwk.use).toBe('sig')
		expect(jwk.kty).toBe('RSA')
	})
})
