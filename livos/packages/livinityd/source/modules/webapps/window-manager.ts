/**
 * Phase 93-10 — WebAppWindowManager (Phase 102-04 per-app-display rewrite).
 *
 * Orchestrator class. Composes window-discovery + StreamManager + per-app
 * primitives (DisplayAllocator + spawnXvfb + ProfileSeeder + spawnChromeProcess
 * + PortAllocator) into the spawn / focus / close / list surface for WebApps.
 * Owns Map<webappId, ActiveWebApp> and the idle-cleanup poller (5s xprop poll).
 *
 * Algorithm — spawn() (Phase 102-04 per-app-display):
 *   1. Idempotency check (existing alive entry → return existing handle).
 *   2. Per-user webapp cap (STRIDE D).
 *   3. displayAllocator.allocate() → displayN (number, e.g. 10).
 *   4. spawnXvfb({display:':N', width:1280, height:720, ...}) — readiness-polled
 *      with xdpyinfo; returns XvfbHandle.
 *   5. (A2 fluxbox-or-not) If `withWindowManager:true` (default false), spawn
 *      fluxbox on :N. Validated empirically by 102-04 RESEARCH; --start-fullscreen
 *      typically works on bare Xvfb so fluxbox stays opt-in.
 *   6. profileSeeder.seed({uuid:webappId}) — cp -r master profile → per-app
 *      /tmp/livos-chrome-app-<uuid> with Singleton{Lock,Cookie,Socket} cleanup.
 *   7. spawnChromeProcess({display:':N', userDataDir, url, ...}) — per-app
 *      Chrome subprocess with --start-fullscreen --app=URL (chromeless rendering).
 *   8. portAllocator.allocate() → port (claimed for ActiveWebApp tracking; the
 *      stream-manager allocates its own port internally from the same shared
 *      allocator — see SUMMARY for rationale).
 *   9. streamManager.startStream({mode:'vnc-window', target:{display:':N'}, ...})
 *      — x11vnc whole-display capture (D-102-X11VNC-WHOLE-DISPLAY).
 *  10. Store ActiveWebApp {webappId, userId, displayN, display, xvfbHandle,
 *      chromeHandle, profileUuid, port, streamId, ...} in map.
 *  11. Return {windowId:0, streamId, wsUrl} (windowId is vestigial 0 — display
 *      is the unit of identity now).
 *
 * On partial failure, compensating cleanup runs in REVERSE order: stop chrome,
 * cleanup profile, stop xvfb, release port, release display. All steps are
 * best-effort (try/catch swallows so we always release the display).
 *
 * close({webappId, killWindow?}): stop stream → delete entry. Full per-app
 * teardown (chrome.stop + xvfb.stop + profile.cleanup + display.release) lands
 * in Wave 3 plan 102-08. This 102-04 close() is a stream-only teardown
 * placeholder; subsequent calls to spawn() with the same webappId re-allocate
 * the display, so leaked resources are bounded.
 */

import {URL} from 'node:url'
import {randomUUID} from 'node:crypto'
import type {ChildProcess} from 'node:child_process'

