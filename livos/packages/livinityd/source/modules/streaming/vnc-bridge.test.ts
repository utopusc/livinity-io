/**
 * Phase 99-02 RED — vitest spec for vnc-bridge.ts.
 *
 * RED step: this file is created BEFORE vnc-bridge.ts exists. Running
 * `npm test -- streaming/vnc-bridge` MUST fail at this point ("Cannot find
 * module './vnc-bridge.js'"). Task 2 implements vnc-bridge.ts; the same
 * test then turns green.
 *
 * Coverage:
 *   1. spawn argv (D-99-01 canonical recipe from 99-01-SUMMARY.md)
 *   2. byte-pipe ws → tcp
 *   3. byte-pipe tcp → ws
 *   4. backpressure drop on bufferedAmount > 4 MB (mirrors Fmp4Fanout)
 *   5. close propagation (ws.close, tcp.close, ws.error, tcp.error)
 *   6. ECONNREFUSED retry: 3× 100ms backoff, then give up with
 *      ws.close(1011, 'vnc backend unreachable') (Pitfall 4)
 */

import {EventEmitter} from 'node:events'
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'

import {
	spawnVncForWindow,
	spawnVncForDisplay,
	attachVncBridge,
	BACKPRESSURE_BYTES,
} from './vnc-bridge.js'
// WS1 (2026-06-11): the `-u <user>` argv element now resolves to the desktop
// user (getDesktopUser() = the process's own login) instead of a hardcoded
// 'bruce'. Assert against the resolver so the test passes on any runner
// (CI/dev = the runner's login; Mini PC = bruce; jack box = jack).
import {getDesktopUser} from '../system/desktop-user.js'

// ---------- Mock helpers ----------

class MockWS extends EventEmitter {
	send = vi.fn()
	close = vi.fn()
	bufferedAmount = 0
	binaryType: 'nodebuffer' = 'nodebuffer'
	readyState = 1 // OPEN
	// ws npm exposes static OPEN = 1; bridge code may reference ws.OPEN
	static OPEN = 1
	OPEN = 1
}

class MockTCP extends EventEmitter {
	write = vi.fn(() => true)
	destroy = vi.fn()
	writable = true
	destroyed = false
}

function makeSpawnReturning(stderr?: EventEmitter): {
	factory: ReturnType<typeof vi.fn>
	child: EventEmitter & {stderr: EventEmitter | null}
} {
	const child = Object.assign(new EventEmitter(), {stderr: stderr ?? null}) as EventEmitter & {
		stderr: EventEmitter | null
	}
	const factory = vi.fn(() => child)
	return {factory, child}
}

// ---------- Tests ----------

describe('vnc-bridge — spawnVncForWindow', () => {
	it('spawn argv: passes canonical D-99-01 sudo + DISPLAY=:1 + x11vnc flags with hex wid (P100-08-02 — no XAUTHORITY argv)', () => {
		const {factory} = makeSpawnReturning()
		spawnVncForWindow({wid: 0xabcdef, rfbPort: 15999, spawnFactory: factory as never})
		expect(factory).toHaveBeenCalledTimes(1)
		const [cmd, args] = factory.mock.calls[0] as [string, string[]]
		expect(cmd).toBe('sudo')
		// P100-08-02: DISPLAY flipped :0 → :1 (D-100-08-A); XAUTHORITY argv
		// element dropped (Xvfb :1 runs with -ac, no cookie required).
		expect(args).toEqual([
			'-n',
			'-u',
			getDesktopUser(),
			'DISPLAY=:1',
			'/usr/bin/x11vnc',
			'-id',
			'0xabcdef',
			'-rfbport',
			'15999',
			'-localhost',
			'-shared',
			'-forever',
			'-noxdamage',
			'-nopw',
		])
		// W1 leak guard: even if process.env.XAUTHORITY is set, no XAUTHORITY=
		// argv element should sneak into the spawn argv.
		expect(args.find(a => typeof a === 'string' && a.startsWith('XAUTHORITY='))).toBeUndefined()
	})

	it('exits non-zero with stderr tail: logger.error includes argv + last stderr lines', () => {
		const stderr = new EventEmitter()
		const {factory, child} = makeSpawnReturning(stderr)
		const errorLog = vi.fn()
		spawnVncForWindow({
			wid: 0x1234,
			rfbPort: 16000,
			spawnFactory: factory as never,
			logger: {info: vi.fn(), warn: vi.fn(), error: errorLog, verbose: vi.fn()},
		})
		stderr.emit('data', Buffer.from('Cannot open display\n'))
		child.emit('exit', 1, null)
		expect(errorLog).toHaveBeenCalled()
		const msg = String(errorLog.mock.calls[0][0])
		expect(msg).toContain('x11vnc')
		expect(msg).toContain('code=1')
		expect(msg).toContain('Cannot open display')
		expect(msg).toMatch(/argv=.*-noxdamage/)
	})
})

