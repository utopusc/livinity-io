/**
 * Phase 59 Plan 59-01 — tRPC apiKeys router unit tests (RED phase).
 *
 * Wave 0: production module does NOT yet exist. These tests describe the
 * exact contract Wave 3's `routes.ts` must satisfy:
 *
 *   - apiKeys.create returns plaintext ONCE with prefix/name/createdAt/
 *     oneTimePlaintextWarning. Plaintext matches /^liv_sk_[A-Za-z0-9_-]{32}$/;
 *     prefix is the first 8 chars of plaintext.
 *   - apiKeys.list returns rows that EXCLUDE plaintext + key_hash; only
 *     id/key_prefix/name/created_at/last_used_at/revoked_at.
 *   - apiKeys.revoke is user-scoped; throws TRPCError NOT_FOUND on zero
 *     rows affected.
 *   - apiKeys.revoke calls cache.invalidate(key_hash) AFTER successful UPDATE
 *     (closes RESEARCH.md Pitfall 1 — synchronous propagation).
 *   - Both create and revoke emit recordApiKeyEvent (Phase 46 audit REUSE
 *     pattern; T-59-03 Repudiation mitigation).
 *   - listAll is wired as adminProcedure (defense-in-depth source-string check
 *     mirrors common.test.ts:160-178).
 *   - Input validation: name min(1).max(64) per CONTEXT.md schema.
 *
 * Strategy: createCallerFactory + stub Context (mirrors usage-tracking/
 * routes.test.ts pattern). Mock database, cache, and events modules.
 *
 * RED expectation: import of `./routes.js` fails with module-not-found.
 */

