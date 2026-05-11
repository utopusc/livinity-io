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

import {bind, inferWmClass} from './native-app-binder.js'
import {PortAllocator} from '../streaming/port-allocator.js'

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
