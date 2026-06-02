/**
 * Phase 256 (D-256-XFCE-HOST-DESKTOP) — XFCE host shell launcher contract.
 *
 * Locks the boot contract for shell/xfce-shell.ts, modeled on the
 * webapps/fluxbox-wm.ts + shell/branded-shell.ts patterns:
 *   - the launcher is written with the xfwm4 compositor OFF + a private
 *     dbus-run-session + the absolute LivOS wallpaper path baked in;
 *   - the desktop is spawned as `bash <launcher>` with env.DISPLAY===':1'
 *     (subprocess-scoped — the Pitfall-1 invariant, never global mutation);
 *   - a fast child exit inside the health-check window throws (so the boot
 *     call site can degrade to fluxbox + the branded shell);
 *   - a child that stays alive resolves to a handle with a stop().
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {buildXfceLauncher, startXfceShell} from '../xfce-shell.js'

const WALLPAPER = '/opt/livos/packages/livinityd/source/modules/shell/assets/livos-wallpaper.png'

/** A fake child-process handle matching the subset startXfceShell uses.
 * `exitImmediately` makes the early-exit health check fire (simulating a hard
 * startup failure like a missing dbus-run-session/xfwm4). */
function fakeChild(opts?: {exitImmediately?: boolean; pid?: number}) {
	return {
		on: vi.fn(),
		once: vi.fn((ev: string, cb: (code: number | null, signal: NodeJS.Signals | null) => void) => {
			if (ev === 'exit' && opts?.exitImmediately) cb(1, null)
		}),
		unref: vi.fn(),
		stderr: {on: vi.fn()},
		kill: vi.fn(),
		pid: opts?.pid ?? 4242,
	}
}

describe('xfce-shell — launcher contract + subprocess-scoped DISPLAY', () => {
	let spawnFn: ReturnType<typeof vi.fn>
	let writeFileFn: ReturnType<typeof vi.fn>
	let chmodFn: ReturnType<typeof vi.fn>

	beforeEach(() => {
		spawnFn = vi.fn(() => fakeChild())
		writeFileFn = vi.fn()
		chmodFn = vi.fn()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('buildXfceLauncher bakes compositor-off + dbus-run-session + wallpaper + display', () => {
		const script = buildXfceLauncher(':1', WALLPAPER)
		expect(script).toContain('xfwm4 --compositor=off')
		expect(script).toContain('dbus-run-session')
		expect(script).toContain('xfce4-panel')
		expect(script).toContain('xfdesktop')
		expect(script).toContain(WALLPAPER)
		expect(script).toContain('export DISPLAY=:1')
	})

	it('Test 1: writes a launcher file with the compositor-off XFCE pipeline', async () => {
		await startXfceShell({display: ':1', spawnFn, writeFileFn, chmodFn, wallpaperPath: WALLPAPER, healthCheckMs: 10})
		expect(writeFileFn).toHaveBeenCalled()
		const content = String(writeFileFn.mock.calls[0]![1])
		expect(content).toContain('xfwm4 --compositor=off')
		expect(content).toContain(WALLPAPER)
	})

	it('Test 2: spawns `bash <launcher>` with env.DISPLAY===":1"', async () => {
		await startXfceShell({display: ':1', spawnFn, writeFileFn, chmodFn, wallpaperPath: WALLPAPER, healthCheckMs: 10})
		const bashCall = spawnFn.mock.calls.find((c) => c[0] === 'bash')
		expect(bashCall, 'bash launcher was not spawned').toBeTruthy()
		const args = bashCall![1] as string[]
		expect(args[0]).toMatch(/xfce/i)
		expect((bashCall![2] as {env: {DISPLAY: string}}).env.DISPLAY).toBe(':1')
	})

	it('Test 3: does NOT mutate the global process.env.DISPLAY', async () => {
		const before = process.env.DISPLAY
		await startXfceShell({display: ':1', spawnFn, writeFileFn, chmodFn, wallpaperPath: WALLPAPER, healthCheckMs: 10})
		expect(process.env.DISPLAY).toBe(before)
	})

	it('Test 4: a fast child exit throws (degrade signal for the boot call site)', async () => {
		spawnFn = vi.fn(() => fakeChild({exitImmediately: true}))
		await expect(
			startXfceShell({display: ':1', spawnFn, writeFileFn, chmodFn, wallpaperPath: WALLPAPER, healthCheckMs: 50}),
		).rejects.toThrow(/xfce shell failed to start/i)
	})

	it('Test 5: a child that stays alive resolves to a handle with pid + stop()', async () => {
		const handle = await startXfceShell({
			display: ':1',
			spawnFn,
			writeFileFn,
			chmodFn,
			wallpaperPath: WALLPAPER,
			healthCheckMs: 10,
		})
		expect(handle.pid).toBe(4242)
		expect(handle.display).toBe(':1')
		expect(typeof handle.stop).toBe('function')
	})
})
