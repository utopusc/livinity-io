// Phase 38 Plan 04 — selectLatestFactoryResetEvent unit tests.
//
// Locks the filtering + sorting behaviour: only `type === 'factory-reset'`
// rows survive, and the most recent by `started_at` desc wins. Tests cover
// happy-path + 4 defensive rejection paths.

import {describe, expect, it} from 'vitest'

import {selectLatestFactoryResetEvent} from './select-latest-event'

describe('selectLatestFactoryResetEvent', () => {
	it('returns null for empty input', () => {
		expect(selectLatestFactoryResetEvent([])).toBeNull()
	})

	it('returns null for non-array input (null / object / undefined / string)', () => {
		expect(selectLatestFactoryResetEvent(null)).toBeNull()
		expect(selectLatestFactoryResetEvent({})).toBeNull()
		expect(selectLatestFactoryResetEvent(undefined)).toBeNull()
		expect(selectLatestFactoryResetEvent('not-an-array')).toBeNull()
	})

	it('filters out rows where type !== "factory-reset" (e.g. update rows)', () => {
		const rows = [
			{type: 'success', status: 'success', started_at: '2026-04-29T12:00:00Z'},
			{type: 'failed', status: 'failed', started_at: '2026-04-29T12:30:00Z'},
			{type: 'factory-reset', status: 'in-progress', started_at: '2026-04-29T12:01:00Z'},
		]
		const got = selectLatestFactoryResetEvent(rows)
		expect(got?.status).toBe('in-progress')
		expect(got?.type).toBe('factory-reset')
	})

	it('returns the most recent factory-reset by started_at desc', () => {
		const rows = [
			{type: 'factory-reset', status: 'success', started_at: '2026-04-29T12:00:00Z'},
			{type: 'factory-reset', status: 'in-progress', started_at: '2026-04-29T13:00:00Z'},
			{type: 'factory-reset', status: 'failed', started_at: '2026-04-29T11:00:00Z'},
		]
		expect(selectLatestFactoryResetEvent(rows)?.status).toBe('in-progress')
	})

	it('falls back to timestamp when started_at is missing (defensive)', () => {
		const rows = [
			{type: 'factory-reset', status: 'success', timestamp: '2026-04-29T12:00:00Z'},
			{type: 'factory-reset', status: 'failed', timestamp: '2026-04-29T13:00:00Z'},
		]
		expect(selectLatestFactoryResetEvent(rows)?.status).toBe('failed')
	})

	it('skips rows missing the required status field', () => {
		const rows = [
			// Latest by timestamp but no status — must be skipped
			{type: 'factory-reset', started_at: '2026-04-29T13:00:00Z'},
			{type: 'factory-reset', status: 'success', started_at: '2026-04-29T12:00:00Z'},
		]
		expect(selectLatestFactoryResetEvent(rows)?.status).toBe('success')
	})

	it('skips non-object array entries (string / number / null) without crashing', () => {
		const rows = [
			'not-an-object',
			42,
			null,
			{type: 'factory-reset', status: 'success', started_at: '2026-04-29T12:00:00Z'},
		]
		expect(selectLatestFactoryResetEvent(rows)?.status).toBe('success')
	})

	it('returns null when no row matches type filter', () => {
		const rows = [
			{type: 'success', status: 'success', started_at: '2026-04-29T12:00:00Z'},
			{type: 'failed', status: 'failed', started_at: '2026-04-29T12:30:00Z'},
		]
		expect(selectLatestFactoryResetEvent(rows)).toBeNull()
	})
})
