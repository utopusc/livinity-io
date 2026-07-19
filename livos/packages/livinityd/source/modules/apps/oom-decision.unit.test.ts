// Phase 343-02 RESIL-02 — pure decideOomAction() decision truth table.
//
// No I/O: decideOomAction is a pure function over an already-read inspect
// snapshot + the app's state/opt-out/debug flags + the process-scoped restart
// window. It returns exactly one of 'restart' | 'suspend-alert' | 'skip'.
//
// Decision order (D-343-4/5/6):
//   1. debugMode → skip (debug apps are left alone, D-343-3)
//   2. appState ∉ {ready, unhealthy} → skip (only owned states, D-343-5)
//   3. oomSelfHeal === false → skip (explicit opt-out; undefined = ON)
//   4. NOT an OOM signal → skip (in-cgroup residual + ordinary crashes)
//   5. ≥3 restarts inside the 60-min window → suspend-alert (breach)
//   6. else → restart

import {describe, expect, test} from 'vitest'

import {decideOomAction} from './oom-watch.js'

const HOUR = 60 * 60 * 1000
const NOW = 1_000_000_000_000 // fixed reference epoch-ms

// Convenience OOM snapshots.
const oomKilled = {oomKilled: true, status: 'exited', exitCode: 137}
const exit137 = {oomKilled: false, status: 'exited', exitCode: 137}
const running = {oomKilled: false, status: 'running', exitCode: 0}
const exit1 = {oomKilled: false, status: 'exited', exitCode: 1}

function decide(overrides: Partial<Parameters<typeof decideOomAction>[0]>) {
	return decideOomAction({
		inspect: oomKilled,
		appState: 'ready',
		oomSelfHeal: undefined,
		debugMode: false,
		windowTimestamps: [],
		now: NOW,
		...overrides,
	})
}

describe('decideOomAction — OOM self-heal decision truth table', () => {
	test('OOMKilled true + ready + selfHeal undefined + empty window → restart', () => {
		expect(decide({})).toBe('restart')
	})

	test('exited + exitCode 137 + unhealthy → restart (the 137-not-OOMKilled path)', () => {
		expect(decide({inspect: exit137, appState: 'unhealthy'})).toBe('restart')
	})

	test('OOMKilled false + running → skip (no OOM signal; in-cgroup residual)', () => {
		expect(decide({inspect: running})).toBe('skip')
	})

	test('exited + exitCode 1 (non-137) + OOMKilled false → skip (ordinary crash)', () => {
		expect(decide({inspect: exit1})).toBe('skip')
	})

	test('OOM true but debugMode true → skip (debug apps left alone)', () => {
		expect(decide({debugMode: true})).toBe('skip')
	})

	test('OOM true but appState stopped → skip (operator intent)', () => {
		expect(decide({appState: 'stopped'})).toBe('skip')
	})

	test('OOM true but appState debug → skip (non-owned state)', () => {
		expect(decide({appState: 'debug'})).toBe('skip')
	})

	test('OOM true but appState starting → skip (non-owned state)', () => {
		expect(decide({appState: 'starting'})).toBe('skip')
	})

	test('OOM true but appState restarting → skip (non-owned state)', () => {
		expect(decide({appState: 'restarting'})).toBe('skip')
	})

	test('OOM true but oomSelfHeal === false → skip (explicit opt-out)', () => {
		expect(decide({oomSelfHeal: false})).toBe('skip')
	})

	test('OOM true + 3 timestamps within the last 60min → suspend-alert (breach)', () => {
		const window = [NOW - 5 * 60 * 1000, NOW - 20 * 60 * 1000, NOW - 40 * 60 * 1000]
		expect(decide({windowTimestamps: window})).toBe('suspend-alert')
	})

	test('OOM true + 3 timestamps but all older than 60min → restart (window rolled off)', () => {
		const window = [NOW - 3 * HOUR, NOW - 2 * HOUR, NOW - 61 * 60 * 1000]
		expect(decide({windowTimestamps: window})).toBe('restart')
	})

	test('OOM true + 2 timestamps within window → restart (still under cap)', () => {
		const window = [NOW - 5 * 60 * 1000, NOW - 30 * 60 * 1000]
		expect(decide({windowTimestamps: window})).toBe('restart')
	})
})
