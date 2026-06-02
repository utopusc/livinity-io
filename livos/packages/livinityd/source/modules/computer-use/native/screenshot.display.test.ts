/**
 * Phase 255-02 (Wave 1 GREEN, Task 1) — captureScreenshot({display})
 * subprocess-scoped DISPLAY env.
 *
 * Contract under test (threat_model T-255-04, Pitfall 1):
 *   - When `options.display` is set, the DISPLAY env var MUST be threaded into
 *     the maim (primary) subprocess `env` ONLY — never written to the global
 *     `process.env.DISPLAY`. This keeps the ~2s concurrent displays-popover
 *     polls concurrency-safe: user A's poll for `:11` cannot leak user B's
 *     screen because no shared global is mutated.
 *   - The scrot fallback path applies the IDENTICAL env override.
 *
 * Strategy: mock `node:child_process` execFile and capture the 3rd-arg options
 * object's `env.DISPLAY`. We force the maim path to "fail the size guard" by
 * returning a tiny buffer from readFile so the scrot fallback also fires and we
 * can assert its env too. We also assert `process.env.DISPLAY` is unchanged
 * before/after the call.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

// Capture the env passed to each subprocess invocation, keyed by binary.
const capturedEnv: Record<string, NodeJS.ProcessEnv | undefined> = {}

vi.mock('node:child_process', () => {
	return {
		// promisify(execFile) calls execFile(file, args, options, callback).
		execFile: vi.fn(
			(
				file: string,
				_args: readonly string[],
				options: {env?: NodeJS.ProcessEnv},
				callback: (err: Error | null, res: {stdout: string; stderr: string}) => void,
			) => {
				capturedEnv[file] = options?.env
				// Always "succeed" — the size guard on the read buffer decides whether
				// maim's output is accepted or we fall through to scrot.
				callback(null, {stdout: '', stderr: ''})
			},
		),
	}
})

// Return a deliberately tiny buffer so the maim size-guard fails (< 10 KB host
// threshold) and the scrot fallback also runs — letting us assert BOTH envs.
// The fallback readFile (after scrot) returns a minimally-valid PNG header so
// parsePngResult doesn't blow up reading IHDR width/height.
const tinyPng = (() => {
	const b = Buffer.alloc(64)
	b.writeUInt32BE(1280, 16) // IHDR width
	b.writeUInt32BE(720, 20) // IHDR height
	return b
})()

vi.mock('node:fs/promises', () => ({
	readFile: vi.fn().mockResolvedValue(tinyPng),
	unlink: vi.fn().mockResolvedValue(undefined),
}))

describe('captureScreenshot({display}) — subprocess-scoped DISPLAY', () => {
	beforeEach(() => {
		capturedEnv.maim = undefined
		capturedEnv.scrot = undefined
		delete process.env.DISPLAY
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	it('threads DISPLAY into the maim subprocess env when {display} is provided', async () => {
		// Force the PNG passthrough fast-path so we don't depend on sharp in CI.
		process.env.LUSE_SCREENSHOT_FORMAT = 'png'
		process.env.LUSE_SCREENSHOT_MAX_DIM = '0'
		// Re-import after env set so the module-level format constants pick it up.
		vi.resetModules()
		const {captureScreenshot} = await import('./screenshot.js')

		await captureScreenshot({display: ':11'})

		expect(capturedEnv.maim?.DISPLAY).toBe(':11')
	})

	it('threads DISPLAY into the scrot fallback subprocess env too', async () => {
		process.env.LUSE_SCREENSHOT_FORMAT = 'png'
		process.env.LUSE_SCREENSHOT_MAX_DIM = '0'
		vi.resetModules()
		const {captureScreenshot} = await import('./screenshot.js')

		await captureScreenshot({display: ':12'})

		// maim's tiny buffer fails the size guard → scrot fallback fires.
		expect(capturedEnv.scrot?.DISPLAY).toBe(':12')
	})

	it('NEVER mutates the global process.env.DISPLAY (Pitfall 1 / T-255-04)', async () => {
		process.env.LUSE_SCREENSHOT_FORMAT = 'png'
		process.env.LUSE_SCREENSHOT_MAX_DIM = '0'
		vi.resetModules()
		const {captureScreenshot} = await import('./screenshot.js')

		const before = process.env.DISPLAY // undefined (cleared in beforeEach)
		await captureScreenshot({display: ':13'})
		expect(process.env.DISPLAY).toBe(before)
	})

	it('leaves env as process.env (no DISPLAY) when {display} is omitted', async () => {
		process.env.LUSE_SCREENSHOT_FORMAT = 'png'
		process.env.LUSE_SCREENSHOT_MAX_DIM = '0'
		vi.resetModules()
		const {captureScreenshot} = await import('./screenshot.js')

		await captureScreenshot()

		// No display override → env is the unmodified process.env (DISPLAY unset).
		expect(capturedEnv.maim?.DISPLAY).toBeUndefined()
	})
})
