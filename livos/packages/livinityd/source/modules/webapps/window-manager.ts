/**
 * Phase 93-10 — WebAppWindowManager.
 *
 * Orchestrator class. Composes window-discovery + pipewire-portal (or
 * geometry-tracker fallback) + StreamManager into the spawn / focus /
 * close / list surface for WebApps. Owns Map<webappId, ActiveWebApp> and
 * the idle-cleanup poller (5s xprop poll).
 *
 * Algorithm — spawn():
 *   1. Idempotency check (existing alive entry → return existing handle)
 *   2. Snapshot wid baseline (D-93-08)
 *   3. child_process.spawn('google-chrome', [`--app=${url}`],
 *      {detached:true, stdio:'ignore'}) then unref() — Chrome is NOT a
 *      livinityd child (D-V33-01: shared profile, no --user-data-dir).
 *      P100-02 (V33-MULTI-01 / G-100-B B1): site-specific-browser mode
 *      replaces `--new-window URL` to break Chrome IPC merge.
 *   4. findNewWindowMatching({titleHints, baselineWids, timeoutMs:5000})
 *   5. Timeout → throw {code:'WINDOW_NOT_FOUND', url}
 *   6. Try pipewirePortal.requestWindowSession() (primary, D-93-04)
 *   7. On PORTAL_UNAVAILABLE → fall back to GeometryTracker + crop ffmpeg
 *   8. streamManager.startStream({mode:'pipewire-fd' | 'window-crop', target})
 *   9. Store {webappId, userId, wid, mode, streamId, ...} in map
 *  10. Return {windowId, streamId, wsUrl}
 *
 * close({webappId, killWindow?}): stop stream → close portal session OR
 *   stop geometry tracker → optional `xdotool windowkill <wid>` →
 *   release map entry.
 */

import {URL} from 'node:url'
import {randomUUID} from 'node:crypto'
import type {ChildProcess} from 'node:child_process'

import type {StreamManager} from '../streaming/stream-manager.js'
import {
	snapshotWindowIds,
	findNewWindowMatching,
	isWindowAlive,
	activateWindow,
	getWindowGeometry,
	getScreenSize,
	clampGeometryToScreen,
	WEBAPPS_X11_ENV,
	type WindowInfo,
	type Geometry,
} from './window-discovery.js'
import {
	requestWindowSession,
	isPortalAvailable,
	PortalUnavailable,
	type WindowSessionResult,
} from './pipewire-portal.js'
import {GeometryTracker} from './geometry-tracker.js'

const DEFAULT_TITLE_TIMEOUT_MS = 5000
const DEFAULT_IDLE_POLL_MS = 5000
const DEFAULT_WEBAPP_CAP = 50

export class WebappCapExceededError extends Error {
	code = 'TOO_MANY_WEBAPPS'
	constructor(public limit: number) {
		super(`webapp cap exceeded (limit ${limit})`)
	}
}

export class WindowNotFoundError extends Error {
	code = 'WINDOW_NOT_FOUND'
	constructor(public url: string) {
		super(`no new window matching ${url} appeared within timeout`)
	}
}

export type SpawnFactory = (cmd: string, args: string[], options: {
	detached?: boolean
	stdio?: 'ignore' | 'pipe' | 'inherit'
	env?: NodeJS.ProcessEnv
}) => ChildProcess

export type WebAppWindowManagerOpts = {
	streamManager: Pick<StreamManager, 'startStream' | 'stopStream' | 'addSubscriber' | 'getFanout'>
	spawn: SpawnFactory
	logger?: {
		info: (msg: string, ...args: unknown[]) => void
		warn: (msg: string, ...args: unknown[]) => void
		error: (msg: string, ...args: unknown[]) => void
		verbose?: (msg: string, ...args: unknown[]) => void
	}
	/** Override the discovery surface for tests. */
	discovery?: {
		snapshotWindowIds: typeof snapshotWindowIds
		findNewWindowMatching: typeof findNewWindowMatching
		isWindowAlive: typeof isWindowAlive
		activateWindow: typeof activateWindow
		getWindowGeometry: typeof getWindowGeometry
	}
	/** Override the portal surface for tests. */
	portal?: {
		isPortalAvailable: typeof isPortalAvailable
		requestWindowSession: typeof requestWindowSession
	}
	/** Override geometry-tracker constructor for tests. */
	GeometryTrackerCtor?: typeof GeometryTracker
	/** Override Chrome launcher binary (default 'google-chrome'). */
	chromeBinary?: string
	titleTimeoutMs?: number
	idlePollMs?: number
	webappCap?: number
}

