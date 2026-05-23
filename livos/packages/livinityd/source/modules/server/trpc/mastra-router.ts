/**
 * Phase 203-08 — `mastra.agent.*` tRPC router (Mastra-purged rewrite).
 *
 * After Plan 203-08 the underlying runtime is openclaw, NOT Mastra.
 * The router NAMESPACE stays `mastra.agent.*` (INV-203-09 contract
 * preservation — Phase 202 frontend at `liv-ai-app/app/settings` calls
 * `mastra.agent.listAvailableModels`, `mastra.agent.getActiveModel`,
 * `mastra.agent.setActiveModel`, `mastra.agent.listBuiltInTools`). The
 * router INTERNALS are repointed at the new `agent-runtime/` module subtree;
 * the old Mastra-specific procedures (`stream`, `approve`, `cancel`,
 * `threads.*`) are DELETED — they were already deprecated by Phase 198 in
 * favour of `POST /chat/livAi` and are now superseded by the openclaw
 * gateway's own chat surface.
 *
 * Surviving procedures (all preserve identical zod input + return shape):
 *   - mastra.agent.listAvailableModels  (privateProcedure → {id, name, description}[])
 *   - mastra.agent.listBuiltInTools     (privateProcedure → BUILT_IN_TOOL_CATALOG)
 *   - mastra.agent.getActiveModel       (privateProcedure → {modelName})
 *   - mastra.agent.setActiveModel       (adminProcedure   → {modelName})
 *
 * Future Phase 220+ may rename the namespace to `agentRuntime.*` to reflect
 * the underlying runtime; until then the namespace stays `mastra` to avoid a
 * frontend round-trip rewrite.
 */

import {TRPCError} from '@trpc/server'
import {z} from 'zod'

import {BUILT_IN_TOOL_CATALOG} from '../../agent-runtime/agents/built-in-tools.js'
import {
	ALLOWED_XAI_MODELS,
	type AllowedXaiModel,
	coerceModel,
} from '../../agent-runtime/provider-router.js'
import {redactError} from '../../agent-runtime/redact-error.js'
import {adminProcedure, privateProcedure, router} from './trpc.js'

/**
 * Narrow Redis client surface needed by `getActiveModel` / `setActiveModel`
 * (D-199-10 + D-199-11). Matches the ioredis runtime shape (.get/.set
 * promises) and the test-mock stub.
 */
export interface MastraRedisClient {
	get(key: string): Promise<string | null>
	set(key: string, value: string): Promise<unknown>
}

export interface MastraRouterDeps {
	/**
	 * Phase 199-07 — Redis client for `liv:config:active_model` persistence
	 * (D-199-10 + INV-199-03). Optional for back-compat — the procedures
	 * throw `PRECONDITION_FAILED` when missing.
	 */
	redis?: MastraRedisClient
}

const REDIS_ACTIVE_MODEL_KEY = 'liv:config:active_model'

/**
 * Phase 199-02 / D-199-11 — Per-model human-readable labels for the model picker.
 */
const LIV_AI_MODEL_LABELS: Record<AllowedXaiModel, {name: string; description: string}> = {
	'grok-4.20-0309-non-reasoning': {name: 'Grok 4.20', description: 'Fast non-reasoning. Default.'},
	'grok-4.20-0309-reasoning': {name: 'Grok 4.20 Think', description: 'Multi-step reasoning (slower).'},
	'grok-4.3': {name: 'Grok 4.3', description: 'Latest. Reasoning + tool use.'},
}

/**
 * Phase 203-08 — empty-injection stub. Mirrors the empty-injection Proxy
 * pattern other tRPC slots use so the appRouter still type-infers when the
 * production wire-up runs before `createMastraRouter({...})` (boot ordering)
 * or when the agent-runtime wire-up errored out.
 *
 * Every procedure call surfaces `PRECONDITION_FAILED` with a clear message;
 * the production replacement (createMastraRouter below) is supplied by the
 * boot wire-up in livinityd/source/index.ts.
 */
export const mastraRouter = router({
	agent: router({
		listAvailableModels: privateProcedure.query(() => {
			throw new TRPCError({
				code: 'PRECONDITION_FAILED',
				message: 'mastra-router: production wire-up not ready',
			})
		}),
		listBuiltInTools: privateProcedure.query(() => {
			throw new TRPCError({
				code: 'PRECONDITION_FAILED',
				message: 'mastra-router: production wire-up not ready',
			})
		}),
		getActiveModel: privateProcedure.query(() => {
			throw new TRPCError({
				code: 'PRECONDITION_FAILED',
				message: 'mastra-router: production wire-up not ready',
			})
		}),
		setActiveModel: adminProcedure
			.input(z.object({modelName: z.string()}))
			.mutation(() => {
				throw new TRPCError({
					code: 'PRECONDITION_FAILED',
					message: 'mastra-router: production wire-up not ready',
				})
			}),
	}),
})

export function createMastraRouter(deps: MastraRouterDeps) {
	if (process.env.NODE_ENV === 'development') {
		console.warn(
			'[mastra-router] tRPC mastra.agent.* namespace is Plan 203-08 Mastra-purged; underlying runtime is openclaw.',
		)
	}
	return router({
		agent: router({
			listAvailableModels: privateProcedure.query(async () => {
				return ALLOWED_XAI_MODELS.map((id) => ({id, ...LIV_AI_MODEL_LABELS[id]}))
			}),

			listBuiltInTools: privateProcedure.query(() => BUILT_IN_TOOL_CATALOG),

			getActiveModel: privateProcedure.query(async () => {
				if (!deps.redis) {
					throw new TRPCError({
						code: 'PRECONDITION_FAILED',
						message: 'mastra-router: redis client not injected — getActiveModel unavailable',
					})
				}
				try {
					const raw = await deps.redis.get(REDIS_ACTIVE_MODEL_KEY)
					const modelName = coerceModel(raw)
					return {modelName}
				} catch (err) {
					const red = redactError(err)
					throw new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: red.message,
						cause: red,
					})
				}
			}),

			setActiveModel: adminProcedure
				.input(
					z.object({
						modelName: z.enum(
							ALLOWED_XAI_MODELS as unknown as [
								AllowedXaiModel,
								...AllowedXaiModel[],
							],
						),
					}),
				)
				.mutation(async ({input}) => {
					if (!deps.redis) {
						throw new TRPCError({
							code: 'PRECONDITION_FAILED',
							message: 'mastra-router: redis client not injected — setActiveModel unavailable',
						})
					}
					try {
						await deps.redis.set(REDIS_ACTIVE_MODEL_KEY, input.modelName)
						return {modelName: input.modelName}
					} catch (err) {
						const red = redactError(err)
						throw new TRPCError({
							code: 'INTERNAL_SERVER_ERROR',
							message: red.message,
							cause: red,
						})
					}
				}),
		}),
	})
}
