/**
 * Phase 258 WS-C (258-03) — appStore.setPublicAccess / getPublicAccess unit tests.
 *
 * Proves the SERVER-SIDE security spine (SC3 + SC5):
 *   - a public-forbidden app (load-bearing: neverPublic/requiresLocalAiClis/
 *     daemon-bearer; defense-in-depth: compose docker.sock/privileged/host-net)
 *     is rejected with a TRPCError FORBIDDEN BEFORE any persist/regen.
 *   - only the app owner OR an admin may enable a non-forbidden app; a non-owner
 *     non-admin is rejected FORBIDDEN.
 *   - owner/admin can set paths/whole-app on a clean app → persist + regen + publicUrl.
 *   - disabling (mode 'none') is always allowed.
 *
 * Strategy: t.createCallerFactory(appStore) + a stubbed ctx whose ctx.apps stubs
 * only the methods the route calls; vi.mock the database module for getUserAppInstance.
 */
import {beforeEach, describe, expect, test, vi} from 'vitest'
import {TRPCError} from '@trpc/server'

const getUserAppInstanceMock = vi.fn()

vi.mock('../database/index.js', () => ({
	getUserAppInstance: (...args: unknown[]) => getUserAppInstanceMock(...args),
	// other named exports the routes module imports at load time — stubbed no-ops
	grantAppAccess: vi.fn(),
	revokeAppAccess: vi.fn(),
	listAppAccessUsers: vi.fn(),
	hasAppAccess: vi.fn(),
	listUsers: vi.fn(),
	listUserAppInstances: vi.fn(),
	getPool: vi.fn(),
}))

import {apps as appsRouter} from './routes.js'
import {t} from '../server/trpc/trpc.js'

const createCaller = t.createCallerFactory(appsRouter)

// Stub the only ctx.apps methods setPublicAccess / getPublicAccess touch.
function makeApps(overrides: Record<string, any> = {}) {
	return {
		getPublicForbiddenSignals: vi.fn().mockResolvedValue({signals: {}, manifest: {}}),
		getPublicAccessSetting: vi.fn().mockResolvedValue(undefined),
		setPublicAccessSetting: vi.fn().mockResolvedValue(undefined),
		registerAppSubdomain: vi.fn().mockResolvedValue(undefined),
		getAllSubdomains: vi.fn().mockResolvedValue([
			{appId: 'calcom', subdomain: 'calcom', host: 'calcom.bruce.livinity.io', port: 3000, enabled: true},
		]),
		logger: {log() {}, error() {}, verbose() {}},
		...overrides,
	}
}

function makeCtx(opts: {role?: 'admin' | 'member' | 'guest'; userId?: string; apps?: any} = {}) {
	return {
		dangerouslyBypassAuthentication: true,
		transport: 'http',
		currentUser: opts.userId === null ? undefined : {id: opts.userId ?? 'user-A', username: 'alice', role: opts.role ?? 'member'},
		apps: opts.apps ?? makeApps(),
		logger: {log() {}, error() {}, verbose() {}},
	} as never
}

