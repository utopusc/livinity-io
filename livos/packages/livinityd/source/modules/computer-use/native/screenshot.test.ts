/**
 * Phase 72-native-01 — captureScreenshot unit tests.
 *
 * Spec source: 72-native-01-PLAN.md `<task type="auto" tdd="true">` Task 2.
 *
 * Coverage (must-have list, plan behavior section):
 *   T1 — captureScreenshot is a function with arity 0.
 *   T2 — Happy path: mocked nut-js writes known PNG bytes; readFile returns
 *        them; captureScreenshot returns {base64, width: 1920, height: 1080,
 *        mimeType: 'image/png'}; unlink called with the path capture returned.
 *   T3 — Read failure: readFile throws → exception propagates AND unlink is
 *        STILL called (finally block).
 *   T4 — ENOENT-on-unlink swallowed: unlink throws {code: 'ENOENT'} → no
 *        exception bubbles, result returned normally.
 *   T5 — Non-ENOENT unlink errors are NOT swallowed (defensive — guards
 *        against masking permission/disk-full bugs at runtime).
 *
 * Mocks:
 *   - `@nut-tree-fork/nut-js`: stub `screen.capture/width/height` + FileType.PNG.
 *     Avoids actually invoking native screen capture during unit tests
 *     (Windows dev env has no X server; D-NATIVE-14).
 *   - `node:fs/promises` is selectively patched per-test via vi.spyOn so we
 *     can assert call arguments precisely.
 */
import {describe, it, expect, vi, beforeEach} from 'vitest'

// Hoisted mock state — vi.hoisted() ensures these vi.fn()s are constructed
// BEFORE vi.mock factories below run. (Plain top-level `const` would not work:
// vi.mock is hoisted to the very top of the file by vitest, so any reference
// to a const declared after the mock factory results in a TDZ ReferenceError.)
//
// We mock TWO modules:
//   1. `@nut-tree-fork/nut-js` — avoid invoking native screen capture during
//      unit tests (Windows dev env has no X server; D-NATIVE-14).
//   2. `node:fs/promises` — vi.spyOn cannot redefine ESM module exports
//      (they're non-configurable bindings); we have to vi.mock the whole module.
const mocks = vi.hoisted(() => ({
	captureMock: vi.fn<(filename: string, format: unknown, dir: string) => Promise<string>>(),
	widthMock: vi.fn<() => Promise<number>>(),
	heightMock: vi.fn<() => Promise<number>>(),
	readFileMock: vi.fn<(path: string) => Promise<Buffer>>(),
	unlinkMock: vi.fn<(path: string) => Promise<void>>(),
}))

vi.mock('@nut-tree-fork/nut-js', () => ({
	screen: {
		capture: mocks.captureMock,
		width: mocks.widthMock,
		height: mocks.heightMock,
	},
	FileType: {PNG: 'PNG'},
}))

vi.mock('node:fs/promises', () => ({
	readFile: mocks.readFileMock,
	unlink: mocks.unlinkMock,
}))

const {captureMock, widthMock, heightMock, readFileMock, unlinkMock} = mocks

// SUT — imported AFTER vi.mock above (top-of-file vi.mock is hoisted by vitest).
import {captureScreenshot} from './screenshot.js'

const KNOWN_PNG_BYTES = Buffer.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
])
const EXPECTED_BASE64 = KNOWN_PNG_BYTES.toString('base64')