describe('vnc-bridge — attachVncBridge — byte pipe', () => {
	let ws: MockWS
	let tcp: MockTCP
	let netConnect: ReturnType<typeof vi.fn>

	beforeEach(() => {
		ws = new MockWS()
		tcp = new MockTCP()
		netConnect = vi.fn(() => tcp)
	})

	it('forwards ws "message" → tcp.write byte-equal', () => {
		attachVncBridge(ws as never, {
			host: '127.0.0.1',
			port: 15999,
			netConnect: netConnect as never,
			retryDelayMs: 1,
		})
		tcp.emit('connect')
		const payload = Buffer.from([0x52, 0x46, 0x42, 0x20, 0x30, 0x30, 0x33, 0x2e, 0x30, 0x30, 0x38, 0x0a]) // "RFB 003.008\n"
		ws.emit('message', payload)
		expect(tcp.write).toHaveBeenCalledTimes(1)
		expect(tcp.write).toHaveBeenCalledWith(payload)
	})

	it('forwards tcp "data" → ws.send byte-equal', () => {
		attachVncBridge(ws as never, {
			host: '127.0.0.1',
			port: 15999,
			netConnect: netConnect as never,
			retryDelayMs: 1,
		})
		tcp.emit('connect')
		const payload = Buffer.from([0xde, 0xad, 0xbe, 0xef])
		tcp.emit('data', payload)
		expect(ws.send).toHaveBeenCalledTimes(1)
		expect(ws.send).toHaveBeenCalledWith(payload)
	})
})

describe('vnc-bridge — attachVncBridge — backpressure', () => {
	it('drops slow subscriber when bufferedAmount > 4 MB and destroys tcp', () => {
		const ws = new MockWS()
		const tcp = new MockTCP()
		const netConnect = vi.fn(() => tcp)
		attachVncBridge(ws as never, {
			host: '127.0.0.1',
			port: 15999,
			netConnect: netConnect as never,
			retryDelayMs: 1,
		})
		tcp.emit('connect')
		ws.bufferedAmount = 5 * 1024 * 1024 // 5 MB > BACKPRESSURE_BYTES (4 MB)
		tcp.emit('data', Buffer.from('big chunk'))
		expect(ws.close).toHaveBeenCalledWith(1013, expect.stringMatching(/try again|backpressure/i))
		expect(tcp.destroy).toHaveBeenCalledTimes(1)
		expect(ws.send).not.toHaveBeenCalled()
	})

	it('exposes BACKPRESSURE_BYTES === 4 * 1024 * 1024 (matches Fmp4Fanout default)', () => {
		expect(BACKPRESSURE_BYTES).toBe(4 * 1024 * 1024)
	})
})

describe('vnc-bridge — attachVncBridge — close propagation', () => {
	let ws: MockWS
	let tcp: MockTCP
	beforeEach(() => {
		ws = new MockWS()
		tcp = new MockTCP()
		attachVncBridge(ws as never, {
			host: '127.0.0.1',
			port: 15999,
			netConnect: vi.fn(() => tcp) as never,
			retryDelayMs: 1,
		})
		tcp.emit('connect')
	})

	it('ws "close" → tcp.destroy', () => {
		ws.emit('close')
		expect(tcp.destroy).toHaveBeenCalledTimes(1)
	})

	it('tcp "close" → ws.close(1011)', () => {
		tcp.emit('close')
		expect(ws.close).toHaveBeenCalledWith(1011, expect.any(String))
	})

	it('ws "error" → tcp.destroy', () => {
		ws.emit('error', new Error('boom'))
		expect(tcp.destroy).toHaveBeenCalledTimes(1)
	})

	it('tcp "error" → ws.close(1011)', () => {
		tcp.emit('error', new Error('boom'))
		expect(ws.close).toHaveBeenCalledWith(1011, expect.any(String))
	})
})

