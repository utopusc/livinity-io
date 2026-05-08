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

import {spawnVncForWindow, attachVncBridge, BACKPRESSURE_BYTES} from './vnc-bridge.js'

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
	it('spawn argv: passes canonical D-99-01 sudo + DISPLAY/XAUTHORITY + x11vnc flags with hex wid', () => {
		const {factory} = makeSpawnReturning()
		spawnVncForWindow({wid: 0xabcdef, rfbPort: 15999, spawnFactory: factory as never})
		expect(factory).toHaveBeenCalledTimes(1)
		const [cmd, args] = factory.mock.calls[0] as [string, string[]]
		expect(cmd).toBe('sudo')
		expect(args).toEqual([
			'-n',
			'-u',
			'bruce',
			'DISPLAY=:0',
			'XAUTHORITY=/run/user/1000/gdm/Xauthority',
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
