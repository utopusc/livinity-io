/**
 * Phase 196-04 / 196-05 — `setup.*` tRPC namespace.
 *
 * Two procedures today (after 196-05):
 *
 *   - `setup.setRegion` (Plan 196-04) — adminProcedure mutation.
 *     Zod schema gates region values against the canonical 6-element
 *     REGIONS allow-list from `../../locale/region-suggestion.ts`. A
 *     client sending `region: 'mars'` is rejected with BAD_REQUEST
 *     before the procedure body runs (T-196-04-01 Tampering mitigation).
 *     Optional `country` field: zod `regex(/^[A-Z]{2}$/)` enforces a
 *     2-letter uppercase ISO-3166-1 code (T-196-04-02 path-traversal
 *     defense-in-depth). Persists to Redis keys `liv:user:region`
 *     (always) and `liv:user:country` (only if present in input).
 *
 *   - `setup.setLocaleTimezone` (Plan 196-05) — adminProcedure mutation.
 *     Zod gates timezone (non-empty string) + locale (z.enum of 6
 *     supported codes). Body re-validates timezone via
 *     `timezoneService.validate()` (defense-in-depth — even if a future
 *     caller bypasses zod, the Intl gate still fires before timedatectl).
 *     On success: `timezoneService.setSystemTimezone(zone)` runs `sudo
 *     /usr/bin/timedatectl set-timezone <zone>` via the narrow sudoers
 *     Cmnd_Alias extended in this same plan, then persists to
 *     `liv:user:timezone` + `liv:user:locale`.
 *
 * Future plans (e.g. `setup.setProvider`) extend this namespace too —
 * the empty-injection default proxy pattern mirrors xai-auth-router.ts
 * exactly so production livinityd boot can swap in a real
 * `createSetupRouter({redis, timezoneService})` via
 * `setProductionAppRouter(createAppRouter({chromeMaster, xaiAuth, setup}))`.
 *
 * D-196-04-DI / D-196-05-DI: the router takes a `{redis, timezoneService}`
 * dep object. Production livinityd boot (Plan 196-05 Task 5) constructs
 * both deps and injects them; the bare `setupRouter` default throws on
 * access until that swap lands.
 *
 * D-196-04-HTTP-ONLY / D-196-05-HTTP-ONLY: both procedures are in
 * `httpOnlyPaths` in ./common.ts because the onboarding mutation must
 * survive WS reconnect across the systemctl restart livos window
 * (memory pitfall B-12 / X-04 cluster — same rationale as `auth.xai.*`
 * family in 195-03).
 */

import {TRPCError} from '@trpc/server'
import {z} from 'zod'

import {adminProcedure, router} from './trpc.js'
import {
	COUNTRIES,
	REGIONS,
	resolveLocation,
	type Region,
	type TimezoneService,
} from '../../locale/index.js'

// ─── Service DI shape ────────────────────────────────────────────────────

/**
 * Minimal Redis client surface the setup router needs. Matches both
 * the ioredis `Redis` runtime shape and the redis-mock test double —
 * we only call `.set(key, value)`.
 */
export interface SetupRedisClient {
	set(key: string, value: string): Promise<unknown>
}

export interface SetupRouterDeps {
	redis: SetupRedisClient
	/**
	 * Phase 196-05 — TimezoneService for `setup.setLocaleTimezone`.
	 * Production wire-up at livinityd/source/index.ts constructs via
	 * `createTimezoneService()`; tests inject a mock.
	 */
	timezoneService: TimezoneService
}

// ─── Input schemas ───────────────────────────────────────────────────────

/**
 * T-196-04-01 mitigation — `region` MUST be one of the 6 canonical
 * values from the locale module. `z.enum([...REGIONS])` spreads the
 * frozen array into a tuple of literal-string members so zod constructs
 * a real enum schema, and any future addition to REGIONS automatically
 * extends the wire-format enum without a separate edit here.
 *
 * T-196-04-02 mitigation — `country` is optional but, when present,
 * must match `^[A-Z]{2}$`: exactly two uppercase ASCII letters. Defeats
 * `country: '../etc/passwd'` and similar path-traversal-flavoured input.
 */
