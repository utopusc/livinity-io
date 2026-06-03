// Phase 29 Plan 29-02 — registry-credentials unit tests (DOC-16).
//
// Locks down the AES-256-GCM crypto boundary for the registry credentials
// vault. Lift-and-shift mirror of git-credentials.ts pattern (Phase 21):
// same 32-byte SHA-256-of-JWT key, same iv12+tag16+ct base64 blob, same
// "encrypted_data NEVER returned via API" guarantee.
//
// Test cases A-G:
//   A: encrypt(plaintext) returns base64 string > 50 chars (iv12 + tag16 + ct + b64 expansion)
//   B: decrypt(encrypt(x, key), key) === x for any utf-8 string x (round-trip)
//   C: decrypt with wrong key throws (auth-tag verification fails — tamper defense)
//   D: listCredentials(null) returns [] when DB has no rows (no encrypted_data field)
//   E: getCredential never surfaces encrypted_data
//   F: deleteCredential(missing-id) returns false; (real-id) returns true and row gone
//   G: createCredential auto-generates id (UUID), stores encrypted JSON, returns metadata only
//
// Pure-helper-as-fixture: encrypt/decrypt are exported for testing. The DB-
// touching APIs are exercised against a tiny in-memory pg pool stub that
// records the SQL it sees.

import crypto from 'node:crypto'

import {beforeEach, describe, expect, test, vi} from 'vitest'

// Mock node:fs/promises to short-circuit any real disk access. The module-under-
// test reads its keys through the injectable _setKeyProvidersForTests hook
// (LIVOS-033), so these are just safety stubs for the default import path.
vi.mock('node:fs/promises', () => ({
	readFile: vi.fn(async () => 'test-jwt-secret-do-not-use-in-prod'),
	writeFile: vi.fn(async () => undefined),
	mkdir: vi.fn(async () => undefined),
}))

// An in-memory DEK + JWT so getKey() is deterministic and offline. The DEK is a
// FIXED 32-byte buffer (distinct from sha256(JWT)) so round-trips are stable.
const TEST_DEK = Buffer.alloc(32, 0x42)
const TEST_JWT = 'test-jwt-secret-do-not-use-in-prod'

// Mock the database module — getPool() returns a stub pool we control.
type Row = {
	id: string
	user_id: string | null
	name: string
	registry_url: string
	username: string
	encrypted_data: string
	created_at: Date
}
let rows: Row[] = []
const fakePool = {
	query: vi.fn(async (sql: string, params?: any[]) => {
		const trimmed = sql.trim()
		if (trimmed.startsWith('SELECT') && trimmed.includes('WHERE id = $1')) {
			const id = params![0]
			const row = rows.find((r) => r.id === id)
			return {rows: row ? [row] : [], rowCount: row ? 1 : 0}
		}
		if (trimmed.startsWith('SELECT') && trimmed.includes('WHERE user_id = $1')) {
			const uid = params![0]
			const matched = rows.filter((r) => r.user_id === uid || r.user_id === null)
			return {rows: matched, rowCount: matched.length}
		}
		if (trimmed.startsWith('SELECT') && trimmed.includes('WHERE user_id IS NULL')) {
			const matched = rows.filter((r) => r.user_id === null)
			return {rows: matched, rowCount: matched.length}
		}
		if (trimmed.startsWith('INSERT')) {
			const [user_id, name, registry_url, username, encrypted_data] = params!
			const newRow: Row = {
				id: `uuid-${rows.length + 1}`,
				user_id,
				name,
				registry_url,
				username,
				encrypted_data,
				created_at: new Date(),
			}
			rows.push(newRow)
			return {rows: [newRow], rowCount: 1}
		}
		if (trimmed.startsWith('UPDATE')) {
			// LIVOS-033 lazy re-key: UPDATE ... SET encrypted_data = $1 WHERE id = $2
			const [encrypted_data, id] = params!
			const row = rows.find((r) => r.id === id)
			if (row) row.encrypted_data = encrypted_data
			return {rows: [], rowCount: row ? 1 : 0}
		}
		if (trimmed.startsWith('DELETE')) {
			const id = params![0]
			const before = rows.length
			rows = rows.filter((r) => r.id !== id)
			return {rows: [], rowCount: before - rows.length}
		}
		return {rows: [], rowCount: 0}
	}),
}
vi.mock('../database/index.js', () => ({
	getPool: () => fakePool,
}))

