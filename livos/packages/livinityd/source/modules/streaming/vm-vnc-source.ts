/**
 * Phase 364 (VMENC-01) — host-side RFB frame source.
 *
 * The genuinely-new primitive of the VMENC bridge: a host process that connects to a
 * running VM's RAW QEMU VNC server (the loopback `vncRawPort` published by vm-docker) as
 * an ordinary RFB CLIENT, decodes its framebuffer into raw BGRA frames, and emits the
 * LATEST full frame throttled to the encode framerate — ready to be piped into the
 * `buildFfmpegArgs({mode:'vm-rawvideo'})` `-f rawvideo -pix_fmt bgra ... -i pipe:0` argv.
 *
 * There is NO RFB client anywhere else in this repo (vnc-bridge.ts spawns x11vnc SERVERS;
 * use-webapp-vnc.ts is a browser RFB client) — so this leans on the vetted, MIT-licensed,
 * ZERO-dependency `vnc-rfb-client` (RFC 6143) for the non-trivial decode, consistent with
 * fmp4-fanout's "don't hand-roll when it's genuinely non-trivial" line. We request Raw
 * encoding only (mandatory-to-support per RFC 6143; loopback makes uncompressed pixels
 * free) and keep the library's default 32bpp true-colour path: its raw decoder writes each
 * pixel as [blue, green, red, 255] — i.e. exactly ffmpeg's `bgra` byte order — regardless
 * of the server's pixel-format shifts, so getFb() is directly pipe:0-compatible.
 *
 * Posture: loopback-only source (the 127.0.0.1 bind IS the guard — same as the un-authed
 * novncPort→8006 bridge and `x11vnc -nopw`). Fail-closed: start() rejects after a bounded
 * ECONNREFUSED retry (mirrors vnc-bridge.ts's 3×100ms idiom) and NEVER hangs. Teardown is
 * idempotent + best-effort (catch+log) — no frame is emitted after stop().
 *
 * SESSION LIFECYCLE / WS WIRING IS NOT IN THIS PLAN — stream-manager (plan 02) owns the
 * ffmpeg spawn + fanout; the WS admin-gate is plan 03. This file is offline-testable via
 * an injected `clientFactory` (no real socket).
 */

// vnc-rfb-client ships as untyped CommonJS (`module.exports = VncClient`). Its minimal
// ambient surface lives in the co-located `vnc-rfb-client.d.ts` script (a resolvable untyped
// module cannot be augmented from inside an ESM file — TS2665 — so the shim is a standalone
// ambient declaration, the exact fix the compiler suggests for the TS7016).
import VncRfbClient from 'vnc-rfb-client'

/** VncBridgeLogger-shaped logger (mirrors vnc-bridge.ts). All levels optional at call. */
export interface VmVncLogger {
	info?: (msg: string) => void
	warn?: (msg: string) => void
	error?: (msg: string, err?: unknown) => void
	verbose?: (msg: string) => void
}

/**
 * The minimal RFB-client surface VmVncFrameSource drives. The real `vnc-rfb-client` satisfies
 * it structurally; tests inject a fake so vitest needs no real socket. Events used:
 *   - 'firstFrameUpdate' (fb) — first framebuffer decoded; clientWidth/Height are now valid
 *   - 'frameUpdated'     (fb) — a subsequent framebuffer decoded
 *   - 'connectError'     (err) — TCP/handshake failure (err.code may be 'ECONNREFUSED')
 *   - 'connectTimeout'   ()    — connection timed out
 *   - 'authError'        ()    — security-type/auth failure (unexpected over no-auth loopback)
 *   - 'disconnected' / 'closed' () — the session ended
 */
export interface VncRfbClientLike {
	clientWidth: number
	clientHeight: number
	connect(options: {host?: string; port?: number; password?: string; set8BitColor?: boolean}): void
	disconnect(): void
	getFb(): Buffer | null
	on(event: string, listener: (...args: unknown[]) => void): unknown
}

/**
 * The contract the stream-manager (plan 02) codes against — a pull-able, throttled BGRA
 * frame source with a fail-closed start and an idempotent teardown.
 */
export interface VmFrameSource {
	/** Connect + handshake; resolves the framebuffer dims once the first frame arrives.
	 *  Rejects (fail-closed) on a bounded connect failure — never hangs. */
	start(): Promise<{width: number; height: number}>
	/** Register the frame sink. Invoked with the LATEST full BGRA frame, throttled to the
	 *  target framerate (a burst of RFB damage rects does NOT produce a burst of frames). */
	onFrame(cb: (frame: Buffer) => void): void
	/** Best-effort, idempotent teardown — closes the RFB socket, stops the throttle, emits
	 *  no further frames. */
	stop(): Promise<void>
	/** Subscribe to post-start lifecycle signals. */
	on(event: 'error' | 'close', cb: (err?: unknown) => void): void
}

