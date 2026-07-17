/**
 * Phase 335 (ROLE-01) — adminScopes.* route tests.
 *
 * Pins: grant/revoke/list are ADMIN-ONLY (a scope-holder cannot mint scopes —
 * no self-escalation); granting to an admin is rejected; `my` returns only the
 * caller's own grants.
 */
import {describe, expect, test, vi, beforeEach} from 'vitest'
import {TRPCError} from '@trpc/server'

vi.mock('../database/index.js', () => ({
	findUserById: vi.fn(),
	getPool: vi.fn(() => ({})),
}))
vi.mock('../database/admin-grants.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../database/admin-grants.js')>()
	return {
		...actual,
		grantAdminScope: vi.fn(),
		revokeAdminScope: vi.fn(),
		listAllAdminScopes: vi.fn(),
		listAdminScopesForUser: vi.fn(),
		// scope-guard consumes hasAdminScope on the same module — mocked so the
		// scoped procedures in other routers never hit a real pool from here.
		hasAdminScope: vi.fn().mockResolvedValue(false),
	}
})

import {findUserById, getPool} from '../database/index.js'
import {grantAdminScope, revokeAdminScope, listAdminScopesForUser} from '../database/admin-grants.js'

import adminScopesRouter from './admin-scopes-routes.js'
import {t} from '../server/trpc/trpc.js'

const createCaller = t.createCallerFactory(adminScopesRouter)

function makeCtx(opts: {role?: 'admin' | 'member'; user?: null} = {}) {
	return {
		dangerouslyBypassAuthentication: true,
		transport: 'http',
		currentUser: opts.user === null ? undefined : {id: 'admin-1', username: 'boss', role: opts.role ?? 'admin'},
		logger: {log() {}, error() {}, verbose() {}},
	} as never
}

beforeEach(() => {
	vi.mocked(findUserById).mockReset()
	vi.mocked(grantAdminScope).mockReset()
	vi.mocked(revokeAdminScope).mockReset()
	vi.mocked(listAdminScopesForUser).mockReset()
	vi.mocked(getPool).mockReturnValue({} as never)
})

const TARGET = '11111111-1111-1111-1111-111111111111'

describe('adminScopes — admin-only management (no self-escalation)', () => {
	test('a member CANNOT grant a scope (FORBIDDEN before any DAO call)', async () => {
		const caller = createCaller(makeCtx({role: 'member'}))
		await expect(caller.grant({userId: TARGET, scope: 'share-admin'})).rejects.toBeInstanceOf(TRPCError)
		expect(grantAdminScope).not.toHaveBeenCalled()
	})

	test('a member cannot list or revoke either', async () => {
		const caller = createCaller(makeCtx({role: 'member'}))
		await expect(caller.list()).rejects.toBeInstanceOf(TRPCError)
		await expect(caller.revoke({userId: TARGET, scope: 'share-admin'})).rejects.toBeInstanceOf(TRPCError)
	})

	test('admin grants a scope to a member', async () => {
		vi.mocked(findUserById).mockResolvedValue({id: TARGET, role: 'member'} as never)
		const caller = createCaller(makeCtx())
		await expect(caller.grant({userId: TARGET, scope: 'read-only-admin'})).resolves.toEqual({success: true})
		expect(grantAdminScope).toHaveBeenCalledWith({userId: TARGET, scope: 'read-only-admin', grantedBy: 'admin-1'})
	})

	test('granting to an ADMIN is rejected (they already hold every scope)', async () => {
		vi.mocked(findUserById).mockResolvedValue({id: TARGET, role: 'admin'} as never)
		const caller = createCaller(makeCtx())
		await expect(caller.grant({userId: TARGET, scope: 'share-admin'})).rejects.toMatchObject({code: 'BAD_REQUEST'})
		expect(grantAdminScope).not.toHaveBeenCalled()
	})

	test('unknown target user → NOT_FOUND; unknown scope → zod rejection', async () => {
		vi.mocked(findUserById).mockResolvedValue(null as never)
		const caller = createCaller(makeCtx())
		await expect(caller.grant({userId: TARGET, scope: 'share-admin'})).rejects.toMatchObject({code: 'NOT_FOUND'})
		await expect(caller.grant({userId: TARGET, scope: 'root' as never})).rejects.toBeInstanceOf(TRPCError)
	})

	test('revoke: hit → success, miss → NOT_FOUND', async () => {
		vi.mocked(revokeAdminScope).mockResolvedValueOnce(true).mockResolvedValueOnce(false)
		const caller = createCaller(makeCtx())
		await expect(caller.revoke({userId: TARGET, scope: 'share-admin'})).resolves.toEqual({success: true})
		await expect(caller.revoke({userId: TARGET, scope: 'share-admin'})).rejects.toMatchObject({code: 'NOT_FOUND'})
	})

	test("my returns the CALLER's own scopes", async () => {
		vi.mocked(listAdminScopesForUser).mockResolvedValue(['share-admin'] as never)
		const caller = createCaller(makeCtx({role: 'member'}))
		await expect(caller.my()).resolves.toEqual(['share-admin'])
		expect(listAdminScopesForUser).toHaveBeenCalledWith('admin-1')
	})
})
