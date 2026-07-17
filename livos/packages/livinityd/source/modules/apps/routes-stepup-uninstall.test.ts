/**
 * Phase 334 (STEPUP-01, review INFO-7) — apps.uninstall step-up gate tests.
 *
 * The uninstall route is the ONE hand-wired (inline assertStepUpGrant) gate,
 * so pin its branch behavior:
 *   - GLOBAL/shared uninstall by a DB session WITHOUT a grant → STEP_UP_REQUIRED
 *     and the destructive delegate never runs.
 *   - With a valid grant (REAL jwt) → ctx.apps.uninstall runs.
 *   - A member's OWN per-user instance uninstall is UNGATED (no grant needed).
 *   - Legacy single-user (no currentUser) is UNGATED (additive-only).
 *
 * Strategy mirrors routes-waf.test.ts (createCallerFactory + stubbed ctx);
 * grant verification uses the REAL signStepUpGrant/verifyStepUpGrant pair.
 */
import {describe, expect, test, vi} from 'vitest'

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
	getEffectiveAppAccess: vi.fn().mockResolvedValue('full'),
	grantAppAccessToGroup: vi.fn(),
	revokeAppAccessFromGroup: vi.fn(),
	listAppAccessPrincipals: vi.fn(),
}))

import {getUserAppInstance} from '../database/index.js'

import {apps as appsRouter} from './routes.js'
import {t} from '../server/trpc/trpc.js'
import {signStepUpGrant} from '../jwt.js'
import {verifyStepUpGrant} from '../jwt.js'
import {STEPUP_COOKIE_NAME} from '../stepup/constants.js'

const createCaller = t.createCallerFactory(appsRouter)
const SECRET = 'cd'.repeat(32)
const USER_ID = 'user-A'

function makeCtx(opts: {user?: null; cookie?: string; role?: 'admin' | 'member'} = {}) {
	const uninstallFn = vi.fn().mockResolvedValue(undefined)
	const ctx = {
		dangerouslyBypassAuthentication: true,
		transport: 'http',
		currentUser: opts.user === null ? undefined : {id: USER_ID, username: 'alice', role: opts.role ?? 'admin'},
		request: opts.cookie ? {cookies: {[STEPUP_COOKIE_NAME]: opts.cookie}} : {cookies: {}},
		server: {verifyStepUpGrant: (token: string) => verifyStepUpGrant(token, SECRET)},
		apps: {
			uninstall: uninstallFn,
			uninstallForUser: vi.fn().mockResolvedValue(undefined),
			removeAppSubdomain: vi.fn().mockResolvedValue(undefined),
			logger: {log() {}, error() {}, verbose() {}},
		},
		logger: {log() {}, error() {}, verbose() {}},
	} as never
	return {ctx, uninstallFn}
}

describe('apps.uninstall — Phase 334 step-up gate (global branch)', () => {
	test('DB admin WITHOUT a grant → STEP_UP_REQUIRED, delegate never runs', async () => {
		vi.mocked(getUserAppInstance).mockResolvedValue(null as never)
		const {ctx, uninstallFn} = makeCtx()
		await expect(createCaller(ctx).uninstall({appId: 'n8n'})).rejects.toMatchObject({
			code: 'UNAUTHORIZED',
			message: 'STEP_UP_REQUIRED',
		})
		expect(uninstallFn).not.toHaveBeenCalled()
	})

	test('DB admin WITH a valid grant → global uninstall proceeds', async () => {
		vi.mocked(getUserAppInstance).mockResolvedValue(null as never)
		const {token} = await signStepUpGrant(SECRET, USER_ID)
		const {ctx, uninstallFn} = makeCtx({cookie: token})
		await expect(createCaller(ctx).uninstall({appId: 'n8n'})).resolves.toBeUndefined()
		expect(uninstallFn).toHaveBeenCalledWith('n8n')
	})

	test("ANOTHER user's grant is refused (cross-user replay)", async () => {
		vi.mocked(getUserAppInstance).mockResolvedValue(null as never)
		const {token} = await signStepUpGrant(SECRET, 'user-B')
		const {ctx, uninstallFn} = makeCtx({cookie: token})
		await expect(createCaller(ctx).uninstall({appId: 'n8n'})).rejects.toMatchObject({
			message: 'STEP_UP_REQUIRED',
		})
		expect(uninstallFn).not.toHaveBeenCalled()
	})

	test("member removing their OWN per-user instance is UNGATED (no grant)", async () => {
		vi.mocked(getUserAppInstance).mockResolvedValue({id: 'inst-1'} as never)
		const {ctx, uninstallFn} = makeCtx({role: 'member'})
		await expect(createCaller(ctx).uninstall({appId: 'n8n'})).resolves.toBeUndefined()
		// The per-user branch ran; the GLOBAL delegate stayed untouched.
		expect(uninstallFn).not.toHaveBeenCalled()
	})

	test('legacy single-user (no currentUser) is UNGATED — additive-only', async () => {
		const {ctx, uninstallFn} = makeCtx({user: null})
		await expect(createCaller(ctx).uninstall({appId: 'n8n'})).resolves.toBeUndefined()
		expect(uninstallFn).toHaveBeenCalledWith('n8n')
	})
})
