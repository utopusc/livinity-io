/**
 * Phase 202-03 — Agent task lifecycle tRPC router.
 *
 * 4 adminProcedure-gated routes that expose task creation, listing, result
 * retrieval, and cancellation. Tasks are persisted as Mastra Memory threads
 * with metadata `{taskId, agentId, agentName, triggeredBy, triggeredAt,
 * parentTaskId?}` (D-202-05). There is NO separate `livos_tasks` table —
 * Mastra Memory.recall + listThreads cover result polling natively.
 *
 *   - agents.tasks.create  → {agentId, prompt?} → {threadId}
 *   - agents.tasks.list    → {agentId?, limit?} → TaskSummary[]
 *   - agents.tasks.get     → {threadId} → MastraDBMessage[]
 *   - agents.tasks.cancel  → {threadId} → {ok: true}
 *
 * Decisions honoured:
 *   D-202-05 — task record = Memory thread w/ metadata; reuse Memory.recall +
 *              listThreads for read paths.
 *   D-202-16 — Any admin can trigger / inspect any task. No per-task ACL.
 *
 * Threat mitigations:
 *   T-202-07 — adminProcedure gate on every route.
 *
 * Cancellation contract (D-202-05 / Plan 202-03 Task 4 acceptance): cancel
 * sets `cancelled: true` in the thread metadata. The runner-side polling loop
 * that consumes this flag is Plan 202-09's responsibility (full async
 * cancellation requires the WorkflowExecutor wave). In v202-03 we land the
 * surface so the UI can wire the Cancel button; the runner-side honour is a
 * Phase 202-09 follow-up explicitly called out in the plan.
 */

import {TRPCError} from '@trpc/server'
import {z} from 'zod'

import type {LivOSAgent} from '../../agent-runtime/index.js'
import {adminProcedure, router} from './trpc.js'

export interface AgentTaskRouterDeps {
	/**
	 * Phase 203-08 — repointed at LivOSAgent (replaces LivOSMastra). Slot
	 * shape preserved; tRPC contracts identical per INV-203-09.
	 */
	livOSMastra: LivOSAgent
	logger: {
		info: (msg: string) => void
		warn: (msg: string, error?: unknown) => void
	}
}

/**
 * Minimal Memory surface this router exercises. Cast at the call site so the
 * router stays decoupled from the exact Mastra version's Memory class shape.
 */
interface MemoryAPI {
	listThreads(args: {
		perPage?: number | false
		page?: number
		filter?: {
			resourceId?: string
			metadata?: Record<string, unknown>
		}
	}): Promise<{
		threads: Array<{
			id: string
			resourceId: string
			title?: string
			metadata?: Record<string, unknown> | null
			createdAt: Date | string
			updatedAt: Date | string
		}>
	}>
	getThreadById(args: {
		threadId: string
		resourceId?: string
	}): Promise<{
		id: string
		resourceId: string
		title?: string
		metadata?: Record<string, unknown> | null
	} | null>
	recall(args: {
		threadId: string
		resourceId?: string
		perPage?: number | false
	}): Promise<{messages: unknown[]}>
	updateThread(args: {
		id: string
		title: string
		metadata: Record<string, unknown>
	}): Promise<unknown>
}

const TaskStatusSchema = z.enum(['running', 'completed', 'failed', 'cancelled'])
type TaskStatus = z.infer<typeof TaskStatusSchema>

export interface TaskSummary {
	threadId: string
	agentId: string
	agentName: string
	status: TaskStatus
	triggeredBy: string
	triggeredAt: string
	title: string
	lastMessagePreview?: string
}

/**
 * Derive a coarse status from thread metadata. v202-03 ships the surface; a
 * future runner-side write of `status` into thread metadata (Plan 202-09)
 * fully implements running/completed/failed transitions. For now:
 *   - cancelled: true                                  → 'cancelled'
 *   - any thread without a `status` field              → 'completed' (best
 *     guess — Memory.saveThread runs synchronously before agent.stream so
 *     the thread exists immediately; we mark it completed once the cron tick
 *     ends. This is a conservative heuristic that future plans tighten.)
 *   - explicit metadata.status                         → trust it
 */
function deriveStatus(metadata: Record<string, unknown> | null | undefined): TaskStatus {
	if (!metadata) return 'completed'
	if (metadata.cancelled === true) return 'cancelled'
	const explicit = metadata.status
	if (typeof explicit === 'string') {
		const parse = TaskStatusSchema.safeParse(explicit)
		if (parse.success) return parse.data
	}
	return 'completed'
}

