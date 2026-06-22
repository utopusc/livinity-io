/**
 * Phase 93-05 — StreamManager.
 *
 * Owns the streaming-session lifecycle: spawn the encoder ChildProcess,
 * pipe stdout into a Fmp4Fanout, expose start/stop/list/getFanout for the
 * tRPC + WS handlers (T93-06, T93-11).
 *
 * Decisions:
 *   D-93-03 + GA-93-05: caps from `liv:streaming:caps`. VAAPI present →
 *     max 10 concurrent streams. libx264 fallback → max 5.
 *   GA-93-07: idempotent — `(userId, mode, target)` collision returns the
 *     existing record instead of spawning a duplicate encoder.
 *   D-93-04: mode='pipewire-fd' uses gst-launch-1.0; everything else uses
 *     ffmpeg. The argv comes from encoder-args (T93-03).
 *   D-93-06: WS upgrade handler verifies ownership via `list({userId})`
 *     not via this manager directly. We expose getFanout(streamId) so the
 *     WS handler can attach subscribers.
 *
 * The manager is intentionally agnostic to the spawning mechanism — tests
 * inject a `spawn` factory so vitest can return a fake ChildProcess
 * without booting real ffmpeg.
 */

import {randomUUID} from 'node:crypto'
import type {ChildProcess} from 'node:child_process'
import {EventEmitter} from 'node:events'

import {Fmp4Fanout, type SubscriberSocket} from './fmp4-fanout.js'
import {
	buildFfmpegArgs,
	buildGstWindowArgs,
	type DesktopOpts,
	type WindowCropOpts,
	type PipewireFdOpts,
	type StreamMode,
} from './encoder-args.js'
import type {VaapiProbeResult} from './vaapi-probe.js'
import {spawnVncForWindow} from './vnc-bridge.js'
import {PortAllocator} from './port-allocator.js'

// Phase 101-02 (D-101-PORT-ALLOC / D-101-PORT-RANGE-EXTEND): the inline
// Phase-99 counter that lived here has been replaced by the constructor-
// injected `PortAllocator` (default range [15900, 16000)). Allocator supports
// explicit release() so closed apps' ports return to the pool — Phase 101
// grows concurrent stream count from 2-3 → up to 100. Bind race remains
// covered by attachVncBridge's 3×100ms retry (Pitfall 4 mitigation in
// vnc-bridge.ts).

// Phase 102-09 (D-102-X11VNC-WHOLE-DISPLAY): VncStreamTarget is the canonical
// name for the vnc-window target discriminated union. {display: ':N'} captures
// the whole Xvfb display (Phase 102+ default — per-app Xvfb from
// DisplayAllocator gives each app a dedicated 1280x720 canvas). {wid: number}
// is the legacy single-window region capture path (Phase 99 baseline; back-
// compat for v33 idle-cleanup poller and integration tests).
//
// New callers should use VncStreamTarget and prefer the {display} variant.
// The legacy alias VncWindowTarget is kept for back-compat with existing
// imports (Phase 100-10-04 scaffolding) and resolves to the same type.
//
// The idempotency cache key (JSON.stringify(target)) naturally distinguishes
// {display} from {wid} so the two variants never collide.
export type VncStreamTarget = {display: string} | {wid: number}
/** @deprecated Renamed to VncStreamTarget in Phase 102-09. Kept as alias for back-compat. */
export type VncWindowTarget = VncStreamTarget

export type StreamTarget =
	| Omit<DesktopOpts, 'mode'>
	| Omit<WindowCropOpts, 'mode'>
	| Omit<PipewireFdOpts, 'mode'>
	| VncStreamTarget

export type StartStreamOpts = {
	userId: string
	mode: StreamMode
	target: StreamTarget
	zeroLatency?: boolean
	fragmentDurationMs?: number
}

export type StreamStatus = 'alive' | 'crashed'

export type StreamRecord = {
	streamId: string
	userId: string
	mode: StreamMode
	target: StreamTarget
	subscriberCount: number
	status: StreamStatus
	startedAt: number
	wsUrl: string
	/** Phase 99: discriminator — `'fmp4'` for ffmpeg/gst-backed sessions, `'vnc'` for x11vnc-backed. */
	kind: 'fmp4' | 'vnc'
}

type FmpSession = {
	kind: 'fmp4'
	streamId: string
	userId: string
	mode: 'desktop' | 'window-crop' | 'pipewire-fd'
	target: StreamTarget
	targetKey: string
	encoder: ChildProcess
	fanout: Fmp4Fanout
	startedAt: number
	status: StreamStatus
	stopRequested: boolean
}

