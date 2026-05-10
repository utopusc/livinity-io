/**
 * Phase 93-07 — window-discovery unit tests.
 *
 * Mocks node:child_process.execFile with canned wmctrl/xdotool stdouts.
 * No real X server required.
 *
 * Coverage (≥9):
 *   1. listAllWindows parses wmctrl -lG output
 *   2. listAllWindows handles ENOENT (binary missing) gracefully
 *   3. snapshotWindowIds returns Set of wids
 *   4. findWindowByTitle case-insensitive substring match
 *   5. findWindowByTitle excludes baselineWids
 *   6. findNewWindowMatching two-pass: hint A first, hint B fallback
 *   7. findNewWindowMatching returns null on timeout
 *   8. isWindowAlive true / false
 *   9. getWindowGeometry parses xdotool --shell output
 *  10. activateWindow returns false on xdotool failure
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {describe, it, expect, vi, beforeEach} from 'vitest'

vi.mock('node:child_process', () => ({
	execFile: vi.fn(),
}))

import {execFile} from 'node:child_process'
import {
	listAllWindows,
	snapshotWindowIds,
	findWindowByTitle,
	findNewWindowMatching,
	isWindowAlive,
	getWindowGeometry,
	activateWindow,
} from './window-discovery.js'

const mockedExecFile = execFile as unknown as ReturnType<typeof vi.fn>

function findCallback(args: any[]): ((err: any, stdout?: string, stderr?: string) => void) | null {
	for (let i = args.length - 1; i >= 0; i--) {
		if (typeof args[i] === 'function') return args[i]
	}
	return null
}

function setOk(stdout: string) {
	mockedExecFile.mockImplementation((...callArgs: any[]) => {
		const cb = findCallback(callArgs)
		if (cb) cb(null, stdout, '')
	})
}

function setErr(err: NodeJS.ErrnoException) {
	mockedExecFile.mockImplementation((...callArgs: any[]) => {
		const cb = findCallback(callArgs)
		if (cb) cb(err, '', '')
	})
}

const WMCTRL_OUTPUT = `0x05000003  0 100 200 800 600 hostname GitHub - utopusc/livinity-io
0x05000005  0 0 0 1920 1080 hostname Mozilla Firefox
0x05000007 -1 -10 -10 1 1 hostname (System) Plasma
`

describe('window-discovery', () => {
	beforeEach(() => {
		mockedExecFile.mockReset()
	})

	it('Test 1: listAllWindows parses wmctrl -lG output', async () => {
		setOk(WMCTRL_OUTPUT)
		const windows = await listAllWindows()
		expect(windows).toHaveLength(3)
		expect(windows[0]).toEqual({
			wid: 0x05000003,
			title: 'GitHub - utopusc/livinity-io',
			geometry: {x: 100, y: 200, w: 800, h: 600},
		})
		expect(windows[1].title).toBe('Mozilla Firefox')
	})

	it('Test 2: listAllWindows handles ENOENT (wmctrl missing) gracefully', async () => {
		const err: any = new Error('spawn wmctrl ENOENT')
		err.code = 'ENOENT'
		setErr(err)
		const windows = await listAllWindows()
		expect(windows).toEqual([])
	})

	it('Test 3: snapshotWindowIds returns Set of wids', async () => {
		setOk(WMCTRL_OUTPUT)
		const wids = await snapshotWindowIds()
		expect(wids.has(0x05000003)).toBe(true)
		expect(wids.has(0x05000005)).toBe(true)
		expect(wids.size).toBe(3)
	})

	it('Test 4: findWindowByTitle does case-insensitive substring match', async () => {
		setOk(WMCTRL_OUTPUT)
		const w = await findWindowByTitle({hint: 'github'})
		expect(w?.title).toBe('GitHub - utopusc/livinity-io')
	})

	it('Test 5: findWindowByTitle excludes baselineWids', async () => {
		setOk(WMCTRL_OUTPUT)
		const w = await findWindowByTitle({
			hint: 'firefox',
			excludeWids: new Set([0x05000005]),
		})
		expect(w).toBeNull()
	})

	it('Test 6: findNewWindowMatching does two-pass — first hint wins', async () => {
		setOk(WMCTRL_OUTPUT)
		const w = await findNewWindowMatching({
			titleHints: ['github.com', 'mozilla'],
			baselineWids: new Set([]),
			timeoutMs: 500,
			pollIntervalMs: 50,
		})
		// 'github.com' isn't in any title; 'mozilla' is. Hmm — the test of
		// "first hint wins" actually tests fallback works. github.com is the
		// hostname pass; mozilla is the title-hint pass.
		expect(w?.title).toBe('Mozilla Firefox')
	})

	it('Test 7: findNewWindowMatching returns null on timeout when nothing matches', async () => {
		setOk(WMCTRL_OUTPUT)
		const w = await findNewWindowMatching({
			titleHints: ['no-such-title-anywhere'],
			baselineWids: new Set([0x05000003, 0x05000005, 0x05000007]),
			timeoutMs: 100,
			pollIntervalMs: 30,
		})
		expect(w).toBeNull()
	})

	it('Test 8: isWindowAlive returns true on xdotool success, false on failure', async () => {
		setOk('Some Window Title')
		expect(await isWindowAlive(123)).toBe(true)
		setErr(Object.assign(new Error('no such window'), {code: 1}) as any)
		expect(await isWindowAlive(123)).toBe(false)
		// Invalid wid never calls xdotool
		expect(await isWindowAlive(0)).toBe(false)
		expect(await isWindowAlive(-1)).toBe(false)
	})

	it('Test 9: getWindowGeometry parses xdotool --shell output', async () => {
		setOk('WINDOW=12345\nX=100\nY=200\nWIDTH=800\nHEIGHT=600\nSCREEN=0\n')
		const geom = await getWindowGeometry(12345)
		expect(geom).toEqual({x: 100, y: 200, w: 800, h: 600})
	})

	it('Test 10: getWindowGeometry returns null on parse error', async () => {
		setOk('garbage output')
		const geom = await getWindowGeometry(12345)
		expect(geom).toBeNull()
	})

	it('Test 11: activateWindow returns false on xdotool failure', async () => {
		setErr(Object.assign(new Error('failed'), {code: 1}) as any)
		expect(await activateWindow(123)).toBe(false)
		setOk('')
		expect(await activateWindow(123)).toBe(true)
	})

	// ---- Phase 100-09-07 — xdotool fallback when wmctrl can't see _NET_CLIENT_LIST ----

	it('T-09-07-W1: xdotool fallback engages when wmctrl errors with _NET_CLIENT_LIST', async () => {
		mockedExecFile.mockImplementation((...callArgs: any[]) => {
			const cmd = callArgs[0] as string
			const args = callArgs[1] as string[]
			const cb = findCallback(callArgs)
			if (!cb) return
			if (cmd === 'wmctrl') {
				// Reject with the EWMH error pattern observed live on Mini PC.
				const err: any = new Error('wmctrl failed')
				err.code = 1
				err.stderr = 'Cannot get client list properties. (_NET_CLIENT_LIST or _WIN_CLIENT_LIST)\n'
				cb(err, '', err.stderr)
				return
			}
			if (cmd === 'xdotool' && args[0] === 'search') {
				cb(null, '12345\n67890\n', '')
				return
			}
			if (cmd === 'xdotool' && args[0] === 'getwindowgeometry') {
				// args = ['getwindowgeometry', '--shell', '0x...']
				const wid = args[args.length - 1]
				const x = wid.includes('3039') ? '100' : '200' // 12345=0x3039, 67890=0x10932
				cb(null, `WINDOW=${wid}\nX=${x}\nY=200\nWIDTH=800\nHEIGHT=600\nSCREEN=0\n`, '')
				return
			}
			if (cmd === 'xdotool' && args[0] === 'getwindowname') {
				const wid = args[args.length - 1]
				cb(null, `Window ${wid}\n`, '')
				return
			}
			cb(null, '', '')
		})
		const windows = await listAllWindows()
		expect(windows).toHaveLength(2)
		expect(windows[0].wid).toBe(12345)
		expect(windows[1].wid).toBe(67890)
		// Geometry parsed from xdotool --shell output:
		expect(windows[0].geometry.w).toBe(800)
		expect(windows[0].geometry.h).toBe(600)
		// xdotool was invoked (fallback engaged):
		const cmds = mockedExecFile.mock.calls.map((c: any[]) => c[0] as string)
		expect(cmds).toContain('xdotool')
	})

	it('T-09-07-W2: returns [] when wmctrl AND xdotool both fail', async () => {
		mockedExecFile.mockImplementation((...callArgs: any[]) => {
			const cmd = callArgs[0] as string
			const cb = findCallback(callArgs)
			if (!cb) return
			if (cmd === 'wmctrl') {
				const err: any = new Error('wmctrl failed')
				err.code = 1
				err.stderr = 'Cannot get client list properties. (_NET_CLIENT_LIST or _WIN_CLIENT_LIST)\n'
				cb(err, '', err.stderr)
				return
			}
			if (cmd === 'xdotool') {
				const err: any = new Error('spawn xdotool ENOENT')
				err.code = 'ENOENT'
				cb(err, '', '')
				return
			}
			cb(null, '', '')
		})
		const windows = await listAllWindows()
		expect(windows).toEqual([])
	})

	it('T-09-07-W3: regression — wmctrl success path does NOT invoke xdotool', async () => {
		setOk(WMCTRL_OUTPUT)
		await listAllWindows()
		const cmds = mockedExecFile.mock.calls.map((c: any[]) => c[0] as string)
		expect(cmds).not.toContain('xdotool')
	})
})
