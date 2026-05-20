// Phase 177-01 — AgentScheduleRegistry tests (T-SCHED-01..T-SCHED-10).
//
// Pattern: vi.hoisted() captures the node-cron mock before any import;
// ItemStore is a plain mock object (no FS). All RED until agent-schedule.ts exists.

import {describe, it, expect, vi, beforeEach} from 'vitest'

// ── node-cron mock (hoisted so vi.mock factory can reference it) ────────────
const cronMock = vi.hoisted(() => ({
	validate: vi.fn(() => true),
	schedule: vi.fn(() => ({stop: vi.fn()})),
}))

vi.mock('node-cron', () => ({
	default: cronMock,
	validate: cronMock.validate,
	schedule: cronMock.schedule,
}))

// ── SUT imports (after mock wiring) ─────────────────────────────────────────
import {
	AgentScheduleRegistry,
	scheduleAgent,
	unscheduleAgent,
	bootSweepAgentSchedules,
} from './agent-schedule.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeAgent(id: string, schedule?: string) {
	return {
		id,
		type: 'agent' as const,
		name: `Agent ${id}`,
		parentId: null,
		pinned: false,
		createdAt: 0,
		updatedAt: 0,
		archivedAt: null,
		schemaVersion: 1 as const,
		...(schedule !== undefined ? {schedule} : {}),
	}
}

function makeProject(id: string) {
	return {
		id,
		type: 'project' as const,
		name: `Project ${id}`,
		parentId: null,
		pinned: false,
		createdAt: 0,
		updatedAt: 0,
		archivedAt: null,
		schemaVersion: 1 as const,
	}
}

function makeStoreMock(items: unknown[]) {
	return {
		list: vi.fn(async () => items),
	}
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('AgentScheduleRegistry — T-SCHED-01 through T-SCHED-10', () => {
	let registry: AgentScheduleRegistry

	beforeEach(() => {
		registry = new AgentScheduleRegistry()
		vi.clearAllMocks()
		// Default: validate returns true, schedule returns a task with stop()
		cronMock.validate.mockReturnValue(true)
		cronMock.schedule.mockReturnValue({stop: vi.fn()})
	})

	it('T-SCHED-01: bootSweepAgentSchedules registers agents with schedules, returns counts', async () => {
		const store = makeStoreMock([
			makeAgent('a1', '0 9 * * *'),
			makeAgent('a2', '0 10 * * *'),
			makeAgent('a3'), // no schedule — skip
			makeProject('p1'), // not agent — skip
		])
		const runFn = vi.fn()
		const result = await bootSweepAgentSchedules(store as any, registry, runFn)
		expect(result.registered).toBe(2)
		expect(result.skipped).toBe(2)
		expect(cronMock.schedule).toHaveBeenCalledTimes(2)
	})

	it('T-SCHED-02: bootSweepAgentSchedules skips agents with undefined or empty schedule', async () => {
		const store = makeStoreMock([
			makeAgent('a1', undefined),
			makeAgent('a2', ''),
		])
		const runFn = vi.fn()
		const result = await bootSweepAgentSchedules(store as any, registry, runFn)
		expect(result.registered).toBe(0)
		expect(result.skipped).toBe(2)
		expect(cronMock.schedule).not.toHaveBeenCalled()
	})

	it('T-SCHED-03: scheduleAgent returns {ok: false, reason: "invalid_cron"} for bad expression', () => {
		cronMock.validate.mockReturnValue(false)
		const result = scheduleAgent('a1', '99 * * * *', vi.fn(), registry)
		expect(result).toEqual({ok: false, reason: 'invalid_cron'})
		expect(cronMock.schedule).not.toHaveBeenCalled()
	})

	it('T-SCHED-04: scheduleAgent with valid expression returns {ok: true} and grows registry', () => {
		const result = scheduleAgent('a1', '0 9 * * *', vi.fn(), registry)
		expect(result).toEqual({ok: true})
		expect(registry.tasks.size).toBe(1)
	})

	it('T-SCHED-05: scheduleAgent twice for same agentId stops existing + re-registers (idempotent)', () => {
		const stop1 = vi.fn()
		cronMock.schedule.mockReturnValueOnce({stop: stop1})
		scheduleAgent('a1', '0 9 * * *', vi.fn(), registry)
		expect(registry.tasks.size).toBe(1)

		const stop2 = vi.fn()
		cronMock.schedule.mockReturnValueOnce({stop: stop2})
		scheduleAgent('a1', '0 10 * * *', vi.fn(), registry)

		expect(stop1).toHaveBeenCalledTimes(1) // old task stopped
		expect(registry.tasks.size).toBe(1) // still 1 entry
	})

	it('T-SCHED-06: unscheduleAgent stops the task and removes it; returns {ok: true}', () => {
		const stop = vi.fn()
		cronMock.schedule.mockReturnValue({stop})
		scheduleAgent('a1', '0 9 * * *', vi.fn(), registry)
		expect(registry.tasks.size).toBe(1)

		const result = unscheduleAgent('a1', registry)
		expect(result).toEqual({ok: true})
		expect(stop).toHaveBeenCalledTimes(1)
		expect(registry.tasks.size).toBe(0)
	})

	it('T-SCHED-07: unscheduleAgent on unknown agentId returns {ok: false, reason: "not_found"}', () => {
		const result = unscheduleAgent('unknown-agent', registry)
		expect(result).toEqual({ok: false, reason: 'not_found'})
	})

	it('T-SCHED-08: bootSweepAgentSchedules returns {registered: 0, skipped: 0} on empty store', async () => {
		const store = makeStoreMock([])
		const result = await bootSweepAgentSchedules(store as any, registry, vi.fn())
		expect(result).toEqual({registered: 0, skipped: 0})
	})

	it('T-SCHED-09: bootSweepAgentSchedules registers exactly 2 of 3 agents (partial schedule)', async () => {
		const store = makeStoreMock([
			makeAgent('a1', '0 9 * * *'),
			makeAgent('a2', '0 10 * * *'),
			makeAgent('a3', ''), // empty → skip
		])
		const result = await bootSweepAgentSchedules(store as any, registry, vi.fn())
		expect(result.registered).toBe(2)
		expect(result.skipped).toBe(1)
	})

	it('T-SCHED-10: cron callback fires the user-supplied runFn with the agentId', async () => {
		// Capture the callback passed to cron.schedule
		let capturedCallback: (() => void) | null = null
		cronMock.schedule.mockImplementation((_expr: string, cb: () => void) => {
			capturedCallback = cb
			return {stop: vi.fn()}
		})

		const runFn = vi.fn()
		scheduleAgent('agent-xyz', '* * * * *', runFn, registry)

		// Simulate the cron firing
		expect(capturedCallback).not.toBeNull()
		capturedCallback!()

		expect(runFn).toHaveBeenCalledTimes(1)
	})
})
