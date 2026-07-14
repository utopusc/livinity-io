/**
 * Phase 316-04 (LLM-01) — `provider.ollamaModels.*` tRPC router.
 *
 * Backs the (316-06) Local Models UI. Four adminProcedure-gated routes
 * (T-316-13 — model pull/delete triggers downloads + disk writes, admin-only):
 *
 *   - provider.ollamaModels.list       → OllamaModel[]        (query)
 *   - provider.ollamaModels.pull       → {started, blocked, guardrail}  (mutation)
 *   - provider.ollamaModels.pullStatus → progress map entry   (query, polled by UI)
 *   - provider.ollamaModels.delete     → {ok, status}         (mutation)
 *
 * Factory-DI mirrors provider-config-router.ts: production boot supplies a
 * real `createOllamaModelsRouter({client, modelsDir, logger})` build via
 * setProductionAppRouter; the exported `ollamaModelsRouter` is an
 * empty-injection stub that throws PRECONDITION_FAILED until that injection
 * lands.
 *
 * The pull is request/response + polled progress (mirrors the App install
 * pattern): the mutation validates the name, runs `checkPullGuardrails`, and
 * BLOCKS BY DEFAULT when a guardrail fails unless `override === true`
 * (T-316-12). On a green (or overridden) guardrail it kicks off a
 * never-throw background job (restart-hook style) that consumes the NDJSON
 * progress stream and updates an in-memory Map; `pullStatus` polls that map.
 *
 * RULE 1 (316-01 DECISION, binding) — list/pull/pullStatus/delete reference
 * ZERO provider-key configuration surface (no gateway env var, no key store).
 * Managing local models never writes a provider key; only 316-05's explicit
 * "Use as Liv model" action may.
 */

import {TRPCError} from '@trpc/server'
import {z} from 'zod'

import {adminProcedure, router} from './trpc.js'
import {
	type OllamaClient,
	type PullGuardrails,
	validateModelName,
} from '../../provider/ollama-models.js'

// ── Schemas ──────────────────────────────────────────────────────────────

const NameInput = z.object({name: z.string()})
const PullInput = z.object({
	name: z.string(),
	/** Explicit "pull anyway" — overrides a failing RAM/disk guardrail. */
	override: z.boolean().optional(),
})

// ── Progress map shape ─────────────────────────────────────────────────────

export interface PullProgressState {
	percent: number
	status: string
	totalBytes: number
	completedBytes: number
	done: boolean
	error?: string
}

// ── Public response shapes ──────────────────────────────────────────────────

export interface OllamaPullResponse {
	started: boolean
	blocked: boolean
	guardrail: PullGuardrails
}

// ── Factory deps ────────────────────────────────────────────────────────────

/**
 * Phase 316-05 (LLM-02) — the explicit active-model selection surface. Bound in
 * production to selectOllamaModel / revertToClaude / getActiveModel (provider/
 * active-model.ts) which compose the reused provider-config set/delete mutation
 * with the `liv:provider:active_model` flag. Optional here: the list/pull/
 * delete routes never need it, and the production wiring + Local Models UI
 * (316-06) inject it. When absent, the three selection routes surface a clear
 * PRECONDITION_FAILED rather than silently no-op.
 */
export interface OllamaActiveModelDep {
	/** Explicit "Use as Liv model" for a specific installed model. */
	select(modelName: string): Promise<void>
	/** Explicit "Revert to Claude" — full teardown. */
	revert(): Promise<void>
	/** Which model is currently Liv's provider (null when none). */
	get(): Promise<string | null>
}

export interface OllamaModelsRouterDeps {
	client: Pick<
		OllamaClient,
		'listModels' | 'deleteModel' | 'pullModel' | 'psModels' | 'checkPullGuardrails'
	>
	/** Filesystem path used for the disk-headroom probe (Ollama models dir). */
	modelsDir: string
	logger: {
		info(msg: string): void
		warn(msg: string, err?: unknown): void
	}
	/** Phase 316-05 — explicit active-model selection (optional; see above). */
	activeModel?: OllamaActiveModelDep
}

// ── Factory ─────────────────────────────────────────────────────────────────

