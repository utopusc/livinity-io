/**
 * Phase 59 Plan 59-01 — api-keys/database.ts unit tests (RED phase).
 *
 * Wave 0: production module does NOT yet exist. These tests describe the
 * exact contract Wave 1's `database.ts` must satisfy:
 *   - createApiKey: generates `liv_sk_<base64url-32>` plaintext, stores
 *     SHA-256 hash, NEVER stores the plaintext as a query param.
 *   - findApiKeyByHash: SELECT scoped by `key_hash = $1 AND revoked_at IS NULL`.
 *   - revokeApiKey: user-scoped + idempotent UPDATE (revoked_at IS NULL guard).
 *   - listApiKeysForUser: SELECT excludes `key_hash`, orders by created_at DESC.
 *
 * Strategy: mock `getPool()` to return a stub Pool that records query calls.
 * No real PostgreSQL needed — assertions verify SQL string + params shape.
 * Mirrors the usage-tracking/database.test.ts mock pattern (Phase 44).
 *
 * RED expectation: import of `./database.js` will fail with module-not-found
 * because Wave 1 has not yet created the file. That's the correct RED signal.
 */

import {createHash} from 'node:crypto'

import {beforeEach, describe, expect, test, vi} from 'vitest'

const queryMock = vi.fn()

vi.mock('../database/index.js', () => ({
	getPool: () => ({query: queryMock}),
}))

// Import AFTER mock setup. Wave 1 will provide these exports.
import {
	createApiKey,
	findApiKeyByHash,
	revokeApiKey,
	listApiKeysForUser,
} from './database.js'

const KEY_REGEX = /^liv_sk_[A-Za-z0-9_-]{32}$/
const HEX_64_REGEX = /^[a-f0-9]{64}$/

