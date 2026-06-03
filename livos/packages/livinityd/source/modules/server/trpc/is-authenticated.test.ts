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
	getPool: vi.fn(),
	isSessionRevoked: vi.fn(),
}))

vi.mock('../../database/index.js', () => ({
	findUserById: mocks.findUserById,
	getAdminUser: mocks.getAdminUser,
	getPool: mocks.getPool,
}))

// Phase 257-04 WS-A — sessions DAO (jti revocation lookup, fail-open).
vi.mock('../../database/sessions.js', () => ({
	isSessionRevoked: mocks.isSessionRevoked,
}))

const {isAuthenticated, requireRole} = await import('./is-authenticated.js')

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
	mocks.getPool.mockReset()
	mocks.isSessionRevoked.mockReset()
	// Defaults: a DB pool exists and sessions are NOT revoked unless a test overrides
	// (fail-open: missing/unrevoked → allow). This keeps the 256-04 fail-closed tests
	// (which carry no jti) unaffected — the jti gate only fires when payload.jti is present.
	mocks.getPool.mockReturnValue({} as any)
	mocks.isSessionRevoked.mockResolvedValue(false)
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

// ─── Phase 256-04 WS-D — Auth fail-closed (LIVOS-004 / fix E / SC6+SC7) ──────
describe('isAuthenticated — Phase 256-04 WS-D fail-closed (LIVOS-004)', () => {
	const VALID_KEY = 'liv_k_256D_serviceToken_xxxxx'

	test('WS-D.T1 — inactive user JWT THROWS UNAUTHORIZED (not promoted to admin)', async () => {
		mocks.findUserById.mockResolvedValue({
			id: 'guest-id',
			username: 'guest',
			role: 'guest',
			isActive: false,
		})
		const ctx = makeCtx({
			cookies: {LIVINITY_SESSION: 'tok'},
			verifyToken: async () => ({userId: 'guest-id', role: 'guest'}),
		})
		const next = vi.fn()
		await expect(isAuthenticated({ctx, next})).rejects.toThrow(/inactive or not found/i)
		expect(next).not.toHaveBeenCalled()
		expect(ctx.currentUser).toBeUndefined()
	})

	test('WS-D.T2 — missing (deleted) user JWT THROWS UNAUTHORIZED', async () => {
		mocks.findUserById.mockResolvedValue(null)
		const ctx = makeCtx({
			cookies: {LIVINITY_SESSION: 'tok'},
			verifyToken: async () => ({userId: 'ghost-id'}),
		})
		const next = vi.fn()
		await expect(isAuthenticated({ctx, next})).rejects.toThrow(/inactive or not found/i)
		expect(next).not.toHaveBeenCalled()
		expect(ctx.currentUser).toBeUndefined()
	})

	test('WS-D.T3 — active member JWT passes with role member', async () => {
		mocks.findUserById.mockResolvedValue({
			id: 'm-id',
			username: 'mary',
			role: 'member',
			isActive: true,
		})
		const ctx = makeCtx({
			cookies: {LIVINITY_SESSION: 'tok'},
			verifyToken: async () => ({userId: 'm-id', role: 'member'}),
		})
		const next = vi.fn(async () => 'OK')
		const result = await isAuthenticated({ctx, next})
		expect(next).toHaveBeenCalledOnce()
		expect(result).toBe('OK')
		expect(ctx.currentUser).toEqual({id: 'm-id', username: 'mary', role: 'member'})
	})

	test('WS-D.T4 — legacy single-user JWT (no userId) maps to admin (unchanged)', async () => {
		mocks.getAdminUser.mockResolvedValue({
			id: 'admin-id',
			username: 'admin',
			role: 'admin',
		})
		const ctx = makeCtx({
			cookies: {LIVINITY_SESSION: 'tok'},
			verifyToken: async () => ({loggedIn: true}),
		})
		const next = vi.fn(async () => 'OK')
		const result = await isAuthenticated({ctx, next})
		expect(next).toHaveBeenCalledOnce()
		expect(result).toBe('OK')
		expect(ctx.currentUser).toEqual({id: 'admin-id', username: 'admin', role: 'admin'})
	})

	test('WS-D.T4b — legacy JWT (no userId) + no DB admin sets legacySingleUser flag', async () => {
		mocks.getAdminUser.mockResolvedValue(undefined)
		const ctx = makeCtx({
			cookies: {LIVINITY_SESSION: 'tok'},
			verifyToken: async () => ({loggedIn: true}),
		})
		const next = vi.fn(async () => 'OK')
		await isAuthenticated({ctx, next})
		expect(next).toHaveBeenCalledOnce()
		expect(ctx.currentUser).toBeUndefined()
		expect(ctx.legacySingleUser).toBe(true)
	})

	test('WS-D.T5 — requireRole: absent currentUser without legacy flag → FORBIDDEN', async () => {
		const ctx = {currentUser: undefined, legacySingleUser: undefined} as any
		const next = vi.fn()
		await expect(requireRole('admin')({ctx, next})).rejects.toThrow(/Authentication required/i)
		expect(next).not.toHaveBeenCalled()
	})

	test('WS-D.T5b — requireRole: absent currentUser WITH legacySingleUser flag → next()', async () => {
		const ctx = {currentUser: undefined, legacySingleUser: true} as any
		const next = vi.fn(async () => 'OK')
		const result = await requireRole('admin')({ctx, next})
		expect(next).toHaveBeenCalledOnce()
		expect(result).toBe('OK')
	})

	test('WS-D.T6 — service-token no-DB path sets legacySingleUser, downstream requireRole admin PASSES (fix E)', async () => {
		process.env['LIV_API_KEY'] = VALID_KEY
		mocks.getAdminUser.mockRejectedValue(new Error('no DB'))
		const ctx = makeCtx({headers: {'x-api-key': VALID_KEY}})
		const next = vi.fn(async () => 'NEXT')
		await isAuthenticated({ctx, next})
		expect(ctx.currentUser).toBeUndefined()
		expect(ctx.legacySingleUser).toBe(true)
		// downstream requireRole must NOT regress to FORBIDDEN
		const next2 = vi.fn(async () => 'ADMIN_OK')
		const result = await requireRole('admin')({ctx, next: next2})
		expect(next2).toHaveBeenCalledOnce()
		expect(result).toBe('ADMIN_OK')
	})

	test('WS-D.T7 — service-token WITH DB → currentUser admin, next()', async () => {
		process.env['LIV_API_KEY'] = VALID_KEY
		mocks.getAdminUser.mockResolvedValue({id: 'admin-id', username: 'admin', role: 'admin'})
		const ctx = makeCtx({headers: {'x-api-key': VALID_KEY}})
		const next = vi.fn(async () => 'OK')
		const result = await isAuthenticated({ctx, next})
		expect(next).toHaveBeenCalledOnce()
		expect(result).toBe('OK')
		expect(ctx.currentUser).toEqual({id: 'admin-id', username: 'admin', role: 'admin'})
	})
})