type VncSession = {
	kind: 'vnc'
	streamId: string
	userId: string
	mode: 'vnc-window'
	target: VncStreamTarget
	targetKey: string
	x11vnc: ChildProcess
	rfbPort: number
	/** Phase 100-10-04 — wid is now optional: present for legacy single-window
	 *  capture, undefined for whole-display capture (when target carries
	 *  `display` instead). */
	wid?: number
	/** Phase 100-10-04 — display string when target captures the whole
	 *  Xvfb (D-100-10-A `:10`, `:11`, ...); undefined for legacy single-window
	 *  capture. */
	display?: string
	startedAt: number
	status: StreamStatus
	stopRequested: boolean
}

export type StreamSession = FmpSession | VncSession

export type SpawnFactory = (cmd: string, args: string[]) => ChildProcess

export type StreamManagerOpts = {
	caps: VaapiProbeResult
	spawn: SpawnFactory
	logger?: {
		info: (msg: string, ...args: unknown[]) => void
		warn: (msg: string, ...args: unknown[]) => void
		error: (msg: string, ...args: unknown[]) => void
		verbose?: (msg: string, ...args: unknown[]) => void
	}
	/** Override the default 2s SIGTERM→SIGKILL escalation (test hook). */
	stopTimeoutMs?: number
	/**
	 * Phase 101-02: optional injected `PortAllocator`. When omitted, the
	 * manager constructs its own default-range allocator ([15900, 16000)).
	 * Tests can inject a custom allocator (e.g. narrow range, spy) to verify
	 * allocate/release wiring without touching real ports.
	 */
	portAllocator?: PortAllocator
}

const DEFAULT_STOP_TIMEOUT_MS = 2000

export class StreamCapExceededError extends Error {
	code = 'STREAM_CAP_EXCEEDED'
	constructor(public limit: number) {
		super(`stream cap exceeded (limit ${limit})`)
	}
}

export class StreamManager extends EventEmitter {
	private streams = new Map<string, StreamSession>()
	private readonly caps: VaapiProbeResult
	private readonly spawnFactory: SpawnFactory
	private readonly logger: StreamManagerOpts['logger']
	private readonly stopTimeoutMs: number
	private readonly portAllocator: PortAllocator

	constructor(opts: StreamManagerOpts) {
		super()
		this.caps = opts.caps
		this.spawnFactory = opts.spawn
		this.logger = opts.logger
		this.stopTimeoutMs = opts.stopTimeoutMs ?? DEFAULT_STOP_TIMEOUT_MS
		// Phase 101-02: use injected allocator when provided, else default
		// [15900, 16000) range (D-101-PORT-ALLOC / D-101-PORT-RANGE-EXTEND).
		this.portAllocator = opts.portAllocator ?? new PortAllocator()
	}

	/** Phase 101-02: expose allocator for boot-time wiring + diagnostics. */
	getPortAllocator(): PortAllocator {
		return this.portAllocator
	}

	/** Concurrent-stream cap: 10 with VAAPI, 5 with libx264 fallback. */
	getCap(): number {
		return this.caps.vaapi ? 10 : 5
	}

