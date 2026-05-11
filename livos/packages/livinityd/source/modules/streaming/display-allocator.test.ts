/**
 * Phase 102-01 — DisplayAllocator unit tests (RED stub).
 *
 * Companion to streaming/port-allocator.ts; range [10, 100) — 90 slots.
 * Linear-walker cursor advance; release returns slot to the pool; out-of-range
 * release is silent no-op. Mirrors port-allocator.test.ts row-for-row with
 * Port → Display + 15900→10 / 16000→100 substitutions.
 *
 * D-102-DISPLAY-ALLOCATOR lock: `allocate()` returns `number` (not string),
 * matching PortAllocator's surface — eliminates the legacy webapps/display-allocator
 * `string` return that drove the Phase 101 CDP detour.
 *
 * Sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f (D-102-SACRED) — never touched.
 */

import {describe, it, expect} from 'vitest'
import {DisplayAllocator, DisplayRangeExhaustedError} from './display-allocator.js'

describe('102-01-01 DisplayAllocator', () => {
	it('Test 1: allocate() returns 10 on first call', () => {
		const a = new DisplayAllocator()
		expect(a.allocate()).toBe(10)
	})

	it('Test 2: allocate() returns 11 on second call (linear-walker advance)', () => {
		const a = new DisplayAllocator()
		expect(a.allocate()).toBe(10)
		expect(a.allocate()).toBe(11)
	})

	it('Test 3: release(10) followed by allocate() returns 10 (slot reuse before climbing — T-10-01-02 lock)', () => {
		const a = new DisplayAllocator()
		const d1 = a.allocate() // 10
		const d2 = a.allocate() // 11
		const d3 = a.allocate() // 12
		expect([d1, d2, d3]).toEqual([10, 11, 12])
		a.release(10)
		// Fill the rest of the range so cursor wraps and re-encounters the released slot
		const drained: number[] = []
		for (let i = 0; i < 87; i++) drained.push(a.allocate())
		// We've allocated 11, 12 + 87 = 89 in-use; 1 free slot (which is 10)
		expect(a.inUseCount).toBe(89)
		// Next allocate must return 10 (the only free slot)
		expect(a.allocate()).toBe(10)
		expect(a.inUseCount).toBe(90)
	})

	it('Test 4: release(999) is silent no-op (out-of-range idempotent — old T-10-01-03 lock)', () => {
		const a = new DisplayAllocator()
		a.allocate() // 10
		expect(a.inUseCount).toBe(1)
		expect(() => a.release(999)).not.toThrow()
		expect(() => a.release(9)).not.toThrow() // below min
		expect(() => a.release(100)).not.toThrow() // exclusive upper bound
		expect(a.inUseCount).toBe(1)
	})

	it('Test 5: calling allocate() 90 times then once more throws DisplayRangeExhaustedError', () => {
		const a = new DisplayAllocator()
		for (let i = 0; i < 90; i++) a.allocate()
		expect(a.inUseCount).toBe(90)
		expect(() => a.allocate()).toThrow(DisplayRangeExhaustedError)
		try {
			a.allocate()
		} catch (err) {
			expect(err).toBeInstanceOf(DisplayRangeExhaustedError)
			expect((err as DisplayRangeExhaustedError).code).toBe('DISPLAY_RANGE_EXHAUSTED')
			expect((err as DisplayRangeExhaustedError).range).toEqual({min: 10, max: 100})
		}
	})

	it('Test 6: custom range {min: 50, max: 53} capacity is 3, exhausts after 3 allocs', () => {
		const a = new DisplayAllocator({min: 50, max: 53})
		expect(a.capacity).toBe(3)
		expect(a.allocate()).toBe(50)
		expect(a.allocate()).toBe(51)
		expect(a.allocate()).toBe(52)
		expect(() => a.allocate()).toThrow(DisplayRangeExhaustedError)
		// release one and re-allocate — wraps within the tiny range
		a.release(51)
		expect(a.allocate()).toBe(51)
	})

	it('Test 7: release(NaN) and release(10.5) are no-op (integer guard mirroring port-allocator)', () => {
		const a = new DisplayAllocator()
		a.allocate() // 10
		expect(a.inUseCount).toBe(1)
		expect(() => a.release(Number.NaN)).not.toThrow()
		expect(() => a.release(10.5)).not.toThrow()
		expect(() => a.release(Number.POSITIVE_INFINITY)).not.toThrow()
		expect(() => a.release(-1)).not.toThrow()
		expect(a.inUseCount).toBe(1)
		// State must remain sane: next allocate works
		expect(a.allocate()).toBe(11)
	})
})
