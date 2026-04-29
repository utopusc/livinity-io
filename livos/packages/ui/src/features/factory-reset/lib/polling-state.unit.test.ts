// Phase 38 Plan 04 — computePollingDisplayState unit tests (D-OV-04).
//
// Locks the reconnect/90s-threshold logic. Includes a vi.useFakeTimers
// harness simulating accumulated failure time crossing the boundary.

import {describe, expect, it, vi} from 'vitest'

import {
	computePollingDisplayState,
	CONSECUTIVE_FAILURE_RECOVERY_THRESHOLD_MS,
} from './polling-state'
import type {FactoryResetEvent} from './types'

const baseEvent: FactoryResetEvent = {
	type: 'factory-reset',
	status: 'in-progress',
	started_at: '2026-04-29T12:00:00Z',
	ended_at: null,
	preserveApiKey: true,
	wipe_duration_ms: 0,
	reinstall_duration_ms: 0,
	install_sh_exit_code: null,
	install_sh_source: null,
	snapshot_path: '/tmp/livos-pre-reset.tar.gz',
	error: null,
}

describe('computePollingDisplayState (D-OV-04)', () => {
	it('CONSECUTIVE_FAILURE_RECOVERY_THRESHOLD_MS === 90_000 (D-OV-04 lockdown)', () => {
		expect(CONSECUTIVE_FAILURE_RECOVERY_THRESHOLD_MS).toBe(90_000)
	})

	it('queryFailing=false → "live" mode + state-machine-derived label', () => {
		const got = computePollingDisplayState({
			lastEvent: baseEvent,
			queryFailing: false,
			consecutiveFailureMs: 0,
		})
		expect(got.mode).toBe('live')
		// wipe=0 → stopping-services label
		expect(got.label).toContain('Stopping services')
	})

	it('queryFailing=true + below threshold → "reconnecting" mode + "Reconnecting…" label', () => {
		const got = computePollingDisplayState({
			lastEvent: baseEvent,
			queryFailing: true,
			consecutiveFailureMs: 30_000,
		})
		expect(got.mode).toBe('reconnecting')
		expect(got.label).toContain('Reconnecting')
	})

	it('queryFailing=true + at threshold → "manual-recovery" mode + hint set', () => {
		const got = computePollingDisplayState({
			lastEvent: baseEvent,
			queryFailing: true,
			consecutiveFailureMs: 90_000,
		})
		expect(got.mode).toBe('manual-recovery')
		expect(got.hint).toBeDefined()
		expect(got.hint).toContain('manual SSH')
		// Mention `/diagnostic` per D-OV-04 spec
		expect(got.hint).toContain('/diagnostic')
	})

	it('queryFailing=true + above threshold → "manual-recovery" mode', () => {
		const got = computePollingDisplayState({
			lastEvent: baseEvent,
			queryFailing: true,
			consecutiveFailureMs: 200_000,
		})
		expect(got.mode).toBe('manual-recovery')
	})

	it('threshold can be overridden for tests', () => {
		const got = computePollingDisplayState({
			lastEvent: baseEvent,
			queryFailing: true,
			consecutiveFailureMs: 50,
			recoveryThresholdMs: 25,
		})
		expect(got.mode).toBe('manual-recovery')
	})

	it('live mode uses install_sh_source for the reinstalling label', () => {
		const got = computePollingDisplayState({
			lastEvent: {
				...baseEvent,
				wipe_duration_ms: 5_000,
				reinstall_duration_ms: 1_000,
				install_sh_source: 'cache',
			},
			queryFailing: false,
			consecutiveFailureMs: 0,
		})
		expect(got.mode).toBe('live')
		expect(got.label).toContain('cache')
	})

	it('live mode with null lastEvent → "Connecting to LivOS…" (state-machine "unknown" path)', () => {
		const got = computePollingDisplayState({
			lastEvent: null,
			queryFailing: false,
			consecutiveFailureMs: 0,
		})
		expect(got.mode).toBe('live')
		expect(got.label).toContain('Connecting')
	})

	it('vi.useFakeTimers harness: simulates 90s of accumulated failures crossing the threshold', () => {
		vi.useFakeTimers()
		try {
			let consecutiveFailureMs = 0
			let lastMode = computePollingDisplayState({
				lastEvent: baseEvent,
				queryFailing: true,
				consecutiveFailureMs,
			}).mode
			expect(lastMode).toBe('reconnecting')
			// Simulate 89 seconds of failures — still reconnecting
			for (let i = 0; i < 89; i++) {
				vi.advanceTimersByTime(1_000)
				consecutiveFailureMs += 1_000
			}
			lastMode = computePollingDisplayState({
				lastEvent: baseEvent,
				queryFailing: true,
				consecutiveFailureMs,
			}).mode
			expect(lastMode).toBe('reconnecting')
			// Cross the threshold (90th second)
			vi.advanceTimersByTime(1_000)
			consecutiveFailureMs += 1_000
			expect(consecutiveFailureMs).toBe(90_000)
			lastMode = computePollingDisplayState({
				lastEvent: baseEvent,
				queryFailing: true,
				consecutiveFailureMs,
			}).mode
			expect(lastMode).toBe('manual-recovery')
		} finally {
			vi.useRealTimers()
		}
	})

	it('NO label/hint contains Server4 or Server5 across reconnect / manual / live', () => {
		const cases = [
			computePollingDisplayState({lastEvent: baseEvent, queryFailing: false, consecutiveFailureMs: 0}),
			computePollingDisplayState({lastEvent: baseEvent, queryFailing: true, consecutiveFailureMs: 0}),
			computePollingDisplayState({lastEvent: baseEvent, queryFailing: true, consecutiveFailureMs: 90_000}),
		]
		for (const c of cases) {
			expect(c.label).not.toContain('Server4')
			expect(c.label).not.toContain('Server5')
			if (c.hint) {
				expect(c.hint).not.toContain('Server4')
				expect(c.hint).not.toContain('Server5')
			}
		}
	})
})