	startStream(opts: StartStreamOpts): {streamId: string; wsUrl: string} {
		// 1. Idempotency check (GA-93-07)
		const targetKey = stableStringify(opts.target)
		for (const session of this.streams.values()) {
			if (
				session.userId === opts.userId &&
				session.mode === opts.mode &&
				session.targetKey === targetKey &&
				session.status === 'alive'
			) {
				return {streamId: session.streamId, wsUrl: wsUrlFor(session.streamId)}
			}
		}

		// 2. Cap check
		const aliveCount = Array.from(this.streams.values()).filter(
			(s) => s.status === 'alive',
		).length
		const cap = this.getCap()
		if (aliveCount >= cap) {
			throw new StreamCapExceededError(cap)
		}

		// 2.5 Phase 99 — vnc-window branch (D-99-04). Returns BEFORE the
		// ffmpeg/gst argv builder so encoder-args is never invoked for vnc.
		//
		// Phase 102-09 (D-102-X11VNC-WHOLE-DISPLAY): {display} is the
		// canonical target — per-app Xvfb gives each app a dedicated 1280x720
		// canvas and x11vnc captures it whole via `-display :N`. {wid} is
		// retained for v33 idle-cleanup poller compat; new callers should use
		// the display variant.
		//
		// The discriminated union picks the right spawnVncForWindow argv
		// shape; the idempotency key (JSON.stringify(target)) naturally
		// separates the two variants so a {display} stream and a {wid}
		// stream never collide in the cache.
		if (opts.mode === 'vnc-window') {
			const target = opts.target as VncStreamTarget
			const hasWid = 'wid' in target && typeof target.wid === 'number'
			const hasDisplay =
				'display' in target && typeof target.display === 'string' && target.display.length > 0
			if (!hasWid && !hasDisplay) {
				throw new Error(
					`stream-manager: vnc-window target must include either {wid: positive int} or {display: string} (got ${JSON.stringify(target)})`,
				)
			}
			if (hasWid && (!Number.isInteger((target as {wid: number}).wid) || (target as {wid: number}).wid <= 0)) {
				throw new Error(
					`stream-manager: vnc-window target.wid must be a positive integer (got ${(target as {wid: number}).wid})`,
				)
			}
			const widValue = hasWid ? (target as {wid: number}).wid : undefined
			const displayValue = hasDisplay ? (target as {display: string}).display : undefined
			// Phase 101-02: PortAllocator replaces the legacy inline counter.
			// Throws PortRangeExhaustedError when all 100 slots are in use.
			const rfbPort = this.portAllocator.allocate()
			const x11vnc = spawnVncForWindow({
				wid: widValue,
				display: displayValue,
				rfbPort,
				spawnFactory: this.spawnFactory as never,
				logger: this.logger,
			})
			const streamId = randomUUID()
			const vncSession: VncSession = {
				kind: 'vnc',
				streamId,
				userId: opts.userId,
				mode: 'vnc-window',
				target,
				targetKey,
				x11vnc,
				rfbPort,
				wid: widValue,
				display: displayValue,
				startedAt: Date.now(),
				status: 'alive',
				stopRequested: false,
			}
			this.streams.set(streamId, vncSession)
			const targetLabel = hasDisplay ? `display=${displayValue}` : `wid=${widValue}`
			x11vnc.on('exit', (code, signal) => {
				// Phase 101-02 (WARNING #6): release port on EVERY x11vnc-close
				// path — clean exit AND crash. release() is idempotent so the
				// duplicate call from stopStream's vnc branch is a no-op.
				this.portAllocator.release(rfbPort)
				if (vncSession.stopRequested) {
					this.logger?.info?.(
						`stream ${streamId}: x11vnc exited cleanly (stop requested)`,
					)
					return
				}
				// ANY unrequested exit means this stream is dead → flip it off 'alive'
				// so it stops counting toward the concurrent-stream cap. Previously the
				// status flip lived INSIDE the `code !== 0 && code !== null` branch, so an
				// x11vnc that exited 0 (clean) or was signal-killed (code === null) — e.g.
				// when its Xvfb display / Chrome was torn down by "reset chrome profile" —
				// stayed 'alive' in the map forever and leaked a cap slot. Five such
				// ghost-alive sessions → "stream cap exceeded (limit 5)" on the next
				// webapp.window.spawn / chromeMaster.startLogin (the reported 500s).
				vncSession.status = 'crashed'
				if (code !== 0 && code !== null) {
					this.logger?.error?.(
						`stream ${streamId}: x11vnc crashed (code=${code} signal=${signal} ${targetLabel})`,
					)
					this.emit('crash', {streamId, code, signal})
				} else {
					this.logger?.warn?.(
						`stream ${streamId}: x11vnc exited without a stop request (code=${code} signal=${signal} ${targetLabel}) — freeing its cap slot`,
					)
				}
			})
			this.logger?.info?.(
				`stream ${streamId} started (user=${opts.userId} mode=vnc-window ${targetLabel} rfbPort=${rfbPort})`,
			)
			return {streamId, wsUrl: wsUrlFor(streamId)}
		}

		// 3. Build argv
		let cmd: string
		let argv: string[]
		if (opts.mode === 'pipewire-fd') {
			cmd = 'gst-launch-1.0'
			argv = buildGstWindowArgs({mode: 'pipewire-fd', ...(opts.target as Omit<PipewireFdOpts, 'mode'>)})
		} else {
			cmd = 'ffmpeg'
			argv = buildFfmpegArgs({
				mode: opts.mode,
				...(opts.target as Omit<DesktopOpts | WindowCropOpts, 'mode'>),
				caps: this.caps,
				zeroLatency: opts.zeroLatency,
				fragmentDurationMs: opts.fragmentDurationMs,
			} as Parameters<typeof buildFfmpegArgs>[0])
		}

		// 4. Spawn encoder
		const encoder = this.spawnFactory(cmd, argv)
		const streamId = randomUUID()
		const fanout = new Fmp4Fanout({logger: this.logger})

		const session: FmpSession = {
			kind: 'fmp4',
			streamId,
			userId: opts.userId,
			mode: opts.mode as 'desktop' | 'window-crop' | 'pipewire-fd',
			target: opts.target,
			targetKey,
			encoder,
			fanout,
			startedAt: Date.now(),
			status: 'alive',
			stopRequested: false,
		}
		this.streams.set(streamId, session)

		// 5. Wire stdout → fanout
		if (encoder.stdout) {
			encoder.stdout.on('data', (chunk: Buffer) => {
				try {
					fanout.feed(chunk)
				} catch (err) {
					this.logger?.error?.(`stream ${streamId}: fanout.feed threw`, err)
				}
			})
			encoder.stdout.on('error', (err) => {
				this.logger?.warn?.(`stream ${streamId}: encoder stdout error`, err)
			})
		}

		// 7. Stderr passthrough — keep ffmpeg's diagnostics in livinityd logs.
		// Also keep a rolling tail so crash diagnostics include the encoder's
		// own error messages (otherwise we only see "code=234" with no clue
		// which argument ffmpeg rejected).
		const stderrTail: string[] = []
		if (encoder.stderr) {
			encoder.stderr.on('data', (chunk: Buffer) => {
				const line = chunk.toString('utf-8').trim()
				if (!line) return
				this.logger?.verbose?.(`stream ${streamId} stderr: ${line}`)
				stderrTail.push(line)
				if (stderrTail.length > 50) stderrTail.shift()
			})
		}

		// 6. Crash detection (ordered after stderr wiring so the tail is
		// populated by the time the exit handler runs).
		encoder.on('exit', (code, signal) => {
			if (session.stopRequested) {
				this.logger?.info?.(`stream ${streamId}: encoder exited cleanly (stop requested)`)
				return
			}
			// ANY unrequested exit = dead stream → flip off 'alive' + close the fanout
			// so the cap slot is freed. Previously this only ran for a non-zero crash
			// code, so a code===0 / signal-kill (code===null) exit left the session
			// 'alive' and leaked a cap slot (same ghost-alive bug as the vnc branch).
			session.status = 'crashed'
			try {
				fanout.close('encoder-exited')
			} catch (err) {
				this.logger?.warn?.(`stream ${streamId}: fanout.close after exit threw`, err)
			}
			if (code !== 0 && code !== null) {
				const tailMsg =
					stderrTail.length > 0
						? `\n--- ffmpeg stderr (last ${stderrTail.length}) ---\n${stderrTail.join('\n')}`
						: ' (no stderr captured)'
				this.logger?.error?.(
					`stream ${streamId}: encoder crashed (code=${code} signal=${signal} argv=${JSON.stringify(argv)})${tailMsg}`,
				)
				this.emit('crash', {streamId, code, signal})
			} else {
				this.logger?.warn?.(
					`stream ${streamId}: encoder exited without a stop request (code=${code} signal=${signal}) — freeing its cap slot`,
				)
			}
		})

		this.logger?.info?.(`stream ${streamId} started (user=${opts.userId} mode=${opts.mode} cmd=${cmd})`)
		return {streamId, wsUrl: wsUrlFor(streamId)}
	}

