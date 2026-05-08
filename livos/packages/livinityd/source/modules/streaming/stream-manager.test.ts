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
})
