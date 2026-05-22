/**
 * Phase 196-04 Task 2 — setup-router.ts unit tests.
 *
 * Coverage:
 *   T1 — setRegion({region:'europe'}) → redis.set('liv:user:region','europe'); returns {ok:true}
 *   T2 — setRegion({region:'europe', country:'TR'}) → both keys written; returns {ok:true}
 *   T3 — setRegion({region:'mars'}) → zod throws BAD_REQUEST (T-196-04-01); redis untouched
 *   T4 — setRegion({region:'europe', country:'turkey'}) → zod throws (regex enforces ^[A-Z]{2}$);
 *        defense-in-depth for T-196-04-02
 *   T5 — empty-injection default `setupRouter` Proxy throws on any procedure call
 *        (mirrors xaiAuthRouter stub pattern from Phase 195-03)
 *   T6 — adminProcedure gate (T-196-04-04 EoP) — non-admin ctx → UNAUTHORIZED
 *
 * Caller built via `router.createCaller(ctx)` with the same legacy-flag
 * harness as xai-auth-router.test.ts. Test 6 OMITS the legacy bypass so
 * the role check fires.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {beforeEach, describe, expect, test, vi} from 'vitest'

import {createSetupRouter, setupRouter} from './setup-router.js'

function makeAdminCtx() {
	return {
		livinityd: {} as any,
		logger: {
			info: () => {},
			warn: () => {},
			error: () => {},
			verbose: () => {},
			log: () => {},
			debug: () => {},
		},
		server: {} as any,
		user: {} as any,
		appStore: {} as any,
		apps: {} as any,
		dangerouslyBypassAuthentication: true,
		currentUser: {id: 'admin-uuid', username: 'admin', role: 'admin' as const},
		transport: 'express' as const,
	}
}

function makeNonAdminCtx() {
	return {
		livinityd: {} as any,
		logger: {
			info: () => {},
			warn: () => {},
			error: () => {},
			verbose: () => {},
			log: () => {},
			debug: () => {},
		},
		server: {} as any,
		user: {} as any,
		appStore: {} as any,
		apps: {} as any,
		// Non-admin: bypass disabled, currentUser is a 'member' (not admin).
		dangerouslyBypassAuthentication: false,
		currentUser: {id: 'member-uuid', username: 'member', role: 'member' as const},
		transport: 'express' as const,
	}
}

type MockRedis = {
	set: ReturnType<typeof vi.fn>
}

let redis: MockRedis

beforeEach(() => {
	redis = {set: vi.fn().mockResolvedValue('OK')}
})

describe('setup-router — setup.setRegion tRPC procedure', () => {
	test('T1 — setRegion({region:"europe"}) writes liv:user:region once + returns {ok:true}', async () => {
		const r = createSetupRouter({redis: redis as any})
		const caller = r.createCaller(makeAdminCtx() as any)

		const result = await caller.setRegion({region: 'europe'})

		expect(result).toEqual({ok: true})
		expect(redis.set).toHaveBeenCalledTimes(1)
		expect(redis.set).toHaveBeenCalledWith('liv:user:region', 'europe')
	})

	test('T2 — setRegion({region:"europe", country:"TR"}) writes BOTH keys + returns {ok:true}', async () => {
		const r = createSetupRouter({redis: redis as any})
		const caller = r.createCaller(makeAdminCtx() as any)

		const result = await caller.setRegion({region: 'europe', country: 'TR'})

		expect(result).toEqual({ok: true})
		expect(redis.set).toHaveBeenCalledTimes(2)
		expect(redis.set).toHaveBeenNthCalledWith(1, 'liv:user:region', 'europe')
		expect(redis.set).toHaveBeenNthCalledWith(2, 'liv:user:country', 'TR')
	})

	test('T3 — setRegion({region:"mars"}) rejects via zod (T-196-04-01); Redis untouched', async () => {
		const r = createSetupRouter({redis: redis as any})
		const caller = r.createCaller(makeAdminCtx() as any)

		await expect(caller.setRegion({region: 'mars' as any})).rejects.toThrow()

		expect(redis.set).not.toHaveBeenCalled()
	})

	test('T4 — setRegion({region:"europe", country:"turkey"}) rejects via regex (T-196-04-02 defense-in-depth)', async () => {
		const r = createSetupRouter({redis: redis as any})
		const caller = r.createCaller(makeAdminCtx() as any)

		// Lowercase 6-letter country word — must fail ^[A-Z]{2}$.
		await expect(
			caller.setRegion({region: 'europe', country: 'turkey'}),
		).rejects.toThrow()

		expect(redis.set).not.toHaveBeenCalled()
	})

	test('T5 — empty-injection default setupRouter throws on any procedure call', async () => {
		const caller = setupRouter.createCaller(makeAdminCtx() as any)

		// The Proxy stub throws when the procedure body tries to read .set off
		// the redis Proxy — surfaces as a thrown Error wrapped in a tRPC
		// INTERNAL_SERVER_ERROR. Either way the call rejects.
		await expect(caller.setRegion({region: 'europe'})).rejects.toThrow(
			/setup-router|not injected/i,
		)
	})

	test('T6 — adminProcedure gate (T-196-04-04 EoP): non-admin ctx → throws', async () => {
		const r = createSetupRouter({redis: redis as any})
		const caller = r.createCaller(makeNonAdminCtx() as any)

		// Member role should be rejected by requireRole('admin').
		await expect(caller.setRegion({region: 'europe'})).rejects.toThrow()

		// Redis must not have been touched — the gate fires before the body.
		expect(redis.set).not.toHaveBeenCalled()
	})
})
