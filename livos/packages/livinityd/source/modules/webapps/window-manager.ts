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
 *   3. child_process.spawn('google-chrome', ['--new-window', url],
 *      {detached:true, stdio:'ignore'}) then unref() — Chrome is NOT a
 *      livinityd child (D-V33-01: shared profile, no --user-data-dir)
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
	mode: 'pipewire-fd' | 'window-crop'
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
		const chromeUser = process.env.LIVOS_CHROME_USER ?? 'bruce'
		const chromeProfile =
			process.env.LIVOS_CHROME_PROFILE ?? '/home/bruce/.config/livos-chrome'
		const chromeArgs = [
			'-n', // non-interactive (fail fast if password would be prompted)
			'-u',
			chromeUser,
			`DISPLAY=${WEBAPPS_X11_ENV.DISPLAY}`,
			`XAUTHORITY=${WEBAPPS_X11_ENV.XAUTHORITY}`,
			this.chromeBinary,
			`--user-data-dir=${chromeProfile}`,
			'--new-window',
			opts.url,
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

		// 5/6. Try PipeWire portal first
		let mode: 'pipewire-fd' | 'window-crop' = 'window-crop'
		let portalSession: WindowSessionResult | null = null
		let geometryTracker: GeometryTracker | null = null
		let streamStart: {streamId: string; wsUrl: string}

		const portalUp = await this.portal.isPortalAvailable().catch(() => false)
		if (portalUp) {
			try {
				portalSession = await this.portal.requestWindowSession({
					desktopUid: opts.desktopUid ?? 1000,
				})
				mode = 'pipewire-fd'
				streamStart = this.streamManager.startStream({
					userId: opts.userId,
					mode: 'pipewire-fd',
					target: {pwNodeId: portalSession.pwNodeId, fd: portalSession.fd},
				})
			} catch (err) {
				if (!(err instanceof PortalUnavailable)) {
					this.logger?.warn?.('webapp window-manager: portal failed, falling back', err)
				}
				portalSession = null
			}
		}

		if (!portalSession) {
			// Fallback: geometry-tracker + ffmpeg crop
			mode = 'window-crop'
			// 2026-05-08: clamp geometry to root display bounds. Chrome
			// maximized windows can report a logical geometry that overflows
			// the screen (frame extents / shadow), and ffmpeg x11grab rejects
			// out-of-bounds capture areas with EINVAL ("Capture area WxH at
			// position X,Y outside the screen size SxS").
			const screen = await getScreenSize()
			const geom: Geometry = screen
				? clampGeometryToScreen(newWin.geometry, screen)
				: newWin.geometry
			if (
				screen &&
				(geom.x !== newWin.geometry.x ||
					geom.y !== newWin.geometry.y ||
					geom.w !== newWin.geometry.w ||
					geom.h !== newWin.geometry.h)
			) {
				this.logger?.warn?.(
					`webapp ${opts.webappId}: clamped geometry ${JSON.stringify(newWin.geometry)} → ${JSON.stringify(geom)} (screen=${screen.w}x${screen.h})`,
				)
			}
			streamStart = this.streamManager.startStream({
				userId: opts.userId,
				mode: 'window-crop',
				target: {display: ':0.0', geometry: geom},
			})
			geometryTracker = new this.GeometryTrackerCtor()
			geometryTracker.start(newWin.wid)
		}

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
		return {ok: true}
	}

	list(filter: {userId: string}): Array<{
		webappId: string
		windowId: number
		streamId: string
		wsUrl: string
		mode: 'pipewire-fd' | 'window-crop'
		url: string
	}> {
		const out: Array<{
			webappId: string
			windowId: number
			streamId: string
			wsUrl: string
			mode: 'pipewire-fd' | 'window-crop'
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
