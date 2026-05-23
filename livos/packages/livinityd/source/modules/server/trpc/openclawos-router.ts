/**
 * Phase 203-04 — `openclawos.apps.*` tRPC router.
 *
 * 6 adminProcedure-gated routes that expose the `livos_openui_apps` table
 * to the rebranded openclaw plugin (`liv-claw-os/packages/claw-plugin`).
 * The plugin's `app_create` / `app_update` / `get_app` / list / delete
 * gateway methods + tool implementations now POST to these endpoints
 * instead of writing JSON files to `{stateDir}/plugins/openclaw-os/apps/`.
 *
 * Procedures:
 *
 *   - openclawos.apps.list       → query  → LivosOpenuiApp[] (limit ≤ 200)
 *   - openclawos.apps.get        → query  → LivosOpenuiApp | null
 *   - openclawos.apps.create     → mutate → LivosOpenuiApp (slug, name, content[, userId])
 *   - openclawos.apps.update     → mutate → LivosOpenuiApp (same shape; bumps version)
 *   - openclawos.apps.delete     → mutate → {ok: true}
 *   - openclawos.apps.version    → query  → {version: int | null}
 *
 * Decisions honoured:
 *   D-203-09 — Postgres persistence shape (slug PK, version int, etc.)
 *   D-203-12 — auth shim hand-off to Plan 203-05; for now these routes use
 *              adminProcedure (LIVINITY_SESSION JWT cookie OR Bearer header).
 *              Plan 203-05 will add the LIV_PLUGIN_TOKEN service header on
 *              top of (NOT instead of) adminProcedure so the plugin process
 *              can call without holding an admin JWT.
 *
 * Threat mitigations:
 *   T-203-03 — `content` validated against the 14-component whitelist +
 *              isSafeUrl() guard via `validateOpenUITree` BEFORE the row
 *              touches Postgres. Reject on first failure with BAD_REQUEST
 *              + OPENUI_DISALLOWED_COMPONENT (or OPENUI_UNSAFE_URL,
 *              OPENUI_RAW_HTML).
 *   INV-203-09 — `mcp.*` + `agents.*` namespaces untouched (this is a
 *                NEW top-level namespace).
 *
 * All 6 procedure paths are also added to `httpOnlyPaths` in `./common.ts`
 * so the plugin's HTTP client (loopback fetch) cannot accidentally land on
 * the WebSocket transport. (Mutations on a half-broken WS hang silently
 * per memory pitfall B-12.)
 */

import {TRPCError} from '@trpc/server'
import {z} from 'zod'

import type {OpenUIAppsRepository} from '../../openclawos/openui-apps-repository.js'
import {validateOpenUITree} from '../../openui/validator.js'
import {adminProcedure, router} from './trpc.js'

export interface OpenclawosAppsRouterDeps {
	repo: OpenUIAppsRepository
	logger: {
		info: (msg: string) => void
		warn: (msg: string, error?: unknown) => void
	}
}

const SlugSchema = z
	.string()
	.min(1)
	.max(120)
	.regex(/^[a-z0-9][a-z0-9-_]*$/i, 'OPENUI_SLUG_INVALID')

const AppCreateSchema = z.object({
	slug: SlugSchema,
	name: z.string().min(1).max(200),
	content: z.string().min(1).max(200_000),
	userId: z.string().min(1).max(120).nullish(),
})

const AppUpdateSchema = AppCreateSchema // same shape — upsert bumps version

const ListInputSchema = z
	.object({
		limit: z.number().int().min(1).max(200).default(50),
	})
	.default({limit: 50})

/**
 * Validate JSON-encoded OpenUI Lang content. The plugin emits OpenUI lang
 * SOURCE (a string) to `app_create`/`app_update`, but the validator works on
 * the parsed JSON tree. Inputs that are already JSON-stringified objects
 * (e.g. when the front-end serializes the tree itself) are parsed and
 * walked; raw lang source is accepted as-is (validator returns ok for
 * primitives, and a raw lang string is not a tree).
 *
 * If the content does not parse as JSON, we treat it as pre-tree lang
 * source — the openui-lang parser inside the plugin's `lint-openui` hook is
 * the structural gate for that case. The validator's job here is to STOP
 * already-rendered-tree XSS vectors, not lint the DSL.
 */
function validateContent(content: string): void {
	const trimmed = content.trim()
	if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
		// Likely raw lang source; defer structural validation to the plugin
		// lint pass + the renderer's own walker.
		return
	}
	let parsed: unknown
	try {
		parsed = JSON.parse(trimmed)
	} catch {
		// Looks like JSON but isn't — let it pass; the plugin lint pass will
		// reject it. We don't want to false-positive on lang strings that
		// happen to start with `{` (unlikely but possible).
		return
	}
	const r = validateOpenUITree(parsed)
	if (!r.ok) {
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: r.reason,
		})
	}
}

