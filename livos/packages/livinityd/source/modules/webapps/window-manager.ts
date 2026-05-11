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
// Phase 100-08-04 — per-WebApp Luse MCP child registration via livinityd's
// own McpConfigManager (Redis pub-sub bridge to liv-core's McpClientManager).
// (Renamed P100-10-02 from bytebot per D-100-10-B.)
import {
	buildLuseConfig,
	type McpServerConfigInput,
	type PerWebAppMcpDescriptor,
} from '../computer-use/luse-mcp-config.js'
// Phase 100-10-08 — REVERTED per-WebApp Xvfb (D-100-10-A reverted).
// Live diagnostic on Mini PC proved Chrome singleton lock + shared
// `--user-data-dir` are architecturally incompatible with per-WebApp
// displays: every new spawn IPC-merges to the existing PID on the FIRST
// display, so no window appears on `:11`/`:12`/... User chose to keep the
// shared profile (same Google login across WebApps). All WebApp Chromes
// now spawn on the singleton `:1` display set up by 100-08-01. DisplayAllocator
// + xvfb-display + fluxbox-wm files STAY in tree as scaffolding for the
// Phase 101 CDP architecture (where Luse drives multi-target Chrome via
// DevTools Protocol while preserving shared profile).
import type {DisplayAllocator} from './display-allocator.js'
import type {startXvfb} from './xvfb-display.js'
import type {startFluxbox} from './fluxbox-wm.js'

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
	/**
	 * Phase 100-08-04 — optional MCP config-manager handle (livinityd's own,
	 * backed by the daemon's Redis). When provided, spawn() persists a
	 * per-WebApp Luse MCP entry under name `luse:webapp:<webappId>` and
	 * close() removes it. The McpConfigManager's saveAndPublish auto-publishes
	 * `liv:config:updated`, which liv-core's McpClientManager (separate
	 * process) subscribes to and reconciles asynchronously (~1-2s lag).
	 * (Renamed P100-10-02 from bytebot per D-100-10-B.)
	 *
	 * NOT to be confused with liv-core's McpClientManager — that one is in a
	 * different process and cannot be called from livinityd. The Redis pub-sub
	 * path is the canonical bridge (see agent-runs.ts:54-58, 161-164).
	 */
	mcpConfigManager?: {
		installServer(server: McpServerConfigInput): Promise<void>
		updateServer(name: string, updates: Partial<McpServerConfigInput>): Promise<unknown>
		removeServer(name: string): Promise<boolean>
	}
	/** Phase 100-08-04 — resolved path to the Luse MCP stdio server. Required when mcpConfigManager is set. */
	luseServerPath?: string
	/** Phase 100-08-04 — env passed to buildLuseConfig. Defaults to process.env. */
	luseMcpEnv?: NodeJS.ProcessEnv
	/**
	 * Phase 100-10-08 — D-100-10-A REVERTED. `displayAllocator` is accepted
	 * for opt-in compatibility (existing test fixtures + livinityd.start()
	 * wiring + Phase 101 CDP scaffold) but spawn() NO LONGER calls
	 * `allocate()` / `release()`. All WebApp Chromes spawn on the singleton
	 * `:1` display set up by 100-08-01's livinityd.start() lifecycle.
	 *
	 * Background: per-WebApp displays (`:10`, `:11`, ...) are architecturally
	 * incompatible with shared Chrome profile (`--user-data-dir`) — Chrome's
	 * singleton lock IPC-merges all new spawns to the existing PID on the
	 * first display, so no window appears on subsequent displays. User chose
	 * shared profile (same Google login across WebApps); per-WebApp display
	 * support is parked until Phase 101 CDP architecture (where Luse drives
	 * multi-target Chrome via DevTools Protocol).
	 */
	displayAllocator?: DisplayAllocator
	/**
	 * Phase 100-10-08 — D-100-10-A reverted. Test stub opt retained for
	 * fixture compatibility; spawn() no longer invokes per-spawn Xvfb start.
	 * Phase 101 CDP work may re-introduce this with CDP-aware semantics.
	 */
	xvfbStartFn?: typeof startXvfb
	/**
	 * Phase 100-10-08 — D-100-10-A reverted. Test stub opt retained for
	 * fixture compatibility; spawn() no longer invokes per-spawn fluxbox start.
	 * Phase 101 CDP work may re-introduce this with CDP-aware semantics.
	 */
	fluxboxStartFn?: typeof startFluxbox
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
	// Phase 100-10-08 — per-WebApp Xvfb fields REMOVED with D-100-10-A revert.
	// All WebApps now share the singleton `:1` display (100-08-01 baseline).
	// `display` retained as readable hint for log messages; xvfb/fluxbox
	// handles dropped (their lifecycle belongs to livinityd.start(), not
	// per-spawn).
	display: string
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
	// Phase 100-08-04 — per-WebApp Luse MCP wiring (Redis pub-sub path).
	// (Renamed P100-10-02 from bytebot per D-100-10-B.)
	private readonly mcpConfigManager: WebAppWindowManagerOpts['mcpConfigManager']
	private readonly luseServerPath: string | undefined
	private readonly luseMcpEnv: NodeJS.ProcessEnv
	// Phase 100-10-08 — D-100-10-A reverted. The allocator + start fns stay
	// accepted as opts so existing test fixtures and the Phase 101 CDP scaffold
	// keep compiling, but spawn() no longer CALLS them. Field is retained as
	// `displayAllocator` for type-readable provenance; never dereferenced in
	// the live spawn path.
	private readonly displayAllocator: DisplayAllocator | undefined

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
		// Phase 100-08-04 — wire optional MCP config-manager handle. When
		// undefined (test paths / backward compat), all per-WebApp MCP wiring
		// becomes a no-op via early-return guards in registerWebAppMcp /
		// deregisterWebAppMcp.
		this.mcpConfigManager = opts.mcpConfigManager
		this.luseServerPath = opts.luseServerPath
		this.luseMcpEnv = opts.luseMcpEnv ?? process.env
		// Phase 100-10-08 — D-100-10-A reverted. displayAllocator is accepted
		// for opt-in compatibility (so the existing wire-up in
		// livinityd.start() and tests still type-checks) but spawn() no longer
		// dereferences it. xvfbStartFn / fluxboxStartFn opts are no longer
		// stored — singleton :1 Xvfb + fluxbox lifecycle lives in
		// livinityd.start() (100-08-01 baseline).
		this.displayAllocator = opts.displayAllocator
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

		// Phase 100-10-08 — Per-WebApp Xvfb REVERTED (D-100-10-A revert).
		// All WebApp Chromes spawn on the singleton `:1` display set up by
		// 100-08-01's livinityd.start() lifecycle. Chrome's IPC merge under
		// `--user-data-dir=/home/bruce/.config/livos-chrome` (D-100-SHARED-PROFILE)
		// is INCOMPATIBLE with per-WebApp displays — every spawn redirects to
		// the existing PID on the first display, no window appears on the
		// allocated `:11`/`:12`/...  Chrome singleton naturally supports
		// multi-window on the same display (one process, multiple `--app=URL`
		// windows); per-WebApp `x11vnc -id <wid>` captures each window
		// independently (Phase 99 baseline). The DisplayAllocator scaffold +
		// xvfb-display + fluxbox-wm files stay in tree for Phase 101 CDP work.
		const chromeDisplay = ':1'

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
			// Phase 100-10-08: D-100-10-A reverted. chromeDisplay is the singleton
			// `:1` set up by livinityd.start() (100-08-01 baseline).
			`DISPLAY=${chromeDisplay}`,
			// P100-08-02: XAUTHORITY removed — Xvfb runs with `-ac` (no Xauthority cookie).
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
			// Phase 100-10-08 (D-100-10-A reverted): spawn-options env DISPLAY
			// pinned to singleton :1 (chromeDisplay).
			env: {...process.env, ...WEBAPPS_X11_ENV, DISPLAY: chromeDisplay},
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
			// Phase 100-10-08 — D-100-10-A reverted; always `:1` (shared display).
			display: chromeDisplay,
		}
		this.active.set(opts.webappId, entry)
		this.logger?.info?.(
			`webapp ${opts.webappId} spawned (user=${opts.userId} wid=${newWin.wid} mode=${mode})`,
		)

		// Phase 100-08-04 — register per-WebApp Luse MCP entry via
		// McpConfigManager (Redis pub-sub path). Liv-core's McpClientManager
		// (different process) reconciles async (~1-2s). Non-fatal: on error,
		// host Luse via /tmp/livos-active-webapp-wid fallback below still
		// serves the agent during the lag. (Renamed P100-10-02 from bytebot per
		// D-100-10-B.)
		await this.registerWebAppMcp(opts.webappId, newWin.wid, chromeDisplay)

		// Phase 100-07.4 — broadcast active wid (kept as belt-and-braces
		// fallback and bridges the liv-core reconcile lag).
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

		// Phase 100-08-04 — deregister per-WebApp Luse MCP entry BEFORE
		// we drop the active entry. Liv-core's reconcile is async — there's
		// a brief window where liv-core may still see the entry as
		// registered. The 08-05 chat-surface scope filter handles this lag
		// with a host-Luse fallback when the matching per-WebApp instance
		// isn't yet (or no longer) registered. Non-fatal on error.
		// (Renamed P100-10-02 from bytebot per D-100-10-B.)
		await this.deregisterWebAppMcp(opts.webappId)

		// Phase 100-10-08 — D-100-10-A reverted: NO per-WebApp Xvfb/fluxbox
		// teardown and NO displayAllocator release in close(). The singleton
		// `:1` Xvfb + fluxbox started by livinityd.start() (100-08-01) is the
		// source of truth and persists across WebApp lifecycle. Only Chrome
		// (best-effort `xdotool windowkill` above) + stream + MCP entry are
		// teared down. DisplayAllocator handle remains accepted in opts for
		// future Phase 101 CDP use but is never called here.

		this.active.delete(opts.webappId)
		this.logger?.info?.(`webapp ${opts.webappId} closed (killWindow=${!!opts.killWindow})`)

		// Phase 100-07.4 — re-broadcast after close so Luse fallback sees
		// the new active state (single remaining wid, ambiguous, or none).
		this.broadcastActiveWid()

		return {ok: true}
	}

	/** Phase 100-08-04 — server name format for the per-WebApp Luse MCP child.
	 *  (Renamed P100-10-02 from `bytebot:webapp:` per D-100-10-B.) */
	private mcpServerNameFor(webappId: string): string {
		return `luse:webapp:${webappId}`
	}

	/**
	 * Phase 100-08-04 — register a per-WebApp Luse MCP child via
	 * McpConfigManager (Redis pub-sub path). Liv-core's McpClientManager,
	 * running in a separate process, picks up the change asynchronously
	 * (~1-2s lag) via its `liv:config:updated` subscription. (Renamed
	 * P100-10-02 from bytebot per D-100-10-B.)
	 *
	 * Idempotency / regex fallback: tries installServer first; on duplicate
	 * name OR regex rejection (the validator regex `/^[a-z0-9][a-z0-9_-]*$/`
	 * rejects names with colons), falls back to updateServer (no regex,
	 * idempotent). Non-fatal on error — the host Luse fallback via
	 * /tmp/livos-active-webapp-wid (broadcastActiveWid) still serves the
	 * agent during the ~1-2s reconcile lag.
	 */
	private async registerWebAppMcp(
		webappId: string,
		wid: number,
		display: string = ':1',
	): Promise<void> {
		if (!this.mcpConfigManager || !this.luseServerPath) return
		try {
			const descriptor: PerWebAppMcpDescriptor = {
				instanceKey: webappId,
				windowId: wid,
				// Phase 100-10-08 (D-100-10-A reverted): always `:1` (singleton
				// Xvfb from 100-08-01). `display` arg still flows for the future
				// Phase 101 CDP path; current caller always passes `:1`.
				display,
			}
			const config = buildLuseConfig(this.luseMcpEnv, this.luseServerPath, descriptor)
			const name = this.mcpServerNameFor(webappId)
			try {
				await this.mcpConfigManager.installServer(config)
			} catch (installErr) {
				// installServer can throw on:
				//   - duplicate name (idempotent re-spawn)
				//   - regex-rejected name (colons; the validator regex
				//     `/^[a-z0-9][a-z0-9_-]*$/` rejects `luse:webapp:<id>`)
				// Both cases: fall back to updateServer (no regex, no
				// duplicate check). If updateServer returns null the entry
				// doesn't exist AND installServer refused — re-throw the
				// original install error so the outer catch logs it.
				const updated = await this.mcpConfigManager.updateServer(name, config)
				if (updated == null) {
					throw installErr
				}
			}
			this.logger?.info?.(
				`webapp ${webappId} per-WebApp Luse MCP registered (wid=${wid}); ` +
					`liv-core reconcile is async via Redis pub-sub liv:config:updated (~1-2s lag)`,
			)
		} catch (err) {
			this.logger?.warn?.(
				`webapp ${webappId} per-WebApp Luse MCP registration failed (non-fatal); ` +
					`host Luse fallback (broadcastActiveWid IPC) remains active`,
				err,
			)
		}
	}

	/** Phase 100-08-04 — deregister a per-WebApp Luse MCP child. Non-fatal on error.
	 *  (Renamed P100-10-02 from bytebot per D-100-10-B.) */
	private async deregisterWebAppMcp(webappId: string): Promise<void> {
		if (!this.mcpConfigManager) return
		try {
			await this.mcpConfigManager.removeServer(this.mcpServerNameFor(webappId))
			this.logger?.info?.(
				`webapp ${webappId} per-WebApp Luse MCP deregistered ` +
					`(liv-core reconcile is async via Redis pub-sub)`,
			)
		} catch (err) {
			this.logger?.warn?.(
				`webapp ${webappId} per-WebApp Luse MCP deregistration failed (non-fatal)`,
				err,
			)
		}
	}

	/**
	 * Phase 100-07.4 — write the SOLE active WebApp's wid to
	 * `/tmp/livos-active-webapp-wid` for the Luse MCP child to read at
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
	 * Phase 100-07.4 — fallback resolver for the host-display Luse.
	 * When the agent invokes a tool without an explicit windowId AND
	 * LUSE_TARGET_WINDOW_ID is unset, return the wid of the SOLE active
	 * WebApp (across all users). Returns undefined when there are 0 OR ≥2
	 * active WebApps — caller should be explicit in those ambiguous cases.
	 * (Renamed P100-10-02 from bytebot per D-100-10-B.)
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
