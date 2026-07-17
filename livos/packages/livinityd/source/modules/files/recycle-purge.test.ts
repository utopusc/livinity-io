import {describe, test, expect} from 'vitest'

import {planRecyclePurge, RECYCLE_FREE_FLOOR_BYTES, type RecycleEntry} from './recycle-purge.js'

// Phase 338 (RECYCLE-01, D-338-1) — offline coverage for the PURE purge planner.
// Deterministic, no I/O; the live bin walk + fse.remove path stays HUMAN-UAT.

const DAY = 86_400_000
const NOW = 1_700_000_000_000
const GiB = 1024 * 1024 * 1024

function entry(path: string, ageDays: number, sizeBytes: number): RecycleEntry {
	return {path, mtimeMs: NOW - ageDays * DAY, sizeBytes}
}

// Plenty of headroom so the free-floor branch never triggers.
const ABUNDANT = 100 * GiB

describe('planRecyclePurge()', () => {
	test('deletes only entries older than purgeDays by mtime', () => {
		const entries = [entry('/old', 40, 100), entry('/fresh', 10, 200), entry('/boundary', 31, 50)]
		const plan = planRecyclePurge(entries, {
			nowMs: NOW,
			purgeDays: 30,
			availableBytes: ABUNDANT,
			floorBytes: RECYCLE_FREE_FLOOR_BYTES,
		})
		expect(plan.toDelete.map((e) => e.path).sort()).toEqual(['/boundary', '/old'])
		expect(plan.forced).toBe(false)
		expect(plan.bytesReclaimed).toBe(150)
	})

	test('force-purges oldest-first when availableBytes < floor, sets forced=true', () => {
		// None aged (all < 30d). Disk at 0, floor 1500 → evict oldest-first until cleared.
		const entries = [entry('/old', 5, 1000), entry('/mid', 3, 1000), entry('/new', 1, 1000)]
		const plan = planRecyclePurge(entries, {nowMs: NOW, purgeDays: 30, availableBytes: 0, floorBytes: 1500})
		expect(plan.forced).toBe(true)
		expect(plan.toDelete.map((e) => e.path)).toEqual(['/old', '/mid'])
		expect(plan.toDelete.some((e) => e.path === '/new')).toBe(false)
	})

	test('below-floor plan stops once projected free clears the floor', () => {
		// available 1 GiB, floor 5 GiB, three 2-GiB fresh entries → evict two (1+2+2=5).
		const entries = [entry('/a', 10, 2 * GiB), entry('/b', 5, 2 * GiB), entry('/c', 1, 2 * GiB)]
		const plan = planRecyclePurge(entries, {nowMs: NOW, purgeDays: 30, availableBytes: 1 * GiB, floorBytes: 5 * GiB})
		expect(plan.forced).toBe(true)
		expect(plan.toDelete.map((e) => e.path)).toEqual(['/a', '/b'])
		expect(plan.bytesReclaimed).toBe(4 * GiB)
	})

	test('empty bin → empty plan, forced=false', () => {
		const plan = planRecyclePurge([], {
			nowMs: NOW,
			purgeDays: 30,
			availableBytes: 0,
			floorBytes: RECYCLE_FREE_FLOOR_BYTES,
		})
		expect(plan.toDelete).toEqual([])
		expect(plan.forced).toBe(false)
		expect(plan.bytesReclaimed).toBe(0)
	})

	test('healthy free space + all fresh → no deletions', () => {
		const entries = [entry('/a', 1, 100), entry('/b', 2, 100)]
		const plan = planRecyclePurge(entries, {
			nowMs: NOW,
			purgeDays: 30,
			availableBytes: ABUNDANT,
			floorBytes: RECYCLE_FREE_FLOOR_BYTES,
		})
		expect(plan.toDelete).toEqual([])
		expect(plan.forced).toBe(false)
		expect(plan.bytesReclaimed).toBe(0)
	})
})
