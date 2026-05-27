/**
 * Phase 224 — App Store: hide Skills/MCP/AI tabs (feature-flagged).
 *
 * ROADMAP: "Phase 224: App Store — hide Skills/MCP/AI tabs (feature-flagged)".
 *
 * Single publicProcedure tRPC query (`config.getV42MigrationActive`) that
 * reads the Redis string key `liv:config:liv_v42_migration_active` and
 * returns `{active: boolean}`.
 *
 * Default-ON contract (D-V42-ROLLBACK reversibility):
 *   - Key missing                    → {active: true}   (default-ON)
 *   - Value === the literal 'false'  → {active: false}  (rollback)
 *   - Any other value (incl. 'true') → {active: true}
 *
 * `publicProcedure` is used intentionally — the login screen sits inside the
 * same React tree as the App Store and Settings windows that consume the
 * `useV42MigrationActive()` hook. Restricting this read to authenticated
 * sessions would make the login screen flicker the about-to-be-hidden
 * surfaces between mount and the post-login refetch. The flag has no
 * mutation surface in Phase 224 (operators flip the Redis key from the
 * Mini PC shell), so leaking the boolean to anonymous callers is harmless.
 *
 * D-V42-SACRED: this file lives under `livos/packages/livinityd/` and does
 * NOT touch `liv/packages/core/`. Sacred SHA
 * `f3538e1d811992b782a9bb057d1b7f0a0189f95f` is UNCHANGED by this plan.
 *
 * D-V42-ROLLBACK: setting `liv:config:liv_v42_migration_active` to the
 * literal string `'false'` restores pre-Phase-224 visibility live, with
 * NO server restart and NO code revert.
 *
 * D-V42-NO-DATA-LOSS: this router only READS the flag — no schema or data
 * mutations are introduced by this plan.
 *
 * Mirrors the factory-DI + empty-injection-stub idiom used by the sibling
 * `mcp-config-router.ts` / `xai-auth-router.ts` / `setup-router.ts` files:
 *
 *   - `createConfigRouter({redis})` — production wire-up
 *   - `configRouter` — default empty-injection stub via Proxy that throws
 *     `TRPCError({code: 'PRECONDITION_FAILED', ...})` on any property access
 *     so `createAppRouter({})` still type-checks but any accidental routing
 *     through the stub before boot wires the real Redis surfaces a loud
 *     server-side error instead of a silent default.
 */

import {TRPCError} from '@trpc/server'

import {publicProcedure, router} from './trpc.js'

/** Redis string key backing the Phase 224 feature flag. */
export const V42_MIGRATION_REDIS_KEY = 'liv:config:liv_v42_migration_active'

/**
 * Minimal Redis surface — just `.get`. Matches the ioredis runtime and the
 * test-mock pattern used by sibling routers (mcp-config-router.ts uses
 * the same shape with optional fields, but this router only needs the
 * single `get` call so we keep the interface narrow).
 */
export interface ConfigRedisClient {
	get(key: string): Promise<string | null>
}

export interface ConfigRouterDeps {
	redis: ConfigRedisClient
}

/**
 * Production wire-up — invoked from livinityd start() after the ioredis
 * client is constructed:
 *
 *   const configRouterProductionInstance = createConfigRouter({redis: this.ai.redis})
 *   const appRouter = createAppRouter({..., config: configRouterProductionInstance})
 *   setProductionAppRouter(appRouter)
 */
export function createConfigRouter(deps: ConfigRouterDeps) {
	return router({
		getV42MigrationActive: publicProcedure.query(async () => {
			const raw = await deps.redis.get(V42_MIGRATION_REDIS_KEY)
			// Default ON when key missing (v42 migration mode is default during v42 development).
			// Default ON when value is anything other than the literal string 'false'.
			const active = raw === null ? true : raw !== 'false'
			return {active}
		}),
	})
}

// ─── Empty-injection default for back-compat ─────────────────────────────

/**
 * Default empty-injection stub. Used by `createAppRouter()` when no
 * `config` opt is supplied so the type-inference path stays intact for
 * tests + back-compat callers. Production livinityd boot replaces this
 * via the factory call above (see livinityd/source/index.ts).
 *
 * Mirrors the xai-auth-router.ts / setup-router.ts default-stub idiom:
 * any property access on the Proxy throws PRECONDITION_FAILED with the
 * sentinel `CONFIG_ROUTER_NOT_WIRED` so the failure mode is loud and
 * traceable rather than a silent default-true (which could hide a
 * misconfigured production boot).
 */
function notInjected(): never {
	throw new TRPCError({
		code: 'PRECONDITION_FAILED',
		message: 'CONFIG_ROUTER_NOT_WIRED',
	})
}

export const configRouter = createConfigRouter({
	redis: new Proxy({} as ConfigRedisClient, {
		get() {
			return notInjected
		},
	}),
})

export type ConfigRouter = ReturnType<typeof createConfigRouter>
