/**
 * Phase 93-10 — WebAppWindowManager (Phase 101-04 CDP rewrite).
 *
 * Orchestrator class. Composes window-discovery + pipewire-portal (or
 * geometry-tracker fallback) + StreamManager + ChromeCdpClient into the
 * spawn / focus / close / list surface for WebApps. Owns
 * Map<webappId, ActiveWebApp> and the idle-cleanup poller (5s xprop poll).
 *
 * Algorithm — spawn() (Phase 101-04 CDP-driven):
 *   1. Idempotency check (existing alive entry → return existing handle).
 *   2. Per-user webapp cap (STRIDE D).
 *   3. PID-narrowed baseline snapshot: discovery.listWindowIdsForPid(chromePid)
 *      BEFORE CDP createTarget (RESEARCH Q1 RESOLVED).
 *   4. chromeCdpClient.createWindowForUrl(url, {width, height, left, top})
 *      drives the singleton Chrome (booted at livinityd.start()) to open a
 *      new top-level window under the shared `--user-data-dir`. The legacy
 *      `sudo google-chrome (legacy site-specific-browser argv) ...` is GONE — it IPC-merged
 *      into the singleton (100-10-08 root cause) and silently swallowed every
 *      spawn after the first.
 *   5. discovery.findNewWindowByPid({chromePid, baselineWids, timeoutMs:5000})
 *      returns the first wid that's new for THIS pid — deterministic, no
 *      title-match race.
 *   6. Timeout → throw {code:'WINDOW_NOT_FOUND', url}; CDP target is closed
 *      so we don't leak an orphan window.
 *   7. streamManager.startStream({mode:'vnc-window', target:{wid}}) (D-99-04).
 *   8. Store {webappId, userId, wid, targetId, mode, streamId, ...} in map.
 *   9. Return {windowId, streamId, wsUrl}.
 *
 * close({webappId, killWindow?}): stop stream → chromeCdpClient.closeTarget(
 *   entry.targetId) → optional `xdotool windowkill <wid>` (defense-in-depth)
 *   → release map entry. The CDP closeTarget aligns Chrome-window teardown
 *   with port releases — deterministic, not best-effort like the prior
 *   `xdotool windowkill` flow.
 */

import {URL} from 'node:url'
import {randomUUID} from 'node:crypto'
import type {ChildProcess} from 'node:child_process'

import type {StreamManager} from '../streaming/stream-manager.js'
import {
	snapshotWindowIds,
	// Phase 101-04 — legacy title-match helper is no longer imported here.
	// It still lives in window-discovery.ts for any out-of-band caller, but
	// the WebApp spawn body uses PID-narrowed lookup exclusively.
	findNewWindowByPid,
	listWindowIdsForPid,
	isWindowAlive,
	activateWindow,
	getWindowGeometry,
	getScreenSize,
	clampGeometryToScreen,
	WEBAPPS_X11_ENV,
	type WindowInfo,
	type Geometry,
} from './window-discovery.js'
// Phase 101-04 — CDP-driven spawn path. Replaces the sudo→google-chrome
// argv path with `chromeCdpClient.createWindowForUrl(url, bounds)` so all
// WebApps share the singleton Chrome (D-101-SHARED-PROFILE) without
// IPC-merge swallowing every spawn (100-10-08 root cause). The PID-narrowed
// wid lookup replaces the title-match race that caused x11vnc to pick up
// the wrong window in 100-10-08 carryover.
import type {ChromeCdpClient} from '../chrome-cdp/client.js'
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
// now spawn on the singleton `:1` display set up by 100-08-01.
//
// Phase 102-01: legacy `./display-allocator.js` (string-returning) DELETED.
// Wave 2 plan 102-04 will re-wire the spawn body to consume the new
// number-returning `streaming/display-allocator.ts` + `streaming/xvfb-spawner.ts`
// for per-app display orchestration. Until then, the `displayAllocator` opt
// stays as `unknown` so existing test fixtures keep type-checking; spawn()
// still never dereferences it.
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

/**
 * Phase 101-04 — thrown when WebAppWindowManager is asked to spawn but the
 * Chrome CDP client is unavailable (bootstrap failed at livinityd.start()).
 * Pillar A degrades to "unavailable" but the rest of the daemon stays up.
 * The 101-10 UAT row 3 ("multi-WebApp distinct windows") fails without CDP.
 */