const setRegionInput = z.object({
	region: z.enum(REGIONS as readonly [Region, ...Region[]]),
	country: z
		.string()
		.regex(/^[A-Z]{2}$/)
		.optional(),
})

/**
 * Phase 196-05 — `setup.setLocaleTimezone` input schema.
 *
 * T-196-05-01 Tampering mitigation (layer 1 — zod): the locale field is
 * a hard z.enum of 6 supported codes. The timezone field is a non-empty
 * string but the SHAPE of valid IANA zones (a few hundred) is too large
 * to embed as a zod enum without bloating the wire-format types, so
 * runtime validation is delegated to the timezoneService.validate()
 * gate inside the procedure body (layer 2 — Intl set membership).
 *
 * The two-layer design means even a future caller that bypasses this
 * zod schema entirely still cannot reach `execFile('sudo', ...)` with
 * an unvalidated zone — see timezone-service.test.ts T6 + T8 for the
 * defense-in-depth regression-lock.
 */
const SUPPORTED_LOCALES = [
	'en-US',
	'tr-TR',
	'de-DE',
	'fr-FR',
	'es-ES',
	'ar-SA',
] as const
const setLocaleTimezoneInput = z.object({
	timezone: z.string().min(1),
	locale: z.enum(SUPPORTED_LOCALES),
})

/**
 * Phase 196.1 — `setup.setLocation` input schema.
 *
 * Replaces the Phase 196-04 (setRegion) + Phase 196-05 (setLocaleTimezone)
 * two-step flow with a single Country + City picker. The pair is resolved
 * server-side via `resolveLocation()` from the canonical curated catalog;
 * unknown country or city values are rejected with BAD_REQUEST.
 *
 * The 2-letter country regex defense-in-depth against path-traversal-flavoured
 * input mirrors the Phase 196-04 setRegion gate.
 */
const VALID_COUNTRY_CODES = COUNTRIES.map((c) => c.code) as readonly string[]
const setLocationInput = z.object({
	country: z
		.string()
		.regex(/^[A-Z]{2}$/, 'country must be a 2-letter uppercase ISO code')
		.refine((c) => VALID_COUNTRY_CODES.includes(c), 'unknown country'),
	city: z.string().min(1).max(64),
})

// ─── Factory ─────────────────────────────────────────────────────────────

/**
 * Production wire-up — invoked from livinityd start() (Plan 196-05) after
 * the Redis client is available:
 *
 *   const setup = createSetupRouter({redis: livinityd.redis})
 *   const appRouter = createAppRouter({chromeMaster, xaiAuth, setup})
 *   setProductionAppRouter(appRouter)
 */