export function createOllamaModelsRouter(deps: OllamaModelsRouterDeps) {
	// In-memory pull progress, keyed by model name. Polled by pullStatus. Not
	// restart-survivable — a livinityd redeploy mid-pull resets progress, but
	// Ollama continues the download server-side and listModels reflects the
	// finished model. (Redis-backed survivability is a deliberate non-goal here.)
	const pullProgress = new Map<string, PullProgressState>()

	/**
	 * Fire-and-forget background pull. NEVER throws (restart-hook contract):
	 * every failure is recorded in the progress map so pullStatus surfaces it.
	 */
	const runPull = (name: string): void => {
		pullProgress.set(name, {
			percent: 0,
			status: 'starting',
			totalBytes: 0,
			completedBytes: 0,
			done: false,
		})
		void deps.client
			.pullModel(name, (evt) => {
				const prev = pullProgress.get(name)
				const totalBytes = evt.total ?? prev?.totalBytes ?? 0
				const completedBytes = evt.completed ?? prev?.completedBytes ?? 0
				const percent =
					totalBytes > 0
						? Math.min(100, Math.round((completedBytes / totalBytes) * 100))
						: (prev?.percent ?? 0)
				pullProgress.set(name, {
					percent,
					status: evt.status ?? prev?.status ?? 'pulling',
					totalBytes,
					completedBytes,
					done: false,
				})
			})
			.then(() => {
				const prev = pullProgress.get(name)
				pullProgress.set(name, {
					percent: 100,
					status: 'success',
					totalBytes: prev?.totalBytes ?? 0,
					completedBytes: prev?.completedBytes ?? prev?.totalBytes ?? 0,
					done: true,
				})
				deps.logger.info(`[ollama-models] pull complete: ${name}`)
			})
			.catch((err: unknown) => {
				const prev = pullProgress.get(name)
				const message = err instanceof Error ? err.message : 'pull failed'
				pullProgress.set(name, {
					percent: prev?.percent ?? 0,
					status: 'error',
					totalBytes: prev?.totalBytes ?? 0,
					completedBytes: prev?.completedBytes ?? 0,
					done: true,
					error: message,
				})
				deps.logger.warn(`[ollama-models] pull failed: ${name} — ${message}`, err)
			})
	}

	return router({
		// ── list ────────────────────────────────────────────────────────────
		list: adminProcedure.query(async () => {
			try {
				return await deps.client.listModels()
			} catch (err) {
				throw toTrpcError(err, 'OLLAMA_LIST_FAILED')
			}
		}),

		// ── pull (block-by-default, explicit override) ────────────────────────
		pull: adminProcedure
			.input(PullInput)
			.mutation(async ({input}): Promise<OllamaPullResponse> => {
				const name = input.name.trim()
				if (!validateModelName(name)) {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: `INVALID_MODEL_NAME: rejected '${input.name}'`,
					})
				}

				let guardrail: PullGuardrails
				try {
					guardrail = await deps.client.checkPullGuardrails(name, deps.modelsDir)
				} catch (err) {
					throw toTrpcError(err, 'OLLAMA_GUARDRAIL_FAILED')
				}

				const guardrailFailed = !guardrail.ram.ok || !guardrail.disk.ok
				if (guardrailFailed && input.override !== true) {
					// Block-by-default. UI shows the guardrail + a "pull anyway" button.
					deps.logger.info(
						`[ollama-models] pull blocked by guardrail: ${name} (ram.ok=${guardrail.ram.ok}, disk.ok=${guardrail.disk.ok})`,
					)
					return {started: false, blocked: true, guardrail}
				}

				runPull(name)
				return {started: true, blocked: false, guardrail}
			}),

		// ── pullStatus (polled) ───────────────────────────────────────────────
		pullStatus: adminProcedure.input(NameInput).query(({input}) => {
			return pullProgress.get(input.name.trim()) ?? null
		}),

		// ── delete ────────────────────────────────────────────────────────────
		delete: adminProcedure.input(NameInput).mutation(async ({input}) => {
			const name = input.name.trim()
			if (!validateModelName(name)) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: `INVALID_MODEL_NAME: rejected '${input.name}'`,
				})
			}
			try {
				return await deps.client.deleteModel(name)
			} catch (err) {
				throw toTrpcError(err, 'OLLAMA_DELETE_FAILED')
			}
		}),

		// ── setActiveModel (316-05 — explicit "Use as Liv model") ─────────────
		// The ONLY route that makes Ollama Liv's provider. Validates the model
		// name (same allowlist as pull/delete) then delegates to the injected
		// selection surface, which composes the reused provider-config set
		// mutation with the liv:provider:active_model flag. list/pull/delete
		// never touch this path — key-presence therefore always implies an
		// explicit prior selection (316-01 RULE 1, fail-safe).
		setActiveModel: adminProcedure.input(NameInput).mutation(async ({input}) => {
			const name = input.name.trim()
			if (!validateModelName(name)) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: `INVALID_MODEL_NAME: rejected '${input.name}'`,
				})
			}
			const activeModel = requireActiveModel(deps)
			try {
				await activeModel.select(name)
			} catch (err) {
				throw toTrpcError(err, 'OLLAMA_SELECT_FAILED')
			}
			deps.logger.info(`[ollama-models] active model set: ${name}`)
			return {ok: true as const, activeModel: name}
		}),

		// ── getActiveModel (316-05 — UI state) ────────────────────────────────
		getActiveModel: adminProcedure.query(async () => {
			const activeModel = requireActiveModel(deps)
			try {
				return {activeModel: await activeModel.get()}
			} catch (err) {
				throw toTrpcError(err, 'OLLAMA_ACTIVE_MODEL_READ_FAILED')
			}
		}),

		// ── clearActiveModel (316-05 — explicit "Revert to Claude") ───────────
		// Full teardown: deletes the Ollama provider config + clears the flag,
		// restoring Claude as Liv's default with zero residual state.
		clearActiveModel: adminProcedure.mutation(async () => {
			const activeModel = requireActiveModel(deps)
			try {
				await activeModel.revert()
			} catch (err) {
				throw toTrpcError(err, 'OLLAMA_REVERT_FAILED')
			}
			deps.logger.info('[ollama-models] reverted to Claude (active model cleared)')
			return {ok: true as const}
		}),
	})
}

