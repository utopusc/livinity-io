/**
 * Phase 335 review (CRITICAL-1/Finding-1/3) — share-admin DELEGATE bound on
 * apps.shareApp. A delegate (member holding share-admin, NOT effective-full)
 * may share, but:
 *   - can grant at most 'readonly' (never 'full' — full ⊇ uninstall/lifecycle)
 *   - can never grant to THEMSELVES
 *   - an admin / effective-full holder is unrestricted (pre-335 behavior)
 */
import {describe, expect, test, vi, beforeEach} from 'vitest'
import {TRPCError} from '@trpc/server'

vi.mock('../database/index.js', () => ({
	getUserAppInstance: vi.fn(),
	grantAppAccess: vi.fn(),
	revokeAppAccess: vi.fn(),
	listAppAccessUsers: vi.fn(),
	hasAppAccess: vi.fn(),
	listUsers: vi.fn(),
	listUserAppInstances: vi.fn(),
	getPool: vi.fn(),
}))
vi.mock('./app-access.js', () => ({
	getEffectiveAppAccess: vi.fn().mockResolvedValue('none'),
	grantAppAccessToGroup: vi.fn(),
	revokeAppAccessFromGroup: vi.fn(),
	listAppAccessPrincipals: vi.fn(),
	groupHoldsFullAppAccess: vi.fn().mockResolvedValue(false),
}))
vi.mock('../database/admin-grants.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../database/admin-grants.js')>()
	return {...actual, hasAdminScope: vi.fn().mockResolvedValue(false), isAppOperator: vi.fn().mockResolvedValue(false)}
})
vi.mock('../security-audit/events.js', () => ({recordAdminActionEvent: vi.fn()}))

import {grantAppAccess} from '../database/index.js'
import {getEffectiveAppAccess} from './app-access.js'
import {hasAdminScope} from '../database/admin-grants.js'
import {recordAdminActionEvent} from '../security-audit/events.js'

import {apps as appsRouter} from './routes.js'
import {t} from '../server/trpc/trpc.js'

const createCaller = t.createCallerFactory(appsRouter)
const SELF = 'user-A'
const OTHER = '55555555-5555-5555-5555-555555555555'

function makeCtx(role: 'admin' | 'member' = 'member') {
	return {
		dangerouslyBypassAuthentication: true,
		transport: 'http',
		currentUser: {id: SELF, username: 'alice', role},
		apps: {logger: {log() {}, error() {}, verbose() {}}},
		logger: {log() {}, error() {}, verbose() {}},
	} as never
}

beforeEach(() => {
	vi.mocked(grantAppAccess).mockReset()
	vi.mocked(getEffectiveAppAccess).mockReset().mockResolvedValue('none' as never)
	vi.mocked(hasAdminScope).mockReset().mockResolvedValue(false)
	vi.mocked(recordAdminActionEvent).mockReset()
})

describe('apps.shareApp — Phase 335 share-admin delegate bound', () => {
	test('a plain member (no scope, not full) cannot share at all', async () => {
		const caller = createCaller(makeCtx())
		await expect(
			caller.shareApp({appId: 'n8n', principalId: OTHER, accessType: 'readonly'}),
		).rejects.toMatchObject({code: 'FORBIDDEN', message: 'Read-only access'})
		expect(grantAppAccess).not.toHaveBeenCalled()
	})

	test('share-admin delegate: readonly to ANOTHER user succeeds + is audited', async () => {
		vi.mocked(hasAdminScope).mockImplementation(async (_u, s) => s === 'share-admin')
		const caller = createCaller(makeCtx())
		await expect(caller.shareApp({appId: 'n8n', principalId: OTHER, accessType: 'readonly'})).resolves.toEqual({
			success: true,
		})
		expect(grantAppAccess).toHaveBeenCalledWith(OTHER, 'n8n', SELF, 'readonly')
		expect(recordAdminActionEvent).toHaveBeenCalledWith(
			expect.objectContaining({userId: SELF, action: 'apps.shareApp', success: true}),
		)
	})

	test('share-admin delegate CANNOT grant full (CRITICAL-1 fix)', async () => {
		vi.mocked(hasAdminScope).mockImplementation(async (_u, s) => s === 'share-admin')
		const caller = createCaller(makeCtx())
		await expect(caller.shareApp({appId: 'n8n', principalId: OTHER, accessType: 'full'})).rejects.toMatchObject({
			code: 'FORBIDDEN',
			message: expect.stringContaining('read-only'),
		})
		expect(grantAppAccess).not.toHaveBeenCalled()
	})

	test('share-admin delegate CANNOT grant to THEMSELVES (self-escalation)', async () => {
		vi.mocked(hasAdminScope).mockImplementation(async (_u, s) => s === 'share-admin')
		const caller = createCaller(makeCtx())
		await expect(caller.shareApp({appId: 'n8n', principalId: SELF, accessType: 'readonly'})).rejects.toMatchObject({
			code: 'FORBIDDEN',
		})
		expect(grantAppAccess).not.toHaveBeenCalled()
	})

	test('effective-FULL holder is UNRESTRICTED (can re-share full; pre-335 behavior)', async () => {
		vi.mocked(getEffectiveAppAccess).mockResolvedValue('full' as never)
		const caller = createCaller(makeCtx())
		await expect(caller.shareApp({appId: 'n8n', principalId: OTHER, accessType: 'full'})).resolves.toEqual({
			success: true,
		})
		expect(grantAppAccess).toHaveBeenCalledWith(OTHER, 'n8n', SELF, 'full')
		// A genuine full-holder path is NOT the delegate path → not audited here.
		expect(recordAdminActionEvent).not.toHaveBeenCalled()
	})

	test('admin is unrestricted + not treated as a delegate', async () => {
		const caller = createCaller(makeCtx('admin'))
		await expect(caller.shareApp({appId: 'n8n', principalId: SELF, accessType: 'full'})).resolves.toEqual({
			success: true,
		})
		expect(grantAppAccess).toHaveBeenCalledWith(SELF, 'n8n', SELF, 'full')
		expect(hasAdminScope).not.toHaveBeenCalled()
	})
})
