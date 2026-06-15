/**
 * Phase 196-04 / 196-05 / 196.1 / 271 — `setup.*` tRPC namespace.
 *
 * Procedures today:
 *
 *   - `setup.getCountries` / `getStates` / `getCities` — adminProcedure
 *     QUERIES backing the cascading country → (state) → city picker. Data comes
 *     from the @countrystatecity/countries dataset (backend-only); the UI reaches
 *     it ONLY through these queries (the 55MB dataset never enters the UI bundle).
 *
 *   - `setup.setLocation` — adminProcedure mutation. Comprehensive country →
 *     (state) → city picker. Submits by `cityId` (numeric dataset id, dodges
 *     duplicate-name collisions). Resolves (country, state?, cityId) → {region,
 *     timezone, locale} via `resolveCity`, persists the Redis keys (country,
 *     city, region, timezone, locale + optional state) and propagates the
 *     timezone to the system clock via the narrow sudoers TIMEDATECTL Cmnd_Alias.
 *     The timezone is read straight off the dataset city (county-accurate, incl.
 *     US split-states); region via regionFor(dataset region/subregion); locale
 *     via COUNTRY_LOCALE.
 *
 *   - `setup.getLocation` (Phase 271) — adminProcedure QUERY. Reads back the
 *     persisted `liv:user:{country,city,region,timezone,locale,hour_cycle}`
 *     keys so the navbar clock + Settings Date & Time can render the SELECTED
 *     city/timezone and the operator's chosen hour-cycle. `hourCycle` is
 *     resolved from `liv:user:hour_cycle` when set, else derived from the
 *     persisted locale via Intl, else 'h23'.
 *
 *   - `setup.setClockFormat` (Phase 271) — adminProcedure mutation. Persists
 *     the operator's 24h⇄AM/PM choice to `liv:user:hour_cycle`.
 *
 * Phase 271 REMOVED the dead `setup.setRegion` (Plan 196-04) and
 * `setup.setLocaleTimezone` (Plan 196-05) procedures + their input schemas —
 * both were superseded by the merged `setLocation` and had no remaining live
 * UI callers.
 *
 * D-196.1-DI: the router takes a `{redis, timezoneService}` dep object.
 * Production livinityd boot constructs both deps and injects them; the bare
 * `setupRouter` default throws on access until that swap lands.
 *
 * D-HTTP-ONLY: `setLocation`, `getLocation` and `setClockFormat` are all in
 * `httpOnlyPaths` in ./common.ts so the onboarding mutations survive WS
 * reconnect across the systemctl restart livos window (memory pitfall B-12 /
 * X-04 cluster — same rationale as the `auth.xai.*` family).
 */

import {TRPCError} from '@trpc/server'
import {z} from 'zod'

import {adminProcedure, router} from './trpc.js'
import {
	listCountries,
	listStates,
	listCities,
	resolveCity,
	type TimezoneService,
} from '../../locale/index.js'

// ─── Service DI shape ────────────────────────────────────────────────────

/**
 * Minimal Redis client surface the setup router needs. Matches both
 * the ioredis `Redis` runtime shape and the redis-mock test double —
 * we call `.set(key, value)` (writes) and `.get(key)` (getLocation read).
 */
export interface SetupRedisClient {
	set(key: string, value: string): Promise<unknown>
	get(key: string): Promise<string | null>
}

export interface SetupRouterDeps {
	redis: SetupRedisClient
	/**
	 * TimezoneService for `setup.setLocation`. Production wire-up at
	 * livinityd/source/index.ts constructs via `createTimezoneService()`;
	 * tests inject a mock.
	 */
	timezoneService: TimezoneService
}

// ─── hour-cycle helpers ──────────────────────────────────────────────────

export type HourCycle = 'h12' | 'h23'

/**
 * Phase 271 — normalize any of the four Intl hour-cycle codes (h11/h12/h23/h24)
 * to the two-way axis the UI cares about: 12-hour (with AM/PM) vs 24-hour.
 */
function normalizeHourCycle(hc: string | null | undefined): HourCycle | null {
	if (hc === 'h11' || hc === 'h12') return 'h12'
	if (hc === 'h23' || hc === 'h24') return 'h23'
	return null
}

/**
 * Phase 271 — derive an hour-cycle from a BCP-47 locale via Intl. Returns
 * 'h23' when the locale is MISSING (per the contract: explicit override →
 * locale-derived → 'h23'; a never-configured box has no locale and must NOT
 * inherit en-US's 12-hour default), and 'h23' on any Intl failure.
 */
