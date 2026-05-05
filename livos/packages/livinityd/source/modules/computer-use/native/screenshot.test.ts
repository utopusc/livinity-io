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
