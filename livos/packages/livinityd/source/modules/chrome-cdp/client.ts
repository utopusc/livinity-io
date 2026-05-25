/**
 * Phase 101-01 — ChromeCdpClient.
 *
 * Typed wrapper around the `chrome-remote-interface` npm package. Owns the
 * persistent CDP connection to the singleton Chrome booted by `bootstrap.ts`.
 *
 * Owns:
 *   - CDP connect/reconnect lifecycle (lazy: `ensureConnected()` re-runs
 *     `connect()` if the previous client emitted `disconnect`).
 *   - Typed error classes (`CdpDisconnectedError`, `CdpTimeoutError`) — same
 *     `{code: string}` shape as `WebappCapExceededError` / `WindowNotFoundError`.
 *   - Single-call high-level surface for the consumers wired in Wave 2+
 *     (`createWindowForUrl`, `minimizeWindow`, `closeTarget`,
 *     `findTargetByUrl`, `getWindowIdForTarget`).
 *
 * Does NOT own:
 *   - Chrome process lifecycle (lives in `bootstrap.ts`).
 *   - Per-WebApp window orchestration (lives in `webapps/window-manager.ts`,
 *     rewritten in Plan 101-04 to call this client).
 *
 * RESEARCH correction #1 (101-RESEARCH.md §Summary lines 14-15): CDP's
 * `Browser.setWindowBounds` CANNOT combine `windowState` with `left`,
 * `top`, `width` or `height` in a single call — the spec rejects it.
 * Therefore `createWindowForUrl({left, top})` emits a bounds-only second
 * call AFTER `Target.createTarget`, and `minimizeWindow` emits its own
 * state-only call. The pattern is documented inline at the call-sites so
 * future refactors don't accidentally re-merge them.
 *
 * Sacred SHA gate: liv/packages/core/src/sdk-agent-runner.ts MUST equal
 * f3538e1d811992b782a9bb057d1b7f0a0189f95f before AND after every commit.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import CDP from 'chrome-remote-interface'

/** Thrown when a high-level method is invoked but the underlying CDP socket
 *  is gone. Today this is a guard-rail — `ensureConnected()` will lazy
 *  reconnect; downstream callers can catch + retry if reconnect itself
 *  fails. */
export class CdpDisconnectedError extends Error {
	code = 'CDP_DISCONNECTED'
	constructor() {
		super('chrome-cdp: not connected')
	}
}

/**
 * Phase 208-09 R9 — lightweight HTTP probe of Chrome's `/json/version`
 * endpoint. Used by `ChromeCdpClient.connect({preferAttach:true})` to gate the
 * CDP socket connect call: if Chrome isn't listening on the loopback CDP port
 * the probe fails fast (default 2s timeout) and the caller can either throw a
 * helpful error OR fall through to a legacy spawn/connect-retry path.
 *
 * The browser tool wires `allowSpawnFallback:false` so the failure surface is
 * "no Chrome at 127.0.0.1:9222" rather than the 5-attempt × 200ms CDP retry
 * loop that masks the real cause as `CDP_TIMEOUT`. The bootstrap path (which
 * spawns Chrome at livinityd boot via `bootstrap.ts`) is the only sanctioned
 * way to bring Chrome up — the browser tool MUST attach, never spawn.
 */
export interface ProbeAttachResult {
	available: boolean
	version?: string
	error?: string
}

export async function probeAttachTarget(opts: {
	host: string
	port: number
	timeoutMs?: number
}): Promise<ProbeAttachResult> {
	const url = `http://${opts.host}:${opts.port}/json/version`
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 2000)
	try {
		const res = await fetch(url, {signal: controller.signal})
		if (!res.ok) return {available: false, error: `HTTP ${res.status}`}
		const body = (await res.json()) as {Browser?: string}
		return {available: true, version: body.Browser ?? 'unknown'}
	} catch (err) {
		return {available: false, error: (err as Error).message}
	} finally {
		clearTimeout(timer)
	}
}

/** Thrown when `connect()` exhausts its retry budget without succeeding.
 *  The number of attempts is `connectRetries` (default 5), spaced 200ms
 *  apart. `connectTimeoutMs` is carried for log diagnostics only. */
export class CdpTimeoutError extends Error {
	code = 'CDP_TIMEOUT'
	constructor(public timeoutMs: number) {
		super(`chrome-cdp: connect timeout after ${timeoutMs}ms`)
	}
}

export type ChromeCdpLogger = {
	info: (msg: string, ...args: unknown[]) => void
	warn: (msg: string, ...args: unknown[]) => void
	error: (msg: string, ...args: unknown[]) => void
	verbose?: (msg: string, ...args: unknown[]) => void
}

/** Pluggable CDP factory. Tests inject a stub returning a mock CDP client;
 *  production omits and the default `CDP({...})` runs. */
export type CdpFactory = (opts: {
	host: string
	port: number
	target?: any
}) => Promise<any>