describe('captureScreenshot', () => {
	beforeEach(() => {
		captureMock.mockReset()
		widthMock.mockReset()
		heightMock.mockReset()
		readFileMock.mockReset()
		unlinkMock.mockReset()

		// Default: capture returns a deterministic temp path; width/height set.
		captureMock.mockImplementation(async (filename, _format, dir) => {
			return `${dir}/${filename}.png`
		})
		widthMock.mockResolvedValue(1920)
		heightMock.mockResolvedValue(1080)
		readFileMock.mockResolvedValue(KNOWN_PNG_BYTES)
		unlinkMock.mockResolvedValue(undefined)
	})

	it('T1: is a function with arity 0', () => {
		expect(typeof captureScreenshot).toBe('function')
		expect(captureScreenshot.length).toBe(0)
	})

	it('T2: happy path returns base64 + width + height + mimeType; unlinks temp file', async () => {
		const result = await captureScreenshot()

		expect(result).toEqual({
			base64: EXPECTED_BASE64,
			width: 1920,
			height: 1080,
			mimeType: 'image/png',
		})

		// nut-js called with PNG enum + temp dir.
		expect(captureMock).toHaveBeenCalledTimes(1)
		const captureArgs = captureMock.mock.calls[0]
		expect(captureArgs[1]).toBe('PNG') // FileType.PNG mock
		expect(typeof captureArgs[0]).toBe('string') // filename (UUID-based)
		// crypto.randomUUID() shape: 8-4-4-4-12 hex chars
		expect(captureArgs[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)

		// readFile called with the path capture returned.
		expect(readFileMock).toHaveBeenCalledTimes(1)
		const expectedPath = await captureMock.mock.results[0].value
		expect(readFileMock.mock.calls[0][0]).toBe(expectedPath)

		// unlink called with same path.
		expect(unlinkMock).toHaveBeenCalledTimes(1)
		expect(unlinkMock.mock.calls[0][0]).toBe(expectedPath)
	})

	it('T3: when readFile throws, unlink is still called (finally block) and error propagates', async () => {
		readFileMock.mockRejectedValue(new Error('disk on fire'))

		await expect(captureScreenshot()).rejects.toThrow('disk on fire')

		expect(unlinkMock).toHaveBeenCalledTimes(1)
	})

	it('T4: ENOENT during unlink is swallowed; result returned normally', async () => {
		const enoent = Object.assign(new Error('ENOENT: no such file'), {code: 'ENOENT'})
		unlinkMock.mockRejectedValue(enoent)

		const result = await captureScreenshot()

		expect(result.base64).toBe(EXPECTED_BASE64)
		expect(result.width).toBe(1920)
		expect(result.height).toBe(1080)
		expect(result.mimeType).toBe('image/png')
	})

	it('T5: non-ENOENT unlink errors are NOT swallowed (defensive — surface real bugs)', async () => {
		const eperm = Object.assign(new Error('EPERM: operation not permitted'), {code: 'EPERM'})
		unlinkMock.mockRejectedValue(eperm)

		await expect(captureScreenshot()).rejects.toThrow(/EPERM/)
	})
})

/**
 * Phase 100-09-01 — hex wid argv assertion tests.
 *
 * These tests target the post-P79-04 / post-P79-05 implementation that uses
 * `execFile('maim', ...)` rather than nut-js. They mock `node:child_process`
 * to capture the argv passed to maim and assert on the `-i 0x<hex>` shape.
 *
 * The existing T1-T5 above predate the execFile rewrite and depend on the
 * legacy nut-js mocks; they are documented as broken in 100-08-04-SUMMARY
 * (out-of-scope here). This new describe block uses an isolated mock setup
 * that does NOT depend on nut-js so it runs cleanly on the current source.
 *
 * Spec: 100-09-01-PLAN.md Task 1.
 *   T-09-01-01 — windowId=0x4280002 → argv[0..1] = ['-i', '0x4280002'].
 *   T-09-01-02 — no opts → argv = [<tempPath>] (no `-i`, host-display path
 *                UNCHANGED — preserves host bytebot stream-desktop captures).
 *   T-09-01-03 — windowId=10597059 (0xa1b2c3) → argv contains `0xa1b2c3`,
 *                argv MUST NOT contain decimal `'10597059'`.
 */

// Hoisted mock state for execFile-based tests. These are NEW symbols that
// don't collide with the nut-js mocks above (which target a different module).
const execMocks = vi.hoisted(() => ({
	// Recorded calls — each test reads this to assert argv shape.
	recorded: [] as Array<{cmd: string; args: string[]}>,
	// execFile signature: (file, args?, options?, callback) — promisified to
	// (file, args?, options?). We mock the underlying callback form.
	execFileImpl: vi.fn<
		(
			cmd: string,
			args: string[],
			options: unknown,
			cb: (err: Error | null, stdout: string, stderr: string) => void,
		) => void
	>(),
	// Stub valid-PNG buffer (size > 10_000 to pass blackThreshold guard).
	// Header is real PNG signature + IHDR with width=1280, height=720 BE u32.
	stubPngBuffer: Buffer.alloc(0),
	// fs/promises mocks for the execFile path's readFile + unlink.
	readFile2: vi.fn<(path: string) => Promise<Buffer>>(),
	unlink2: vi.fn<(path: string) => Promise<void>>(),
}))

vi.mock('node:child_process', () => ({
	execFile: execMocks.execFileImpl,
}))

// NOTE: node:fs/promises is already mocked above for the nut-js suite. The
// `readFile`/`unlink` mocks declared in `mocks.readFileMock`/`mocks.unlinkMock`
// (which feed `vi.mock('node:fs/promises', ...)`) are SHARED — but the
// nut-js suite resets them in beforeEach and the new suite below resets them
// in its own beforeEach to a different impl. This is fine: vi.mock factories
// run once per file; per-test impls are switched via mockImplementation.

describe('captureScreenshot — Phase 100-09-01 hex wid argv (window-scoped capture)', () => {
	// 1280x720 PNG with valid IHDR + 12 KB body to pass blackThreshold (10_000)
	// and the 2_000 windowed threshold. We craft real PNG header bytes so
	// parsePngResult() at the end of captureScreenshot() returns sane width/height.
	function makeStubPng(): Buffer {
		const header = Buffer.from([
			0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
			0x00, 0x00, 0x00, 0x0d, // IHDR length = 13
			0x49, 0x48, 0x44, 0x52, // 'IHDR'
			0x00, 0x00, 0x05, 0x00, // width = 1280 (BE u32)
			0x00, 0x00, 0x02, 0xd0, // height = 720 (BE u32)
		])
		// Pad to 12 KB so byteLength > blackThreshold (10_000) for both windowed
		// (2_000) and host-display (10_000) capture paths.
		return Buffer.concat([header, Buffer.alloc(12_000, 0xff)])
	}

	beforeEach(() => {
		vi.clearAllMocks()
		execMocks.recorded.length = 0

		// Mock execFile: record argv, write stub PNG, invoke callback success.
		execMocks.execFileImpl.mockImplementation((cmd, args, _options, cb) => {
			execMocks.recorded.push({cmd, args: [...args]})
			// Don't actually write a file — readFile mock returns the stub buffer
			// regardless of path. Just invoke success callback.
			setImmediate(() => cb(null, '', ''))
		})

		// fs/promises mocks (shared with nut-js suite — re-stub for this suite).
		const stubBuf = makeStubPng()
		mocks.readFileMock.mockResolvedValue(stubBuf)
		mocks.unlinkMock.mockResolvedValue(undefined)
	})

	it('T-09-01-01: passes -i 0x<hex> to maim when windowId is 0x4280002', async () => {
		await captureScreenshot({windowId: 0x4280002})

		const maimCall = execMocks.recorded.find(c => c.cmd === 'maim')
		expect(maimCall).toBeDefined()
		expect(maimCall!.args[0]).toBe('-i')
		expect(maimCall!.args[1]).toBe('0x4280002')
		// tempPath at args[2] — randomized; assert structurally.
		expect(maimCall!.args[2]).toMatch(/\.png$/)
	})

	it('T-09-01-02: omits -i flag when windowId is not set (host-display path UNCHANGED)', async () => {
		await captureScreenshot()

		const maimCall = execMocks.recorded.find(c => c.cmd === 'maim')
		expect(maimCall).toBeDefined()
		expect(maimCall!.args[0]).not.toBe('-i')
		// Single-arg form: just the tempPath.
		expect(maimCall!.args).toHaveLength(1)
		expect(maimCall!.args[0]).toMatch(/\.png$/)
	})

	it('T-09-01-03: windowId=10597059 (decimal) → argv contains 0xa1b2c3 (hex)', async () => {
		await captureScreenshot({windowId: 10597059}) // 0xa1b2c3

		const maimCall = execMocks.recorded.find(c => c.cmd === 'maim')
		expect(maimCall).toBeDefined()
		expect(maimCall!.args).toContain('-i')
		expect(maimCall!.args).toContain('0xa1b2c3')
		// Negative assertion: decimal form must NOT appear in argv.
		expect(maimCall!.args).not.toContain('10597059')
	})
})
