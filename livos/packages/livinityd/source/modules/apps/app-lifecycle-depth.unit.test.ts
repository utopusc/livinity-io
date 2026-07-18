// Phase 342 APPD-01/02 — pure-validator unit tests for app-lifecycle-depth.ts.
// Mirrors the describe/test style of jobs.app-auto-update.unit.test.ts. No daemon/disk.

import {describe, expect, test} from 'vitest'

import {isWithinUpdateWindow, validateCpuSet, validateUpdateWindow} from './app-lifecycle-depth.js'

// now built via new Date(2026,0,1,HH,MM) — local time (isWithinUpdateWindow reads
// getHours()/getMinutes(), so the local TZ is irrelevant to the minute-of-day math).
function at(h: number, m: number): Date {
	return new Date(2026, 0, 1, h, m)
}

describe('isWithinUpdateWindow — start-inclusive, end-exclusive, wrap-aware', () => {
	test('inside non-wrap (09:00-17:00, now 12:00) → true', () => {
		expect(isWithinUpdateWindow(at(12, 0), {start: '09:00', end: '17:00'})).toBe(true)
	})
	test('outside non-wrap (09:00-17:00, now 08:00) → false', () => {
		expect(isWithinUpdateWindow(at(8, 0), {start: '09:00', end: '17:00'})).toBe(false)
	})
	test('boundary start-inclusive (09:00-17:00, now 09:00) → true', () => {
		expect(isWithinUpdateWindow(at(9, 0), {start: '09:00', end: '17:00'})).toBe(true)
	})
	test('boundary end-exclusive (09:00-17:00, now 17:00) → false', () => {
		expect(isWithinUpdateWindow(at(17, 0), {start: '09:00', end: '17:00'})).toBe(false)
	})
	test('midnight wrap after start (23:00-02:00, now 23:30) → true', () => {
		expect(isWithinUpdateWindow(at(23, 30), {start: '23:00', end: '02:00'})).toBe(true)
	})
	test('midnight wrap before end (23:00-02:00, now 01:00) → true', () => {
		expect(isWithinUpdateWindow(at(1, 0), {start: '23:00', end: '02:00'})).toBe(true)
	})
	test('midnight wrap outside (23:00-02:00, now 12:00) → false', () => {
		expect(isWithinUpdateWindow(at(12, 0), {start: '23:00', end: '02:00'})).toBe(false)
	})
	test('midnight wrap end-exclusive (23:00-02:00, now 02:00) → false', () => {
		expect(isWithinUpdateWindow(at(2, 0), {start: '23:00', end: '02:00'})).toBe(false)
	})
	test('start===end (10:00-10:00) → false (defensive)', () => {
		expect(isWithinUpdateWindow(at(10, 0), {start: '10:00', end: '10:00'})).toBe(false)
	})
	test('malformed HH:MM ("9"/"25:00"/"") → false (defensive parse guard)', () => {
		expect(isWithinUpdateWindow(at(12, 0), {start: '9', end: '17:00'})).toBe(false)
		expect(isWithinUpdateWindow(at(12, 0), {start: '09:00', end: '25:00'})).toBe(false)
		expect(isWithinUpdateWindow(at(12, 0), {start: '', end: ''})).toBe(false)
	})
})

describe('validateCpuSet — semantic (index<coreCount, ascending range)', () => {
	test('"0" on 4 → null', () => {
		expect(validateCpuSet('0', 4)).toBeNull()
	})
	test('"0-2" on 4 → null', () => {
		expect(validateCpuSet('0-2', 4)).toBeNull()
	})
	test('"0-2,4" on 8 → null', () => {
		expect(validateCpuSet('0-2,4', 8)).toBeNull()
	})
	test('"0-2,4" on 4 → error (index 4 >= coreCount)', () => {
		expect(validateCpuSet('0-2,4', 4)).not.toBeNull()
	})
	test('"8" on 4 → error (out of range)', () => {
		expect(validateCpuSet('8', 4)).not.toBeNull()
	})
	test('"2-0" on 4 → error (descending range)', () => {
		expect(validateCpuSet('2-0', 4)).not.toBeNull()
	})
	test('"0,2,3-3" on 4 → null (a==b range ok)', () => {
		expect(validateCpuSet('0,2,3-3', 4)).toBeNull()
	})
	test('"4" on 4 → error (0-indexed; valid max = coreCount-1)', () => {
		expect(validateCpuSet('4', 4)).not.toBeNull()
	})
})

describe('validateUpdateWindow — malformed / start==end / <30-min rejected', () => {
	test('valid non-wrap "09:00"-"17:00" → null', () => {
		expect(validateUpdateWindow({start: '09:00', end: '17:00'})).toBeNull()
	})
	test('valid wrap "23:00"-"02:00" → null', () => {
		expect(validateUpdateWindow({start: '23:00', end: '02:00'})).toBeNull()
	})
	test('start===end "10:00"-"10:00" → error', () => {
		expect(validateUpdateWindow({start: '10:00', end: '10:00'})).not.toBeNull()
	})
	test('<30min "09:00"-"09:15" → error', () => {
		expect(validateUpdateWindow({start: '09:00', end: '09:15'})).not.toBeNull()
	})
	test('exactly 30min "09:00"-"09:30" → null', () => {
		expect(validateUpdateWindow({start: '09:00', end: '09:30'})).toBeNull()
	})
	test('wrap exactly 30min "23:45"-"00:15" → null', () => {
		expect(validateUpdateWindow({start: '23:45', end: '00:15'})).toBeNull()
	})
	test('malformed "9:00"/"24:00"/"" → error', () => {
		expect(validateUpdateWindow({start: '9:00', end: '17:00'})).not.toBeNull()
		expect(validateUpdateWindow({start: '09:00', end: '24:00'})).not.toBeNull()
		expect(validateUpdateWindow({start: '', end: ''})).not.toBeNull()
	})
})
