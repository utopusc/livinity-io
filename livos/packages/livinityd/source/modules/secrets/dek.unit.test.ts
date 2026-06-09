// Phase 262-05 — shared credential-dek module unit tests (LIVOS-052 / LIVOS-052b).
//
// Locks down the SHARED at-rest DEK module extracted from the Phase 257-05
// registry-credentials.ts pattern. git-credentials.ts, stack-secrets.ts and
// backup-secrets.ts all import getKey/getLegacyKey/encrypt/decrypt from here,
// so these properties hold for every credential store at once:
//
//   1. Round-trip: decrypt(encrypt(s, key), key) === s
//   2. Leaked-jwt property: a blob encrypted with the DEK does NOT decrypt
//      under the legacy sha256(jwt) key (key-domain separation — a leaked JWT
//      secret is no longer a universal credential decryptor).
//   3. Legacy-migration property: a blob encrypted with the legacy sha256(jwt)
//      key DOES decrypt via getLegacyKey() (JWT rotation is non-destructive —
//      stores lazy-re-key on read instead of bricking).
//   4. DEK generation: a fresh 32-byte DEK is created (mode 0600) at
//      /opt/livos/data/secrets/credential-dek when the file is absent.

import crypto from 'node:crypto'

import {beforeEach, describe, expect, test, vi} from 'vitest'

// Safety stubs — the module reads keys through the injectable
// _setKeyProvidersForTests seam, so no real disk access happens either way.
vi.mock('node:fs/promises', () => ({
	readFile: vi.fn(async () => 'test-jwt-secret-do-not-use-in-prod'),
	writeFile: vi.fn(async () => undefined),
	mkdir: vi.fn(async () => undefined),
}))

const TEST_DEK = Buffer.alloc(32, 0x42)
const TEST_JWT = 'test-jwt-secret-do-not-use-in-prod'

const mod = await import('./dek.js')

describe('secrets/dek (shared credential-dek module)', () => {
	beforeEach(() => {
		// Default: a present DEK file (the fixed TEST_DEK), plus the legacy JWT.
		mod._setKeyProvidersForTests({
			readFileRaw: async () => Buffer.from(TEST_DEK),
			readFile: async () => TEST_JWT,
			randomBytes: (n: number) => Buffer.alloc(n, 0x99),
		})
	})

	test('round-trip: decrypt(encrypt(s, key), key) === s', async () => {
		const key = await mod.getKey()
		const samples = ['simple', '{"json":"value"}', 'utf-8 émoji 🚀 plus tabs\t\n']
		for (const s of samples) {
			expect(mod.decrypt(mod.encrypt(s, key), key)).toBe(s)
		}
	})

	test('getKey returns the DEK file contents, NOT sha256(JWT secret)', async () => {
		const key = await mod.getKey()
		expect(key.equals(TEST_DEK)).toBe(true)
		const jwtDerived = crypto.createHash('sha256').update(TEST_JWT.trim()).digest()
		expect(key.equals(jwtDerived)).toBe(false)
	})

	test('leaked-jwt: a DEK-encrypted blob does NOT decrypt under sha256(jwt)', async () => {
		const dek = await mod.getKey()
		const blob = mod.encrypt('git-pat-or-stack-secret', dek)
		const leakedJwtKey = crypto.createHash('sha256').update(TEST_JWT.trim()).digest()
		expect(() => mod.decrypt(blob, leakedJwtKey)).toThrow()
	})

	test('legacy-migration: a legacy sha256(jwt)-encrypted blob decrypts via getLegacyKey()', async () => {
		const legacyKey = crypto.createHash('sha256').update(TEST_JWT.trim()).digest()
		const legacyBlob = mod.encrypt('pre-rotation-credential', legacyKey)
		// The DEK itself must fail on the legacy blob (forces the fallback path)...
		const dek = await mod.getKey()
		expect(() => mod.decrypt(legacyBlob, dek)).toThrow()
		// ...and getLegacyKey() recovers it — JWT rotation is non-destructive.
		const legacy = await mod.getLegacyKey()
		expect(legacy).not.toBeNull()
		expect(mod.decrypt(legacyBlob, legacy!)).toBe('pre-rotation-credential')
	})

	test('getLegacyKey returns null when the jwt secret file is unreadable', async () => {
		mod._setKeyProvidersForTests({
			readFileRaw: async () => Buffer.from(TEST_DEK),
			readFile: async () => {
				throw Object.assign(new Error('ENOENT'), {code: 'ENOENT'})
			},
		})
		expect(await mod.getLegacyKey()).toBeNull()
	})

	test('a fresh 32-byte DEK is generated + persisted (0600) when absent', async () => {
		const generated = Buffer.alloc(32, 0x7e)
		let writtenPath: string | null = null
		let writtenData: Buffer | null = null
		let writtenMode: number | null = null
		mod._setKeyProvidersForTests({
			readFileRaw: async () => {
				throw Object.assign(new Error('ENOENT'), {code: 'ENOENT'})
			},
			readFile: async () => TEST_JWT,
			randomBytes: () => Buffer.from(generated),
			mkdir: async () => undefined,
			writeFile: async (p: string, data: Buffer, opts: {mode: number}) => {
				writtenPath = p
				writtenData = data
				writtenMode = opts.mode
			},
		})
		const key1 = await mod.getKey()
		expect(key1.equals(generated)).toBe(true)
		expect(key1.length).toBe(32)
		expect(writtenPath).toContain('credential-dek')
		expect(writtenData!.equals(generated)).toBe(true)
		expect(writtenMode).toBe(0o600)
		// Cached on the next call — no second generation.
		const key2 = await mod.getKey()
		expect(key2.equals(generated)).toBe(true)
	})

	test('tamper defense: decrypt with a wrong key throws (GCM auth-tag fail)', async () => {
		const key = await mod.getKey()
		const blob = mod.encrypt('secret', key)
		expect(() => mod.decrypt(blob, Buffer.alloc(32, 0xab))).toThrow()
	})
})
