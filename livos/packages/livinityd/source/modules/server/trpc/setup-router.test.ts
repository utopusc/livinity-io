/**
 * Phase 196.1 / 271 — setup-router.ts unit tests.
 *
 * Coverage:
 *   --- setup.setLocation (Phase 196.1) ---
 *   L1 — setLocation({country:'TR', city:'Istanbul'}) → resolves via catalog,
 *        validates the IANA zone, sets the system clock, then writes all five
 *        Redis keys; returns {ok:true, ...resolved}.
 *   L2 — setLocation({country:'XX', ...}) → zod refine rejects unknown country
 *        BEFORE the body runs; redis + timezoneService untouched.
 *   L3 — setLocation with a catalog zone the Intl gate rejects → BAD_REQUEST,
 *        setSystemTimezone NOT called, redis untouched.
 *   L4 — adminProcedure gate (EoP): non-admin ctx → throws; nothing touched.
 *
 *   --- setup.getLocation (Phase 271) ---
 *   G1 — all keys present incl. explicit liv:user:hour_cycle → returns the
 *        persisted shape verbatim (explicit hour_cycle wins).
 *   G2 — hour_cycle absent but locale='tr-TR' → derives 'h23' from the locale.
 *   G3 — hour_cycle absent, locale='en-US' → derives 'h12'.
 *   G4 — nothing persisted (all nulls, no locale) → location fields null,
 *        hourCycle falls back to 'h23'.
 *   G5 — adminProcedure gate (EoP): non-admin ctx → throws.
 *
 *   --- setup.setClockFormat (Phase 271) ---
 *   C1 — setClockFormat({hourCycle:'h12'}) → writes liv:user:hour_cycle once;
 *        returns {ok:true, hourCycle:'h12'}.
 *   C2 — setClockFormat({hourCycle:'nonsense'}) → zod enum rejects; redis
 *        untouched.
 *   C3 — adminProcedure gate (EoP): non-admin ctx → throws; redis untouched.
 *
 *   --- empty-injection default ---
 *   E1 — the default `setupRouter` Proxy throws on any procedure call.
 *
 * Caller built via `router.createCaller(ctx)`. L4 / G5 / C3 OMIT the legacy
 * bypass so the adminProcedure role check fires.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {beforeEach, describe, expect, test, vi} from 'vitest'

import type {TimezoneService} from '../../locale/index.js'
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
	get: ReturnType<typeof vi.fn>
}

type MockTimezoneService = {
	validate: ReturnType<typeof vi.fn>
	setSystemTimezone: ReturnType<typeof vi.fn>
}

let redis: MockRedis
let timezoneService: MockTimezoneService

beforeEach(() => {
	redis = {
		set: vi.fn().mockResolvedValue('OK'),
		get: vi.fn().mockResolvedValue(null),
	}
	// Default mock: validate accepts the IANA zones the catalog ships;
	// setSystemTimezone resolves {ok:true}. Individual tests override.
	timezoneService = {
		validate: vi.fn().mockReturnValue(true),
		setSystemTimezone: vi.fn().mockResolvedValue({ok: true as const}),
	}
})

/** Helper: build a setup router with the mocks. */
function build() {
	return createSetupRouter({
		redis: redis as any,
		timezoneService: timezoneService as unknown as TimezoneService,
	})
}

describe('setup-router — setup.setLocation (Phase 196.1)', () => {
	test('L1 — resolves, validates, sets the clock, then writes 5 Redis keys', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)

		const result = await caller.setLocation({country: 'TR', city: 'Istanbul'})

		expect(result).toMatchObject({
			ok: true,
			country: 'TR',
			city: 'Istanbul',
			region: 'europe',
			timezone: 'Europe/Istanbul',
			locale: 'tr-TR',
		})

		expect(timezoneService.validate).toHaveBeenCalledWith('Europe/Istanbul')
		expect(timezoneService.setSystemTimezone).toHaveBeenCalledWith('Europe/Istanbul')

		// All five location keys written.
		expect(redis.set).toHaveBeenCalledWith('liv:user:country', 'TR')
		expect(redis.set).toHaveBeenCalledWith('liv:user:city', 'Istanbul')
		expect(redis.set).toHaveBeenCalledWith('liv:user:region', 'europe')
		expect(redis.set).toHaveBeenCalledWith('liv:user:timezone', 'Europe/Istanbul')
		expect(redis.set).toHaveBeenCalledWith('liv:user:locale', 'tr-TR')
	})

	test('L2 — unknown country rejected by zod refine; nothing touched', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)

		await expect(
			caller.setLocation({country: 'XX', city: 'Nowhere'}),
		).rejects.toThrow()

		expect(timezoneService.setSystemTimezone).not.toHaveBeenCalled()
		expect(redis.set).not.toHaveBeenCalled()
	})

	test('L3 — Intl gate rejects the catalog zone → BAD_REQUEST; clock + redis untouched', async () => {
		timezoneService.validate.mockReturnValue(false)
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)

		await expect(
			caller.setLocation({country: 'TR', city: 'Istanbul'}),
		).rejects.toMatchObject({code: 'BAD_REQUEST'})

		expect(timezoneService.setSystemTimezone).not.toHaveBeenCalled()
		expect(redis.set).not.toHaveBeenCalled()
	})

	test('L4 — adminProcedure gate (EoP): non-admin ctx → throws; nothing touched', async () => {
		const r = build()
		const caller = r.createCaller(makeNonAdminCtx() as any)

		await expect(
			caller.setLocation({country: 'TR', city: 'Istanbul'}),
		).rejects.toThrow()

		expect(timezoneService.setSystemTimezone).not.toHaveBeenCalled()
		expect(redis.set).not.toHaveBeenCalled()
	})
})

