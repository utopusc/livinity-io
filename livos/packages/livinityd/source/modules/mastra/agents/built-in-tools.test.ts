/**
 * Phase 200-C — built-in-tools unit tests.
 *
 * Coverage target: ≥12 cases (2 per Phase 200-C tool × 7 tools = 14
 * — happy-path + fallback/error for each). All shell invocations are
 * mocked via vi.mock('node:child_process') — tests never spawn real
 * xdotool, scrot, wmctrl, or xsel.
 *
 * Mock contract for `execFile` (callback form, promisify-compatible):
 *   - The mock is a vi.fn that delegates to a per-test handler registered
 *     via setExecFileHandler(handler). The handler receives (file, args)
 *     and returns either a value (→ resolved with {stdout, stderr}) or
 *     throws (→ callback receives the error so promisified call rejects).
 *
 * Mock contract for `exec` (callback form):
 *   - Similar — setExecHandler(handler) registers (command) → result|throw.
 */

import {EventEmitter} from 'node:events'
import {Readable, Writable} from 'node:stream'

import {beforeEach, describe, expect, test, vi} from 'vitest'

type ExecResult = {stdout: string | Buffer; stderr: string | Buffer}
type ExecHandler = (
	command: string,
	options: unknown,
) => ExecResult | Promise<ExecResult>
type ExecFileHandler = (
	file: string,
	args: ReadonlyArray<string>,
	options: unknown,
) => ExecResult | Promise<ExecResult>

let execHandler: ExecHandler = () => ({stdout: '', stderr: ''})
let execFileHandler: ExecFileHandler = () => ({stdout: '', stderr: ''})

function setExecHandler(h: ExecHandler) {
	execHandler = h
}
function setExecFileHandler(h: ExecFileHandler) {
	execFileHandler = h
}

vi.mock('node:child_process', () => {
	function makeChildStub(): EventEmitter & {stdin: Writable; stdout: Readable; stderr: Readable} {
		const ee = new EventEmitter() as EventEmitter & {
			stdin: Writable
			stdout: Readable
			stderr: Readable
		}
		ee.stdin = new Writable({
			write(_chunk, _enc, cb) {
				cb()
			},
		})
		ee.stdout = new Readable({read() {}})
		ee.stderr = new Readable({read() {}})
		return ee
	}

	function execMock(
		command: string,
		options: unknown,
		callback?: (err: Error | null, stdout: string | Buffer, stderr: string | Buffer) => void,
	) {
		const cb = typeof options === 'function' ? options : callback
		Promise.resolve()
			.then(() => execHandler(command, typeof options === 'function' ? {} : options))
			.then(
				(r) => cb?.(null, r.stdout, r.stderr),
				(err: Error) => cb?.(err, '', ''),
			)
		return makeChildStub()
	}

	function execFileMock(
		file: string,
		args: ReadonlyArray<string> | unknown,
		options?: unknown,
		callback?: (err: Error | null, stdout: string | Buffer, stderr: string | Buffer) => void,
	) {
		// execFile arg overloads: (file, [args], [options], [cb]) — find the cb.
		let realArgs: ReadonlyArray<string> = []
		let realOptions: unknown = {}
		let cb: typeof callback | undefined
		if (Array.isArray(args)) realArgs = args as ReadonlyArray<string>
		if (typeof args === 'function') cb = args as never
		if (typeof options === 'function') cb = options as never
		else if (options !== undefined) realOptions = options
		if (typeof callback === 'function') cb = callback

		const child = makeChildStub()
		Promise.resolve()
			.then(() => execFileHandler(file, realArgs, realOptions))
			.then(
				(r) => cb?.(null, r.stdout, r.stderr),
				(err: Error) => cb?.(err, '', ''),
			)
		return child
	}

	return {exec: execMock, execFile: execFileMock}
})

vi.mock('node:fs/promises', () => ({
	readFile: vi.fn(async () => Buffer.from([0x89, 0x50, 0x4e, 0x47])), // "PNG" magic
	unlink: vi.fn(async () => undefined),
}))

const {builtInTools} = await import('./built-in-tools.js')

function run(toolId: string, input: Record<string, unknown> = {}) {
	const tool = (builtInTools as Record<string, {execute: (a: unknown) => Promise<unknown>}>)[
		toolId
	]
	if (!tool) throw new Error(`tool ${toolId} not registered in builtInTools`)
	return tool.execute({context: input})
}

beforeEach(() => {
	execHandler = () => ({stdout: '', stderr: ''})
	execFileHandler = () => ({stdout: '', stderr: ''})
})

// ─── luse_computer_screenshot ─────────────────────────────────────────

describe('luse_computer_screenshot', () => {
	test('happy path: scrot succeeds → returns dataUrl + base64 + mimeType', async () => {
		let scrotCalled = false
		setExecHandler((cmd) => {
			if (cmd.startsWith('scrot ')) {
				scrotCalled = true
				return {stdout: '', stderr: ''}
			}
			throw new Error('unexpected command')
		})
		const r = (await run('luse_computer_screenshot')) as {
			dataUrl: string
			base64: string
			mimeType: string
		}
		expect(scrotCalled).toBe(true)
		expect(r.mimeType).toBe('image/png')
		expect(r.dataUrl.startsWith('data:image/png;base64,')).toBe(true)
		expect(r.base64.length).toBeGreaterThan(0)
	})

	test('fallback: scrot missing → falls back to ImageMagick import', async () => {
		let importCalled = false
		setExecHandler((cmd) => {
			if (cmd.startsWith('scrot ')) throw new Error('scrot: command not found')
			if (cmd.startsWith('import ')) {
				importCalled = true
				return {stdout: '', stderr: ''}
			}
			throw new Error('unexpected command: ' + cmd)
		})
		const r = (await run('luse_computer_screenshot')) as {dataUrl: string}
		expect(importCalled).toBe(true)
		expect(r.dataUrl.startsWith('data:image/png;base64,')).toBe(true)
	})
})
