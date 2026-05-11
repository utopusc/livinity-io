/**
 * Phase 99-02 — vnc-bridge.ts.
 *
 * Owns:
 *   - Per-window x11vnc spawn (D-99-01 canonical argv from 99-01-SUMMARY.md).
 *   - WS↔TCP byte bridge (D-99-02 — pure-Node, no websockify subprocess).
 *   - 4 MB backpressure drop (mirrors fmp4-fanout.ts:246).
 *   - Bidirectional close propagation.
 *   - ECONNREFUSED retry (3× 100 ms — Pitfall 4 mitigation).
 *   - stderr tail dump on x11vnc crash (D-99-07, pattern from 782cafeb).
 *
 * Does NOT own:
 *   - StreamSession lifecycle (lives in stream-manager.ts after 99-03).
 *   - WS upgrade handshake / JWT auth (lives in server/index.ts after 99-04).
 *   - Window discovery / wid resolution (lives in window-discovery.ts).
 *
 * Sacred SHA gate: liv/packages/core/src/sdk-agent-runner.ts MUST equal
 * f3538e1d811992b782a9bb057d1b7f0a0189f95f before AND after every commit.
 */

import {spawn as nodeSpawn, type ChildProcess, type SpawnOptions} from 'node:child_process'
import {connect as nodeNetConnect, type Socket} from 'node:net'

import {WEBAPPS_X11_ENV} from '../webapps/window-discovery.js'

/** 4 MB — matches Fmp4Fanout default (fmp4-fanout.ts broadcast threshold). */
export const BACKPRESSURE_BYTES = 4 * 1024 * 1024

/** Default ECONNREFUSED retry delay (Pitfall 4 — x11vnc bind race). */
const DEFAULT_RETRY_DELAY_MS = 100
const MAX_RETRY_ATTEMPTS = 3

export type VncBridgeLogger = {
	info: (msg: string, ...args: unknown[]) => void
	warn: (msg: string, ...args: unknown[]) => void
	error: (msg: string, ...args: unknown[]) => void
	verbose?: (msg: string, ...args: unknown[]) => void
}

export type VncSpawnFactory = (
	cmd: string,
	args: string[],
	options?: SpawnOptions,
) => ChildProcess

export type SpawnVncOpts = {
	/** Single-window capture (D-99-01 baseline; post-100-10-08 default path) —
	 *  `x11vnc -id 0xHEX`. Each WebApp gets its own x11vnc bound to its wid;
	 *  Chrome's singleton lock naturally serializes multi-window on a single
	 *  display, so per-wid capture isolates each WebApp's pixels.
	 *
	 *  Note: under shared `:1` display, two windows on the same display CAN
	 *  occlude each other; the per-wid pixmap read via XComposite-aware x11vnc
	 *  still returns the window's framebuffer (not the visible region),
	 *  carrying forward the Phase 99 behavior. */
	wid?: number
	/** Whole-display capture (originally Phase 100-10-01 / D-100-10-A —
	 *  REVERTED in 100-10-08 because Chrome singleton lock + shared
	 *  `--user-data-dir` are architecturally incompatible with per-WebApp
	 *  displays). The branch is RETAINED in code as scaffolding for the
	 *  Phase 101 CDP architecture (Luse drives multi-target Chrome via
	 *  DevTools Protocol). When set, takes precedence over `wid`; the
	 *  DISPLAY env prefix flips to this value. CURRENT CALLERS DO NOT SET
	 *  THIS; setting it ad-hoc requires that the consumer manages the
	 *  display's Xvfb lifecycle separately. */
	display?: string
	rfbPort: number
	spawnFactory?: VncSpawnFactory
	logger?: VncBridgeLogger
}

/**
 * Spawn x11vnc bound to either a single Chrome window (D-99-01 / 100-08
 * baseline, RESTORED in 100-10-08 as the default path; `-id 0xHEX`) OR a
 * whole X display (originally 100-10-01 D-100-10-A; REVERTED in 100-10-08
 * but the `-display :N` branch is kept as Phase 101 CDP scaffolding).
 * When `opts.display` is provided it takes precedence — the argv switches
 * to whole-display capture and DISPLAY in the env prefix is pinned to that
 * display.
 *
 * Post-100-10-08 callers (window-manager + stream-manager vnc-window) pass
 * `{wid}` only. The `display` path waits on Phase 101.
 *
 * Returns the ChildProcess. Caller is responsible for killing it on
 * lifecycle close (window-gone, streams.stop).
 */
