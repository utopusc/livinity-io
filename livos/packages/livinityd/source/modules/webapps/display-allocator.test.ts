/**
 * Phase 100-10-01 RED — DisplayAllocator unit tests.
 *
 * The allocator hands out X display strings starting at `:10` (D-100-10-A).
 * Released displays must be reused before the counter climbs further. Unknown
 * release calls are no-ops. Allocate / release events fire on the EventEmitter
 * so the lifecycle owner can hook telemetry.
 *
 * Sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f (D-100-SACRED) — never touched.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {describe, it, expect, vi} from 'vitest'

describe('Phase 100-10-01 DisplayAllocator', () => {
	it('T-10-01-01: allocate() climbs from :10 → :11 → :12 on successive calls', async () => {
		const {createDisplayAllocator} = await import('./display-allocator.js')
		const a = createDisplayAllocator()
		expect(a.allocate()).toBe(':10')
		expect(a.allocate()).toBe(':11')
		expect(a.allocate()).toBe(':12')
	})

	it('T-10-01-02: release(:11) returns the slot to the free pool, next allocate reuses :11 before climbing to :13', async () => {
		const {createDisplayAllocator} = await import('./display-allocator.js')
		const a = createDisplayAllocator()
		expect(a.allocate()).toBe(':10')
		expect(a.allocate()).toBe(':11')
		expect(a.allocate()).toBe(':12')
		a.release(':11')
		// Next allocate must reuse :11 (smallest free slot), not climb to :13.
		expect(a.allocate()).toBe(':11')
		// Still allocated set is {:10, :11, :12}; next allocate now climbs to :13.
		expect(a.allocate()).toBe(':13')
	})

	it('T-10-01-03: release(:99) on an unknown / never-allocated display is a no-op (no throw, no mutation)', async () => {
		const {createDisplayAllocator} = await import('./display-allocator.js')
		const a = createDisplayAllocator()
		expect(a.allocate()).toBe(':10')
		// No throw — silently no-op
		expect(() => a.release(':99')).not.toThrow()
		// Internal state unchanged: next allocate is still :11 (because :10 stayed allocated)
		expect(a.allocate()).toBe(':11')
	})

	it('T-10-01-04: emits display:allocated on allocate() and display:released on release()', async () => {
		const {createDisplayAllocator} = await import('./display-allocator.js')
		const a = createDisplayAllocator()
		const onAlloc = vi.fn()
		const onRelease = vi.fn()
		a.on('display:allocated', onAlloc)
		a.on('display:released', onRelease)
		const d = a.allocate()
		expect(d).toBe(':10')
		expect(onAlloc).toHaveBeenCalledTimes(1)
		expect(onAlloc).toHaveBeenCalledWith({display: ':10'})
		a.release(':10')
		expect(onRelease).toHaveBeenCalledTimes(1)
		expect(onRelease).toHaveBeenCalledWith({display: ':10'})
	})

	it('T-10-01-05: inUse() returns the array of currently-allocated displays in stable ascending order', async () => {
		const {createDisplayAllocator} = await import('./display-allocator.js')
		const a = createDisplayAllocator()
		expect(a.inUse()).toEqual([])
		a.allocate() // :10
		a.allocate() // :11
		expect(a.inUse()).toEqual([':10', ':11'])
		a.release(':10')
		expect(a.inUse()).toEqual([':11'])
		// Releasing unknown leaves state unchanged.
		a.release(':42')
		expect(a.inUse()).toEqual([':11'])
	})
})
