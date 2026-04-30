/**
 * Phase 44 Plan 44-03 — pure aggregation helpers for the usage dashboard.
 *
 * Inputs: UsageRow[] from database.ts. Outputs: stats objects ready for the
 * UI to render. No DB / no IO in this module — testable as plain functions.
 */

import type {UsageRow} from './database.js'

/**
 * Hardcoded daily caps per Anthropic subscription tier (D-44-08).
 *
 * Auto tier detection deferred — defaults to `pro` for v29.3. Future
 * enhancements: detect from Anthropic API response headers OR add a per-user
 * Redis setting. Per FR-DASH-future / D-44-08 the limitation is acceptable
 * and visible in the banner copy ("(pro tier)").
 */
export const RATE_LIMIT_BY_TIER = {
	pro: 200,
	max5x: 1000,
	max20x: 4000,
} as const

export type Tier = keyof typeof RATE_LIMIT_BY_TIER

/** Threshold (fraction of dailyCap) at which the warn banner appears. */
export const WARN_THRESHOLD = 0.8

export type PerAppStat = {
	app_id: string | null
	request_count: number
	prompt_tokens: number
	completion_tokens: number
	last_used_at: Date
}

export type DailyCount = {
	/** YYYY-MM-DD UTC date string */
	date: string
	count: number
}

export type UsageStats = {
	cumulative_prompt_tokens: number
	cumulative_completion_tokens: number
	total_requests: number
	per_app: PerAppStat[]
	daily_last_30: DailyCount[]
}

/**
 * Aggregate usage rows into a stats object suitable for the dashboard UI.
 *
 * Behaviour notes:
 *  - 429-throttled rows have prompt_tokens=0 + completion_tokens=0 — they
 *    contribute nothing to cumulative tokens but ARE counted in
 *    total_requests + per_app.request_count. The user can see throttle
 *    attempts.
 *  - per_app is sorted by request_count DESC.
 *  - daily_last_30 always has 30 entries (UTC date strings); missing days
 *    have count=0.
 */
export function aggregateUsageStats(rows: UsageRow[]): UsageStats {
	const stats: UsageStats = {
		cumulative_prompt_tokens: 0,
		cumulative_completion_tokens: 0,
		total_requests: rows.length,
		per_app: [],
		daily_last_30: [],
	}

	const perAppMap = new Map<string | null, PerAppStat>()
	const dailyMap = new Map<string, number>()

	for (const row of rows) {
		const created = row.created_at instanceof Date ? row.created_at : new Date(row.created_at)
		stats.cumulative_prompt_tokens += row.prompt_tokens
		stats.cumulative_completion_tokens += row.completion_tokens

		const key = row.app_id
		const existing = perAppMap.get(key)
		if (existing) {
			existing.request_count += 1
			existing.prompt_tokens += row.prompt_tokens
			existing.completion_tokens += row.completion_tokens
			if (created > existing.last_used_at) existing.last_used_at = created
		} else {
			perAppMap.set(key, {
				app_id: key,
				request_count: 1,
				prompt_tokens: row.prompt_tokens,
				completion_tokens: row.completion_tokens,
				last_used_at: created,
			})
		}

		const utcDateKey = created.toISOString().slice(0, 10)
		dailyMap.set(utcDateKey, (dailyMap.get(utcDateKey) ?? 0) + 1)
	}

	stats.per_app = Array.from(perAppMap.values()).sort(
		(a, b) => b.request_count - a.request_count,
	)

	// Build last 30 days (UTC) inclusive of today, oldest first
	const today = new Date()
	for (let i = 29; i >= 0; i--) {
		const d = new Date(today)
		d.setUTCDate(d.getUTCDate() - i)
		const key = d.toISOString().slice(0, 10)
		stats.daily_last_30.push({date: key, count: dailyMap.get(key) ?? 0})
	}

	return stats
}

export type BannerState = {
	state: 'none' | 'warn' | 'critical'
	percentUsed: number
	todayCount: number
	dailyCap: number
	tier: Tier
	lastThrottleAt: Date | null
}

/**
 * Compute the banner state for the rate-limit UI surface.
 *
 * State transitions (D-44-10):
 *  - <80% of dailyCap → 'none' (banner hidden)
 *  - 80-99% of dailyCap → 'warn' (yellow banner)
 *  - >=100% of dailyCap → 'critical' (red banner)
 *  - 429 received within last hour → 'critical' (overrides percentage)
 */
export function computeBannerState(opts: {
	todayCount: number
	tier?: Tier
	last429At?: Date | null
}): BannerState {
	const tier = opts.tier ?? 'pro'
	const dailyCap = RATE_LIMIT_BY_TIER[tier]
	const percentUsed = dailyCap > 0 ? opts.todayCount / dailyCap : 0
	const last429 = opts.last429At ?? null
	const recentThrottle =
		last429 !== null && Date.now() - last429.getTime() < 60 * 60 * 1000

	let state: BannerState['state'] = 'none'
	if (percentUsed >= 1 || recentThrottle) state = 'critical'
	else if (percentUsed >= WARN_THRESHOLD) state = 'warn'

	return {
		state,
		percentUsed,
		todayCount: opts.todayCount,
		dailyCap,
		tier,
		lastThrottleAt: last429,
	}
}
