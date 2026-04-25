// Phase 28 Plan 28-01 — log-buffer ring-buffer push helper tests.
//
// pushBounded(buf, item, cap) returns a NEW array (immutable shape so React
// detects updates) whose length never exceeds cap. When at capacity, the
// oldest entry is dropped (FIFO). Used by useMultiplexedLogs to bound
// per-container memory at MAX_LINES_PER_CONTAINER (5000) — T-28-05 bounds
// the worst-case memory footprint.

import {describe, expect, test} from 'vitest'

import {MAX_LINES_PER_CONTAINER, pushBounded} from './log-buffer'

describe('pushBounded', () => {
	test("A: pushing into a buffer of length < cap appends and returns a NEW array", () => {
		const buf: number[] = [1, 2, 3]
		const out = pushBounded(buf, 4, 10)
		expect(out).toEqual([1, 2, 3, 4])
		expect(out).not.toBe(buf) // new reference (immutable shape)
	})

	test("B: pushing when length === cap drops the oldest entry (FIFO) and returns length cap", () => {
		const buf: number[] = [1, 2, 3]
		const out = pushBounded(buf, 4, 3)
		expect(out).toEqual([2, 3, 4])
		expect(out.length).toBe(3)
		expect(out).not.toBe(buf)
	})

	test("C: MAX_LINES_PER_CONTAINER === 5000 — documents the cap from CONTEXT.md decisions.logs", () => {
		expect(MAX_LINES_PER_CONTAINER).toBe(5000)
	})

	test("D: pushing into an empty array returns [item]", () => {
		const out = pushBounded([], 'x', 5)
		expect(out).toEqual(['x'])
	})

	test("E: pushing into a buffer of length > cap drops enough to fit (defensive)", () => {
		// Defensive: if upstream code somehow handed us an over-cap buffer,
		// we still trim to cap so we never grow the leak.
		const buf: number[] = [1, 2, 3, 4, 5]
		const out = pushBounded(buf, 6, 3)
		expect(out).toEqual([4, 5, 6])
		expect(out.length).toBe(3)
	})

	test("F: original buffer is NOT mutated (referential immutability)", () => {
		const buf: number[] = [1, 2, 3]
		pushBounded(buf, 4, 3)
		expect(buf).toEqual([1, 2, 3])
	})
})
