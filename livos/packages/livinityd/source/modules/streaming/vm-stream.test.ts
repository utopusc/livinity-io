/**
 * Phase 364-02 (VMENC-01) — vm-fmp4 session integration test.
 *
 * Mirrors integration.test.ts but for the THIRD StreamManager session kind. A
 * `FakeFrameSource` (injected via `vmFrameSourceFactory`) stands in for the host RFB
 * client — its start() resolves fixed dims and onFrame pumps a Buffer on a timer — and the
 * SAME `fake-encoder.cjs` fixture (spawned via the injected spawn) stands in for ffmpeg.
 * No real RFB socket, no real ffmpeg, no dockur container, no browser.
 *
 * Asserts:
 *   1. startVmStream returns a streamId; a CapturingSocket added via addSubscriber receives
 *      the init segment (ftyp+moov) + ≥3 fragments (proves the BLOCKER fix — addSubscriber/
 *      getFanout accept 'vm-fmp4' — and that VM frames actually fan out).
 *   2. stopStream → the frame source's stop() ran AND the encoder exited AND the map is
 *      empty AND the subscriber got close(1011).
 *   3. NO-ZOMBIE: a THROWING frame-source stop() still kills the encoder + deletes the map
 *      entry (cc21c2d6 discipline).
 *   4. caps.vaapi=false → startVmStream throws VmEncodeUnavailableError (fail-closed).
 *   5. a frameSource.start() rejection → startVmStream rejects AND leaves NO half-registered
 *      session (listStreams stays empty).
 *   6. stopStreamsForVm(vmId) stops the session bound to that vmId and leaves a different
 *      vmId's session alone.
 *   7. the returned wsUrl uses the ADMIN vm-stream route prefix (/ws/vm-stream/), not the
 *      weaker member /ws/stream/ route (BLOCKER fix — kind-aware wsUrlFor).
 */

import {describe, it, expect} from 'vitest'
import {EventEmitter} from 'node:events'
import {spawn as nodeSpawn, type ChildProcess} from 'node:child_process'
import {join} from 'node:path'
import {StreamManager, StreamCapExceededError, VmEncodeUnavailableError} from './stream-manager.js'
import type {SubscriberSocket} from './fmp4-fanout.js'
import type {VmFrameSource} from './vm-vnc-source.js'

const FAKE_ENCODER_PATH = join(import.meta.dirname, '__fixtures__', 'fake-encoder.cjs')

class CapturingSocket implements SubscriberSocket {
	bufferedAmount = 0
	readyState = 1
	sent: Buffer[] = []
	closeCode: number | null = null
	send(data: Buffer): void {
		this.sent.push(Buffer.from(data))
	}
	close(code?: number): void {
		this.closeCode = code ?? 1000
	}
}

/** A no-socket VmFrameSource: start() resolves fixed dims, onFrame pumps a tiny BGRA buffer. */
class FakeFrameSource implements VmFrameSource {
	started = false
	stopped = false
	stopCalls = 0
	private cb: ((f: Buffer) => void) | null = null
	private timer: ReturnType<typeof setInterval> | null = null
	private errorListeners: Array<(e?: unknown) => void> = []
	private closeListeners: Array<(e?: unknown) => void> = []

	constructor(
		private readonly opts: {
			width?: number
			height?: number
			startRejects?: boolean
			stopThrows?: boolean
		} = {},
	) {}

	async start(): Promise<{width: number; height: number}> {
		if (this.opts.startRejects) throw new Error('fake RFB connect failed (ECONNREFUSED)')
		this.started = true
		return {width: this.opts.width ?? 320, height: this.opts.height ?? 240}
	}

	onFrame(cb: (f: Buffer) => void): void {
		this.cb = cb
		this.timer = setInterval(() => {
			this.cb?.(Buffer.from([0, 0, 0, 255]))
		}, 15)
		this.timer.unref?.()
	}

	async stop(): Promise<void> {
		this.stopCalls += 1
		this.stopped = true
		if (this.timer) {
			clearInterval(this.timer)
			this.timer = null
		}
		if (this.opts.stopThrows) throw new Error('fake frame-source stop threw')
	}

	on(event: 'error' | 'close', cb: (e?: unknown) => void): void {
		if (event === 'error') this.errorListeners.push(cb)
		else this.closeListeners.push(cb)
	}

