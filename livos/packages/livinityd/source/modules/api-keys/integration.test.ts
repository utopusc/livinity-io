/**
 * Phase 59 Plan 05 — End-to-end integration test (Wave 4 phase gate).
 *
 * This test stitches every Phase 59 layer together (database mock + cache
 * real instance + bearer middleware + tRPC routes + audit hook) to verify
 * the four user-observable behaviors from ROADMAP §Phase 59 Success Criteria
 * + the last_used_at debouncing + the device_audit_log REUSE.
 *
 * Section map (5 sections, 9 sub-tests):
 *   A — create flow (ROADMAP SC1)
 *     A1: apiKeys.create returns plaintext matching /^liv_sk_[A-Za-z0-9_-]{32}$/
 *     A2: apiKeys.list does NOT include plaintext or key_hash
 *   B — use flow (ROADMAP SC2)
 *     B1: Bearer header resolves req.userId to creator
 *     B2: Bearer header sets req.authMethod = 'bearer'
 *   C — revoke flow (ROADMAP SC3 — THE KEY ASSERTION; FR-BROKER-B1-05 gate)
 *     C1: revoke + immediate retry returns 401 with Anthropic-spec body
 *          AND the round-trip latency is under 100ms (proves cache.invalidate
 *          is sync, not 60s-cache-lag)
 *     C2: revoke calls cache.invalidate(keyHash) BEFORE returning
 *   D — debouncing (CONTEXT.md decision)
 *     D1: 5 valid Bearer requests within ~10ms emit ≤ 1 PG UPDATE last_used_at
 *   E — audit log REUSE (RESEARCH.md §Code Examples)
 *     E1: create emits one device_audit_log INSERT with device_id='api-keys-system'
 *     E2: revoke emits one device_audit_log INSERT with device_id='api-keys-system'
 *
 * Mock surface mirrors usage-tracking/integration.test.ts:
 *   - vi.mock('../database/index.js') for getPool — returns a mockPool whose
 *     query() is a vi.fn() so we can spy on every SQL call.
 *   - vi.mock('../devices/audit-pg.js') for computeParamsDigest — returns a
 *     deterministic mock digest so audit assertions don't have to recompute.
 *   - cache module is NOT mocked — real ApiKeyCache is constructed and shared
 *     between bearer middleware and routes via setSharedApiKeyCache().
 *   - events.ts is NOT mocked at the call site — Section E observes the
 *     pool.query() INSERT it issues directly (REUSE invariant proof).
 *
 * Bearer middleware flow uses a stub req/res pair (same pattern as
 * bearer-auth.test.ts) instead of bringing in supertest — keeps D-NO-NEW-DEPS.
 */

import {createHash} from 'node:crypto'

import {beforeEach, afterEach, describe, expect, test, vi} from 'vitest'
import type {Request, Response, NextFunction} from 'express'

// ─── Mock surface ──────────────────────────────────────────────────────────

const queryMock = vi.fn()
const mockPool = {query: queryMock}

vi.mock('../database/index.js', () => ({
	getPool: () => mockPool,
}))

vi.mock('../devices/audit-pg.js', () => ({
	computeParamsDigest: vi.fn(() => 'mock-digest-deadbeef'),
}))

// Imports MUST come AFTER vi.mock — vitest hoists mock registrations.
import apiKeysRouter from './routes.js'
import {createBearerMiddleware} from './bearer-auth.js'
import {
	createApiKeyCache,
	setSharedApiKeyCache,
	resetSharedApiKeyCacheForTests,
	type ApiKeyCache,
} from './cache.js'
import {t} from '../server/trpc/trpc.js'

const createCaller = t.createCallerFactory(apiKeysRouter)

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeCtx(opts: {userId?: string; username?: string; role?: 'admin' | 'member' | 'guest'} = {}) {
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
			warn: () => {},
		},
	} as never
}

function makeReq(authHeader?: string): Request {
	return {
		headers: authHeader ? {authorization: authHeader} : {},
		params: {},
	} as unknown as Request
}

