/**
 * Phase 59 Plan 59-01 — bearer-auth.ts middleware unit tests (RED phase).
 *
 * Wave 0: production middleware does NOT yet exist. These tests describe
 * the exact contract Wave 2's `bearer-auth.ts` must satisfy:
 *
 *   - No Authorization header → next() without setting req.userId (legacy
 *     URL-path resolver still runs; FR-BROKER-B1-03 fall-through behavior).
 *   - `Bearer liv_sk_*` not present → same fall-through.
 *   - Valid Bearer (cache HIT positive) → req.userId set + next(); NO PG.
 *   - Valid Bearer (cache MISS, PG returns row) → cache populated +
 *     req.userId set + next(). SHA-256 of plaintext is the lookup key.
 *   - Invalid Bearer (cache MISS, PG returns null) → 401 Anthropic shape +
 *     cache populated as setInvalid (5s TTL); NEVER calls next().
 *   - Invalid Bearer (cache HIT negative) → 401 IMMEDIATELY without PG.
 *   - Revoked key → 401 (PG returns null because of WHERE revoked_at IS NULL).
 *   - constant-time hash comparison via crypto.timingSafeEqual (defense-in-depth
 *     per RESEARCH.md Pattern 2).
 *
 * RED expectation: import of `./bearer-auth.js` fails with module-not-found.
 */

import {createHash} from 'node:crypto'
import * as crypto from 'node:crypto'

import {beforeEach, describe, expect, test, vi} from 'vitest'
import type {Request, Response, NextFunction} from 'express'

// Wave 2 deviation [Rule 1 - Test Bug]: ESM namespace exports for `node:*`
// built-ins are non-configurable per spec, so `vi.spyOn(crypto, 'timingSafeEqual')`
// (T8 below) throws "Cannot redefine property". Re-mock the module with a
// pass-through: the returned object is a plain JS object whose properties
// vitest CAN redefine, while still delegating to the real implementation so
// every other crypto call (createHash via spread of actualCrypto) keeps
// working unchanged. This is the minimal change required to let the test's
// intent (assert middleware invokes constant-time compare) actually run.
vi.mock('node:crypto', async () => {
	const actual = await vi.importActual<typeof import('node:crypto')>('node:crypto')
	return {...actual, default: actual}
})

const findApiKeyByHashMock = vi.fn()
const cacheGetMock = vi.fn()
const cacheSetValidMock = vi.fn()
const cacheSetInvalidMock = vi.fn()
const cacheTouchLastUsedMock = vi.fn()

vi.mock('./database.js', () => ({
	findApiKeyByHash: (...args: unknown[]) => findApiKeyByHashMock(...args),
	hashKey: (plaintext: string) =>
		createHash('sha256').update(plaintext, 'utf-8').digest('hex'),
}))

vi.mock('./cache.js', () => ({
	createApiKeyCache: () => ({
		get: (...args: unknown[]) => cacheGetMock(...args),
		setValid: (...args: unknown[]) => cacheSetValidMock(...args),
		setInvalid: (...args: unknown[]) => cacheSetInvalidMock(...args),
		touchLastUsed: (...args: unknown[]) => cacheTouchLastUsedMock(...args),
		invalidate: vi.fn(),
		flushLastUsed: vi.fn().mockResolvedValue(undefined),
	}),
}))

// Import AFTER mock setup. Wave 2 will provide these exports.
import {createBearerMiddleware} from './bearer-auth.js'
import {createApiKeyCache} from './cache.js'

const fakeLivinityd = {
	logger: {
		log: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
	},
} as never