	// Test helpers to drive the post-start lifecycle.
	emitClose(): void {
		for (const l of this.closeListeners) l()
	}
	emitError(e?: unknown): void {
		for (const l of this.errorListeners) l(e)
	}
}

function waitFor(predicate: () => boolean, timeoutMs: number, label: string): Promise<void> {
	const deadline = Date.now() + timeoutMs
	return new Promise((resolve, reject) => {
		const tick = () => {
			if (predicate()) return resolve()
			if (Date.now() >= deadline) return reject(new Error(`waitFor(${label}) timed out after ${timeoutMs}ms`))
			setTimeout(tick, 25)
		}
		tick()
	})
}

/**
 * Build a StreamManager whose spawn always yields the fake-encoder fixture (stdin piped so
 * the frame feed has somewhere to go) and whose vmFrameSourceFactory returns caller-supplied
 * FakeFrameSources in order. `spawnedChildren` captures every spawned encoder so a test can
 * assert its exit.
 */
function makeVmManager(sources: FakeFrameSource[], opts?: {vaapi?: boolean}) {
	const spawnedChildren: ChildProcess[] = []
	let sourceIdx = 0
	const mgr = new StreamManager({
		caps: {vaapi: opts?.vaapi ?? true, profiles: ['VAProfileH264High']},
		spawn: () => {
			const child = nodeSpawn('node', [FAKE_ENCODER_PATH], {stdio: ['pipe', 'pipe', 'pipe']})
			spawnedChildren.push(child)
			return child
		},
		vmFrameSourceFactory: () => {
			const fs = sources[sourceIdx]
			sourceIdx += 1
			if (!fs) throw new Error(`test: vmFrameSourceFactory called ${sourceIdx} times but only ${sources.length} sources supplied`)
			return fs
		},
		stopTimeoutMs: 500,
	})
	return {mgr, spawnedChildren}
}

