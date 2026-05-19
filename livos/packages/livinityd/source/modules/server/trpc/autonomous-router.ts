// Phase 165-02 — Autonomous agents tRPC router.
//
// Closes the v34.x Settings UI gap surfacing what Phase 164's scheduler
// and budget-gate built. All procedures adminProcedure-gated (RBAC).
// All 5 paths added to httpOnlyPaths in common.ts (tRPC WS-pitfall).
//
// Sacred SHA + D-09 + Phase 161-02 helper + agent-session.ts + Phase 162
// vault-scaffolder source + Phase 164 scheduler RUN logic all UNCHANGED.

import {z} from 'zod'
import {TRPCError} from '@trpc/server'
import {adminProcedure, router} from './trpc.js'
import {
	DAILY_SPEND_KEY_PREFIX,
	dateKeyForUtc,
	REDIS_KEY_DAILY_BUDGET_CAP,
} from '../../autonomous-scheduler/budget-gate.js'
import {readLastRunForAgent} from '../../autonomous-scheduler/inbox-reader.js'

// Vault root for inbox reads — mirrors server/index.ts:1384 default.
// Per-user vault scoping is a v37+ deferred per CONTEXT.md.
const VAULT_PATH = '/home/bruce/livinity-vault'

const autonomousRouter = router({
	list: adminProcedure.query(async ({ctx}) => {
		const scheduler = ctx.livinityd!.autonomousScheduler
		if (!scheduler) return []
		const defs = scheduler.listDefinitions()
		const enabledNames = new Set(scheduler.getEnabledNames())
		// Per CONTEXT.md decision Plan 165-02: list shows name + schedule +
		// enabled + LAST RUN + COST-TO-DATE. Last-run cells come from the
		// newest inbox/<YYYY-MM-DD>_<HH-MM>_<name>(_<seq>)?.md per agent.
		return await Promise.all(
			defs.map(async (d) => {
				const lastRun = await readLastRunForAgent(VAULT_PATH, d.name)
				return {
					name: d.name,
					schedule: d.schedule,
					enabled: enabledNames.has(d.name),
					model: d.model,
					maxBudgetUsd: d.maxBudgetUsd,
					maxTurns: d.maxTurns,
					lastRunAt: lastRun.at,
					lastRunStatus: lastRun.status,
					lastRunCostUsd: lastRun.costUsd,
				}
			}),
		)
	}),

	toggle: adminProcedure
		.input(z.object({name: z.string().min(1), enabled: z.boolean()}).strict())
		.mutation(async ({ctx, input}) => {
			const scheduler = ctx.livinityd!.autonomousScheduler
			if (!scheduler) {
				throw new TRPCError({
					code: 'PRECONDITION_FAILED',
					message: 'autonomous scheduler not initialised',
				})
			}
			try {
				await scheduler.setAgentEnabled(input.name, input.enabled)
			} catch (err: any) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: err?.message ?? 'unknown',
				})
			}
			return {ok: true}
		}),

	runNow: adminProcedure
		.input(z.object({name: z.string().min(1)}).strict())
		.mutation(async ({ctx, input}) => {
			const scheduler = ctx.livinityd!.autonomousScheduler
			if (!scheduler) {
				throw new TRPCError({
					code: 'PRECONDITION_FAILED',
					message: 'autonomous scheduler not initialised',
				})
			}
			const r = await scheduler.runNow(input.name)
			if (!r.ok) {
				throw new TRPCError({code: 'NOT_FOUND', message: r.reason ?? 'unknown'})
			}
			return {ok: true}
		}),

	getDailySpend: adminProcedure.query(async ({ctx}) => {
		const redis = ctx.livinityd!.ai.redis
		const dateKey = dateKeyForUtc(new Date())
		const spendKey = `${DAILY_SPEND_KEY_PREFIX}${dateKey}`
		const [spentRaw, capRaw] = await Promise.all([
			redis.get(spendKey),
			redis.get(REDIS_KEY_DAILY_BUDGET_CAP),
		])
		const spentCents = Number.parseInt(spentRaw ?? '0', 10) || 0
		const capCents = Number.parseInt(capRaw ?? '5000', 10) || 5000 // default $50
		return {date: dateKey, spentCents, capCents}
	}),

	// Phase 165-02 — CONTEXT.md decision Plan 165-02 §AutonomousAgentsPanel.tsx
	// "Budget cap editor (Mini PC daily cap)". Writes REDIS_KEY_DAILY_BUDGET_CAP;
	// Phase 164 budget-gate.ts re-reads this key on every `runAgent` invocation,
	// so the new cap takes effect on the next scheduler tick (no livinityd restart).
	// Upper bound $1000/day is a sanity guard against fat-finger / UI bug; if an
	// operator legitimately needs a higher cap they can still set it via redis-cli.
	setDailyBudgetCap: adminProcedure
		.input(
			z
				.object({
					capCents: z.number().int().nonnegative().max(100000), // max $1000/day sanity
				})
				.strict(),
		)
		.mutation(async ({ctx, input}) => {
			await ctx.livinityd!.ai.redis.set(
				REDIS_KEY_DAILY_BUDGET_CAP,
				String(input.capCents),
			)
			return {ok: true, capCents: input.capCents}
		}),
})

export default autonomousRouter
