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

export type StreamTarget =
	| Omit<DesktopOpts, 'mode'>
	| Omit<WindowCropOpts, 'mode'>
	| Omit<PipewireFdOpts, 'mode'>

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
}

type StreamSession = {
	streamId: string
	userId: string
	mode: StreamMode
	target: StreamTarget
	targetKey: string
	encoder: ChildProcess
	fanout: Fmp4Fanout
	startedAt: number
	status: StreamStatus
	stopRequested: boolean
}

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

	constructor(opts: StreamManagerOpts) {
		super()
		this.caps = opts.caps
		this.spawnFactory = opts.spawn
		this.logger = opts.logger
		this.stopTimeoutMs = opts.stopTimeoutMs ?? DEFAULT_STOP_TIMEOUT_MS
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

		const session: StreamSession = {
			streamId,
			userId: opts.userId,
			mode: opts.mode,
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
			if (code !== 0 && code !== null) {
				const tailMsg =
					stderrTail.length > 0
						? `\n--- ffmpeg stderr (last ${stderrTail.length}) ---\n${stderrTail.join('\n')}`
						: ' (no stderr captured)'
				this.logger?.error?.(
					`stream ${streamId}: encoder crashed (code=${code} signal=${signal} argv=${JSON.stringify(argv)})${tailMsg}`,
				)
				session.status = 'crashed'
				try {
					fanout.close('encoder-crashed')
				} catch (err) {
					this.logger?.warn?.(`stream ${streamId}: fanout.close after crash threw`, err)
				}
				this.emit('crash', {streamId, code, signal})
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

	getFanout(streamId: string): Fmp4Fanout | null {
		return this.streams.get(streamId)?.fanout ?? null
	}

	addSubscriber(streamId: string, ws: SubscriberSocket): boolean {
		const session = this.streams.get(streamId)
		if (!session) return false
		session.fanout.addSubscriber(ws)
		return true
	}

	private toRecord(session: StreamSession): StreamRecord {
		return {
			streamId: session.streamId,
			userId: session.userId,
			mode: session.mode,
			target: session.target,
			subscriberCount: session.fanout.getSubscriberCount(),
			status: session.status,
			startedAt: session.startedAt,
			wsUrl: wsUrlFor(session.streamId),
		}
	}

	/** Test-only — drop all sessions without sending signals. */
	_clearForTests(): void {
		for (const session of this.streams.values()) {
			try {
				session.fanout.close('test-clear')
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