export function createSetupRouter(deps: SetupRouterDeps) {
	return router({
		/**
		 * Persist the operator's region selection (and optionally a country
		 * sub-pick) to Redis. adminProcedure-gated (T-196-04-04 EoP —
		 * only authenticated admin operators may call).
		 */
		setRegion: adminProcedure.input(setRegionInput).mutation(async ({input}) => {
			await deps.redis.set('liv:user:region', input.region)
			if (input.country) {
				await deps.redis.set('liv:user:country', input.country)
			}
			return {ok: true as const}
		}),

		/**
		 * Phase 196-05 — Persist the operator's locale + timezone selection
		 * AND propagate the timezone to the system clock via the narrow
		 * sudoers TIMEDATECTL Cmnd_Alias.
		 *
		 * Defense-in-depth ordering:
		 *   1. zod (above) — locale enum + timezone non-empty string
		 *   2. timezoneService.validate — Intl set membership for the timezone
		 *   3. timezoneService.setSystemTimezone — execFile (argv-array, no
		 *      shell) + 10s timeout
		 *   4. redis.set — only after the system clock change succeeds, so a
		 *      timedatectl failure does NOT leave Redis claiming a zone that
		 *      isn't actually live
		 *
		 * adminProcedure-gated (T-196-05-03 EoP — mirrors setRegion).
		 */
		setLocaleTimezone: adminProcedure
			.input(setLocaleTimezoneInput)
			.mutation(async ({input}) => {
				// Defense-in-depth: re-validate via Intl even though the UI
				// only offers values from `Intl.supportedValuesOf('timeZone')`.
				if (!deps.timezoneService.validate(input.timezone)) {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: 'Phase 196-05: invalid IANA timezone',
					})
				}
				// Propagate to the system clock BEFORE persisting to Redis —
				// failures bubble up as TRPCError surfaces so the UI can show
				// "permission denied" / "timedatectl exit 1" inline.
				await deps.timezoneService.setSystemTimezone(input.timezone)
				await deps.redis.set('liv:user:timezone', input.timezone)
				await deps.redis.set('liv:user:locale', input.locale)
				return {ok: true as const, timezone: input.timezone, locale: input.locale}
			}),

		/**
		 * Phase 196.1 — `setup.setLocation` merged Country+City procedure.
		 *
		 * Resolves (country, city) → {region, timezone, locale} via the
		 * curated COUNTRIES catalog, then persists ALL FIVE Redis keys
		 * (country, city, region, timezone, locale) and propagates the
		 * timezone to the system clock via the same narrow sudoers
		 * TIMEDATECTL Cmnd_Alias as setLocaleTimezone.
		 *
		 * Defense-in-depth ordering (same as setLocaleTimezone but extended):
		 *   1. zod — country regex + COUNTRIES membership; city non-empty
		 *   2. resolveLocation — (country, city) pair must exist in catalog
		 *   3. timezoneService.validate — Intl set membership for the timezone
		 *   4. timezoneService.setSystemTimezone — execFile (argv-array, no shell)
		 *   5. redis.set — only after the system clock change succeeds
		 *
		 * adminProcedure-gated (matches setRegion / setLocaleTimezone).
		 */
		setLocation: adminProcedure.input(setLocationInput).mutation(async ({input}) => {
			const resolved = resolveLocation(input.country, input.city)
			if (!resolved) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: `Phase 196.1: unknown (country, city) pair: ${input.country} / ${input.city}`,
				})
			}
			// Defense-in-depth: even though resolveLocation only returns
			// timezones we ship, re-validate via Intl before invoking
			// timedatectl.
			if (!deps.timezoneService.validate(resolved.timezone)) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: `Phase 196.1: catalog timezone not in Intl set: ${resolved.timezone}`,
				})
			}
			await deps.timezoneService.setSystemTimezone(resolved.timezone)
			await deps.redis.set('liv:user:country', resolved.country)
			await deps.redis.set('liv:user:city', resolved.city)
			await deps.redis.set('liv:user:region', resolved.region)
			await deps.redis.set('liv:user:timezone', resolved.timezone)
			await deps.redis.set('liv:user:locale', resolved.locale)
			return {ok: true as const, ...resolved}
		}),
	})
}

// ─── Empty-injection default for back-compat ─────────────────────────────

/**
 * Default export that throws on any service access. Used by
 * `createAppRouter` when no `setup` slot is supplied so the type-inference
 * path in common.ts / `AppRouter` still works. Production livinityd boot
 * replaces this via `createSetupRouter({redis})` + setProductionAppRouter.
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
	// Phase 196-05 — timezoneService stub. Throws on any access until
	// production createSetupRouter({timezoneService}) injection lands.
	timezoneService: new Proxy({} as TimezoneService, {
		get() {
			return emptyInjectionStub('timezoneService')
		},
	}),
})