// ─── Phase 257-04 WS-A — jti revocation (LIVOS-005) ─────────────────────────
describe('isAuthenticated — Phase 257-04 WS-A jti revocation (LIVOS-005)', () => {
	test('WS-A.T3 — active user but REVOKED jti THROWS UNAUTHORIZED (Session revoked)', async () => {
		mocks.findUserById.mockResolvedValue({
			id: 'm-id',
			username: 'mary',
			role: 'member',
			isActive: true,
		})
		mocks.getPool.mockReturnValue({} as any)
		mocks.isSessionRevoked.mockResolvedValue(true) // explicitly revoked
		const ctx = makeCtx({
			cookies: {LIVINITY_SESSION: 'tok'},
			verifyToken: async () => ({userId: 'm-id', role: 'member', jti: 'jti-revoked'}),
		})
		const next = vi.fn()
		await expect(isAuthenticated({ctx, next})).rejects.toThrow(/session revoked/i)
		expect(next).not.toHaveBeenCalled()
		expect(ctx.currentUser).toBeUndefined()
		expect(mocks.isSessionRevoked).toHaveBeenCalledWith('jti-revoked')
	})

	test('WS-A.T4 — active user with jti but NO revoked row (missing/unrevoked) PASSES — fail-open, no lockout', async () => {
		mocks.findUserById.mockResolvedValue({
			id: 'm-id',
			username: 'mary',
			role: 'member',
			isActive: true,
		})
		mocks.getPool.mockReturnValue({} as any)
		mocks.isSessionRevoked.mockResolvedValue(false) // missing row → NOT revoked → allow
		const ctx = makeCtx({
			cookies: {LIVINITY_SESSION: 'tok'},
			verifyToken: async () => ({userId: 'm-id', role: 'member', jti: 'jti-live'}),
		})
		const next = vi.fn(async () => 'OK')
		const result = await isAuthenticated({ctx, next})
		expect(result).toBe('OK')
		expect(next).toHaveBeenCalledOnce()
		expect(ctx.currentUser).toEqual({id: 'm-id', username: 'mary', role: 'member'})
	})

	test('WS-A.T5 — userId token with NO jti (legacy/pre-migration) is NOT subject to the jti check', async () => {
		mocks.findUserById.mockResolvedValue({
			id: 'm-id',
			username: 'mary',
			role: 'member',
			isActive: true,
		})
		mocks.getPool.mockReturnValue({} as any)
		// isSessionActive would return false, but it must NEVER be consulted
		// for a token that carries no jti (back-compat for tokens minted before
		// this phase).
		mocks.isSessionRevoked.mockResolvedValue(false)
		const ctx = makeCtx({
			cookies: {LIVINITY_SESSION: 'tok'},
			verifyToken: async () => ({userId: 'm-id', role: 'member'}), // no jti
		})
		const next = vi.fn(async () => 'OK')
		const result = await isAuthenticated({ctx, next})
		expect(result).toBe('OK')
		expect(next).toHaveBeenCalledOnce()
		expect(mocks.isSessionRevoked).not.toHaveBeenCalled()
	})

	test('WS-A.T6 — DB-absent (getPool null) SKIPS the jti check (single-user not broken)', async () => {
		mocks.findUserById.mockResolvedValue({
			id: 'm-id',
			username: 'mary',
			role: 'member',
			isActive: true,
		})
		mocks.getPool.mockReturnValue(null as any) // no DB / pure legacy
		mocks.isSessionRevoked.mockResolvedValue(false)
		const ctx = makeCtx({
			cookies: {LIVINITY_SESSION: 'tok'},
			verifyToken: async () => ({userId: 'm-id', role: 'member', jti: 'jti-whatever'}),
		})
		const next = vi.fn(async () => 'OK')
		const result = await isAuthenticated({ctx, next})
		expect(result).toBe('OK')
		expect(next).toHaveBeenCalledOnce()
		expect(mocks.isSessionRevoked).not.toHaveBeenCalled()
	})

	test('WS-A.T7 — service-token (X-Api-Key) path is NOT subject to the jti check (no user JWT)', async () => {
		const KEY = 'liv_k_257A_serviceToken_xxxxx'
		process.env['LIV_API_KEY'] = KEY
		mocks.getAdminUser.mockResolvedValue({id: 'admin-id', username: 'admin', role: 'admin'})
		const ctx = makeCtx({headers: {'x-api-key': KEY}})
		const next = vi.fn(async () => 'OK')
		const result = await isAuthenticated({ctx, next})
		expect(result).toBe('OK')
		expect(next).toHaveBeenCalledOnce()
		expect(mocks.isSessionRevoked).not.toHaveBeenCalled()
	})
})
