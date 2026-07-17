/**
 * Phase 332 (WAF-01/02) — apps.setAppProtection / getAppProtection route tests.
 *
 * Proves the edge gate:
 *   - a non-admin CANNOT set protection (adminProcedure — the input never reaches
 *     ctx.apps).
 *   - a malformed appId / oversized list is rejected at the tRPC input BEFORE the
 *     delegate is called.
 *   - a clean config reaches ctx.apps.setAppWafConfig verbatim.
 *   - getAppProtection returns the stored config (or null).
 *
 * Strategy mirrors routes-public-access.test.ts: createCallerFactory + a stubbed
 * ctx whose ctx.apps stubs only the two methods these routes call.
 */
import {describe, expect, test, vi} from 'vitest'
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

import {apps as appsRouter} from './routes.js'
import {t} from '../server/trpc/trpc.js'

const createCaller = t.createCallerFactory(appsRouter)

function makeApps(overrides: Record<string, any> = {}) {
	return {
		setAppWafConfig: vi.fn().mockResolvedValue(undefined),
		getAppWafConfig: vi.fn().mockResolvedValue(undefined),
		logger: {log() {}, error() {}, verbose() {}},
		...overrides,
	}
}

function makeCtx(opts: {role?: 'admin' | 'member'; apps?: any} = {}) {
	return {
		dangerouslyBypassAuthentication: true,
		transport: 'http',
		currentUser: {id: 'user-A', username: 'alice', role: opts.role ?? 'admin'},
		apps: opts.apps ?? makeApps(),
		logger: {log() {}, error() {}, verbose() {}},
	} as never
}

describe('apps.setAppProtection — admin gate + input validation', () => {
	test('a non-admin member is rejected (adminProcedure) — delegate never called', async () => {
		const apps = makeApps()
		const caller = createCaller(makeCtx({role: 'member', apps}))
		await expect(
			caller.setAppProtection({appId: 'n8n', banIps: ['1.2.3.4']}),
		).rejects.toBeInstanceOf(TRPCError)
		expect(apps.setAppWafConfig).not.toHaveBeenCalled()
	})

	test('a malformed appId is rejected at the input edge', async () => {
		const apps = makeApps()
		const caller = createCaller(makeCtx({apps}))
		await expect(caller.setAppProtection({appId: '../etc', banIps: ['1.2.3.4']})).rejects.toBeInstanceOf(TRPCError)
		expect(apps.setAppWafConfig).not.toHaveBeenCalled()
	})

	test('an oversized ban list is rejected at the input edge', async () => {
		const apps = makeApps()
		const caller = createCaller(makeCtx({apps}))
		const tooMany = Array.from({length: 101}, (_, i) => `10.0.0.${i % 256}`)
		await expect(caller.setAppProtection({appId: 'n8n', banIps: tooMany})).rejects.toBeInstanceOf(TRPCError)
		expect(apps.setAppWafConfig).not.toHaveBeenCalled()
	})

	test('a clean config reaches ctx.apps.setAppWafConfig verbatim', async () => {
		const apps = makeApps()
		const caller = createCaller(makeCtx({apps}))
		await caller.setAppProtection({appId: 'n8n', banIps: ['1.2.3.4'], banUserAgents: ['GPTBot'], abuseBan: true})
		expect(apps.setAppWafConfig).toHaveBeenCalledWith('n8n', {
			banIps: ['1.2.3.4'],
			banUserAgents: ['GPTBot'],
			abuseBan: true,
		})
	})

	test('the delegate rejecting an invalid config surfaces as an error', async () => {
		const apps = makeApps({
			setAppWafConfig: vi.fn().mockRejectedValue(new Error('[waf-invalid] invalid IP/CIDR: "evil }"')),
		})
		const caller = createCaller(makeCtx({apps}))
		// appId + shape pass the edge; the delegate's re-validation is the last line.
		await expect(caller.setAppProtection({appId: 'n8n', banIps: ['1.2.3.4']})).rejects.toThrow(/waf-invalid/)
	})
})

describe('apps.getAppProtection — read', () => {
	test('returns the stored config', async () => {
		const cfg = {banIps: ['1.2.3.4'], abuseBan: true}
		const apps = makeApps({getAppWafConfig: vi.fn().mockResolvedValue(cfg)})
		const caller = createCaller(makeCtx({role: 'member', apps}))
		await expect(caller.getAppProtection({appId: 'n8n'})).resolves.toEqual(cfg)
	})

	test('returns null when no protection is set', async () => {
		const apps = makeApps({getAppWafConfig: vi.fn().mockResolvedValue(undefined)})
		const caller = createCaller(makeCtx({role: 'member', apps}))
		await expect(caller.getAppProtection({appId: 'n8n'})).resolves.toBeNull()
	})
})