function deriveHourCycleFromLocale(locale: string | null | undefined): HourCycle {
	if (!locale) return 'h23'
	try {
		const resolved = new Intl.DateTimeFormat(locale, {
			hour: 'numeric',
		}).resolvedOptions().hourCycle
		return normalizeHourCycle(resolved) ?? 'h23'
	} catch {
		return 'h23'
	}
}

// ─── Input schemas ───────────────────────────────────────────────────────

/**
 * `setup.setLocation` input schema — comprehensive country → (state) → city.
 *
 * Submits by `cityId` (the dataset's stable numeric city id) rather than a
 * city NAME, which avoids the duplicate-name collisions that a 156k-city
 * dataset is rife with (e.g. dozens of "Springfield"s). The (country, state?,
 * cityId) triple is resolved server-side via `resolveCity()`; an unresolvable
 * triple is rejected with BAD_REQUEST.
 *
 * The 2-letter country regex is defense-in-depth against path-traversal-
 * flavoured input. `state` is optional (states-less countries omit it).
 */
const setLocationInput = z.object({
	country: z
		.string()
		.regex(/^[A-Z]{2}$/, 'country must be a 2-letter uppercase ISO code'),
	state: z.string().min(1).max(16).optional(),
	cityId: z.string().min(1).max(32),
})

/** `setup.getStates` input — a single country code. */
const getStatesInput = z.object({
	country: z
		.string()
		.regex(/^[A-Z]{2}$/, 'country must be a 2-letter uppercase ISO code'),
})

/** `setup.getCities` input — a country code + optional state code. */
const getCitiesInput = z.object({
	country: z
		.string()
		.regex(/^[A-Z]{2}$/, 'country must be a 2-letter uppercase ISO code'),
	state: z.string().min(1).max(16).optional(),
})

/**
 * Phase 271 — `setup.setClockFormat` input schema. The operator's 24h⇄AM/PM
 * choice, normalized to the two-way hour-cycle axis.
 */
const setClockFormatInput = z.object({
	hourCycle: z.enum(['h12', 'h23']),
})

// ─── Factory ─────────────────────────────────────────────────────────────

/**
 * Production wire-up — invoked from livinityd start() after the Redis client
 * is available:
 *
 *   const setup = createSetupRouter({redis: livinityd.redis, timezoneService})
 *   const appRouter = createAppRouter({chromeMaster, xaiAuth, setup})
 *   setProductionAppRouter(appRouter)
 */
