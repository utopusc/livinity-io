/**
 * Phase 196-04 — `setup.*` tRPC namespace.
 *
 * Single procedure today: `setup.setRegion` (adminProcedure mutation).
 *
 *   - Zod schema gates region values against the canonical 6-element
 *     REGIONS allow-list from `../../locale/region-suggestion.ts`. A
 *     client sending `region: 'mars'` is rejected with BAD_REQUEST
 *     before the procedure body runs (T-196-04-01 Tampering mitigation).
 *   - Optional `country` field: zod `regex(/^[A-Z]{2}$/)` enforces a
 *     2-letter uppercase ISO-3166-1 code (T-196-04-02 path-traversal
 *     defense-in-depth — Redis SET writes the value as the VALUE not
 *     the KEY, so a regex bypass still can't traverse).
 *   - Persists to Redis keys `liv:user:region` (always) and
 *     `liv:user:country` (only if present in input).
 *
 * Future plans (196-05 + onward) extend this namespace with
 * `setup.setLocaleTimezone`, `setup.setProvider`, etc — the empty-injection
 * default proxy pattern mirrors xai-auth-router.ts exactly so production
 * livinityd boot can swap in a real `createSetupRouter({redis})` via
 * `setProductionAppRouter(createAppRouter({chromeMaster, xaiAuth, setup}))`.
 *
 * D-196-04-DI: the router takes a `{redis}` dep object. Production
 * livinityd boot (Plan 196-05's responsibility) constructs the dep set
 * and injects it; the bare `setupRouter` default throws on access until
 * that swap lands.
 *
 * D-196-04-HTTP-ONLY: `setup.setRegion` is added to `httpOnlyPaths` in
 * ./common.ts because the onboarding mutation must survive WS reconnect
 * across the systemctl restart livos window (memory pitfall B-12 / X-04
 * cluster — same rationale as `auth.xai.*` family in 195-03).
 */

import {z} from 'zod'

import {adminProcedure, router} from './trpc.js'
import {REGIONS, type Region} from '../../locale/index.js'

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
		`setup-router: ${serviceName} not injected — call createSetupRouter({redis}) in livinityd boot, then setProductionAppRouter(createAppRouter({chromeMaster, xaiAuth, setup}))`,
	)
}

export const setupRouter = createSetupRouter({
	redis: new Proxy({} as SetupRedisClient, {
		get() {
			return emptyInjectionStub('redis')
		},
	}),
})
