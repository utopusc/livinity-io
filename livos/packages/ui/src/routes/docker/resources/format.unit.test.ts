// Phase 26 Plan 26-01 — formatBytes + formatRelativeDate tests.
//
// formatBytes is the canonical Docker-app re-export of the helper that was
// living inside hooks/use-images.ts. Tests assert behaviour parity with the
// existing function (preserved during the move).
//
// formatRelativeDate is a verbatim port of legacy server-control/index.tsx
// (deleted Phase 27-02) and drives ImageHistoryPanel + ScanResultPanel
// timestamp displays.

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {formatBytes} from './format-bytes'
import {formatRelativeDate} from './format-relative-date'

describe('formatBytes', () => {
	test('A: 0 bytes → "0 KB" (existing behaviour preserved)', () => {
		expect(formatBytes(0)).toBe('0 KB')
	})

	test('B: 100 MiB → string ending in "MB"', () => {
		const out = formatBytes(1024 * 1024 * 100)
		expect(out.endsWith('MB')).toBe(true)
	})

	test('C: 2 GiB → "2.00 GB"', () => {
		expect(formatBytes(2 * 1024 ** 3)).toBe('2.00 GB')
	})
})

describe('formatRelativeDate', () => {
	beforeEach(() => {
		vi.useFakeTimers()
		// Fix system time at 2026-04-25T12:00:00Z for deterministic deltas.
		vi.setSystemTime(new Date('2026-04-25T12:00:00Z'))
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	test('D: 30 seconds ago → "just now"', () => {
		const now = Math.floor(Date.now() / 1000)
		expect(formatRelativeDate(now - 30)).toBe('just now')
	})

	test('E: 5 hours ago → "5h ago"', () => {
		const now = Math.floor(Date.now() / 1000)
		expect(formatRelativeDate(now - 3600 * 5)).toBe('5h ago')
	})

	test('F: 3 days ago → "3d ago"', () => {
		const now = Math.floor(Date.now() / 1000)
		expect(formatRelativeDate(now - 86400 * 3)).toBe('3d ago')
	})
})
