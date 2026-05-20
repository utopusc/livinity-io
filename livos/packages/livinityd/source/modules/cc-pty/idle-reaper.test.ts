/**
 * Phase 166-05 — CcPtyIdleReaper vitest spec.
 *
 * 8 assertions covering start/stop/tick semantics + one-shot boot run
 * + setInterval lifecycle + non-fatal error swallow. Mirrors the
 * vitest convention of claude-runner/idle-reaper.test.ts (Phase 165-01)
 * but exercises the DIFFERENT cc-pty reaper (separate file, mirrors
 * pattern only — does NOT modify the 165-01 reaper).
 */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'

import {CcPtyIdleReaper} from './idle-reaper.js'

function makeManagerMock() {
	return {
		runIdleReaper: vi.fn(async () => ({reaped: 0})),
	}
}

function makeLogger() {
	return {
		log: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	}
}

describe('CcPtyIdleReaper', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('Assertion 1: start() invokes manager.runIdleReaper exactly once (one-shot boot run)', async () => {
		const manager = makeManagerMock()
		const logger = makeLogger()
		const reaper = new CcPtyIdleReaper({manager: manager as any, logger, pollIntervalMs: 1000})
		await reaper.start()
		expect(manager.runIdleReaper).toHaveBeenCalledTimes(1)
		reaper.stop()
	})

	it('Assertion 2: setInterval fires runIdleReaper after pollIntervalMs', async () => {
		const manager = makeManagerMock()
		const logger = makeLogger()
		const reaper = new CcPtyIdleReaper({manager: manager as any, logger, pollIntervalMs: 1000})
		await reaper.start()
		expect(manager.runIdleReaper).toHaveBeenCalledTimes(1)
		// Advance one interval — tick should fire
		await vi.advanceTimersByTimeAsync(1000)
		expect(manager.runIdleReaper).toHaveBeenCalledTimes(2)
		// Advance another — should fire again
		await vi.advanceTimersByTimeAsync(1000)
		expect(manager.runIdleReaper).toHaveBeenCalledTimes(3)
		reaper.stop()
	})

	it('Assertion 3: start() is idempotent — two calls register ONE setInterval', async () => {
		const manager = makeManagerMock()
		const logger = makeLogger()
		const reaper = new CcPtyIdleReaper({manager: manager as any, logger, pollIntervalMs: 1000})
		const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
		await reaper.start()
		await reaper.start()
		await reaper.start()
		expect(setIntervalSpy).toHaveBeenCalledTimes(1)
		reaper.stop()
		setIntervalSpy.mockRestore()
	})

	it('Assertion 4: stop() clears the interval — no further runIdleReaper after stop', async () => {
		const manager = makeManagerMock()
		const logger = makeLogger()
		const reaper = new CcPtyIdleReaper({manager: manager as any, logger, pollIntervalMs: 1000})
		await reaper.start()
		manager.runIdleReaper.mockClear()
		reaper.stop()
		await vi.advanceTimersByTimeAsync(60_000)
		expect(manager.runIdleReaper).not.toHaveBeenCalled()
	})

	it('Assertion 5: tick() returns {reaped:<n>} from the manager', async () => {
		const manager = makeManagerMock()
		manager.runIdleReaper.mockResolvedValueOnce({reaped: 3})
		const logger = makeLogger()
		const reaper = new CcPtyIdleReaper({manager: manager as any, logger})
		const r = await reaper.tick()
		expect(r.reaped).toBe(3)
	})

	it('Assertion 6: tick() errors are swallowed (non-fatal) — returns {reaped:0}, logs error', async () => {
		const manager = makeManagerMock()
		manager.runIdleReaper.mockRejectedValueOnce(new Error('boom'))
		const logger = makeLogger()
		const reaper = new CcPtyIdleReaper({manager: manager as any, logger})
		const r = await reaper.tick()
		expect(r.reaped).toBe(0)
		expect(logger.error).toHaveBeenCalledWith(
			expect.stringContaining('tick failed'),
			expect.any(Error),
		)
	})

	it('Assertion 7: boot one-shot error is non-fatal — start() resolves AND interval installed', async () => {
		const manager = makeManagerMock()
		// First call (one-shot boot) throws; subsequent calls resolve normally
		manager.runIdleReaper.mockRejectedValueOnce(new Error('boot-boom'))
		const logger = makeLogger()
		const reaper = new CcPtyIdleReaper({manager: manager as any, logger, pollIntervalMs: 500})
		await expect(reaper.start()).resolves.toBeUndefined()
		expect(logger.error).toHaveBeenCalledWith(
			expect.stringContaining('boot one-shot failed'),
			expect.any(Error),
		)
		// Interval is still installed — advance one tick to prove it
		manager.runIdleReaper.mockClear()
		await vi.advanceTimersByTimeAsync(500)
		expect(manager.runIdleReaper).toHaveBeenCalledTimes(1)
		reaper.stop()
	})

	it('Assertion 8: logger emits "[cc-pty/reaper] started — poll every 300s" on default pollInterval', async () => {
		const manager = makeManagerMock()
		const logger = makeLogger()
		const reaper = new CcPtyIdleReaper({manager: manager as any, logger})
		await reaper.start()
		const startLog = logger.log.mock.calls
			.map(([m]) => m as string)
			.find((m) => m.includes('[cc-pty/reaper] started'))
		expect(startLog).toBeDefined()
		expect(startLog).toMatch(/poll every 300s/)
		reaper.stop()
	})
})
