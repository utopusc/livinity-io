/**
 * Phase 101-05 Task 1 — Native-app window binder.
 *
 * RED phase: the cases below specify the binder contract before the
 * implementation exists. GREEN phase ships `native-app-binder.ts` minimum
 * surface to flip every case to PASS.
 *
 * Coverage (≥9):
 *   1. snapshotWindowIds returns a Set<number> parsed from xdotool stdout
 *   2. inferWmClass('/usr/bin/code') → 'code'
 *   3. inferWmClass('/opt/Antigravity/antigravity') → 'antigravity'
 *   4. inferWmClass strips a trailing extension
 *   5. bindNativeAppWindow returns wid on first poll iteration when match exists immediately
 *   6. bindNativeAppWindow polls and returns wid as soon as a NEW match appears
 *      (the baseline-and-poll invariant — pre-existing matching wids are ignored)
 *   7. bindNativeAppWindow throws NativeAppWindowNotFoundError after deadline
 *   8. bindNativeAppWindow allocates port via injected portAllocator AFTER wid match
 *   9. bindNativeAppWindow returns {wid, port, streamId, wsUrl} when startStreamFn resolves
 *  10. bindNativeAppWindow releases port when startStreamFn rejects (cleanup safety)
 *
 * Test pattern mirrors the spawner suite (FakeChild + vi.fn execFile factory).
 * Polling cadence is set via `pollIntervalMs: 0` in tests so the suite runs in
 * milliseconds without needing fake timers.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {describe, it, expect, vi} from 'vitest'

import {
	bindNativeAppWindow,
	inferWmClass,
	snapshotWindowIds,
	NativeAppWindowNotFoundError,
} from './native-app-binder.js'
import {PortAllocator} from '../streaming/port-allocator.js'

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Builds an `execFileFn` mock whose nth call resolves with the nth queued
 * stdout. Once the queue is exhausted, subsequent calls reject with a
 * fabricated non-zero exit error — mimicking xdotool's behaviour when no
 * windows match.
 */
function queuedExecFile(queue: string[]) {
	let i = 0
	return vi.fn(async (_cmd: string, _args: string[], _opts?: any) => {
		if (i < queue.length) {
			const stdout = queue[i++]
			return {stdout, stderr: ''}
		}
		const err = new Error('xdotool: no match') as Error & {code?: number}
		err.code = 1
		throw err
	})
}

function makeLogger() {
	return {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		verbose: vi.fn(),
	}
}

// ─── snapshotWindowIds ──────────────────────────────────────────────────────

describe('snapshotWindowIds', () => {
	it('parses xdotool stdout into a Set<number>', async () => {
		const exec = vi.fn(async () => ({stdout: '12345\n67890\n  \n23456', stderr: ''}))
		const set = await snapshotWindowIds(':1', exec as any)
		expect(set.has(12345)).toBe(true)
		expect(set.has(67890)).toBe(true)
		expect(set.has(23456)).toBe(true)
		expect(set.size).toBe(3)
	})

	it('returns an empty Set when xdotool fails', async () => {
		const exec = vi.fn(async () => {
			throw new Error('xdotool: no windows')
		})
		const set = await snapshotWindowIds(':1', exec as any)
		expect(set.size).toBe(0)
	})
})

// ─── inferWmClass ───────────────────────────────────────────────────────────

describe('inferWmClass', () => {
	it("returns 'code' for /usr/bin/code", () => {
		expect(inferWmClass('/usr/bin/code')).toBe('code')
	})

	it("returns 'antigravity' for /opt/Antigravity/antigravity (lowercased basename)", () => {
		expect(inferWmClass('/opt/Antigravity/antigravity')).toBe('antigravity')
	})

	it('strips a trailing file extension', () => {
		expect(inferWmClass('/opt/foo/bar.bin')).toBe('bar')
	})
})

// ─── bindNativeAppWindow ───────────────────────────────────────────────────

