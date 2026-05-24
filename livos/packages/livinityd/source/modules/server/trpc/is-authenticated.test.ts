/**
 * Phase 203 Hot-fix F5 — is-authenticated middleware unit tests.
 *
 * Specifically covers the new X-Api-Key service-token shortcut introduced
 * by F5 so the openclaw plugin's livinityd HTTP client can authenticate
 * over loopback without holding an admin JWT.
 *
 * Coverage:
 *   F5.T1 — X-Api-Key matching process.env.LIV_API_KEY → next() invoked,
 *           ctx.currentUser populated from getAdminUser()
 *   F5.T2 — X-Api-Key mismatch → falls through to JWT path (and throws
 *           UNAUTHORIZED when no Bearer/cookie present)
 *   F5.T3 — X-Api-Key header missing → falls through to JWT path
 *   F5.T4 — LIV_API_KEY env var unset → falls through (no shortcut)
 *   F5.T5 — LIV_API_KEY shorter than 8 chars → shortcut disabled
 *           (defense-in-depth against unset/garbage env vars)
 *   F5.T6 — getAdminUser throws (legacy single-user, no DB) → swallows error,
 *           still invokes next() with currentUser undefined
 *
 * Mocks the database module so the test does not require Postgres.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

const mocks = vi.hoisted(() => ({
	findUserById: vi.fn(),
	getAdminUser: vi.fn(),
}))

vi.mock('../../database/index.js', () => ({
	findUserById: mocks.findUserById,
	getAdminUser: mocks.getAdminUser,
}))

const {isAuthenticated} = await import('./is-authenticated.js')

const ORIGINAL_LIV_API_KEY = process.env['LIV_API_KEY']

function makeCtx(opts: {
	headers?: Record<string, string | string[] | undefined>
	cookies?: Record<string, string | undefined>
	transport?: 'express' | 'ws'
	bypassAuth?: boolean
	verifyToken?: (t: string) => Promise<any>
}) {
	return {
		dangerouslyBypassAuthentication: opts.bypassAuth ?? false,
		transport: opts.transport ?? 'express',
		request: {
			headers: opts.headers ?? {},
			cookies: opts.cookies ?? {},
		},
		logger: {error: vi.fn(), info: vi.fn(), warn: vi.fn()},
		server: {
			verifyToken:
				opts.verifyToken ??
				(async () => {
					throw new Error('verifyToken not stubbed')
				}),
		},
		currentUser: undefined as any,
	} as any
}

beforeEach(() => {
	mocks.findUserById.mockReset()
	mocks.getAdminUser.mockReset()
	delete process.env['LIV_API_KEY']
})

afterEach(() => {
	if (ORIGINAL_LIV_API_KEY === undefined) {
		delete process.env['LIV_API_KEY']
	} else {
		process.env['LIV_API_KEY'] = ORIGINAL_LIV_API_KEY
	}
})

describe('isAuthenticated — Phase 203 Hot-fix F5 service-token shortcut', () => {
	test('F5.T1 — matching X-Api-Key maps to admin and calls next()', async () => {
		process.env['LIV_API_KEY'] = 'liv_k_lF6WvENQcoYRTaoJhWWU'
		mocks.getAdminUser.mockResolvedValue({
			id: 'admin-id',
			username: 'admin',
			role: 'admin',
		})
		const ctx = makeCtx({
			headers: {'x-api-key': 'liv_k_lF6WvENQcoYRTaoJhWWU'},
		})
		const next = vi.fn(async () => 'NEXT_CALLED')
		const result = await isAuthenticated({ctx, next})
		expect(next).toHaveBeenCalledOnce()
		expect(result).toBe('NEXT_CALLED')
		expect(ctx.currentUser).toEqual({
			id: 'admin-id',
			username: 'admin',
			role: 'admin',
		})
	})

	test('F5.T2 — mismatched X-Api-Key falls through (throws UNAUTHORIZED here, no Bearer)', async () => {
		process.env['LIV_API_KEY'] = 'liv_k_lF6WvENQcoYRTaoJhWWU'
		const ctx = makeCtx({
			headers: {'x-api-key': 'wrong-key-of-same-length-xx'},
		})
		const next = vi.fn()
		await expect(isAuthenticated({ctx, next})).rejects.toThrow(/Invalid token/)
		expect(next).not.toHaveBeenCalled()
	})

	test('F5.T3 — missing X-Api-Key falls through to JWT path', async () => {
		process.env['LIV_API_KEY'] = 'liv_k_lF6WvENQcoYRTaoJhWWU'
		const ctx = makeCtx({headers: {}})
		const next = vi.fn()
		await expect(isAuthenticated({ctx, next})).rejects.toThrow(/Invalid token/)
		expect(next).not.toHaveBeenCalled()
	})

	test('F5.T4 — unset LIV_API_KEY disables the shortcut', async () => {
		// beforeEach deleted process.env.LIV_API_KEY.
		const ctx = makeCtx({
			headers: {'x-api-key': 'any-value-at-all-here'},
		})
		const next = vi.fn()
		await expect(isAuthenticated({ctx, next})).rejects.toThrow(/Invalid token/)
		expect(next).not.toHaveBeenCalled()
	})

	test('F5.T5 — LIV_API_KEY shorter than 8 chars disables the shortcut', async () => {
		process.env['LIV_API_KEY'] = 'short'
		const ctx = makeCtx({
			headers: {'x-api-key': 'short'},
		})
		const next = vi.fn()
		await expect(isAuthenticated({ctx, next})).rejects.toThrow(/Invalid token/)
		expect(next).not.toHaveBeenCalled()
	})

	test('F5.T6 — getAdminUser throwing still lets next() run (legacy single-user)', async () => {
		process.env['LIV_API_KEY'] = 'liv_k_lF6WvENQcoYRTaoJhWWU'
		mocks.getAdminUser.mockRejectedValue(new Error('DB not initialised'))
		const ctx = makeCtx({
			headers: {'x-api-key': 'liv_k_lF6WvENQcoYRTaoJhWWU'},
		})
		const next = vi.fn(async () => 'OK')
		const result = await isAuthenticated({ctx, next})
		expect(next).toHaveBeenCalledOnce()
		expect(result).toBe('OK')
		expect(ctx.currentUser).toBeUndefined()
	})
})