	async stopStream(streamId: string): Promise<{stopped: boolean}> {
		const session = this.streams.get(streamId)
		if (!session) return {stopped: false}
		if (session.stopRequested) return {stopped: true}
		session.stopRequested = true

		// Phase 99 — vnc cascade: SIGTERM x11vnc, wait up to 500ms for clean
		// exit, then delete from map. No SIGKILL escalation: x11vnc handles
		// SIGTERM cleanly.
		if (session.kind === 'vnc') {
			try {
				session.x11vnc.kill('SIGTERM')
			} catch (err) {
				this.logger?.warn?.(`stream ${streamId}: x11vnc SIGTERM threw`, err)
			}
			await new Promise<void>((resolve) => {
				let resolved = false
				const onExit = () => {
					if (resolved) return
					resolved = true
					clearTimeout(timer)
					resolve()
				}
				const timer = setTimeout(onExit, 500)
				session.x11vnc.once('exit', onExit)
			})
			// Phase 101-02 (WARNING #6): defensive release on stop path. If the
			// x11vnc 'exit' handler already fired, this is a no-op (release is
			// idempotent). If the timeout above raced and the exit handler
			// hasn't run yet (e.g. SIGTERM stalled), this ensures the port
			// still returns to the pool.
			this.portAllocator.release(session.rfbPort)
			this.streams.delete(streamId)
			const targetLabel =
				session.display !== undefined
					? `display=${session.display}`
					: `wid=${session.wid}`
			this.logger?.info?.(
				`stream ${streamId} stopped (vnc, ${targetLabel})`,
			)
			return {stopped: true}
		}

		const encoder = session.encoder
		const fanout = session.fanout

		// SIGTERM → wait → SIGKILL escalation
		try {
			encoder.kill('SIGTERM')
		} catch (err) {
			this.logger?.warn?.(`stream ${streamId}: SIGTERM threw`, err)
		}

		await new Promise<void>((resolve) => {
			let resolved = false
			const onExit = () => {
				if (resolved) return
				resolved = true
				clearTimeout(timer)
				resolve()
			}
			const timer = setTimeout(() => {
				if (resolved) return
				try {
					encoder.kill('SIGKILL')
				} catch (err) {
					this.logger?.warn?.(`stream ${streamId}: SIGKILL threw`, err)
				}
				// give SIGKILL a moment then resolve regardless
				setTimeout(onExit, 100)
			}, this.stopTimeoutMs)
			encoder.once('exit', onExit)
		})

		try {
			fanout.close('encoder-stopped')
		} catch (err) {
			this.logger?.warn?.(`stream ${streamId}: fanout.close threw`, err)
		}
		this.streams.delete(streamId)
		this.logger?.info?.(`stream ${streamId} stopped`)
		return {stopped: true}
	}

