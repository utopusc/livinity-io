/**
 * Phase 44 Plan 44-02 — database.ts unit tests.
 *
 * Strategy: mock `getPool()` to return a stub Pool that records query calls.
 * No real PostgreSQL needed — assertions verify SQL string + params shape.
 */

import {beforeEach, describe, expect, test, vi} from 'vitest'

const queryMock = vi.fn()

vi.mock('../database/index.js', () => ({
	getPool: () => ({query: queryMock}),
}))

// Import AFTER mock setup
import {
	insertUsage,
	queryUsageByUser,
	queryUsageAll,
	countUsageToday,
} from './database.js'

describe('usage-tracking database Plan 44-02', () => {
	beforeEach(() => {
		queryMock.mockReset()
	})

	test('T1 — insertUsage emits single INSERT with correct param ordering', async () => {
		queryMock.mockResolvedValue({rows: [], rowCount: 1})
		await insertUsage({
			userId: 'user-A',
			appId: 'mirofish',
			apiKeyId: null,
			model: 'claude-sonnet-4-6',
			promptTokens: 42,
			completionTokens: 13,
			requestId: 'msg_abc',
			endpoint: 'messages',
		})
		expect(queryMock).toHaveBeenCalledTimes(1)
		const [sql, params] = queryMock.mock.calls[0]
		expect(sql).toMatch(/INSERT INTO broker_usage/)
		// Phase 62 — column list now 8 columns including api_key_id at position 3
		expect(sql).toMatch(
			/user_id, app_id, api_key_id, model, prompt_tokens, completion_tokens, request_id, endpoint/,
		)
		expect(params).toEqual([
			'user-A',
			'mirofish',
			null,
			'claude-sonnet-4-6',
			42,
			13,
			'msg_abc',
			'messages',
		])
	})

	test('T2 — queryUsageByUser issues SELECT with user_id filter and orders by created_at DESC', async () => {
		queryMock.mockResolvedValue({rows: [{id: '1', user_id: 'user-A'}]})
		const since = new Date('2026-01-01T00:00:00Z')
		const result = await queryUsageByUser({userId: 'user-A', since})
		expect(queryMock).toHaveBeenCalledTimes(1)
		const [sql, params] = queryMock.mock.calls[0]
		expect(sql).toMatch(/SELECT/)
		expect(sql).toMatch(/FROM broker_usage/)
		expect(sql).toMatch(/WHERE user_id = \$1/)
		expect(sql).toMatch(/ORDER BY created_at DESC/)
		expect(params).toEqual(['user-A', since])
		expect(result).toEqual([{id: '1', user_id: 'user-A'}])
	})

	test('T3 — queryUsageAll respects optional filters and applies LIMIT', async () => {
		queryMock.mockResolvedValue({rows: []})
		const since = new Date('2026-01-01T00:00:00Z')
		await queryUsageAll({userId: 'user-A', appId: 'mirofish', model: 'claude-sonnet-4-6', since})
		const [sql, params] = queryMock.mock.calls[0]
		expect(sql).toMatch(/FROM broker_usage/)
		expect(sql).toMatch(/created_at >= \$1/)
		expect(sql).toMatch(/user_id = \$/)
		expect(sql).toMatch(/app_id = \$/)
		expect(sql).toMatch(/model = \$/)
		expect(sql).toMatch(/LIMIT 1000/)
		expect(params[0]).toEqual(since)
		expect(params).toContain('user-A')
		expect(params).toContain('mirofish')
		expect(params).toContain('claude-sonnet-4-6')
	})

	test('T4 — countUsageToday SQL uses CURRENT_DATE AT TIME ZONE UTC (D-44-09 regression)', async () => {
		queryMock.mockResolvedValue({rows: [{count: 42}]})
		const result = await countUsageToday('user-A')
		expect(queryMock).toHaveBeenCalledTimes(1)
		const [sql, params] = queryMock.mock.calls[0]
		// D-44-09: today's count must reset at UTC midnight, NOT local timezone.
		// Regression-pin the SQL string contains the explicit UTC clause.
		expect(sql).toMatch(/CURRENT_DATE AT TIME ZONE 'UTC'/)
		expect(params).toEqual(['user-A'])
		expect(result).toBe(42)
	})
})
