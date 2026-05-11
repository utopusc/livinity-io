/**
 * Phase 101-03 Task 3 — tRPC routes apps.native.{list,get,create,delete}.
 *
 * Surface (UUID-keyed CRUD over the `liv:apps:native:*` Redis namespace):
 *   - apps.native.list   query    (privateProcedure)  — any logged-in user
 *   - apps.native.get    query    (privateProcedure)  — any logged-in user
 *   - apps.native.create mutation (adminProcedure)    — admin only
 *   - apps.native.delete mutation (adminProcedure)    — admin only
 *
 * Routes are admin-gated on mutations per the T-101-02 threat-register row:
 * binaryPath ultimately executes as the bruce service user, so only admins
 * may add or remove native-app configs. Reads are open to any logged-in
 * user (the dock needs to render the icons for everyone).
 *
 * httpOnlyPaths: all four paths are registered in server/trpc/common.ts
 * so the React client routes them over Express HTTP (mutations survive
 * `systemctl restart livos` mid-flight; matches the conventions documented
 * in common.ts for apiKeys.*, agents.*, webapp.* etc.).
 *
 * Construction: this file exports `buildNativeAppsRouter(ctxAccessor)`,
 * where the accessor pulls the store off `ctx.livinityd.nativeAppConfigStore`
 * (wired by Task 4 in `livos/packages/livinityd/source/index.ts`). When
 * the store is undefined (e.g. boot edge before Livinityd.start() finishes
 * or Redis unavailable), the routes throw a clean SERVICE_UNAVAILABLE.
 */

import {z} from 'zod'
import {TRPCError} from '@trpc/server'

import {router, privateProcedure, adminProcedure} from '../server/trpc/trpc.js'
import {
	nativeAppConfigSchema,
	type NativeAppConfigStore,
} from './native-app-config.js'

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Resolve the NativeAppConfigStore off ctx.livinityd. Throws a clean
 * `SERVICE_UNAVAILABLE` TRPCError when the store has not been wired yet
 * (boot edge, Redis offline, etc.) — same pattern as `requirePool()` in
 * agents-router.ts.
 */
function requireStore(ctx: {livinityd?: {nativeAppConfigStore?: NativeAppConfigStore | null}}): NativeAppConfigStore {
	const store = ctx.livinityd?.nativeAppConfigStore
	if (!store) {
		throw new TRPCError({
			code: 'INTERNAL_SERVER_ERROR',
			message: 'Native app store not initialized (Redis unavailable?)',
		})
	}
	return store
}

// ─── Input schemas ──────────────────────────────────────────────────────────

const getInput = z.object({id: z.string().uuid()})
const deleteInput = z.object({id: z.string().uuid()})

// ─── Router ─────────────────────────────────────────────────────────────────

/**
 * tRPC router for `apps.native.*`. Returned as a plain `router({...})` so
 * the parent composition in server/trpc/index.ts can either:
 *   (a) merge into the existing `apps` router via `t.mergeRouters` with a
 *       wrapper `router({native: nativeAppsRouter})`, OR
 *   (b) attach as a nested router under any other namespace if the
 *       composition evolves.
 *
 * Tests can construct the router directly and exercise it against any
 * NativeAppConfigStore (production: ioredis-backed; tests: FakeRedis).
 */
export const nativeAppsRouter = router({
	/**
	 * apps.native.list — return every config in `liv:apps:native:*`.
	 * Open to any logged-in user so the dock can render icons.
	 */
	list: privateProcedure.query(async ({ctx}) => {
		const store = requireStore(ctx)
		return store.list()
	}),

	/**
	 * apps.native.get — fetch a single config by UUID. Returns null when
	 * the config does not exist (caller's UI shows a "not found" state).
	 */
	get: privateProcedure
		.input(getInput)
		.query(async ({ctx, input}) => {
			const store = requireStore(ctx)
			return store.get(input.id)
		}),

	/**
	 * apps.native.create — upsert a config (idempotent; same UUID overwrites).
	 *
	 * Admin-only per T-101-02. The `nativeAppConfigSchema` input gate is the
	 * authoritative validation — the spawner re-parses defense-in-depth, but
	 * if a config is rejected here it never reaches Redis.
	 *
	 * Returns `{id}` so the UI can immediately invalidate `apps.native.list`
	 * and (in P101-07) navigate to the new icon.
	 */
	create: adminProcedure
		.input(nativeAppConfigSchema)
		.mutation(async ({ctx, input}) => {
			const store = requireStore(ctx)
			await store.upsert(input)
			return {id: input.id}
		}),

	/**
	 * apps.native.delete — remove a config by UUID. Idempotent (repeat
	 * deletes of the same id return `{deleted: false}` instead of throwing).
	 */
	delete: adminProcedure
		.input(deleteInput)
		.mutation(async ({ctx, input}) => {
			const store = requireStore(ctx)
			const deleted = await store.delete(input.id)
			return {deleted}
		}),
})

export type NativeAppsRouter = typeof nativeAppsRouter