	listStreams(filter: {userId: string}): StreamRecord[] {
		const out: StreamRecord[] = []
		for (const session of this.streams.values()) {
			if (session.userId !== filter.userId) continue
			out.push(this.toRecord(session))
		}
		return out
	}

	getStream(streamId: string): StreamRecord | null {
		const session = this.streams.get(streamId)
		if (!session) return null
		return this.toRecord(session)
	}

	/**
	 * Phase 99 — return the discriminated-union session for the
	 * `/ws/stream/:streamId` handler so it can dispatch on `session.kind`
	 * (fmp4 → addSubscriber; vnc → attachVncBridge). Returns null if no
	 * matching session is registered.
	 */
	getSession(streamId: string): StreamSession | null {
		return this.streams.get(streamId) ?? null
	}

	getFanout(streamId: string): Fmp4Fanout | null {
		const session = this.streams.get(streamId)
		if (!session || session.kind !== 'fmp4') return null
		return session.fanout
	}

	addSubscriber(streamId: string, ws: SubscriberSocket): boolean {
		const session = this.streams.get(streamId)
		if (!session || session.kind !== 'fmp4') return false
		session.fanout.addSubscriber(ws)
		return true
	}

	private toRecord(session: StreamSession): StreamRecord {
		return {
			streamId: session.streamId,
			userId: session.userId,
			mode: session.mode,
			target: session.target,
			subscriberCount:
				session.kind === 'fmp4' ? session.fanout.getSubscriberCount() : 0,
			status: session.status,
			startedAt: session.startedAt,
			wsUrl: wsUrlFor(session.streamId),
			kind: session.kind,
		}
	}

	/** Test-only — drop all sessions without sending signals. */
	_clearForTests(): void {
		for (const session of this.streams.values()) {
			try {
				if (session.kind === 'fmp4') session.fanout.close('test-clear')
				else session.x11vnc.kill('SIGKILL')
			} catch {
				/* noop */
			}
		}
		this.streams.clear()
	}
}

function wsUrlFor(streamId: string): string {
	return `/ws/stream/${streamId}`
}

/** Stable JSON.stringify by sorting keys — used for the idempotency key. */
function stableStringify(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value)
	if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']'
	const entries = Object.entries(value as Record<string, unknown>).sort(
		([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
	)
	return (
		'{' +
		entries.map(([k, v]) => JSON.stringify(k) + ':' + stableStringify(v)).join(',') +
		'}'
	)
}
