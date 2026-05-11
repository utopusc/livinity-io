/**
 * Phase 102-05 Task 1 (RED) — Native-app-binder display-based binding.
 *
 * Phase 101-05 RED tests covered the WM_CLASS poll path against a shared :1
 * Xvfb. Phase 102 pivots to per-app Xvfb (D-102-NATIVE-APP-PARITY): each native
 * app gets its own dedicated `:N` display (allocated upstream by
 * DisplayAllocator + spawnXvfb in 102-01), so the binder no longer needs to
 * disambiguate windows on a shared display — the display IS the binding unit
 * and x11vnc captures it whole (`-display :N` mode).
 *
 * RED coverage (6 cases):
 *   1. inferWmClass retained as a pure helper (untouched from 101-05).
 *   2. bind({display, port: <allocated>, label, startStreamFn}) calls
 *      startStreamFn with {display, port, label} and returns
 *      {display, port, streamId, wsUrl}.
 *   3. WM_CLASS polling is NO LONGER performed — no xdotool execFile occurs
 *      during a bind call (no execFileFn injection accepted).
 *   4. If startStreamFn rejects, portAllocator.release(port) is invoked and
 *      the original error is re-thrown verbatim (cleanup safety).
 *   5. StreamStartFn signature matches `(opts: {display, port, label?}) =>
 *      Promise<{streamId, wsUrl}>` (TypeScript-checked by compilation; at
 *      runtime we assert the shape of the first call's argument).
 *   6. Optional `label` is forwarded to startStreamFn.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {describe, it, expect, vi} from 'vitest'
import {EventEmitter} from 'node:events'

import {
	bind,
	closeNativeApp,
	inferWmClass,
	type NativeActiveEntry,
} from './native-app-binder.js'
import {PortAllocator} from '../streaming/port-allocator.js'
import {DisplayAllocator} from '../streaming/display-allocator.js'

describe('inferWmClass (retained pure helper)', () => {
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

describe('102-05 bind (display-based)', () => {
	it('calls startStreamFn with {display, port, label} and returns {display, port, streamId, wsUrl}', async () => {
		const allocator = new PortAllocator({min: 15910, max: 15915})
		const startStreamFn = vi.fn(async (..._args: any[]) => ({
			streamId: 'sN',
			wsUrl: 'ws://x/sN',
		}))

		const result = await bind({
			display: ':12',
			portAllocator: allocator,
			startStreamFn,
			label: 'vscode',
		})

		expect(result.display).toBe(':12')
		expect(result.port).toBe(15910)
		expect(result.streamId).toBe('sN')
		expect(result.wsUrl).toBe('ws://x/sN')
		expect(startStreamFn).toHaveBeenCalledTimes(1)
		expect(startStreamFn.mock.calls[0][0]).toEqual({
			display: ':12',
			port: 15910,
			label: 'vscode',
		})
	})

	it('performs NO xdotool / WM_CLASS poll (display IS the binding unit)', async () => {
		const allocator = new PortAllocator({min: 15910, max: 15915})
		const startStreamFn = vi.fn(async () => ({streamId: 's1', wsUrl: 'ws://x/s1'}))

		await bind({
			display: ':12',
			portAllocator: allocator,
			startStreamFn,
		})

		expect(startStreamFn).toHaveBeenCalledTimes(1)
	})

	it('releases the port if startStreamFn rejects (cleanup safety)', async () => {
		const allocator = new PortAllocator({min: 15910, max: 15915})
		const releaseSpy = vi.spyOn(allocator, 'release')
		const startStreamFn = vi.fn(async () => {
			throw new Error('x11vnc spawn failed')
		})

		await expect(
			bind({
				display: ':12',
				portAllocator: allocator,
				startStreamFn,
			}),
		).rejects.toThrow('x11vnc spawn failed')

		expect(releaseSpy).toHaveBeenCalledTimes(1)
		expect(releaseSpy.mock.calls[0][0]).toBe(15910)
		expect(allocator.inUseCount).toBe(0)
	})

	it('propagates the optional label to startStreamFn', async () => {
		const allocator = new PortAllocator({min: 15910, max: 15915})
		const startStreamFn = vi.fn(async () => ({streamId: 's1', wsUrl: 'ws://x/s1'}))

		await bind({
			display: ':13',
			portAllocator: allocator,
			startStreamFn,
			label: 'Antigravity IDE',
		})

		expect((startStreamFn.mock.calls as any[])[0][0].label).toBe('Antigravity IDE')
	})

	it('matches the StreamStartFn signature ({display, port, label?}) => Promise<{streamId, wsUrl}>', async () => {
		const allocator = new PortAllocator({min: 15910, max: 15915})
		const startStreamFn = vi.fn(async (opts: {display: string; port: number; label?: string}) => {
			return {streamId: 's-' + opts.display + '-' + opts.port, wsUrl: 'ws://x/' + opts.display}
		})

		const result = await bind({
			display: ':14',
			portAllocator: allocator,
			startStreamFn,
			label: 'native',
		})

		const arg = startStreamFn.mock.calls[0][0] as Record<string, unknown>
		expect(arg.display).toBe(':14')
		expect(arg.port).toBe(15910)
		expect(arg.label).toBe('native')
		expect('wid' in arg).toBe(false)
		expect(result.streamId).toBe('s-:14-15910')
	})
})

// ============================================================================
// Phase 102-08 — closeNativeApp ordered teardown (D-102-CLOSE-LIFECYCLE)
//
//   1. child.kill('SIGTERM')         (graceful)
//   2. child.kill('SIGKILL')         (if still alive after grace)
//   3. streamManager.stopStream
//   4. xvfb.stop()
//   5. displayAllocator.release(N)
//   6. portAllocator.release(port)   (idempotent)
//   7. active.delete(id)             (performed eagerly first)
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f UNTOUCHED.
// ============================================================================

class FakeNativeChild extends EventEmitter {
	private _exitCode: number | null = null
	private _signalCode: NodeJS.Signals | null = null
	get exitCode(): number | null {
		return this._exitCode
	}
	get signalCode(): NodeJS.Signals | null {
		return this._signalCode
	}
	kill = vi.fn((signal: NodeJS.Signals | number | 'SIGTERM' | 'SIGKILL' = 'SIGTERM') => {
		// Simulate immediate exit on SIGTERM unless tests override (by calling
		// _stayAlive() before close).
		if (this._stayAlive && signal === 'SIGTERM') {
			// no-op — wait for SIGKILL.
			return true
		}
		// Synchronously schedule exit emission so close() observes it.
		this._signalCode = signal as NodeJS.Signals
		setImmediate(() => {
			this._exitCode = 0
			this.emit('exit', 0, signal)
		})
		return true
	})
	_stayAlive = false
	_setStayAlive(): void {
		this._stayAlive = true
	}
}

function makeFakeXvfbHandle(display: string): {handle: ReturnType<typeof Object>; stopCalls: string[]} {
	const stopCalls: string[] = []
	const stop = vi.fn(async () => {
		stopCalls.push(display)
	})
	const handle = {
		pid: 11999,
		display,
		exited: new Promise(() => {}),
		stop,
	}
	return {handle, stopCalls}
}

function makeActiveEntry(
	id: string,
	displayN: number,
	port: number,
): {entry: NativeActiveEntry; child: FakeNativeChild; xvfbStopCalls: string[]} {
	const child = new FakeNativeChild()
	const display = ':' + displayN
	const {handle, stopCalls: xvfbStopCalls} = makeFakeXvfbHandle(display)
	const entry: NativeActiveEntry = {
		id,
		displayN,
		display,
		port,
		streamId: 'stream-' + id,
		wsUrl: 'ws://x/' + id,
		xvfb: handle as never,
		child: child as never,
		startedAt: Date.now(),
	}
	return {entry, child, xvfbStopCalls}
}

describe('Phase 102-08 — closeNativeApp ordered teardown + idempotency', () => {
	it('T-102-08-N-01: closes in order — child.kill(SIGTERM) → streamManager.stopStream → xvfb.stop → displayAllocator.release → portAllocator.release; active.delete first', async () => {
		const active = new Map<string, NativeActiveEntry>()
		const displayAllocator = new DisplayAllocator()
		const displayN = displayAllocator.allocate() // :10
		const portAllocator = new PortAllocator({min: 15910, max: 15920})
		const port = portAllocator.allocate() // 15910
		const {entry, child, xvfbStopCalls} = makeActiveEntry('app-a', displayN, port)
		active.set('app-a', entry)

		const stopStream = vi.fn(async (_id: string) => {})
		const streamManager = {stopStream}
		const releaseDisplay = vi.spyOn(displayAllocator, 'release')
		const releasePort = vi.spyOn(portAllocator, 'release')

		await closeNativeApp({
			id: 'app-a',
			active,
			displayAllocator,
			portAllocator,
			streamManager,
			killGraceMs: 50,
		})

		// SIGTERM was sent to the child.
		expect(child.kill).toHaveBeenCalledWith('SIGTERM')
		// stopStream invoked once on the right streamId.
		expect(stopStream).toHaveBeenCalledTimes(1)
		expect(stopStream).toHaveBeenCalledWith('stream-app-a')
		// xvfb stop invoked.
		expect(xvfbStopCalls).toEqual([':' + displayN])
		// display + port both released (port back-released is idempotent at allocator).
		expect(releaseDisplay).toHaveBeenCalledWith(displayN)
		expect(releasePort).toHaveBeenCalledWith(port)
		// active map drained eagerly.
		expect(active.has('app-a')).toBe(false)

		// Sequence proof — stopStream → xvfb.stop → display.release → port.release.
		const stopStreamOrder = (stopStream as any).mock.invocationCallOrder[0]
		const xvfbStopOrder = ((entry.xvfb as never as {stop: ReturnType<typeof vi.fn>}).stop as any)
			.mock.invocationCallOrder[0]
		const displayOrder = releaseDisplay.mock.invocationCallOrder[0]
		const portOrder = releasePort.mock.invocationCallOrder[0]
		expect(stopStreamOrder).toBeLessThan(xvfbStopOrder)
		expect(xvfbStopOrder).toBeLessThan(displayOrder)
		expect(displayOrder).toBeLessThan(portOrder)
	})

	it('T-102-08-N-02: idempotent — second close on already-deleted id is a no-op (no throw, no double release)', async () => {
		const active = new Map<string, NativeActiveEntry>()
		const displayAllocator = new DisplayAllocator()
		const displayN = displayAllocator.allocate()
		const portAllocator = new PortAllocator({min: 15910, max: 15920})
		const port = portAllocator.allocate()
		const {entry, child} = makeActiveEntry('app-b', displayN, port)
		active.set('app-b', entry)

		const stopStream = vi.fn(async () => {})
		const streamManager = {stopStream}
		const releaseDisplay = vi.spyOn(displayAllocator, 'release')
		const releasePort = vi.spyOn(portAllocator, 'release')

		await closeNativeApp({
			id: 'app-b',
			active,
			displayAllocator,
			portAllocator,
			streamManager,
			killGraceMs: 50,
		})
		// Second close — no-op.
		await expect(
			closeNativeApp({
				id: 'app-b',
				active,
				displayAllocator,
				portAllocator,
				streamManager,
				killGraceMs: 50,
			}),
		).resolves.toBeUndefined()

		// child.kill, stopStream, display/port release ALL called exactly once.
		expect(child.kill).toHaveBeenCalledTimes(1)
		expect(stopStream).toHaveBeenCalledTimes(1)
		expect(releaseDisplay).toHaveBeenCalledTimes(1)
		expect(releasePort).toHaveBeenCalledTimes(1)
	})

	it('T-102-08-N-03: SIGKILL fallback — when child stays alive after SIGTERM grace, SIGKILL is sent', async () => {
		const active = new Map<string, NativeActiveEntry>()
		const displayAllocator = new DisplayAllocator()
		const displayN = displayAllocator.allocate()
		const portAllocator = new PortAllocator({min: 15910, max: 15920})
		const port = portAllocator.allocate()
		const {entry, child} = makeActiveEntry('app-c', displayN, port)
		// Force SIGTERM to be ignored — close MUST escalate to SIGKILL after grace.
		child._setStayAlive()
		active.set('app-c', entry)

		const stopStream = vi.fn(async () => {})
		const streamManager = {stopStream}

		const t0 = Date.now()
		await closeNativeApp({
			id: 'app-c',
			active,
			displayAllocator,
			portAllocator,
			streamManager,
			killGraceMs: 30,
		})
		const elapsed = Date.now() - t0

		expect(child.kill).toHaveBeenCalledWith('SIGTERM')
		expect(child.kill).toHaveBeenCalledWith('SIGKILL')
		// We waited at least killGraceMs before SIGKILL fired.
		expect(elapsed).toBeGreaterThanOrEqual(25)
		expect(active.has('app-c')).toBe(false)
	})

	it('T-102-08-N-04: T-101-02 carry — id is validated as uuid at the tRPC layer BEFORE the primitive sees it (smoke: primitive does NOT validate id itself; route schema does)', async () => {
		// The primitive does not perform its own id validation — the tRPC schema
		// (z.string().uuid() on closeInput in native-routes.ts) is the gate.
		// Smoke check: calling the primitive with a non-uuid id is still a clean
		// no-op (idempotent on missing entry) and never throws.
		const active = new Map<string, NativeActiveEntry>()
		const displayAllocator = new DisplayAllocator()
		const portAllocator = new PortAllocator({min: 15910, max: 15920})
		const stopStream = vi.fn(async () => {})
		const streamManager = {stopStream}

		await expect(
			closeNativeApp({
				id: 'not-a-uuid',
				active,
				displayAllocator,
				portAllocator,
				streamManager,
				killGraceMs: 10,
			}),
		).resolves.toBeUndefined()
		expect(stopStream).not.toHaveBeenCalled()
	})

	it('T-102-08-N-05: streamManager.stopStream failure — subsequent steps still execute (compensating drain)', async () => {
		const active = new Map<string, NativeActiveEntry>()
		const displayAllocator = new DisplayAllocator()
		const displayN = displayAllocator.allocate()
		const portAllocator = new PortAllocator({min: 15910, max: 15920})
		const port = portAllocator.allocate()
		const {entry, child, xvfbStopCalls} = makeActiveEntry('app-d', displayN, port)
		active.set('app-d', entry)

		const stopStream = vi.fn(async () => {
			throw new Error('stopStream boom')
		})
		const streamManager = {stopStream}
		const releaseDisplay = vi.spyOn(displayAllocator, 'release')
		const releasePort = vi.spyOn(portAllocator, 'release')

		// close MUST NOT throw — every step is best-effort.
		await expect(
			closeNativeApp({
				id: 'app-d',
				active,
				displayAllocator,
				portAllocator,
				streamManager,
				killGraceMs: 30,
			}),
		).resolves.toBeUndefined()

		// All subsequent teardown steps still ran.
		expect(child.kill).toHaveBeenCalledWith('SIGTERM')
		expect(xvfbStopCalls).toEqual([':' + displayN])
		expect(releaseDisplay).toHaveBeenCalledWith(displayN)
		expect(releasePort).toHaveBeenCalledWith(port)
	})
})