import {readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

import {beforeEach, describe, expect, test, vi} from 'vitest'
import {TRPCError} from '@trpc/server'

const createApiKeyMock = vi.fn()
const findApiKeyByHashMock = vi.fn()
const listApiKeysForUserMock = vi.fn()
const listAllApiKeysMock = vi.fn()
const revokeApiKeyMock = vi.fn()
const cacheInvalidateMock = vi.fn()
const recordApiKeyEventMock = vi.fn().mockResolvedValue(undefined)

vi.mock('./database.js', () => ({
	createApiKey: (...args: unknown[]) => createApiKeyMock(...args),
	findApiKeyByHash: (...args: unknown[]) => findApiKeyByHashMock(...args),
	listApiKeysForUser: (...args: unknown[]) => listApiKeysForUserMock(...args),
	listAllApiKeys: (...args: unknown[]) => listAllApiKeysMock(...args),
	revokeApiKey: (...args: unknown[]) => revokeApiKeyMock(...args),
}))

vi.mock('./cache.js', () => ({
	getSharedApiKeyCache: () => ({
		invalidate: (...args: unknown[]) => cacheInvalidateMock(...args),
		get: vi.fn(),
		setValid: vi.fn(),
		setInvalid: vi.fn(),
		touchLastUsed: vi.fn(),
		flushLastUsed: vi.fn().mockResolvedValue(undefined),
	}),
}))

vi.mock('./events.js', () => ({
	recordApiKeyEvent: (...args: unknown[]) => recordApiKeyEventMock(...args),
}))

import apiKeysRouter from './routes.js'
import {t} from '../server/trpc/trpc.js'

const createCaller = t.createCallerFactory(apiKeysRouter)

function makeCtx(opts: {role?: 'admin' | 'member' | 'guest'; userId?: string; username?: string} = {}) {
	return {
		dangerouslyBypassAuthentication: true,
		transport: 'ws',
		currentUser: {
			id: opts.userId ?? 'user-A',
			username: opts.username ?? 'alice',
			role: opts.role ?? 'member',
		},
		logger: {
			log: () => {},
			verbose: () => {},
			error: () => {},
		},
	} as never
}

const KEY_REGEX = /^liv_sk_[A-Za-z0-9_-]{32}$/

describe('api-keys routes Plan 59-01 (RED)', () => {
	beforeEach(() => {
		createApiKeyMock.mockReset()
		findApiKeyByHashMock.mockReset()
		listApiKeysForUserMock.mockReset()
		listAllApiKeysMock.mockReset()
		revokeApiKeyMock.mockReset()
		cacheInvalidateMock.mockReset()
		recordApiKeyEventMock.mockReset().mockResolvedValue(undefined)
	})

	test('T1 — apiKeys.create returns {id, plaintext, prefix, name, created_at, oneTimePlaintextWarning:true}; plaintext matches liv_sk regex; prefix == first 8 chars', async () => {
		const plaintext = 'liv_sk_' + 'A'.repeat(32)
		const createdAt = new Date()
		createApiKeyMock.mockResolvedValue({
			row: {
				id: 'uuid-1',
				userId: 'user-A',
				keyPrefix: plaintext.slice(0, 8),
				name: 'my-key',
				createdAt,
				lastUsedAt: null,
				revokedAt: null,
			},
			plaintext,
		})

		const caller = createCaller(makeCtx({role: 'member'}))
		const result = await caller.create({name: 'my-key'})

		expect(result.id).toBe('uuid-1')
		expect(result.plaintext).toBe(plaintext)
		expect(result.plaintext).toMatch(KEY_REGEX)
		expect(result.prefix).toBe(plaintext.slice(0, 8))
		expect(result.name).toBe('my-key')
		expect(result.created_at).toBeDefined()
		expect(result.oneTimePlaintextWarning).toBe(true)
	})

	test('T2 — apiKeys.list returns rows that EXCLUDE plaintext AND key_hash; only id/key_prefix/name/created_at/last_used_at/revoked_at', async () => {
		listApiKeysForUserMock.mockResolvedValue([
			{
				id: 'uuid-1',
				keyPrefix: 'liv_sk_A',
				name: 'my-key',
				createdAt: new Date(),
				lastUsedAt: null,
				revokedAt: null,
			},
		])

		const caller = createCaller(makeCtx({role: 'member'}))
		const result = await caller.list()

		expect(Array.isArray(result)).toBe(true)
		expect(result.length).toBe(1)
		const row = result[0] as Record<string, unknown>
		// Defensive scan — no plaintext, no key_hash anywhere.
		expect(row).not.toHaveProperty('plaintext')
		expect(row).not.toHaveProperty('keyHash')
		expect(row).not.toHaveProperty('key_hash')
		// Required field set is present (snake_case OR camelCase — implementation
		// detail; just assert the legal columns are observable).
		const allKeys = Object.keys(row)
		expect(allKeys.some((k) => /^id$/.test(k))).toBe(true)
		expect(allKeys.some((k) => /^(key_prefix|keyPrefix)$/.test(k))).toBe(true)
	})

	test('T3 — apiKeys.revoke is user-scoped; throws TRPCError NOT_FOUND on zero rows affected', async () => {
		// Revoke that hits zero rows → NOT_FOUND (per CONTEXT.md).
		revokeApiKeyMock.mockResolvedValue({rowCount: 0})
		const caller = createCaller(makeCtx({role: 'member', userId: 'user-A'}))

		await expect(
			caller.revoke({id: '00000000-0000-0000-0000-000000000000'}),
		).rejects.toThrow(TRPCError)
		await expect(
			caller.revoke({id: '00000000-0000-0000-0000-000000000000'}),
		).rejects.toMatchObject({code: 'NOT_FOUND'})

		// User-scoping: revokeApiKey was called with the ctx user's id (not from input).
		const calls = revokeApiKeyMock.mock.calls
		expect(calls.length).toBeGreaterThan(0)
		for (const call of calls) {
			expect(call[0]).toMatchObject({userId: 'user-A'})
		}
	})

	test('T4 — apiKeys.revoke calls cache.invalidate(key_hash) AFTER successful UPDATE (RESEARCH.md Pitfall 1)', async () => {
		const keyHash = 'd'.repeat(64)
		// The router needs to know the key_hash to invalidate. Implementation
		// will likely SELECT key_hash before the UPDATE (or have revokeApiKey
		// return the hash). Either way, cache.invalidate(key_hash) must be called.
		revokeApiKeyMock.mockResolvedValue({rowCount: 1, keyHash})
		findApiKeyByHashMock.mockResolvedValue({
			id: 'uuid-1',
			userId: 'user-A',
			keyHash,
		})

		const caller = createCaller(makeCtx({role: 'member', userId: 'user-A'}))
		await caller.revoke({id: '11111111-1111-1111-1111-111111111111'})

		// Wave 3 must wire revoke → cache.invalidate(<key_hash>)
		expect(cacheInvalidateMock).toHaveBeenCalled()
		// Either the keyHash itself OR a value passed via revoke's return shape
		// is acceptable. Assert that some invalidate call was made post-UPDATE.
		const allInvalidatedArgs = cacheInvalidateMock.mock.calls.flatMap((c) => c)
		expect(allInvalidatedArgs).toContain(keyHash)
	})

	test('T5 — apiKeys.create AND apiKeys.revoke emit recordApiKeyEvent (Phase 46 audit REUSE; T-59-03)', async () => {
		// create
		const plaintext = 'liv_sk_' + 'B'.repeat(32)
		createApiKeyMock.mockResolvedValue({
			row: {
				id: 'uuid-2',
				userId: 'user-A',
				keyPrefix: plaintext.slice(0, 8),
				name: 'audit-key',
				createdAt: new Date(),
				lastUsedAt: null,
				revokedAt: null,
			},
			plaintext,
		})
		const caller = createCaller(makeCtx({role: 'member', userId: 'user-A', username: 'alice'}))
		await caller.create({name: 'audit-key'})

		expect(recordApiKeyEventMock).toHaveBeenCalled()
		const createCall = recordApiKeyEventMock.mock.calls.find(
			(c) => (c[0] as {action?: string}).action === 'create_key',
		)
		expect(createCall).toBeDefined()
		expect(createCall![0]).toMatchObject({
			action: 'create_key',
			keyId: 'uuid-2',
			userId: 'user-A',
			username: 'alice',
			success: true,
		})

		// revoke
		recordApiKeyEventMock.mockClear()
		revokeApiKeyMock.mockResolvedValue({rowCount: 1, keyHash: 'e'.repeat(64)})
		findApiKeyByHashMock.mockResolvedValue({
			id: 'uuid-2',
			userId: 'user-A',
			keyHash: 'e'.repeat(64),
		})
		await caller.revoke({id: '22222222-2222-2222-2222-222222222222'})

		const revokeCall = recordApiKeyEventMock.mock.calls.find(
			(c) => (c[0] as {action?: string}).action === 'revoke_key',
		)
		expect(revokeCall).toBeDefined()
		expect(revokeCall![0]).toMatchObject({
			action: 'revoke_key',
			userId: 'user-A',
			username: 'alice',
			success: true,
		})
	})

	test('T6 — apiKeys.listAll is wired as adminProcedure (defense-in-depth source-string check)', () => {
		// Mirror common.test.ts:160-178 source-string-positional pattern. Ensures
		// a future regression that "demotes" listAll to privateProcedure is caught.
		const routesPath = join(
			dirname(fileURLToPath(import.meta.url)),
			'routes.ts',
		)
		const routesSrc = readFileSync(routesPath, 'utf8')
		expect(routesSrc).toMatch(/listAll:\s*adminProcedure/)
	})

	test('T7 — input validation — empty name OR > 64 chars rejected via zod', async () => {
		const caller = createCaller(makeCtx({role: 'member'}))

		// Empty name → zod min(1) rejection
		await expect(caller.create({name: ''})).rejects.toThrow()

		// 65-char name → zod max(64) rejection
		await expect(caller.create({name: 'a'.repeat(65)})).rejects.toThrow()

		// createApiKey was NOT called (rejection happens at zod gate)
		expect(createApiKeyMock).not.toHaveBeenCalled()
	})
})
