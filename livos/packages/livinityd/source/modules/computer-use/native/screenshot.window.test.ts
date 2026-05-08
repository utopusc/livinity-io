/**
 * Phase 97-01 — `captureScreenshot({windowId})` unit tests.
 *
 * Spec source: .planning/phases/97-auto-mode/97-PLAN.md task 97-01.
 *
 * Coverage (plan must-have list):
 *   T1 — No-windowId path: argv has no `-i`, host-display branch unchanged.
 *   T2 — windowId set: maim is called with `['-i', '<wid>', tempPath]`.
 *   T3 — Failure on bad windowId surfaces clear error mentioning the wid.
 *   T4 — Type signature is additive: existing zero-arg call still works.
 *
 * Mocks: `node:child_process.execFile` (so the real `maim` binary is never
 * invoked — Windows dev env has no X server) and `node:fs/promises`.
 */
import {describe, it, expect, vi, beforeEach} from 'vitest'

const mocks = vi.hoisted(() => ({
	execFileMock: vi.fn(),
	readFileMock: vi.fn<(path: string) => Promise<Buffer>>(),
	unlinkMock: vi.fn<(path: string) => Promise<void>>(),
}))

// `promisify(execFile)` is what screenshot.ts calls. The simplest mock is to
// replace `node:util.promisify` with one that just returns our mock for the
// execFile binding. Cleaner: mock `node:child_process.execFile` so the
// promisified wrapper still calls our spy. We do the latter — execFile takes
// a callback, so we adapt.
vi.mock('node:child_process', () => ({
	execFile: (cmd: string, args: string[], opts: unknown, cb: (err: Error | null, stdout?: string, stderr?: string) => void) => {
		// promisify(execFile) passes a node-style callback. Forward to the spy.
		const result = mocks.execFileMock(cmd, args, opts)
		Promise.resolve(result).then(
			(value: {stdout?: string; stderr?: string} | undefined) => cb(null, value?.stdout ?? '', value?.stderr ?? ''),
			(err: Error) => cb(err),
		)
	},
}))

vi.mock('node:fs/promises', () => ({
	readFile: mocks.readFileMock,
	unlink: mocks.unlinkMock,
}))

const {execFileMock, readFileMock, unlinkMock} = mocks

// Import SUT after mocks.
import {captureScreenshot} from './screenshot.js'

// PNG with valid 1920x1080 IHDR header. Pad with zeros so bytes >= 10000 to
// pass the host-display sanity guard (>=10_000 for default, >=2_000 windowed).
function makeFakePng(width: number, height: number, totalBytes: number): Buffer {
	const buf = Buffer.alloc(totalBytes)
	// PNG signature
	buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
	// IHDR chunk: 4-byte length (8) + 'IHDR' (4) + width (4) + height (4) + ...
	buf.writeUInt32BE(8, 8)
	buf.write('IHDR', 12, 'ascii')
	buf.writeUInt32BE(width, 16)
	buf.writeUInt32BE(height, 20)
	return buf
}

describe('captureScreenshot — windowId option (P97-01)', () => {
	beforeEach(() => {
		execFileMock.mockReset()
		readFileMock.mockReset()
		unlinkMock.mockReset()
		execFileMock.mockResolvedValue({stdout: '', stderr: ''})
		readFileMock.mockResolvedValue(makeFakePng(1920, 1080, 12_000))
		unlinkMock.mockResolvedValue(undefined)
	})

	it('T1: no windowId — argv has no `-i`, host-display branch unchanged', async () => {
		const result = await captureScreenshot()

		expect(result.width).toBe(1920)
		expect(result.height).toBe(1080)
		expect(result.mimeType).toBe('image/png')

		// First call is `maim` with [tempPath] only.
		expect(execFileMock).toHaveBeenCalledTimes(1)
		const [cmd, args] = execFileMock.mock.calls[0]!
		expect(cmd).toBe('maim')
		expect(Array.isArray(args)).toBe(true)
		expect(args).toHaveLength(1) // only tempPath, no -i
		expect(args[0]).toMatch(/\.png$/)
	})

	it('T2: windowId set — maim called with `-i <wid> <tempPath>`', async () => {
		// Window captures use a smaller threshold (>= 2000) to allow tiny
		// rendered windows. Provide a 4 KB PNG to confirm the threshold.
		readFileMock.mockResolvedValue(makeFakePng(800, 600, 4_000))

		const result = await captureScreenshot({windowId: 41943042})

		expect(result.width).toBe(800)
		expect(result.height).toBe(600)

		expect(execFileMock).toHaveBeenCalledTimes(1)
		const [cmd, args] = execFileMock.mock.calls[0]!
		expect(cmd).toBe('maim')
		expect(args[0]).toBe('-i')
		expect(args[1]).toBe('41943042')
		expect(args[2]).toMatch(/\.png$/)
	})

	it('T3: failure on bad windowId — surfaces error mentioning windowId', async () => {
		// maim primary fails; scrot fallback also fails so we hit the throw.
		execFileMock.mockImplementation(async (cmd: string) => {
			if (cmd === 'maim') {
				throw new Error('X Error: BadWindow')
			}
			throw new Error('spawn scrot ENOENT')
		})

		await expect(captureScreenshot({windowId: 99999999})).rejects.toThrow(/windowId=99999999/)
	})

	it('T4: type signature additive — zero-arg call still works (no breakage)', async () => {
		// Exists for compile-time + runtime confirmation that the new optional
		// signature does not break legacy callers like
		// `await captureScreenshot()` with no parens-content.
		const r = await captureScreenshot()
		expect(r.mimeType).toBe('image/png')
	})

	it('T5: undefined windowId — same as no argument; host-display path', async () => {
		const r = await captureScreenshot({windowId: undefined})
		expect(r.mimeType).toBe('image/png')
		const [, args] = execFileMock.mock.calls[0]!
		expect(args).toHaveLength(1)
	})
})
