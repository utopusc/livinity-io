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
})