export function createSetupRouter(deps: SetupRouterDeps) {
	return router({
		/**
		 * `setup.getCountries` — all 250 countries as {code, name, region},
		 * sorted by name. Backs the onboarding + Settings Country select.
		 * Read-only; adminProcedure-gated for parity with the rest of setup.*.
		 */
		getCountries: adminProcedure.query(async () => {
			return listCountries()
		}),

		/**
		 * `setup.getStates` — states/provinces for a country as {code, name},
		 * sorted by name. Returns [] for states-less countries; the UI hides the
		 * State select on an empty array and drives the City select straight off
		 * getCities({country}) instead. adminProcedure-gated.
		 */
		getStates: adminProcedure.input(getStatesInput).query(async ({input}) => {
			return listStates(input.country)
		}),

		/**
		 * `setup.getCities` — cities for a (country, state?) pair as
		 * {id, name, timezone}, sorted by name. Each option carries its dataset
		 * id (submitted by setLocation) + resolved IANA timezone (so the UI can
		 * preview the zone without a round-trip). adminProcedure-gated.
		 */
		getCities: adminProcedure.input(getCitiesInput).query(async ({input}) => {
			return listCities(input.country, input.state)
		}),

		/**
		 * `setup.setLocation` — comprehensive country → (state) → city procedure.
		 *
		 * Resolves (country, state?, cityId) → {region, timezone, locale} via the
		 * @countrystatecity dataset (`resolveCity`), then persists the Redis keys
		 * (country, city, region, timezone, locale + optional state) and
		 * propagates the timezone to the system clock via the narrow sudoers
		 * TIMEDATECTL Cmnd_Alias.
		 *
		 * Defense-in-depth ordering:
		 *   1. zod — country regex; cityId non-empty; state optional
		 *   2. resolveCity — the (country, state?, cityId) triple must resolve
		 *   3. timezoneService.validate — Intl resolve-check for the timezone
		 *   4. timezoneService.setSystemTimezone — execFile (argv-array, no shell)
		 *   5. redis.set — only after the system clock change succeeds
		 *
		 * adminProcedure-gated.
		 */
		setLocation: adminProcedure.input(setLocationInput).mutation(async ({input}) => {
			const cityId = Number(input.cityId)
			if (!Number.isInteger(cityId) || cityId <= 0) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: `setLocation: cityId must be a positive integer: ${input.cityId}`,
				})
			}
			const resolved = await resolveCity(input.country, input.state, cityId)
			if (!resolved) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: `setLocation: unresolvable (country, state, cityId): ${input.country} / ${input.state ?? '—'} / ${input.cityId}`,
				})
			}
			// Defense-in-depth: re-validate the dataset's timezone via Intl before
			// invoking timedatectl.
			if (!deps.timezoneService.validate(resolved.timezone)) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: `setLocation: resolved timezone failed Intl validation: ${resolved.timezone}`,
				})
			}
			await deps.timezoneService.setSystemTimezone(resolved.timezone)
			await deps.redis.set('liv:user:country', resolved.country)
			await deps.redis.set('liv:user:city', resolved.city)
			await deps.redis.set('liv:user:region', resolved.region)
			await deps.redis.set('liv:user:timezone', resolved.timezone)
			await deps.redis.set('liv:user:locale', resolved.locale)
			// Optional state read-back key — written when the country has states.
			if (input.state) {
				await deps.redis.set('liv:user:state', input.state)
			}
			return {ok: true as const, state: input.state ?? null, ...resolved}
		}),

		/**
		 * Phase 271 — `setup.getLocation` read-back query.
		 *
		 * Reads the persisted `liv:user:{country,city,region,timezone,locale,
		 * hour_cycle}` keys. Resolves `hourCycle` from the explicit
		 * `liv:user:hour_cycle` override when set, else derives it from the
		 * persisted locale via Intl, else falls back to 'h23'. All location
		 * fields are nullable — a fresh box that never ran the Location step
		 * returns nulls and the UI falls back to browser defaults.
		 *
		 * adminProcedure-gated (same gate as setLocation).
		 */
		getLocation: adminProcedure.query(async () => {
			const [country, state, city, region, timezone, locale, hourCycleRaw] =
				await Promise.all([
					deps.redis.get('liv:user:country'),
					deps.redis.get('liv:user:state'),
					deps.redis.get('liv:user:city'),
					deps.redis.get('liv:user:region'),
					deps.redis.get('liv:user:timezone'),
					deps.redis.get('liv:user:locale'),
					deps.redis.get('liv:user:hour_cycle'),
				])

			const hourCycle: HourCycle =
				normalizeHourCycle(hourCycleRaw) ?? deriveHourCycleFromLocale(locale)

			return {
				country: country ?? null,
				state: state ?? null,
				city: city ?? null,
				region: region ?? null,
				timezone: timezone ?? null,
				locale: locale ?? null,
				hourCycle,
			}
		}),

		/**
		 * Phase 271 — `setup.setClockFormat` mutation. Persists the operator's
		 * 24h⇄AM/PM choice to `liv:user:hour_cycle`. The zod enum is the only
		 * gate — the value is a closed two-element set, not user free-text.
		 *
		 * adminProcedure-gated (same gate as setLocation).
		 */
		setClockFormat: adminProcedure
			.input(setClockFormatInput)
			.mutation(async ({input}) => {
				await deps.redis.set('liv:user:hour_cycle', input.hourCycle)
				return {ok: true as const, hourCycle: input.hourCycle}
			}),
	})
}

// ─── Empty-injection default for back-compat ─────────────────────────────

/**
 * Default export that throws on any service access. Used by
 * `createAppRouter` when no `setup` slot is supplied so the type-inference
 * path in common.ts / `AppRouter` still works. Production livinityd boot
 * replaces this via `createSetupRouter({redis, timezoneService})` +
 * setProductionAppRouter.
 *
 * Mirrors the xaiAuthRouter / chromeMasterRouter empty-injection pattern.
 */
function emptyInjectionStub(serviceName: string): never {
	throw new Error(
		`setup-router: ${serviceName} not injected — call createSetupRouter({redis, timezoneService}) in livinityd boot, then setProductionAppRouter(createAppRouter({chromeMaster, xaiAuth, setup}))`,
	)
}

export const setupRouter = createSetupRouter({
	redis: new Proxy({} as SetupRedisClient, {
		get() {
			return emptyInjectionStub('redis')
		},
	}),
	timezoneService: new Proxy({} as TimezoneService, {
		get() {
			return emptyInjectionStub('timezoneService')
		},
	}),
})
