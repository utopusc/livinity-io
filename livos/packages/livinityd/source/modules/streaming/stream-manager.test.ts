/**
 * Phase 93-05 — StreamManager unit tests.
 *
 * Coverage (≥9 acceptance):
 *   1. start happy path: returns {streamId, wsUrl}, encoder spawned, alive
 *   2. idempotent re-start: same (userId, mode, target) returns existing
 *   3. stop SIGTERM → SIGKILL escalation (fake timers)
 *   4. crash detection — non-zero exit while not stop-requested → status=crashed
 *   5. listStreams filters by userId
 *   6. cap exceeded throws STREAM_CAP_EXCEEDED
 *   7. subscriber count round-trips
 *   8. mode='desktop' uses ffmpeg argv
 *   9. mode='pipewire-fd' uses gst-launch-1.0 argv
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {EventEmitter} from 'node:events'
import {StreamManager, StreamCapExceededError} from './stream-manager.js'
import {PortAllocator} from './port-allocator.js'

// FakeChildProcess — minimal subset of node:child_process.ChildProcess we need
class FakeChildProcess extends EventEmitter {
	stdout = new EventEmitter() as any
	stderr = new EventEmitter() as any
	killed = false
	signals: string[] = []
	kill(signal: string = 'SIGTERM'): boolean {
		this.signals.push(signal)
		this.killed = true
		// Mimic real Node: synchronous SIGTERM doesn't necessarily exit; tests
		// drive the exit event manually OR rely on the SIGKILL timer.
		return true
	}
	exit(code: number, signal: string | null = null) {
		this.emit('exit', code, signal)
	}
}

const NO_VAAPI = {vaapi: false, profiles: []}
const HAS_VAAPI = {vaapi: true, profiles: ['VAProfileH264High']}

function makeManager(opts?: Partial<Parameters<typeof StreamManager.prototype.constructor>[0]>) {
	const spawned: {cmd: string; args: string[]; child: FakeChildProcess}[] = []
	const child = new FakeChildProcess()
	const spawn = vi.fn((cmd: string, args: string[]) => {
		const c = new FakeChildProcess()
		spawned.push({cmd, args, child: c})
		return c as any
	})
	const logger = {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		verbose: vi.fn(),
	}
	const mgr = new StreamManager({
		caps: NO_VAAPI,
		spawn,
		logger,
		stopTimeoutMs: 200,
		...(opts ?? {}),
	} as any)
	return {mgr, spawn, spawned, logger}
}

describe('StreamManager', () => {
	beforeEach(() => {
		vi.useRealTimers()
	})
	afterEach(() => {
		vi.useRealTimers()
	})

	it('Test 1: startStream returns {streamId, wsUrl} and spawns encoder', () => {
		const {mgr, spawn, spawned} = makeManager()
		const result = mgr.startStream({
			userId: 'u1',
			mode: 'desktop',
			target: {display: ':0.0', width: 1920, height: 1080},
		})
		expect(result.streamId).toMatch(/^[0-9a-f-]{36}$/)
		expect(result.wsUrl).toBe(`/ws/stream/${result.streamId}`)
		expect(spawn).toHaveBeenCalledOnce()
		expect(spawned[0].cmd).toBe('ffmpeg')

		const list = mgr.listStreams({userId: 'u1'})
		expect(list).toHaveLength(1)
		expect(list[0].status).toBe('alive')
		mgr._clearForTests()
	})

	it('Test 2: idempotent re-start — same (userId, mode, target) returns existing', () => {
		const {mgr, spawn} = makeManager()
		const a = mgr.startStream({
			userId: 'u1',
			mode: 'desktop',
			target: {display: ':0.0', width: 1920, height: 1080},
		})
		const b = mgr.startStream({
			userId: 'u1',
			mode: 'desktop',
			target: {display: ':0.0', width: 1920, height: 1080},
		})
		expect(a.streamId).toBe(b.streamId)
		expect(spawn).toHaveBeenCalledTimes(1)
		mgr._clearForTests()
	})

	it('Test 3: stopStream sends SIGTERM, escalates to SIGKILL after timeout', async () => {
		const {mgr, spawned} = makeManager({stopTimeoutMs: 50})
		const r = mgr.startStream({
			userId: 'u1',
			mode: 'desktop',
			target: {display: ':0.0', width: 1920, height: 1080},
		})
		const child = spawned[0].child
		// Start stop — child does NOT exit on SIGTERM, forcing escalation
		const stopPromise = mgr.stopStream(r.streamId)
		// Wait briefly to let SIGTERM be sent
		await new Promise((resolve) => setTimeout(resolve, 10))
		expect(child.signals).toContain('SIGTERM')
		// Wait for the escalation timer
		await new Promise((resolve) => setTimeout(resolve, 100))
		expect(child.signals).toContain('SIGKILL')
		// Now simulate the child finally exiting
		child.exit(137, 'SIGKILL')
		const stopResult = await stopPromise
		expect(stopResult.stopped).toBe(true)
		expect(mgr.listStreams({userId: 'u1'})).toHaveLength(0)
	})

	it('Test 4: encoder crash (non-zero exit while not stopRequested) → status=crashed + emit', async () => {
		const {mgr, spawned} = makeManager()
		const crashSpy = vi.fn()
		mgr.on('crash', crashSpy)
		const r = mgr.startStream({
			userId: 'u1',
			mode: 'desktop',
			target: {display: ':0.0', width: 1280, height: 720},
		})
		const child = spawned[0].child
		child.exit(1, null)
		// give microtasks a chance
		await Promise.resolve()
		expect(crashSpy).toHaveBeenCalledWith({streamId: r.streamId, code: 1, signal: null})
		const list = mgr.listStreams({userId: 'u1'})
		expect(list).toHaveLength(1)
		expect(list[0].status).toBe('crashed')
		mgr._clearForTests()
	})

	it('Test 5: listStreams filters by userId', () => {
		const {mgr} = makeManager()
		mgr.startStream({
			userId: 'u1',
			mode: 'desktop',
			target: {display: ':0.0', width: 1920, height: 1080},
		})
		mgr.startStream({
			userId: 'u2',
			mode: 'desktop',
			target: {display: ':0.0', width: 1920, height: 1080},
		})
		expect(mgr.listStreams({userId: 'u1'})).toHaveLength(1)
		expect(mgr.listStreams({userId: 'u2'})).toHaveLength(1)
		expect(mgr.listStreams({userId: 'u3'})).toHaveLength(0)
		mgr._clearForTests()
	})

	it('Test 6: cap exceeded throws STREAM_CAP_EXCEEDED', () => {
		const {mgr} = makeManager() // cap=5 (no VAAPI)
		for (let i = 0; i < 5; i++) {
			mgr.startStream({
				userId: `u${i}`,
				mode: 'desktop',
				target: {display: ':0.0', width: 1920, height: 1080 + i},
			})
		}
		expect(() =>
			mgr.startStream({
				userId: 'overflow',
				mode: 'desktop',
				target: {display: ':0.0', width: 1920, height: 9999},
			}),
		).toThrow(StreamCapExceededError)
		expect(mgr.getCap()).toBe(5)

		// VAAPI cap is 10
		const {mgr: mgr2} = makeManager({caps: HAS_VAAPI} as any)
		expect(mgr2.getCap()).toBe(10)
		mgr._clearForTests()
		mgr2._clearForTests()
	})

	it('Test 7: subscriber count round-trips through listStreams', () => {
		const {mgr} = makeManager()
		const r = mgr.startStream({
			userId: 'u1',
			mode: 'desktop',
			target: {display: ':0.0', width: 1920, height: 1080},
		})
		const fakeWs = {sent: [], close: () => {}, send: () => {}, bufferedAmount: 0}
		mgr.addSubscriber(r.streamId, fakeWs as any)
		const list = mgr.listStreams({userId: 'u1'})
		expect(list[0].subscriberCount).toBe(1)
		mgr._clearForTests()
	})

	it('Test 8: mode=desktop uses ffmpeg argv', () => {
		const {mgr, spawned} = makeManager()
		mgr.startStream({
			userId: 'u1',
			mode: 'desktop',
			target: {display: ':0.0', width: 800, height: 600},
		})
		expect(spawned[0].cmd).toBe('ffmpeg')
		expect(spawned[0].args).toContain('x11grab')
		expect(spawned[0].args).toContain('800x600')
		mgr._clearForTests()
	})

	it('Test 9: mode=pipewire-fd uses gst-launch-1.0 argv', () => {
		const {mgr, spawned} = makeManager()
		mgr.startStream({
			userId: 'u1',
			mode: 'pipewire-fd',
			target: {pwNodeId: 42, fd: 7},
		})
		expect(spawned[0].cmd).toBe('gst-launch-1.0')
		expect(spawned[0].args).toContain('pipewiresrc')
		expect(spawned[0].args).toContain('path=42')
		expect(spawned[0].args).toContain('fd=7')
		mgr._clearForTests()
	})

	it('Test 10: VAAPI caps trigger h264_vaapi argv', () => {
		const {mgr, spawned} = makeManager({caps: HAS_VAAPI} as any)
		mgr.startStream({
			userId: 'u1',
			mode: 'desktop',
			target: {display: ':0.0', width: 1920, height: 1080},
		})
		expect(spawned[0].args).toContain('h264_vaapi')
		mgr._clearForTests()
	})
})

// ============================================================================
// Phase 99-03 — vnc-window mode tests (5 new cases)
// ============================================================================

function makeFakeX11vnc() {
	const proc: any = Object.assign(new EventEmitter(), {
		stdin: null,
		stdout: null,
		stderr: new EventEmitter(),
		killCalls: [] as string[],
		kill(sig: NodeJS.Signals = 'SIGTERM') {
			this.killCalls.push(sig as string)
			// Async exit so stopStream's await-promise resolves naturally
			setTimeout(() => this.emit('exit', 0, sig), 0)
			return true
		},
		pid: Math.floor(Math.random() * 100000),
	})
	return proc
}

function makeVncManager() {
	const spawned: {cmd: string; args: string[]; child: any}[] = []
	const spawn = vi.fn((cmd: string, args: string[]) => {
		const c = makeFakeX11vnc()
		spawned.push({cmd, args, child: c})
		return c as any
	})
	const mgr = new StreamManager({
		caps: NO_VAAPI as any,
		spawn: spawn as any,
		stopTimeoutMs: 50,
	} as any)
	return {mgr, spawn, spawned}
}

describe('StreamManager — vnc-window mode (Phase 99-03)', () => {
	it('Test 11: startStream({mode:"vnc-window"}) spawns x11vnc with canonical D-99-01 argv and registers kind:"vnc" session', () => {
		const {mgr, spawn} = makeVncManager()
		const {streamId, wsUrl} = mgr.startStream({
			userId: 'admin',
			mode: 'vnc-window' as any,
			target: {wid: 0xabcdef} as any,
		})
		expect(streamId).toMatch(/^[0-9a-f-]{36}$/)
		expect(wsUrl).toBe(`/ws/stream/${streamId}`)
		expect(spawn).toHaveBeenCalledTimes(1)
		const [cmd, args] = spawn.mock.calls[0] as [string, string[]]
		expect(cmd).toBe('sudo')
		expect(args).toContain('-id')
		expect(args).toContain('0xabcdef')
		expect(args).toContain('-localhost')
		expect(args).toContain('-noxdamage')
		expect(args).toContain('/usr/bin/x11vnc')
		const session = mgr.getSession(streamId)
		expect(session?.kind).toBe('vnc')
		if (session?.kind === 'vnc') {
			expect(session.wid).toBe(0xabcdef)
			expect(typeof session.rfbPort).toBe('number')
			expect(session.rfbPort).toBeGreaterThan(0)
		}
		mgr._clearForTests()
	})

	it('Test 12: stopStream({vnc-kind}) SIGTERMs x11vnc and removes session from map', async () => {
		const {mgr, spawned} = makeVncManager()
		const {streamId} = mgr.startStream({
			userId: 'admin',
			mode: 'vnc-window' as any,
			target: {wid: 0x1000} as any,
		})
		await mgr.stopStream(streamId)
		const fakeX11vnc = spawned[0].child
		expect(fakeX11vnc.killCalls).toContain('SIGTERM')
		expect(mgr.getSession(streamId)).toBeNull()
	})

	it('Test 13: getSession returns kind:"vnc" for vnc, kind:"fmp4" for fmp4, null for unknown', () => {
		const {mgr} = makeVncManager()
		const {streamId} = mgr.startStream({
			userId: 'admin',
			mode: 'vnc-window' as any,
			target: {wid: 0x2000} as any,
		})
		expect(mgr.getSession(streamId)?.kind).toBe('vnc')
		expect(mgr.getSession('00000000-0000-0000-0000-000000000000')).toBeNull()
		mgr._clearForTests()
	})

	it('Test 14: idempotent — same (userId, "vnc-window", {wid}) returns same streamId, x11vnc spawned ONCE', () => {
		const {mgr, spawn} = makeVncManager()
		const a = mgr.startStream({
			userId: 'admin',
			mode: 'vnc-window' as any,
			target: {wid: 0x3000} as any,
		})
		const b = mgr.startStream({
			userId: 'admin',
			mode: 'vnc-window' as any,
			target: {wid: 0x3000} as any,
		})
		expect(b.streamId).toBe(a.streamId)
		expect(spawn).toHaveBeenCalledTimes(1)
		mgr._clearForTests()
	})

	it('Test 15: listStreams returns kind:"vnc" with subscriberCount=0 for vnc sessions', () => {
		const {mgr} = makeVncManager()
		mgr.startStream({
			userId: 'admin',
			mode: 'vnc-window' as any,
			target: {wid: 0x4000} as any,
		})
		const records = mgr.listStreams({userId: 'admin'})
		expect(records).toHaveLength(1)
		expect(records[0].kind).toBe('vnc')
		expect(records[0].subscriberCount).toBe(0)
		mgr._clearForTests()
	})

	it('Test 16: an x11vnc that exits WITHOUT a stop request (code 0 or signal/null) frees its cap slot (ghost-alive leak fix)', async () => {
		const {mgr, spawned} = makeVncManager() // cap = 5 (NO_VAAPI)
		// Fill the cap with 5 live vnc-window streams (distinct displays so none dedupe).
		for (let i = 0; i < 5; i++) {
			mgr.startStream({userId: 'admin', mode: 'vnc-window' as any, target: {display: `:${10 + i}`} as any})
		}
		// Cap is full → a 6th throws.
		expect(() =>
			mgr.startStream({userId: 'admin', mode: 'vnc-window' as any, target: {display: ':90'} as any}),
		).toThrow(StreamCapExceededError)

		// x11vnc #0 exits cleanly (code 0) with NO stopStream — e.g. its Xvfb display
		// was torn down by "reset chrome profile". Pre-fix this stayed 'alive' and leaked
		// the slot; now the slot frees so a new stream starts.
		spawned[0].child.emit('exit', 0, null)
		await Promise.resolve()
		expect(() =>
			mgr.startStream({userId: 'admin', mode: 'vnc-window' as any, target: {display: ':90'} as any}),
		).not.toThrow()

		// x11vnc #1 is signal-killed (code === null) with NO stopStream — same leak class.
		spawned[1].child.emit('exit', null, 'SIGKILL')
		await Promise.resolve()
		expect(() =>
			mgr.startStream({userId: 'admin', mode: 'vnc-window' as any, target: {display: ':91'} as any}),
		).not.toThrow()

		mgr._clearForTests()
	})
})

// ============================================================================
// Phase 100-10-04 — vnc-window mode with {display} target (D-100-10-C / -A)
// ============================================================================

describe('StreamManager — vnc-window mode with {display} target (Phase 100-10-04)', () => {
	it('T-10-04-SM-01: startStream({mode:"vnc-window", target:{display:":10"}}) spawns x11vnc with -display :10 argv', () => {
		const {mgr, spawn} = makeVncManager()
		const {streamId} = mgr.startStream({
			userId: 'u1',
			mode: 'vnc-window' as any,
			target: {display: ':10'} as any,
		})
		expect(streamId).toMatch(/^[0-9a-f-]{36}$/)
		expect(spawn).toHaveBeenCalledTimes(1)
		const [cmd, args] = spawn.mock.calls[0] as [string, string[]]
		expect(cmd).toBe('sudo')
		// Display-mode argv includes -display :10 (NOT -id 0xHEX).
		expect(args).toContain('-display')
		expect(args).toContain(':10')
		// -id form should NOT appear when target.display is set.
		expect(args).not.toContain('-id')
		mgr._clearForTests()
	})

	it('T-10-04-SM-02: idempotency key distinguishes {display} vs {wid} — different streamIds + spawns', () => {
		const {mgr, spawn} = makeVncManager()
		const a = mgr.startStream({
			userId: 'u1',
			mode: 'vnc-window' as any,
			target: {display: ':10'} as any,
		})
		const b = mgr.startStream({
			userId: 'u1',
			mode: 'vnc-window' as any,
			target: {wid: 0xabc} as any,
		})
		// Two distinct streamIds — display target and wid target share neither idempotency key nor port.
		expect(a.streamId).not.toBe(b.streamId)
		expect(spawn).toHaveBeenCalledTimes(2)
		mgr._clearForTests()
	})
})

// ============================================================================
// Phase 101-02 — PortAllocator wire-up (D-101-PORT-ALLOC / WARNING #6)
// ============================================================================

function makeVncManagerWithAllocator(allocator?: PortAllocator) {
	const spawned: {cmd: string; args: string[]; child: any}[] = []
	const spawn = vi.fn((cmd: string, args: string[]) => {
		const c = makeFakeX11vnc()
		spawned.push({cmd, args, child: c})
		return c as any
	})
	const mgr = new StreamManager({
		caps: NO_VAAPI as any,
		spawn: spawn as any,
		stopTimeoutMs: 50,
		portAllocator: allocator,
	} as any)
	return {mgr, spawn, spawned, allocator: allocator ?? (mgr as any).portAllocator as PortAllocator}
}

describe('StreamManager — PortAllocator wire-up (Phase 101-02)', () => {
	it('T-101-02-SM-01: startStream(vnc-window) calls portAllocator.allocate (rfbPort taken from allocator)', () => {
		const allocator = new PortAllocator()
		const allocateSpy = vi.spyOn(allocator, 'allocate')
		const {mgr} = makeVncManagerWithAllocator(allocator)
		const {streamId} = mgr.startStream({
			userId: 'admin',
			mode: 'vnc-window' as any,
			target: {wid: 0xa1a1} as any,
		})
		expect(allocateSpy).toHaveBeenCalledOnce()
		const session = mgr.getSession(streamId)
		// First allocate from default range → 15900.
		if (session?.kind === 'vnc') {
			expect(session.rfbPort).toBe(15900)
		} else {
			throw new Error('expected vnc session')
		}
		mgr._clearForTests()
	})

	it('T-101-02-SM-02: stopStream triggers portAllocator.release(port)', async () => {
		const allocator = new PortAllocator()
		const releaseSpy = vi.spyOn(allocator, 'release')
		const {mgr} = makeVncManagerWithAllocator(allocator)
		const {streamId} = mgr.startStream({
			userId: 'admin',
			mode: 'vnc-window' as any,
			target: {wid: 0xb2b2} as any,
		})
		expect(allocator.inUseCount).toBe(1)
		await mgr.stopStream(streamId)
		// release MUST have been called with the allocated port (15900).
		expect(releaseSpy).toHaveBeenCalledWith(15900)
		// And inUseCount returns to zero (regardless of idempotent duplicate calls).
		expect(allocator.inUseCount).toBe(0)
	})

	it('T-101-02-SM-03: x11vnc crash exit also releases the port (WARNING #6 — every close path)', async () => {
		const allocator = new PortAllocator()
		const releaseSpy = vi.spyOn(allocator, 'release')
		const {mgr, spawned} = makeVncManagerWithAllocator(allocator)
		const crashSpy = vi.fn()
		mgr.on('crash', crashSpy)
		mgr.startStream({
			userId: 'admin',
			mode: 'vnc-window' as any,
			target: {wid: 0xc3c3} as any,
		})
		expect(allocator.inUseCount).toBe(1)
		const fakeX11vnc = spawned[0].child
		// Simulate x11vnc crash (non-zero exit code while stopRequested=false).
		fakeX11vnc.emit('exit', 1, null)
		await Promise.resolve()
		expect(crashSpy).toHaveBeenCalledOnce()
		// Port released on crash path.
		expect(releaseSpy).toHaveBeenCalledWith(15900)
		expect(allocator.inUseCount).toBe(0)
		mgr._clearForTests()
	})

	// (re-allocate round-trip test follows immediately below)

	it('T-102-09-SM-01: startStream({target: {display: ":10"}, port: ...}) routes through vnc-bridge -display :10 (canonical Phase 102+)', () => {
		const allocator = new PortAllocator()
		const {mgr, spawn} = makeVncManagerWithAllocator(allocator)
		const {streamId} = mgr.startStream({
			userId: 'u',
			mode: 'vnc-window' as any,
			target: {display: ':10'} as any,
		})
		expect(streamId).toMatch(/^[0-9a-f-]{36}$/)
		expect(spawn).toHaveBeenCalledTimes(1)
		const [cmd, args] = spawn.mock.calls[0] as [string, string[]]
		expect(cmd).toBe('sudo')
		// Canonical Phase 102-09 — -display branch, NOT -id.
		expect(args).toContain('-display')
		expect(args).toContain(':10')
		expect(args).not.toContain('-id')
		// DISPLAY env-prefix pinned to per-app :10 so x11vnc opens the
		// correct Xvfb (not the shared :1 baseline).
		expect(args).toContain('DISPLAY=:10')
		// rfbPort is allocator-driven (default range starts at 15900).
		const session = mgr.getSession(streamId)
		if (session?.kind === 'vnc') {
			expect(session.rfbPort).toBe(15900)
			// VncSession.display field populated for canonical target.
			expect(session.display).toBe(':10')
			expect(session.wid).toBeUndefined()
		} else {
			throw new Error('expected vnc session with display target')
		}
		mgr._clearForTests()
	})

	it('T-102-09-SM-02: startStream({target: {wid: ...}}) still works (legacy back-compat path)', () => {
		const allocator = new PortAllocator()
		const {mgr, spawn} = makeVncManagerWithAllocator(allocator)
		const {streamId} = mgr.startStream({
			userId: 'u',
			mode: 'vnc-window' as any,
			target: {wid: 0x123} as any,
		})
		expect(spawn).toHaveBeenCalledTimes(1)
		const [, args] = spawn.mock.calls[0] as [string, string[]]
		// Legacy single-window argv — -id 0x123, NO -display.
		expect(args).toContain('-id')
		expect(args).toContain('0x123')
		expect(args).not.toContain('-display')
		const session = mgr.getSession(streamId)
		if (session?.kind === 'vnc') {
			expect(session.wid).toBe(0x123)
			expect(session.display).toBeUndefined()
		} else {
			throw new Error('expected vnc session with wid target')
		}
		mgr._clearForTests()
	})

	it('T-102-09-SM-03: stopStream({display}-target session) releases rfbPort via portAllocator.release', async () => {
		const allocator = new PortAllocator()
		const releaseSpy = vi.spyOn(allocator, 'release')
		const {mgr} = makeVncManagerWithAllocator(allocator)
		const {streamId} = mgr.startStream({
			userId: 'u',
			mode: 'vnc-window' as any,
			target: {display: ':11'} as any,
		})
		expect(allocator.inUseCount).toBe(1)
		await mgr.stopStream(streamId)
		// release MUST fire with the allocated port (first allocate → 15900).
		expect(releaseSpy).toHaveBeenCalledWith(15900)
		expect(allocator.inUseCount).toBe(0)
		// Session removed from map after stop.
		expect(mgr.getSession(streamId)).toBeNull()
	})

	it('T-304-SM: stopStreamsForDisplay(:N, user) stops only that user+display alive view stream', async () => {
		const {mgr} = makeVncManager()
		const a = mgr.startStream({userId: 'u', mode: 'vnc-window' as any, target: {display: ':11'} as any})
		const b = mgr.startStream({userId: 'u', mode: 'vnc-window' as any, target: {display: ':12'} as any})
		expect(mgr.getSession(a.streamId)?.kind).toBe('vnc')
		expect(mgr.getSession(b.streamId)?.kind).toBe('vnc')

		// Stops ONLY the :11 view stream (the cap counts alive sessions).
		const stopped = await mgr.stopStreamsForDisplay(':11', 'u')
		expect(stopped).toBe(1)
		expect(mgr.getSession(a.streamId)).toBeNull()
		expect(mgr.getSession(b.streamId)?.kind).toBe('vnc')

		// Idempotent: a second call finds nothing alive for :11.
		expect(await mgr.stopStreamsForDisplay(':11', 'u')).toBe(0)
		mgr._clearForTests()
	})

	it('T-304-SM-2: stopStreamsForDisplay is user-scoped — closing a SHARED display never stops a peer\'s stream', async () => {
		const {mgr} = makeVncManager()
		// Two members viewing the SAME shared host display :1 (distinct sessions —
		// the idempotency key is userId+mode+targetKey, so different users get
		// their own x11vnc).
		const alice = mgr.startStream({userId: 'alice', mode: 'vnc-window' as any, target: {display: ':1'} as any})
		const bob = mgr.startStream({userId: 'bob', mode: 'vnc-window' as any, target: {display: ':1'} as any})

		// Bob closes his :1 view → ONLY bob's stream stops; alice's survives.
		const stopped = await mgr.stopStreamsForDisplay(':1', 'bob')
		expect(stopped).toBe(1)
		expect(mgr.getSession(bob.streamId)).toBeNull()
		expect(mgr.getSession(alice.streamId)?.kind).toBe('vnc')
		mgr._clearForTests()
	})

	it('T-101-02-SM-04: re-allocate after stop returns pool to single-live-stream count (round-trip)', async () => {
		const allocator = new PortAllocator()
		const {mgr} = makeVncManagerWithAllocator(allocator)
		const first = mgr.startStream({
			userId: 'admin',
			mode: 'vnc-window' as any,
			target: {wid: 0xdead} as any,
		})
		const firstPort = (mgr.getSession(first.streamId) as any).rfbPort
		expect(firstPort).toBe(15900)
		await mgr.stopStream(first.streamId)
		expect(allocator.inUseCount).toBe(0)
		// After stop the cursor has advanced (linear walker semantics — see
		// port-allocator.test.ts Test 4), so the next allocate hands out the
		// next port in sequence rather than the just-freed 15900. The
		// important invariant for StreamManager is that the pool tracks
		// exactly one live stream after the round-trip.
		const second = mgr.startStream({
			userId: 'admin',
			mode: 'vnc-window' as any,
			target: {wid: 0xbeef} as any,
		})
		const secondPort = (mgr.getSession(second.streamId) as any).rfbPort
		expect(secondPort).toBe(15901)
		expect(secondPort).not.toBe(firstPort)
		expect(allocator.inUseCount).toBe(1)
		mgr._clearForTests()
	})
})
