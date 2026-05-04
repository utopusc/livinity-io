/**
 * Phase 74 Plan 04 (F5 identity preservation) — integration tests for the
 * cache-aside wrapper around `resolveAndAuthorizeUserId` in `auth.ts`.
 *
 * Coverage (per <reference_test_cases> auth-int-1..auth-int-4):
 *   - auth-int-1: two consecutive calls with same `(userId, conversationId)`
 *     hit cache; `findUserById` mock count === 1.
 *   - auth-int-2: 404 path — `findUserById` returns null; cache size remains 0
 *     (failed lookups never enter the cache).
 *   - auth-int-3: 403 path — single-user mode + non-admin userId; response 403;
 *     cache size remains 0.
 *   - auth-int-4: Bearer short-circuit unaffected — `req.authMethod='bearer'`,
 *     `req.userId` set; cache.size === 0 (no read, no write); function returns
 *     `{userId: req.userId}`.
 *
 * Mocking strategy (mirrors `passthrough-handler.test.ts` precedent at line 94):
 *   - `vi.mock('../database/index.js', ...)` — stub `findUserById` + `getAdminUser`
 *   - `vi.mock('../ai/per-user-claude.js', ...)` — stub `isMultiUserMode`
 */

import {describe, it, expect, beforeEach, vi} from 'vitest'
import type {Request, Response} from 'express'
import {resolveAndAuthorizeUserId} from './auth.js'
import {identityCache} from './identity-cache.js'
import {findUserById, getAdminUser} from '../database/index.js'
import {isMultiUserMode} from '../ai/per-user-claude.js'

vi.mock('../database/index.js', () => ({
	findUserById: vi.fn(),
	getAdminUser: vi.fn(),
}))

vi.mock('../ai/per-user-claude.js', () => ({
	isMultiUserMode: vi.fn(),
}))

const findUserByIdMock = findUserById as unknown as ReturnType<typeof vi.fn>
const getAdminUserMock = getAdminUser as unknown as ReturnType<typeof vi.fn>
const isMultiUserModeMock = isMultiUserMode as unknown as ReturnType<typeof vi.fn>

function makeReq(opts: {
	userId: string
	conversationId?: string
	authMethod?: string
	bearerUserId?: string
}): Request {
	const headers: Record<string, string> = {}
	if (opts.conversationId) headers['x-liv-conversation-id'] = opts.conversationId
	const req: any = {
		params: {userId: opts.userId},
		headers,
		authMethod: opts.authMethod,
		userId: opts.bearerUserId,
	}
	return req as Request
}

function makeRes(): {res: Response; statusCode: () => number | undefined; jsonBody: () => unknown} {
	let statusCode: number | undefined
	let jsonBody: unknown
	const res: any = {
		status(code: number) {
			statusCode = code
			return this
		},
		json(body: unknown) {
			jsonBody = body
			return this
		},
	}
	return {
		res: res as Response,
		statusCode: () => statusCode,
		jsonBody: () => jsonBody,
	}
}

const fakeLivinityd: any = {}

