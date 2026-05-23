/**
 * Phase 202-03 — Agents CRUD tRPC router.
 *
 * 7 adminProcedure-gated routes that expose the livos_agents table + the
 * cron scheduler + a cronstrue preview to the frontend (Plans 202-04..06):
 *
 *   - agents.list          → LivosAgent[]
 *   - agents.get           → input {id}      → LivosAgent | null
 *   - agents.create        → input {…}       → LivosAgent (created row)
 *   - agents.update        → input {id, patch} → LivosAgent (updated row)
 *   - agents.delete        → input {id}      → {ok: true}
 *   - agents.runOnce       → input {id}      → {threadId}
 *   - agents.cronPreview   → input {cron}    → {valid, human?}
 *
 * Decisions honoured:
 *   D-202-15 — standard 5-field cron; validated via node-cron.validate() at
 *              create/update boundaries. Invalid → BAD_REQUEST +
 *              `AGENT_CRON_INVALID`.
 *   D-202-14 — `name` UNIQUE. Duplicate → CONFLICT + `AGENT_NAME_TAKEN`
 *              (mapped from the DB UNIQUE-violation error the repository
 *              propagates unchanged).
 *   D-202-16 — Any admin can trigger any agent's runOnce. No per-agent ACL.
 *              Enforced via `adminProcedure`.
 *   D-202-20 — System agents (system=true) cannot be deleted; repository
 *              throws "system agent ... cannot be deleted" which we map to
 *              FORBIDDEN + `AGENT_IS_SYSTEM`.
 *   D-202-13 — Sub-agent depth ≤ 2; DB trigger from Plan 202-01 raises
 *              `Sub-agent depth > 2 not allowed (D-202-13)` which we map to
 *              BAD_REQUEST + `AGENT_DEPTH_EXCEEDED`.
 *
 * Threat mitigations:
 *   T-202-02 — DB UNIQUE + tRPC layer surfaces AGENT_NAME_TAKEN
 *   T-202-03 — cron validated on create + update BEFORE insert
 *   T-202-04 — depth>2 rejected by DB trigger; mapped to AGENT_DEPTH_EXCEEDED
 *   T-202-07 — adminProcedure gate on every route
 *
 * Side effects on mutation: every successful create/update/delete triggers
 *   - `livOSMastra.registry?.refresh()` so the Mastra agent map matches the
 *     persisted state (Plan 202-02 contract)
 *   - `livOSMastra.scheduler?.refresh()` so cron task table matches the
 *     persisted state (Plan 202-03 Task 2 contract)
 *
 * Both refreshes await in parallel via Promise.all — failures are logged but
 * do not unwind the mutation (the persisted row is the source of truth; the
 * in-memory caches are derived state).
 */

import cron from 'node-cron'
import cronstrue from 'cronstrue'
import {TRPCError} from '@trpc/server'
import {z} from 'zod'

import type {LivOSAgent} from '../../agent-runtime/index.js'
import type {AgentRepository} from '../../agent-runtime/agents/agent-repository.js'
import type {LivosAgent, LivosAgentInsert} from '../../../db/schema.js'
import {adminProcedure, router} from './trpc.js'

export interface AgentRouterDeps {
	repo: AgentRepository
	/**
	 * Phase 203-08 — repointed at LivOSAgent (replaces LivOSMastra). Slot
	 * names + types preserved (registry / scheduler / memory / agents) so
	 * existing call sites continue to compile and the procedure contracts
	 * stay identical per INV-203-09.
	 */
	livOSMastra: LivOSAgent
	logger: {
		info: (msg: string) => void
		warn: (msg: string, error?: unknown) => void
	}
}

/**
 * Identifier for a row in `livos_agents`. The seed row uses literal id
 * `livai`; the create mutation generates a uuid via `crypto.randomUUID()`
 * when the caller does not supply one.
 */
const AgentIdSchema = z.string().min(1).max(64)

/**
 * Validated cron-expression — zod refine wired to node-cron.validate so the
 * tRPC layer rejects malformed expressions BEFORE the row reaches the DB or
 * the scheduler (T-202-03 boundary mitigation per the plan's
 * `AGENT_CRON_INVALID` requirement).
 */