describe('appStore.setPublicAccess (258-03 WS-C)', () => {
	beforeEach(() => {
		getUserAppInstanceMock.mockReset()
	})

	test('Test 1 — forbidden (load-bearing) → 403 BEFORE persist/regen', async () => {
		const apps = makeApps({
			getPublicForbiddenSignals: vi.fn().mockResolvedValue({signals: {requiresLocalAiClis: true}, manifest: {}}),
		})
		const caller = createCaller(makeCtx({role: 'admin', apps}))
		await expect(caller.setPublicAccess({appId: 'opendesign', mode: 'whole-app'})).rejects.toMatchObject({
			code: 'FORBIDDEN',
		})
		expect(apps.setPublicAccessSetting).not.toHaveBeenCalled()
		expect(apps.registerAppSubdomain).not.toHaveBeenCalled()
	})

	test('Test 2 — forbidden (defense-in-depth compose docker.sock) → 403', async () => {
		const apps = makeApps({
			getPublicForbiddenSignals: vi.fn().mockResolvedValue({
				signals: {compose: {services: {p: {volumes: ['/var/run/docker.sock:/var/run/docker.sock']}}}},
				manifest: {},
			}),
		})
		const caller = createCaller(makeCtx({role: 'admin', apps}))
		await expect(caller.setPublicAccess({appId: 'portainer', mode: 'whole-app'})).rejects.toMatchObject({
			code: 'FORBIDDEN',
		})
		expect(apps.setPublicAccessSetting).not.toHaveBeenCalled()
	})

	test('Test 3 — non-owner non-admin → 403', async () => {
		getUserAppInstanceMock.mockResolvedValue(undefined) // not the owner
		const apps = makeApps()
		const caller = createCaller(makeCtx({role: 'member', userId: 'user-B', apps}))
		await expect(caller.setPublicAccess({appId: 'calcom', mode: 'paths', paths: ['/booking']})).rejects.toMatchObject({
			code: 'FORBIDDEN',
		})
		expect(apps.getPublicForbiddenSignals).not.toHaveBeenCalled()
		expect(apps.setPublicAccessSetting).not.toHaveBeenCalled()
	})

	test('Test 4 — owner allowed: persists setting + regen + returns publicUrl', async () => {
		getUserAppInstanceMock.mockResolvedValue({id: 'inst-1', containerName: 'calcom-user-A'})
		const apps = makeApps()
		const caller = createCaller(makeCtx({role: 'member', userId: 'user-A', apps}))
		const res = await caller.setPublicAccess({appId: 'calcom', mode: 'paths', paths: ['/booking']})
		expect(res).toEqual({success: true, mode: 'paths', publicUrl: 'calcom.bruce.livinity.io'})
		expect(apps.setPublicAccessSetting).toHaveBeenCalledWith('calcom', {mode: 'paths', paths: ['/booking']})
		expect(apps.registerAppSubdomain).toHaveBeenCalledWith('calcom', 3000, 'calcom', 'calcom.bruce.livinity.io')
	})

	test('Test 5 — admin allowed on any clean app', async () => {
		const apps = makeApps()
		const caller = createCaller(makeCtx({role: 'admin', userId: 'admin-1', apps}))
		const res = await caller.setPublicAccess({appId: 'calcom', mode: 'whole-app'})
		expect(res.success).toBe(true)
		expect(getUserAppInstanceMock).not.toHaveBeenCalled() // admin short-circuits ownership
		expect(apps.setPublicAccessSetting).toHaveBeenCalled()
	})

	test('Test 6 — disable (mode none) is always allowed, no forbidden check', async () => {
		const apps = makeApps({
			// even a forbidden app can be disabled
			getPublicForbiddenSignals: vi.fn().mockResolvedValue({signals: {neverPublic: true}, manifest: {}}),
		})
		const caller = createCaller(makeCtx({role: 'admin', apps}))
		const res = await caller.setPublicAccess({appId: 'portainer', mode: 'none'})
		expect(res.success).toBe(true)
		expect(apps.getPublicForbiddenSignals).not.toHaveBeenCalled() // skipped for 'none'
		expect(apps.setPublicAccessSetting).toHaveBeenCalledWith('portainer', {mode: 'none', paths: undefined})
	})
})

describe('appStore.getPublicAccess (258-03 WS-C — read side)', () => {
	test('exposes forbidden + reason + resolved config + suggested paths', async () => {
		const apps = makeApps({
			getPublicForbiddenSignals: vi.fn().mockResolvedValue({
				signals: {requiresLocalAiClis: true},
				manifest: {publicAccess: {mode: 'paths', paths: ['/x']}},
			}),
			getPublicAccessSetting: vi.fn().mockResolvedValue(undefined),
		})
		const caller = createCaller(makeCtx({role: 'admin', apps}))
		const res = await caller.getPublicAccess({appId: 'opendesign'})
		expect(res.forbidden).toBe(true)
		expect(res.reason).toBe('local-ai-clis')
		expect(res.mode).toBe('none') // no operator opt-in
		expect(res.suggestedPaths).toEqual(['/x'])
	})

	test('clean app with a persisted paths setting → resolved paths', async () => {
		const apps = makeApps({
			getPublicForbiddenSignals: vi.fn().mockResolvedValue({signals: {}, manifest: {publicAccess: {hasOwnAuth: true}}}),
			getPublicAccessSetting: vi.fn().mockResolvedValue({mode: 'paths', paths: ['/booking']}),
		})
		const caller = createCaller(makeCtx({role: 'admin', apps}))
		const res = await caller.getPublicAccess({appId: 'calcom'})
		expect(res.forbidden).toBe(false)
		expect(res.mode).toBe('paths')
		expect(res.paths).toEqual(['/booking'])
		expect(res.hasOwnAuth).toBe(true)
		expect(res.publicUrl).toBe('calcom.bruce.livinity.io')
	})
})
