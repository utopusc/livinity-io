// @vitest-environment jsdom
//
// Phase 320 review fix IN-01 — unit coverage for the pure chart-transform
// helpers in resource-history-chart.tsx (sumRates / toRows / fmtBps). These
// three functions carry the memPct derivation, the disk/net rate summation and
// the byte-rate formatting; a regression (swapped read/write, a divide-by-zero
// on memTotalBytes <= 0, or a unit-scaling off-by-one) would otherwise only
// surface visually in the Settings UI, never in CI. jsdom env is used only so
// the module's recharts import resolves — the assertions are pure.

import {describe, expect, it} from 'vitest'

import {fmtBps, sumRates, toRows, type ResourceHistoryPoint} from './resource-history-chart'

describe('sumRates (null-preserving)', () => {
	it('both null -> null (preserve "no sample")', () => {
		expect(sumRates(null, null)).toBeNull()
	})
	it('one value present -> that value (missing side treated as 0)', () => {
		expect(sumRates(5, null)).toBe(5)
		expect(sumRates(null, 5)).toBe(5)
	})
	it('both present -> sum', () => {
		expect(sumRates(2, 3)).toBe(5)
	})
	it('zero on one side is not "no sample" -> stays numeric', () => {
		expect(sumRates(0, null)).toBe(0)
	})
})

describe('toRows (memPct derivation + disk/net summation)', () => {
	const base: ResourceHistoryPoint = {
		time: '2026-07-14T00:00:00Z',
		cpuPct: 12.5,
		memUsedBytes: 2,
		memTotalBytes: 8,
		diskReadBps: 1000,
		diskWriteBps: 2000,
		netRxBps: 3000,
		netTxBps: 4000,
	}

	it('derives memPct as used/total*100 when total > 0', () => {
		const [row] = toRows([base])
		expect(row.memPct).toBe(25)
		expect(row.cpuPct).toBe(12.5)
		expect(row.time).toBe('2026-07-14T00:00:00Z')
	})

	it('memPct is null when memTotalBytes is 0 (no divide-by-zero)', () => {
		const [row] = toRows([{...base, memTotalBytes: 0}])
		expect(row.memPct).toBeNull()
	})

	it('memPct is null when memTotalBytes is null', () => {
		const [row] = toRows([{...base, memTotalBytes: null}])
		expect(row.memPct).toBeNull()
	})

	it('memPct is null when memUsedBytes is null', () => {
		const [row] = toRows([{...base, memUsedBytes: null}])
		expect(row.memPct).toBeNull()
	})

	it('sums disk read+write and net rx+tx (no field swap)', () => {
		const [row] = toRows([base])
		expect(row.diskBps).toBe(3000) // 1000 + 2000
		expect(row.netBps).toBe(7000) // 3000 + 4000
	})

	it('preserves a fully-null disk/net sample as null', () => {
		const [row] = toRows([{...base, diskReadBps: null, diskWriteBps: null}])
		expect(row.diskBps).toBeNull()
	})
})

describe('fmtBps (unit-scaling formatter)', () => {
	it('formats sub-KB as whole B/s', () => {
		expect(fmtBps(999)).toBe('999 B/s')
	})
	it('crosses to KB/s at 1024', () => {
		expect(fmtBps(1024)).toBe('1.0 KB/s')
	})
	it('crosses to MB/s at 1048576', () => {
		expect(fmtBps(1_048_576)).toBe('1.0 MB/s')
	})
	it('renders 0 as "0 B/s"', () => {
		expect(fmtBps(0)).toBe('0 B/s')
	})
	it('renders a non-finite value as an em dash', () => {
		expect(fmtBps(Number.NaN)).toBe('—')
		expect(fmtBps(Number.POSITIVE_INFINITY)).toBe('—')
	})
})