export function spawnVncForWindow(opts: SpawnVncOpts): ChildProcess {
	const factory = opts.spawnFactory ?? nodeSpawn
	// Phase 100-10-08 (D-100-10-A reverted): -display branch RETAINED for
	// Phase 101 CDP scaffolding but the post-revert default-callers don't
	// set `opts.display`, so `displayForEnv` resolves to WEBAPPS_X11_ENV.DISPLAY
	// (`:1`, the 100-08-01 singleton). When `opts.display` is provided (Phase
	// 101 CDP path or test fixtures), the env-prefix flips appropriately.
	const displayForEnv = opts.display ?? WEBAPPS_X11_ENV.DISPLAY
	const captureFlags: string[] =
		opts.display !== undefined
			? ['-display', opts.display]
			: ['-id', '0x' + (opts.wid ?? 0).toString(16)]
	if (opts.display === undefined && (opts.wid === undefined || opts.wid <= 0)) {
		throw new Error(
			`vnc-bridge.spawnVncForWindow: must provide either {display} or {wid>0} (got display=${opts.display}, wid=${opts.wid})`,
		)
	}
	// D-99-01 canonical argv (locked in 99-01-SUMMARY.md). The whole-display
	// branch from 100-10-01 (D-100-10-A) is RETAINED here but reverted out of
	// the live path in 100-10-08 (single :1 + shared profile). The sudo -n -u
	// bruce + DISPLAY pattern matches window-manager.ts Chrome spawn. Pitfall
	// 1 mitigation: x11vnc inherits bruce's X session via the env injection,
	// NOT via env_keep on sudoers.
	// P100-08-02: XAUTHORITY removed — x11vnc on Xvfb (-ac) needs no cookie.
	const args = [
		'-n',
		'-u',
		'bruce',
		`DISPLAY=${displayForEnv}`,
		'/usr/bin/x11vnc',
		...captureFlags,
		'-rfbport',
		String(opts.rfbPort),
		'-localhost',
		'-shared',
		'-forever',
		'-noxdamage',
		'-nopw',
	]

	const proc = factory('sudo', args, {
		stdio: ['ignore', 'ignore', 'pipe'],
		env: {...process.env, ...WEBAPPS_X11_ENV},
	})

	// D-99-07: stderr tail diagnostic (mirrors stream-manager.ts encoder pattern,
	// originally landed in commit 782cafeb for ffmpeg). Last 50 lines kept;
	// dumped to logger.error on non-zero exit.
	// Phase 100-10-08 (D-100-10-A reverted): log tag reflects capture mode —
	// `wid=0xHEX` (post-revert default) vs. `display=:N` (Phase 101 scaffold).
	const logTag = opts.display !== undefined ? `display=${opts.display}` : `wid=${opts.wid}`
	const stderrTail: string[] = []
	proc.stderr?.on('data', (chunk: Buffer) => {
		const line = chunk.toString('utf-8').trim()
		if (!line) return
		opts.logger?.verbose?.(`x11vnc[${logTag}] stderr: ${line}`)
		stderrTail.push(line)
		if (stderrTail.length > 50) stderrTail.shift()
	})

	proc.on('exit', (code, signal) => {
		if (code !== 0 && code !== null) {
			const tailMsg =
				stderrTail.length > 0
					? `\n--- x11vnc stderr (last ${stderrTail.length}) ---\n${stderrTail.join('\n')}`
					: ' (no stderr captured)'
			opts.logger?.error(
				`x11vnc[${logTag}] crashed (code=${code} signal=${signal} argv=${JSON.stringify(args)})${tailMsg}`,
			)
		}
	})

	return proc
}

// ============================================================================

export type VncNetConnect = (port: number, host: string) => Socket

/**
 * Minimal subset of `ws` WebSocket the bridge requires. Defined here so
 * tests can pass a plain EventEmitter mock without importing the real ws
 * type.
 */
export type VncBridgeSocket = {
	send: (data: Buffer) => void
	close: (code?: number, reason?: string) => void
	on: (event: string, listener: (...args: unknown[]) => void) => unknown
	bufferedAmount?: number
	readyState?: number
}

export type AttachVncBridgeOpts = {
	host: string
	port: number
	netConnect?: VncNetConnect
	/** Override for tests — defaults to 100 ms (Pitfall 4 mitigation). */
	retryDelayMs?: number
	/** Override for tests — defaults to BACKPRESSURE_BYTES (4 MB). */
	backpressureBytes?: number
	logger?: VncBridgeLogger
}