describe('bindNativeAppWindow', () => {
	it('returns wid on first poll iteration when a NEW match exists immediately', async () => {
		// Baseline = empty, then first --class search returns wid 4242
		const exec = queuedExecFile([
			'', // snapshotWindowIds baseline
			'4242', // first --class search → new wid
		])
		const allocator = new PortAllocator({min: 15900, max: 15905})
		const startStreamFn = vi.fn(async () => ({streamId: 's1', wsUrl: 'ws://x/s1'}))

		const result = await bindNativeAppWindow({
			pid: 100,
			wmClass: 'antigravity',
			display: ':1',
			portAllocator: allocator,
			startStreamFn,
			execFileFn: exec as any,
			pollIntervalMs: 0,
		})

		expect(result.wid).toBe(4242)
		expect(result.port).toBe(15900)
		expect(result.streamId).toBe('s1')
		expect(result.wsUrl).toBe('ws://x/s1')
	})

	it('ignores pre-existing matching wids (baseline-and-poll) and waits for a NEW one', async () => {
		const exec = queuedExecFile([
			'1111\n2222', // baseline snapshot — both wids already exist
			'1111\n2222', // first poll: still no new window
			'1111\n2222\n3333', // second poll: 3333 is the new wid
		])
		const allocator = new PortAllocator({min: 15900, max: 15905})
		const startStreamFn = vi.fn(async () => ({streamId: 'sx', wsUrl: 'ws://x/sx'}))

		const result = await bindNativeAppWindow({
			pid: 100,
			wmClass: 'antigravity',
			display: ':1',
			portAllocator: allocator,
			startStreamFn,
			execFileFn: exec as any,
			pollIntervalMs: 0,
		})

		expect(result.wid).toBe(3333)
	})

	it('throws NativeAppWindowNotFoundError when deadline elapses with no new match', async () => {
		// Baseline: empty. Then every poll returns the same empty stdout —
		// xdotool finds zero matches. With a 50ms deadline and 0ms poll
		// cadence we should hit the deadline quickly.
		const exec = vi.fn(async (_cmd: string, args: string[]) => {
			if (args[0] === 'search' && args.length === 2) {
				// snapshot call (no --class)
				return {stdout: '', stderr: ''}
			}
			// --class poll → no match
			return {stdout: '', stderr: ''}
		})
		const allocator = new PortAllocator({min: 15900, max: 15905})
		const startStreamFn = vi.fn(async () => ({streamId: 'sx', wsUrl: 'ws://x/sx'}))

		await expect(
			bindNativeAppWindow({
				pid: 100,
				wmClass: 'never-exists',
				display: ':1',
				portAllocator: allocator,
				startStreamFn,
				execFileFn: exec as any,
				deadlineMs: 50,
				pollIntervalMs: 10,
			}),
		).rejects.toBeInstanceOf(NativeAppWindowNotFoundError)

		// portAllocator must NOT have been consumed when no wid was matched
		expect(allocator.inUseCount).toBe(0)
		// startStreamFn must NOT have been called
		expect(startStreamFn).not.toHaveBeenCalled()
	})

	it('allocates port via portAllocator AFTER the wid is matched (order invariant)', async () => {
		const exec = queuedExecFile([
			'', // baseline empty
			'7777', // first --class match
		])
		const allocator = new PortAllocator({min: 15900, max: 15905})
		const allocateSpy = vi.spyOn(allocator, 'allocate')
		const startStreamFn = vi.fn(async () => ({streamId: 's1', wsUrl: 'ws://x/s1'}))

		await bindNativeAppWindow({
			pid: 100,
			wmClass: 'antigravity',
			display: ':1',
			portAllocator: allocator,
			startStreamFn,
			execFileFn: exec as any,
			pollIntervalMs: 0,
		})

		// allocate() must have been called exactly once
		expect(allocateSpy).toHaveBeenCalledTimes(1)
		// And it must have been called BEFORE startStreamFn (which receives the
		// allocated port as input) — the only way to guarantee this is to verify
		// startStreamFn was called with the port the allocator returned.
		const passedPort = startStreamFn.mock.calls[0][0].port
		expect(passedPort).toBe(15900)
		expect(startStreamFn.mock.calls[0][0].wid).toBe(7777)
	})

	it('releases the port if startStreamFn throws (cleanup safety)', async () => {
		const exec = queuedExecFile([
			'', // baseline empty
			'4242', // first --class match
		])
		const allocator = new PortAllocator({min: 15900, max: 15905})
		const releaseSpy = vi.spyOn(allocator, 'release')
		const startStreamFn = vi.fn(async () => {
			throw new Error('x11vnc spawn failed')
		})

		await expect(
			bindNativeAppWindow({
				pid: 100,
				wmClass: 'antigravity',
				display: ':1',
				portAllocator: allocator,
				startStreamFn,
				execFileFn: exec as any,
				pollIntervalMs: 0,
			}),
		).rejects.toThrow('x11vnc spawn failed')

		// Port must be released after the start-stream failure so the slot
		// can be reused by the next spawn.
		expect(releaseSpy).toHaveBeenCalledTimes(1)
		expect(releaseSpy.mock.calls[0][0]).toBe(15900)
		expect(allocator.inUseCount).toBe(0)
	})

	it('propagates the optional label to startStreamFn (so logs are useful)', async () => {
		const exec = queuedExecFile(['', '7777'])
		const allocator = new PortAllocator({min: 15900, max: 15905})
		const startStreamFn = vi.fn(async () => ({streamId: 's1', wsUrl: 'ws://x/s1'}))

		await bindNativeAppWindow({
			pid: 100,
			wmClass: 'antigravity',
			display: ':1',
			portAllocator: allocator,
			startStreamFn,
			execFileFn: exec as any,
			pollIntervalMs: 0,
			label: 'Antigravity IDE',
		})

		expect(startStreamFn.mock.calls[0][0].label).toBe('Antigravity IDE')
	})

	it('logs an info line when the bind succeeds', async () => {
		const exec = queuedExecFile(['', '8888'])
		const allocator = new PortAllocator({min: 15900, max: 15905})
		const startStreamFn = vi.fn(async () => ({streamId: 's1', wsUrl: 'ws://x/s1'}))
		const logger = makeLogger()

		await bindNativeAppWindow({
			pid: 100,
			wmClass: 'antigravity',
			display: ':1',
			portAllocator: allocator,
			startStreamFn,
			execFileFn: exec as any,
			pollIntervalMs: 0,
			logger,
		})

		expect(logger.info).toHaveBeenCalled()
		const msg = logger.info.mock.calls[0][0] as string
		expect(msg).toMatch(/wid=8888/)
		expect(msg).toMatch(/port=15900/)
		expect(msg).toMatch(/streamId=s1/)
	})

	it('uses :1 as the default display when display is not provided', async () => {
		const exec = queuedExecFile(['', '4242'])
		const allocator = new PortAllocator({min: 15900, max: 15905})
		const startStreamFn = vi.fn(async () => ({streamId: 's1', wsUrl: 'ws://x/s1'}))

		await bindNativeAppWindow({
			pid: 100,
			wmClass: 'antigravity',
			portAllocator: allocator,
			startStreamFn,
			execFileFn: exec as any,
			pollIntervalMs: 0,
		})

		// Every execFile invocation must have DISPLAY=:1 in its env opt.
		for (const call of exec.mock.calls) {
			const opts = call[2] as {env?: Record<string, string>} | undefined
			expect(opts?.env?.DISPLAY).toBe(':1')
		}
	})
})
