/**
 * Phase 93-09 — geometry-tracker unit tests.
 *
 * Mocks ./window-discovery (isWindowAlive, getWindowGeometry) and uses
 * vi.useFakeTimers() to advance the 200ms poll loop deterministically.
 *
 * Coverage (≥5):
 *   1. No drift → no 'change' event after the initial baseline emit
 *   2. Drift > threshold → one 'change' event with new + prev geometry
 *   3. Window gone → 'window-gone' event + auto-stop (no further ticks)
 *   4. stop() clears the interval (no events after stop)
 *   5. Multiple ticks of stable geometry don't spam events
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'

vi.mock('./window-discovery.js', () => ({
	getWindowGeometry: vi.fn(),
	isWindowAlive: vi.fn(),
}))

import {GeometryTracker} from './geometry-tracker.js'
import {getWindowGeometry, isWindowAlive} from './window-discovery.js'

const mockedGetGeometry = getWindowGeometry as unknown as ReturnType<typeof vi.fn>
const mockedIsAlive = isWindowAlive as unknown as ReturnType<typeof vi.fn>

describe('GeometryTracker', () => {
	beforeEach(() => {
		vi.useFakeTimers()
		mockedGetGeometry.mockReset()
		mockedIsAlive.mockReset()
	})
	afterEach(() => {
		vi.useRealTimers()
	})

	it('Test 1: stable geometry → only the initial baseline emit, no further changes', async () => {
		const tracker = new GeometryTracker({pollIntervalMs: 100, driftThreshold: 10})
		const changes: any[] = []
		tracker.on('change', (g, prev) => changes.push({g, prev}))

		mockedIsAlive.mockResolvedValue(true)
		mockedGetGeometry.mockResolvedValue({x: 0, y: 0, w: 800, h: 600})

		tracker.start(123)
		// Advance through three ticks
		for (let i = 0; i < 3; i++) {
			await vi.advanceTimersByTimeAsync(100)
		}
		// Initial baseline emit happens after first poll resolves
		expect(changes.length).toBe(1)
		expect(changes[0].prev).toBeNull()
		tracker.stop()
	})

	it('Test 2: drift > threshold emits one change with prev + new geometry', async () => {
		const tracker = new GeometryTracker({pollIntervalMs: 100, driftThreshold: 10})
		const changes: any[] = []
		tracker.on('change', (g, prev) => changes.push({g, prev}))

		mockedIsAlive.mockResolvedValue(true)
		mockedGetGeometry
			.mockResolvedValueOnce({x: 0, y: 0, w: 800, h: 600})
			.mockResolvedValueOnce({x: 50, y: 0, w: 800, h: 600})

		tracker.start(123)
		await vi.advanceTimersByTimeAsync(100) // baseline
		await vi.advanceTimersByTimeAsync(100) // drift

		expect(changes.length).toBe(2)
		expect(changes[1].prev).toEqual({x: 0, y: 0, w: 800, h: 600})
		expect(changes[1].g).toEqual({x: 50, y: 0, w: 800, h: 600})
		tracker.stop()
	})

	it('Test 3: window gone → "window-gone" event + auto-stop', async () => {
		const tracker = new GeometryTracker({pollIntervalMs: 100})
		const gone: number[] = []
		tracker.on('window-gone', (wid) => gone.push(wid))

		mockedIsAlive.mockResolvedValue(false)
		mockedGetGeometry.mockResolvedValue({x: 0, y: 0, w: 100, h: 100})

		tracker.start(456)
		await vi.advanceTimersByTimeAsync(100)
		expect(gone).toEqual([456])
		// Auto-stopped — further timer advances should NOT fire more events
		await vi.advanceTimersByTimeAsync(500)
		expect(gone.length).toBe(1)
	})

	it('Test 4: stop() clears the interval — no events after stop', async () => {
		const tracker = new GeometryTracker({pollIntervalMs: 50})
		const changes: any[] = []
		tracker.on('change', (g) => changes.push(g))

		mockedIsAlive.mockResolvedValue(true)
		mockedGetGeometry.mockResolvedValue({x: 0, y: 0, w: 100, h: 100})

		tracker.start(789)
		await vi.advanceTimersByTimeAsync(50) // baseline
		expect(changes.length).toBe(1)
		tracker.stop()
		await vi.advanceTimersByTimeAsync(500)
		expect(changes.length).toBe(1) // unchanged after stop
	})

	it('Test 5: small drift below threshold does NOT emit change', async () => {
		const tracker = new GeometryTracker({pollIntervalMs: 50, driftThreshold: 10})
		const changes: any[] = []
		tracker.on('change', (g, prev) => changes.push({g, prev}))

		mockedIsAlive.mockResolvedValue(true)
		mockedGetGeometry
			.mockResolvedValueOnce({x: 0, y: 0, w: 800, h: 600})
			.mockResolvedValueOnce({x: 5, y: 0, w: 800, h: 600})  // 5px drift, under threshold
			.mockResolvedValueOnce({x: 8, y: 0, w: 800, h: 600})  // 8px, still under

		tracker.start(123)
		await vi.advanceTimersByTimeAsync(50) // baseline
		await vi.advanceTimersByTimeAsync(50) // 5px no
		await vi.advanceTimersByTimeAsync(50) // 8px no
		expect(changes.length).toBe(1) // only the initial baseline
		tracker.stop()
	})

	it('Test 6: multiple ticks with stable geometry don\'t spam events', async () => {
		const tracker = new GeometryTracker({pollIntervalMs: 50})
		const changes: any[] = []
		tracker.on('change', (g) => changes.push(g))

		mockedIsAlive.mockResolvedValue(true)
		mockedGetGeometry.mockResolvedValue({x: 100, y: 100, w: 1000, h: 800})

		tracker.start(99)
		for (let i = 0; i < 10; i++) {
			await vi.advanceTimersByTimeAsync(50)
		}
		expect(changes.length).toBe(1)
		tracker.stop()
	})
})