describe('StreamManager vm-fmp4 — FakeFrameSource ↔ fake-encoder ↔ Fmp4Fanout', () => {
	it('startVmStream → frames fan out to a subscriber → stop → both companions torn down', async () => {
		const source = new FakeFrameSource()
		const {mgr, spawnedChildren} = makeVmManager([source])

		const start = await mgr.startVmStream({userId: 'admin', vmId: 'vm-1', vncRawPort: 16307})
		expect(start.streamId).toBeTruthy()
		// BLOCKER fix: the VM stream advertises the ADMIN /ws/vm-stream/ route, not /ws/stream/.
		expect(start.wsUrl.startsWith('/ws/vm-stream/')).toBe(true)

		// BLOCKER fix: addSubscriber must ACCEPT a vm-fmp4 session (else it returns false → the
		// WS route closes every VM viewer → zero frames).
		const sock = new CapturingSocket()
		const ok = mgr.addSubscriber(start.streamId, sock)
		expect(ok).toBe(true)

		// Init segment + ≥3 fragments arrive through the reused fanout.
		await waitFor(() => sock.sent.length >= 4, 3000, 'init+3 fragments')
		const init = sock.sent[0]
		expect(init.subarray(4, 8).toString('ascii')).toBe('ftyp')
		const ftypSize = init.readUInt32BE(0)
		expect(init.subarray(ftypSize + 4, ftypSize + 8).toString('ascii')).toBe('moov')
		expect(sock.sent[1].subarray(4, 8).toString('ascii')).toBe('moof')

		// Stop → frame source closed AND encoder exited AND map cleared AND subscriber closed.
		const stopResult = await mgr.stopStream(start.streamId)
		expect(stopResult.stopped).toBe(true)
		expect(source.stopped).toBe(true)
		expect(source.stopCalls).toBeGreaterThanOrEqual(1)
		await waitFor(() => spawnedChildren[0].exitCode !== null || spawnedChildren[0].killed, 1500, 'encoder exit')
		expect(mgr.listStreams({userId: 'admin'})).toEqual([])
		await waitFor(() => sock.closeCode !== null, 1000, 'subscriber close')
		expect(sock.closeCode).toBe(1011)
	}, 10_000)

	it('NO-ZOMBIE: a throwing frame-source stop() still kills the encoder + deletes the map entry', async () => {
		const source = new FakeFrameSource({stopThrows: true})
		const {mgr, spawnedChildren} = makeVmManager([source])

		const start = await mgr.startVmStream({userId: 'admin', vmId: 'vm-z', vncRawPort: 16308})
		const sock = new CapturingSocket()
		mgr.addSubscriber(start.streamId, sock)
		await waitFor(() => sock.sent.length >= 1, 2000, 'init segment')

		// stopStream must NOT abort on the throwing frame-source stop().
		const stopResult = await mgr.stopStream(start.streamId)
		expect(stopResult.stopped).toBe(true)
		expect(source.stopCalls).toBeGreaterThanOrEqual(1)
		// The encoder is STILL killed and the map entry STILL gone despite the throw.
		await waitFor(() => spawnedChildren[0].exitCode !== null || spawnedChildren[0].killed, 1500, 'encoder exit')
		expect(mgr.getStream(start.streamId)).toBeNull()
		expect(mgr.listStreams({userId: 'admin'})).toEqual([])
	}, 10_000)

	it('caps.vaapi=false → startVmStream throws VmEncodeUnavailableError (fail-closed)', async () => {
		const source = new FakeFrameSource()
		const {mgr} = makeVmManager([source], {vaapi: false})
		await expect(mgr.startVmStream({userId: 'admin', vmId: 'vm-x', vncRawPort: 16309})).rejects.toBeInstanceOf(
			VmEncodeUnavailableError,
		)
		// The frame source was never even started (the VAAPI gate is first).
		expect(source.started).toBe(false)
		expect(mgr.listStreams({userId: 'admin'})).toEqual([])
	})

	it('a frameSource.start() rejection → startVmStream rejects and leaves NO half-registered session', async () => {
		const source = new FakeFrameSource({startRejects: true})
		const {mgr, spawnedChildren} = makeVmManager([source])
		await expect(mgr.startVmStream({userId: 'admin', vmId: 'vm-r', vncRawPort: 16310})).rejects.toThrow(/connect failed/i)
		// No encoder spawned, no session registered.
		expect(spawnedChildren).toHaveLength(0)
		expect(source.stopCalls).toBeGreaterThanOrEqual(1) // best-effort cleanup ran
		expect(mgr.listStreams({userId: 'admin'})).toEqual([])
	})

	it('stopStreamsForVm(vmId) stops that VM’s session and leaves a different VM’s session alone', async () => {
		const sourceA = new FakeFrameSource()
		const sourceB = new FakeFrameSource()
		const {mgr} = makeVmManager([sourceA, sourceB])

		const a = await mgr.startVmStream({userId: 'admin', vmId: 'vm-A', vncRawPort: 16311})
		const b = await mgr.startVmStream({userId: 'admin', vmId: 'vm-B', vncRawPort: 16312})

		const count = await mgr.stopStreamsForVm('vm-A')
		expect(count).toBe(1)

		// vm-A's session is gone; vm-B's is untouched and still alive.
		expect(mgr.getStream(a.streamId)).toBeNull()
		expect(sourceA.stopped).toBe(true)
		const bRecord = mgr.getStream(b.streamId)
		expect(bRecord?.status).toBe('alive')
		expect(sourceB.stopped).toBe(false)

		// Cleanup.
		await mgr.stopStreamsForVm('vm-B')
	}, 10_000)

	it('an unexpected frame-source close cascades a stopStream (no live ffmpeg on a dead RFB socket)', async () => {
		const source = new FakeFrameSource()
		const {mgr, spawnedChildren} = makeVmManager([source])
		const start = await mgr.startVmStream({userId: 'admin', vmId: 'vm-c', vncRawPort: 16313})
		await waitFor(() => spawnedChildren.length === 1, 1000, 'encoder spawned')

		// The RFB socket dies unexpectedly → the encoder must be reaped and the map cleared.
		source.emitClose()
		await waitFor(() => mgr.getStream(start.streamId) === null, 2000, 'session reaped after frame-source close')
		await waitFor(() => spawnedChildren[0].exitCode !== null || spawnedChildren[0].killed, 1500, 'encoder exit')
		expect(mgr.listStreams({userId: 'admin'})).toEqual([])
	}, 10_000)
})

// ── WR-02: the shared concurrent-stream cap is reserved ATOMICALLY across the start() await ──
//
// A lightweight fake ChildProcess (no real ffmpeg process) + a DEFERRED frame source whose
// start() stays pending until released. This lets N startVmStream calls on DISTINCT VMs all
// park in `await frameSource.start()` simultaneously — the exact window WR-02 fixes. Without the
// synchronous reservation every one of them would pass `aliveCount < cap` (nothing is registered
// while they are all awaiting) and overshoot the shared cap.