export interface ChromeCdpClientOpts {
	host?: string
	port?: number
	logger?: ChromeCdpLogger
	cdpFactory?: CdpFactory
	connectTimeoutMs?: number
	connectRetries?: number
}

export class ChromeCdpClient {
	private client: any | null = null
	private readonly host: string
	private readonly port: number
	private readonly logger?: ChromeCdpLogger
	private readonly cdpFactory: CdpFactory
	private readonly connectTimeoutMs: number
	private readonly connectRetries: number
	// Phase 101-04 — pid of the Chrome process this client is connected to.
	// Populated by `setChromePid()` from the livinityd.start() try/catch
	// AFTER `bootstrapChrome` resolves (pid is the `pid` field of the
	// `ChromeBootstrapHandle`). Consumed by `getChromePid()` so the
	// WebAppWindowManager can baseline `xdotool search --pid <pid>` BEFORE
	// driving CDP createTarget — the only way to narrow the wid race to the
	// connected Chrome rather than the whole X11 root.
	//
	// Implementation choice (a) in PLAN Task 2: cache from bootstrap. The
	// alternative (b) — derive via /json/version + pgrep — is heavier and
	// only needed for clients that didn't run bootstrap (none today). If a
	// future caller calls `getChromePid()` without `setChromePid()` first,
	// the method throws so the bug is loud, not silent.
	private chromePid: number | null = null

	constructor(opts: ChromeCdpClientOpts = {}) {
		this.host = opts.host ?? '127.0.0.1'
		this.port = opts.port ?? 9222
		this.logger = opts.logger
		this.cdpFactory = opts.cdpFactory ?? ((o) => CDP(o as any) as unknown as Promise<any>)
		this.connectTimeoutMs = opts.connectTimeoutMs ?? 5_000
		this.connectRetries = opts.connectRetries ?? 5
	}

	/**
	 * Phase 101-04 — cache the pid of the connected Chrome process. Called
	 * by `livinityd.start()` right after `bootstrapChrome` resolves with a
	 * `ChromeBootstrapHandle`. Allows `getChromePid()` to return a value
	 * without re-shelling out to `/json/version` + `pgrep`.
	 */
	setChromePid(pid: number): void {
		this.chromePid = pid
	}

	/**
	 * Phase 101-04 — return the cached pid set by `setChromePid()`. Throws
	 * if the pid has not been wired in yet (loud failure rather than
	 * silently returning 0, which `xdotool search --pid 0` would mis-target).
	 *
	 * Returns `Promise<number>` for symmetry with the other async methods
	 * even though the cached read is sync — keeps the consumer surface
	 * uniform and leaves room for the future implementation choice (b)
	 * (derive via `/json/version` + `pgrep`) without churning callers.
	 */
	async getChromePid(): Promise<number> {
		if (this.chromePid == null) {
			throw new Error(
				'chrome-cdp: getChromePid() called before setChromePid() — bootstrap must complete first',
			)
		}
		return this.chromePid
	}

	/**
	 * Attempt to connect to CDP, retrying up to `connectRetries` times with
	 * 200ms backoff between attempts. Throws `CdpTimeoutError` if every
	 * attempt fails.
	 *
	 * Targets the browser-level CDP socket via the `target` selector
	 * (preferred over the first available page target — Plan 101-04 needs
	 * `Browser.*` and `Target.*` domains, both of which are on the
	 * browser-level socket).
	 *
	 * Phase 208-09 R9 — `preferAttach` gates the CDP socket connect with a
	 * lightweight `/json/version` probe. When `true`:
	 *   - probe succeeds → CDP connect runs as usual (attach path)
	 *   - probe fails AND `allowSpawnFallback:false` (default for the browser
	 *     tool) → throws a helpful error mentioning `:9222` and the
	 *     `--remote-debugging-port` flag the caller should ensure is set
	 *     BEFORE Liv AI is asked to drive the browser. NO CDP retries.
	 *   - probe fails AND `allowSpawnFallback:true` → falls through to the
	 *     legacy CDP-retry loop (existing behaviour pre-208-09 — preserved
	 *     for callers that may eventually want a "spawn on demand" path).
	 *
	 * Calling `connect()` with no args preserves the pre-208-09 behaviour:
	 * NO probe, factory invoked directly with the retry loop. This is the
	 * back-compat surface for `webapps/window-manager.ts` + other in-tree
	 * consumers that already rely on the bootstrap-spawned Chrome being up.
	 */
	async connect(opts: {
		preferAttach?: boolean
		allowSpawnFallback?: boolean
	} = {}): Promise<void> {
		if (opts.preferAttach === true) {
			const probe = await probeAttachTarget({host: this.host, port: this.port})
			if (!probe.available) {
				if (opts.allowSpawnFallback !== true) {
					throw new Error(
						`chrome-cdp: no Chrome at ${this.host}:${this.port}/json/version. ` +
							`Start it with --remote-debugging-port=${this.port} (the LivOS ` +
							`bootstrap.ts spawn does this) or pass allowSpawnFallback:true. ` +
							`Probe error: ${probe.error ?? 'unknown'}`,
					)
				}
				// fall through to legacy CDP retry path below
			}
		}
		let lastErr: unknown
		for (let attempt = 0; attempt < this.connectRetries; attempt++) {
			try {
				this.client = await this.cdpFactory({
					host: this.host,
					port: this.port,
					target: (targets: any[]) =>
						targets.find((t) => t.type === 'browser') ?? targets[0],
				})
				this.client.on('disconnect', () => {
					this.logger?.warn(
						'chrome-cdp: disconnected; will reconnect on next call',
					)
					this.client = null
				})
				this.logger?.info(
					`chrome-cdp: connected to ${this.host}:${this.port}`,
				)
				return
			} catch (err) {
				lastErr = err
				this.logger?.verbose?.(
					`chrome-cdp: connect attempt ${attempt + 1}/${this.connectRetries} failed: ${(err as Error).message}`,
				)
				await new Promise((r) => setTimeout(r, 200))
			}
		}
		this.logger?.error(
			`chrome-cdp: connect exhausted (${this.connectRetries} attempts); last error: ${(lastErr as Error)?.message ?? 'unknown'}`,
		)
		throw new CdpTimeoutError(this.connectTimeoutMs)
	}

