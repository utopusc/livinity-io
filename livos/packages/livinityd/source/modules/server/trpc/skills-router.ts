/**
 * Phase 219 T6 — Skills tRPC router.
 *
 * Read + delete only; install lands via T7's `skills.market.install` (writes
 * the SKILL.md to disk then this router picks it up on the next `list`).
 *
 * Routes (all admin-gated):
 *   - skills.list({agentSlug})            → SkillManifestEntry[]
 *   - skills.get({agentSlug, skillSlug})  → { frontmatter, body, path }
 *   - skills.delete({agentSlug, skillSlug}) → { ok, deleted? }
 *
 * Boot wires `deps.loader` to a real `SkillsLoader` instance; tests can
 * inject a fake. The empty-injection stub mirrors the mcp-config-router
 * pattern: every route throws PRECONDITION_FAILED until livinityd boot
 * swaps it.
 */
import {TRPCError} from '@trpc/server'
import {z} from 'zod'

import type {SkillsLoader} from '../../skills/loader.js'
import {adminProcedure, router} from './trpc.js'

const AgentSlug = z
	.string()
	.trim()
	.regex(/^[a-z0-9][a-z0-9_-]{0,63}$/, 'agent slug must be lowercase alphanumeric (+ _-), 1-64 chars')

const SkillSlug = z
	.string()
	.trim()
	.regex(/^[a-z0-9][a-z0-9_.-]{0,127}$/, 'skill slug must be lowercase alphanumeric (+ ._-), 1-128 chars')

export interface SkillsRouterDeps {
	loader: SkillsLoader
}

export function createSkillsRouter(deps: SkillsRouterDeps) {
	return router({
		list: adminProcedure
			.input(z.object({agentSlug: AgentSlug}))
			.query(async ({input}) => {
				try {
					return deps.loader.loadManifest(input.agentSlug)
				} catch (err) {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: err instanceof Error ? err.message : String(err),
					})
				}
			}),

		get: adminProcedure
			.input(z.object({agentSlug: AgentSlug, skillSlug: SkillSlug}))
			.query(async ({input}) => {
				try {
					const parsed = deps.loader.loadSkillBody(input.agentSlug, input.skillSlug)
					if (!parsed) {
						throw new TRPCError({
							code: 'NOT_FOUND',
							message: `SKILL_NOT_FOUND: ${input.agentSlug}/${input.skillSlug}`,
						})
					}
					return {
						frontmatter: parsed.frontmatter,
						body: parsed.body,
						path: parsed.path,
					}
				} catch (err) {
					if (err instanceof TRPCError) throw err
					throw new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: err instanceof Error ? err.message : String(err),
					})
				}
			}),

		delete: adminProcedure
			.input(z.object({agentSlug: AgentSlug, skillSlug: SkillSlug}))
			.mutation(async ({input}) => {
				try {
					const deleted = deps.loader.deleteSkill(input.agentSlug, input.skillSlug)
					if (!deleted) {
						throw new TRPCError({
							code: 'NOT_FOUND',
							message: `SKILL_NOT_FOUND: ${input.agentSlug}/${input.skillSlug}`,
						})
					}
					return {ok: true as const, deleted}
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

export type SkillsRouter = ReturnType<typeof createSkillsRouter>

const notInjected = (): never => {
	throw new TRPCError({
		code: 'PRECONDITION_FAILED',
		message: 'skills-router not yet injected — livinityd boot did not wire the SkillsLoader',
	})
}

export const skillsRouter = router({
	list: adminProcedure.input(z.object({agentSlug: AgentSlug})).query(() => notInjected()),
	get: adminProcedure
		.input(z.object({agentSlug: AgentSlug, skillSlug: SkillSlug}))
		.query(() => notInjected()),
	delete: adminProcedure
		.input(z.object({agentSlug: AgentSlug, skillSlug: SkillSlug}))
		.mutation(() => notInjected()),
})
