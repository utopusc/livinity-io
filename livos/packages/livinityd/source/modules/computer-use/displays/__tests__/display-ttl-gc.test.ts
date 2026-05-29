/**
 * Phase 248-03 Task 1 — display-ttl-gc vitest suite (RED → GREEN).
 *
 * Eight drift-locked cases covering the 248-03-PLAN.md must_haves.truths.
 *
 *   Drift-locks (1, 2): DISPLAY_TTL_GC_DEFAULT_IDLE_MS = 4h (14_400_000) +
 *                       DISPLAY_TTL_GC_DEFAULT_SWEEP_MS = 1h (3_600_000).
 *   Sweep (3): 1 stale + 1 fresh → kill called once with owner-impersonation,
 *              count === 1.
 *   Fallback (4): no last_app_at → falls back to created_at for staleness check.
 *   Lifecycle (5, 6): start() idempotent (second clears the first handle);
 *                     stop() null-safe (repeatable).
 *   Best-effort (7): kill returning {ok:false, error:'not-found'} does NOT
 *                    throw; count reflects only successful kills.
 *   Audit (8): logger.info called per kill with
 *              msg='display-ttl-gc: killed idle display' and
 *              ctx={display, idleAgeMs:number, owner_session}.
 *
 * Display manager is a vi.fn-backed fake exposing the 6-method surface from
 * 248-01. nowFn is fixed via injection so vitest never reads the wall clock.
 * setIntervalFn/clearIntervalFn are vi.fn so we inspect call args without
 * actually scheduling a real interval.
 *
 * NOTE: import below intentionally points at the not-yet-existing module —
 * Task 1 RED is module-not-found. Task 2 (GREEN) creates the module and the
 * import resolves.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {describe, expect, it, vi} from 'vitest'

import {
	createDisplayTtlGc,
	DISPLAY_TTL_GC_DEFAULT_IDLE_MS,
	DISPLAY_TTL_GC_DEFAULT_SWEEP_MS,
} from '../display-ttl-gc.js'
import type {DisplayManager, DisplayRecord} from '../types.js'

// ----------------------------------------------------------------------------
// Fixed epoch used by every test that exercises the staleness comparison.
// 2026-05-28T12:00:00.000Z = 1748433600000 (matches CONTEXT date).
// ----------------------------------------------------------------------------
const FIXED_NOW = Date.parse('2026-05-28T12:00:00.000Z')

function isoAgo(ms: number): string {
	return new Date(FIXED_NOW - ms).toISOString()
}

// ----------------------------------------------------------------------------
// Fake DisplayManager — only list() + kill() are exercised by the GC. The
// other 5 methods are vi.fn stubs that should NEVER be called during a sweep.
// ----------------------------------------------------------------------------

interface FakeDisplayManager {
	list: ReturnType<typeof vi.fn>
	kill: ReturnType<typeof vi.fn>
	create: ReturnType<typeof vi.fn>
	attachApp: ReturnType<typeof vi.fn>
	listAppsForDisplay: ReturnType<typeof vi.fn>
	isOwner: ReturnType<typeof vi.fn>
	initialized: Promise<void>
}

function makeDisplayManager(records: Array<Partial<DisplayRecord>>): FakeDisplayManager {
	const recordsFull: DisplayRecord[] = records.map((r, i) => ({
		display: r.display ?? `:${10 + i}`,
		name: r.name ?? `display-${10 + i}`,
		mode: r.mode ?? 'xephyr',
		created_at: r.created_at ?? isoAgo(0),
		owner_session: r.owner_session ?? 'sess-default',
		width: r.width ?? 1920,
		height: r.height ?? 1080,
		running_apps: r.running_apps ?? [],
		// last_app_at carried through if present on the partial.
		...(((r as any).last_app_at !== undefined)
			? {last_app_at: (r as any).last_app_at}
			: {}),
	} as DisplayRecord))
	return {
		list: vi.fn(async () => recordsFull),
		kill: vi.fn(async () => ({ok: true, killed_apps_count: 0})),
		create: vi.fn(),
		attachApp: vi.fn(),
		listAppsForDisplay: vi.fn(),
		isOwner: vi.fn(),
		initialized: Promise.resolve(),
	}
}

// ----------------------------------------------------------------------------
// 8 cases.
// ----------------------------------------------------------------------------

describe('display-ttl-gc — drift-lock constants', () => {
	it('Case 1: DISPLAY_TTL_GC_DEFAULT_IDLE_MS === 14_400_000 (4h)', () => {
		expect(DISPLAY_TTL_GC_DEFAULT_IDLE_MS).toBe(4 * 60 * 60 * 1000)
		expect(DISPLAY_TTL_GC_DEFAULT_IDLE_MS).toBe(14_400_000)
	})

	it('Case 2: DISPLAY_TTL_GC_DEFAULT_SWEEP_MS === 3_600_000 (1h)', () => {
		expect(DISPLAY_TTL_GC_DEFAULT_SWEEP_MS).toBe(60 * 60 * 1000)
		expect(DISPLAY_TTL_GC_DEFAULT_SWEEP_MS).toBe(3_600_000)
	})
})

describe('display-ttl-gc — sweepNow()', () => {
	it('Case 3: 1 stale + 1 fresh → kill called once with owner-impersonation, count === 1', async () => {
		const mgr = makeDisplayManager([
			{
				display: ':10',
				owner_session: 's1',
				// 5h ago — stale at idleMs=4h.
				...({last_app_at: isoAgo(5 * 60 * 60 * 1000)} as any),
			},
			{
				display: ':11',
				owner_session: 's2',
				// 1h ago — fresh.
				...({last_app_at: isoAgo(1 * 60 * 60 * 1000)} as any),
			},
		])
		const gc = createDisplayTtlGc({
			displayManager: mgr as unknown as DisplayManager,
			nowFn: () => FIXED_NOW,
		})

		const killed = await gc.sweepNow()

		expect(killed).toBe(1)
		expect(mgr.kill).toHaveBeenCalledTimes(1)
		expect(mgr.kill).toHaveBeenCalledWith({
			display: ':10',
			callerSession: 's1',
		})
	})

	it('Case 4: no last_app_at → falls back to created_at (5h ago) → stale → killed', async () => {
		const mgr = makeDisplayManager([
			{
				display: ':12',
				owner_session: 's3',
				created_at: isoAgo(5 * 60 * 60 * 1000),
				// NOTE: no last_app_at field at all.
			},
		])
		const gc = createDisplayTtlGc({
			displayManager: mgr as unknown as DisplayManager,
			nowFn: () => FIXED_NOW,
		})

		const killed = await gc.sweepNow()

		expect(killed).toBe(1)
		expect(mgr.kill).toHaveBeenCalledTimes(1)
		expect(mgr.kill).toHaveBeenCalledWith({
			display: ':12',
			callerSession: 's3',
		})
	})
})

describe('display-ttl-gc — start() / stop() lifecycle', () => {
	it('Case 5: start() is idempotent — second call clears the first handle', () => {
		const mgr = makeDisplayManager([])
		const setIntervalFn = vi
			.fn()
			.mockReturnValueOnce(42 as any)
			.mockReturnValueOnce(99 as any)
		const clearIntervalFn = vi.fn()

		const gc = createDisplayTtlGc({
			displayManager: mgr as unknown as DisplayManager,
			sweepMs: 5_000,
			setIntervalFn: setIntervalFn as unknown as typeof setInterval,
			clearIntervalFn: clearIntervalFn as unknown as typeof clearInterval,
		})

		gc.start()
		gc.start()

		expect(setIntervalFn).toHaveBeenCalledTimes(2)
		expect(clearIntervalFn).toHaveBeenCalledTimes(1)
		expect(clearIntervalFn).toHaveBeenCalledWith(42)
		// Sweep-interval ms forwarded to setIntervalFn on both calls.
		expect(setIntervalFn.mock.calls[0][1]).toBe(5_000)
		expect(setIntervalFn.mock.calls[1][1]).toBe(5_000)
	})

	it('Case 6: stop() is null-safe — no prior start + repeatable', () => {
		const mgr = makeDisplayManager([])
		const setIntervalFn = vi.fn().mockReturnValue(7 as any)
		const clearIntervalFn = vi.fn()

		const gc = createDisplayTtlGc({
			displayManager: mgr as unknown as DisplayManager,
			setIntervalFn: setIntervalFn as unknown as typeof setInterval,
			clearIntervalFn: clearIntervalFn as unknown as typeof clearInterval,
		})

		// stop() before any start() — no throw, no clearInterval call.
		expect(() => gc.stop()).not.toThrow()
		expect(clearIntervalFn).toHaveBeenCalledTimes(0)

		gc.start()
		gc.stop()
		expect(clearIntervalFn).toHaveBeenCalledTimes(1)
		expect(clearIntervalFn).toHaveBeenCalledWith(7)

		// Repeated stop — no extra clearInterval call.
		gc.stop()
		expect(clearIntervalFn).toHaveBeenCalledTimes(1)
	})
})

describe('display-ttl-gc — best-effort kill', () => {
	it('Case 7: kill returning {ok:false, error:not-found} does not throw; count reflects successful kills only', async () => {
		const mgr = makeDisplayManager([
			{
				display: ':10',
				owner_session: 's1',
				...({last_app_at: isoAgo(5 * 60 * 60 * 1000)} as any),
			},
			{
				display: ':11',
				owner_session: 's2',
				...({last_app_at: isoAgo(6 * 60 * 60 * 1000)} as any),
			},
		])
		// First call OK, second call not-found (display vanished between list and kill).
		mgr.kill
			.mockResolvedValueOnce({ok: true, killed_apps_count: 0})
			.mockResolvedValueOnce({ok: false, error: 'not-found'})

		const gc = createDisplayTtlGc({
			displayManager: mgr as unknown as DisplayManager,
			nowFn: () => FIXED_NOW,
		})

		const killed = await gc.sweepNow()

		// Only the successful kill counts.
		expect(killed).toBe(1)
		expect(mgr.kill).toHaveBeenCalledTimes(2)
	})
})

describe('display-ttl-gc — audit logging', () => {
	it('Case 8: logger.info called per kill with audit msg + ctx', async () => {
		const idleAge = 5 * 60 * 60 * 1000 // 5h
		const mgr = makeDisplayManager([
			{
				display: ':10',
				owner_session: 's1',
				...({last_app_at: isoAgo(idleAge)} as any),
			},
		])
		const logger = {info: vi.fn()}

		const gc = createDisplayTtlGc({
			displayManager: mgr as unknown as DisplayManager,
			nowFn: () => FIXED_NOW,
			logger,
		})

		await gc.sweepNow()

		// The exact audit line shape is drift-locked.
		const auditCall = logger.info.mock.calls.find(
			(c) => c[0] === 'display-ttl-gc: killed idle display',
		)
		expect(auditCall).toBeDefined()
		const ctx = auditCall![1] as {
			display: string
			idleAgeMs: number
			owner_session: string
		}
		expect(ctx.display).toBe(':10')
		expect(ctx.owner_session).toBe('s1')
		expect(typeof ctx.idleAgeMs).toBe('number')
		// Allow a tiny epsilon because the implementation may compute idleAgeMs
		// via now() - lastMs where lastMs is the parse of the iso back from idleAgo;
		// for the fixed epoch + isoAgo helper the round trip is exact.
		expect(ctx.idleAgeMs).toBe(idleAge)
	})
})
