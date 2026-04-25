// Phase 24-02 — Status bar formatter tests.
//
// Pure unit tests for the 5 formatters consumed by the StatusBar pills:
// formatUptime, formatRamGb, formatDiskFree, formatTimeHHMM, formatSocketType.
//
// Why unit tests for these helpers: the StatusBar render is layout-only;
// the testable logic (day/hour/minute math, GB→TB switchover, locale-free
// HH:MM formatting, socket-type label mapping) lives here. 12 cases lock
// down the boundary behaviours so a refactor can't silently regress them.

import {describe, expect, test} from 'vitest'

import {
	formatDiskFree,
	formatRamGb,
	formatSocketType,
	formatTimeHHMM,
	formatUptime,
} from './format'

describe('formatUptime', () => {
	test('0 seconds → "Up 0m"', () => {
		expect(formatUptime(0)).toBe('Up 0m')
	})
	test('45 seconds (sub-minute) rounds down to 0m', () => {
		expect(formatUptime(45)).toBe('Up 0m')
	})
	test('60 seconds → "Up 1m"', () => {
		expect(formatUptime(60)).toBe('Up 1m')
	})
	test('3600 seconds → "Up 1h 0m"', () => {
		expect(formatUptime(3600)).toBe('Up 1h 0m')
	})
	test('3700 seconds → "Up 1h 1m"', () => {
		expect(formatUptime(3700)).toBe('Up 1h 1m')
	})
	test('86400 seconds → "Up 1d 0h"', () => {
		expect(formatUptime(86400)).toBe('Up 1d 0h')
	})
	test('3d 14h composite → "Up 3d 14h"', () => {
		expect(formatUptime(86400 * 3 + 3600 * 14)).toBe('Up 3d 14h')
	})
})

describe('formatRamGb', () => {
	test('16 GiB → "16.0 GB RAM"', () => {
		expect(formatRamGb(16 * 1024 ** 3)).toBe('16.0 GB RAM')
	})
	test('0 bytes → "0.0 GB RAM"', () => {
		expect(formatRamGb(0)).toBe('0.0 GB RAM')
	})
})

describe('formatDiskFree', () => {
	test('500 GiB → "500.0 GB free"', () => {
		expect(formatDiskFree(500 * 1024 ** 3)).toBe('500.0 GB free')
	})
	test('1 TiB → "1.0 TB free" (auto-switch above 1024 GB)', () => {
		expect(formatDiskFree(1024 ** 4)).toBe('1.0 TB free')
	})
})

describe('formatTimeHHMM', () => {
	test('local 09:05 → "09:05" (zero-padded HH:MM, no AM/PM)', () => {
		// April is month 3 in JS (0-indexed); time interpreted in local tz, but
		// the formatter only depends on getHours/getMinutes which round-trip on
		// any local zone for a Date constructed with explicit local components.
		expect(formatTimeHHMM(new Date(2026, 3, 25, 9, 5))).toBe('09:05')
	})
})

describe('formatSocketType', () => {
	test("'socket' → 'Socket'", () => {
		expect(formatSocketType('socket')).toBe('Socket')
	})
	test("'tcp-tls' → 'TCP/TLS'", () => {
		expect(formatSocketType('tcp-tls')).toBe('TCP/TLS')
	})
	test("'agent' → 'Agent'", () => {
		expect(formatSocketType('agent')).toBe('Agent')
	})
})