export function createAgentTaskRouter(deps: AgentTaskRouterDeps) {
	return router({
		create: adminProcedure
			.input(
				z.object({
					agentId: z.string().min(1).max(64),
					prompt: z.string().min(1).max(64_000).optional(),
				}),
			)
			.mutation(async ({input}) => {
				const scheduler = deps.livOSMastra.scheduler
				if (!scheduler) {
					throw new TRPCError({
						code: 'PRECONDITION_FAILED',
						message: 'AGENT_SCHEDULER_UNAVAILABLE',
					})
				}
				try {
					const threadId = await scheduler.runOnce(input.agentId, 'manual', {
						overridePrompt: input.prompt,
					})
					return {threadId}
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err)
					if (/agent .* not found/i.test(msg)) {
						throw new TRPCError({
							code: 'NOT_FOUND',
							message: 'AGENT_NOT_FOUND',
						})
					}
					if (/not registered/i.test(msg)) {
						throw new TRPCError({
							code: 'PRECONDITION_FAILED',
							message: 'AGENT_NOT_REGISTERED',
						})
					}
					throw new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: msg,
					})
				}
			}),

		list: adminProcedure
			.input(
				z.object({
					agentId: z.string().min(1).max(64).optional(),
					limit: z.number().int().min(1).max(200).default(50),
				}),
			)
			.query(async ({input}): Promise<TaskSummary[]> => {
				const memory = deps.livOSMastra.memory as MemoryAPI | null
				if (!memory) {
					// Memory not wired (boot edge, P197-05 wire-up failed). Return
					// empty list rather than 503 so the UI can render an empty
					// state rather than an error.
					return []
				}
				try {
					const filter = input.agentId
						? {resourceId: 'system', metadata: {agentId: input.agentId}}
						: {resourceId: 'system'}
					const {threads} = await memory.listThreads({
						perPage: input.limit,
						filter,
					})
					return threads.map((t) => {
						const md = t.metadata ?? {}
						const agentId = typeof md.agentId === 'string' ? md.agentId : ''
						const agentName =
							typeof md.agentName === 'string' ? md.agentName : 'unknown'
						const triggeredBy =
							typeof md.triggeredBy === 'string' ? md.triggeredBy : 'unknown'
						const triggeredAt =
							typeof md.triggeredAt === 'string'
								? md.triggeredAt
								: new Date(t.createdAt).toISOString()
						return {
							threadId: t.id,
							agentId,
							agentName,
							status: deriveStatus(md),
							triggeredBy,
							triggeredAt,
							title: t.title ?? `Task ${t.id}`,
						}
					})
				} catch (err) {
					deps.logger.warn(
						'Phase 202-03 agent-task-router — listThreads failed',
						err,
					)
					throw new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: err instanceof Error ? err.message : String(err),
					})
				}
			}),

		get: adminProcedure
			.input(z.object({threadId: z.string().min(1).max(128)}))
			.query(async ({input}) => {
				const memory = deps.livOSMastra.memory as MemoryAPI | null
				if (!memory) {
					throw new TRPCError({
						code: 'PRECONDITION_FAILED',
						message: 'AGENT_MEMORY_UNAVAILABLE',
					})
				}
				try {
					const thread = await memory.getThreadById({
						threadId: input.threadId,
					})
					if (!thread) {
						throw new TRPCError({
							code: 'NOT_FOUND',
							message: 'TASK_NOT_FOUND',
						})
					}
					const {messages} = await memory.recall({
						threadId: input.threadId,
					})
					return {
						thread: {
							id: thread.id,
							title: thread.title,
							metadata: thread.metadata,
						},
						messages,
					}
				} catch (err) {
					if (err instanceof TRPCError) throw err
					throw new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: err instanceof Error ? err.message : String(err),
					})
				}
			}),

		cancel: adminProcedure
			.input(z.object({threadId: z.string().min(1).max(128)}))
			.mutation(async ({input}) => {
				const memory = deps.livOSMastra.memory as MemoryAPI | null
				if (!memory) {
					throw new TRPCError({
						code: 'PRECONDITION_FAILED',
						message: 'AGENT_MEMORY_UNAVAILABLE',
					})
				}
				try {
					const existing = await memory.getThreadById({
						threadId: input.threadId,
					})
					if (!existing) {
						throw new TRPCError({
							code: 'NOT_FOUND',
							message: 'TASK_NOT_FOUND',
						})
					}
					const currentMeta = (existing.metadata ?? {}) as Record<string, unknown>
					const nextMeta = {
						...currentMeta,
						cancelled: true,
						cancelledAt: new Date().toISOString(),
					}
					await memory.updateThread({
						id: input.threadId,
						title: existing.title ?? `Task ${existing.id}`,
						metadata: nextMeta,
					})
					deps.logger.info(
						`Phase 202-03 agent-task-router — task ${input.threadId} marked cancelled (runner-side honour deferred to Plan 202-09)`,
					)
					return {ok: true as const}
				} catch (err) {
					if (err instanceof TRPCError) throw err
					throw new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: err instanceof Error ? err.message : String(err),
					})
				}
			}),
	})
}

export type AgentTaskRouter = ReturnType<typeof createAgentTaskRouter>