function mapRepoError(err: unknown): TRPCError {
	// Pre-mapped TRPCErrors (e.g. the empty-injection stub's PRECONDITION_FAILED)
	// flow through unchanged — re-wrapping would lose the explicit code/message
	// the caller depends on for differentiating availability vs unique-violation.
	if (err instanceof TRPCError) return err
	const msg = err instanceof Error ? err.message : String(err)
	if (/duplicate key value violates unique constraint/i.test(msg)) {
		return new TRPCError({code: 'CONFLICT', message: 'OPENUI_APP_SLUG_TAKEN'})
	}
	if (/violates foreign key/i.test(msg)) {
		return new TRPCError({
			code: 'BAD_REQUEST',
			message: 'OPENUI_APP_FK_VIOLATION',
		})
	}
	return new TRPCError({code: 'INTERNAL_SERVER_ERROR', message: msg})
}

export function createOpenclawosAppsRouter(deps: OpenclawosAppsRouterDeps) {
	return router({
		list: adminProcedure.input(ListInputSchema).query(async ({input}) => {
			try {
				return await deps.repo.listAll({limit: input.limit})
			} catch (err) {
				throw mapRepoError(err)
			}
		}),

		get: adminProcedure
			.input(z.object({slug: SlugSchema}))
			.query(async ({input}) => {
				try {
					const row = await deps.repo.getBySlug(input.slug)
					if (!row) {
						throw new TRPCError({
							code: 'NOT_FOUND',
							message: 'OPENUI_APP_NOT_FOUND',
						})
					}
					return row
				} catch (err) {
					if (err instanceof TRPCError) throw err
					throw mapRepoError(err)
				}
			}),

		create: adminProcedure
			.input(AppCreateSchema)
			.mutation(async ({input}) => {
				validateContent(input.content)
				try {
					const row = await deps.repo.upsert({
						slug: input.slug,
						name: input.name,
						content: input.content,
						userId: input.userId ?? null,
					})
					deps.logger.info(
						`Phase 203-04 openclawos.apps.create — slug=${row.slug} v${row.version}`,
					)
					return row
				} catch (err) {
					throw mapRepoError(err)
				}
			}),

		update: adminProcedure
			.input(AppUpdateSchema)
			.mutation(async ({input}) => {
				validateContent(input.content)
				try {
					const row = await deps.repo.upsert({
						slug: input.slug,
						name: input.name,
						content: input.content,
						userId: input.userId ?? null,
					})
					deps.logger.info(
						`Phase 203-04 openclawos.apps.update — slug=${row.slug} v${row.version}`,
					)
					return row
				} catch (err) {
					throw mapRepoError(err)
				}
			}),

		delete: adminProcedure
			.input(z.object({slug: SlugSchema}))
			.mutation(async ({input}) => {
				try {
					await deps.repo.delete(input.slug)
					deps.logger.info(
						`Phase 203-04 openclawos.apps.delete — slug=${input.slug}`,
					)
					// Plan 203-10 will fire `NativeAppConfigStore.delete` here
					// for the desktop-dock unregister hook (D-203-10).
					return {ok: true as const}
				} catch (err) {
					throw mapRepoError(err)
				}
			}),

		version: adminProcedure
			.input(z.object({slug: SlugSchema}))
			.query(async ({input}) => {
				try {
					const v = await deps.repo.currentVersion(input.slug)
					return {version: v}
				} catch (err) {
					throw mapRepoError(err)
				}
			}),
	})
}

export type OpenclawosAppsRouter = ReturnType<typeof createOpenclawosAppsRouter>

/**
 * Default empty-injection stub returned when production boot has not yet
 * wired the repository (e.g. degraded DB connectivity at startup). Every
 * procedure throws PRECONDITION_FAILED + OPENUI_REPO_UNAVAILABLE so the
 * plugin's HTTP client surfaces a clean error rather than hanging.
 *
 * Mirrors the agent-router default-stub pattern from Plan 202-03.
 */
export const openclawosAppsRouter = createOpenclawosAppsRouter({
	repo: {
		listAll: () => Promise.reject(unavailable()),
		getBySlug: () => Promise.reject(unavailable()),
		upsert: () => Promise.reject(unavailable()),
		delete: () => Promise.reject(unavailable()),
		versions: () => Promise.reject(unavailable()),
		currentVersion: () => Promise.reject(unavailable()),
		incrementVersion: () => Promise.reject(unavailable()),
	} as unknown as OpenUIAppsRepository,
	logger: {info: () => undefined, warn: () => undefined},
})

function unavailable(): TRPCError {
	return new TRPCError({
		code: 'PRECONDITION_FAILED',
		message: 'OPENUI_REPO_UNAVAILABLE',
	})
}
