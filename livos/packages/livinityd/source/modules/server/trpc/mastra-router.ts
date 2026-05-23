/**
 * @deprecated Phase 198 ships @mastra/ai-sdk chatRoute at POST /chat/livAi
 * as the primary transport for the assistant-ui frontend. This tRPC
 * `mastra.agent.*` namespace is kept as a fallback for one release;
 * full removal is scheduled for Phase 199. New code should use the
 * AssistantChatTransport({api: '/chat/livAi'}) pattern instead.
 *
 * Phase 197-05 — mastra.* tRPC namespace.
 *
 * 5 adminProcedure-gated routes:
 *   - mastra.agent.stream          (SSE / subscription via tRPC v11 async generator)
 *   - mastra.agent.approve         (mutation)
 *   - mastra.agent.cancel          (mutation)
 *   - mastra.agent.threads.list    (query)
 *   - mastra.agent.threads.delete  (mutation)
 *
 * All 5 paths added to httpOnlyPaths in ./common.ts (WS-reconnect-survival).
 *
 * Locks honoured:
 *   W-02 — Reject does NOT abort the run. The wrapped tool (Plan 197-04
 *          wrapToolWithApproval) handles pause-resume internally and returns
 *          REJECTED_TOOL_RESULT on rejection; SSE layer is a transparent
 *          observer. Only `mastra.agent.cancel` aborts.
 *   W-03 — SSE pattern = tRPC v11 native `.subscription(async function*)`.
 *   N-01 — Destructive-tool detection by NAME via destructiveToolNames Set
 *          imported from mcp-bridge.ts (NOT chunk.tool.meta).
 *   B-02 — This file does NOT modify ../../mastra/index.ts. The boot wire-up
 *          in livinityd/source/index.ts calls livOSMastra.attachLivAiAgent()
 *          via Plan 197-01's pre-shipped helper.
 *
 * Error paths route through redactError() (Mastra issue #15827 mitigation).
 */

import {randomUUID} from 'node:crypto'

import {TRPCError} from '@trpc/server'
import {z} from 'zod'

import type {ApprovalManager} from '../../mastra/approval-manager.js'
import type {LivOSMastra} from '../../mastra/index.js'
import {ALLOWED_XAI_MODELS, type AllowedXaiModel} from '../../mastra/provider-router.js'
import {destructiveToolNames} from '../../mastra/mcp-bridge.js'
import {redactError} from '../../mastra/redact-error.js'
import {adminProcedure, privateProcedure, router} from './trpc.js'

export interface MastraRouterDeps {
	livOSMastra: LivOSMastra
	approvalManager: ApprovalManager
}

// Per-run AbortController registry — keyed by runId. Cleared on stream end
// or cancel. Module-scoped so cancel mutation can find the controller from
// a different procedure invocation.
const runAborts = new Map<string, AbortController>()

/**
 * Phase 199-02 — Per-model human-readable labels for the model picker.
 *
 * Pinned literal (D-199-11). The UI registry at
 * livos/packages/ui/src/features/liv-ai/models.ts (NEW Plan 199-04) hydrates
 * from `mastra.agent.listAvailableModels.query` at mount and falls back to
 * its own static literal for offline render; a Plan 199-04 regression-lock
 * test asserts equality (T-199-08).
 */
const LIV_AI_MODEL_LABELS: Record<AllowedXaiModel, {name: string; description: string}> = {
	'grok-4.20-0309-fast': {name: 'Grok 4.20 Fast', description: 'Fast non-reasoning. Default.'},
	'grok-4.20-0309-non-reasoning': {name: 'Grok 4.20', description: 'Standard non-reasoning.'},
	'grok-4.20-0309-reasoning': {name: 'Grok 4.20 Think', description: 'Multi-step reasoning (slower).'},
	'grok-4.3': {name: 'Grok 4.3', description: 'Latest. Reasoning + tool use.'},
}