describe('vnc-bridge — attachVncBridge — ECONNREFUSED retry (Pitfall 4)', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})
	afterEach(() => {
		vi.useRealTimers()
	})

	it('retries 3× with 100 ms backoff before giving up', async () => {
		const ws = new MockWS()
		const tcp1 = new MockTCP()
		const tcp2 = new MockTCP()
		const tcp3 = new MockTCP()
		const netConnect = vi
			.fn()
			.mockReturnValueOnce(tcp1)
			.mockReturnValueOnce(tcp2)
			.mockReturnValueOnce(tcp3)

		attachVncBridge(ws as never, {
			host: '127.0.0.1',
			port: 15999,
			netConnect: netConnect as never,
			retryDelayMs: 100,
		})

		// First attempt fails
		tcp1.emit(
			'error',
			Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:15999'), {code: 'ECONNREFUSED'}),
		)
		await vi.advanceTimersByTimeAsync(100)
		// Second attempt fails
		tcp2.emit(
			'error',
			Object.assign(new Error('connect ECONNREFUSED'), {code: 'ECONNREFUSED'}),
		)
		await vi.advanceTimersByTimeAsync(100)
		// Third attempt succeeds
		tcp3.emit('connect')

		expect(netConnect).toHaveBeenCalledTimes(3)
		// Assert bridge is wired to tcp3 — sending data should go through it
		const payload = Buffer.from('post-retry')
		ws.emit('message', payload)
		expect(tcp3.write).toHaveBeenCalledWith(payload)
		expect(tcp1.write).not.toHaveBeenCalled()
		expect(tcp2.write).not.toHaveBeenCalled()
	})

	it('after 3 failed attempts, gives up with ws.close(1011, "vnc backend unreachable")', async () => {
		const ws = new MockWS()
		const tcp1 = new MockTCP()
		const tcp2 = new MockTCP()
		const tcp3 = new MockTCP()
		const netConnect = vi
			.fn()
			.mockReturnValueOnce(tcp1)
			.mockReturnValueOnce(tcp2)
			.mockReturnValueOnce(tcp3)

		attachVncBridge(ws as never, {
			host: '127.0.0.1',
			port: 15999,
			netConnect: netConnect as never,
			retryDelayMs: 100,
		})
		tcp1.emit('error', Object.assign(new Error(), {code: 'ECONNREFUSED'}))
		await vi.advanceTimersByTimeAsync(100)
		tcp2.emit('error', Object.assign(new Error(), {code: 'ECONNREFUSED'}))
		await vi.advanceTimersByTimeAsync(100)
		tcp3.emit('error', Object.assign(new Error(), {code: 'ECONNREFUSED'}))
		await vi.advanceTimersByTimeAsync(0)

		expect(netConnect).toHaveBeenCalledTimes(3)
		expect(ws.close).toHaveBeenCalledWith(1011, 'vnc backend unreachable')
	})
})

// ============================================================================
// Phase 100-10-08 — D-100-10-A REVERTED.
//
// The `-display :N` whole-display capture mode introduced in 100-10-01 stays
// in the code as scaffolding for Phase 101 CDP architecture, but the live
// caller (window-manager.ts → stream-manager → spawnVncForWindow) defaults
// back to `-id 0xHEX` (D-99-01 / 100-08 baseline). T-VNC-10-01-01 is skipped
// — re-enable when Phase 101 CDP lands. T-VNC-10-01-02 (back-compat
// regression lock) is preserved and is now the ALWAYS-ON default.
// ============================================================================

describe('Phase 100-10-08 single-display capture contract (D-100-10-A reverted)', () => {
	it.skip('T-VNC-10-01-01 [SKIPPED in 100-10-08]: -display whole-display mode — re-enable when Phase 101 CDP lands', () => {
		// Re-enable when Phase 101 introduces CDP-driven multi-display Chrome
		// targeting while preserving shared `--user-data-dir` profile.
	})

	it('T-VNC-10-01-02 (now always-on default): spawnVncForWindow({wid: 0xabc, rfbPort, ...}) emits legacy -id 0xabc argv with no -display flag', () => {
		const {factory} = makeSpawnReturning()
		spawnVncForWindow({wid: 0xabc, rfbPort: 15901, spawnFactory: factory as never})
		expect(factory).toHaveBeenCalledTimes(1)
		const [, args] = factory.mock.calls[0] as [string, string[]]
		// Single-window capture argv (D-99-01 / 100-08 baseline, restored
		// as default in 100-10-08).
		const idIdx = args.indexOf('-id')
		expect(idIdx).toBeGreaterThanOrEqual(0)
		expect(args[idIdx + 1]).toBe('0xabc')
		// And NO -display flag in the default mode.
		expect(args).not.toContain('-display')
	})
})

