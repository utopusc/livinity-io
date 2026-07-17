// livos/packages/livinityd/source/modules/connectivity/routes.ts
//
// Phase 333 (DIAG-01/02) — connectivity self-diagnosis tRPC surface. Namespace
// `connectivity.*` (D-333-1, distinct from the AI `diagnostics`/`capabilities`).
//
// getReport   (privateProcedure query)  — read the persisted per-check baseline +
//   last-run + ignore-list + score. Read-only, cheap; never runs a live probe.
// runCheckNow (adminProcedure mutation) — on-demand run of the full self-check
//   (same impl as the scheduled handler); persists + alerts on regression.
// setIgnore / setMailEnabled (adminProcedure mutation) — operator toggles.

import {z} from 'zod'
import {adminProcedure, privateProcedure, router} from '../server/trpc/trpc.js'
import {scoreChecks, EMPTY_CONNECTIVITY_STATE, type CheckResult} from './checks.js'
import {runConnectivitySelfCheck} from './scheduler-job.js'

export default router({
	// Read the persisted state + a recomputed score from the last-known statuses.
	getReport: privateProcedure.query(async ({ctx}) => {
		const state = (await ctx.livinityd!.store.get('connectivity')) ?? EMPTY_CONNECTIVITY_STATE
		// Rebuild CheckResult-shaped rows from the persisted baseline for scoring +
		// UI rendering (category is derived from the id prefix — stable by construction).
		const rows: CheckResult[] = Object.entries(state.checks ?? {}).map(([id, c]) => ({
			id,
			category: (id.split(':')[0] ?? 'dns') as CheckResult['category'],
			status: c.status,
			detail: c.detail ?? '',
			at: c.at,
		}))
		return {
			lastRun: state.lastRun ?? null,
			ignore: state.ignore ?? [],
			mailEnabled: !!state.mailEnabled,
			checks: rows,
			score: scoreChecks(rows),
		}
	}),

	// On-demand full self-check (admin-only; it mutates the persisted baseline + may alert).
	runCheckNow: adminProcedure.mutation(async ({ctx}) => {
		const out = await runConnectivitySelfCheck(ctx.livinityd!, ctx.logger!)
		return {ran: out.count, score: out.results}
	}),

	// Mute / unmute a single check id (an ignored check still runs + scores but never alerts).
	setIgnore: adminProcedure
		.input(z.object({id: z.string().min(1).max(64), ignored: z.boolean()}))
		.mutation(async ({ctx, input}) => {
			await ctx.livinityd!.store.getWriteLock(async ({get, set}) => {
				const state = (await get('connectivity')) ?? EMPTY_CONNECTIVITY_STATE
				const ignore = new Set(state.ignore ?? [])
				if (input.ignored) ignore.add(input.id)
				else ignore.delete(input.id)
				await set('connectivity', {...state, ignore: [...ignore]})
			})
			return {ok: true as const}
		}),

	// Opt the mail-deliverability category in/out (default off, D-333-3).
	setMailEnabled: adminProcedure.input(z.object({enabled: z.boolean()})).mutation(async ({ctx, input}) => {
		await ctx.livinityd!.store.getWriteLock(async ({get, set}) => {
			const state = (await get('connectivity')) ?? EMPTY_CONNECTIVITY_STATE
			await set('connectivity', {...state, mailEnabled: input.enabled})
		})
		return {ok: true as const}
	}),
})