type ActiveWebApp = {
	webappId: string
	userId: string
	wid: number
	mode: 'pipewire-fd' | 'window-crop' | 'vnc-window'
	streamId: string
	wsUrl: string
	portalSession: WindowSessionResult | null
	geometryTracker: GeometryTracker | null
	url: string
}

export type SpawnOpts = {
	userId: string
	webappId: string
	url: string
	expectedTitle?: string
	desktopUid?: number
}

export type SpawnResult = {
	webappId: string
	windowId: number
	streamId: string
	wsUrl: string
}

export class WebAppWindowManager {
	private readonly active = new Map<string, ActiveWebApp>()
	private idleTimer: ReturnType<typeof setInterval> | null = null
	private readonly streamManager: WebAppWindowManagerOpts['streamManager']
	private readonly spawnFactory: SpawnFactory
	private readonly logger: WebAppWindowManagerOpts['logger']
	private readonly discovery: NonNullable<WebAppWindowManagerOpts['discovery']>
	private readonly portal: NonNullable<WebAppWindowManagerOpts['portal']>
	private readonly GeometryTrackerCtor: typeof GeometryTracker
	private readonly chromeBinary: string
	private readonly titleTimeoutMs: number
	private readonly idlePollMs: number
	private readonly webappCap: number

	constructor(opts: WebAppWindowManagerOpts) {
		this.streamManager = opts.streamManager
		this.spawnFactory = opts.spawn
		this.logger = opts.logger
		this.discovery = opts.discovery ?? {
			snapshotWindowIds,
			findNewWindowMatching,
			isWindowAlive,
			activateWindow,
			getWindowGeometry,
		}
		this.portal = opts.portal ?? {isPortalAvailable, requestWindowSession}
		this.GeometryTrackerCtor = opts.GeometryTrackerCtor ?? GeometryTracker
		this.chromeBinary = opts.chromeBinary ?? 'google-chrome'
		this.titleTimeoutMs = opts.titleTimeoutMs ?? DEFAULT_TITLE_TIMEOUT_MS
		this.idlePollMs = opts.idlePollMs ?? DEFAULT_IDLE_POLL_MS
		this.webappCap = opts.webappCap ?? DEFAULT_WEBAPP_CAP
	}

	startIdleCleanup(): void {
		if (this.idleTimer) return
		this.idleTimer = setInterval(() => {
			this.idleCleanupTick().catch((err) => {
				this.logger?.warn?.('webapp window-manager: idle cleanup tick threw', err)
			})
		}, this.idlePollMs)
	}

	stopIdleCleanup(): void {
		if (this.idleTimer) {
			clearInterval(this.idleTimer)
			this.idleTimer = null
		}
	}

