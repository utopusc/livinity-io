import {expect, test} from 'vitest'

import {vmPortAllocator, vmRdpPortAllocator} from './vm-ports.js'

test('vmPortAllocator hands out ports in [16100, 16200)', () => {
	const allocated: number[] = []
	for (let i = 0; i < 5; i++) {
		const p = vmPortAllocator.allocate()
		expect(p).toBeGreaterThanOrEqual(16100)
		expect(p).toBeLessThan(16200)
		allocated.push(p)
	}
	// distinct
	expect(new Set(allocated).size).toBe(allocated.length)
	for (const p of allocated) vmPortAllocator.release(p)
})

test('vmRdpPortAllocator hands out ports in [16200, 16300)', () => {
	const allocated: number[] = []
	for (let i = 0; i < 5; i++) {
		const p = vmRdpPortAllocator.allocate()
		expect(p).toBeGreaterThanOrEqual(16200)
		expect(p).toBeLessThan(16300)
		allocated.push(p)
	}
	for (const p of allocated) vmRdpPortAllocator.release(p)
})

test('the two VM ranges never overlap each other (nor the streaming [15900,16000) range)', () => {
	// The capacity + range boundaries prove disjointness without touching the
	// streaming singleton: noVNC ends at 16200 = where RDP begins; both start at
	// or above 16100, safely clear of streaming's [15900, 16000).
	expect(vmPortAllocator.capacity).toBe(100)
	expect(vmRdpPortAllocator.capacity).toBe(100)
	const novnc = vmPortAllocator.allocate()
	const rdp = vmRdpPortAllocator.allocate()
	expect(novnc).toBeLessThan(16200)
	expect(rdp).toBeGreaterThanOrEqual(16200)
	expect(novnc).not.toBe(rdp)
	// neither falls inside the streaming default range
	expect(novnc >= 16000).toBe(true)
	expect(rdp >= 16000).toBe(true)
	vmPortAllocator.release(novnc)
	vmRdpPortAllocator.release(rdp)
})

test('release frees a port for reuse; double-release is a no-op', () => {
	const p = vmPortAllocator.allocate()
	const before = vmPortAllocator.inUseCount
	vmPortAllocator.release(p)
	expect(vmPortAllocator.inUseCount).toBe(before - 1)
	// idempotent — releasing again does not underflow
	vmPortAllocator.release(p)
	expect(vmPortAllocator.inUseCount).toBe(before - 1)
	// the freed port can be reused
	const q = vmPortAllocator.allocate()
	expect(q).toBeGreaterThanOrEqual(16100)
	expect(q).toBeLessThan(16200)
	vmPortAllocator.release(q)
})