/** Minimal EventEmitter-backed ChildProcess stand-in — enough for startVmStream's wiring. */
class FakeEncoder extends EventEmitter {
	stdin = Object.assign(new EventEmitter(), {writable: true, write: () => true})
	stdout = new EventEmitter()
	stderr = new EventEmitter()
	killed = false
	kill(): boolean {
		this.killed = true
		queueMicrotask(() => this.emit('exit', 0, null))
		return true
	}
}

/** A VmFrameSource whose start() resolves only when the test releases it (models the await window). */
class DeferredFrameSource implements VmFrameSource {
	release!: () => void
	private readonly gate: Promise<void>
	stopped = false
	constructor(private readonly dims = {width: 320, height: 240}) {
		this.gate = new Promise<void>((res) => {
			this.release = res
		})
	}
	async start(): Promise<{width: number; height: number}> {
		await this.gate
		return this.dims
	}
	onFrame(): void {
		/* no frames needed for the cap test */
	}
	async stop(): Promise<void> {
		this.stopped = true
	}
	on(): void {
		/* no lifecycle signals needed */
	}
}

describe('StreamManager vm-fmp4 — WR-02 atomic cap reservation', () => {
	it('N concurrent startVmStream on DISTINCT VMs never exceeds the shared cap (cap=K)', async () => {
		const CAP = 10 // vaapi=true → getCap() === 10
		const N = 15 // over-subscribe by 5
		const sources: DeferredFrameSource[] = Array.from({length: N}, () => new DeferredFrameSource())
		let idx = 0
		const mgr = new StreamManager({
			caps: {vaapi: true, profiles: ['VAProfileH264High']},
			spawn: () => new FakeEncoder() as unknown as ChildProcess,
			vmFrameSourceFactory: () => sources[idx++],
			stopTimeoutMs: 100,
		})

		// Fire all N concurrently. Each runs its SYNCHRONOUS prefix (cap-check + reservation) before
		// parking in the await — so the reservations serialise them even though start() is pending.
		const attempts = sources.map((_, i) =>
			mgr
				.startVmStream({userId: 'admin', vmId: `vm-${i}`, vncRawPort: 16400 + i})
				.then(() => 'ok' as const)
				.catch((e) => e),
		)

		// Now let every parked start() resolve.
		for (const s of sources) s.release()
		const results = await Promise.all(attempts)

		const ok = results.filter((r) => r === 'ok').length
		const capErrors = results.filter((r) => r instanceof StreamCapExceededError).length
		expect(ok).toBe(CAP) // exactly the cap succeeded — never more
		expect(capErrors).toBe(N - CAP) // the overflow was rejected fail-closed
		expect(mgr.listStreams({userId: 'admin'}).filter((s) => s.status === 'alive')).toHaveLength(CAP)

		mgr._clearForTests()
	}, 10_000)

	it('a failed start RELEASES its reservation so the freed slot is reusable', async () => {
		const good = new FakeFrameSource()
		const bad = new FakeFrameSource({startRejects: true})
		const good2 = new FakeFrameSource()
		let idx = 0
		const order = [good, bad, good2]
		const mgr = new StreamManager({
			caps: {vaapi: true, profiles: ['VAProfileH264High']},
			spawn: () => new FakeEncoder() as unknown as ChildProcess,
			vmFrameSourceFactory: () => order[idx++],
			stopTimeoutMs: 100,
		})

		await mgr.startVmStream({userId: 'admin', vmId: 'vm-good', vncRawPort: 16350})
		// This one fails in start() — its reservation MUST be released, not leaked.
		await expect(mgr.startVmStream({userId: 'admin', vmId: 'vm-bad', vncRawPort: 16351})).rejects.toThrow()
		// A subsequent start still succeeds (the freed reservation did not permanently consume a slot).
		await mgr.startVmStream({userId: 'admin', vmId: 'vm-good2', vncRawPort: 16352})

		expect(mgr.listStreams({userId: 'admin'}).filter((s) => s.status === 'alive')).toHaveLength(2)
		mgr._clearForTests()
	}, 10_000)
})