	async spawn(opts: SpawnOpts): Promise<SpawnResult> {
		// 1. Idempotency
		const existing = this.active.get(opts.webappId)
		if (existing && existing.userId === opts.userId) {
			const alive = await this.discovery.isWindowAlive(existing.wid)
			if (alive) {
				return {
					webappId: existing.webappId,
					windowId: existing.wid,
					streamId: existing.streamId,
					wsUrl: existing.wsUrl,
				}
			}
			// stale entry — drop and continue to spawn fresh
			await this.close({webappId: existing.webappId, userId: existing.userId, killWindow: false})
		}

		// Per-user webapp cap (STRIDE D)
		const userActive = Array.from(this.active.values()).filter((a) => a.userId === opts.userId)
		if (userActive.length >= this.webappCap) {
			throw new WebappCapExceededError(this.webappCap)
		}

		// 2. Baseline wid snapshot
		const baselineWids = await this.discovery.snapshotWindowIds()

		// 3. Spawn Chrome (detached, NOT a livinityd child)
		// 2026-05-08 hotfix v2: livinityd's systemd env has no DISPLAY or
		// XAUTHORITY, and Chrome refuses to launch as root without
		// --no-sandbox. Spawning via `sudo -u bruce -E` doesn't fix it
		// either — sudo strips DISPLAY/XAUTHORITY unless they're in
		// sudoers `env_keep`, so Chrome dies with "Missing X server or
		// $DISPLAY". Pass them as sudo command-prefix env vars
		// (`sudo VAR=val cmd ...`), which is env_keep-independent.
		// Reuse the existing LivOS Chrome profile so the IPC merge opens
		// a new top-level window under bruce's signed-in session.
		// 2026-05-09 P100-08-02: WebApp Chromes now run on dedicated Xvfb
		// :1 (D-100-08-A). XAUTHORITY no longer needed (Xvfb -ac mode
		// requires no Xauthority cookie). The argv-prefix XAUTHORITY=...
		// line is dropped; DISPLAY=:1 still flows in via WEBAPPS_X11_ENV.
		const chromeUser = process.env.LIVOS_CHROME_USER ?? 'bruce'
		const chromeProfile =
			process.env.LIVOS_CHROME_PROFILE ?? '/home/bruce/.config/livos-chrome'
		const chromeArgs = [
			'-n', // non-interactive (fail fast if password would be prompted)
			'-u',
			chromeUser,
			`DISPLAY=${WEBAPPS_X11_ENV.DISPLAY}`,
			// P100-08-02: XAUTHORITY removed — Xvfb :1 runs with `-ac` (no Xauthority cookie).
			// LIVOS_X11_XAUTHORITY env still recognized in window-discovery.ts comment for
			// future xauth-protected Xvfb configs, but not propagated by default.
			this.chromeBinary,
			`--user-data-dir=${chromeProfile}`,
			'--window-size=1280,720', // P100-06.1: explicit landscape resolution; Chrome --app= mode otherwise inherits whatever the last app-window remembered (often portrait/tiny).
			'--window-position=0,0',  // P100-06.1: predictable spawn coords (window-discovery's matcher prefers wids whose geometry doesn't overlap existing windows).
			`--app=${opts.url}`,   // P100-02 (G-100-B B1): site-specific-browser mode. Replaces `--new-window URL` to break Chrome IPC merge (V33-MULTI-01) and produce chromeless windows (V33-MULTI-02 bonus).
		]
		const chromeProc = this.spawnFactory('sudo', chromeArgs, {
			detached: true,
			stdio: 'ignore',
			env: {...process.env, ...WEBAPPS_X11_ENV},
		})
		try {
			chromeProc.unref?.()
		} catch {
			/* noop */
		}

		// 4. Find new window matching hostname → page title (D-93-08)
		const titleHints: string[] = []
		try {
			titleHints.push(new URL(opts.url).hostname)
		} catch {
			/* invalid URL — caller should have validated, but we don't crash */
		}
		if (opts.expectedTitle) titleHints.push(opts.expectedTitle)

		const newWin = await this.discovery.findNewWindowMatching({
			titleHints,
			baselineWids,
			timeoutMs: this.titleTimeoutMs,
		})
		if (!newWin) throw new WindowNotFoundError(opts.url)

		// 5/6. Phase 99 swap (D-99-04): WebApp windows always use mode:'vnc-window'.
		// PipeWire portal probe REMOVED — x11vnc -id <wid> reads the per-window
		// pixmap directly via XComposite (D-99-01) without portal user-consent.
		// Geometry-clamp from commit 4c55b173 PRESERVED for diagnostic logging
		// only — preserved for ffmpeg-fallback path; unused under x11vnc mode (D-99-05).
		const screen = await getScreenSize().catch(() => null)
		if (screen) {
			const geom: Geometry = clampGeometryToScreen(newWin.geometry, screen)
			if (
				geom.x !== newWin.geometry.x ||
				geom.y !== newWin.geometry.y ||
				geom.w !== newWin.geometry.w ||
				geom.h !== newWin.geometry.h
			) {
				this.logger?.warn?.(
					`webapp ${opts.webappId}: geometry exceeds screen ${JSON.stringify(newWin.geometry)} → clamped ${JSON.stringify(geom)} (screen=${screen.w}x${screen.h}); preserved for ffmpeg-fallback path; unused under x11vnc mode`,
				)
			}
		}
		const mode: 'vnc-window' = 'vnc-window'
		const portalSession: WindowSessionResult | null = null
		const geometryTracker: GeometryTracker | null = null
		const streamStart = this.streamManager.startStream({
			userId: opts.userId,
			mode: 'vnc-window',
			target: {wid: newWin.wid},
		})

		// 7. Store entry
		const entry: ActiveWebApp = {
			webappId: opts.webappId,
			userId: opts.userId,
			wid: newWin.wid,
			mode,
			streamId: streamStart!.streamId,
			wsUrl: streamStart!.wsUrl,
			portalSession,
			geometryTracker,
			url: opts.url,
		}
		this.active.set(opts.webappId, entry)
		this.logger?.info?.(
			`webapp ${opts.webappId} spawned (user=${opts.userId} wid=${newWin.wid} mode=${mode})`,
		)

		// Phase 100-07.4 — broadcast active wid to bytebot MCP child process
		// via /tmp/livos-active-webapp-wid (cross-process IPC fallback so
		// bytebot host MCP auto-scopes to the single active WebApp).
		this.broadcastActiveWid()

		return {
			webappId: opts.webappId,
			windowId: newWin.wid,
			streamId: entry.streamId,
			wsUrl: entry.wsUrl,
		}
	}

