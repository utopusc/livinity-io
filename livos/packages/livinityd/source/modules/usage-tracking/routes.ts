/**
 * Phase 44 Plan 44-03 — tRPC `usage` router.
 *
 * Two procedures:
 *  - getMine (privateProcedure): the authenticated user's own stats. Returns
 *    {stats, today_count, banner}. Banner state computed from
 *    countUsageToday() + most-recent 429-throttled row.
 *  - getAll (adminProcedure): cross-user filtered view. Rejects non-admins
 *    with TRPCError code='FORBIDDEN' (per requireRole middleware in
 *    server/trpc/is-authenticated.ts:88).
 *
 * Today's count uses CURRENT_DATE AT TIME ZONE 'UTC' (D-44-09) — Anthropic
 * subscription caps reset at midnight UTC, NOT local timezone. The Plan
 * 44-04 banner copy must match this ("Resets at midnight UTC").
 */

import {z} from 'zod'

import {privateProcedure, adminProcedure, router} from '../server/trpc/trpc.js'
import {
	queryUsageByUser,
	queryUsageAll,
	countUsageToday,
	type UsageRow,
} from './database.js'
import {aggregateUsageStats, computeBannerState, type Tier} from './aggregations.js'

// Phase 62 Plan 03 FR-BROKER-E2-02 — UI filter dropdown can pass an apiKeyId.
// camelCase here (privateProcedure UI ergonomics); getAll uses snake_case
// `api_key_id` to match its existing user_id/app_id field convention.
// Zod stays non-strict (default) so older UI bundles passing no apiKeyId
// still validate (RESEARCH.md §Pitfall 2 — backwards-compat).
const sinceInput = z
	.object({
		since: z.date().optional(),
		apiKeyId: z.string().uuid().optional(),
	})
	.optional()

const getMineProc = privateProcedure
	.input(sinceInput)
	.query(async ({ctx, input}) => {
		// Defensive: privateProcedure should guarantee currentUser, but legacy
		// single-user mode without DB rows can leave it undefined. In that case,
		// return an empty shape so the UI renders cleanly.
		if (!ctx.currentUser) {
			return {
				stats: aggregateUsageStats([]),
				today_count: 0,
				banner: computeBannerState({todayCount: 0}),
			}
		}

		const userId = ctx.currentUser.id
		const since = input?.since
		const rows: UsageRow[] = await queryUsageByUser({
			userId,
			since,
			apiKeyId: input?.apiKeyId,
		})
		const stats = aggregateUsageStats(rows)
		const todayCount = await countUsageToday(userId)

		// Most recent 429-throttled row determines banner critical state
		const last429Row = rows.find((r) => r.endpoint === '429-throttled')
		const last429At = last429Row
			? last429Row.created_at instanceof Date
				? last429Row.created_at
				: new Date(last429Row.created_at)
			: null

		const banner = computeBannerState({
			todayCount,
			tier: 'pro' as Tier, // D-44-08: hardcoded for v29.3
			last429At,
		})

		return {stats, today_count: todayCount, banner}
	})

const getAllProc = adminProcedure
	.input(
		z
			.object({
				user_id: z.string().uuid().optional(),
				app_id: z.string().optional(),
				model: z.string().optional(),
				// Phase 62 Plan 03 FR-BROKER-E2-02 — admin filter dimension.
				// snake_case to match user_id/app_id convention; forwarded as
				// camelCase apiKeyId to queryUsageAll (Plan 01 contract).
				api_key_id: z.string().uuid().optional(),
				since: z.date().optional(),
			})
			.optional(),
	)
	.query(async ({input}) => {
		const rows = await queryUsageAll({
			userId: input?.user_id,
			appId: input?.app_id,
			model: input?.model,
			apiKeyId: input?.api_key_id,
			since: input?.since,
		})
		const stats = aggregateUsageStats(rows)
		return {stats, rows}
	})

const usageRouter = router({
	getMine: getMineProc,
	getAll: getAllProc,
})

export default usageRouter