export function createMastraRouter(deps: MastraRouterDeps) {
	if (process.env.NODE_ENV === 'development') {
		console.warn(
			'[mastra-router] tRPC mastra.agent.* namespace is deprecated — see Phase 198 SUMMARY; use POST /chat/livAi.',
		)
	}
	return router({
		agent: router({
			// Phase 199-02 — read-only model catalogue. privateProcedure (JWT
			// session required; matches "protectedProcedure" semantics per the
			// plan's threat model T-199-02-01). Any logged-in user can hydrate
			// the picker; mutating the active model (Plan 199-07
			// `setActiveModel`) is adminProcedure-gated.
			//
			// NAMING DEVIATION (Rule 3): plan literally says `protectedProcedure`
			// but this codebase exposes `privateProcedure` (= JWT-gated) +
			// `adminProcedure` (= role=admin); `privateProcedure` is the
			// semantic match.
			listAvailableModels: privateProcedure.query(async () => {
				return ALLOWED_XAI_MODELS.map((id) => ({id, ...LIV_AI_MODEL_LABELS[id]}))
			}),
			stream: adminProcedure
				.input(z.object({threadId: z.string(), message: z.string()}))
				.subscription(async function* ({input, signal}) {
					const runId = randomUUID()
					const controller = new AbortController()
					runAborts.set(runId, controller)
					const cleanup = () => {
						controller.abort()
						deps.approvalManager.cancelAll(runId)
					}
					signal?.addEventListener('abort', cleanup)
					try {
						const agent = deps.livOSMastra.agents.livAi
						if (!agent) {
							throw new TRPCError({
								code: 'PRECONDITION_FAILED',
								message: 'Liv AI agent not initialized',
							})
						}
						yield {type: 'run-start' as const, runId}

						const stream = (agent as unknown as {
							stream(messages: unknown, opts: unknown): AsyncIterable<unknown>
						}).stream(
							[{role: 'user', content: input.message}],
							{threadId: input.threadId, abortSignal: controller.signal},
						)

						for await (const chunk of stream) {
							yield chunk
							const c = chunk as {
								type?: string
								toolName?: string
								toolCallId?: string
							}
							// W-02 + N-01 LOCK: destructive-tool detection by NAME only.
							// SSE layer OBSERVES; the wrapped tool (197-04) handles the
							// actual pause-resume and may return REJECTED_TOOL_RESULT.
							// SSE never calls registerPending and never aborts on Reject.
							if (
								c.type === 'tool-call' &&
								typeof c.toolName === 'string' &&
								destructiveToolNames.has(c.toolName)
							) {
								yield {
									type: 'tool-call-approval' as const,
									toolCallId: c.toolCallId,
									toolName: c.toolName,
									runId,
								}
							}
						}
						yield {type: 'finish' as const, runId}
					} catch (err) {
						const red = redactError(err)
						throw new TRPCError({
							code: 'INTERNAL_SERVER_ERROR',
							message: red.message,
							cause: red,
						})
					} finally {
						runAborts.delete(runId)
					}
				}),

			approve: adminProcedure
				.input(z.object({toolCallId: z.string(), approved: z.boolean()}))
				.mutation(async ({input}) => {
					// W-02 lock: resolve unblocks the wrapped tool's execute().
					// On approved=false the wrapped tool returns REJECTED_TOOL_RESULT;
					// the agent continuation naturally explains the rejection.
					deps.approvalManager.resolve(input.toolCallId, input.approved)
					return {ok: true as const}
				}),

			cancel: adminProcedure
				.input(z.object({runId: z.string()}))
				.mutation(async ({input}) => {
					const controller = runAborts.get(input.runId)
					controller?.abort()
					deps.approvalManager.cancelAll(input.runId)
					runAborts.delete(input.runId)
					return {ok: true as const}
				}),

			threads: router({
				list: adminProcedure.query(async () => {
					try {
						const memory = deps.livOSMastra.memory as {
							getThreads?: () => Promise<unknown[]>
						} | null
						if (!memory) return {threads: []}
						const threads = (await memory.getThreads?.()) ?? []
						return {threads}
					} catch (err) {
						const red = redactError(err)
						throw new TRPCError({
							code: 'INTERNAL_SERVER_ERROR',
							message: red.message,
							cause: red,
						})
					}
				}),

				delete: adminProcedure
					.input(z.object({threadId: z.string()}))
					.mutation(async ({input}) => {
						try {
							const memory = deps.livOSMastra.memory as {
								deleteThread?: (id: string) => Promise<void>
							} | null
							if (!memory) {
								throw new TRPCError({
									code: 'PRECONDITION_FAILED',
									message: 'Memory not initialized',
								})
							}
							await memory.deleteThread?.(input.threadId)
							return {ok: true as const}
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
		}),
	})
}

// Empty-injection Proxy default — mirrors xai-auth-router / setup-router
// pattern. Throws PRECONDITION_FAILED on any procedure call until the
// production swap (Plan 197-05 Task 3 boot wire-up).
const notInjected = (): never => {
	throw new TRPCError({
		code: 'PRECONDITION_FAILED',
		message:
			'mastra-router: deps not injected — call createMastraRouter({livOSMastra, approvalManager}) during livinityd boot',
	})
}

export const mastraRouter = router({
	agent: router({
		// Phase 199-02 — empty-injection default mirrors createMastraRouter
		// shape (Plan 197-05 convention). Throws on call until the production
		// swap during livinityd boot.
		listAvailableModels: privateProcedure.query(() => notInjected()),
		stream: adminProcedure
			.input(z.object({threadId: z.string(), message: z.string()}))
			.subscription(async function* () {
				notInjected()
				yield undefined as never // unreachable
			}),
		approve: adminProcedure
			.input(z.object({toolCallId: z.string(), approved: z.boolean()}))
			.mutation(() => notInjected()),
		cancel: adminProcedure
			.input(z.object({runId: z.string()}))
			.mutation(() => notInjected()),
		threads: router({
			list: adminProcedure.query(() => notInjected()),
			delete: adminProcedure
				.input(z.object({threadId: z.string()}))
				.mutation(() => notInjected()),
		}),
	}),
})