/**
 * Phase 316-05 — narrow the optional active-model dep or throw a clear,
 * actionable error. Until the production wiring + Local Models UI (316-06)
 * inject it, the three selection routes report unavailable rather than no-op.
 */
function requireActiveModel(deps: OllamaModelsRouterDeps): OllamaActiveModelDep {
	if (!deps.activeModel) {
		throw new TRPCError({
			code: 'PRECONDITION_FAILED',
			message:
				'OLLAMA_ACTIVE_MODEL_UNAVAILABLE: active-model selection not wired — livinityd boot did not inject the selection surface',
		})
	}
	return deps.activeModel
}

// ── Error mapping ────────────────────────────────────────────────────────────

function toTrpcError(err: unknown, fallbackCode: string): TRPCError {
	if (err instanceof TRPCError) return err
	const message = err instanceof Error ? err.message : `${fallbackCode}: unknown error`
	return new TRPCError({code: 'INTERNAL_SERVER_ERROR', message, cause: err})
}

// ── Empty-injection stub ─────────────────────────────────────────────────

const notInjected = (): never => {
	throw new TRPCError({
		code: 'PRECONDITION_FAILED',
		message:
			'OLLAMA_MODELS_UNAVAILABLE: ollama-models router not yet injected — livinityd boot did not wire the client',
	})
}

export const ollamaModelsRouter = router({
	list: adminProcedure.query(() => notInjected()),
	pull: adminProcedure.input(PullInput).mutation(() => notInjected()),
	pullStatus: adminProcedure.input(NameInput).query(() => notInjected()),
	delete: adminProcedure.input(NameInput).mutation(() => notInjected()),
	// Phase 316-05 — active-model selection routes (stub until production wiring).
	setActiveModel: adminProcedure.input(NameInput).mutation(() => notInjected()),
	getActiveModel: adminProcedure.query(() => notInjected()),
	clearActiveModel: adminProcedure.mutation(() => notInjected()),
})

export type OllamaModelsRouter = ReturnType<typeof createOllamaModelsRouter>
