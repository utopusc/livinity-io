/**
 * setup-router.ts unit tests (country → state → city refactor + Phase 271).
 *
 * The @countrystatecity dataset is mocked at the `../../locale/index.js` module
 * boundary so the resolve mapping is tested deterministically without loading
 * the 156k-city JSON files. The mock returns a tiny fixed table.
 *
 * Coverage:
 *   --- setup.getCountries / getStates / getCities ---
 *   Q1 — getCountries → returns the (sorted) list from listCountries.
 *   Q2 — getStates({country:'US'}) → returns the states from listStates.
 *   Q3 — getCities({country:'US', state:'IN'}) → returns {id,name,timezone}[].
 *   Q4 — getStates({country:'XX'}) → zod regex rejects malformed lowercase?
 *        (we assert a non-2-letter code is rejected before listStates runs).
 *   Q5 — adminProcedure gate (EoP): non-admin ctx → throws.
 *
 *   --- setup.setLocation (cityId refactor) ---
 *   L1 — setLocation({country:'TR', cityId:'1'}) → resolves via resolveCity,
 *        validates the IANA zone, sets the system clock, then writes the Redis
 *        keys; returns {ok:true, ...resolved}.
 *   L1b — setLocation with a state → also writes liv:user:state.
 *   L2 — setLocation({country:'XX', ...}) → zod regex rejects malformed country
 *        BEFORE the body runs; redis + timezoneService untouched.
 *   L2b — setLocation with a non-numeric cityId → BAD_REQUEST; nothing touched.
 *   L3 — setLocation where resolveCity's zone fails the Intl gate → BAD_REQUEST,
 *        setSystemTimezone NOT called, redis untouched.
 *   L3b — setLocation where resolveCity returns null → BAD_REQUEST.
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

// Mock the locale barrel so resolveCity / listCountries / listStates / listCities
// are deterministic fixtures (no 156k-city JSON load). TimezoneService is a type
// only — left to the real export shape via importActual.
vi.mock('../../locale/index.js', async (importActual) => {
	const actual = await importActual<typeof import('../../locale/index.js')>()
	return {
		...actual,
		listCountries: vi.fn(async () => [
			{code: 'TR', name: 'Turkey', region: 'asia'},
			{code: 'US', name: 'United States', region: 'north-america'},
		]),
		listStates: vi.fn(async (country: string) =>
			country === 'US'
				? [
						{code: 'CA', name: 'California'},
						{code: 'IN', name: 'Indiana'},
					]
				: [],
		),
		listCities: vi.fn(async (country: string, state?: string) => {
			if (country === 'US' && state === 'IN')
				return [
					{
						id: 118924,
						name: 'Indianapolis',
						timezone: 'America/Indiana/Indianapolis',
					},
				]
			if (country === 'TR')
				return [{id: 1, name: 'Istanbul', timezone: 'Europe/Istanbul'}]
			return []
		}),
		resolveCity: vi.fn(
			async (country: string, state: string | undefined, cityId: number) => {
				if (country === 'TR' && cityId === 1)
					return {
						country: 'TR',
						city: 'Istanbul',
						region: 'asia',
						timezone: 'Europe/Istanbul',
						locale: 'tr-TR',
					}
				if (country === 'US' && state === 'IN' && cityId === 118924)
					return {
						country: 'US',
						city: 'Indianapolis',
						region: 'north-america',
						timezone: 'America/Indiana/Indianapolis',
						locale: 'en-US',
					}
				return null
			},
		),
	}
})

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

describe('setup-router — country/state/city queries', () => {
	test('Q1 — getCountries returns the sorted list', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)

		const result = await caller.getCountries()
		expect(result).toEqual([
			{code: 'TR', name: 'Turkey', region: 'asia'},
			{code: 'US', name: 'United States', region: 'north-america'},
		])
	})

	test('Q2 — getStates({country:"US"}) returns the states', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)

		const result = await caller.getStates({country: 'US'})
		expect(result).toEqual([
			{code: 'CA', name: 'California'},
			{code: 'IN', name: 'Indiana'},
		])
	})

	test('Q3 — getCities({country:"US", state:"IN"}) returns {id,name,timezone}[]', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)

		const result = await caller.getCities({country: 'US', state: 'IN'})
		expect(result).toEqual([
			{
				id: 118924,
				name: 'Indianapolis',
				timezone: 'America/Indiana/Indianapolis',
			},
		])
	})

	test('Q4 — getStates with a malformed (non-2-letter) country → zod rejects', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)

		await expect(caller.getStates({country: 'USA'})).rejects.toThrow()
	})

	test('Q5 — adminProcedure gate (EoP): non-admin getCountries → throws', async () => {
		const r = build()
		const caller = r.createCaller(makeNonAdminCtx() as any)

		await expect(caller.getCountries()).rejects.toThrow()
	})
})

describe('setup-router — setup.setLocation (cityId refactor)', () => {
	test('L1 — resolves, validates, sets the clock, then writes Redis keys', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)

		const result = await caller.setLocation({country: 'TR', cityId: '1'})

		expect(result).toMatchObject({
			ok: true,
			country: 'TR',
			city: 'Istanbul',
			region: 'asia',
			timezone: 'Europe/Istanbul',
			locale: 'tr-TR',
			state: null,
		})

		expect(timezoneService.validate).toHaveBeenCalledWith('Europe/Istanbul')
		expect(timezoneService.setSystemTimezone).toHaveBeenCalledWith('Europe/Istanbul')

		expect(redis.set).toHaveBeenCalledWith('liv:user:country', 'TR')
		expect(redis.set).toHaveBeenCalledWith('liv:user:city', 'Istanbul')
		expect(redis.set).toHaveBeenCalledWith('liv:user:region', 'asia')
		expect(redis.set).toHaveBeenCalledWith('liv:user:timezone', 'Europe/Istanbul')
		expect(redis.set).toHaveBeenCalledWith('liv:user:locale', 'tr-TR')
		// No state passed → liv:user:state NOT written.
		expect(redis.set).not.toHaveBeenCalledWith('liv:user:state', expect.anything())
	})

	test('L1b — with a state, also writes liv:user:state', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)

		const result = await caller.setLocation({
			country: 'US',
			state: 'IN',
			cityId: '118924',
		})

		expect(result).toMatchObject({
			ok: true,
			country: 'US',
			city: 'Indianapolis',
			region: 'north-america',
			timezone: 'America/Indiana/Indianapolis',
			locale: 'en-US',
			state: 'IN',
		})
		expect(redis.set).toHaveBeenCalledWith('liv:user:state', 'IN')
	})

	test('L2 — malformed country rejected by zod regex; nothing touched', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)

		await expect(
			caller.setLocation({country: 'XXX', cityId: '1'}),
		).rejects.toThrow()

		expect(timezoneService.setSystemTimezone).not.toHaveBeenCalled()
		expect(redis.set).not.toHaveBeenCalled()
	})

	test('L2b — non-numeric cityId → BAD_REQUEST; nothing touched', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)

		await expect(
			caller.setLocation({country: 'TR', cityId: 'notanumber'}),
		).rejects.toMatchObject({code: 'BAD_REQUEST'})

		expect(timezoneService.setSystemTimezone).not.toHaveBeenCalled()
		expect(redis.set).not.toHaveBeenCalled()
	})

	test('L3 — Intl gate rejects the resolved zone → BAD_REQUEST; clock + redis untouched', async () => {
		timezoneService.validate.mockReturnValue(false)
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)

		await expect(
			caller.setLocation({country: 'TR', cityId: '1'}),
		).rejects.toMatchObject({code: 'BAD_REQUEST'})

		expect(timezoneService.setSystemTimezone).not.toHaveBeenCalled()
		expect(redis.set).not.toHaveBeenCalled()
	})

	test('L3b — unresolvable (country, cityId) → BAD_REQUEST', async () => {
		const r = build()
		const caller = r.createCaller(makeAdminCtx() as any)

		// cityId 999 is not in the resolveCity mock → null → BAD_REQUEST.
		await expect(
			caller.setLocation({country: 'TR', cityId: '999'}),
		).rejects.toMatchObject({code: 'BAD_REQUEST'})

		expect(timezoneService.setSystemTimezone).not.toHaveBeenCalled()
		expect(redis.set).not.toHaveBeenCalled()
	})

	test('L4 — adminProcedure gate (EoP): non-admin ctx → throws; nothing touched', async () => {
		const r = build()
		const caller = r.createCaller(makeNonAdminCtx() as any)

		await expect(
			caller.setLocation({country: 'TR', cityId: '1'}),
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
				'liv:user:state': 'CA',
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
			state: 'CA',
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
			state: null,
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