// Now import the module under test — these imports trigger after mocks are set up.
const mod = await import('./registry-credentials.js')

describe('registry-credentials', () => {
	beforeEach(() => {
		rows = []
		fakePool.query.mockClear()
		// Default: a present DEK file (the fixed TEST_DEK), plus the legacy JWT.
		mod._setKeyProvidersForTests({
			readFileRaw: async () => Buffer.from(TEST_DEK),
			readFile: async () => TEST_JWT,
			randomBytes: (n: number) => Buffer.alloc(n, 0x99),
		})
	})

	test('A: encrypt produces base64 string > 50 chars', async () => {
		const key = await mod._getKeyForTests()
		const blob = mod._encryptForTests('hello-world', key)
		expect(typeof blob).toBe('string')
		expect(blob.length).toBeGreaterThan(50)
		// base64 sanity — only base64 chars
		expect(/^[A-Za-z0-9+/=]+$/.test(blob)).toBe(true)
	})

	test('B: decrypt(encrypt(x)) round-trips', async () => {
		const key = await mod._getKeyForTests()
		const samples = ['simple', '{"json":"value"}', 'utf-8 émoji 🚀 plus tabs\t\n']
		for (const s of samples) {
			const blob = mod._encryptForTests(s, key)
			expect(mod._decryptForTests(blob, key)).toBe(s)
		}
	})

	test('C: decrypt with wrong key throws (auth-tag fail)', async () => {
		const key = await mod._getKeyForTests()
		const blob = mod._encryptForTests('secret', key)
		const wrongKey = Buffer.alloc(32, 0xab)
		expect(() => mod._decryptForTests(blob, wrongKey)).toThrow()
	})

	test('D: listCredentials(null) returns [] when DB empty (no encrypted_data leak)', async () => {
		const result = await mod.listCredentials(null)
		expect(result).toEqual([])
	})

	test('E: getCredential never surfaces encrypted_data', async () => {
		await mod.createCredential({
			userId: null,
			name: 'docker-hub',
			registryUrl: 'https://index.docker.io/v1/',
			username: 'me',
			password: 'token',
		})
		const got = await mod.getCredential(rows[0].id)
		expect(got).not.toBeNull()
		expect(got).not.toHaveProperty('encrypted_data')
		expect(got).not.toHaveProperty('encryptedData')
		expect(got).not.toHaveProperty('password')
		expect(got!.name).toBe('docker-hub')
		expect(got!.registryUrl).toBe('https://index.docker.io/v1/')
		expect(got!.username).toBe('me')
	})

	test('F: deleteCredential(missing) → false, (real) → true and row gone', async () => {
		await mod.createCredential({
			userId: null,
			name: 'cred-x',
			registryUrl: 'https://r.example.com',
			username: 'u',
			password: 'p',
		})
		const id = rows[0].id
		expect(await mod.deleteCredential('uuid-not-real')).toBe(false)
		expect(await mod.deleteCredential(id)).toBe(true)
		expect(rows.find((r) => r.id === id)).toBeUndefined()
	})

	test('G: createCredential auto-id, encrypted JSON {password}, returns metadata only', async () => {
		const created = await mod.createCredential({
			userId: null,
			name: 'private-reg',
			registryUrl: 'https://registry.example.com',
			username: 'admin',
			password: 's3cret',
		})
		expect(created.id).toBeTruthy()
		expect(created).not.toHaveProperty('encryptedData')
		expect(created).not.toHaveProperty('password')
		// encrypted_data column actually contains a base64 blob (not plaintext)
		expect(rows[0].encrypted_data).not.toContain('s3cret')
		expect(rows[0].encrypted_data.length).toBeGreaterThan(20)
		// And we can decrypt + see {password: 's3cret'} via the internal API
		const decrypted = await mod.decryptCredentialData(created.id)
		expect(decrypted).not.toBeNull()
		expect(decrypted!.password).toBe('s3cret')
		expect(decrypted!.username).toBe('admin')
		expect(decrypted!.registryUrl).toBe('https://registry.example.com')
	})

	// ── LIVOS-033: at-rest DEK independent of the JWT secret ──────────────────

	test('033-1: round-trip with the DEK-derived key', async () => {
		const key = await mod._getKeyForTests()
		const blob = mod._encryptForTests('round-trip-plaintext', key)
		expect(mod._decryptForTests(blob, key)).toBe('round-trip-plaintext')
	})

	test('033-2: getKey returns the DEK, NOT sha256(JWT secret)', async () => {
		const key = await mod._getKeyForTests()
		// The DEK is the raw 32-byte file contents (TEST_DEK), independent of JWT.
		expect(key.equals(TEST_DEK)).toBe(true)
		// And it is explicitly NOT the legacy JWT-derived key.
		const jwtDerived = crypto.createHash('sha256').update(TEST_JWT.trim()).digest()
		expect(key.equals(jwtDerived)).toBe(false)
	})

	test('033-3: a fresh 32-byte DEK is generated + persisted (0600) when absent', async () => {
		const generated = Buffer.alloc(32, 0x7e)
		let writtenPath: string | null = null
		let writtenData: Buffer | null = null
		let writtenMode: number | null = null
		mod._setKeyProvidersForTests({
			// DEK file absent → ENOENT.
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
		const key1 = await mod._getKeyForTests()
		expect(key1.equals(generated)).toBe(true)
		expect(key1.length).toBe(32)
		expect(writtenPath).toContain('credential-dek')
		expect(writtenData!.equals(generated)).toBe(true)
		expect(writtenMode).toBe(0o600)
		// Reused (cached) on the next call — no second generation.
		const key2 = await mod._getKeyForTests()
		expect(key2.equals(generated)).toBe(true)
	})

	test('033-4: legacy JWT-keyed blobs still decrypt via lazy re-key fallback', async () => {
		// Simulate a row written with the OLD key = sha256(JWT).
		const legacyKey = crypto.createHash('sha256').update(TEST_JWT.trim()).digest()
		const legacyBlob = mod._encryptForTests(JSON.stringify({password: 'legacy-pw'}), legacyKey)
		rows.push({
			id: 'legacy-row',
			user_id: null,
			name: 'old-cred',
			registry_url: 'https://legacy.example.com',
			username: 'olduser',
			encrypted_data: legacyBlob,
			created_at: new Date(),
		})
		// Current DEK (TEST_DEK) cannot decrypt the legacy blob directly; the
		// fallback must kick in and return the plaintext.
		const decrypted = await mod.decryptCredentialData('legacy-row')
		expect(decrypted).not.toBeNull()
		expect(decrypted!.password).toBe('legacy-pw')
		// Lazy re-key: the row should have been UPDATEd with a DEK-encrypted blob.
		const updateCall = fakePool.query.mock.calls.find(
			(c: any[]) => typeof c[0] === 'string' && c[0].includes('UPDATE registry_credentials'),
		)
		expect(updateCall).toBeTruthy()
		// The re-encrypted blob now decrypts under the DEK (not the legacy key).
		const reBlob = rows.find((r) => r.id === 'legacy-row')!.encrypted_data
		const dek = await mod._getKeyForTests()
		expect(JSON.parse(mod._decryptForTests(reBlob, dek)).password).toBe('legacy-pw')
	})
})