import type {StreamManager} from '../streaming/stream-manager.js'
import {
	snapshotWindowIds,
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
// Phase 102-04 — per-app primitives (Wave 1 deliverables consumed here).
// DisplayAllocator (102-01) hands out 10..99; spawnXvfb (102-01) brings up
// Xvfb on :N with xdpyinfo readiness poll; ProfileSeeder (102-03) copies the
// master Chrome profile to /tmp/livos-chrome-app-<uuid>; spawnChromeProcess
// (102-02) brings up a per-app Chrome subprocess with --user-data-dir +
// DISPLAY=:N. Together they replace the Phase 101-04 CDP-driven spawn flow.
import type {DisplayAllocator} from '../streaming/display-allocator.js'
import type {PortAllocator} from '../streaming/port-allocator.js'
import {spawnXvfb, type XvfbHandle, type XvfbSpawnOpts} from '../streaming/xvfb-spawner.js'
import {
	spawnChromeProcess,
	type ChromeProcessHandle,
	type ChromeSpawnOpts,
} from './chrome-process-spawner.js'
import type {ProfileSeederHandle} from '../chrome-master/index.js'
// Legacy type-only imports retained for back-compat with old test fixtures
// that still pass `xvfbStartFn` / `fluxboxStartFn` opts.
import type {startXvfb} from './xvfb-display.js'
import type {startFluxbox} from './fluxbox-wm.js'
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

const DEFAULT_TITLE_TIMEOUT_MS = 5000
const DEFAULT_IDLE_POLL_MS = 5000
const DEFAULT_WEBAPP_CAP = 50

/** Phase 102-04 — per-app Xvfb canvas size (matches xvfb-spawner default). */
const WEBAPP_DISPLAY_WIDTH = 1280
const WEBAPP_DISPLAY_HEIGHT = 720

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
 * Phase 101-04 — retained for legacy callers that may still distinguish CDP
 * absence as a failure mode. The 102-04 spawn body no longer consults
 * `chromeCdpClient`, so this error is never thrown from spawn(); it stays
 * exported for backward-compatible imports.
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

export type FluxboxSpawnFn = (opts: {
	display: string
	logger?: unknown
}) => Promise<{
	pid: number
	display: string
	exited: Promise<unknown>
	stop(): Promise<void>
}>

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
	 * close() removes it.
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
	 * Phase 102-04 — per-app display allocator. REQUIRED. spawn() calls
	 * `allocate()` to claim a fresh :N (10..99) for each WebApp; compensating
	 * cleanup releases it on partial failure. Strong-typed (no longer `unknown`)
	 * because the spawn body now actually composes the new allocator.
	 */
	displayAllocator: DisplayAllocator
	/**
	 * Phase 102-04 — shared port allocator (D-101-PORT-ALLOC). REQUIRED.
	 * window-manager claims a port slot for ActiveWebApp record-keeping; the
	 * stream-manager also allocates its own port internally (shared allocator
	 * pattern — same instance is injected here AND into StreamManager, so
	 * allocations advance the same cursor).
	 */
	portAllocator: PortAllocator
	/**
	 * Phase 102-04 — master profile seeder. REQUIRED. spawn() invokes
	 * `seed({uuid: webappId})` to cp -r master → /tmp/livos-chrome-app-<uuid>
	 * before launching Chrome with --user-data-dir at that path.
	 */
	profileSeeder: ProfileSeederHandle
	/**
	 * Phase 102-04 — Xvfb spawn factory injection. Defaults to spawnXvfb from
	 * streaming/xvfb-spawner.ts; tests pass a mock returning a FakeChild handle.
	 */
	xvfbSpawnFn?: (opts: XvfbSpawnOpts) => Promise<XvfbHandle>
	/**
	 * Phase 102-04 — Chrome subprocess spawn factory injection. Defaults to
	 * spawnChromeProcess from webapps/chrome-process-spawner.ts; tests inject
	 * a mock that records argv shape.
	 */
	chromeSpawnFn?: (opts: ChromeSpawnOpts) => Promise<ChromeProcessHandle>
	/**
	 * Phase 102-04 (A2 fluxbox-or-not risk mitigation). Default `false`:
	 * Chrome --start-fullscreen on bare Xvfb (no window manager) is validated
	 * to render full-canvas via RESEARCH §A2. Flip to `true` per-deploy if a
	 * specific WebApp needs WM hint handling. When `true`, spawn() invokes
	 * `fluxboxSpawnFn` between Xvfb readiness and Chrome spawn; fluxbox
	 * failure is logged non-fatally (does NOT trip compensating cleanup).
	 */
	withWindowManager?: boolean
	/**
	 * Phase 102-04 — fluxbox spawn factory injection. Only consulted when
	 * `withWindowManager:true`. When undefined and `withWindowManager:true`,
	 * spawn() dynamically imports ./fluxbox-wm.js's `startFluxbox`.
	 */
	fluxboxSpawnFn?: FluxboxSpawnFn
	/**
	 * Phase 102-04 — legacy CDP / Xvfb / fluxbox opts retained as IGNORED slots
	 * so old test fixtures don't fail to construct. None are referenced from
	 * spawn() or close(); silently dropped at the constructor.
	 */
	chromeCdpClient?: unknown
	xvfbStartFn?: typeof startXvfb
	fluxboxStartFn?: typeof startFluxbox
}