function makeRes() {
	const res = {
		statusCode: 200,
		_jsonBody: undefined as unknown,
		status(code: number) {
			res.statusCode = code
			return res
		},
		json(body: unknown) {
			res._jsonBody = body
			return res
		},
	}
	return res
}

const fakeLivinityd = {
	logger: {
		log: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
	},
} as never

const KEY_REGEX = /^liv_sk_[A-Za-z0-9_-]{32}$/

const ANTHROPIC_INVALID = {
	type: 'error',
	error: {type: 'authentication_error', message: 'API key invalid'},
}

/**
 * Find pool.query() calls whose SQL matches a regex. Used by Section E to
 * count audit-log INSERTs.
 */
function findQueryCalls(pattern: RegExp): Array<{sql: string; params: unknown[]}> {
	return queryMock.mock.calls
		.filter((c) => typeof c[0] === 'string' && pattern.test(c[0] as string))
		.map((c) => ({sql: c[0] as string, params: (c[1] ?? []) as unknown[]}))
}

// ─── Top-level setup ───────────────────────────────────────────────────────

let cache: ApiKeyCache

describe('Phase 59 integration — Bearer token auth end-to-end', () => {
	beforeEach(() => {
		queryMock.mockReset()
		// Reset and rebuild the shared cache singleton before every test so
		// state doesn't bleed across sections (positive cache from Section B
		// could otherwise affect Section C's revoke timing).
		resetSharedApiKeyCacheForTests()
		cache = createApiKeyCache({pool: null, logger: fakeLivinityd.logger as never})
		setSharedApiKeyCache(cache)
	})

	afterEach(async () => {
		await cache.dispose()
		resetSharedApiKeyCacheForTests()
	})

	// ────────────────────────────────────────────────────────────────────────
	// Section A — Create flow (ROADMAP §59 SC1)
	// ────────────────────────────────────────────────────────────────────────

	describe('Section A — create flow (ROADMAP SC1)', () => {
		test('A1 — create returns plaintext matching liv_sk regex; key_hash param to PG INSERT is SHA-256(plaintext)', async () => {
			let capturedKeyHash: string | undefined
			let capturedPlaintext: string | undefined

			queryMock.mockImplementation((sql: string, params: unknown[]) => {
				if (/INSERT INTO api_keys/.test(sql)) {
					// PG INSERT params: [userId, keyHash, keyPrefix, name]
					capturedKeyHash = params[1] as string
					return Promise.resolve({
						rows: [
							{
								id: 'uuid-A1',
								user_id: params[0],
								key_prefix: params[2],
								name: params[3],
								created_at: new Date(),
								last_used_at: null,
								revoked_at: null,
							},
						],
						rowCount: 1,
					})
				}
				// Audit-log INSERT — succeed silently
				if (/INSERT INTO device_audit_log/.test(sql)) {
					return Promise.resolve({rows: [], rowCount: 1})
				}
				return Promise.resolve({rows: [], rowCount: 0})
			})

			const caller = createCaller(makeCtx({userId: 'user-A', username: 'alice'}))
			const result = await caller.create({name: 'A1-key'})
			capturedPlaintext = result.plaintext

			// Plaintext format
			expect(result.plaintext).toMatch(KEY_REGEX)
			expect(result.prefix).toBe(result.plaintext.slice(0, 8))
			expect(result.id).toBe('uuid-A1')
			expect(result.oneTimePlaintextWarning).toBe(true)

			// key_hash param is SHA-256(plaintext) — proves no plaintext was stored
			const expectedHash = createHash('sha256').update(capturedPlaintext!, 'utf-8').digest('hex')
			expect(capturedKeyHash).toBe(expectedHash)

			// Defensive: plaintext does NOT appear as ANY query parameter
			const allParams = queryMock.mock.calls.flatMap((c) => (c[1] ?? []) as unknown[])
			expect(allParams).not.toContain(capturedPlaintext)
		})

		test('A2 — list response excludes plaintext AND key_hash (only public projection)', async () => {
			queryMock.mockImplementation((sql: string) => {
				if (/SELECT .* FROM api_keys WHERE user_id/.test(sql)) {
					return Promise.resolve({
						rows: [
							{
								id: 'uuid-A2',
								user_id: 'user-A',
								key_prefix: 'liv_sk_X',
								name: 'A2-key',
								created_at: new Date(),
								last_used_at: null,
								revoked_at: null,
							},
						],
						rowCount: 1,
					})
				}
				return Promise.resolve({rows: [], rowCount: 0})
			})

			const caller = createCaller(makeCtx({userId: 'user-A'}))
			const list = await caller.list()

			expect(Array.isArray(list)).toBe(true)
			expect(list.length).toBe(1)
			const row = list[0] as Record<string, unknown>

			// SC1 acceptance: NO plaintext anywhere, NO key_hash anywhere
			expect(row).not.toHaveProperty('plaintext')
			expect(row).not.toHaveProperty('key_hash')
			expect(row).not.toHaveProperty('keyHash')

			// Public projection IS present
			expect(row).toHaveProperty('id')
			expect(row).toHaveProperty('key_prefix')
			expect(row).toHaveProperty('name')
			expect(row).toHaveProperty('created_at')
			expect(row).toHaveProperty('last_used_at')
			expect(row).toHaveProperty('revoked_at')

			// Belt-and-suspenders: SQL the route issued to PG also did NOT select key_hash
			const selectCalls = findQueryCalls(/SELECT .* FROM api_keys/)
			expect(selectCalls.length).toBeGreaterThan(0)
			for (const {sql} of selectCalls) {
				expect(sql).not.toMatch(/key_hash/)
			}
		})
	})

	// ────────────────────────────────────────────────────────────────────────
	// Section B — Use flow (ROADMAP §59 SC2)
	// ────────────────────────────────────────────────────────────────────────

	describe('Section B — use flow (ROADMAP SC2)', () => {
		test('B1 — Bearer header resolves req.userId to the creating user (cache MISS path through PG)', async () => {
			const plaintext = 'liv_sk_' + 'B'.repeat(32)
			const keyHash = createHash('sha256').update(plaintext, 'utf-8').digest('hex')

			queryMock.mockImplementation((sql: string, params: unknown[]) => {
				if (/SELECT .* FROM api_keys WHERE key_hash/.test(sql)) {
					expect(params[0]).toBe(keyHash)
					return Promise.resolve({
						rows: [
							{
								id: 'key-B1',
								user_id: 'user-A',
								key_prefix: plaintext.slice(0, 8),
								name: 'B1-key',
								created_at: new Date(),
								last_used_at: null,
								revoked_at: null,
							},
						],
						rowCount: 1,
					})
				}
				return Promise.resolve({rows: [], rowCount: 0})
			})

			const middleware = createBearerMiddleware(fakeLivinityd, cache)
			const req = makeReq(`Bearer ${plaintext}`)
			const res = makeRes()
			const next = vi.fn() as unknown as NextFunction

			await middleware(req, res as unknown as Response, next)

			expect(next).toHaveBeenCalledTimes(1)
			expect(res.statusCode).toBe(200)
			const r = req as Request & {userId?: string; authMethod?: string; apiKeyId?: string}
			expect(r.userId).toBe('user-A')
			expect(r.apiKeyId).toBe('key-B1')
		})

		test('B2 — Bearer header sets req.authMethod = "bearer" (cache HIT path)', async () => {
			const plaintext = 'liv_sk_' + 'C'.repeat(32)
			const keyHash = createHash('sha256').update(plaintext, 'utf-8').digest('hex')

			// Pre-seed positive cache so PG is NOT consulted on this request.
			cache.setValid(keyHash, {userId: 'user-A', id: 'key-B2'})

			const middleware = createBearerMiddleware(fakeLivinityd, cache)
			const req = makeReq(`Bearer ${plaintext}`)
			const res = makeRes()
			const next = vi.fn() as unknown as NextFunction

			await middleware(req, res as unknown as Response, next)

			expect(next).toHaveBeenCalledTimes(1)
			const r = req as Request & {userId?: string; authMethod?: string; apiKeyId?: string}
			expect(r.userId).toBe('user-A')
			expect(r.authMethod).toBe('bearer')
			expect(r.apiKeyId).toBe('key-B2')
			// Cache hit fast-path — PG was never queried for this request
			const pgSelects = findQueryCalls(/SELECT .* FROM api_keys/)
			expect(pgSelects.length).toBe(0)
		})
	})

	// ────────────────────────────────────────────────────────────────────────
	// Section C — Revoke flow (ROADMAP §59 SC3 — FR-BROKER-B1-05 gate)
	// ────────────────────────────────────────────────────────────────────────

	describe('Section C — revoke flow (ROADMAP SC3, FR-BROKER-B1-05)', () => {
		test('C1 — revoke + immediate retry returns 401 with Anthropic-spec body within 100ms (cache invalidate is SYNC; closes RESEARCH.md Pitfall 1)', async () => {
			// IMPORTANT: This is the FR-BROKER-B1-05 acceptance gate.
			//
			// Flow:
			//   1. Pre-seed positive cache for the key (simulating a prior successful
			//      bearer auth that warmed the cache).
			//   2. Call apiKeys.revoke() — must call cache.invalidate(keyHash).
			//   3. AFTER revoke, the same Bearer fires another middleware request.
			//      Cache MUST miss; PG mock returns null (the row is now revoked, so
			//      findApiKeyByHash WHERE revoked_at IS NULL filters it out).
			//   4. Middleware returns 401 with Anthropic-spec envelope.
			//   5. Total round-trip (revoke call → 401 response) MUST be <100ms.
			//
			// NOTE on message text: CONTEXT.md says revoke = 'API key revoked' and
			// unknown = 'API key invalid'. The middleware cannot distinguish (PG
			// returns null in both cases), so the literal text is 'API key invalid'.
			// The user-observable behavior — "next request after revoke gets 401" —
			// is what FR-BROKER-B1-05 requires; the message is best-effort and
			// matches the bearer-auth.ts T7 contract.

			const plaintext = 'liv_sk_' + 'D'.repeat(32)
			const keyHash = createHash('sha256').update(plaintext, 'utf-8').digest('hex')

			// Step 1 — pre-seed positive cache (the key WAS valid before revoke)
			cache.setValid(keyHash, {userId: 'user-A', id: 'key-C1'})
			expect(cache.get(keyHash)).toBeDefined()

			// Step 2 — wire the PG mock for revoke (UPDATE) and post-revoke lookup
			let revokedAt: Date | null = null
			queryMock.mockImplementation((sql: string) => {
				if (/UPDATE api_keys SET revoked_at/.test(sql)) {
					revokedAt = new Date()
					return Promise.resolve({rows: [{key_hash: keyHash}], rowCount: 1})
				}
				if (/SELECT .* FROM api_keys WHERE key_hash/.test(sql)) {
					// Post-revoke: the SQL filter `revoked_at IS NULL` excludes the row
					return revokedAt !== null
						? Promise.resolve({rows: [], rowCount: 0})
						: Promise.resolve({
								rows: [
									{
										id: 'key-C1',
										user_id: 'user-A',
										key_prefix: plaintext.slice(0, 8),
										name: 'C1-key',
										created_at: new Date(),
										last_used_at: null,
										revoked_at: null,
									},
								],
								rowCount: 1,
							})
				}
				if (/INSERT INTO device_audit_log/.test(sql)) {
					return Promise.resolve({rows: [], rowCount: 1})
				}
				return Promise.resolve({rows: [], rowCount: 0})
			})

			const tStart = Date.now()

			// Step 3 — call apiKeys.revoke
			const caller = createCaller(makeCtx({userId: 'user-A', username: 'alice'}))
			await caller.revoke({id: '11111111-1111-1111-1111-111111111111'})

			// Cache MUST be invalidated synchronously by the revoke handler
			expect(cache.get(keyHash)).toBeUndefined()

			// Step 4 — immediately retry the bearer middleware with the SAME plaintext
			const middleware = createBearerMiddleware(fakeLivinityd, cache)
			const req = makeReq(`Bearer ${plaintext}`)
			const res = makeRes()
			const next = vi.fn() as unknown as NextFunction

			await middleware(req, res as unknown as Response, next)

			const tEnd = Date.now()
			const latencyMs = tEnd - tStart

			// Step 5 — assertions
			expect(next).not.toHaveBeenCalled() // 401 short-circuits next()
			expect(res.statusCode).toBe(401)
			expect(res._jsonBody).toEqual(ANTHROPIC_INVALID)

			// Latency gate — MUST be <100ms (proves cache invalidate is sync, not 60s lag)
			expect(latencyMs).toBeLessThan(100)
		})

		test('C2 — revoke calls cache.invalidate(keyHash) BEFORE the route returns', async () => {
			const plaintext = 'liv_sk_' + 'E'.repeat(32)
			const keyHash = createHash('sha256').update(plaintext, 'utf-8').digest('hex')

			cache.setValid(keyHash, {userId: 'user-A', id: 'key-C2'})

			const invalidateSpy = vi.spyOn(cache, 'invalidate')

			queryMock.mockImplementation((sql: string) => {
				if (/UPDATE api_keys SET revoked_at/.test(sql)) {
					return Promise.resolve({rows: [{key_hash: keyHash}], rowCount: 1})
				}
				if (/INSERT INTO device_audit_log/.test(sql)) {
					return Promise.resolve({rows: [], rowCount: 1})
				}
				return Promise.resolve({rows: [], rowCount: 0})
			})

			const caller = createCaller(makeCtx({userId: 'user-A', username: 'alice'}))
			const result = await caller.revoke({id: '22222222-2222-2222-2222-222222222222'})

			expect(invalidateSpy).toHaveBeenCalledWith(keyHash)
			expect(result.id).toBe('22222222-2222-2222-2222-222222222222')
			expect(result.revoked_at).toBeInstanceOf(Date)

			invalidateSpy.mockRestore()
		})
	})

	// ────────────────────────────────────────────────────────────────────────
	// Section D — Debouncing (CONTEXT.md decision)
	// ────────────────────────────────────────────────────────────────────────

	describe('Section D — last_used_at debouncing', () => {
		test('D1 — 5 valid Bearer requests within ~10ms emit ≤ 1 PG UPDATE last_used_at on flush', async () => {
			const plaintext = 'liv_sk_' + 'F'.repeat(32)
			const keyHash = createHash('sha256').update(plaintext, 'utf-8').digest('hex')

			// Pre-seed positive cache so all 5 requests hit the cache fast-path
			// (which calls cache.touchLastUsed on every successful auth).
			cache.setValid(keyHash, {userId: 'user-A', id: 'key-D1'})

			// Allow a subsequent flushLastUsed() call to use the SAME mockPool
			// (override pool=null we passed to createApiKeyCache for this test).
			// Build a fresh cache wired to mockPool so flushLastUsed actually queries.
			await cache.dispose()
			cache = createApiKeyCache({pool: mockPool as never, logger: fakeLivinityd.logger as never})
			setSharedApiKeyCache(cache)
			cache.setValid(keyHash, {userId: 'user-A', id: 'key-D1'})

			queryMock.mockImplementation((sql: string) => {
				if (/UPDATE api_keys SET last_used_at/.test(sql)) {
					return Promise.resolve({rows: [], rowCount: 1})
				}
				return Promise.resolve({rows: [], rowCount: 0})
			})

			const middleware = createBearerMiddleware(fakeLivinityd, cache)

			// Fire 5 sequential bearer-authed requests within ~10ms.
			for (let i = 0; i < 5; i++) {
				const req = makeReq(`Bearer ${plaintext}`)
				const res = makeRes()
				const next = vi.fn() as unknown as NextFunction
				await middleware(req, res as unknown as Response, next)
				expect(next).toHaveBeenCalledTimes(1) // each one auths
			}

			// Trigger one explicit flush.
			await cache.flushLastUsed()

			// Count UPDATE last_used_at queries that targeted this hash.
			const flushCalls = queryMock.mock.calls.filter((c) => {
				const sql = c[0] as string
				const params = (c[1] ?? []) as unknown[]
				return /UPDATE api_keys SET last_used_at/.test(sql) && params.includes(keyHash)
			})
			// Debouncing contract — at most ONE write for this hash, never 5.
			expect(flushCalls.length).toBeLessThanOrEqual(1)
		})
	})

	// ────────────────────────────────────────────────────────────────────────
	// Section E — Audit log REUSE (RESEARCH.md §Code Examples)
	// ────────────────────────────────────────────────────────────────────────

	describe('Section E — audit log REUSE', () => {
		test('E1 — create emits ONE device_audit_log INSERT with device_id="api-keys-system" and tool_name="create_key"', async () => {
			queryMock.mockImplementation((sql: string, params: unknown[]) => {
				if (/INSERT INTO api_keys/.test(sql)) {
					return Promise.resolve({
						rows: [
							{
								id: 'uuid-E1',
								user_id: params[0],
								key_prefix: params[2],
								name: params[3],
								created_at: new Date(),
								last_used_at: null,
								revoked_at: null,
							},
						],
						rowCount: 1,
					})
				}
				if (/INSERT INTO device_audit_log/.test(sql)) {
					return Promise.resolve({rows: [], rowCount: 1})
				}
				return Promise.resolve({rows: [], rowCount: 0})
			})

			const caller = createCaller(makeCtx({userId: 'user-A', username: 'alice'}))
			await caller.create({name: 'E1-key'})

			// Wait for fire-and-forget audit write to land (recordApiKeyEvent is
			// async; route returns after issuing it but before it completes).
			for (let i = 0; i < 10; i++) {
				await new Promise((r) => setImmediate(r))
			}

			const auditCalls = findQueryCalls(/INSERT INTO device_audit_log/)
			expect(auditCalls.length).toBe(1)

			// Audit row params: [userId, deviceId, toolName, paramsDigest, success, error]
			const params = auditCalls[0].params
			expect(params[0]).toBe('user-A') // userId
			expect(params[1]).toBe('api-keys-system') // sentinel device_id
			expect(params[2]).toBe('create_key') // tool_name
			expect(params[4]).toBe(true) // success
		})

		test('E2 — revoke emits ONE device_audit_log INSERT with device_id="api-keys-system" and tool_name="revoke_key"', async () => {
			const keyHash = 'g'.repeat(64)

			queryMock.mockImplementation((sql: string) => {
				if (/UPDATE api_keys SET revoked_at/.test(sql)) {
					return Promise.resolve({rows: [{key_hash: keyHash}], rowCount: 1})
				}
				if (/INSERT INTO device_audit_log/.test(sql)) {
					return Promise.resolve({rows: [], rowCount: 1})
				}
				return Promise.resolve({rows: [], rowCount: 0})
			})

			const caller = createCaller(makeCtx({userId: 'user-A', username: 'alice'}))
			await caller.revoke({id: '33333333-3333-3333-3333-333333333333'})

			// Wait for fire-and-forget audit write
			for (let i = 0; i < 10; i++) {
				await new Promise((r) => setImmediate(r))
			}

			const auditCalls = findQueryCalls(/INSERT INTO device_audit_log/)
			expect(auditCalls.length).toBe(1)

			const params = auditCalls[0].params
			expect(params[0]).toBe('user-A') // userId
			expect(params[1]).toBe('api-keys-system') // sentinel device_id
			expect(params[2]).toBe('revoke_key') // tool_name
			expect(params[4]).toBe(true) // success
		})
	})
})