	async focus(opts: {webappId: string; userId: string}): Promise<{ok: boolean; code?: string}> {
		const entry = this.active.get(opts.webappId)
		if (!entry || entry.userId !== opts.userId) return {ok: false, code: 'NOT_FOUND'}
		const alive = await this.discovery.isWindowAlive(entry.wid)
		if (!alive) {
			await this.close({webappId: opts.webappId, userId: opts.userId, killWindow: false})
			return {ok: false, code: 'WINDOW_GONE'}
		}
		const ok = await this.discovery.activateWindow(entry.wid)
		return {ok}
	}

	async close(opts: {
		webappId: string
		userId: string
		killWindow?: boolean
	}): Promise<{ok: boolean}> {
		const entry = this.active.get(opts.webappId)
		if (!entry || entry.userId !== opts.userId) return {ok: false}

		// Stop stream
		try {
			await this.streamManager.stopStream(entry.streamId)
		} catch (err) {
			this.logger?.warn?.(`webapp ${opts.webappId}: stopStream threw`, err)
		}

		// Close portal session if any
		if (entry.portalSession) {
			try {
				await entry.portalSession.closeSession()
			} catch (err) {
				this.logger?.warn?.(`webapp ${opts.webappId}: closeSession threw`, err)
			}
		}

		// Stop geometry tracker if any
		if (entry.geometryTracker) {
			try {
				entry.geometryTracker.stop()
			} catch {
				/* noop */
			}
		}

		// Optional: kill the Chrome window
		if (opts.killWindow) {
			// Best-effort — Chrome may already be gone, or we may not have permission.
			try {
				const child = this.spawnFactory('xdotool', ['windowkill', String(entry.wid)], {
					stdio: 'ignore',
					env: {...process.env, ...WEBAPPS_X11_ENV},
				})
				child.unref?.()
			} catch (err) {
				this.logger?.warn?.(`webapp ${opts.webappId}: windowkill spawn threw`, err)
			}
		}

		this.active.delete(opts.webappId)
		this.logger?.info?.(`webapp ${opts.webappId} closed (killWindow=${!!opts.killWindow})`)

		// Phase 100-07.4 — re-broadcast after close so bytebot fallback sees
		// the new active state (single remaining wid, ambiguous, or none).
		this.broadcastActiveWid()

		return {ok: true}
	}

