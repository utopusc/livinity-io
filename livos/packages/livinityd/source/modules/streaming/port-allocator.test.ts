/**
 * Phase 101-02 — PortAllocator unit tests.
 *
 * Replaces the inline `VNC_PORT_COUNTER` block at stream-manager.ts:43-49.
 * Range default [15900, 16000) per D-101-PORT-ALLOC (100 concurrent slots).
 *
 * Pure-function tests — no mocks, no I/O.
 */

import {describe, it, expect} from 'vitest'
import {PortAllocator, PortRangeExhaustedError} from './port-allocator.js'

describe('PortAllocator', () => {
	it('Test 1: allocate() returns 15900 on first call', () => {
		const a = new PortAllocator()
		expect(a.allocate()).toBe(15900)
	})

	it('Test 2: allocate() returns 15901, 15902, ... incrementally', () => {
		const a = new PortAllocator()
		const ports: number[] = []
		for (let i = 0; i < 5; i++) ports.push(a.allocate())
		expect(ports).toEqual([15900, 15901, 15902, 15903, 15904])
	})

	it('Test 3: allocate() wraps from 15999 back to 15900 after release of 15900', () => {
		const a = new PortAllocator()
		// Fill the range completely
		const taken: number[] = []
		for (let i = 0; i < 100; i++) taken.push(a.allocate())
		expect(taken[0]).toBe(15900)
		expect(taken[99]).toBe(15999)
		// Release the first slot → wrapping allocate must reuse it
		a.release(15900)
		expect(a.allocate()).toBe(15900)
	})

	it('Test 4: release(p) returns p to the available pool', () => {
		const a = new PortAllocator()
		const p1 = a.allocate() // 15900
		const p2 = a.allocate() // 15901
		expect(a.inUseCount).toBe(2)
		a.release(p1)
		expect(a.inUseCount).toBe(1)
		// Fill the rest of the range (98 more allocations to reach capacity = 100,
		// we already hold p2 = 15901, so 98 more brings us to 99 in-use), then
		// the next allocate should pull from the released slot.
		const drained: number[] = []
		for (let i = 0; i < 98; i++) drained.push(a.allocate())
		expect(a.inUseCount).toBe(99)
		// Released slot must come back
		expect(a.allocate()).toBe(p1)
		expect(a.inUseCount).toBe(100)
		// p2 was never released — confirm still tracked
		expect(p2).toBe(15901)
	})

	it('Test 5: release(p) is idempotent (double-release does not throw or corrupt state)', () => {
		const a = new PortAllocator()
		const p = a.allocate()
		expect(a.inUseCount).toBe(1)
		expect(() => a.release(p)).not.toThrow()
		expect(a.inUseCount).toBe(0)
		expect(() => a.release(p)).not.toThrow() // double release
		expect(a.inUseCount).toBe(0)
		// State must still be sane: next allocate works.
		expect(() => a.allocate()).not.toThrow()
	})

	it('Test 6: allocate() throws PortRangeExhaustedError when all 100 slots in use', () => {
		const a = new PortAllocator()
		for (let i = 0; i < 100; i++) a.allocate()
		expect(a.inUseCount).toBe(100)
		expect(() => a.allocate()).toThrow(PortRangeExhaustedError)
		// Sanity: code/error fields populated.
		try {
			a.allocate()
		} catch (err) {
			expect(err).toBeInstanceOf(PortRangeExhaustedError)
			expect((err as PortRangeExhaustedError).code).toBe('PORT_RANGE_EXHAUSTED')
			expect((err as PortRangeExhaustedError).range).toEqual({min: 15900, max: 16000})
		}
	})

	it('Test 7: release of a port outside the range is a no-op (does NOT throw)', () => {
		const a = new PortAllocator()
		expect(() => a.release(80)).not.toThrow()
		expect(() => a.release(16000)).not.toThrow() // exclusive upper bound
		expect(() => a.release(99999)).not.toThrow()
		expect(() => a.release(-1)).not.toThrow()
		expect(a.inUseCount).toBe(0)
	})

	it('Test 8: inUseCount + capacity expose accurate snapshot', () => {
		const a = new PortAllocator()
		expect(a.capacity).toBe(100)
		expect(a.inUseCount).toBe(0)
		a.allocate()
		a.allocate()
		a.allocate()
		expect(a.inUseCount).toBe(3)
		expect(a.capacity).toBe(100)
	})

	it('Test 9: custom range {min: 15900, max: 15903} caps at 3 ports', () => {
		const a = new PortAllocator({min: 15900, max: 15903})
		expect(a.capacity).toBe(3)
		expect(a.allocate()).toBe(15900)
		expect(a.allocate()).toBe(15901)
		expect(a.allocate()).toBe(15902)
		expect(() => a.allocate()).toThrow(PortRangeExhaustedError)
		// release one and re-allocate — wraps within the tiny range
		a.release(15901)
		expect(a.allocate()).toBe(15901)
	})

	it('Test 10: reserve(p) marks a port in-use so a later allocate() skips it (boot-priming)', () => {
		const a = new PortAllocator({min: 15900, max: 15903})
		// Pre-declare 15900 (as reconcileOnBoot does for a persisted VM port) —
		// no cursor move, so the cursor is still at min.
		a.reserve(15900)
		expect(a.inUseCount).toBe(1)
		// A fresh allocate() must NOT re-hand-out the reserved port.
		expect(a.allocate()).toBe(15901)
		expect(a.allocate()).toBe(15902)
		// Range is now full (15900 reserved + 15901/15902 allocated).
		expect(() => a.allocate()).toThrow(PortRangeExhaustedError)
	})

	it('Test 11: reserve() is idempotent + ignores out-of-range values; reserved ports recycle after release()', () => {
		const a = new PortAllocator({min: 15900, max: 15903})
		a.reserve(15901)
		a.reserve(15901) // idempotent — still one slot
		a.reserve(80) // below range — no-op
		a.reserve(15903) // exclusive upper bound — no-op
		a.reserve(-1) // no-op
		expect(a.inUseCount).toBe(1)
		// A reserved port is a normal in-use slot: releasing it returns it to the pool.
		a.release(15901)
		expect(a.inUseCount).toBe(0)
		expect(a.allocate()).toBe(15900)
	})
})
