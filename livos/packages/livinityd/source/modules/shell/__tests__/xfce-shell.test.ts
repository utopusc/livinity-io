/**
 * Phase 256 (D-256-XFCE-HOST-DESKTOP) — XFCE host shell launcher + dock contract.
 *
 * Locks the boot contract for shell/xfce-shell.ts, modeled on the
 * webapps/fluxbox-wm.ts + shell/branded-shell.ts patterns:
 *   - the launcher starts the XFCE components with the xfwm4 compositor OFF under
 *     a private dbus-run-session (no xfconf in the launcher — config is pre-written);
 *   - the dock + wallpaper are emitted as perchannel xfconf XML (bottom dark dock
 *     with whisker menu + launchers + tasklist + systray + clock; LivOS wallpaper);
 *   - the desktop is spawned as `bash <launcher>` with env.DISPLAY===':1'
 *     (subprocess-scoped — the Pitfall-1 invariant, never global mutation);
 *   - a fast child exit inside the health-check window throws (so the boot call
 *     site can degrade to fluxbox + the branded shell);
 *   - a child that stays alive resolves to a handle with a stop().
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {
	buildDesktopXml,
	buildPanelXml,
	buildXfceLauncher,
	startXfceShell,
} from '../xfce-shell.js'

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

describe('xfce-shell — launcher + dock contract + subprocess-scoped DISPLAY', () => {
	let spawnFn: ReturnType<typeof vi.fn>
	let writeFileFn: ReturnType<typeof vi.fn>
	let mkdirFn: ReturnType<typeof vi.fn>
	let copyFileFn: ReturnType<typeof vi.fn>
	let chmodFn: ReturnType<typeof vi.fn>

	const baseOpts = () => ({
		display: ':1',
		spawnFn,
		writeFileFn,
		mkdirFn,
		copyFileFn,
		chmodFn,
		homeDir: '/home/test',
		wallpaperPath: WALLPAPER,
		healthCheckMs: 10,
	})

	beforeEach(() => {
		spawnFn = vi.fn(() => fakeChild())
		writeFileFn = vi.fn()
		mkdirFn = vi.fn()
		copyFileFn = vi.fn()
		chmodFn = vi.fn()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('buildXfceLauncher: compositor-off + dbus-run-session + components, NO xfconf', () => {
		const script = buildXfceLauncher(':1')
		expect(script).toContain('xfwm4 --compositor=off')
		expect(script).toContain('dbus-run-session')
		expect(script).toContain('xfce4-panel')
		expect(script).toContain('xfdesktop')
		expect(script).toContain('export DISPLAY=:1')
		// xfconf config is pre-written, NOT in the launcher
		expect(script).not.toContain('xfconf-query')
	})

	it('buildPanelXml: single dark bottom dock with whisker menu + launchers + clock', () => {
		const xml = buildPanelXml()
		expect(xml).toContain('value="whiskermenu"')
		expect(xml).toContain('value="launcher"')
		expect(xml).toContain('google-chrome.desktop')
		expect(xml).toContain('value="tasklist"')
		expect(xml).toContain('value="systray"')
		expect(xml).toContain('value="clock"')
		// bottom position + dark background
		expect(xml).toContain('p=10;')
		expect(xml).toContain('background-style')
	})

	it('buildDesktopXml: applies the LivOS wallpaper on the `screen` monitor', () => {
		const xml = buildDesktopXml(WALLPAPER)
		expect(xml).toContain('monitorscreen')
		expect(xml).toContain(WALLPAPER)
		expect(xml).toContain('last-image')
	})

	it('Test 1: pre-writes the panel + desktop xfconf XML and the launcher', async () => {
		await startXfceShell(baseOpts())
		const written = writeFileFn.mock.calls.map((c) => String(c[0]))
		expect(written.some((p) => p.endsWith('xfce4-panel.xml'))).toBe(true)
		expect(written.some((p) => p.endsWith('xfce4-desktop.xml'))).toBe(true)
		expect(written.some((p) => /xfce.*\.sh$/.test(p))).toBe(true)
	})

	it('Test 1b (Phase 259): dock Chrome launcher is WRITTEN with the livos-chrome profile, not copied from system', async () => {
		await startXfceShell(baseOpts())
		// launcher-2 (Chrome) is written verbatim with the livos-chrome --user-data-dir
		// so it opens the SAME singleton profile as the boot Chrome (no 2nd profile).
		const chromeWrite = writeFileFn.mock.calls.find(
			(c) => String(c[0]).includes('launcher-2') && String(c[0]).endsWith('google-chrome.desktop'),
		)
		expect(chromeWrite, 'chrome dock launcher not written').toBeTruthy()
		expect(String(chromeWrite![1])).toContain('--user-data-dir=/home/bruce/.config/livos-chrome')
		// It is NOT copied from /usr/share/applications (that one lacks --user-data-dir).
		expect(copyFileFn.mock.calls.find((c) => String(c[1]).includes('google-chrome.desktop'))).toBeUndefined()
		// thunar + terminal are still COPIED from the system dir (unchanged).
		expect(copyFileFn.mock.calls.find((c) => String(c[0]).includes('thunar.desktop'))).toBeTruthy()
	})

	it('Test 2: spawns `bash <launcher>` with env.DISPLAY===":1"', async () => {
		await startXfceShell(baseOpts())
		const bashCall = spawnFn.mock.calls.find((c) => c[0] === 'bash')
		expect(bashCall, 'bash launcher was not spawned').toBeTruthy()
		const args = bashCall![1] as string[]
		expect(args[0]).toMatch(/xfce/i)
		expect((bashCall![2] as {env: {DISPLAY: string}}).env.DISPLAY).toBe(':1')
	})

	it('Test 3: does NOT mutate the global process.env.DISPLAY', async () => {
		const before = process.env.DISPLAY
		await startXfceShell(baseOpts())
		expect(process.env.DISPLAY).toBe(before)
	})

	it('Test 4: a fast child exit throws (degrade signal for the boot call site)', async () => {
		spawnFn = vi.fn(() => fakeChild({exitImmediately: true}))
		await expect(startXfceShell({...baseOpts(), healthCheckMs: 50})).rejects.toThrow(
			/xfce shell failed to start/i,
		)
	})

	it('Test 5: a child that stays alive resolves to a handle with pid + stop()', async () => {
		const handle = await startXfceShell(baseOpts())
		expect(handle.pid).toBe(4242)
		expect(handle.display).toBe(':1')
		expect(typeof handle.stop).toBe('function')
	})
})
