/**
 * Phase 335 (ROLE-01/02, D-335-2/4) — scope-guard matrix tests + the
 * requireRole unknown-role fail-open regression (explorer finding).
 *
 * RBAC matrix (all FAIL-CLOSED):
 *   admin → passes every scope/operator gate (no DAO call needed)
 *   legacySingleUser → passes (admin-equivalent, requireRole parity)
 *   member + scope row → passes; member without → FORBIDDEN
 *   scope A holder vs scope B gate → FORBIDDEN (no cross-scope bleed)
 *   operator of app A vs app B → FORBIDDEN (app-keyed)
 *   DB error → FORBIDDEN (never fail open)
 */
import {describe, expect, test, vi, beforeEach} from 'vitest'
import {TRPCError} from '@trpc/server'

vi.mock('../../database/admin-grants.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../database/admin-grants.js')>()
	return {...actual, hasAdminScope: vi.fn(), isAppOperator: vi.fn()}
})

import {hasAdminScope, isAppOperator} from '../../database/admin-grants.js'
import {assertAdminScope, requireScope, assertAppOperatorAccess, isOperatorOrAdmin} from './scope-guard.js'
import {requireRole} from './is-authenticated.js'

function makeCtx(opts: {role?: string; user?: null; legacy?: boolean} = {}) {
	return {
		currentUser: opts.user === null ? undefined : {id: 'user-A', username: 'alice', role: opts.role ?? 'member'},
		legacySingleUser: opts.legacy,
	} as never
}

beforeEach(() => {
	vi.mocked(hasAdminScope).mockReset()
	vi.mocked(isAppOperator).mockReset()
})

describe('assertAdminScope', () => {
	test('full admin passes WITHOUT consulting the grants table', async () => {
		await expect(assertAdminScope(makeCtx({role: 'admin'}), 'share-admin')).resolves.toBeUndefined()
		expect(hasAdminScope).not.toHaveBeenCalled()
	})

	test('legacySingleUser passes (admin-equivalent, requireRole parity)', async () => {
		await expect(assertAdminScope(makeCtx({user: null, legacy: true}), 'share-admin')).resolves.toBeUndefined()
	})

	test('no currentUser + no legacy flag → FORBIDDEN', async () => {
		await expect(assertAdminScope(makeCtx({user: null}), 'share-admin')).rejects.toMatchObject({code: 'FORBIDDEN'})
	})

	test('member holding the scope passes', async () => {
		vi.mocked(hasAdminScope).mockResolvedValue(true)
		await expect(assertAdminScope(makeCtx(), 'read-only-admin')).resolves.toBeUndefined()
		expect(hasAdminScope).toHaveBeenCalledWith('user-A', 'read-only-admin')
	})

	test('member WITHOUT the scope → FORBIDDEN naming the scope', async () => {
		vi.mocked(hasAdminScope).mockResolvedValue(false)
		await expect(assertAdminScope(makeCtx(), 'share-admin')).rejects.toMatchObject({
			code: 'FORBIDDEN',
			message: expect.stringContaining('share-admin'),
		})
	})

	test('DB error → FORBIDDEN (fail closed, never open)', async () => {
		vi.mocked(hasAdminScope).mockRejectedValue(new Error('pg down'))
		await expect(assertAdminScope(makeCtx(), 'share-admin')).rejects.toMatchObject({code: 'FORBIDDEN'})
	})

	test('no cross-scope bleed: the gate consults ITS scope, not any scope', async () => {
		vi.mocked(hasAdminScope).mockImplementation(async (_u, scope) => scope === 'read-only-admin')
		await expect(assertAdminScope(makeCtx(), 'share-admin')).rejects.toMatchObject({code: 'FORBIDDEN'})
		await expect(assertAdminScope(makeCtx(), 'read-only-admin')).resolves.toBeUndefined()
	})
})

describe('requireScope middleware', () => {
	test('scope held → next() runs and its result returns', async () => {
		vi.mocked(hasAdminScope).mockResolvedValue(true)
		const next = vi.fn().mockResolvedValue('result')
		await expect(requireScope('share-admin')({ctx: makeCtx(), next})).resolves.toBe('result')
		expect(next).toHaveBeenCalledTimes(1)
	})

	test('scope missing → FORBIDDEN and next() NEVER runs', async () => {
		vi.mocked(hasAdminScope).mockResolvedValue(false)
		const next = vi.fn()
		await expect(requireScope('share-admin')({ctx: makeCtx(), next})).rejects.toBeInstanceOf(TRPCError)
		expect(next).not.toHaveBeenCalled()
	})
})

describe('assertAppOperatorAccess / isOperatorOrAdmin', () => {
	test('admin passes without a DAO call; operator of THIS app passes', async () => {
		await expect(assertAppOperatorAccess(makeCtx({role: 'admin'}), 'n8n')).resolves.toBeUndefined()
		expect(isAppOperator).not.toHaveBeenCalled()
		vi.mocked(isAppOperator).mockResolvedValue(true)
		await expect(assertAppOperatorAccess(makeCtx(), 'n8n')).resolves.toBeUndefined()
		expect(isAppOperator).toHaveBeenCalledWith('n8n', 'user-A')
	})

	test('operator of app A holds NOTHING for app B (app-keyed)', async () => {
		vi.mocked(isAppOperator).mockImplementation(async (appId) => appId === 'app-A')
		await expect(assertAppOperatorAccess(makeCtx(), 'app-B')).rejects.toMatchObject({code: 'FORBIDDEN'})
		await expect(isOperatorOrAdmin(makeCtx(), 'app-B')).resolves.toBe(false)
		await expect(isOperatorOrAdmin(makeCtx(), 'app-A')).resolves.toBe(true)
	})

	test('DB error → FORBIDDEN / false (fail closed)', async () => {
		vi.mocked(isAppOperator).mockRejectedValue(new Error('pg down'))
		await expect(assertAppOperatorAccess(makeCtx(), 'n8n')).rejects.toMatchObject({code: 'FORBIDDEN'})
		await expect(isOperatorOrAdmin(makeCtx(), 'n8n')).resolves.toBe(false)
	})

	test('isOperatorOrAdmin: legacy true, anonymous false', async () => {
		await expect(isOperatorOrAdmin(makeCtx({user: null, legacy: true}), 'n8n')).resolves.toBe(true)
		await expect(isOperatorOrAdmin(makeCtx({user: null}), 'n8n')).resolves.toBe(false)
	})
})

describe('requireRole — Phase 335 unknown-role fail-open REGRESSION fix', () => {
	test('an unrecognized role string fails EVERY gate (was: passed level-0 gates)', async () => {
		const next = vi.fn()
		await expect(requireRole('guest')({ctx: makeCtx({role: 'weird-future-role'}), next} as never)).rejects.toMatchObject({
			code: 'FORBIDDEN',
		})
		expect(next).not.toHaveBeenCalled()
	})

	test('known roles keep their ladder (member passes guest gate, guest fails member gate)', async () => {
		const next = vi.fn().mockResolvedValue('ok')
		await expect(requireRole('guest')({ctx: makeCtx({role: 'member'}), next} as never)).resolves.toBe('ok')
		await expect(requireRole('member')({ctx: makeCtx({role: 'guest'}), next} as never)).rejects.toMatchObject({
			code: 'FORBIDDEN',
		})
	})
})
