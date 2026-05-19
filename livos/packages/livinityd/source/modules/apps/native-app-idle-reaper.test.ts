/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase 159 — native-app-idle-reaper unit tests (Workstream B).
//
// Pattern: account/heartbeat-sender.test.ts — REAL timers with short
// intervals (50ms tick / 1000ms idle) + small sleep() between assertions.
// Fake timers interact poorly with the self-rescheduling chain (each tick
// must yield to the microtask queue multiple times before completing —
// flake-prone under vi.useFakeTimers()).

import {describe, it, expect, vi} from 'vitest'

import {startNativeAppIdleReaper} from './native-app-idle-reaper.js'

type FakeEntry = {
	id: string
	startedAt: number
	child: any
	xvfb: any
	streamId: string
	displayN: number
	port: number
	display: string
	wsUrl: string
}

function makeEntry(id: string, ageMs: number): FakeEntry {
	// Fake ChildProcess with a no-op kill and a resolved exitCode so that
	// closeNativeApp's "race exit vs SIGKILL" branch short-circuits without
	// waiting on the kill-grace.
	return {
		id,
		startedAt: Date.now() - ageMs,
		child: {
			kill: () => undefined,
			exitCode: 0,
			signalCode: null,
			once: (_event: string, _cb: () => void) => undefined,
		},
		xvfb: {stop: async () => undefined},
		streamId: `stream-${id}`,
		displayN: 10,
		port: 15900,
		display: ':10',
		wsUrl: `ws://localhost/${id}`,
	}
}

function makeStreamManager() {
	const stopStream = vi.fn(async () => undefined)
	return {
		stopStream,
		getPortAllocator: () => ({release: vi.fn()}),
	} as any
}

function makeDisplayAllocator() {
	return {release: vi.fn()} as any
}

function makeLogger() {
	const entries: Array<{level: string; msg: string}> = []
	return {
		entries,
		logger: {
			info: (msg: string) => entries.push({level: 'info', msg}),
			warn: (msg: string) => entries.push({level: 'warn', msg}),
			error: (msg: string) => entries.push({level: 'error', msg}),
		},
	}
}

/** Sleep for real wall-clock time (no fake timers). */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('native-app-idle-reaper — Phase 159', () => {
	it('reaps entries older than idleMs', async () => {
		const active = new Map<string, any>()
		active.set('old', makeEntry('old', 5_000))
		active.set('fresh', makeEntry('fresh', 10))

		const streamManager = makeStreamManager()
		const displayAllocator = makeDisplayAllocator()
		const {logger, entries} = makeLogger()

		const stop = startNativeAppIdleReaper({
			active,
			displayAllocator,
			streamManager,
			logger,
			idleMs: 1_000,
			intervalMs: 50,
		})

		// Wait a few ticks
		await sleep(200)
		stop()

		// Old entry reaped, fresh remains
		expect(active.has('old')).toBe(false)
		expect(active.has('fresh')).toBe(true)
		expect(entries.some((e) => e.msg.includes('reaped idle native app old'))).toBe(true)
	})

	it('does not reap entries within idleMs window', async () => {
		const active = new Map<string, any>()
		active.set('fresh', makeEntry('fresh', 100))

		const streamManager = makeStreamManager()
		const displayAllocator = makeDisplayAllocator()

		const stop = startNativeAppIdleReaper({
			active,
			displayAllocator,
			streamManager,
			idleMs: 5_000,
			intervalMs: 50,
		})

		await sleep(200)
		stop()

		expect(active.has('fresh')).toBe(true)
	})

	it('stop() halts further ticks', async () => {
		const active = new Map<string, any>()
		const streamManager = makeStreamManager()
		const displayAllocator = makeDisplayAllocator()
		const {logger, entries} = makeLogger()

		const stop = startNativeAppIdleReaper({
			active,
			displayAllocator,
			streamManager,
			logger,
			idleMs: 50,
			intervalMs: 50,
		})

		await sleep(100)
		stop()
		const armedCount = entries.filter((e) => e.msg.includes('armed')).length
		const stoppedCount = entries.filter((e) => e.msg.includes('stopped')).length

		// Insert a stale entry AFTER stop and confirm no reap fires
		active.set('post-stop', makeEntry('post-stop', 5_000))
		await sleep(200)

		expect(active.has('post-stop')).toBe(true)
		expect(armedCount).toBe(1)
		expect(stoppedCount).toBe(1)
	})

	it('per-entry close failure does NOT stop the tick from reaping others', async () => {
		const active = new Map<string, any>()
		// Two stale entries. closeNativeApp catches child.kill('SIGTERM')
		// throws internally (native-app-binder.ts line 207-213 try/catch);
		// the eager active.delete at line 201 happens BEFORE any teardown
		// step, so even a fully-throwing entry still gets removed.
		const failing = makeEntry('failing', 5_000)
		failing.child.kill = () => {
			throw new Error('boom')
		}
		active.set('failing', failing)
		active.set('healthy', makeEntry('healthy', 5_000))

		const streamManager = makeStreamManager()
		const displayAllocator = makeDisplayAllocator()
		const {logger} = makeLogger()

		const stop = startNativeAppIdleReaper({
			active,
			displayAllocator,
			streamManager,
			logger,
			idleMs: 1_000,
			intervalMs: 50,
		})

		await sleep(300)
		stop()

		// Both entries should be reaped — closeNativeApp's eager active.delete
		// removes the failing one before SIGTERM, and the healthy one proceeds
		// through teardown normally.
		expect(active.has('healthy')).toBe(false)
		expect(active.has('failing')).toBe(false)
	})

	// Sacred SHA invariant marker — Phase 159 every new test file MUST
	// reference sdk-agent-runner.ts so a casual reader sees the constraint.
	it('keeps the sacred-SHA marker comment for traceability', () => {
		// Reference: liv/packages/core/src/sdk-agent-runner.ts
		// must remain at f3538e1d811992b782a9bb057d1b7f0a0189f95f.
		expect(true).toBe(true)
	})
})
