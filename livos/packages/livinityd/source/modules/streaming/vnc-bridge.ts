/**
 * Phase 102-09 — vnc-bridge.ts.
 *
 * D-102-X11VNC-WHOLE-DISPLAY — `x11vnc -display :N` whole-display capture is
 * the CANONICAL spawn mode. Per-app Xvfb (Phase 102-01 DisplayAllocator +
 * XvfbSpawner) gives each app its own 1280x720 X server; x11vnc captures the
 * entire canvas with no window-coord translation, no WID polling, no
 * 1920x1080 resolution drift.
 *
 * Phase 102+ callers should use `spawnVncForDisplay({display, rfbPort})` —
 * the sugar wrapper exported at the bottom of this file hides the legacy
 * `{wid}` opt and gives a clean API surface that's display-only.
 *
 * Legacy: `x11vnc -id 0xHEX` (single-window region capture from the Phase 99
 * baseline) is retained on the `spawnVncForWindow({wid})` path for back-compat
 * with any caller that still tracks individual window IDs (v33 idle-cleanup
 * poller, integration tests). The `wid` opt is marked @deprecated in
 * SpawnVncOpts; new callers should prefer the display path.
 *
 * Owns:
 *   - x11vnc spawn — whole-display (canonical) and per-window (legacy).
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
import {getDesktopUser, getDesktopUid} from '../system/desktop-user.js'

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
	/**
	 * @deprecated Legacy single-window region capture (`x11vnc -id 0xHEX`).
	 *
	 * Phase 99/100-08 baseline that bound each WebApp's x11vnc to a specific
	 * X window ID under the shared `:1` display. Retained for back-compat
	 * with callers that still track individual window IDs (v33 idle-cleanup
	 * poller, legacy integration tests). New callers should use the canonical
	 * `display` path or — better — the `spawnVncForDisplay()` sugar wrapper
	 * that hides this opt entirely.
	 */
	wid?: number
	/**
	 * Canonical whole-display capture (`x11vnc -display :N`).
	 *
	 * Phase 102 (D-102-X11VNC-WHOLE-DISPLAY) — per-app Xvfb (via
	 * DisplayAllocator + XvfbSpawner) gives each app its own 1280x720 X
	 * server, so x11vnc captures the entire canvas. No window-coord
	 * translation, no WM_CLASS filtering, no WID polling for streaming.
	 *
	 * When set, takes precedence over `wid`; the DISPLAY env prefix flips
	 * to this value. The Xvfb display lifecycle (start/stop) is managed
	 * upstream by the caller (window-manager / native-app-binder).
	 *
	 * Phase 102+ callers should prefer `spawnVncForDisplay({display, rfbPort})`
	 * for a cleaner API surface that doesn't carry the legacy `wid` opt.
	 */
	display?: string
	rfbPort: number
	spawnFactory?: VncSpawnFactory
	logger?: VncBridgeLogger
}

/**
 * Spawn x11vnc bound to either (a) a whole X display (canonical, Phase
 * 102 D-102-X11VNC-WHOLE-DISPLAY — `x11vnc -display :N`) when `opts.display`
 * is provided, OR (b) a single window (legacy, Phase 99 baseline —
 * `x11vnc -id 0xHEX`) when only `opts.wid` is provided.
 *
 * Phase 102+ Default Path
 *   The display branch is the canonical mode. Per-app Xvfb (from
 *   DisplayAllocator + XvfbSpawner in Phase 102-01) gives each app a
 *   dedicated 1280x720 X server, so x11vnc captures the entire canvas
 *   directly — no window-coord translation, no resolution drift, no WID
 *   polling for streaming. When `opts.display` is set, the DISPLAY env
 *   prefix is pinned to that value so x11vnc opens the correct X server.
 *
 *   Prefer the `spawnVncForDisplay({display, rfbPort})` sugar wrapper
 *   below over calling this function directly — it gives a cleaner API
 *   surface without the legacy `wid` opt.
 *
 * Legacy Path
 *   The `-id 0xHEX` branch is retained for back-compat with callers that
 *   still track individual window IDs (idle-cleanup poller, integration
 *   tests). The `wid` field is marked @deprecated in SpawnVncOpts.
 *
 * Returns the ChildProcess. Caller is responsible for killing it on
 * lifecycle close (stream stop, app close).
 */
