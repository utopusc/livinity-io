/**
 * Phase 44 Plan 44-03 — aggregations.ts pure-function tests.
 *
 * No DB / no IO — these are deterministic transform tests on UsageRow inputs.
 */

import {describe, expect, test} from 'vitest'

import {
	aggregateUsageStats,
	computeBannerState,
	RATE_LIMIT_BY_TIER,
	WARN_THRESHOLD,
} from './aggregations.js'
import type {UsageRow} from './database.js'

function makeRow(overrides: Partial<UsageRow>): UsageRow {
	return {
		id: 'r-' + Math.random().toString(36).slice(2),
		user_id: 'user-A',
		app_id: 'mirofish',
		model: 'claude-sonnet-4-6',
		prompt_tokens: 10,
		completion_tokens: 5,
		request_id: 'msg_' + Math.random().toString(36).slice(2),
		endpoint: 'messages',
		created_at: new Date('2026-04-29T12:00:00Z'),
		...overrides,
	}
}

describe('aggregations Plan 44-03', () => {
	test('T1 — aggregateUsageStats with mixed rows produces correct cumulative + per-app + daily', () => {
		const today = new Date()
		const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
		const rows: UsageRow[] = [
			makeRow({user_id: 'user-A', app_id: 'mirofish', prompt_tokens: 10, completion_tokens: 5, created_at: today}),
			makeRow({user_id: 'user-A', app_id: 'mirofish', prompt_tokens: 20, completion_tokens: 8, created_at: today}),
			makeRow({user_id: 'user-A', app_id: 'dify', prompt_tokens: 30, completion_tokens: 15, created_at: yesterday}),
		]
		const stats = aggregateUsageStats(rows)

		expect(stats.cumulative_prompt_tokens).toBe(60)
		expect(stats.cumulative_completion_tokens).toBe(28)
		expect(stats.total_requests).toBe(3)

		// per_app sorted by request_count DESC: mirofish (2) > dify (1)
		expect(stats.per_app).toHaveLength(2)
		expect(stats.per_app[0].app_id).toBe('mirofish')
		expect(stats.per_app[0].request_count).toBe(2)
		expect(stats.per_app[0].prompt_tokens).toBe(30)
		expect(stats.per_app[0].completion_tokens).toBe(13)
		expect(stats.per_app[1].app_id).toBe('dify')
		expect(stats.per_app[1].request_count).toBe(1)

		// daily_last_30 has 30 entries
		expect(stats.daily_last_30).toHaveLength(30)
		// Last entry should be today (UTC date string)
		const todayKey = today.toISOString().slice(0, 10)
		const yesterdayKey = yesterday.toISOString().slice(0, 10)
		const todayEntry = stats.daily_last_30.find((d) => d.date === todayKey)
		expect(todayEntry?.count).toBe(2)
		const yesterdayEntry = stats.daily_last_30.find((d) => d.date === yesterdayKey)
		expect(yesterdayEntry?.count).toBe(1)
	})

	test('T2 — computeBannerState transitions correctly across thresholds', () => {
		// State: none — under 80% of pro cap (200)
		const low = computeBannerState({todayCount: 50, tier: 'pro'})
		expect(low.state).toBe('none')
		expect(low.tier).toBe('pro')
		expect(low.dailyCap).toBe(RATE_LIMIT_BY_TIER.pro)

		// State: warn — at 80% (160 of 200)
		const warn = computeBannerState({todayCount: 160, tier: 'pro'})
		expect(warn.state).toBe('warn')
		expect(warn.percentUsed).toBeCloseTo(0.8, 5)

		// State: critical — at 100% (200 of 200)
		const crit = computeBannerState({todayCount: 200, tier: 'pro'})
		expect(crit.state).toBe('critical')
		expect(crit.percentUsed).toBe(1.0)

		// State: critical when recent 429 even if percentage is low
		const recentThrottle = new Date(Date.now() - 10 * 60 * 1000) // 10 min ago
		const throttled = computeBannerState({
			todayCount: 50,
			tier: 'pro',
			last429At: recentThrottle,
		})
		expect(throttled.state).toBe('critical')
		expect(throttled.lastThrottleAt).toEqual(recentThrottle)

		// State: NOT critical if 429 is older than 1 hour
		const oldThrottle = new Date(Date.now() - 2 * 60 * 60 * 1000) // 2h ago
		const notThrottled = computeBannerState({
			todayCount: 50,
			tier: 'pro',
			last429At: oldThrottle,
		})
		expect(notThrottled.state).toBe('none')
	})

	test('T3 — aggregateUsageStats handles empty rows array', () => {
		const stats = aggregateUsageStats([])
		expect(stats.cumulative_prompt_tokens).toBe(0)
		expect(stats.cumulative_completion_tokens).toBe(0)
		expect(stats.total_requests).toBe(0)
		expect(stats.per_app).toEqual([])
		expect(stats.daily_last_30).toHaveLength(30)
		// Every daily entry should have count 0
		for (const d of stats.daily_last_30) {
			expect(d.count).toBe(0)
		}
	})

	test('T4 — 429-throttled rows: tokens=0 contribute 0 to cumulative; per-app counts ARE included', () => {
		const rows: UsageRow[] = [
			makeRow({app_id: 'mirofish', prompt_tokens: 10, completion_tokens: 5, endpoint: 'messages'}),
			makeRow({app_id: 'mirofish', prompt_tokens: 0, completion_tokens: 0, endpoint: '429-throttled'}),
			makeRow({app_id: 'mirofish', prompt_tokens: 0, completion_tokens: 0, endpoint: '429-throttled'}),
		]
		const stats = aggregateUsageStats(rows)
		expect(stats.cumulative_prompt_tokens).toBe(10)
		expect(stats.cumulative_completion_tokens).toBe(5)
		expect(stats.total_requests).toBe(3) // throttle attempts ARE counted
		expect(stats.per_app).toHaveLength(1)
		expect(stats.per_app[0].request_count).toBe(3) // user can SEE throttle attempts
	})

	test('T5 — WARN_THRESHOLD constant is 0.8 (sanity check)', () => {
		expect(WARN_THRESHOLD).toBe(0.8)
	})

	test('T6 — RATE_LIMIT_BY_TIER values match D-44-08', () => {
		expect(RATE_LIMIT_BY_TIER.pro).toBe(200)
		expect(RATE_LIMIT_BY_TIER.max5x).toBe(1000)
		expect(RATE_LIMIT_BY_TIER.max20x).toBe(4000)
	})
})
