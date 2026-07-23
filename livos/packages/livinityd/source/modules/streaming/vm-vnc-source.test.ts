/**
 * Phase 364 (VMENC-01) — VmVncFrameSource unit tests.
 *
 * Fully offline: an injected fake RFB client (EventEmitter) stands in for `vnc-rfb-client`,
 * so vitest needs no real socket / no dockur container. Coverage:
 *   1. start() resolves the framebuffer dims on firstFrameUpdate
 *   2. throttle — a burst of frameUpdated in one window emits ONE frame (the LATEST)
 *   3. fail-closed — ECONNREFUSED past the retry budget rejects start() (never hangs)
 *   4. stop() is idempotent and emits no frames afterwards
 */

import {EventEmitter} from 'node:events'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {VmVncFrameSource, VmVncConnectError, type VncRfbClientLike} from './vm-vnc-source.js'

/** Minimal fake RFB client — satisfies VncRfbClientLike structurally via EventEmitter. */
class FakeRfbClient extends EventEmitter implements VncRfbClientLike {
	clientWidth = 0
	clientHeight = 0
	fb: Buffer | null = null
	connectCalls = 0
	disconnectCalls = 0
	/** Phase 367 (VMENC-03): recorded sendPointerEvent/sendKeyEvent arg tuples. */
	sentPointers: unknown[][] = []
	sentKeys: unknown[][] = []
	/** Phase 367: script the Pitfall-2 library throw (sendData on a nulled _connection). */
	throwOnSend = false
	/** Test hook: invoked synchronously inside connect() to script the handshake outcome. */
	onConnect?: (c: FakeRfbClient) => void

	connect(): void {
		this.connectCalls += 1
		this.onConnect?.(this)
	}
	disconnect(): void {
		this.disconnectCalls += 1
	}
	getFb(): Buffer | null {
		return this.fb
	}
	sendPointerEvent(...args: unknown[]): void {
		if (this.throwOnSend) throw new TypeError("Cannot read properties of null (reading 'write')")
		this.sentPointers.push(args)
	}
	sendKeyEvent(...args: unknown[]): void {
		if (this.throwOnSend) throw new TypeError("Cannot read properties of null (reading 'write')")
		this.sentKeys.push(args)
	}
}

const ECONNREFUSED = () => Object.assign(new Error('connect ECONNREFUSED'), {code: 'ECONNREFUSED'})

afterEach(() => {
	vi.useRealTimers()
})