function makeReq(authHeader?: string, apiKeyHeader?: string): Request {
	const headers: Record<string, string> = {}
	if (authHeader) headers.authorization = authHeader
	if (apiKeyHeader) headers['x-api-key'] = apiKeyHeader
	return {
		headers,
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

const ANTHROPIC_INVALID = {
	type: 'error',
	error: {type: 'authentication_error', message: 'API key invalid'},
}

describe('api-keys bearer-auth Plan 59-01 (RED)', () => {
	let cache: ReturnType<typeof createApiKeyCache>

	beforeEach(() => {
		findApiKeyByHashMock.mockReset()
		cacheGetMock.mockReset()
		cacheSetValidMock.mockReset()
		cacheSetInvalidMock.mockReset()
		cacheTouchLastUsedMock.mockReset()
		cache = createApiKeyCache()
	})

	test('T1 — missing Authorization header → next() WITHOUT setting req.userId', async () => {
		const middleware = createBearerMiddleware(fakeLivinityd, cache)
		const req = makeReq()
		const res = makeRes()
		const next = vi.fn() as unknown as NextFunction

		await middleware(req, res as unknown as Response, next)

		expect(next).toHaveBeenCalledTimes(1)
		expect((req as Request & {userId?: string}).userId).toBeUndefined()
		expect(findApiKeyByHashMock).not.toHaveBeenCalled()
	})

	test('T2 — Authorization NOT starting with "Bearer liv_sk_" → next() without setting req.userId', async () => {
		const middleware = createBearerMiddleware(fakeLivinityd, cache)
		const req = makeReq('Bearer some-other-token-123')
		const res = makeRes()
		const next = vi.fn() as unknown as NextFunction

		await middleware(req, res as unknown as Response, next)

		expect(next).toHaveBeenCalledTimes(1)
		expect((req as Request & {userId?: string}).userId).toBeUndefined()
		expect(findApiKeyByHashMock).not.toHaveBeenCalled()
	})

	test('T3 — valid Bearer (cache HIT positive) → sets req.userId/authMethod/apiKeyId; PG NOT queried', async () => {
		cacheGetMock.mockReturnValue({kind: 'valid', userId: 'user-A', id: 'key-1'})
		const middleware = createBearerMiddleware(fakeLivinityd, cache)
		const plaintext = 'liv_sk_' + 'X'.repeat(32)
		const req = makeReq(`Bearer ${plaintext}`)
		const res = makeRes()
		const next = vi.fn() as unknown as NextFunction

		await middleware(req, res as unknown as Response, next)

		expect(next).toHaveBeenCalledTimes(1)
		const r = req as Request & {userId?: string; authMethod?: string; apiKeyId?: string}
		expect(r.userId).toBe('user-A')
		expect(r.authMethod).toBe('bearer')
		expect(r.apiKeyId).toBe('key-1')
		expect(findApiKeyByHashMock).not.toHaveBeenCalled() // cache hit fast-path
	})

	test('T4 — valid Bearer (cache MISS, PG returns row) → SHA-256 lookup, cache populated, req.userId set', async () => {
		cacheGetMock.mockReturnValue(undefined) // miss
		const plaintext = 'liv_sk_' + 'Y'.repeat(32)
		const expectedHash = createHash('sha256').update(plaintext, 'utf-8').digest('hex')
		findApiKeyByHashMock.mockResolvedValue({
			id: 'key-2',
			userId: 'user-B',
			keyPrefix: 'liv_sk_Y',
			name: 'name',
			createdAt: new Date(),
			lastUsedAt: null,
			revokedAt: null,
		})

		const middleware = createBearerMiddleware(fakeLivinityd, cache)
		const req = makeReq(`Bearer ${plaintext}`)
		const res = makeRes()
		const next = vi.fn() as unknown as NextFunction

		await middleware(req, res as unknown as Response, next)

		expect(next).toHaveBeenCalledTimes(1)
		expect(findApiKeyByHashMock).toHaveBeenCalledWith(expectedHash)
		expect(cacheSetValidMock).toHaveBeenCalledWith(
			expectedHash,
			expect.objectContaining({userId: 'user-B', id: 'key-2'}),
		)
		const r = req as Request & {userId?: string}
		expect(r.userId).toBe('user-B')
	})

	test('T5 — invalid Bearer (cache MISS, PG returns null) → 401 Anthropic shape + cache setInvalid; next() NOT called', async () => {
		cacheGetMock.mockReturnValue(undefined)
		findApiKeyByHashMock.mockResolvedValue(null)

		const middleware = createBearerMiddleware(fakeLivinityd, cache)
		const plaintext = 'liv_sk_' + 'Z'.repeat(32)
		const expectedHash = createHash('sha256').update(plaintext, 'utf-8').digest('hex')
		const req = makeReq(`Bearer ${plaintext}`)
		const res = makeRes()
		const next = vi.fn() as unknown as NextFunction

		await middleware(req, res as unknown as Response, next)

		expect(next).not.toHaveBeenCalled()
		expect(res.statusCode).toBe(401)
		expect(res._jsonBody).toEqual(ANTHROPIC_INVALID)
		expect(cacheSetInvalidMock).toHaveBeenCalledWith(expectedHash)
	})

	test('T6 — invalid Bearer (cache HIT negative) → 401 IMMEDIATELY without PG query (negative cache fast-path)', async () => {
		cacheGetMock.mockReturnValue({kind: 'invalid'})

		const middleware = createBearerMiddleware(fakeLivinityd, cache)
		const plaintext = 'liv_sk_' + 'Q'.repeat(32)
		const req = makeReq(`Bearer ${plaintext}`)
		const res = makeRes()
		const next = vi.fn() as unknown as NextFunction

		await middleware(req, res as unknown as Response, next)

		expect(next).not.toHaveBeenCalled()
		expect(res.statusCode).toBe(401)
		expect(res._jsonBody).toEqual(ANTHROPIC_INVALID)
		expect(findApiKeyByHashMock).not.toHaveBeenCalled() // negative cache hit
	})

	test('T7 — revoked key (PG returns null because of revoked_at IS NULL filter) → 401 with API key invalid', async () => {
		// findApiKeyByHash filters by revoked_at IS NULL at the SQL layer, so a
		// revoked row is indistinguishable from "unknown" — both map to null.
		// The middleware MUST treat both identically per CONTEXT.md error-shape spec.
		cacheGetMock.mockReturnValue(undefined)
		findApiKeyByHashMock.mockResolvedValue(null)

		const middleware = createBearerMiddleware(fakeLivinityd, cache)
		const plaintext = 'liv_sk_' + 'R'.repeat(32)
		const req = makeReq(`Bearer ${plaintext}`)
		const res = makeRes()
		const next = vi.fn() as unknown as NextFunction

		await middleware(req, res as unknown as Response, next)

		expect(next).not.toHaveBeenCalled()
		expect(res.statusCode).toBe(401)
		// Anthropic shape — message is the literal "API key invalid"
		expect(res._jsonBody).toEqual(ANTHROPIC_INVALID)
	})

	// ─────────────────────────────────────────────────────────────────────
	// v30.5 F6 — x-api-key header support (Anthropic-native clients)
	//
	// Cline, Continue.dev, @anthropic-ai/sdk, anthropic-sdk-python all send
	// `x-api-key: liv_sk_...` per the Anthropic API spec. Pre-v30.5 the
	// middleware only accepted `Authorization: Bearer ...` (OpenAI convention)
	// so Anthropic-native clients fell through to the URL-path resolver,
	// which then 404'd because `:userId` carried Server5's relay-side path
	// placeholder. T9-T12 lock the new dual-scheme contract.
	// ─────────────────────────────────────────────────────────────────────

	test('T9 — valid x-api-key (cache MISS, PG returns row) → req.userId set, NO Authorization header needed', async () => {
		cacheGetMock.mockReturnValue(undefined)
		const plaintext = 'liv_sk_' + 'A'.repeat(32)
		const expectedHash = createHash('sha256').update(plaintext, 'utf-8').digest('hex')
		findApiKeyByHashMock.mockResolvedValue({
			id: 'key-9',
			userId: 'user-D',
			keyPrefix: 'liv_sk_A',
			name: 'cline',
			createdAt: new Date(),
			lastUsedAt: null,
			revokedAt: null,
		})

		const middleware = createBearerMiddleware(fakeLivinityd, cache)
		// No Authorization header — only x-api-key (Anthropic SDK convention)
		const req = makeReq(undefined, plaintext)
		const res = makeRes()
		const next = vi.fn() as unknown as NextFunction

		await middleware(req, res as unknown as Response, next)

		expect(next).toHaveBeenCalledTimes(1)
		expect(findApiKeyByHashMock).toHaveBeenCalledWith(expectedHash)
		const r = req as Request & {userId?: string; authMethod?: string}
		expect(r.userId).toBe('user-D')
		expect(r.authMethod).toBe('bearer')
	})

	test('T10 — invalid x-api-key (PG returns null) → 401 Anthropic shape, next() NOT called', async () => {
		cacheGetMock.mockReturnValue(undefined)
		findApiKeyByHashMock.mockResolvedValue(null)

		const middleware = createBearerMiddleware(fakeLivinityd, cache)
		const plaintext = 'liv_sk_' + 'B'.repeat(32)
		const req = makeReq(undefined, plaintext)
		const res = makeRes()
		const next = vi.fn() as unknown as NextFunction

		await middleware(req, res as unknown as Response, next)

		expect(next).not.toHaveBeenCalled()
		expect(res.statusCode).toBe(401)
		expect(res._jsonBody).toEqual(ANTHROPIC_INVALID)
	})

	test('T11 — x-api-key NOT starting with liv_sk_ → fall through (third-party Anthropic key passthrough)', async () => {
		const middleware = createBearerMiddleware(fakeLivinityd, cache)
		// Real Anthropic API key shape — must be invisible to this middleware
		// so the broker can pass it straight through to upstream Anthropic.
		const req = makeReq(undefined, 'sk-ant-api03-real-anthropic-key-pretend')
		const res = makeRes()
		const next = vi.fn() as unknown as NextFunction

		await middleware(req, res as unknown as Response, next)

		expect(next).toHaveBeenCalledTimes(1)
		expect((req as Request & {userId?: string}).userId).toBeUndefined()
		expect(findApiKeyByHashMock).not.toHaveBeenCalled()
	})

	test('T12 — x-api-key takes precedence when both headers present (Anthropic spec canonical)', async () => {
		cacheGetMock.mockReturnValue(undefined)
		const apiKeyPlaintext = 'liv_sk_' + 'C'.repeat(32)
		const bearerPlaintext = 'liv_sk_' + 'D'.repeat(32)
		const expectedHash = createHash('sha256').update(apiKeyPlaintext, 'utf-8').digest('hex')
		findApiKeyByHashMock.mockResolvedValue({
			id: 'key-12',
			userId: 'user-from-apikey',
			keyPrefix: 'liv_sk_C',
			name: 'name',
			createdAt: new Date(),
			lastUsedAt: null,
			revokedAt: null,
		})

		const middleware = createBearerMiddleware(fakeLivinityd, cache)
		const req = makeReq(`Bearer ${bearerPlaintext}`, apiKeyPlaintext)
		const res = makeRes()
		const next = vi.fn() as unknown as NextFunction

		await middleware(req, res as unknown as Response, next)

		expect(next).toHaveBeenCalledTimes(1)
		// PG MUST be queried with x-api-key's hash, NOT bearer's
		expect(findApiKeyByHashMock).toHaveBeenCalledWith(expectedHash)
		const r = req as Request & {userId?: string}
		expect(r.userId).toBe('user-from-apikey')
	})

	test('T8 — defense-in-depth constant-time compare via crypto.timingSafeEqual (RESEARCH.md Pattern 2)', async () => {
		// The middleware MUST call crypto.timingSafeEqual when comparing the
		// presented-key SHA-256 against the row's key_hash (belt-and-suspenders;
		// matches the existing HMAC-sig precedent in server/index.ts:1086-1087).
		const spy = vi.spyOn(crypto, 'timingSafeEqual')

		cacheGetMock.mockReturnValue(undefined)
		const plaintext = 'liv_sk_' + 'S'.repeat(32)
		const expectedHash = createHash('sha256').update(plaintext, 'utf-8').digest('hex')
		findApiKeyByHashMock.mockResolvedValue({
			id: 'key-3',
			userId: 'user-C',
			keyHash: expectedHash, // implementation may need this for the timingSafeEqual compare
			keyPrefix: 'liv_sk_S',
			name: 'name',
			createdAt: new Date(),
			lastUsedAt: null,
			revokedAt: null,
		})

		const middleware = createBearerMiddleware(fakeLivinityd, cache)
		const req = makeReq(`Bearer ${plaintext}`)
		const res = makeRes()
		const next = vi.fn() as unknown as NextFunction

		await middleware(req, res as unknown as Response, next)

		expect(spy).toHaveBeenCalled()
		spy.mockRestore()
	})
})
