/**
 * Phase 335 (ROLE-02, D-335-4) — per-app operator lifecycle-gate route tests.
 *
 * Matrix on the GLOBAL/shared-app branch of restart/stop/update/logs (+ the
 * looser start):
 *   admin                    → everything
 *   operator of THIS app     → restart/stop/update/logs/start on THIS app only
 *   effective-FULL grantee   → same as operator
 *   readonly grantee         → start YES (usage), restart/stop/update/logs NO
 *   plain member             → all global lifecycle DENIED (pre-335 this was
 *                              open to any authenticated user — unintended)
 *   per-user-instance owner  → own-instance branch untouched (ungated)
 *   legacy (no currentUser)  → unchanged pass-through
 *   setAppOperator/listAppOperators → adminProcedure (operator can't mint)
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
}))
vi.mock('../database/admin-grants.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../database/admin-grants.js')>()
	return {
		...actual,
		hasAdminScope: vi.fn().mockResolvedValue(false),
		isAppOperator: vi.fn().mockResolvedValue(false),
		grantAppOperator: vi.fn(),
		revokeAppOperator: vi.fn(),
		listAppOperators: vi.fn().mockResolvedValue([]),
	}
})

import {getUserAppInstance} from '../database/index.js'
import {getEffectiveAppAccess} from './app-access.js'
import {isAppOperator, grantAppOperator} from '../database/admin-grants.js'

import {apps as appsRouter} from './routes.js'
import {t} from '../server/trpc/trpc.js'

const createCaller = t.createCallerFactory(appsRouter)
const USER = '44444444-4444-4444-4444-444444444444'

function makeApps() {
	return {
		restart: vi.fn().mockResolvedValue(undefined),
		update: vi.fn().mockResolvedValue(undefined),
		getNativeApp: vi.fn().mockReturnValue(null),
		getApp: vi.fn().mockReturnValue({
			start: vi.fn().mockResolvedValue(undefined),
			stop: vi.fn().mockResolvedValue(undefined),
			getLogs: vi.fn().mockResolvedValue('log-lines'),
		}),
		logger: {log() {}, error() {}, verbose() {}},
	}
}

function makeCtx(opts: {role?: 'admin' | 'member'; user?: null; apps?: ReturnType<typeof makeApps>} = {}) {
	return {
		dangerouslyBypassAuthentication: true,
		transport: 'http',
		currentUser: opts.user === null ? undefined : {id: 'user-A', username: 'alice', role: opts.role ?? 'member'},
		apps: opts.apps ?? makeApps(),
		logger: {log() {}, error() {}, verbose() {}},
	} as never
}

beforeEach(() => {
	// mockReset (not just a new mockResolvedValue) — call HISTORY must clear
	// between tests or the not-called assertions count earlier tests' calls.
	vi.mocked(getUserAppInstance).mockReset().mockResolvedValue(null as never)
	vi.mocked(getEffectiveAppAccess).mockReset().mockResolvedValue('none' as never)
	vi.mocked(isAppOperator).mockReset().mockResolvedValue(false)
	vi.mocked(grantAppOperator).mockReset()
})

describe('apps lifecycle — Phase 335 operator gate', () => {
	test('plain member: global restart/stop/update/logs/start ALL denied', async () => {
		const apps = makeApps()
		const caller = createCaller(makeCtx({apps}))
		await expect(caller.restart({appId: 'n8n'})).rejects.toMatchObject({code: 'FORBIDDEN'})
		await expect(caller.stop({appId: 'n8n'})).rejects.toMatchObject({code: 'FORBIDDEN'})
		await expect(caller.update({appId: 'n8n'})).rejects.toMatchObject({code: 'FORBIDDEN'})
		await expect(caller.logs({appId: 'n8n'})).rejects.toMatchObject({code: 'FORBIDDEN'})
		await expect(caller.start({appId: 'n8n'})).rejects.toMatchObject({code: 'FORBIDDEN'})
		expect(apps.restart).not.toHaveBeenCalled()
		expect(apps.update).not.toHaveBeenCalled()
	})

	test('operator of THIS app: lifecycle passes; a DIFFERENT app stays denied', async () => {
		vi.mocked(isAppOperator).mockImplementation(async (appId) => appId === 'n8n')
		const apps = makeApps()
		const caller = createCaller(makeCtx({apps}))
		await expect(caller.restart({appId: 'n8n'})).resolves.toBeUndefined()
		await expect(caller.logs({appId: 'n8n'})).resolves.toBe('log-lines')
		await expect(caller.update({appId: 'n8n'})).resolves.toBeUndefined()
		expect(apps.restart).toHaveBeenCalledWith('n8n')
		await expect(caller.restart({appId: 'other'})).rejects.toMatchObject({code: 'FORBIDDEN'})
	})

	test('operator can NOT uninstall (334 step-up gate still refuses first)', async () => {
		vi.mocked(isAppOperator).mockResolvedValue(true)
		const caller = createCaller(makeCtx())
		// 323 readonly gate: member without effective-full is refused BEFORE the
		// operator question — uninstall is not operator surface at all.
		await expect(caller.uninstall({appId: 'n8n'})).rejects.toBeInstanceOf(TRPCError)
	})

	test('effective-FULL grantee passes; readonly passes ONLY start', async () => {
		vi.mocked(getEffectiveAppAccess).mockResolvedValue('full' as never)
		const full = createCaller(makeCtx({apps: makeApps()}))
		await expect(full.restart({appId: 'n8n'})).resolves.toBeUndefined()
		vi.mocked(getEffectiveAppAccess).mockResolvedValue('readonly' as never)
		const readonly = createCaller(makeCtx({apps: makeApps()}))
		await expect(readonly.start({appId: 'n8n'})).resolves.toBeUndefined()
		await expect(readonly.restart({appId: 'n8n'})).rejects.toMatchObject({code: 'FORBIDDEN'})
		await expect(readonly.logs({appId: 'n8n'})).rejects.toMatchObject({code: 'FORBIDDEN'})
	})

	test('per-user-instance owner branch untouched (no gate consulted)', async () => {
		vi.mocked(getUserAppInstance).mockResolvedValue({containerName: 'c1'} as never)
		const caller = createCaller(makeCtx())
		// The instance branch shells out to docker — expect the execa failure
		// class, NOT a FORBIDDEN (the gate never ran).
		await expect(caller.restart({appId: 'n8n'})).rejects.toSatisfy(
			(e: unknown) => !(e instanceof TRPCError && (e as TRPCError).code === 'FORBIDDEN'),
		)
		expect(isAppOperator).not.toHaveBeenCalled()
	})

	test('legacy single-user (no currentUser) passes through unchanged', async () => {
		const apps = makeApps()
		const caller = createCaller(makeCtx({user: null, apps}))
		await expect(caller.restart({appId: 'n8n'})).resolves.toBeUndefined()
		expect(apps.restart).toHaveBeenCalledWith('n8n')
	})

	test('setAppOperator: member denied (adminProcedure), admin grants/revokes', async () => {
		const member = createCaller(makeCtx())
		await expect(member.setAppOperator({appId: 'n8n', userId: USER, operator: true})).rejects.toBeInstanceOf(
			TRPCError,
		)
		expect(grantAppOperator).not.toHaveBeenCalled()
		const admin = createCaller(makeCtx({role: 'admin'}))
		await expect(admin.setAppOperator({appId: 'n8n', userId: USER, operator: true})).resolves.toEqual({
			success: true,
		})
		expect(grantAppOperator).toHaveBeenCalledWith({appId: 'n8n', userId: USER, grantedBy: 'user-A'})
		await expect(admin.listAppOperators({appId: 'n8n'})).resolves.toEqual([])
	})
})