export type VmVncFrameSourceOpts = {
	/** Loopback source host — default '127.0.0.1'. */
	host?: string
	/** The allocated vncRawPort (container VNC_PORT) to connect to. */
	port: number
	/** Target encode framerate — default 30. Bounds both the RFB request rate and the emit throttle. */
	framerate?: number
	logger?: VmVncLogger
	/** ECONNREFUSED retry backoff (ms) — default 100 (mirrors vnc-bridge). */
	retryDelayMs?: number
	/** Fail-closed deadline (ms) for the WHOLE start (connect + first frame) — default 15000.
	 *  Guards a connected-but-silent server so start() can never hang. */
	startTimeoutMs?: number
	/** Test seam: inject a fake RFB client factory so vitest needs no real socket. The default
	 *  builds a real `vnc-rfb-client` requesting Raw-only encoding at the target framerate. */
	clientFactory?: (init: {framerate: number}) => VncRfbClientLike
}

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_FRAMERATE = 30
const DEFAULT_RETRY_DELAY_MS = 100
const DEFAULT_START_TIMEOUT_MS = 15000
const MAX_CONNECT_ATTEMPTS = 3 // total connects (mirrors vnc-bridge.ts's 3×100ms ECONNREFUSED retry)

/** Typed fail-closed error so callers (plan 02) can distinguish "VM screen unavailable" cleanly. */
export class VmVncConnectError extends Error {
	code = 'VM_VNC_CONNECT_FAILED'
	constructor(
		message: string,
		public readonly cause?: unknown,
	) {
		super(message)
		this.name = 'VmVncConnectError'
	}
}

export class VmVncFrameSource implements VmFrameSource {
	readonly #host: string
	readonly #port: number
	readonly #framerate: number
	readonly #retryDelayMs: number
	readonly #startTimeoutMs: number
	readonly #logger?: VmVncLogger
	readonly #makeClient: (init: {framerate: number}) => VncRfbClientLike

	#client: VncRfbClientLike | null = null
	#frameCb: ((frame: Buffer) => void) | null = null
	#latestFrame: Buffer | null = null
	#tickTimer: ReturnType<typeof setInterval> | null = null
	#startDeadline: ReturnType<typeof setTimeout> | null = null

	#connectAttempts = 0
	#settled = false // start() has resolved OR rejected
	#stopped = false
	#resolveStart: ((dims: {width: number; height: number}) => void) | null = null
	#rejectStart: ((err: unknown) => void) | null = null

	readonly #errorListeners: Array<(err?: unknown) => void> = []
	readonly #closeListeners: Array<(err?: unknown) => void> = []

	constructor(opts: VmVncFrameSourceOpts) {
		this.#host = opts.host ?? DEFAULT_HOST
		this.#port = opts.port
		this.#framerate = opts.framerate ?? DEFAULT_FRAMERATE
		this.#retryDelayMs = opts.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
		this.#startTimeoutMs = opts.startTimeoutMs ?? DEFAULT_START_TIMEOUT_MS
		this.#logger = opts.logger
		this.#makeClient = opts.clientFactory ?? defaultClientFactory
	}