describe('resolveAndAuthorizeUserId — F5 cache integration', () => {
	beforeEach(() => {
		identityCache._resetForTest()
		findUserByIdMock.mockReset()
		getAdminUserMock.mockReset()
		isMultiUserModeMock.mockReset()
	})

	it('auth-int-1: cache hit on second call skips findUserById', async () => {
		// Multi-user mode ON, user exists
		isMultiUserModeMock.mockResolvedValue(true)
		findUserByIdMock.mockResolvedValue({id: 'u1', username: 'u1'})

		const req1 = makeReq({userId: 'u1', conversationId: 'conv-A'})
		const {res: res1} = makeRes()
		const r1 = await resolveAndAuthorizeUserId(req1, res1, fakeLivinityd)
		expect(r1).toEqual({userId: 'u1'})

		const req2 = makeReq({userId: 'u1', conversationId: 'conv-A'})
		const {res: res2} = makeRes()
		const r2 = await resolveAndAuthorizeUserId(req2, res2, fakeLivinityd)
		expect(r2).toEqual({userId: 'u1'})

		// Critical assertion: PG was hit only ONCE across both calls.
		expect(findUserByIdMock).toHaveBeenCalledTimes(1)
	})

	it('auth-int-2: 404 path does NOT cache the failed lookup', async () => {
		isMultiUserModeMock.mockResolvedValue(true)
		findUserByIdMock.mockResolvedValue(null)

		const req = makeReq({userId: 'ghost', conversationId: 'conv-X'})
		const {res, statusCode} = makeRes()
		const result = await resolveAndAuthorizeUserId(req, res, fakeLivinityd)

		expect(result).toBeUndefined()
		expect(statusCode()).toBe(404)
		// Failed lookup MUST NOT enter the cache
		expect(identityCache.size()).toBe(0)
	})

	it('auth-int-3: 403 path (single-user, non-admin) does NOT cache', async () => {
		isMultiUserModeMock.mockResolvedValue(false) // single-user mode
		findUserByIdMock.mockResolvedValue({id: 'u-other', username: 'u-other'})
		getAdminUserMock.mockResolvedValue({id: 'admin', username: 'admin'})

		const req = makeReq({userId: 'u-other', conversationId: 'conv-X'})
		const {res, statusCode} = makeRes()
		const result = await resolveAndAuthorizeUserId(req, res, fakeLivinityd)

		expect(result).toBeUndefined()
		expect(statusCode()).toBe(403)
		expect(identityCache.size()).toBe(0)
	})

	it('auth-int-4: Bearer short-circuit unaffected — no cache read, no cache write', async () => {
		// Bearer path bypasses everything. No mocks should be called.
		const req = makeReq({
			userId: 'urlPathUser',
			conversationId: 'conv-A',
			authMethod: 'bearer',
			bearerUserId: 'u-bearer',
		})
		const {res} = makeRes()
		const result = await resolveAndAuthorizeUserId(req, res, fakeLivinityd)

		expect(result).toEqual({userId: 'u-bearer'})
		expect(identityCache.size()).toBe(0)
		expect(findUserByIdMock).not.toHaveBeenCalled()
		expect(getAdminUserMock).not.toHaveBeenCalled()
		expect(isMultiUserModeMock).not.toHaveBeenCalled()
	})

	it('auth-int-5 (bonus): per-user isolation — same conversationId, different userIds → distinct cache slots', async () => {
		isMultiUserModeMock.mockResolvedValue(true)
		findUserByIdMock.mockImplementation(async (id: string) => ({id, username: id}))

		// User 1, conv-shared
		const req1 = makeReq({userId: 'u1', conversationId: 'conv-shared'})
		const {res: res1} = makeRes()
		const r1 = await resolveAndAuthorizeUserId(req1, res1, fakeLivinityd)
		expect(r1).toEqual({userId: 'u1'})

		// User 2, SAME conversationId — must NOT hit u1's cache slot.
		const req2 = makeReq({userId: 'u2', conversationId: 'conv-shared'})
		const {res: res2} = makeRes()
		const r2 = await resolveAndAuthorizeUserId(req2, res2, fakeLivinityd)
		expect(r2).toEqual({userId: 'u2'})

		// Both calls hit PG (no cross-user cache pollution).
		expect(findUserByIdMock).toHaveBeenCalledTimes(2)
		expect(identityCache.size()).toBe(2)

		// Now warm hit: same (u1, conv-shared) on third call → no new PG lookup
		const req3 = makeReq({userId: 'u1', conversationId: 'conv-shared'})
		const {res: res3} = makeRes()
		const r3 = await resolveAndAuthorizeUserId(req3, res3, fakeLivinityd)
		expect(r3).toEqual({userId: 'u1'})
		expect(findUserByIdMock).toHaveBeenCalledTimes(2) // unchanged
	})

	it('auth-int-6 (bonus): 400 path (invalid userId regex) does NOT cache', async () => {
		const req = makeReq({userId: 'has spaces!', conversationId: 'conv-X'})
		const {res, statusCode} = makeRes()
		const result = await resolveAndAuthorizeUserId(req, res, fakeLivinityd)

		expect(result).toBeUndefined()
		expect(statusCode()).toBe(400)
		expect(identityCache.size()).toBe(0)
		// Regex check happens BEFORE PG; lookup never invoked.
		expect(findUserByIdMock).not.toHaveBeenCalled()
	})
})
