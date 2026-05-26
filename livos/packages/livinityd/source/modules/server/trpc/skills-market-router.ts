/**
 * Phase 219 T7 — Skills marketplace tRPC router.
 *
 * Two routes (both admin-gated):
 *
 *   - skills.market.list({category?})         → MarketSkillCard[]
 *   - skills.market.install({agentSlug,       → {ok, installedAt, path}
 *                            skillSlug})
 *
 * `install` writes the curated SKILL.md to `~bruce/livinity/<agent>/skills/
 * <slug>/SKILL.md` via the same filesystem layout SkillsLoader walks.
 * After install, the next `skills.list({agent})` call returns the new
 * manifest entry.
 *
 * Telemetry-free (D-219-NO-PHONE-HOME) — no download counters, no
 * registry callbacks.
 */
import {existsSync, mkdirSync, writeFileSync} from 'node:fs'
import {homedir} from 'node:os'
import {join, resolve} from 'node:path'

import {TRPCError} from '@trpc/server'
import {z} from 'zod'

import {SKILL_MARKET, type MarketSkill} from '../../skills/market-data.js'
import {adminProcedure, router} from './trpc.js'

const AgentSlug = z
	.string()
	.trim()
	.regex(/^[a-z0-9][a-z0-9_-]{0,63}$/, 'agent slug must be lowercase alphanumeric (+ _-), 1-64 chars')

const SkillSlug = z
	.string()
	.trim()
	.regex(/^[a-z0-9][a-z0-9_.-]{0,127}$/, 'skill slug invalid')

export interface MarketSkillCard {
	slug: string
	name: string
	description: string
	category: MarketSkill['category']
	tools: string[]
	verified: boolean
}

function projectCard(s: MarketSkill): MarketSkillCard {
	return {
		slug: s.slug,
		name: s.name,
		description: s.description,
		category: s.category,
		tools: s.tools,
		verified: Boolean(s.verified),
	}
}

export interface SkillsMarketRouterDeps {
	/** Override the vault root — defaults to LIV_VAULT_ROOT → ~/livinity. */
	vaultRoot?: string
	logger: {info: (m: string) => void; warn: (m: string, err?: unknown) => void}
}

export function createSkillsMarketRouter(deps: SkillsMarketRouterDeps) {
	const VAULT_ROOT = resolve(deps.vaultRoot ?? process.env.LIV_VAULT_ROOT ?? join(homedir(), 'livinity'))

	return router({
		list: adminProcedure
			.input(z.object({category: z.string().optional()}).optional())
			.query(async ({input}) => {
				const cat = input?.category
				return SKILL_MARKET.filter((s) => (cat ? s.category === cat : true))
					.map(projectCard)
					.sort((a, b) => a.name.localeCompare(b.name))
			}),

		install: adminProcedure
			.input(z.object({agentSlug: AgentSlug, skillSlug: SkillSlug}))
			.mutation(async ({input}) => {
				const entry = SKILL_MARKET.find((s) => s.slug === input.skillSlug)
				if (!entry) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: `SKILL_NOT_IN_MARKET: ${input.skillSlug}`,
					})
				}
				const skillDir = resolve(VAULT_ROOT, input.agentSlug, 'skills', input.skillSlug)
				// Defense-in-depth: refuse paths escaping the vault root.
				const sep = process.platform === 'win32' ? '\\' : '/'
				if (!skillDir.startsWith(VAULT_ROOT + sep)) {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: `SKILL_PATH_ESCAPE: ${skillDir}`,
					})
				}
				if (!existsSync(skillDir)) {
					mkdirSync(skillDir, {recursive: true, mode: 0o700})
				}
				const target = join(skillDir, 'SKILL.md')
				try {
					writeFileSync(target, entry.body, {mode: 0o600})
				} catch (err) {
					throw new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: `SKILL_WRITE_FAILED: ${(err as Error).message}`,
					})
				}
				deps.logger.info(`[skills-market] installed '${input.skillSlug}' for agent '${input.agentSlug}' → ${target}`)
				return {ok: true as const, installedAt: new Date().toISOString(), path: target}
			}),
	})
}

export type SkillsMarketRouter = ReturnType<typeof createSkillsMarketRouter>

const notInjected = (): never => {
	throw new TRPCError({
		code: 'PRECONDITION_FAILED',
		message: 'skills-market-router not yet injected — livinityd boot did not wire it',
	})
}

export const skillsMarketRouter = router({
	list: adminProcedure
		.input(z.object({category: z.string().optional()}).optional())
		.query(async ({input}) => {
			const cat = input?.category
			return SKILL_MARKET.filter((s) => (cat ? s.category === cat : true))
				.map(projectCard)
				.sort((a, b) => a.name.localeCompare(b.name))
		}),
	install: adminProcedure
		.input(z.object({agentSlug: AgentSlug, skillSlug: SkillSlug}))
		.mutation(() => notInjected()),
})