describe('setup-router — setup.getLocation (Phase 271)', () => {
	test('G1 — all keys present incl. explicit hour_cycle → returns persisted shape verbatim', async () => {
		redis.get.mockImplementation(async (key: string) => {
			const map: Record<string, string> = {
				'liv:user:country': 'US',
				'liv:user:city': 'San Francisco',
				'liv:user:region': 'north-america',
				'liv:user:timezone': 'America/Los_Angeles',
				'liv:user:locale': 'en-US',
				'liv:user:hour_cycle': 'h23', // explicit override — must win over en-US's h12
			}
			return map[key] ?? null
		})
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)

		const result = await caller.getLocation()

		expect(result).toEqual({
			country: 'US',
			city: 'San Francisco',
			region: 'north-america',
			timezone: 'America/Los_Angeles',
			locale: 'en-US',
			hourCycle: 'h23', // explicit liv:user:hour_cycle wins over locale-derived
		})
	})

	test('G2 — no hour_cycle, locale tr-TR → derives h23', async () => {
		redis.get.mockImplementation(async (key: string) =>
			key === 'liv:user:locale' ? 'tr-TR' : null,
		)
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)

		const result = await caller.getLocation()
		expect(result.hourCycle).toBe('h23')
	})

	test('G3 — no hour_cycle, locale en-US → derives h12', async () => {
		redis.get.mockImplementation(async (key: string) =>
			key === 'liv:user:locale' ? 'en-US' : null,
		)
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)

		const result = await caller.getLocation()
		expect(result.hourCycle).toBe('h12')
	})

	test('G4 — nothing persisted → location nulls + hourCycle falls back to h23', async () => {
		// redis.get default returns null for every key.
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)

		const result = await caller.getLocation()
		expect(result).toEqual({
			country: null,
			city: null,
			region: null,
			timezone: null,
			locale: null,
			hourCycle: 'h23',
		})
	})

	test('G5 — adminProcedure gate (EoP): non-admin ctx → throws', async () => {
		const r = build()
		const caller = r.createCaller(makeNonAdminCtx() as any)

		await expect(caller.getLocation()).rejects.toThrow()
	})
})

describe('setup-router — setup.setClockFormat (Phase 271)', () => {
	test('C1 — setClockFormat({hourCycle:"h12"}) writes liv:user:hour_cycle once', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)

		const result = await caller.setClockFormat({hourCycle: 'h12'})

		expect(result).toEqual({ok: true, hourCycle: 'h12'})
		expect(redis.set).toHaveBeenCalledTimes(1)
		expect(redis.set).toHaveBeenCalledWith('liv:user:hour_cycle', 'h12')
	})

	test('C2 — setClockFormat({hourCycle:"nonsense"}) rejected by zod enum; redis untouched', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)

		await expect(
			caller.setClockFormat({hourCycle: 'nonsense' as any}),
		).rejects.toThrow()

		expect(redis.set).not.toHaveBeenCalled()
	})

	test('C3 — adminProcedure gate (EoP): non-admin ctx → throws; redis untouched', async () => {
		const r = build()
		const caller = r.createCaller(makeNonAdminCtx() as any)

		await expect(caller.setClockFormat({hourCycle: 'h12'})).rejects.toThrow()
		expect(redis.set).not.toHaveBeenCalled()
	})
})

describe('setup-router — empty-injection default', () => {
	test('E1 — default setupRouter throws on any procedure call', async () => {
		const caller = setupRouter.createCaller(makeAdminCtx() as any)

		// The Proxy stub throws when the procedure body reads .set/.get off the
		// redis Proxy — surfaces as a thrown Error wrapped in a tRPC
		// INTERNAL_SERVER_ERROR. Either way the call rejects.
		await expect(caller.setClockFormat({hourCycle: 'h12'})).rejects.toThrow(
			/setup-router|not injected/i,
		)
	})
})