type ActiveWebApp = {
	webappId: string
	userId: string
	/**
	 * Phase 102-04 — vestigial wid field. Always 0 under per-app-display
	 * (display is the unit of identity now). Retained for v33 idle-cleanup
	 * poller compatibility; 102-08 will refactor the poller to key on display.
	 */
	wid: number
	/**
	 * Phase 102-04 — number form of the allocated display (e.g. 10). Used by
	 * 102-08 close lifecycle to call `displayAllocator.release(displayN)`.
	 */
	displayN: number
	/** Phase 102-04 — Xvfb handle for 102-08 stop(). */
	xvfbHandle: XvfbHandle
	/** Phase 102-04 — Chrome subprocess handle for 102-08 stop(). */
	chromeHandle: ChromeProcessHandle
	/** Phase 102-04 — uuid of the per-app profile dir (= webappId). */
	profileUuid: string
	/** Phase 102-04 — port allocated for this WebApp (rfb capture port). */
	port: number
	/** Phase 101-04 — CDP targetId retained for back-compat; vestigial in 102-04. */
	targetId?: string
	mode: 'pipewire-fd' | 'window-crop' | 'vnc-window'
	streamId: string
	wsUrl: string
	portalSession: WindowSessionResult | null
	geometryTracker: GeometryTracker | null
	url: string
	/** Phase 102-04 — display string (':10', ':11', ...). */
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
	private readonly mcpConfigManager: WebAppWindowManagerOpts['mcpConfigManager']
	private readonly luseServerPath: string | undefined
	private readonly luseMcpEnv: NodeJS.ProcessEnv
	// Phase 102-04 — per-app primitives (REQUIRED, strong-typed now).
	private readonly displayAllocator: DisplayAllocator
	private readonly portAllocator: PortAllocator
	private readonly profileSeeder: ProfileSeederHandle
	private readonly xvfbSpawnFn: (opts: XvfbSpawnOpts) => Promise<XvfbHandle>
	private readonly chromeSpawnFn: (opts: ChromeSpawnOpts) => Promise<ChromeProcessHandle>
	private readonly withWindowManager: boolean
	private readonly fluxboxSpawnFn: FluxboxSpawnFn | undefined

	constructor(opts: WebAppWindowManagerOpts) {
		this.streamManager = opts.streamManager
		this.spawnFactory = opts.spawn
		this.logger = opts.logger
		this.discovery = opts.discovery ?? {
			snapshotWindowIds,
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
		this.mcpConfigManager = opts.mcpConfigManager
		this.luseServerPath = opts.luseServerPath
		this.luseMcpEnv = opts.luseMcpEnv ?? process.env
		// Phase 102-04 — per-app primitives wiring.
		this.displayAllocator = opts.displayAllocator
		this.portAllocator = opts.portAllocator
		this.profileSeeder = opts.profileSeeder
		this.xvfbSpawnFn = opts.xvfbSpawnFn ?? spawnXvfb
		this.chromeSpawnFn = opts.chromeSpawnFn ?? spawnChromeProcess
		this.withWindowManager = opts.withWindowManager ?? false
		this.fluxboxSpawnFn = opts.fluxboxSpawnFn
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

	/**
	 * Phase 102-04 — per-app-display spawn body.
	 *
	 * Replaces the Phase 101-04 CDP-driven flow. Each WebApp gets its own
	 * Xvfb display + Chrome subprocess + isolated --user-data-dir, with the
	 * stream targeting `{display: ':N'}` for whole-display x11vnc capture.
	 *
	 * Compensating cleanup on any partial failure releases the display +
	 * port and stops any spawned children (chrome, xvfb) + cleans the per-app
	 * profile dir. All compensating steps are best-effort (try/catch each)
	 * so the display.release() at the end ALWAYS runs.
	 */
	async spawn(opts: SpawnOpts): Promise<SpawnResult> {
		// 1. Idempotency check — return existing entry if still alive.
		const existing = this.active.get(opts.webappId)
		if (existing && existing.userId === opts.userId) {
			return {
				webappId: existing.webappId,
				windowId: existing.wid, // 0 under 102-04
				streamId: existing.streamId,
				wsUrl: existing.wsUrl,
			}
		}

		// 2. Per-user webapp cap (STRIDE D).
		const userActive = Array.from(this.active.values()).filter((a) => a.userId === opts.userId)
		if (userActive.length >= this.webappCap) {
			throw new WebappCapExceededError(this.webappCap)
		}

		// 3. Allocate a display number.
		const displayN = this.displayAllocator.allocate()
		const display = `:${displayN}`

		let xvfb: XvfbHandle | null = null
		let chrome: ChromeProcessHandle | null = null
		let port: number | null = null
		let seed: {uuid: string; appDir: string} | null = null

		try {
			// 4. Spawn Xvfb on :N with readiness poll.
			xvfb = await this.xvfbSpawnFn({
				display,
				width: WEBAPP_DISPLAY_WIDTH,
				height: WEBAPP_DISPLAY_HEIGHT,
				logger: this.logger as never,
			})

			// 5. (A2) Optional fluxbox per-display. Non-fatal — failure does NOT
			// trip compensating cleanup; the WebApp still works without a WM in
			// the validated --start-fullscreen path.
			if (this.withWindowManager) {
				try {
					const fluxboxFn =
						this.fluxboxSpawnFn ??
						// Lazy default: dynamic-import the existing fluxbox-wm helper.
						(async (fOpts) => {
							const mod = await import('./fluxbox-wm.js')
							return mod.startFluxbox({display: fOpts.display, logger: this.logger as never})
						})
					await fluxboxFn({display, logger: this.logger as never})
				} catch (err) {
					this.logger?.warn?.(
						`webapp ${opts.webappId}: fluxbox spawn on ${display} failed (non-fatal — A2 path)`,
						err,
					)
				}
			}

			// 6. Seed master profile (uuid = webappId for traceability).
			seed = await this.profileSeeder.seed({uuid: opts.webappId})

			// 7. Spawn per-app Chrome subprocess on :N with seeded profile.
			chrome = await this.chromeSpawnFn({
				display,
				userDataDir: seed.appDir,
				url: opts.url,
				logger: this.logger as never,
			})

			// 8. Allocate port (tracking-only — stream-manager also calls its own
			// allocate() inside startStream; the SAME shared allocator instance
			// hands out the next slot).
			port = this.portAllocator.allocate()

			// 9. Start x11vnc whole-display capture (stream-manager already
			// supports {display} target since 100-10-04).
			const streamStart = this.streamManager.startStream({
				userId: opts.userId,
				mode: 'vnc-window',
				target: {display},
			})

			// 10. Insert ActiveWebApp map entry.
			const entry: ActiveWebApp = {
				webappId: opts.webappId,
				userId: opts.userId,
				wid: 0, // vestigial under 102-04 — display is identity
				displayN,
				display,
				xvfbHandle: xvfb,
				chromeHandle: chrome,
				profileUuid: seed.uuid,
				port,
				streamId: streamStart!.streamId,
				wsUrl: streamStart!.wsUrl,
				mode: 'vnc-window',
				portalSession: null,
				geometryTracker: null,
				url: opts.url,
			}
			this.active.set(opts.webappId, entry)
			this.logger?.info?.(
				`webapp ${opts.webappId} spawned (user=${opts.userId} display=${display} chromePid=${chrome.pid} streamId=${entry.streamId})`,
			)

			// Phase 100-08-04 — register per-WebApp Luse MCP entry. Non-fatal.
			// 102-04 passes wid=0 because wid is no longer meaningful; 102-06
			// will rewrite this helper to use display instead.
			await this.registerWebAppMcp(opts.webappId, 0, display)

			// Phase 100-07.4 — broadcast active wid (kept as belt-and-braces
			// fallback). Under 102-04 the value is always 0; 102-06 will
			// rewrite to broadcast `display` instead.
			this.broadcastActiveWid()

			// 11. Return result. windowId is vestigial 0.
			return {
				webappId: opts.webappId,
				windowId: 0,
				streamId: entry.streamId,
				wsUrl: entry.wsUrl,
			}
		} catch (err) {
			// Compensating cleanup — REVERSE order. Each step try/catch so a
			// failure in (e.g.) chrome.stop() doesn't prevent display.release().
			if (chrome) {
				try {
					await chrome.stop()
				} catch (cleanupErr) {
					this.logger?.warn?.(
						`webapp ${opts.webappId}: chrome.stop() during compensating cleanup threw (non-fatal)`,
						cleanupErr,
					)
				}
			}
			if (seed) {
				try {
					await this.profileSeeder.cleanup(seed.uuid)
				} catch (cleanupErr) {
					this.logger?.warn?.(
						`webapp ${opts.webappId}: profileSeeder.cleanup during compensating cleanup threw (non-fatal)`,
						cleanupErr,
					)
				}
			}
			if (xvfb) {
				try {
					await xvfb.stop()
				} catch (cleanupErr) {
					this.logger?.warn?.(
						`webapp ${opts.webappId}: xvfb.stop() during compensating cleanup threw (non-fatal)`,
						cleanupErr,
					)
				}
			}
			if (port !== null) {
				try {
					this.portAllocator.release(port)
				} catch (cleanupErr) {
					this.logger?.warn?.(
						`webapp ${opts.webappId}: portAllocator.release during compensating cleanup threw (non-fatal)`,
						cleanupErr,
					)
				}
			}
			try {
				this.displayAllocator.release(displayN)
			} catch (cleanupErr) {
				this.logger?.warn?.(
					`webapp ${opts.webappId}: displayAllocator.release during compensating cleanup threw (non-fatal)`,
					cleanupErr,
				)
			}
			throw err
		}
	}

	async focus(opts: {webappId: string; userId: string}): Promise<{ok: boolean; code?: string}> {
		const entry = this.active.get(opts.webappId)
		if (!entry || entry.userId !== opts.userId) return {ok: false, code: 'NOT_FOUND'}
		// Phase 102-04 — under per-app-display, the wid is always 0. The legacy
		// isWindowAlive(wid) check is meaningless; treat the entry as alive
		// whenever it's in the map. 102-08 will replace this with a display-alive
		// check (xdpyinfo :N).
		if (entry.wid > 0) {
			const alive = await this.discovery.isWindowAlive(entry.wid)
			if (!alive) {
				await this.close({webappId: opts.webappId, userId: opts.userId, killWindow: false})
				return {ok: false, code: 'WINDOW_GONE'}
			}
			const ok = await this.discovery.activateWindow(entry.wid)
			return {ok}
		}
		// 102-04 path: no wid; focus is a no-op (window manager-less).
		return {ok: true}
	}

	async close(opts: {
		webappId: string
		userId: string
		killWindow?: boolean
	}): Promise<{ok: boolean}> {
		const entry = this.active.get(opts.webappId)
		if (!entry || entry.userId !== opts.userId) return {ok: false}

		// Stop stream (releases its own port + x11vnc child).
		try {
			await this.streamManager.stopStream(entry.streamId)
		} catch (err) {
			this.logger?.warn?.(`webapp ${opts.webappId}: stopStream threw`, err)
		}

		// Close portal session if any (legacy field, null under 102-04).
		if (entry.portalSession) {
			try {
				await entry.portalSession.closeSession()
			} catch (err) {
				this.logger?.warn?.(`webapp ${opts.webappId}: closeSession threw`, err)
			}
		}

		// Stop geometry tracker if any (legacy field, null under 102-04).
		if (entry.geometryTracker) {
			try {
				entry.geometryTracker.stop()
			} catch {
				/* noop */
			}
		}

		// Optional: kill the Chrome window via xdotool (legacy wid path). Under
		// 102-04 wid is 0 so this is effectively a no-op; full per-app close
		// (chrome.stop + xvfb.stop + profile.cleanup + display.release) lands
		// in 102-08.
		if (opts.killWindow && entry.wid > 0) {
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

		// Phase 100-08-04 — deregister per-WebApp Luse MCP entry.
		await this.deregisterWebAppMcp(opts.webappId)

		// Phase 102-04 close() is a stream-only teardown placeholder. Full
		// per-app lifecycle teardown (chrome.stop + xvfb.stop + profile.cleanup
		// + port.release + display.release) lands in Wave 3 plan 102-08.
		// Releasing here would short-circuit the 102-08 ordering tests.

		this.active.delete(opts.webappId)
		this.logger?.info?.(`webapp ${opts.webappId} closed (killWindow=${!!opts.killWindow})`)

		this.broadcastActiveWid()

		return {ok: true}
	}

	/** Phase 100-08-04 — server name format for the per-WebApp Luse MCP child. */
	private mcpServerNameFor(webappId: string): string {
		return `luse:webapp:${webappId}`
	}

	private async registerWebAppMcp(
		webappId: string,
		_wid: number,
		display: string = ':1',
	): Promise<void> {
		if (!this.mcpConfigManager || !this.luseServerPath) return
		try {
			// Phase 102-06 — PerWebAppMcpDescriptor.windowId dropped (per-WebApp
			// Luse now scopes by X11 display, not window-id). The `wid` argument
			// remains in this method signature for legacy log/IPC paths; only the
			// MCP descriptor stops carrying it. `display` (the dedicated Xvfb :N
			// for this WebApp from 102-01's DisplayAllocator) is the scope unit.
			const descriptor: PerWebAppMcpDescriptor = {
				instanceKey: webappId,
				display,
			}
			const config = buildLuseConfig(this.luseMcpEnv, this.luseServerPath, descriptor)
			const name = this.mcpServerNameFor(webappId)
			try {
				await this.mcpConfigManager.installServer(config)
			} catch (installErr) {
				const updated = await this.mcpConfigManager.updateServer(name, config)
				if (updated == null) {
					throw installErr
				}
			}
			this.logger?.info?.(
				`webapp ${webappId} per-WebApp Luse MCP registered (display=${display}); ` +
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
	 * tool dispatch time (cross-process fallback). Under 102-04 the wid is
	 * always 0; 102-06 will rewrite this helper to broadcast the display
	 * instead.
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
	 * Phase 100-07.4 — fallback resolver for the host-display Luse. Under
	 * 102-04 the wid is always 0; this returns 0 when exactly one WebApp is
	 * active, undefined otherwise.
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
		// Phase 102-04 — wid is 0 under per-app-display; legacy wid-based alive
		// check would falsely flag every entry as dead. 102-08 will replace
		// with a display-alive (`xdpyinfo :N`) check. For 102-04 the poller is
		// a no-op stub.
		const stale: string[] = []
		for (const [webappId, entry] of this.active) {
			if (entry.wid > 0) {
				const alive = await this.discovery.isWindowAlive(entry.wid).catch(() => false)
				if (!alive) stale.push(webappId)
			}
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