	start(): Promise<{width: number; height: number}> {
		return new Promise<{width: number; height: number}>((resolve, reject) => {
			this.#resolveStart = resolve
			this.#rejectStart = reject
			// Fail-closed deadline: a connected-but-silent server never wedges start(). unref so
			// the timer alone never keeps the process alive.
			this.#startDeadline = setTimeout(() => {
				this.#failClosed(new VmVncConnectError(`VM VNC ${this.#host}:${this.#port}: no first frame within ${this.#startTimeoutMs}ms`))
			}, this.#startTimeoutMs)
			this.#startDeadline.unref?.()
			this.#tryConnect()
		})
	}

	#tryConnect(): void {
		if (this.#settled || this.#stopped) return
		this.#connectAttempts += 1
		let client: VncRfbClientLike
		try {
			client = this.#makeClient({framerate: this.#framerate})
		} catch (err) {
			this.#failClosed(new VmVncConnectError(`VM VNC ${this.#host}:${this.#port}: client init failed`, err))
			return
		}
		this.#client = client

		client.on('firstFrameUpdate', () => {
			this.#latestFrame = client.getFb() ?? this.#latestFrame
			this.#armThrottle()
			this.#settleResolved({width: client.clientWidth, height: client.clientHeight})
		})
		client.on('frameUpdated', () => {
			this.#latestFrame = client.getFb() ?? this.#latestFrame
		})
		client.on('connectError', (err) => this.#onConnectFailure(err))
		client.on('connectTimeout', () => this.#onConnectFailure(new Error('connect timeout')))
		client.on('authError', () => this.#onConnectFailure(new Error('auth error (unexpected over no-auth loopback)')))
		client.on('disconnected', () => this.#emitClose())
		client.on('closed', () => this.#emitClose())

		try {
			client.connect({host: this.#host, port: this.#port})
		} catch (err) {
			this.#onConnectFailure(err)
		}
	}

	/** Bounded ECONNREFUSED retry (pre-first-frame only); anything else fails closed. After a
	 *  successful start these become post-connect signals routed to the 'error' listeners. */
	#onConnectFailure(err: unknown): void {
		if (this.#settled) {
			// Post-connect transport error — surface to subscribers, don't touch start().
			this.#emitError(err)
			return
		}
		const code = (err as {code?: string} | undefined)?.code
		if (code === 'ECONNREFUSED' && this.#connectAttempts < MAX_CONNECT_ATTEMPTS && !this.#stopped) {
			this.#logger?.verbose?.(
				`vm-vnc-source: ECONNREFUSED on attempt ${this.#connectAttempts}, retrying in ${this.#retryDelayMs}ms`,
			)
			const t = setTimeout(() => {
				if (!this.#settled && !this.#stopped) this.#tryConnect()
			}, this.#retryDelayMs)
			t.unref?.()
			return
		}
		this.#failClosed(
			new VmVncConnectError(
				`VM VNC ${this.#host}:${this.#port}: connect failed after ${this.#connectAttempts} attempt(s) (code=${code ?? 'unknown'})`,
				err,
			),
		)
	}

	#armThrottle(): void {
		if (this.#tickTimer || this.#stopped) return
		const intervalMs = Math.max(1, Math.round(1000 / this.#framerate))
		this.#tickTimer = setInterval(() => {
			if (this.#stopped) return
			const frame = this.#latestFrame
			if (frame && this.#frameCb) {
				try {
					this.#frameCb(frame)
				} catch (err) {
					this.#logger?.error?.('vm-vnc-source: onFrame callback threw', err)
				}
			}
		}, intervalMs)
		this.#tickTimer.unref?.()
	}

	onFrame(cb: (frame: Buffer) => void): void {
		this.#frameCb = cb
	}

	async stop(): Promise<void> {
		if (this.#stopped) return // idempotent
		this.#stopped = true
		if (this.#tickTimer) {
			clearInterval(this.#tickTimer)
			this.#tickTimer = null
		}
		if (this.#startDeadline) {
			clearTimeout(this.#startDeadline)
			this.#startDeadline = null
		}
		this.#frameCb = null
		this.#latestFrame = null
		// Best-effort RFB teardown — a throwing disconnect must never break the caller.
		try {
			this.#client?.disconnect()
		} catch (err) {
			this.#logger?.warn?.(`vm-vnc-source: disconnect threw during stop (ignored): ${String(err)}`)
		}
		this.#client = null
		// If start() never settled, reject it fail-closed so a caller awaiting start() during a
		// stop() never hangs.
		if (!this.#settled) {
			this.#settle()
			this.#rejectStart?.(new VmVncConnectError(`VM VNC ${this.#host}:${this.#port}: stopped before first frame`))
		}
	}

	on(event: 'error' | 'close', cb: (err?: unknown) => void): void {
		if (event === 'error') this.#errorListeners.push(cb)
		else this.#closeListeners.push(cb)
	}

	// ── settle helpers ──────────────────────────────────────────────────────────────────
	#settle(): void {
		this.#settled = true
		if (this.#startDeadline) {
			clearTimeout(this.#startDeadline)
			this.#startDeadline = null
		}
	}

	#settleResolved(dims: {width: number; height: number}): void {
		if (this.#settled) return
		this.#settle()
		this.#resolveStart?.(dims)
	}

	#failClosed(err: VmVncConnectError): void {
		this.#emitError(err) // notify subscribers even for a start-time failure
		if (this.#settled) return
		this.#settle()
		this.#logger?.error?.(err.message, err.cause)
		this.#rejectStart?.(err)
	}

	#emitError(err?: unknown): void {
		for (const l of this.#errorListeners) {
			try {
				l(err)
			} catch {
				/* a listener must never break the source */
			}
		}
	}

	#emitClose(): void {
		for (const l of this.#closeListeners) {
			try {
				l()
			} catch {
				/* noop */
			}
		}
	}
}

/**
 * Production factory: a real `vnc-rfb-client` requesting Raw encoding ONLY (RFC 6143
 * mandatory fallback — no Hextile/ZRLE decode complexity, and loopback makes uncompressed
 * pixels free) at the target framerate. Keeping the default true-colour (NOT set8BitColor)
 * means getFb() yields 32bpp BGRA directly (the raw decoder's byte order).
 */
function defaultClientFactory(init: {framerate: number}): VncRfbClientLike {
	const client = new VncRfbClient({
		fps: init.framerate,
		encodings: [VncRfbClient.consts.encodings.raw],
	})
	return client as unknown as VncRfbClientLike
}
