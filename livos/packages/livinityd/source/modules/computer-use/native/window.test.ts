/**
 * Phase 72-native-03 — Window management + file-read native primitives tests.
 *
 * Spec source: 72-native-03-PLAN.md `<task type="auto" tdd="true">` Task 1.
 *
 * Coverage (8+ cases per plan must-have list):
 *   T1: All 3 named exports are functions with correct arities.
 *   T2: openOrFocus('firefox') open-detected path → spawns wmctrl -x -a firefox.Firefox.
 *   T3: openOrFocus('firefox') not-yet-open path → spawns firefox detached + DISPLAY=:0 + unref.
 *   T4: openOrFocus('1password') unsupported → returns isError without spawning.
 *   T5: openOrFocus('desktop') special-case → spawns wmctrl -k on.
 *   T6: listWindows() parses 2 valid wmctrl -lx lines → 2 entries.
 *   T7: listWindows() skips a malformed line + logs warn → 1 entry.
 *   T8: readFileBase64('/path/to/foo.png') with mocked fs → returns documented shape.
 *   T9: openOrFocus(<invalid string>) → runtime guard returns isError, no spawn.
 *
 * All system calls are mocked (vi.mock node:child_process + node:fs/promises).
 * No real wmctrl / firefox / fs read occurs during unit tests.
 */
import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'

// vi.mock factory: child_process spawn + exec
const spawnMock = vi.fn()
const execMock = vi.fn()

vi.mock('node:child_process', () => ({
	spawn: (...args: unknown[]) => spawnMock(...args),
	exec: (...args: unknown[]) => execMock(...args),
}))

const readFileMock = vi.fn()

vi.mock('node:fs/promises', () => ({
	readFile: (...args: unknown[]) => readFileMock(...args),
	default: {
		readFile: (...args: unknown[]) => readFileMock(...args),
	},
}))

// Helper: build a fake ChildProcess return for spawn
function fakeChild(): {unref: ReturnType<typeof vi.fn>} {
	return {unref: vi.fn()}
}

// Helper: simulate exec(cmd, callback) → callback(null, {stdout, stderr})
function execReturning(stdout: string, stderr = '') {
	return (cmd: string, cb: (err: Error | null, out: {stdout: string; stderr: string}) => void) => {
		// some callers may pass options as 2nd arg, callback as 3rd
		const callback = typeof cb === 'function' ? cb : (arguments[2] as typeof cb)
		void cmd
		setImmediate(() => callback(null, {stdout, stderr}))
		return {} as unknown
	}
}

beforeEach(() => {
	spawnMock.mockReset()
	execMock.mockReset()
	readFileMock.mockReset()
	// default: return a child with unref
	spawnMock.mockImplementation(() => fakeChild())
})

afterEach(() => {
	vi.restoreAllMocks()
})

describe('native/window — module shape', () => {
	it('T1: exports openOrFocus, listWindows, readFileBase64 as functions', async () => {
		const mod = await import('./window.js')
		expect(typeof mod.openOrFocus).toBe('function')
		expect(typeof mod.listWindows).toBe('function')
		expect(typeof mod.readFileBase64).toBe('function')
	})
})