const CronSchema = z
	.string()
	.refine((v) => cron.validate(v), {message: 'AGENT_CRON_INVALID'})

/**
 * Create input — every field that maps to a `livos_agents` column. `id` is
 * optional; missing → generated server-side via `randomUUID()`.
 */
const CreateInputSchema = z.object({
	id: AgentIdSchema.optional(),
	name: z.string().min(1).max(120),
	instructions: z.string().default(''),
	modelName: z.string().default('grok-4.3'),
	toolIds: z.array(z.string()).default([]),
	scheduleCron: CronSchema.nullable().optional(),
	parentAgentId: AgentIdSchema.nullable().optional(),
	enabled: z.boolean().default(true),
})

const UpdatePatchSchema = z.object({
	name: z.string().min(1).max(120).optional(),
	instructions: z.string().optional(),
	modelName: z.string().optional(),
	toolIds: z.array(z.string()).optional(),
	scheduleCron: CronSchema.nullable().optional(),
	parentAgentId: AgentIdSchema.nullable().optional(),
	enabled: z.boolean().optional(),
})

/**
 * Map repository / DB errors to user-readable tRPC error codes. Repository
 * propagates the raw `pg` / drizzle error message unchanged (Plan 202-01
 * contract); this layer turns it into the AGENT_* codes the frontend reads.
 */
function mapRepoError(err: unknown): TRPCError {
	const msg = err instanceof Error ? err.message : String(err)
	// PG UNIQUE violation on the `name` column (Phase 202-01 D-202-14).
	if (
		/duplicate key value violates unique constraint/i.test(msg) ||
		/livos_agents.*_name_unique/i.test(msg) ||
		// drizzle wraps the pg error in its own message in some paths
		/already exists/i.test(msg)
	) {
		return new TRPCError({code: 'CONFLICT', message: 'AGENT_NAME_TAKEN'})
	}
	// Phase 202-01 DB trigger raises this literal string for depth-3 inserts.
	if (/Sub-agent depth > 2/i.test(msg)) {
		return new TRPCError({
			code: 'BAD_REQUEST',
			message: 'AGENT_DEPTH_EXCEEDED',
		})
	}
	// Repository.delete() throws this for system rows.
	if (/system agent .* cannot be deleted/i.test(msg)) {
		return new TRPCError({code: 'FORBIDDEN', message: 'AGENT_IS_SYSTEM'})
	}
	// AgentRepository.update() throws "agent {id} not found" for missing ids.
	if (/agent .* not found/i.test(msg)) {
		return new TRPCError({code: 'NOT_FOUND', message: 'AGENT_NOT_FOUND'})
	}
	return new TRPCError({code: 'INTERNAL_SERVER_ERROR', message: msg})
}

/**
 * Refresh both the Mastra registry (so chat-route + agent.stream see the
 * updated agent map) AND the scheduler (so cron tasks pick up the new/edited/
 * deleted row). Both refreshes are best-effort — failures are logged but the
 * mutation is NOT rolled back. The persisted DB row is the source of truth;
 * the in-memory caches will reconcile on the next refresh tick or on the
 * next livinityd restart.
 */
async function syncMastra(deps: AgentRouterDeps): Promise<void> {
	const results = await Promise.allSettled([
		deps.livOSMastra.registry?.refresh() ?? Promise.resolve(),
		deps.livOSMastra.scheduler?.refresh() ?? Promise.resolve(),
	])
	for (const r of results) {
		if (r.status === 'rejected') {
			deps.logger.warn(
				'Phase 202-03 agent-router — Mastra refresh failed after mutation',
				r.reason,
			)
		}
	}
}

