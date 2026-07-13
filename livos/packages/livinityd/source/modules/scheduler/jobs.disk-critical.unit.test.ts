// Phase 310 ALERT-02 — disk-critical-watch unit tests.
//
// Covers:
//   1-5: diskSeverityFor() pure-function threshold + boundary tests
//        (the EXACT byte constants ported from ui/src/utils/system.ts)
//   6:   SKIP-PATH — diskCriticalWatchHandler with NO ctx.livinityd resolves
//        (never throws) and returns {status: 'skipped'} (the Plan-02 ctx seam)
//   7:   registry reachability — BUILT_IN_HANDLERS['disk-critical-watch'] is the
//        same handler and also skips cleanly
//   8:   HAPPY-PATH (critical) — mocked getSystemDiskUsage < 100MB → add('disk-critical',
//        {severity:'critical', external:true}), clear NOT called
//   9:   HAPPY-PATH (recovery) — mocked getSystemDiskUsage > 1GB → clear('disk-critical'),
//        add NOT called
//
// Only jobs.ts consumes '../system/system.js' in the scheduler graph, so mocking
// it here is isolated (no transitive module breaks).

import {describe, expect, test, vi} from 'vitest'

import type {ScheduledJob} from './types.js'

// ---------------------------------------------------------------------------
// Module mock (hoisted before importing the module under test, per vitest rules)
// ---------------------------------------------------------------------------
const mockGetSystemDiskUsage = vi.fn()
vi.mock('../system/system.js', () => ({
	getSystemDiskUsage: (...args: unknown[]) => mockGetSystemDiskUsage(...args),
}))

import {BUILT_IN_HANDLERS, diskCriticalWatchHandler, diskSeverityFor} from './jobs.js'

// Minimal ScheduledJob-shaped stub — the handler only reads job.name.
const fakeJob = {name: 'disk-critical-watch', type: 'disk-critical-watch'} as unknown as ScheduledJob
const fakeLogger = {log: vi.fn(), error: vi.fn()}

describe('diskSeverityFor (pure threshold logic — ported byte constants)', () => {
	test('below 100MB free → critical', () => {
		expect(diskSeverityFor(50_000_000)).toBe('critical')
	})
	test('below 1GB free → warning', () => {
		expect(diskSeverityFor(500_000_000)).toBe('warning')
	})
	test('healthy (>1GB free) → null', () => {
		expect(diskSeverityFor(5_000_000_000)).toBeNull()
	})
	test('boundary: exactly 100MB is NOT critical → warning', () => {
		expect(diskSeverityFor(100_000_000)).toBe('warning')
	})
	test('boundary: exactly 1GB is NOT warning → null', () => {
		expect(diskSeverityFor(1_000_000_000)).toBeNull()
	})
})

describe('diskCriticalWatchHandler — ctx.livinityd seam (Plan 02)', () => {
	test('SKIP-PATH: no ctx.livinityd → resolves, never throws, returns {status: skipped}', async () => {
		const result = await diskCriticalWatchHandler(fakeJob, {logger: fakeLogger})
		expect(result.status).toBe('skipped')
		expect(mockGetSystemDiskUsage).not.toHaveBeenCalled()
	})

	test('registry: BUILT_IN_HANDLERS[disk-critical-watch] is wired and skips cleanly', async () => {
		const handler = BUILT_IN_HANDLERS['disk-critical-watch']
		expect(handler).toBe(diskCriticalWatchHandler)
		const result = await handler(fakeJob, {logger: fakeLogger})
		expect(result.status).toBe('skipped')
	})

	test('HAPPY-PATH (critical): <100MB free → add(disk-critical, critical, external), no clear', async () => {
		mockGetSystemDiskUsage.mockReset()
		mockGetSystemDiskUsage.mockResolvedValue({size: 1, totalUsed: 1, available: 50_000_000})
		const add = vi.fn().mockResolvedValue(true)
		const clear = vi.fn().mockResolvedValue(true)
		const livinityd = {notifications: {add, clear}} as never

		const result = await diskCriticalWatchHandler(fakeJob, {logger: fakeLogger, livinityd})

		expect(result.status).toBe('success')
		expect(add).toHaveBeenCalledWith('disk-critical', {severity: 'critical', external: true})
		expect(clear).not.toHaveBeenCalled()
	})

	test('HAPPY-PATH (recovery): >1GB free → clear(disk-critical), no add', async () => {
		mockGetSystemDiskUsage.mockReset()
		mockGetSystemDiskUsage.mockResolvedValue({size: 1, totalUsed: 1, available: 5_000_000_000})
		const add = vi.fn().mockResolvedValue(true)
		const clear = vi.fn().mockResolvedValue(true)
		const livinityd = {notifications: {add, clear}} as never

		const result = await diskCriticalWatchHandler(fakeJob, {logger: fakeLogger, livinityd})

		expect(result.status).toBe('success')
		expect(clear).toHaveBeenCalledWith('disk-critical')
		expect(add).not.toHaveBeenCalled()
	})
})
