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
import * as fsSync from 'node:fs'
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
// computer-use/luse-mcp-config deleted with AI Chat teardown. Inline the
// minimal MCP config shape so the optional per-WebApp Luse MCP registration
// (which is now a no-op when luseServerPath is undefined) still typechecks.
interface McpServerConfigInput {
	name: string
	transport: 'stdio' | 'streamableHttp'
	command?: string
	args?: string[]
	url?: string
	env?: Record<string, string>
	enabled?: boolean
	installedAt?: number
}

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
		// Phase 102 deploy fix: default TRUE. The A2 risk realized — Chrome
		// --start-fullscreen + --app=URL on a bare Xvfb (no WM) creates an
		// unmanaged toplevel window that doesn't render visibly. fluxbox
		// per-app display maps the window and triggers fullscreen layout.
		this.withWindowManager = opts.withWindowManager ?? true
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

			// Phase 103-05 (REQ-103-B5) — flip default OFF. Phase 103-03 + 103-04
			// ship the single-MCP display-aware path: the global `luse` MCP accepts
			// a per-call `display: ":N"` arg on every X11 tool (REQ-103-B1/B2), and
			// the system-prompt snippet (REQ-103-B4) instructs the agent to pass
			// it. With that path live, per-WebApp MCP registration is redundant
			// AND triggers Claude Code wildcard-permission prompts (one per
			// registration). Default OFF eliminates the prompts; operators wanting
			// the legacy per-app path for debug / token-budget testing set
			// LIVOS_PER_APP_LUSE=1 explicitly.
			//
			// Semantics: ONLY the literal string '1' opts in. Any other value
			// (including unset, '0', 'true', 'yes', 'on', ' 1 ', '2') skips
			// registration. Mirrors the strict-string env-flag pattern used by
			// Bytebot opt-ins elsewhere in the codebase.
			//
			// Pre-103-05 behavior (now retired): `process.env.LIVOS_PER_APP_LUSE
			// !== '0'` — default ON, opt-out via '0'. The "tek MCP" approach
			// failed in Phase 102 r7 UAT because the global luse MCP was scoped
			// to :1 only. 103-03 fixed that root cause by adding per-call display
			// scoping; 103-05 closes the loop by removing the redundant per-app
			// MCPs from the default boot path.
			if (process.env.LIVOS_PER_APP_LUSE === '1') {
				await this.registerWebAppMcp(opts.webappId, 0, display, opts.url)
			} else {
				this.logger?.info?.(
					`webapp ${opts.webappId}: per-WebApp Luse MCP SKIPPED (LIVOS_PER_APP_LUSE != '1', Phase 103-05 default-off). Agent uses the single global 'luse' MCP with per-call display arg.`,
				)
			}

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

	/**
	 * Phase 102-08 — full D-102-CLOSE-LIFECYCLE ordered teardown.
	 *
	 * Ordered 8-step shutdown for a WebApp instance. Each step wrapped in
	 * try/catch so a failure in (e.g.) chromeHandle.stop NEVER prevents
	 * subsequent releases — `displayAllocator.release` ALWAYS runs as long
	 * as the entry was registered.
	 *
	 *   1. chromeHandle.stop()           SIGTERM Chrome → 2s grace → SIGKILL
	 *      (the spawnChromeProcess handle owns the kill ladder internally).
	 *   2. streamManager.stopStream      kills x11vnc + releases its own port.
	 *   3. xvfbHandle.stop()             SIGTERM Xvfb (102-01 readiness-polled
	 *      spawner handle owns the SIGKILL fallback if needed).
	 *   4. profileSeeder.cleanup(uuid)   rm -rf /tmp/livos-chrome-app-<uuid>.
	 *   5. displayAllocator.release(N)   :N back to the [10..99) pool.
	 *   6. portAllocator.release(port)   tracking port back (stream-manager
	 *      already released its own; second release on the same allocator is
	 *      a no-op per 101-02 contract).
	 *   7. deregisterWebAppMcp(webappId) drop Luse MCP child (Redis pub-sub
	 *      reconcile is async — ~1-2s lag is acceptable).
	 *   8. active.delete(webappId)       remove map entry.
	 *
	 * Idempotency: if `active.get(opts.webappId)` is absent (already-closed
	 * webappId or never-spawned), return {ok: true} immediately — no
	 * subsequent step fires. To prevent a concurrent close() racing with
	 * the same id, we eagerly delete from `active` BEFORE running teardown.
	 *
	 * userId scope: the legacy contract returned {ok: false} when userId
	 * didn't match. Preserved here.
	 */
	async close(opts: {
		webappId: string
		userId: string
		killWindow?: boolean
	}): Promise<{ok: boolean}> {
		const entry = this.active.get(opts.webappId)
		if (!entry) return {ok: true} // idempotent — no-op for missing entries
		if (entry.userId !== opts.userId) return {ok: false}

		// Eagerly remove from active so a concurrent close() races short-circuits
		// on the missing-entry path above. All teardown work happens AFTER this
		// line; failures don't put the entry back.
		this.active.delete(opts.webappId)

		// 1. Chrome SIGTERM → 2s grace → SIGKILL (handle owns the kill ladder).
		if (entry.chromeHandle) {
			try {
				await entry.chromeHandle.stop()
			} catch (err) {
				this.logger?.warn?.(`webapp ${opts.webappId}: chromeHandle.stop threw (non-fatal)`, err)
			}
		}

		// 2. x11vnc (via stream-manager — also releases its allocated port).
		try {
			await this.streamManager.stopStream(entry.streamId)
		} catch (err) {
			this.logger?.warn?.(`webapp ${opts.webappId}: streamManager.stopStream threw (non-fatal)`, err)
		}

		// 3. Xvfb.
		if (entry.xvfbHandle) {
			try {
				await entry.xvfbHandle.stop()
			} catch (err) {
				this.logger?.warn?.(`webapp ${opts.webappId}: xvfbHandle.stop threw (non-fatal)`, err)
			}
		}

		// 4. /tmp profile cleanup (rm -rf /tmp/livos-chrome-app-<uuid>).
		if (entry.profileUuid) {
			try {
				await this.profileSeeder.cleanup(entry.profileUuid)
			} catch (err) {
				this.logger?.warn?.(
					`webapp ${opts.webappId}: profileSeeder.cleanup threw (non-fatal)`,
					err,
				)
			}
		}

		// 5. Release display slot.
		try {
			this.displayAllocator.release(entry.displayN)
		} catch (err) {
			this.logger?.warn?.(
				`webapp ${opts.webappId}: displayAllocator.release threw (non-fatal)`,
				err,
			)
		}

		// 6. Release tracking port slot (idempotent — stream-manager already released
		// its own port; second release on the shared allocator is a no-op).
		if (typeof entry.port === 'number') {
			try {
				this.portAllocator.release(entry.port)
			} catch (err) {
				this.logger?.warn?.(`webapp ${opts.webappId}: portAllocator.release threw (non-fatal)`, err)
			}
		}

		// Legacy/non-Phase-102 cleanup paths kept for callers that still set
		// portalSession or geometryTracker on the entry. Under 102-04 both are
		// null so these are dead-code branches; preserved for back-compat.
		if (entry.portalSession) {
			try {
				await entry.portalSession.closeSession()
			} catch (err) {
				this.logger?.warn?.(`webapp ${opts.webappId}: closeSession threw`, err)
			}
		}
		if (entry.geometryTracker) {
			try {
				entry.geometryTracker.stop()
			} catch {
				/* noop */
			}
		}

		// Optional xdotool windowkill (legacy wid path; vestigial under 102-04
		// because entry.wid is always 0).
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

		// 7. Phase 100-08-04 — deregister per-WebApp Luse MCP entry.
		// Phase 102 r8: pass entry.url so deregister can re-derive the slug-
		// based name (matches what register installed).
		try {
			await this.deregisterWebAppMcp(opts.webappId, entry.url)
		} catch (err) {
			this.logger?.warn?.(
				`webapp ${opts.webappId}: deregisterWebAppMcp threw (non-fatal)`,
				err,
			)
		}

		// 8. active.delete already happened above (eager). Broadcast SOLE-active
		// wid for legacy IPC fallback.
		this.logger?.info?.(`webapp ${opts.webappId} closed (killWindow=${!!opts.killWindow})`)
		this.broadcastActiveWid()

		return {ok: true}
	}

	/**
	 * Phase 100-08-04 — server name format for the per-WebApp Luse MCP child.
	 *
	 * Phase 102 UAT round 8 (2026-05-11): user feedback "kod yerine yandex
	 * yazsa app adi" — replace UUID with URL-derived slug. We append the
	 * first 4 chars of the webappId to keep names unique when the user opens
	 * the same domain multiple times (e.g. `luse:webapp:yandex-91c9` and
	 * `luse:webapp:yandex-a3a1`). Falls back to webappId-only if url is
	 * missing (deregister path during error recovery).
	 */
	private mcpServerNameFor(webappId: string, url?: string): string {
		if (!url) return `luse:webapp:${webappId}`
		let slug = 'webapp'
		try {
			const host = new URL(url).hostname.replace(/^www\./, '')
			// "yandex.com" → "yandex"; "livinity.io" → "livinity"
			slug = (host.split('.')[0] || 'webapp').toLowerCase().replace(/[^a-z0-9]/g, '')
			if (!slug) slug = 'webapp'
		} catch {
			// Invalid URL — keep fallback "webapp"
		}
		const suffix = webappId.substring(0, 4)
		return `luse:webapp:${slug}-${suffix}`
	}

	private async registerWebAppMcp(
		webappId: string,
		_wid: number,
		display: string = ':1',
		url?: string,
	): Promise<void> {
		// luse-mcp-config module deleted with AI Chat teardown — per-WebApp
		// MCP registration is now a no-op. Kept the method signature so call
		// sites compile unchanged.
		void webappId; void _wid; void display; void url
		return
	}

	private async deregisterWebAppMcp(webappId: string, url?: string): Promise<void> {
		if (!this.mcpConfigManager) return
		try {
			await this.mcpConfigManager.removeServer(this.mcpServerNameFor(webappId, url))
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
	 * Phase 100-07.4 — write the SOLE active WebApp's wid to the per-user
	 * runtime-dir marker (`$XDG_RUNTIME_DIR/livos/active-webapp-wid`) for the
	 * Luse MCP child to read at tool dispatch time (cross-process fallback).
	 * Under 102-04 the wid is always 0; 102-06 will rewrite this helper to
	 * broadcast the display instead.
	 *
	 * Phase 252-06 (R15) — moved off world-shared /tmp into the per-uid 0700
	 * runtime dir. livinityd (writer) AND the luse MCP child (reader,
	 * mcp/tools.ts) run as the SAME desktop user, so $XDG_RUNTIME_DIR resolves
	 * to the same path in both processes. Closes the multi-user collision +
	 * TOCTOU symlink surface (the reader now lstat-rejects + O_NOFOLLOW-opens).
	 */
	private broadcastActiveWid(): void {
		const xdgRuntimeDir =
			process.env.XDG_RUNTIME_DIR && process.env.XDG_RUNTIME_DIR.length > 0
				? process.env.XDG_RUNTIME_DIR
				: `/run/user/${process.getuid?.() ?? 1000}`
		const runtimeDir = `${xdgRuntimeDir}/livos`
		const marker = `${runtimeDir}/active-webapp-wid`
		try {
			// Phase 102 deploy fix — livinityd is ESM, `require()` is undefined
			// here. Use the synchronous node:fs API imported at module top
			// (writeFileSync/unlinkSync are pure POSIX wrappers, no async cost).
			// Under Phase 102 the per-app wid is always 0 (display-based
			// scoping replaces WID-based scoping); broadcastActiveDisplay
			// supersedes this helper but the file is kept written-empty for
			// backwards compat with any v33 Luse instance still reading it.
			const wid = this.getSingleActiveWid()
			if (this.active.size === 0) {
				try {
					fsSync.unlinkSync(marker)
				} catch {
					/* file may not exist — fine */
				}
				return
			}
			// Phase 252-06 (R15) — ensure the per-uid 0700 runtime dir exists
			// before writing the marker (it normally does on systemd hosts, but
			// a non-systemd / fresh box may not have created $XDG/livos yet).
			fsSync.mkdirSync(runtimeDir, {recursive: true, mode: 0o700})
			fsSync.writeFileSync(marker, wid !== undefined ? String(wid) : '', {encoding: 'utf8'})
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
	 * Phase 102 — resolve webappId → display string (:N) for display-mode
	 * input dispatch. Under Phase 102 each WebApp owns a dedicated Xvfb,
	 * so input events route to `xdotool --display :N` instead of by wid
	 * (which is always 0 under display-mode).
	 *
	 * Returns null if the user has no live entry for this webappId.
	 */
	getDisplayForWebapp(webappId: string, userId: string): string | null {
		const entry = this.active.get(webappId)
		if (!entry || entry.userId !== userId) return null
		return entry.display
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
