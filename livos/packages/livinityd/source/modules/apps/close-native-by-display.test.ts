/**
 * Phase 260.1-02 Task 1 (RED/GREEN) — closeNativeAppByDisplay helper.
 *
 * SC-B backend needs displays.close to tear a NATIVE display down via the
 * EXISTING closeNativeApp primitive (never double-tear the binary/Xvfb/port).
 * closeNativeAppByDisplay(':N', deps) maps a display → its activeNative entry,
 * delegates to closeNativeApp, and returns true; for a display that is NOT a
 * native app it returns false (caller then falls through to displayManager.kill
 * for luse displays).
 *
 * The helper reuses the module-scope `activeNative` Map + `nativeDisplayAllocator`
 * (both exported singletons), so the test populates `activeNative` directly and
 * clears it via _clearActiveNativeForTest between cases.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {describe, it, expect, vi, afterEach} from 'vitest'
import {EventEmitter} from 'node:events'

import {
	activeNative,
	closeNativeAppByDisplay,
	_clearActiveNativeForTest,
	type ActiveNativeApp,
} from './native-routes.js'
import {PortAllocator} from '../streaming/port-allocator.js'

class FakeChild extends EventEmitter {
	get exitCode(): number | null {
		return 0
	}
	get signalCode(): NodeJS.Signals | null {
		return null
	}
	kill = vi.fn(() => true)
}

function makeStreamManager(): {
	stopStream: ReturnType<typeof vi.fn>
	getPortAllocator(): PortAllocator
} {
	const portAllocator = new PortAllocator({min: 15910, max: 15920})
	return {
		stopStream: vi.fn(async (_id: string) => {}),
		getPortAllocator: () => portAllocator,
	}
}

function makeActive(id: string, displayN: number): ActiveNativeApp {
	const display = ':' + displayN
	const xvfb = {pid: 1, display, exited: new Promise(() => {}), stop: vi.fn(async () => {})}
	return {
		id,
		displayN,
		display,
		port: 15910,
		streamId: 'stream-' + id,
		wsUrl: 'ws://x/' + id,
		xvfb: xvfb as never,
		child: new FakeChild() as never,
		startedAt: Date.now(),
	}
}

afterEach(() => {
	_clearActiveNativeForTest()
})

describe('260.1-02 closeNativeAppByDisplay', () => {
	it('returns false when the display is NOT a native app (no activeNative entry)', async () => {
		const sm = makeStreamManager()
		const result = await closeNativeAppByDisplay(':99', {streamManager: sm as never})
		expect(result).toBe(false)
		expect(sm.stopStream).not.toHaveBeenCalled()
	})

	it('finds the activeNative entry by handle.display, delegates to closeNativeApp, returns true', async () => {
		const sm = makeStreamManager()
		const entry = makeActive('app-a', 15)
		activeNative.set('app-a', entry)

		const result = await closeNativeAppByDisplay(':15', {streamManager: sm as never})

		expect(result).toBe(true)
		// closeNativeApp removes the entry from activeNative eagerly.
		expect(activeNative.has('app-a')).toBe(false)
		// teardown delegated to the existing primitive — stream stopped, child SIGTERMed.
		expect(sm.stopStream).toHaveBeenCalledWith('stream-app-a')
		expect((entry.child as unknown as FakeChild).kill).toHaveBeenCalled()
	})

	it('matches on handle.display, not the map key', async () => {
		const sm = makeStreamManager()
		activeNative.set('some-uuid', makeActive('some-uuid', 20))

		expect(await closeNativeAppByDisplay(':21', {streamManager: sm as never})).toBe(false)
		expect(await closeNativeAppByDisplay(':20', {streamManager: sm as never})).toBe(true)
	})
})