/**
 * Bridge a WebSocket subscriber to a per-window x11vnc TCP rfbport.
 *
 * Behaviour:
 *   - On connect: pipe ws.message → tcp.write, tcp.data → ws.send (binary).
 *   - On bufferedAmount > 4 MB: ws.close(1013, 'try again later') + tcp.destroy.
 *   - On ws close/error: tcp.destroy.
 *   - On tcp close/error: ws.close(1011, ...).
 *   - On initial ECONNREFUSED: retry 3× with 100 ms backoff. After 3 fails,
 *     ws.close(1011, 'vnc backend unreachable').
 *
 * Per D-99-02 — auth gate stays in /ws/stream/:streamId; this function is
 * only called AFTER JWT verify + ownership check.
 */
export function attachVncBridge(ws: VncBridgeSocket, opts: AttachVncBridgeOpts): void {
	const connect =
		opts.netConnect ??
		((port: number, host: string) => nodeNetConnect({port, host}) as Socket)
	const retryDelay = opts.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
	const backpressureBytes = opts.backpressureBytes ?? BACKPRESSURE_BYTES
	let attempts = 0
	let activeTcp: Socket | null = null
	let wsClosed = false
	let backendDone = false

	const tryConnect = (): void => {
		attempts += 1
		const tcp = connect(opts.port, opts.host)
		let connected = false

		tcp.on('connect', () => {
			connected = true
			activeTcp = tcp
			// Wire byte pipe ws → tcp
			ws.on('message', (data: unknown) => {
				const buf = data as Buffer
				if ((tcp as Socket & {writable?: boolean}).writable !== false) {
					tcp.write(buf)
				}
			})
			// Wire byte pipe tcp → ws (with backpressure)
			tcp.on('data', (data: Buffer) => {
				const buffered = ws.bufferedAmount ?? 0
				if (buffered > backpressureBytes) {
					opts.logger?.warn(
						`vnc-bridge: dropping slow subscriber (buffered=${buffered} > ${backpressureBytes})`,
					)
					try {
						ws.close(1013, 'try again later')
					} catch {
						/* noop */
					}
					try {
						tcp.destroy()
					} catch {
						/* noop */
					}
					activeTcp = null
					backendDone = true
					return
				}
				try {
					ws.send(data)
				} catch (err) {
					opts.logger?.warn(`vnc-bridge: ws.send threw — destroying tcp`, err)
					try {
						tcp.destroy()
					} catch {
						/* noop */
					}
				}
			})
			// Close propagation: tcp side
			tcp.on('close', () => {
				if (wsClosed || backendDone) return
				backendDone = true
				try {
					ws.close(1011, 'vnc backend closed')
				} catch {
					/* noop */
				}
			})
			tcp.on('error', (err) => {
				opts.logger?.warn(`vnc-bridge: tcp error`, err)
				if (wsClosed || backendDone) return
				backendDone = true
				try {
					ws.close(1011, 'vnc backend error')
				} catch {
					/* noop */
				}
			})
		})

		tcp.on('error', (err: Error & {code?: string}) => {
			if (connected) return // post-connect errors handled above
			// Pitfall 4: x11vnc bind race — retry ECONNREFUSED up to 3×
			if (err.code === 'ECONNREFUSED' && attempts < MAX_RETRY_ATTEMPTS) {
				opts.logger?.verbose?.(
					`vnc-bridge: ECONNREFUSED on attempt ${attempts}, retrying in ${retryDelay}ms`,
				)
				setTimeout(() => {
					if (!wsClosed) tryConnect()
				}, retryDelay)
				return
			}
			// Out of retries OR non-ECONNREFUSED
			opts.logger?.warn(
				`vnc-bridge: connect failed after ${attempts} attempts (code=${err.code ?? 'unknown'})`,
			)
			if (!wsClosed) {
				wsClosed = true
				try {
					ws.close(1011, 'vnc backend unreachable')
				} catch {
					/* noop */
				}
			}
		})
	}

	// Close propagation: ws side (registered ONCE, not per-attempt).
	// ws.close → activeTcp.destroy. ws.error → activeTcp.destroy.
	ws.on('close', () => {
		wsClosed = true
		if (activeTcp) {
			try {
				activeTcp.destroy()
			} catch {
				/* noop */
			}
		}
	})
	ws.on('error', (err: unknown) => {
		opts.logger?.warn(`vnc-bridge: ws error`, err)
		wsClosed = true
		if (activeTcp) {
			try {
				activeTcp.destroy()
			} catch {
				/* noop */
			}
		}
	})

	tryConnect()
}