	/** Lazy-reconnect helper. Public methods all call this first so that a
	 *  disconnect event (which nulls `this.client`) gets transparently
	 *  recovered on the next operation. */
	async ensureConnected(): Promise<void> {
		if (!this.client) await this.connect()
	}

	/**
	 * Open a new top-level Chrome window for the given URL via CDP.
	 *
	 * Returns `{targetId, windowId}`:
	 *   - `targetId` is the CDP Target identifier (used by `closeTarget`).
	 *   - `windowId` is the CDP browser-window identifier (used by
	 *     `minimizeWindow` / future `setBounds`).
	 *
	 * If `bounds.left` or `bounds.top` is provided, a SECOND
	 * `Browser.setWindowBounds` call is issued with bounds only — never
	 * combined with `windowState` (RESEARCH correction #1).
	 */
	async createWindowForUrl(
		url: string,
		bounds: {
			width: number
			height: number
			left?: number
			top?: number
			background?: boolean
		},
	): Promise<{targetId: string; windowId: number}> {
		await this.ensureConnected()
		const {targetId} = await this.client.Target.createTarget({
			url,
			newWindow: true,
			background: bounds.background ?? false,
			width: bounds.width,
			height: bounds.height,
		})
		const {windowId} = await this.client.Browser.getWindowForTarget({targetId})
		// RESEARCH correction #1: setWindowBounds rejects state+bounds in
		// the same call. If a cascade position was requested, set it with a
		// bounds-only payload AFTER createTarget. Never combine with
		// `windowState` here — `minimizeWindow` issues its own state-only
		// call.
		if (bounds.left !== undefined || bounds.top !== undefined) {
			await this.client.Browser.setWindowBounds({
				windowId,
				bounds: {
					left: bounds.left,
					top: bounds.top,
					width: bounds.width,
					height: bounds.height,
				},
			})
		}
		return {targetId, windowId}
	}

	/**
	 * Minimize a window. Issued as a SEPARATE `setWindowBounds` call with
	 * `windowState` only — never combined with `left`/`top`/`width`/`height`
	 * (RESEARCH correction #1).
	 */
	async minimizeWindow(windowId: number): Promise<void> {
		await this.ensureConnected()
		await this.client.Browser.setWindowBounds({
			windowId,
			bounds: {windowState: 'minimized'},
		})
	}

	/** Close a Chrome target by ID (terminates its window). */
	async closeTarget(targetId: string): Promise<void> {
		await this.ensureConnected()
		await this.client.Target.closeTarget({targetId})
	}

	/**
	 * Resolve the CDP browser-windowId for a given target. Wraps
	 * `Browser.getWindowForTarget` so callers (e.g. the about:blank shell
	 * minimize path in livinityd.start()) don't have to reach into the
	 * private `this.client` field.
	 */
	async getWindowIdForTarget(targetId: string): Promise<number> {
		await this.ensureConnected()
		const {windowId} = await this.client.Browser.getWindowForTarget({targetId})
		return windowId
	}

	/**
	 * Scan the current CDP target list and return the first target whose
	 * URL satisfies the predicate. Returns null if no match.
	 */
	async findTargetByUrl(
		predicate: (url: string) => boolean,
	): Promise<{targetId: string; url: string} | null> {
		await this.ensureConnected()
		const {targetInfos} = await this.client.Target.getTargets()
		const hit = targetInfos.find((t: any) => predicate(t.url))
		return hit ? {targetId: hit.targetId, url: hit.url} : null
	}

	/** Tear down the CDP connection. Idempotent. Underlying client errors
	 *  during close are swallowed because the only post-condition we care
	 *  about is `this.client === null`. */
	async close(): Promise<void> {
		if (this.client) {
			try {
				await this.client.close()
			} catch {
				/* noop — best-effort close */
			}
			this.client = null
		}
	}
}