describe('native/window — openOrFocus', () => {
	it('T2: firefox already open → spawns wmctrl -x -a firefox.Firefox (no detached launch)', async () => {
		// exec(wmctrl -lx) returns stdout containing firefox.Firefox class
		execMock.mockImplementation(
			execReturning(
				'0x01000003 -1 firefox.Firefox bruce-EQ Mozilla Firefox\n',
			),
		)
		const mod = await import('./window.js')
		const result = await mod.openOrFocus('firefox')
		expect(result.isError).toBe(false)
		// At least one spawn call with wmctrl -x -a firefox.Firefox in arg list
		const wmctrlActivate = spawnMock.mock.calls.find(call => {
			const [cmd, args] = call as [string, string[]]
			return (
				cmd === 'wmctrl' &&
				Array.isArray(args) &&
				args[0] === '-x' &&
				args[1] === '-a' &&
				args[2] === 'firefox.Firefox'
			)
		})
		expect(wmctrlActivate).toBeDefined()
		// Should NOT have spawned 'firefox' itself (the detached binary path)
		const firefoxLaunch = spawnMock.mock.calls.find(call => {
			const [cmd] = call as [string, string[]]
			return cmd === 'firefox'
		})
		expect(firefoxLaunch).toBeUndefined()
	})

	it('T3: firefox not yet open → spawns firefox detached, stdio:ignore, env DISPLAY=:0, child.unref called', async () => {
		execMock.mockImplementation(execReturning('')) // empty stdout → not running
		const child = fakeChild()
		spawnMock.mockReturnValueOnce(child) // first call: spawn firefox
		const mod = await import('./window.js')
		const result = await mod.openOrFocus('firefox')
		expect(result.isError).toBe(false)
		const firefoxLaunch = spawnMock.mock.calls.find(call => {
			const [cmd] = call as [string, string[]]
			return cmd === 'firefox'
		})
		expect(firefoxLaunch).toBeDefined()
		// Verify spawn options
		const opts = firefoxLaunch![2] as {detached: boolean; stdio: string; env: Record<string, string>}
		expect(opts.detached).toBe(true)
		expect(opts.stdio).toBe('ignore')
		expect(opts.env.DISPLAY).toBe(':0')
		// unref called on returned child
		expect(child.unref).toHaveBeenCalledTimes(1)
	})

	it('T4: 1password unsupported → returns isError, NO spawn', async () => {
		const mod = await import('./window.js')
		const result = await mod.openOrFocus('1password')
		expect(result.isError).toBe(true)
		expect(result.message).toMatch(/not installed.*1password/i)
		// No spawn whatsoever
		expect(spawnMock).not.toHaveBeenCalled()
	})

	it('T5: desktop special-case → spawns wmctrl -k on', async () => {
		const mod = await import('./window.js')
		const result = await mod.openOrFocus('desktop')
		expect(result.isError).toBe(false)
		const wmctrlDesktop = spawnMock.mock.calls.find(call => {
			const [cmd, args] = call as [string, string[]]
			return (
				cmd === 'wmctrl' &&
				Array.isArray(args) &&
				args[0] === '-k' &&
				args[1] === 'on'
			)
		})
		expect(wmctrlDesktop).toBeDefined()
	})

	it('T9: invalid app name (cast to bypass TS) → runtime guard returns isError, no spawn', async () => {
		const mod = await import('./window.js')
		const result = await (mod.openOrFocus as (a: string) => Promise<{isError: boolean; message?: string}>)(
			'totally-not-an-app',
		)
		expect(result.isError).toBe(true)
		expect(result.message).toMatch(/unknown application|invalid|not.*supported/i)
		expect(spawnMock).not.toHaveBeenCalled()
	})
})

describe('native/window — listWindows', () => {
	it('T6: parses 2 valid wmctrl -lx lines → 2 entries with id/class/title', async () => {
		const stdout =
			'0x01000003 -1 firefox.Firefox bruce-EQ Mozilla Firefox\n' +
			'0x02000005 -1 code.Code bruce-EQ Visual Studio Code - liv\n'
		execMock.mockImplementation(execReturning(stdout))
		const mod = await import('./window.js')
		const result = await mod.listWindows()
		expect(Array.isArray(result)).toBe(true)
		expect(result).toHaveLength(2)
		expect(result[0].id).toBe('0x01000003')
		expect(result[0].class).toBe('firefox.Firefox')
		expect(result[0].title).toBe('Mozilla Firefox')
		expect(result[1].id).toBe('0x02000005')
		expect(result[1].class).toBe('code.Code')
		expect(result[1].title).toBe('Visual Studio Code - liv')
	})

	it('T7: skips malformed line, returns valid entries, logs warn', async () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
		const stdout =
			'this-line-is-too-short\n' +
			'0x01000003 -1 firefox.Firefox bruce-EQ Mozilla Firefox\n'
		execMock.mockImplementation(execReturning(stdout))
		const mod = await import('./window.js')
		const result = await mod.listWindows()
		expect(result).toHaveLength(1)
		expect(result[0].class).toBe('firefox.Firefox')
		expect(warnSpy).toHaveBeenCalled()
		warnSpy.mockRestore()
	})
})

describe('native/window — readFileBase64', () => {
	it('T8: returns {base64, filename, size, mimeType} with PNG mime', async () => {
		const fakeBytes = Buffer.from('PNG_BYTES')
		readFileMock.mockResolvedValue(fakeBytes)
		const mod = await import('./window.js')
		const result = await mod.readFileBase64('/tmp/somewhere/foo.png')
		expect(result.base64).toBe(fakeBytes.toString('base64'))
		expect(result.filename).toBe('foo.png')
		expect(result.size).toBe(fakeBytes.length)
		expect(result.mimeType).toBe('image/png')
	})

	it('T8b: unknown extension falls back to application/octet-stream', async () => {
		const fakeBytes = Buffer.from('binary-payload')
		readFileMock.mockResolvedValue(fakeBytes)
		const mod = await import('./window.js')
		const result = await mod.readFileBase64('/tmp/somewhere/foo.unknownext')
		expect(result.mimeType).toBe('application/octet-stream')
		expect(result.filename).toBe('foo.unknownext')
		expect(result.size).toBe(fakeBytes.length)
	})

	it('T8c: text/plain inferred for .txt', async () => {
		const fakeBytes = Buffer.from('hello world')
		readFileMock.mockResolvedValue(fakeBytes)
		const mod = await import('./window.js')
		const result = await mod.readFileBase64('/tmp/notes.txt')
		expect(result.mimeType).toMatch(/^text\/plain/)
	})
})