	/**
	 * Phase 100-07.4 — write the SOLE active WebApp's wid to
	 * `/tmp/livos-active-webapp-wid` for the bytebot MCP child to read at
	 * tool dispatch time (cross-process fallback). Multiple active WebApps
	 * → empty file (ambiguous, host-display fallback). Zero active → file
	 * removed.
	 */
	private broadcastActiveWid(): void {
		const marker = '/tmp/livos-active-webapp-wid'
		try {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const fs = require('node:fs') as typeof import('node:fs')
			const wid = this.getSingleActiveWid()
			if (this.active.size === 0) {
				try {
					fs.unlinkSync(marker)
				} catch {
					/* file may not exist — fine */
				}
				return
			}
			fs.writeFileSync(marker, wid !== undefined ? String(wid) : '', {encoding: 'utf8'})
		} catch (err) {
			this.logger?.warn?.(`failed to broadcast active wid to ${marker}`, err)
		}
	}

	/**
	 * Phase 100-07: resolve webappId → wid for input dispatch.
	 * Returns null if the user has no live entry for this webappId.
	 */
	getWidForWebapp(webappId: string, userId: string): number | null {
		const entry = this.active.get(webappId)
		if (!entry || entry.userId !== userId) return null
		return entry.wid
	}

	/**
	 * Phase 100-07.4 — fallback resolver for the host-display bytebot.
	 * When the agent invokes a tool without an explicit windowId AND
	 * BYTEBOT_TARGET_WINDOW_ID is unset, return the wid of the SOLE active
	 * WebApp (across all users). Returns undefined when there are 0 OR ≥2
	 * active WebApps — caller should be explicit in those ambiguous cases.
	 *
	 * This is a pragmatic single-WebApp UX fix until the per-WebApp MCP
	 * registration lifecycle is wired into spawn/close (out of scope here).
	 */
	getSingleActiveWid(): number | undefined {
		const wids: number[] = []
		for (const entry of this.active.values()) {
			wids.push(entry.wid)
			if (wids.length > 1) return undefined
		}
		return wids[0]
	}

	list(filter: {userId: string}): Array<{
		webappId: string
		windowId: number
		streamId: string
		wsUrl: string
		mode: 'pipewire-fd' | 'window-crop' | 'vnc-window'
		url: string
	}> {
		const out: Array<{
			webappId: string
			windowId: number
			streamId: string
			wsUrl: string
			mode: 'pipewire-fd' | 'window-crop' | 'vnc-window'
			url: string
		}> = []
		for (const a of this.active.values()) {
			if (a.userId !== filter.userId) continue
			out.push({
				webappId: a.webappId,
				windowId: a.wid,
				streamId: a.streamId,
				wsUrl: a.wsUrl,
				mode: a.mode,
				url: a.url,
			})
		}
		return out
	}

	private async idleCleanupTick(): Promise<void> {
		const stale: string[] = []
		for (const [webappId, entry] of this.active) {
			const alive = await this.discovery.isWindowAlive(entry.wid).catch(() => false)
			if (!alive) stale.push(webappId)
		}
		for (const webappId of stale) {
			const entry = this.active.get(webappId)
			if (!entry) continue
			this.logger?.verbose?.(`webapp ${webappId}: idle-cleanup detected window-gone`)
			await this.close({webappId, userId: entry.userId, killWindow: false})
		}
	}

	/** Test helper: drop all entries without invoking close()'s side effects. */
	_clearForTests(): void {
		for (const entry of this.active.values()) {
			try {
				entry.geometryTracker?.stop()
			} catch {
				/* noop */
			}
		}
		this.active.clear()
		this.stopIdleCleanup()
	}
}