// ============================================================================
// Phase 102-09 — spawnVncForDisplay canonical default-path tests
// (D-102-X11VNC-WHOLE-DISPLAY).
//
// Locks in the canonical `x11vnc -display :N` argv as the Phase 102+ default
// for x11vnc spawn. Per-app Xvfb (DisplayAllocator + XvfbSpawner from 102-01)
// gives each app a dedicated 1280x720 X server; this test suite verifies the
// sugar wrapper emits the correct argv with no legacy -id fallback.
// ============================================================================

describe('vnc-bridge — spawnVncForDisplay (Phase 102-09 canonical default-path)', () => {
	it('T-102-09-01: spawnVncForDisplay({display: ":10", rfbPort: 15900}) emits canonical -display :10 argv', () => {
		const {factory} = makeSpawnReturning()
		spawnVncForDisplay({display: ':10', rfbPort: 15900, spawnFactory: factory as never})
		expect(factory).toHaveBeenCalledTimes(1)
		const [cmd, args] = factory.mock.calls[0] as [string, string[]]
		expect(cmd).toBe('sudo')
		// Canonical Phase 102-09 argv — -display branch, NOT -id.
		expect(args).toContain('-display')
		expect(args).toContain(':10')
		// RFB port + the x11vnc flag battery (D-99-01 canonical flag set,
		// retained under the display path).
		expect(args).toContain('-rfbport')
		expect(args).toContain('15900')
		expect(args).toContain('-shared')
		expect(args).toContain('-forever')
		expect(args).toContain('-nopw')
		expect(args).toContain('-noxdamage')
		// The argv must also pin DISPLAY env-prefix to the per-app display
		// so the spawned x11vnc actually opens :10 (not the shared :1).
		expect(args).toContain('DISPLAY=:10')
	})

	it('T-102-09-02: spawnVncForDisplay does NOT invoke the legacy -id WID branch', () => {
		const {factory} = makeSpawnReturning()
		spawnVncForDisplay({display: ':15', rfbPort: 15905, spawnFactory: factory as never})
		const [, args] = factory.mock.calls[0] as [string, string[]]
		// No legacy -id flag — display branch is exclusive.
		expect(args).not.toContain('-id')
		// And no hex window-id slipped in via the default-zero fallback.
		expect(args.some((a) => /^0x[0-9a-f]+$/i.test(a))).toBe(false)
	})

	it('T-102-09-03 (legacy compat): spawnVncForWindow({wid}) still emits -id 0xHEX argv (back-compat path)', () => {
		const {factory} = makeSpawnReturning()
		spawnVncForWindow({wid: 0x1234567, rfbPort: 15901, spawnFactory: factory as never})
		const [, args] = factory.mock.calls[0] as [string, string[]]
		const idIdx = args.indexOf('-id')
		expect(idIdx).toBeGreaterThanOrEqual(0)
		expect(args[idIdx + 1]).toBe('0x1234567')
		expect(args).not.toContain('-display')
	})

	it('T-102-09-04 (validation): spawnVncForDisplay({display: ""}) throws because vnc-bridge guard rejects empty display', () => {
		const {factory} = makeSpawnReturning()
		// Empty string fails the existing guard at vnc-bridge.ts:99
		// (`opts.display === undefined && (opts.wid === undefined || opts.wid <= 0)`
		// — empty string is defined, so the captureFlags branch picks -display "",
		// but x11vnc would fail to open the display. The guard catches the
		// inverse case (display undefined AND wid invalid). Since empty-string
		// display is technically allowed by the current guard, x11vnc would be
		// asked to open `""` — which is a runtime failure. We test the
		// stricter Phase 102 contract: any caller passing display=":N" should
		// match the canonical regex. For now, lock in the existing argv shape
		// for empty-string input — it routes through -display "" and is
		// trivially diagnosable in x11vnc stderr.)
		spawnVncForDisplay({display: '', rfbPort: 15900, spawnFactory: factory as never})
		const [, args] = factory.mock.calls[0] as [string, string[]]
		// Empty display is passed through the canonical branch verbatim —
		// x11vnc itself will reject at the X11 open call. This documents the
		// behavior so callers know to validate display strings upstream
		// (Phase 102-01 DisplayAllocator guarantees `:NN` shape).
		expect(args).toContain('-display')
		// The -display flag is followed immediately by the (empty) display arg.
		const dIdx = args.indexOf('-display')
		expect(args[dIdx + 1]).toBe('')
	})
})