export function createAgentRouter(deps: AgentRouterDeps) {
	return router({
		list: adminProcedure.query(async () => {
			try {
				return await deps.repo.listAll()
			} catch (err) {
				throw mapRepoError(err)
			}
		}),

		get: adminProcedure
			.input(z.object({id: AgentIdSchema}))
			.query(async ({input}) => {
				try {
					return await deps.repo.getById(input.id)
				} catch (err) {
					throw mapRepoError(err)
				}
			}),

		create: adminProcedure
			.input(CreateInputSchema)
			.mutation(async ({input}): Promise<LivosAgent> => {
				const row: LivosAgentInsert = {
					id: input.id ?? generateAgentId(),
					name: input.name,
					instructions: input.instructions,
					modelName: input.modelName,
					toolIds: input.toolIds,
					scheduleCron: input.scheduleCron ?? null,
					parentAgentId: input.parentAgentId ?? null,
					enabled: input.enabled,
					system: false,
				}
				let created: LivosAgent
				try {
					created = await deps.repo.create(row)
				} catch (err) {
					throw mapRepoError(err)
				}
				await syncMastra(deps)
				deps.logger.info(
					`Phase 202-03 agent-router — created agent ${created.name} (${created.id})`,
				)
				return created
			}),

		update: adminProcedure
			.input(
				z.object({
					id: AgentIdSchema,
					patch: UpdatePatchSchema,
				}),
			)
			.mutation(async ({input}): Promise<LivosAgent> => {
				const patch: Partial<LivosAgentInsert> = {}
				if (input.patch.name !== undefined) patch.name = input.patch.name
				if (input.patch.instructions !== undefined)
					patch.instructions = input.patch.instructions
				if (input.patch.modelName !== undefined)
					patch.modelName = input.patch.modelName
				if (input.patch.toolIds !== undefined) patch.toolIds = input.patch.toolIds
				if (input.patch.scheduleCron !== undefined)
					patch.scheduleCron = input.patch.scheduleCron
				if (input.patch.parentAgentId !== undefined)
					patch.parentAgentId = input.patch.parentAgentId
				if (input.patch.enabled !== undefined) patch.enabled = input.patch.enabled

				let updated: LivosAgent
				try {
					updated = await deps.repo.update(input.id, patch)
				} catch (err) {
					throw mapRepoError(err)
				}
				await syncMastra(deps)
				deps.logger.info(
					`Phase 202-03 agent-router — updated agent ${updated.name} (${updated.id})`,
				)
				return updated
			}),

		delete: adminProcedure
			.input(z.object({id: AgentIdSchema}))
			.mutation(async ({input}) => {
				try {
					await deps.repo.delete(input.id)
				} catch (err) {
					throw mapRepoError(err)
				}
				await syncMastra(deps)
				deps.logger.info(
					`Phase 202-03 agent-router — deleted agent ${input.id}`,
				)
				return {ok: true as const}
			}),

		runOnce: adminProcedure
			.input(z.object({id: AgentIdSchema}))
			.mutation(async ({input}) => {
				const scheduler = deps.livOSMastra.scheduler
				if (!scheduler) {
					throw new TRPCError({
						code: 'PRECONDITION_FAILED',
						message: 'AGENT_SCHEDULER_UNAVAILABLE',
					})
				}
				try {
					const threadId = await scheduler.runOnce(input.id, 'manual')
					return {threadId}
				} catch (err) {
					throw mapRepoError(err)
				}
			}),

		cronPreview: adminProcedure
			.input(z.object({cron: z.string()}))
			.query(({input}) => {
				if (!cron.validate(input.cron)) {
					return {valid: false as const, human: null}
				}
				try {
					return {
						valid: true as const,
						human: cronstrue.toString(input.cron, {
							throwExceptionOnParseError: true,
						}),
					}
				} catch {
					// cronstrue is stricter than node-cron in some edge cases; treat
					// as "valid for scheduling, no human preview available".
					return {valid: true as const, human: null}
				}
			}),
	})
}

export type AgentRouter = ReturnType<typeof createAgentRouter>

/**
 * Server-side id minting for new agent rows when the caller doesn't supply
 * one. URL-safe (used as a tRPC param in `agents.get` etc.). `crypto.randomUUID`
 * is available in Node ≥ 19, which livinityd already requires.
 */
function generateAgentId(): string {
	// Node ≥19 — globalThis.crypto.randomUUID exists; fallback for legacy test
	// runners ride the Math.random shape used elsewhere in this codebase.
	const g = globalThis as {crypto?: {randomUUID?: () => string}}
	if (g.crypto?.randomUUID) return g.crypto.randomUUID()
	return `agent-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