describe('api-keys database Plan 59-01 (RED)', () => {
	beforeEach(() => {
		queryMock.mockReset()
	})

	test('T1 — createApiKey issues single INSERT with position-correct params; plaintext matches liv_sk regex; key_hash is SHA-256(plaintext)', async () => {
		queryMock.mockResolvedValue({
			rows: [
				{
					id: 'uuid-1',
					user_id: 'user-A',
					key_prefix: 'liv_sk_X',
					name: 'my-key',
					created_at: new Date(),
					last_used_at: null,
					revoked_at: null,
				},
			],
			rowCount: 1,
		})

		const result = await createApiKey({userId: 'user-A', name: 'my-key'})

		// Exactly one INSERT
		expect(queryMock).toHaveBeenCalledTimes(1)
		const [sql, params] = queryMock.mock.calls[0]

		// SQL shape — INSERT INTO api_keys (user_id, key_hash, key_prefix, name) VALUES ($1, $2, $3, $4)
		expect(sql).toMatch(/INSERT INTO api_keys/)
		expect(sql).toMatch(/user_id, key_hash, key_prefix, name/)
		expect(sql).toMatch(/VALUES \(\$1, \$2, \$3, \$4\)/)
		expect(sql).toMatch(/RETURNING/)

		// Params position-correct: $1=user_id, $2=key_hash, $3=key_prefix, $4=name
		expect(params).toHaveLength(4)
		expect(params[0]).toBe('user-A')
		expect(params[1]).toMatch(HEX_64_REGEX) // SHA-256 hex digest = 64 hex chars
		expect(params[2]).toMatch(/^liv_sk_./) // 8-char prefix
		expect(params[3]).toBe('my-key')

		// Plaintext returned matches the liv_sk_<32> regex
		expect(result.plaintext).toMatch(KEY_REGEX)

		// key_hash IS the SHA-256 of the returned plaintext (not just any 64-hex string)
		const expectedHash = createHash('sha256').update(result.plaintext, 'utf-8').digest('hex')
		expect(params[1]).toBe(expectedHash)
	})

	test('T2 — findApiKeyByHash issues SELECT with key_hash + revoked_at IS NULL filter; null on miss', async () => {
		// Hit case
		queryMock.mockResolvedValueOnce({
			rows: [
				{
					id: 'uuid-1',
					user_id: 'user-A',
					key_prefix: 'liv_sk_X',
					name: 'my-key',
					created_at: new Date(),
					last_used_at: null,
					revoked_at: null,
				},
			],
		})
		const hit = await findApiKeyByHash('a'.repeat(64))
		expect(queryMock).toHaveBeenCalledTimes(1)
		const [sql, params] = queryMock.mock.calls[0]
		expect(sql).toMatch(/SELECT/)
		expect(sql).toMatch(/FROM api_keys/)
		expect(sql).toMatch(/WHERE key_hash = \$1/)
		expect(sql).toMatch(/revoked_at IS NULL/)
		expect(params).toEqual(['a'.repeat(64)])
		expect(hit).not.toBeNull()

		// Miss case → null
		queryMock.mockResolvedValueOnce({rows: []})
		const miss = await findApiKeyByHash('b'.repeat(64))
		expect(miss).toBeNull()
	})

	test('T3 — revokeApiKey issues user-scoped + idempotent UPDATE (id, user_id, revoked_at IS NULL)', async () => {
		queryMock.mockResolvedValue({rows: [], rowCount: 1})
		await revokeApiKey({id: 'uuid-1', userId: 'user-A'})
		expect(queryMock).toHaveBeenCalledTimes(1)
		const [sql, params] = queryMock.mock.calls[0]
		expect(sql).toMatch(/UPDATE api_keys/)
		expect(sql).toMatch(/SET revoked_at = NOW\(\)/)
		expect(sql).toMatch(/WHERE id = \$1/)
		expect(sql).toMatch(/AND user_id = \$2/)
		// Idempotent: only flips revoked_at if currently NULL
		expect(sql).toMatch(/AND revoked_at IS NULL/)
		expect(params).toEqual(['uuid-1', 'user-A'])
	})

	test('T4 — plaintext is NEVER stored as a query param (only its SHA-256 digest)', async () => {
		queryMock.mockResolvedValue({
			rows: [
				{
					id: 'uuid-2',
					user_id: 'user-B',
					key_prefix: 'liv_sk_Y',
					name: 'another',
					created_at: new Date(),
					last_used_at: null,
					revoked_at: null,
				},
			],
			rowCount: 1,
		})

		const {plaintext} = await createApiKey({userId: 'user-B', name: 'another'})

		// Walk every query call; assert plaintext is never present in any param.
		for (const call of queryMock.mock.calls) {
			const params = (call[1] ?? []) as unknown[]
			for (const p of params) {
				expect(p).not.toBe(plaintext)
				if (typeof p === 'string') {
					expect(p).not.toContain(plaintext)
				}
			}
		}

		// And: the hash IS present (defensive — the test catches a future regression
		// where someone "switches" to plaintext storage and forgets to update tests).
		const expectedHash = createHash('sha256').update(plaintext, 'utf-8').digest('hex')
		const allParams = queryMock.mock.calls.flatMap((c) => (c[1] ?? []) as unknown[])
		expect(allParams).toContain(expectedHash)
	})

	test('T5 — listApiKeysForUser SELECT excludes key_hash; orders by created_at DESC', async () => {
		queryMock.mockResolvedValue({rows: []})
		await listApiKeysForUser('user-A')
		expect(queryMock).toHaveBeenCalledTimes(1)
		const [sql, params] = queryMock.mock.calls[0]
		expect(sql).toMatch(/SELECT/)
		expect(sql).toMatch(/FROM api_keys/)
		// key_hash MUST NOT appear in the SELECT column list (defense against
		// accidentally exposing the hash to the API client).
		expect(sql).not.toMatch(/key_hash/)
		expect(sql).toMatch(/WHERE user_id = \$1/)
		expect(sql).toMatch(/ORDER BY created_at DESC/)
		expect(params).toEqual(['user-A'])
	})
})
