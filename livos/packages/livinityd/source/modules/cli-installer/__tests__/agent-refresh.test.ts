/**
 * Phase 267-03 Task 1 — agent-refresh.test.ts
 *
 * Unit tests for `scheduleAgentRefresh` — the debounced, best-effort
 * liv-assistant restart.
 *
 * Covers the 267-03 must-haves:
 *   - DEBOUNCE / COALESCE: 3 rapid scheduleAgentRefresh calls → EXACTLY ONE
 *     execFn invocation (a burst of installs = one restart, not one-per-CLI).
 *   - BEST-EFFORT: a throwing/rejecting execFn is swallowed + logged; the call
 *     never throws and never produces an unhandled rejection.
 *   - STATUS KEY: liv:cli:agent-refresh is SET 'restarting' then 'done' (the UI
 *     polls it to show "Applying…").
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
	scheduleAgentRefresh,
	agentRefreshStatusKey,
	_resetAgentRefreshForTests,
} from '../agent-refresh.js'
import type {InstallerLogger} from '../types.js'

function makeLogger(): InstallerLogger {
	return {info: vi.fn(), warn: vi.fn(), error: vi.fn()}
}

// A no-op sleep so probeAgents' poll loop doesn't actually wait 10s.
const noSleep = (): Promise<void> => Promise.resolve()

beforeEach(() => {
	_resetAgentRefreshForTests()
	vi.useFakeTimers()
})

afterEach(() => {
	_resetAgentRefreshForTests()
	vi.useRealTimers()
})

describe('scheduleAgentRefresh — debounce / coalescing', () => {
	test('3 rapid calls produce EXACTLY ONE execFn invocation', async () => {
		const execFn = vi.fn(async () => {})
		const logger = makeLogger()
		const deps = {logger, execFn, debounceMs: 50, sleepFn: noSleep}

		scheduleAgentRefresh(deps)
		scheduleAgentRefresh(deps)
		scheduleAgentRefresh(deps)

		// Before the debounce window elapses, nothing has fired.
		expect(execFn).not.toHaveBeenCalled()

		// Advance past the debounce — the single trailing edge fires.
		await vi.advanceTimersByTimeAsync(60)

		expect(execFn).toHaveBeenCalledTimes(1)
	})

	test('a second burst AFTER the first restart fires a second restart', async () => {
		const execFn = vi.fn(async () => {})
		const logger = makeLogger()
		const deps = {logger, execFn, debounceMs: 50, sleepFn: noSleep}

		scheduleAgentRefresh(deps)
		scheduleAgentRefresh(deps)
		await vi.advanceTimersByTimeAsync(60)
		expect(execFn).toHaveBeenCalledTimes(1)

		// New burst after the first one settled.
		scheduleAgentRefresh(deps)
		scheduleAgentRefresh(deps)
		await vi.advanceTimersByTimeAsync(60)
		expect(execFn).toHaveBeenCalledTimes(2)
	})
})

describe('scheduleAgentRefresh — best-effort (never throws)', () => {
	test('a throwing execFn is swallowed + logged, no unhandled rejection', async () => {
		const execFn = vi.fn(async () => {
			throw new Error('sudo: a password is required')
		})
		const logger = makeLogger()

		expect(() =>
			scheduleAgentRefresh({logger, execFn, debounceMs: 50, sleepFn: noSleep}),
		).not.toThrow()

		await vi.advanceTimersByTimeAsync(60)
		// Let the swallowed rejection settle.
		await Promise.resolve()
		await Promise.resolve()

		expect(execFn).toHaveBeenCalledTimes(1)
		// The failure was logged as a warning, not thrown.
		expect(logger.warn).toHaveBeenCalled()
		const warnArgs = (logger.warn as any).mock.calls.flat().join(' ')
		expect(warnArgs).toMatch(/restart failed/i)
	})

	test('scheduleAgentRefresh returns void synchronously', () => {
		const ret = scheduleAgentRefresh({
			logger: makeLogger(),
			execFn: async () => {},
			debounceMs: 50,
			sleepFn: noSleep,
		})
		expect(ret).toBeUndefined()
	})
})

describe('scheduleAgentRefresh — status key', () => {
	test('SETs liv:cli:agent-refresh restarting → done (TTL)', async () => {
		const set = vi.fn(async () => 'OK')
		const redis = {set} as any
		const logger = makeLogger()

		scheduleAgentRefresh({
			logger,
			execFn: async () => {},
			redis,
			debounceMs: 50,
			sleepFn: noSleep,
		})

		await vi.advanceTimersByTimeAsync(60)
		await Promise.resolve()
		await Promise.resolve()

		// First SET = 'restarting', a later SET = 'done', both on the status key.
		const values = set.mock.calls.map((c: any[]) => c[1])
		expect(set.mock.calls.every((c: any[]) => c[0] === agentRefreshStatusKey)).toBe(
			true,
		)
		expect(values).toContain('restarting')
		expect(values).toContain('done')
		// Each SET carries an EX TTL.
		expect(set.mock.calls.every((c: any[]) => c[2] === 'EX')).toBe(true)
	})

	test('a throwing redis.set never breaks the restart (still best-effort)', async () => {
		const set = vi.fn(async () => {
			throw new Error('redis down')
		})
		const execFn = vi.fn(async () => {})
		const logger = makeLogger()

		expect(() =>
			scheduleAgentRefresh({
				logger,
				execFn,
				redis: {set} as any,
				debounceMs: 50,
				sleepFn: noSleep,
			}),
		).not.toThrow()

		await vi.advanceTimersByTimeAsync(60)
		await Promise.resolve()
		await Promise.resolve()

		// The restart still ran despite the Redis failure.
		expect(execFn).toHaveBeenCalledTimes(1)
	})
})
