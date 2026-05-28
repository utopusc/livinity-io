/**
 * Phase 246-05 Task 1 — TTL GC vitest suite (RED → GREEN).
 *
 * Six cases drift-locking the sweep contract:
 *   1. TTL_GC_DEFAULT_IDLE_MS === 24 * 60 * 60 * 1000 (24h)
 *   2. TTL_GC_DEFAULT_SWEEP_MS === 60 * 60 * 1000 (1h)
 *   3. sweepNow with one stale + one fresh → kill('old') exactly once, counter 1
 *   4. sweepNow with two fresh → kill not called, counter 0
 *   5. start() is idempotent — second call clears the prior interval handle
 *   6. stop() calls clearIntervalFn with the handle returned by setIntervalFn
 *
 * Mock SessionManager — only `entries()` and `kill()` are exercised. The fake
 * is constructed via `makeFakeManager(sessions)` to keep each case readable.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {describe, expect, it, vi} from 'vitest'

import {
	createTtlGc,
	TTL_GC_DEFAULT_IDLE_MS,
	TTL_GC_DEFAULT_SWEEP_MS,
} from '../ttl-gc.js'
import type {SessionManager} from '../session-manager.js'

function makeFakeManager(
	sessions: Array<{id: string; lastAttachAt: string}>,
) {
	const map = new Map(
		sessions.map((s) => [
			s.id,
			{
				id: s.id,
				name: 'x',
				pty: null as any,
				createdAt: s.lastAttachAt,
				lastAttachAt: s.lastAttachAt,
			},
		]),
	)
	return {
		entries: () => map.entries(),
		kill: vi.fn().mockImplementation((id: string) => map.delete(id)),
		size: () => map.size,
	} as unknown as SessionManager & {kill: ReturnType<typeof vi.fn>}
}

describe('TTL GC — drift-lock constants', () => {
	it('Case 1: TTL_GC_DEFAULT_IDLE_MS === 86400000 (24h)', () => {
		expect(TTL_GC_DEFAULT_IDLE_MS).toBe(24 * 60 * 60 * 1000)
		expect(TTL_GC_DEFAULT_IDLE_MS).toBe(86_400_000)
	})

	it('Case 2: TTL_GC_DEFAULT_SWEEP_MS === 3600000 (1h)', () => {
		expect(TTL_GC_DEFAULT_SWEEP_MS).toBe(60 * 60 * 1000)
		expect(TTL_GC_DEFAULT_SWEEP_MS).toBe(3_600_000)
	})
})

describe('TTL GC — sweepNow()', () => {
	it('Case 3: 1 stale + 1 fresh → kill called once with stale id, counter === 1', () => {
		const now = Date.parse('2026-05-29T00:00:00.000Z')
		const sessions = [
			{id: 'old', lastAttachAt: '2026-05-27T20:00:00.000Z'}, // 28h ago
			{id: 'fresh', lastAttachAt: '2026-05-28T23:00:00.000Z'}, // 1h ago
		]
		const mgr = makeFakeManager(sessions)
		const gc = createTtlGc({
			sessionManager: mgr,
			nowFn: () => now,
		})
		const killed = gc.sweepNow()
		expect(killed).toBe(1)
		expect(mgr.kill).toHaveBeenCalledTimes(1)
		expect(mgr.kill).toHaveBeenCalledWith('old')
	})

	it('Case 4: 2 fresh sessions → kill not called, counter === 0', () => {
		const now = Date.parse('2026-05-29T00:00:00.000Z')
		const sessions = [
			{id: 'a', lastAttachAt: '2026-05-28T23:00:00.000Z'}, // 1h ago
			{id: 'b', lastAttachAt: '2026-05-28T22:30:00.000Z'}, // 1.5h ago
		]
		const mgr = makeFakeManager(sessions)
		const gc = createTtlGc({
			sessionManager: mgr,
			nowFn: () => now,
		})
		const killed = gc.sweepNow()
		expect(killed).toBe(0)
		expect(mgr.kill).not.toHaveBeenCalled()
	})
})

describe('TTL GC — start() / stop() lifecycle', () => {
	it('Case 5: start() is idempotent — second call clears prior interval', () => {
		const mgr = makeFakeManager([])
		const setIntervalFn = vi.fn().mockReturnValueOnce(42).mockReturnValueOnce(99)
		const clearIntervalFn = vi.fn()
		const gc = createTtlGc({
			sessionManager: mgr,
			sweepMs: 5_000,
			setIntervalFn: setIntervalFn as unknown as typeof setInterval,
			clearIntervalFn: clearIntervalFn as unknown as typeof clearInterval,
		})

		gc.start()
		gc.start()

		expect(setIntervalFn).toHaveBeenCalledTimes(2)
		// Second start() must have cleared the first handle (42).
		expect(clearIntervalFn).toHaveBeenCalledTimes(1)
		expect(clearIntervalFn).toHaveBeenCalledWith(42)
		// Sweep-interval ms forwarded to setIntervalFn.
		expect(setIntervalFn.mock.calls[0][1]).toBe(5_000)
		expect(setIntervalFn.mock.calls[1][1]).toBe(5_000)
	})

	it('Case 6: stop() calls clearIntervalFn with the handle from start()', () => {
		const mgr = makeFakeManager([])
		const setIntervalFn = vi.fn().mockReturnValue(7)
		const clearIntervalFn = vi.fn()
		const gc = createTtlGc({
			sessionManager: mgr,
			setIntervalFn: setIntervalFn as unknown as typeof setInterval,
			clearIntervalFn: clearIntervalFn as unknown as typeof clearInterval,
		})

		gc.start()
		gc.stop()

		expect(clearIntervalFn).toHaveBeenCalledTimes(1)
		expect(clearIntervalFn).toHaveBeenCalledWith(7)

		// stop() must be safe to call twice — second call is a no-op.
		gc.stop()
		expect(clearIntervalFn).toHaveBeenCalledTimes(1)
	})
})
