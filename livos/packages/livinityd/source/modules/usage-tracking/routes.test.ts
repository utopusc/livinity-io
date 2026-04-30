/**
 * Phase 44 Plan 44-03 — tRPC `usage` router tests.
 *
 * Strategy: use tRPC's createCallerFactory to invoke procedures directly with
 * a stub Context. Mock the database layer with vi.mock so tests don't need
 * a real PostgreSQL pool.
 *
 * The CRITICAL test is T4: a non-admin caller invoking `usage.getAll` MUST
 * receive a TRPCError with code 'FORBIDDEN' (per AUDIT.md Section 2 finding —
 * requireRole throws FORBIDDEN, NOT UNAUTHORIZED).
 */

import {beforeEach, describe, expect, test, vi} from 'vitest'
import {TRPCError} from '@trpc/server'

// Mock database BEFORE importing the router
const queryUsageByUserMock = vi.fn()
const queryUsageAllMock = vi.fn()
const countUsageTodayMock = vi.fn()

vi.mock('./database.js', () => ({
	queryUsageByUser: (...args: unknown[]) => queryUsageByUserMock(...args),
	queryUsageAll: (...args: unknown[]) => queryUsageAllMock(...args),
	countUsageToday: (...args: unknown[]) => countUsageTodayMock(...args),
}))

import usageRouter from './routes.js'
import {t} from '../server/trpc/trpc.js'

const createCaller = t.createCallerFactory(usageRouter)

function makeCtx(opts: {role?: 'admin' | 'member' | 'guest'; userId?: string} = {}) {
	return {
		dangerouslyBypassAuthentication: true,
		transport: 'ws',
		currentUser: {
			id: opts.userId ?? 'user-A',
			username: 'alice',
			role: opts.role ?? 'member',
		},
		// websocketLogger middleware reads ctx.logger.verbose — provide a no-op stub
		logger: {
			log: () => {},
			verbose: () => {},
			error: () => {},
		},
	} as never
}

describe('usage router Plan 44-03', () => {
	beforeEach(() => {
		queryUsageByUserMock.mockReset()
		queryUsageAllMock.mockReset()
		countUsageTodayMock.mockReset()
	})

	test('T1 — getMine returns expected shape with stats + today_count + banner', async () => {
		const today = new Date()
		queryUsageByUserMock.mockResolvedValue([
			{
				id: 'r1',
				user_id: 'user-A',
				app_id: 'mirofish',
				model: 'claude-sonnet-4-6',
				prompt_tokens: 10,
				completion_tokens: 5,
				request_id: 'msg_x',
				endpoint: 'messages',
				created_at: today,
			},
		])
		countUsageTodayMock.mockResolvedValue(1)

		const caller = createCaller(makeCtx({role: 'member'}))
		const result = await caller.getMine(undefined)

		expect(result.stats.cumulative_prompt_tokens).toBe(10)
		expect(result.stats.cumulative_completion_tokens).toBe(5)
		expect(result.stats.per_app).toHaveLength(1)
		expect(result.today_count).toBe(1)
		expect(result.banner.tier).toBe('pro')
		expect(result.banner.dailyCap).toBe(200)
		expect(result.banner.state).toBe('none') // 1/200 is well under 80%

		expect(queryUsageByUserMock).toHaveBeenCalledWith(
			expect.objectContaining({userId: 'user-A'}),
		)
		expect(countUsageTodayMock).toHaveBeenCalledWith('user-A')
	})

	test('T2 — getMine respects since parameter', async () => {
		queryUsageByUserMock.mockResolvedValue([])
		countUsageTodayMock.mockResolvedValue(0)
		const since = new Date('2026-04-01T00:00:00Z')

		const caller = createCaller(makeCtx({role: 'member'}))
		await caller.getMine({since})

		expect(queryUsageByUserMock).toHaveBeenCalledWith(
			expect.objectContaining({userId: 'user-A', since}),
		)
	})

	test('T3 — getAll returns rows + stats for admin caller', async () => {
		const today = new Date()
		queryUsageAllMock.mockResolvedValue([
			{
				id: 'r1',
				user_id: 'user-A',
				app_id: 'mirofish',
				model: 'claude-sonnet-4-6',
				prompt_tokens: 30,
				completion_tokens: 10,
				request_id: 'msg_z',
				endpoint: 'messages',
				created_at: today,
			},
		])

		const caller = createCaller(makeCtx({role: 'admin', userId: 'admin-id'}))
		const result = await caller.getAll({app_id: 'mirofish'})

		expect(result.rows).toHaveLength(1)
		expect(result.stats.total_requests).toBe(1)
		expect(queryUsageAllMock).toHaveBeenCalledWith(
			expect.objectContaining({appId: 'mirofish'}),
		)
	})

	test('T4 — getAll REJECTS non-admin caller with FORBIDDEN code', async () => {
		queryUsageAllMock.mockResolvedValue([])
		const caller = createCaller(makeCtx({role: 'member'}))

		// CRITICAL: requireRole('admin') throws TRPCError with code 'FORBIDDEN'
		// (verified by AUDIT.md Section 2 — checked is-authenticated.ts:88)
		await expect(caller.getAll(undefined)).rejects.toThrow(TRPCError)
		await expect(caller.getAll(undefined)).rejects.toMatchObject({code: 'FORBIDDEN'})

		// queryUsageAll must NOT have been invoked — the gate fires before the resolver
		expect(queryUsageAllMock).not.toHaveBeenCalled()
	})

	test('T5 — getMine returns empty shape gracefully when DB layer returns []', async () => {
		queryUsageByUserMock.mockResolvedValue([])
		countUsageTodayMock.mockResolvedValue(0)

		const caller = createCaller(makeCtx({role: 'member'}))
		const result = await caller.getMine(undefined)

		expect(result.stats.cumulative_prompt_tokens).toBe(0)
		expect(result.stats.total_requests).toBe(0)
		expect(result.stats.per_app).toEqual([])
		expect(result.banner.state).toBe('none')
	})
})