export function spawnVncForWindow(opts: SpawnVncOpts): ChildProcess {
	const factory = opts.spawnFactory ?? nodeSpawn
	// Phase 102-09 — when `opts.display` is set (canonical path) the DISPLAY
	// env prefix is pinned to that per-app Xvfb (`:10`, `:11`, ...). When
	// only `opts.wid` is set (legacy path), DISPLAY falls back to the
	// shared `:1` from WEBAPPS_X11_ENV (Phase 99/100-08 baseline).
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
	// D-99-01 canonical argv (locked in 99-01-SUMMARY.md). Same sudo -n -u
	// bruce + DISPLAY pattern as window-manager.ts Chrome spawn. Pitfall 1
	// mitigation: x11vnc inherits bruce's X session via env injection, NOT
	// via env_keep on sudoers.
	// P100-08-02: XAUTHORITY removed — x11vnc on Xvfb (-ac) needs no cookie.
	//
	// EXCEPTION — the host `:0` is the GDM-managed GNOME/Ubuntu Xorg, which is
	// access-control PROTECTED (NOT started with -ac like the Xvfb displays), so
	// x11vnc must present the GDM session cookie via -auth or it fails to open
	// the display. The desktop user's GDM cookie lives at
	// /run/user/<uid>/gdm/Xauthority. Only `:0` gets this; -ac Xvfb displays
	// (:1/:10/:60…) keep the cookie-free path. Verified: x11vnc -display :0
	// -auth … binds + serves the live GNOME desktop.
	// WS1 (2026-06-11): resolve the desktop uid/user at runtime — the autologin
	// owner may NOT be uid 1000 on a real desktop box (the human owner holds it).
	const GDM_XAUTHORITY = `/run/user/${getDesktopUid()}/gdm/Xauthority`
	const authFlags: string[] =
		opts.display === ':0' ? ['-auth', GDM_XAUTHORITY] : []
	const args = [
		'-n',
		'-u',
		getDesktopUser(),
		`DISPLAY=${displayForEnv}`,
		...(opts.display === ':0' ? [`XAUTHORITY=${GDM_XAUTHORITY}`] : []),
		'/usr/bin/x11vnc',
		...captureFlags,
		...authFlags,
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
	// Phase 102-09: log tag reflects capture mode — `display=:N` (canonical,
	// D-102-X11VNC-WHOLE-DISPLAY) vs. `wid=0xHEX` (legacy single-window path).
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
			opts.logger?.error?.(
				`x11vnc[${logTag}] crashed (code=${code} signal=${signal} argv=${JSON.stringify(args)})${tailMsg}`,
			)
		}
	})

	return proc
}

// ============================================================================
// Phase 102-09 — spawnVncForDisplay sugar (D-102-X11VNC-WHOLE-DISPLAY).
//
// Clean API surface for callers that operate strictly under the per-app
// Xvfb model (Phase 102-04 window-manager, Phase 102-05 native-app-binder).
// Identical behaviour to `spawnVncForWindow({display, rfbPort, ...})` but
// the type signature does not expose the legacy `wid` opt, so consumers
// can't accidentally fall back to single-window capture.
// ============================================================================

export type SpawnVncForDisplayOpts = {
	/** Canonical Phase 102+ — capture whole Xvfb display (`:10`, `:11`, ...). */
	display: string
	/** RFB TCP port — typically allocated by PortAllocator (range 15900..15999). */
	rfbPort: number
	spawnFactory?: VncSpawnFactory
	logger?: VncBridgeLogger
}

/**
 * Phase 102-09 — sugar wrapper that spawns x11vnc bound to the whole Xvfb
 * display `opts.display`. Equivalent to calling
 * `spawnVncForWindow({display, rfbPort, ...})` but the API surface omits
 * the legacy `wid` opt entirely.
 *
 * D-102-X11VNC-WHOLE-DISPLAY — this is the canonical Phase 102+ entry point
 * for x11vnc spawn. Prefer it over `spawnVncForWindow` for new callers.
 */
export function spawnVncForDisplay(opts: SpawnVncForDisplayOpts): ChildProcess {
	return spawnVncForWindow({
		display: opts.display,
		rfbPort: opts.rfbPort,
		spawnFactory: opts.spawnFactory,
		logger: opts.logger,
	})
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
					opts.logger?.warn?.(
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
					opts.logger?.warn?.(`vnc-bridge: ws.send threw — destroying tcp`, err)
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
				opts.logger?.warn?.(`vnc-bridge: tcp error`, err)
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
			opts.logger?.warn?.(
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
		opts.logger?.warn?.(`vnc-bridge: ws error`, err)
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
