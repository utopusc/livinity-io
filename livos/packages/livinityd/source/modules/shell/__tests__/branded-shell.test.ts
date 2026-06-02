/**
 * Phase 255-01 (Wave 0 RED) — branded-shell boot argv contract.
 *
 * RED-before-GREEN (Nyquist): `shell/branded-shell.ts` does NOT exist yet —
 * the import below fails to resolve, so every test in this file errors at
 * collection time (RED for the right reason: the module is unimplemented).
 * The GREEN comes in plan 255-05, which adds bootBrandedShell() modeled on
 * webapps/fluxbox-wm.ts: an injected spawnFn, env {...process.env, DISPLAY}
 * (subprocess-scoped, NEVER global process.env mutation), an idempotent
 * fluxbox STYLE-file write, and non-fatal try/catch degrade.
 *
 * Contract this file locks:
 *   - feh is spawned with --bg-fill + the absolute wallpaperPath, env.DISPLAY=':1'
 *   - tint2 is spawned with env.DISPLAY=':1'
 *   - a fluxbox style file is written containing a LivOS token color
 *   - process.env.DISPLAY is NOT globally mutated (the Pitfall-1 invariant)
 *   - a missing binary (spawnFn throws) degrades non-fatally (no throw)
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

// RED: branded-shell.ts is unimplemented — this import is unresolved until
// plan 255-05 creates the module, which makes the whole suite error/fail.
import {bootBrandedShell} from '../branded-shell.js'

const WALLPAPER = '/opt/livos/packages/livinityd/source/modules/shell/assets/livos-wallpaper.png'

/** A fake child-process handle matching the subset bootBrandedShell uses. */
function fakeChild() {
	return {on: vi.fn(), once: vi.fn(), unref: vi.fn(), stderr: {on: vi.fn()}, kill: vi.fn(), pid: 123}
}

describe('bootBrandedShell — feh/tint2 argv + subprocess-scoped DISPLAY (RED until 255-05)', () => {
	let spawnFn: ReturnType<typeof vi.fn>
	let writeFileFn: ReturnType<typeof vi.fn>

	beforeEach(() => {
		spawnFn = vi.fn(() => fakeChild())
		writeFileFn = vi.fn()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('Test 1: spawns feh with --bg-fill + absolute wallpaperPath, env.DISPLAY===":1"', async () => {
		await bootBrandedShell({display: ':1', spawnFn, writeFileFn, wallpaperPath: WALLPAPER})

		const fehCall = spawnFn.mock.calls.find((c) => c[0] === 'feh')
		expect(fehCall, 'feh was not spawned').toBeTruthy()
		// args contain --bg-fill and the absolute wallpaper path
		const fehArgs = fehCall![1] as string[]
		expect(fehArgs).toContain('--bg-fill')
		expect(fehArgs).toContain(WALLPAPER)
		// env is subprocess-scoped (3rd arg .env.DISPLAY), NOT the global process.env
		expect((fehCall![2] as {env: {DISPLAY: string}}).env.DISPLAY).toBe(':1')
	})

	it('Test 2: spawns tint2 with env.DISPLAY===":1"', async () => {
		await bootBrandedShell({display: ':1', spawnFn, writeFileFn, wallpaperPath: WALLPAPER})

		const tint2Call = spawnFn.mock.calls.find((c) => c[0] === 'tint2')
		expect(tint2Call, 'tint2 was not spawned').toBeTruthy()
		expect((tint2Call![2] as {env: {DISPLAY: string}}).env.DISPLAY).toBe(':1')
	})

	it('Test 3: writes a fluxbox style file containing a LivOS token color', async () => {
		await bootBrandedShell({display: ':1', spawnFn, writeFileFn, wallpaperPath: WALLPAPER})

		expect(writeFileFn).toHaveBeenCalled()
		const styleCall = writeFileFn.mock.calls.find((c) =>
			/(styles|style|fluxbox)/i.test(String(c[0])),
		)
		expect(styleCall, 'no fluxbox style file written').toBeTruthy()
		const content = String(styleCall![1])
		// LivOS token colors from design-tokens (tokens.css dark palette).
		expect(content).toMatch(/#0a0a0c|#2563eb/i)
	})

	it('Test 4: does NOT mutate the global process.env.DISPLAY', async () => {
		const before = process.env.DISPLAY
		await bootBrandedShell({display: ':1', spawnFn, writeFileFn, wallpaperPath: WALLPAPER})
		expect(process.env.DISPLAY).toBe(before)
	})

	it('Test 5: a missing binary (spawnFn throws) degrades non-fatally', async () => {
		spawnFn.mockImplementation(() => {
			throw new Error('ENOENT: feh not found')
		})
		// Non-fatal: bootBrandedShell must resolve, not reject/throw.
		await expect(
			bootBrandedShell({display: ':1', spawnFn, writeFileFn, wallpaperPath: WALLPAPER}),
		).resolves.not.toThrow()
	})
})
