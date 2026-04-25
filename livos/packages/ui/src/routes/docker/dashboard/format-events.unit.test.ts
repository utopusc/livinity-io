// Phase 25 Plan 25-01 — format-events pure module tests.
//
// Locked-down behaviour for the 3 formatters consumed by EnvCard's recent-
// events list: verb mapping (16 docker actions → past-tense human strings),
// timestamp delta bucketing (just now / Nm ago / Nh ago / Nd ago), and the
// time-desc slice helper. All tests use vi.setSystemTime so timestamp boundary
// math is deterministic across CI / local runs.

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {formatEventTimestamp, formatEventVerb, takeLastEvents} from './format-events'

describe('formatEventVerb', () => {
	test("'start' → 'started'", () => {
		expect(formatEventVerb('start')).toBe('started')
	})
	test("'stop' → 'stopped'", () => {
		expect(formatEventVerb('stop')).toBe('stopped')
	})
	test("'die' → 'died'", () => {
		expect(formatEventVerb('die')).toBe('died')
	})
	test("'create' → 'created'", () => {
		expect(formatEventVerb('create')).toBe('created')
	})
	test("'destroy' → 'destroyed'", () => {
		expect(formatEventVerb('destroy')).toBe('destroyed')
	})
	test("'pull' → 'pulled'", () => {
		expect(formatEventVerb('pull')).toBe('pulled')
	})
	test("'connect' → 'connected'", () => {
		expect(formatEventVerb('connect')).toBe('connected')
	})
	test("'disconnect' → 'disconnected'", () => {
		expect(formatEventVerb('disconnect')).toBe('disconnected')
	})
	test("'restart' → 'restarted'", () => {
		expect(formatEventVerb('restart')).toBe('restarted')
	})
	test('unknown action echoes verbatim (never throws)', () => {
		expect(formatEventVerb('unknown_action')).toBe('unknown_action')
	})
})

describe('formatEventTimestamp', () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date('2026-04-25T12:00:00Z'))
	})
	afterEach(() => {
		vi.useRealTimers()
	})

	test("delta < 60s → 'just now'", () => {
		const now = Date.now()
		expect(formatEventTimestamp(now / 1000)).toBe('just now')
	})

	test("delta = 90s (1.5 min) → '1m ago'", () => {
		const now = Date.now()
		expect(formatEventTimestamp((now - 90_000) / 1000)).toBe('1m ago')
	})

	test("delta = 7200s (2h) → '2h ago'", () => {
		const now = Date.now()
		expect(formatEventTimestamp((now - 7_200_000) / 1000)).toBe('2h ago')
	})

	test("delta = 90_000_000ms (~1d) → '1d ago'", () => {
		const now = Date.now()
		expect(formatEventTimestamp((now - 90_000_000) / 1000)).toBe('1d ago')
	})
})

describe('takeLastEvents', () => {
	test('sorts by time desc and slices to limit', () => {
		const events = [
			{time: 1, label: 'a'},
			{time: 2, label: 'b'},
			{time: 3, label: 'c'},
			{time: 4, label: 'd'},
		]
		expect(takeLastEvents(events, 2)).toEqual([
			{time: 4, label: 'd'},
			{time: 3, label: 'c'},
		])
	})

	test('empty input returns []', () => {
		expect(takeLastEvents([], 8)).toEqual([])
	})
})