export class WebAppCdpUnavailableError extends Error {
	code = 'WEBAPP_CDP_UNAVAILABLE'
	constructor() {
		super(
			'webapp window manager: chrome CDP client not wired — bootstrapChrome must succeed before spawn',
		)
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
		// Phase 101-04 — PID-narrowed wid resolution. The legacy title-match
		// helper is no longer referenced from window-manager.ts (removed from
		// imports + types per RESEARCH Q1 RESOLVED).
		findNewWindowByPid: typeof findNewWindowByPid
		listWindowIdsForPid: typeof listWindowIdsForPid
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
	displayAllocator?: unknown
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
	/**
	 * Phase 101-04 — Chrome CDP client wired by livinityd.start() after
	 * `bootstrapChrome` resolves. REQUIRED — without it, `spawn()` throws
	 * `WebAppCdpUnavailableError` at the very first call. The constructor
	 * accepts `undefined` for backward-compat with test fixtures that
	 * pre-date 101-04, BUT spawning a WebApp without a wired client is an
	 * unrecoverable degraded state (Pillar A offline), so we mark the
	 * absence as a code-level invariant violated only when CDP bootstrap
	 * failed at livinityd.start(). Live callers MUST inject the live
	 * client; tests inject a mock.
	 */
	chromeCdpClient?: Pick<
		ChromeCdpClient,
		'createWindowForUrl' | 'closeTarget' | 'findTargetByUrl' | 'getChromePid'
	>
}

type ActiveWebApp = {
	webappId: string
	userId: string
	wid: number
	// Phase 101-04 — CDP targetId stashed at spawn so close() can route the
	// Chrome-window teardown through `chromeCdpClient.closeTarget(targetId)`
	// (deterministic — port releases align with target lifetime instead of
	// the previous best-effort `xdotool windowkill`). Optional so legacy
	// entries created before 101-04 don't trip the type-check.
	targetId?: string
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
	private readonly displayAllocator: unknown
	// Phase 101-04 — the live ChromeCdpClient (constructor-injected from
	// livinityd.start()). `undefined` when CDP bootstrap failed at boot;
	// spawn() throws `WebAppCdpUnavailableError` in that case so the failure
	// mode is loud, not silent.
	private readonly chromeCdpClient: WebAppWindowManagerOpts['chromeCdpClient']

	constructor(opts: WebAppWindowManagerOpts) {
		this.streamManager = opts.streamManager
		this.spawnFactory = opts.spawn
		this.logger = opts.logger
		this.discovery = opts.discovery ?? {
			snapshotWindowIds,
			// Phase 101-04 — PID-narrowed wid resolution defaults.
			findNewWindowByPid,
			listWindowIdsForPid,
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
		// Phase 101-04 — CDP client injection. `undefined` when bootstrap
		// failed at livinityd.start(); spawn() then throws
		// WebAppCdpUnavailableError so Pillar A degrades loudly.
		this.chromeCdpClient = opts.chromeCdpClient
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

		// Phase 101-04 — guardrail: CDP client must be wired. Bootstrap failure
		// at livinityd.start() means Pillar A is offline; rather than spawn a
		// detached Chrome (the legacy argv path) we throw so the caller knows
		// the platform is degraded and the WebApp tRPC route returns a clear
		// SERVICE_UNAVAILABLE.
		if (!this.chromeCdpClient) {
			throw new WebAppCdpUnavailableError()
		}

		// Phase 100-10-08 — Per-WebApp Xvfb REVERTED (D-100-10-A revert).
		// All WebApp windows live under the singleton `:1` display set up by
		// 100-08-01's livinityd.start() lifecycle. The singleton Chrome process
		// (booted at livinityd.start() by Plan 101-01) owns ALL WebApp windows
		// under a shared `--user-data-dir=/home/bruce/.config/livos-chrome`
		// (D-101-SHARED-PROFILE: same Google login across WebApps). Phase 101-04
		// drives that singleton via CDP `Target.createTarget({newWindow:true})`
		// — the ONLY way to produce distinct top-level windows under a shared
		// profile (the legacy site-specific-browser argv path IPC-merged into the
		// singleton and silently swallowed every spawn after the first; that
		// was the 100-10-08 root cause).
		const chromeDisplay = ':1'

		// Phase 100-10-11 — cascade window position so concurrent WebApps don't
		// all land at (0, 0) on the shared `:1` display and visually overlap.
		// Pattern: 120px diagonal cascade with per-axis modulo wrap to keep
		// every cascade slot strictly on-screen.
		//
		// Xvfb :1 is 1920x1080 with WebApp windows sized 1280x720. The plan's
		// CASCADE_WRAP=10 slot count is preserved (so the 11th WebApp wraps
		// back to slot 0). The cascade offset now flows into the CDP
		// `createWindowForUrl` bounds rather than the legacy
		// `--window-position=X,Y` argv flag — same per-slot positions, same
		// visual layout, same regression locks; just a different transport.
		//
		// Per-slot positions for slots 0..9 (unchanged from 100-10-11):
		//   0: (0,   0)    5: (600, 0)
		//   1: (120, 120)  6: (720, 120)
		//   2: (240, 240)  7: (840, 240)
		//   3: (360, 360)  8: (960, 360)
		//   4: (480, 480)  9: (1080, 480)
		// Slot 10 wraps back to (0, 0). All 10 distinct, all on-screen.
		//
		// `this.active.size` is read BEFORE the new entry is added to the map,
		// so the first WebApp gets slot 0 (offset 0,0) and subsequent WebApps
		// cascade upward.
		const CASCADE_PIXELS = 120
		const CASCADE_WRAP = 10
		const CASCADE_X_RANGE = 1200
		const CASCADE_Y_RANGE = 600
		const cascadeSlot = this.active.size % CASCADE_WRAP
		const cascadeOffsetX = (cascadeSlot * CASCADE_PIXELS) % CASCADE_X_RANGE
		const cascadeOffsetY = (cascadeSlot * CASCADE_PIXELS) % CASCADE_Y_RANGE

		// Phase 101-04 — CDP-driven window creation + PID-narrowed wid resolution.
		// RESEARCH.md Open Question #1 RESOLVED: title-match is dropped in favor
		// of `xdotool search --pid <chrome-pid>` baseline-and-poll. Deterministic
		// — first new wid for THIS PID after createTarget is ours.
		//
		// Algorithm (encoded verbatim per RESEARCH Q1 RESOLVED):
		//   1. Snapshot baseline wids filtered by Chrome pid BEFORE createTarget.
		//   2. Drive CDP createTarget({newWindow:true}) for the URL.
		//   3. Poll `xdotool search --pid <pid>` until a NEW wid appears.
		const chromePid = await this.chromeCdpClient.getChromePid()
		const baselineWidsForPid = await this.discovery.listWindowIdsForPid(chromePid)
		const {targetId, windowId: cdpWindowId} =
			await this.chromeCdpClient.createWindowForUrl(opts.url, {
				width: 1280,
				height: 720,
				left: cascadeOffsetX,
				top: cascadeOffsetY,
			})
		const newWin = await this.discovery.findNewWindowByPid({
			chromePid,
			baselineWids: baselineWidsForPid,
			timeoutMs: 5000,
		})
		if (!newWin) {
			// Degenerate: CDP created the target but xdotool couldn't see the
			// wid within 5s. Clean up the orphan target so the Chrome window
			// doesn't leak. closeTarget is best-effort — if it throws too,
			// just propagate the original WindowNotFoundError.
			try {
				await this.chromeCdpClient.closeTarget(targetId)
			} catch (err) {
				this.logger?.warn?.(
					`webapp ${opts.webappId}: closeTarget cleanup after WINDOW_NOT_FOUND threw (non-fatal)`,
					err,
				)
			}
			throw new WindowNotFoundError(opts.url)
		}
		// PID-narrowed lookup returns the wid as a decimal string. Parse to
		// number for the rest of the manager (ActiveWebApp.wid is number, and
		// every downstream consumer — xdotool, streamManager target — expects
		// numeric wid).
		const newWindowWidNumber = parseInt(newWin.wid, 10)
		if (!Number.isFinite(newWindowWidNumber) || newWindowWidNumber <= 0) {
			// Should never happen — xdotool emits decimal-integer wids. Defense
			// in depth: clean up + fail loud.
			try {
				await this.chromeCdpClient.closeTarget(targetId)
			} catch {
				/* noop */
			}
			throw new WindowNotFoundError(opts.url)
		}
		// Shape the wid into the legacy WindowInfo struct so the geometry-clamp
		// + downstream code below keeps working with the existing field names.
		// CDP doesn't expose geometry at createTarget — fall back to wmctrl/xdotool
		// via getWindowGeometry on the resolved wid.
		const geometryFromX = await this.discovery
			.getWindowGeometry(newWindowWidNumber)
			.catch(() => null)
		const newWinInfo: WindowInfo = {
			wid: newWindowWidNumber,
			title: '',
			geometry: geometryFromX ?? {
				x: cascadeOffsetX,
				y: cascadeOffsetY,
				w: 1280,
				h: 720,
			},
		}
		// `cdpWindowId` is the CDP browser-windowId — stashed in the log line
		// only for now (future minimize/restore paths may want it).
		this.logger?.verbose?.(
			`webapp ${opts.webappId}: CDP created target=${targetId} cdpWindowId=${cdpWindowId} wid=${newWindowWidNumber}`,
		)

		// 5/6. Phase 99 swap (D-99-04): WebApp windows always use mode:'vnc-window'.
		// PipeWire portal probe REMOVED — x11vnc -id <wid> reads the per-window
		// pixmap directly via XComposite (D-99-01) without portal user-consent.
		// Geometry-clamp from commit 4c55b173 PRESERVED for diagnostic logging
		// only — preserved for ffmpeg-fallback path; unused under x11vnc mode (D-99-05).
		const screen = await getScreenSize().catch(() => null)
		if (screen) {
			const geom: Geometry = clampGeometryToScreen(newWinInfo.geometry, screen)
			if (
				geom.x !== newWinInfo.geometry.x ||
				geom.y !== newWinInfo.geometry.y ||
				geom.w !== newWinInfo.geometry.w ||
				geom.h !== newWinInfo.geometry.h
			) {
				this.logger?.warn?.(
					`webapp ${opts.webappId}: geometry exceeds screen ${JSON.stringify(newWinInfo.geometry)} → clamped ${JSON.stringify(geom)} (screen=${screen.w}x${screen.h}); preserved for ffmpeg-fallback path; unused under x11vnc mode`,
				)
			}
		}
		const mode: 'vnc-window' = 'vnc-window'
		const portalSession: WindowSessionResult | null = null
		const geometryTracker: GeometryTracker | null = null
		const streamStart = this.streamManager.startStream({
			userId: opts.userId,
			mode: 'vnc-window',
			target: {wid: newWinInfo.wid},
		})

		// 7. Store entry
		const entry: ActiveWebApp = {
			webappId: opts.webappId,
			userId: opts.userId,
			wid: newWinInfo.wid,
			// Phase 101-04 — stash the CDP targetId so close() can route the
			// Chrome-window teardown through `chromeCdpClient.closeTarget(targetId)`
			// (deterministic — port releases align with target lifetime).
			targetId,
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
			`webapp ${opts.webappId} spawned (user=${opts.userId} wid=${newWinInfo.wid} mode=${mode} targetId=${targetId})`,
		)

		// Phase 100-08-04 — register per-WebApp Luse MCP entry via
		// McpConfigManager (Redis pub-sub path). Liv-core's McpClientManager
		// (different process) reconciles async (~1-2s). Non-fatal: on error,
		// host Luse via /tmp/livos-active-webapp-wid fallback below still
		// serves the agent during the lag. (Renamed P100-10-02 from bytebot per
		// D-100-10-B.)
		await this.registerWebAppMcp(opts.webappId, newWinInfo.wid, chromeDisplay)

		// Phase 100-07.4 — broadcast active wid (kept as belt-and-braces
		// fallback and bridges the liv-core reconcile lag).
		this.broadcastActiveWid()

		return {
			webappId: opts.webappId,
			windowId: newWinInfo.wid,
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

		// Phase 101-04 — route Chrome-window teardown through CDP closeTarget
		// so the singleton Chrome releases the window deterministically (and
		// any per-target ports / streams aligned to target lifetime release in
		// lockstep). Best-effort — Chrome may have crashed, CDP may have been
		// disconnected; legacy `xdotool windowkill` path below still runs when
		// `killWindow:true` is set, as a defense-in-depth backstop.
		if (entry.targetId && this.chromeCdpClient) {
			try {
				await this.chromeCdpClient.closeTarget(entry.targetId)
			} catch (err) {
				this.logger?.warn?.(
					`webapp ${opts.webappId}: chromeCdpClient.closeTarget(${entry.targetId}) threw (non-fatal)`,
					err,
				)
			}
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