describe('VmVncFrameSource', () => {
	it('Test 1: start() resolves the framebuffer dims on firstFrameUpdate', async () => {
		const fake = new FakeRfbClient()
		fake.clientWidth = 1280
		fake.clientHeight = 720
		fake.fb = Buffer.alloc(1280 * 720 * 4)
		fake.onConnect = (c) => c.emit('firstFrameUpdate', c.fb)

		const src = new VmVncFrameSource({port: 16300, clientFactory: () => fake})
		const dims = await src.start()

		expect(dims).toEqual({width: 1280, height: 720})
		expect(fake.connectCalls).toBe(1)
		await src.stop()
	})

	it('Test 2: throttle — a burst of frameUpdated in one window emits ONE frame (the LATEST)', async () => {
		vi.useFakeTimers()
		const fake = new FakeRfbClient()
		fake.clientWidth = 2
		fake.clientHeight = 1

		const src = new VmVncFrameSource({port: 16300, framerate: 10, clientFactory: () => fake})
		const frames: Buffer[] = []
		src.onFrame((f) => frames.push(f))

		const started = src.start()
		fake.fb = Buffer.from([1, 1, 1, 1])
		fake.emit('firstFrameUpdate', fake.fb) // resolves start + arms the throttle
		await started

		// Three damage updates within a SINGLE 100ms (framerate 10) window.
		fake.fb = Buffer.from([2, 2, 2, 2])
		fake.emit('frameUpdated', fake.fb)
		fake.fb = Buffer.from([3, 3, 3, 3])
		fake.emit('frameUpdated', fake.fb)
		fake.fb = Buffer.from([9, 9, 9, 9])
		fake.emit('frameUpdated', fake.fb)

		await vi.advanceTimersByTimeAsync(100) // exactly one throttle tick

		expect(frames).toHaveLength(1)
		expect(frames[0]).toEqual(Buffer.from([9, 9, 9, 9])) // the LATEST frame, not a burst

		// A second window with NO new updates still emits the latest-known frame once more.
		await vi.advanceTimersByTimeAsync(100)
		expect(frames).toHaveLength(2)

		await src.stop()
	})

	it('Test 3: fail-closed — ECONNREFUSED past the retry budget rejects start() (never hangs)', async () => {
		vi.useFakeTimers()
		let connects = 0
		const factory = () => {
			const f = new FakeRfbClient()
			f.onConnect = (c) => {
				connects += 1
				c.emit('connectError', ECONNREFUSED())
			}
			return f
		}

		const src = new VmVncFrameSource({port: 16999, retryDelayMs: 100, clientFactory: factory})
		const started = src.start() // attempt 1 fires synchronously
		started.catch(() => {}) // pre-attach so the pending rejection is never "unhandled"

		expect(connects).toBe(1)
		await vi.advanceTimersByTimeAsync(100) // retry → attempt 2
		expect(connects).toBe(2)
		await vi.advanceTimersByTimeAsync(100) // retry → attempt 3 → budget exhausted → reject

		await expect(started).rejects.toBeInstanceOf(VmVncConnectError)
		expect(connects).toBe(3) // bounded at MAX_CONNECT_ATTEMPTS — no infinite retry
	})

	it('Test 3b: an ECONNREFUSED source also notifies on("error") listeners (fail-closed surface)', async () => {
		vi.useFakeTimers()
		const factory = () => {
			const f = new FakeRfbClient()
			f.onConnect = (c) => c.emit('connectError', ECONNREFUSED())
			return f
		}
		const src = new VmVncFrameSource({port: 16999, retryDelayMs: 50, clientFactory: factory})
		const errors: unknown[] = []
		src.on('error', (e) => errors.push(e))

		const started = src.start()
		started.catch(() => {})
		await vi.advanceTimersByTimeAsync(50)
		await vi.advanceTimersByTimeAsync(50)
		await expect(started).rejects.toBeInstanceOf(VmVncConnectError)
		expect(errors.length).toBeGreaterThanOrEqual(1)
		expect(errors[errors.length - 1]).toBeInstanceOf(VmVncConnectError)
	})

	it('Test 4: stop() is idempotent and emits no frames afterwards', async () => {
		vi.useFakeTimers()
		const fake = new FakeRfbClient()
		fake.clientWidth = 4
		fake.clientHeight = 4
		fake.fb = Buffer.alloc(64)

		const src = new VmVncFrameSource({port: 16300, framerate: 10, clientFactory: () => fake})
		const frames: Buffer[] = []
		src.onFrame((f) => frames.push(f))

		const started = src.start()
		fake.emit('firstFrameUpdate', fake.fb)
		await started

		await src.stop()
		expect(fake.disconnectCalls).toBe(1) // RFB socket closed exactly once

		await src.stop() // second stop is a pure no-op
		expect(fake.disconnectCalls).toBe(1) // NOT called again

		// A late frameUpdated + a full window of ticks produces ZERO frames after stop.
		fake.emit('frameUpdated', Buffer.alloc(64, 7))
		await vi.advanceTimersByTimeAsync(500)
		expect(frames).toHaveLength(0)
	})

	it('Test 4b: stop() before the first frame rejects a pending start() (never hangs)', async () => {
		vi.useFakeTimers()
		const fake = new FakeRfbClient() // connect() never emits anything (silent server)
		const src = new VmVncFrameSource({port: 16300, clientFactory: () => fake})

		const started = src.start()
		started.catch(() => {})
		await src.stop()

		await expect(started).rejects.toBeInstanceOf(VmVncConnectError)
	})

	// ── WR-01 / audit RESIDUAL-1(b): guest-reported framebuffer dims are capped ──────────────
	it('Test 5: over-max framebuffer dims fail start() CLOSED (no alloc, no resolve)', async () => {
		const fake = new FakeRfbClient()
		fake.clientWidth = 100000 // absurd resolution advertised by a compromised guest
		fake.clientHeight = 100000
		fake.fb = Buffer.from([1, 2, 3, 4]) // getFb() must NOT be consulted on the reject path
		let getFbCalls = 0
		fake.getFb = () => {
			getFbCalls += 1
			return fake.fb
		}
		fake.onConnect = (c) => c.emit('firstFrameUpdate', c.fb)

		const src = new VmVncFrameSource({port: 16300, clientFactory: () => fake})
		await expect(src.start()).rejects.toBeInstanceOf(VmVncConnectError)
		// Fail-closed BEFORE retaining any framebuffer (→ no huge W×H×4 alloc, no encoder spawn).
		expect(getFbCalls).toBe(0)
		await src.stop()
	})

	it('Test 5b: exactly 8192x8192 is accepted (the ceiling is inclusive)', async () => {
		const fake = new FakeRfbClient()
		fake.clientWidth = 8192
		fake.clientHeight = 8192
		fake.fb = Buffer.alloc(16)
		fake.onConnect = (c) => c.emit('firstFrameUpdate', c.fb)

		const src = new VmVncFrameSource({port: 16300, clientFactory: () => fake})
		const dims = await src.start()
		expect(dims).toEqual({width: 8192, height: 8192})
		await src.stop()
	})

	it('Test 5c: non-positive dims (0x0) fail start() closed', async () => {
		const fake = new FakeRfbClient()
		fake.clientWidth = 0
		fake.clientHeight = 0
		fake.onConnect = (c) => c.emit('firstFrameUpdate', null)

		const src = new VmVncFrameSource({port: 16300, clientFactory: () => fake})
		await expect(src.start()).rejects.toBeInstanceOf(VmVncConnectError)
		await src.stop()
	})

	// ── Audit RESIDUAL-1(a): a library-EMITTED 'error' fails the source closed (no crash) ─────
	it('Test 6: a library "error" event before the first frame rejects start() CLOSED', async () => {
		const fake = new FakeRfbClient()
		// A decode/socket error surfaces via the EventEmitter 'error' channel. Without the source's
		// own 'error' listener this emit would throw as an unhandledException (the very bug fixed);
		// the fact this test does not crash proves the listener is attached.
		fake.onConnect = (c) => c.emit('error', new Error('malformed RFB rectangle'))

		const src = new VmVncFrameSource({port: 16300, clientFactory: () => fake})
		await expect(src.start()).rejects.toBeInstanceOf(VmVncConnectError)
		await src.stop()
	})

	// ── Phase 367 (VMENC-03) — guarded input relay over the ONE shared RFB connection ────────
	it('Test 7: sendPointer decomposes the mask into 8-boolean button args on the live client', async () => {
		const fake = new FakeRfbClient()
		fake.clientWidth = 640
		fake.clientHeight = 480
		fake.fb = Buffer.alloc(16)
		fake.onConnect = (c) => c.emit('firstFrameUpdate', c.fb)

		const src = new VmVncFrameSource({port: 16300, clientFactory: () => fake})
		await src.start()

		// Mask bits 0/2/4 set (left + right + scroll-down) → booleans b1/b3/b5, b2/b4 false.
		src.sendPointer(100, 50, 0b10101)
		expect(fake.sentPointers).toEqual([[100, 50, true, false, true, false, true]])

		await src.stop()
	})

	it('Test 7b: sendKey forwards (keysym, down) on the live client', async () => {
		const fake = new FakeRfbClient()
		fake.clientWidth = 640
		fake.clientHeight = 480
		fake.fb = Buffer.alloc(16)
		fake.onConnect = (c) => c.emit('firstFrameUpdate', c.fb)

		const src = new VmVncFrameSource({port: 16300, clientFactory: () => fake})
		await src.start()

		src.sendKey(65293, true)
		expect(fake.sentKeys).toEqual([[65293, true]])

		await src.stop()
	})

	it('Test 7c: sends after stop() are silent no-ops — no throw, zero NEW recorded calls (Pitfall 2)', async () => {
		const fake = new FakeRfbClient()
		fake.clientWidth = 640
		fake.clientHeight = 480
		fake.fb = Buffer.alloc(16)
		fake.onConnect = (c) => c.emit('firstFrameUpdate', c.fb)

		const src = new VmVncFrameSource({port: 16300, clientFactory: () => fake})
		await src.start()
		src.sendPointer(1, 1, 1)
		expect(fake.sentPointers).toHaveLength(1)

		await src.stop()
		expect(() => src.sendPointer(2, 2, 0)).not.toThrow()
		expect(() => src.sendKey(65293, false)).not.toThrow()
		expect(fake.sentPointers).toHaveLength(1) // nothing new after stop
		expect(fake.sentKeys).toHaveLength(0)
	})

	it('Test 7d: sends before start() settles (never connected) are silent no-ops', async () => {
		const fake = new FakeRfbClient() // connect() never emits — start stays pending
		const src = new VmVncFrameSource({port: 16300, clientFactory: () => fake})

		const started = src.start()
		started.catch(() => {})
		expect(() => src.sendPointer(10, 10, 1)).not.toThrow()
		expect(() => src.sendKey(32, true)).not.toThrow()
		expect(fake.sentPointers).toHaveLength(0)
		expect(fake.sentKeys).toHaveLength(0)

		await src.stop() // rejects the pending start fail-closed
	})

	it('Test 7e: a THROWING library send is swallowed (sendData has no null-connection guard)', async () => {
		const fake = new FakeRfbClient()
		fake.clientWidth = 640
		fake.clientHeight = 480
		fake.fb = Buffer.alloc(16)
		fake.onConnect = (c) => c.emit('firstFrameUpdate', c.fb)

		const src = new VmVncFrameSource({port: 16300, clientFactory: () => fake})
		await src.start()

		fake.throwOnSend = true
		expect(() => src.sendPointer(5, 5, 1)).not.toThrow()
		expect(() => src.sendKey(65307, true)).not.toThrow()

		await src.stop()
	})

	it('Test 6b: a library "error" AFTER the first frame surfaces to on("error") subscribers', async () => {
		const fake = new FakeRfbClient()
		fake.clientWidth = 640
		fake.clientHeight = 480
		fake.fb = Buffer.alloc(640 * 480 * 4)
		fake.onConnect = (c) => c.emit('firstFrameUpdate', c.fb)

		const src = new VmVncFrameSource({port: 16300, clientFactory: () => fake})
		const errors: unknown[] = []
		src.on('error', (e) => errors.push(e))
		await src.start()

		// A post-start decode error must fail closed via the 'error' channel (stream-manager
		// cascades a stopStream) rather than crash the daemon.
		fake.emit('error', new Error('decode blew up mid-stream'))
		expect(errors.length).toBeGreaterThanOrEqual(1)
		expect(errors[errors.length - 1]).toBeInstanceOf(Error)

		await src.stop()
	})
})
