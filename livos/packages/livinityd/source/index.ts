import path from 'node:path'
import {spawn as childProcessSpawn} from 'node:child_process'
import fse from 'fs-extra'

// TODO: import packageJson from '../package.json' assert {type: 'json'}
const packageJson = (await import('../package.json', {assert: {type: 'json'}})).default

import {LIVINITY_APP_STORE_REPO, BACKUP_RESTORE_FIRST_START_FLAG} from './constants.js'
import createLogger, {type LogLevel} from './modules/utilities/logger.js'
import FileStore from './modules/utilities/file-store.js'
import Migration from './modules/startup-migrations/index.js'
import Server from './modules/server/index.js'
import User from './modules/user/user.js'
import AppStore from './modules/apps/app-store.js'
import Apps from './modules/apps/apps.js'
import Files from './modules/files/files.js'
import Notifications from './modules/notifications/notifications.js'
import EventBus from './modules/event-bus/event-bus.js'
import Dbus from './modules/dbus/dbus.js'
import Backups from './modules/backups/backups.js'
import Scheduler from './modules/scheduler/index.js'
import AiModule from './modules/ai/index.js'
import TunnelClient from './modules/platform/tunnel-client.js'
import {DeviceBridge} from './modules/devices/device-bridge.js'
import {initDatabase, migrateFromYaml, closeDatabase} from './modules/database/index.js'
import {seedLocalEnvironment} from './modules/docker/environments.js'
import {seedBuiltinTools} from './modules/seed-builtin-tools.js'
import {seedDefaultAliases} from './modules/livinity-broker/seed-default-aliases.js'
import {ApiKeyCache, createApiKeyCache, setSharedApiKeyCache} from './modules/api-keys/index.js'
// Phase 71-05 — ComputerUseContainerManager wiring. Field added so the
// desktop-gateway middleware (server/index.ts) and the computerUse tRPC
// router (computer-use/routes.ts) can reach a shared lifecycle owner.
import {ComputerUseContainerManager} from './modules/computer-use/container-manager.js'
// Phase 93/98 — streaming subsystem + WebApp window manager. Singletons are
// instantiated in start() AFTER ai.start() (StreamManager needs the boot-time
// `vainfo` probe persisted to ai.redis as `liv:streaming:caps`).
import {StreamManager} from './modules/streaming/stream-manager.js'
import {WebAppWindowManager} from './modules/webapps/window-manager.js'
import {WEBAPPS_X11_ENV} from './modules/webapps/window-discovery.js'
// Phase 100-08-01 — dedicated Xvfb :1 + fluxbox WM lifecycle (D-100-08-A).
import {startXvfb, type XvfbHandle} from './modules/webapps/xvfb-display.js'
import {startFluxbox, type FluxboxHandle} from './modules/webapps/fluxbox-wm.js'
// Phase 100-10-01 — per-WebApp X display allocator (D-100-10-A). Hands out
// `:10`, `:11`, ... per WebApp spawn so each WebApp owns its own Xvfb +
// fluxbox + x11vnc whole-display capture. Eliminates cross-window stacking
// (Issue 2) and lets x11vnc capture Chrome's full pixels (Issue 1).
import {createDisplayAllocator} from './modules/webapps/display-allocator.js'
// Phase 100-08-04 — McpConfigManager + Luse server path threaded into
// WebAppWindowManager so spawn/close lifecycle registers a per-WebApp
// Luse MCP child via Redis pub-sub (liv-core's McpClientManager
// reconciles asynchronously). Canonical pattern documented in
// agent-runs.ts:52-58, 161-164. (Renamed P100-10-02 from bytebot per
// D-100-10-B.)
import {McpConfigManager} from '@liv/core/lib'
import {DEFAULT_LUSE_MCP_SERVER_PATH} from './modules/computer-use/luse-mcp-config.js'
// Phase 101-01 — Chrome CDP bootstrap + typed wrapper. Spawn singleton Chrome
// with --remote-debugging-port=9222 (T-101-01 mitigation: bound to 127.0.0.1
// only) at livinityd boot. ChromeCdpClient holds the persistent CDP connection
// the Wave 2+ webapps/window-manager rewrite drives. Bootstrap failure is
// non-fatal — Pillar A degrades, livinityd keeps running (mirror of the
// streaming-subsystem try/catch at lines 474-482).
import {bootstrapChrome, ChromeCdpClient} from './modules/chrome-cdp/index.js'

// 2026-05-08: livinityd's systemd env contains only PATH/USER/HOME — no
// DISPLAY or XAUTHORITY. Both subsystems that touch X11 (streaming's
// ffmpeg x11grab, webapps' sudo→chrome) need these to reach the host
// display. Wrap the raw `child_process.spawn` so every child inherits
// the right env without each caller re-doing the merge. Caller-supplied
// `env` still wins (sudo command-prefix vars in webapps still take
// effect).
const x11Spawn = ((cmd: string, args: ReadonlyArray<string>, opts: any = {}) =>
	childProcessSpawn(cmd, args as string[], {
		...opts,
		env: {...process.env, ...WEBAPPS_X11_ENV, ...(opts.env ?? {})},
	})) as typeof childProcessSpawn
import {probeVaapi, persistVaapiCaps} from './modules/streaming/vaapi-probe.js'
import {getPool} from './modules/database/index.js'

import {commitOsPartition, setupPiCpuGovernor, restoreWiFi, waitForSystemTime} from './modules/system/system.js'
import {overrideDevelopmentHostname} from './modules/development.js'

type StoreSchema = {
	version: string
	apps: string[]
	appRepositories: string[]
	widgets: string[]
	torEnabled?: boolean
	user: {
		name: string
		hashedPassword: string
		totpUri?: string
		wallpaper?: string
		language?: string
		temperatureUnit?: string
	}
	settings: {
		releaseChannel: 'stable' | 'beta'
		wifi?: {
			ssid: string
			password?: string
		}
		externalDns?: boolean
	}
	development: {
		hostname?: string
	}
	recentlyOpenedApps: string[]
	files: {
		preferences: {
			view: 'icons' | 'list'
			sortBy: 'name' | 'type' | 'modified' | 'size'
			sortOrder: 'ascending' | 'descending'
		}
		favorites: string[]
		recents: string[]
		shares: {
			name: string
			path: string
		}[]
		networkStorage: {
			host: string
			share: string
			username: string
			password: string
			mountPath: string
		}[]
	}
	notifications: string[]
	backups: {
		repositories: {
			id: string
			path: string
			password: string
			lastBackup?: number
		}[]
		ignore: string[]
	}
}

export type LivinitydOptions = {
	dataDirectory: string
	port?: number
	logLevel?: LogLevel
	defaultAppStoreRepo?: string
}

export default class Livinityd {
	version: string = packageJson.version
	versionName: string = packageJson.versionName
	developmentMode: boolean
	dataDirectory: string
	port: number
	logLevel: LogLevel
	logger: ReturnType<typeof createLogger>
	store: FileStore<StoreSchema>
	migration: Migration
	server: Server
	user: User
	appStore: AppStore
	apps: Apps
	files: Files
	notifications: Notifications
	eventBus: EventBus
	dbus: Dbus
	backups: Backups
	scheduler: Scheduler
	ai: AiModule
	tunnelClient: TunnelClient
	deviceBridge!: DeviceBridge
	// Phase 59 (FR-BROKER-B1-03) — Bearer auth hot-path cache. Constructed in
	// the constructor (no DB dep at construction; getPool() is resolved lazily
	// inside flushLastUsed). Disposed by cli.ts cleanShutdown so pending
	// last_used_at writes are flushed before SIGTERM/SIGINT exits the process.
	apiKeyCache: ApiKeyCache
	// Phase 71-05 — upstream-bytebot desktop container lifecycle owner.
	// Initialized in start() AFTER initDatabase() because the manager needs the pg pool.
	// Optional because PostgreSQL may be unavailable on legacy YAML-only mode
	// (initDatabase returns false). Consumers (desktop-gateway, computerUse
	// tRPC router) gracefully no-op when undefined.
	computerUseManager?: ComputerUseContainerManager
	// Phase 93 — Streaming subsystem (T93-05 StreamManager). Optional because
	// T93-11 wires the lifecycle in start(); this field is declared up-front so
	// the /ws/stream/:id upgrade handler in server/index.ts can typecheck.
	streamManager?: StreamManager
	// Phase 93 — WebApp Window Manager (T93-10 spawn/focus/close/list).
	// Composes window-discovery + portal/geometry-tracker + StreamManager
	// for the v33 WebApp UX. Optional for the same wiring reason as
	// streamManager — T93-11 owns lifecycle init in start().
	webappWindowManager?: WebAppWindowManager
	// Phase 100-08-01 — dedicated Xvfb :1 + fluxbox WM lifecycle (D-100-08-A).
	// Lifecycle owned by start()/stop(); both fields stay undefined if Xvfb
	// or fluxbox fail to spawn (non-fatal — webapp.window.spawn returns
	// SERVICE_UNAVAILABLE downstream).
	xvfbHandle?: XvfbHandle
	fluxboxHandle?: FluxboxHandle
	// Phase 101-01 — Chrome CDP client singleton. Constructed + connected in
	// start() AFTER StreamManager and BEFORE WebAppWindowManager so the Wave 2
	// window-manager rewrite (Plan 101-04) can consume it via constructor opt.
	// Stays null when bootstrap fails (Pillar A degraded — livinityd boot
	// continues per the streaming subsystem try/catch pattern).
	chromeCdpClient: ChromeCdpClient | null = null
	isBackupRestoreFirstStart = false

	constructor({
		dataDirectory,
		port = 80,
		logLevel = 'normal',
		defaultAppStoreRepo = LIVINITY_APP_STORE_REPO,
	}: LivinitydOptions) {
		this.developmentMode = process?.env?.NODE_ENV === 'development'
		this.dataDirectory = path.resolve(dataDirectory)
		this.port = port
		this.logLevel = logLevel
		this.logger = createLogger('livinityd', this.logLevel)
		this.store = new FileStore<StoreSchema>({filePath: `${dataDirectory}/livinity.yaml`})
		this.migration = new Migration(this)
		this.server = new Server({livinityd: this})
		this.user = new User(this)
		this.appStore = new AppStore(this, {defaultAppStoreRepo})
		this.apps = new Apps(this)
		this.files = new Files(this)
		this.notifications = new Notifications(this)
		this.eventBus = new EventBus(this)
		this.dbus = new Dbus(this)
		this.backups = new Backups(this)
		this.scheduler = new Scheduler({logger: this.logger})
		this.ai = new AiModule({livinityd: this})
		// TunnelClient is initialized in start() after ai.start() creates the Redis connection
		this.tunnelClient = null as unknown as TunnelClient
		// Phase 59 — Bearer auth cache. Construction is side-effect-free (only
		// schedules a 30s setInterval that lazily resolves getPool()), so
		// instantiating here keeps the field always-defined for the bearer-auth
		// middleware mounted by Server.start().
		this.apiKeyCache = createApiKeyCache({logger: this.logger})
		// Phase 59 Plan 04 — register the singleton so the apiKeysRouter
		// (specifically the `revoke` mutation) can call
		// `getSharedApiKeyCache().invalidate(keyHash)` and hit the SAME cache
		// the bearer middleware reads from. Without this registration the
		// route would either crash at first revoke OR (worse) mutate a
		// detached instance leaving the bearer middleware serving cached
		// positives for up to 60s — RESEARCH.md Pitfall 1 / T-59-21.
		setSharedApiKeyCache(this.apiKeyCache)
	}

	async start() {
		this.logger.log(`☂️  Starting Livinity v${this.version}`)
		this.logger.log()
		this.logger.log(`dataDirectory: ${this.dataDirectory}`)
		this.logger.log(`port:          ${this.port}`)
		this.logger.log(`logLevel:      ${this.logLevel}`)
		this.logger.log()

		// If we've successfully booted then commit to the current OS partition (non-blocking)
		commitOsPartition(this)

		// Set ondemand cpu governor for Raspberry Pi (non-blocking)
		setupPiCpuGovernor(this)

		// Run migration module before anything else
		// TODO: think through if we want to allow the server module to run before migration.
		// It might be useful if we add more complicated migrations so we can signal progress.
		await this.migration.start()

		// Detect first boot after a backup restore (we run after migrations move 'import' into dataDirectory)
		await this.setBackupRestoreFirstStartFlag()

		// Override hostname in development when set
		const developmentHostname = await this.store.get('development.hostname')
		if (developmentHostname) await overrideDevelopmentHostname(this, developmentHostname)

		// Synchronize the system password after OTA update (non-blocking)
		this.user.syncSystemPassword()

		// Restore WiFi connection after OTA update (non-blocking)
		restoreWiFi(this)

		// Wait for system time to be synced for up to 10 seconds before proceeding
		// We need this on Raspberry Pi since it doesn't have a persistent real time clock.
		// It avoids race conditions where LivOS starts making network requests before
		// the local time is set which then fail with SSL cert errors.
		await waitForSystemTime(this, 10)

		// We need to forcefully clean Docker state before being able to safely continue
		// If an existing container is listening on port 80 we'll crash, if an old version
		// of Livinity wasn't shutdown properly, bringing containers up can fail.
		// Skip this in dev mode otherwise we get very slow reloads since this cleans
		// up app containers on every source code change.
		if (!this.developmentMode) {
			await this.apps.cleanDockerState().catch((error) => this.logger.error(`Failed to clean Docker state`, error))
		}

		// Initialize PostgreSQL database (non-fatal -- falls back to YAML if unavailable)
		const dbLogger = this.logger.createChildLogger('database')
		const dbReady = await initDatabase(dbLogger)
		if (dbReady) {
			// Migrate YAML user data to PostgreSQL if this is the first run with DB
			await migrateFromYaml(this.store, dbLogger)

			// Phase 22 MH-01 — seed the built-in 'local' environment row so single-host
			// installs are byte-for-byte backwards compatible. Idempotent — safe on every boot.
			try {
				await seedLocalEnvironment()
				dbLogger.log("Seeded 'local' environment row")
			} catch (err) {
				dbLogger.error('Failed to seed local environment', err)
			}
		} else {
			dbLogger.log('PostgreSQL not available, continuing with YAML-only mode')
		}

		// Initialise modules (ai must start first — TunnelClient needs ai.redis)
		await Promise.all([
			this.files.start(),
			this.apps.start(),
			this.appStore.start(),
			this.dbus.start(),
			this.server.start(),
			this.ai.start(),
		])

		// Phase 71-05 — upstream-bytebot desktop container lifecycle. Initialized
		// AFTER apps.start() (the manager re-uses apps.installForUser) and AFTER
		// initDatabase() (manager needs the pg pool from 71-03's task-repository).
		// Non-fatal — missing PG → manager stays undefined; desktop subdomain
		// gateway and computerUse tRPC router gracefully no-op without it.
		if (dbReady) {
			try {
				const pool = getPool()
				if (pool) {
					this.computerUseManager = new ComputerUseContainerManager({
						apps: this.apps,
						pool,
						logger: this.logger,
					})
					this.computerUseManager.start()
					this.logger.log('ComputerUseContainerManager started (5-min idle reaper armed)')
				}
			} catch (err) {
				this.logger.error('Failed to start ComputerUseContainerManager (desktop subdomain disabled)', err)
			}
		}

		// Phase 50 (v29.5 A1) — defensive eager seed of built-in tools to nexus:cap:tool:*
		// Survives factory resets and the v29.4 syncAll() stub (D-WAVE5-SYNCALL-STUB).
		try {
			await seedBuiltinTools(this.ai.redis)
			this.logger.log('Seeded 9 built-in tool manifests to capability registry')
		} catch (err) {
			// Non-fatal — boot continues; tools will be missing until next syncTools()
			this.logger.error('Failed to seed builtin tools', err)
		}

		// Phase 61 Plan 03 D1 — boot-time seed of default broker model aliases.
		// Uses SETNX so admin runtime edits via `redis-cli SET` survive reboot
		// (FR-BROKER-D1-02). Non-fatal on failure — broker keeps working with
		// the resolver's hardcoded fallback (claude-sonnet-4-6).
		try {
			await seedDefaultAliases(this.ai.redis)
			this.logger.log('Seeded broker model aliases to livinity:broker:alias:*')
		} catch (err) {
			this.logger.error('Failed to seed broker model aliases', err)
		}

		// Phase 98-04 — wire StreamManager + WebAppWindowManager singletons
		// into the livinityd lifecycle. P93 declared the optional fields but
		// left them `undefined` at runtime; until this hookup lands, the
		// `webapp.window.{spawn,focus,close,list}` and `streams.*` tRPC
		// routes return `SERVICE_UNAVAILABLE`. We do this AFTER `ai.start()`
		// so `this.ai.redis` is connected and the boot-time `vainfo` probe
		// can persist `liv:streaming:caps` for the encoder-args module.
		// Adapt livinityd's logger surface (`log` / `verbose` / `error`) to
		// the StreamManager/WebAppWindowManager logger interface
		// (`info` / `warn` / `error` / `verbose`) without rewriting the
		// underlying logger.
		try {
			const streamingLogger = (() => {
				const child = this.logger.createChildLogger('streaming')
				return {
					info: (msg: string) => child.log(msg),
					warn: (msg: string, error?: unknown) =>
						child.error(msg, error),
					error: (msg: string, error?: unknown) =>
						child.error(msg, error),
					verbose: (msg: string) => child.verbose(msg),
				}
			})()

			const caps = await probeVaapi()
			try {
				await persistVaapiCaps(this.ai.redis, caps)
				streamingLogger.info(
					`vainfo probe complete (vaapi=${caps.vaapi} profiles=${caps.profiles.join(',') || 'none'})`,
				)
			} catch (persistErr) {
				streamingLogger.warn(
					'failed to persist vaapi caps to redis (StreamManager will still run with in-memory caps)',
					persistErr,
				)
			}

			this.streamManager = new StreamManager({
				caps,
				spawn: x11Spawn,
				logger: streamingLogger,
			})
			streamingLogger.info(
				`StreamManager started (cap=${this.streamManager.getCap()})`,
			)

			// Phase 100-08-01 fallback Xvfb on :1 — back-compat for non-WebApp
			// surfaces; per-WebApp Xvfb in 100-10-01 supersedes for WebApp
			// spawns (each WebApp now allocates its own :10, :11, ... via the
			// DisplayAllocator below). The :1 + fluxbox lifecycle here stays
			// so legacy code paths that don't go through WebAppWindowManager
			// (computer-use container streams, ad-hoc x11 surfaces, etc.)
			// continue to find a working display.
			try {
				this.xvfbHandle = await startXvfb({
					display: ':1',
					resolution: '1920x1080x24',
					logger: streamingLogger,
				})
				streamingLogger.info(`Xvfb :1 up (pid=${this.xvfbHandle.pid})`)
				// 500ms grace so X server is ready before fluxbox connects:
				await new Promise((resolve) => setTimeout(resolve, 500))
				this.fluxboxHandle = await startFluxbox({
					display: ':1',
					logger: streamingLogger,
				})
				streamingLogger.info(`fluxbox up on :1 (pid=${this.fluxboxHandle.pid})`)
			} catch (err) {
				// Non-fatal — livinityd still boots; legacy non-WebApp X11
				// consumers will be broken until recovery. Per-WebApp paths
				// still work because they allocate their own :10/:11/...
				// independent of this :1 fallback.
				streamingLogger.error(
					'Failed to start Xvfb :1 / fluxbox (legacy fallback); per-WebApp displays still allocatable',
					err,
				)
			}

			// Phase 101-01 — Chrome CDP bootstrap. Spawn the singleton Chrome with
			// --remote-debugging-port=9222 bound to 127.0.0.1 only (T-101-01
			// mitigation), wait for /json/version to return 200, then open a
			// persistent CDP connection. The about:blank shell window opened by
			// --new-window=about:blank is minimized via a SEPARATE setWindowBounds
			// call after connect (RESEARCH correction #1: CDP rejects state+bounds
			// in one call). All of this is wrapped in try/catch — bootstrap failure
			// degrades Pillar A (multi-stream WebApps) but livinityd boot keeps
			// going. The Wave 2+ window-manager rewrite (Plan 101-04) will pull
			// chromeCdpClient off `this` once it's not null.
			try {
				const chromeCdpLogger = (() => {
					const c = this.logger.createChildLogger('chrome-cdp')
					// Adapter shape matches the streamingLogger/webappLogger pattern
					// elsewhere in start() — livinityd's logger has (msg, error?)
					// signatures while our chrome-cdp modules expect ChromeCdpLogger
					// with rest-args. Collapse to error+verbose without rest.
					return {
						info: (msg: string) => c.log(msg),
						warn: (msg: string, error?: unknown) => c.error(msg, error),
						error: (msg: string, error?: unknown) => c.error(msg, error),
						verbose: (msg: string) => c.verbose(msg),
					}
				})()
				const {pid: chromePid} = await bootstrapChrome({
					display: process.env.WEBAPPS_X11_DISPLAY ?? ':1',
					logger: chromeCdpLogger,
				})
				this.chromeCdpClient = new ChromeCdpClient({logger: chromeCdpLogger})
				await this.chromeCdpClient.connect()
				chromeCdpLogger.info(`Chrome CDP ready (pid=${chromePid})`)
				// Minimize the about:blank shell window so it never shows up in
				// fluxbox. Uses the dedicated getWindowIdForTarget helper +
				// minimizeWindow (issues setWindowBounds with windowState ONLY —
				// the second flank of RESEARCH correction #1).
				try {
					const blank = await this.chromeCdpClient.findTargetByUrl(
						(u) => u === 'about:blank' || u.startsWith('about:blank'),
					)
					if (blank) {
						const windowId =
							await this.chromeCdpClient.getWindowIdForTarget(blank.targetId)
						await this.chromeCdpClient.minimizeWindow(windowId)
						chromeCdpLogger.verbose(
							`minimized about:blank shell window (windowId=${windowId})`,
						)
					}
				} catch (e) {
					chromeCdpLogger.warn(
						`Could not minimize about:blank shell: ${(e as Error).message}`,
					)
				}
			} catch (err) {
				// Non-fatal — Pillar A (multi-stream WebApps via CDP) degrades to
				// "unavailable" until next livinityd restart, but the rest of the
				// daemon stays up. Same shape as the outer streaming-subsystem
				// try/catch (lines 474-482). chromeCdpClient stays null;
				// downstream callers must check.
				this.logger.error(
					'Chrome CDP bootstrap failed; continuing without CDP (Pillar A degraded)',
					err,
				)
			}

			const webappLogger = (() => {
				const child = this.logger.createChildLogger('webapps')
				return {
					info: (msg: string) => child.log(msg),
					warn: (msg: string, error?: unknown) =>
						child.error(msg, error),
					error: (msg: string, error?: unknown) =>
						child.error(msg, error),
					verbose: (msg: string) => child.verbose(msg),
				}
			})()
			// Phase 100-08-04 — construct an McpConfigManager backed by the
			// SAME Redis livinityd already uses (this.ai.redis). Liv-core's
			// McpClientManager runs in a separate process and subscribes to
			// `liv:config:updated`, the channel McpConfigManager publishes
			// on every install/update/remove. This is the canonical pattern
			// documented in agent-runs.ts:52-58, 161-164. We do NOT call
			// liv-core's McpClientManager directly (different process at
			// port 3200).
			const webappMcpConfigManager = new McpConfigManager(this.ai.redis)
			const luseServerPath =
				process.env.LUSE_MCP_SERVER_PATH ?? DEFAULT_LUSE_MCP_SERVER_PATH
			// Phase 100-10-01 — per-WebApp X display allocator (D-100-10-A).
			// Hands out `:10`, `:11`, ... per WebApp spawn. WebAppWindowManager
			// stands up an Xvfb + fluxbox on each allocated display before
			// Chrome spawns. close() tears them down and releases the slot.
			const displayAllocator = createDisplayAllocator()
			this.webappWindowManager = new WebAppWindowManager({
				streamManager: this.streamManager,
				spawn: x11Spawn as unknown as ConstructorParameters<
					typeof WebAppWindowManager
				>[0]['spawn'],
				logger: webappLogger,
				mcpConfigManager: webappMcpConfigManager,
				luseServerPath,
				luseMcpEnv: process.env,
				// Phase 100-10-01: wire the per-WebApp display allocator. Each
				// WebApp spawn now gets `:10`+/`:11`+/... + its own Xvfb +
				// fluxbox; close() releases the slot.
				displayAllocator,
			})
			this.webappWindowManager.startIdleCleanup()
			webappLogger.info(
				'WebAppWindowManager started (5s idle-cleanup poll armed)',
			)
		} catch (err) {
			// Non-fatal — boot continues. Streaming + WebApp launcher will
			// degrade to SERVICE_UNAVAILABLE for the affected tRPC routes
			// until the next service restart resolves the problem.
			this.logger.error(
				'Failed to start streaming subsystem / WebAppWindowManager',
				err,
			)
		}

		// Initialize TunnelClient after ai.start() creates the Redis connection
		this.tunnelClient = new TunnelClient({redis: this.ai.redis})
		await this.tunnelClient.start()

		// Initialize DeviceBridge for remote device proxy tools
		this.deviceBridge = new DeviceBridge({
			redis: this.ai.redis,
			sendTunnelMessage: (msg) => this.tunnelClient.sendDeviceMessage(msg),
			logger: this.logger.createChildLogger('devices'),
			onEmergencyStop: (deviceId: string) => {
				this.ai.abortDeviceSessions(deviceId)
			},
		})
		this.tunnelClient.setDeviceBridge(this.deviceBridge)

		// Start scheduler (non-fatal — falls back to disabled mode if DB unavailable)
		try {
			await this.scheduler.start()
		} catch (error) {
			this.logger.error('Failed to start scheduler', error)
		}

		// Start backups last because it depends on files
		this.backups.start()
	}

	private async setBackupRestoreFirstStartFlag() {
		try {
			const restoreFlagPath = `${this.dataDirectory}/${BACKUP_RESTORE_FIRST_START_FLAG}`
			if (await fse.pathExists(restoreFlagPath)) {
				this.logger.log('Detected first start after backup restore')
				this.isBackupRestoreFirstStart = true
				await fse.remove(restoreFlagPath).catch(() => {})
			}
		} catch (error) {
			this.logger.error('Failed checking backup restore first-start flag', error)
		}
	}

	async stop() {
		try {
			// Stop backups first because it depends on files
			await this.backups.stop()

			// Phase 98-04 — stop the WebApp idle-cleanup poller before the
			// rest of shutdown so we don't keep firing xprop probes against a
			// torn-down environment.
			try {
				this.webappWindowManager?.stopIdleCleanup()
			} catch (err) {
				this.logger.error('Failed to stop WebAppWindowManager idle cleanup', err)
			}

			// Phase 100-08-01 — tear down fluxbox first (depends on Xvfb),
			// then Xvfb. Both helpers SIGTERM → 2s grace → SIGKILL.
			try {
				await this.fluxboxHandle?.stop()
			} catch (err) {
				this.logger.error('Failed to stop fluxbox', err)
			}
			try {
				await this.xvfbHandle?.stop()
			} catch (err) {
				this.logger.error('Failed to stop Xvfb', err)
			}

			// Stop modules
			await Promise.all([this.files.stop(), this.apps.stop(), this.appStore.stop(), this.dbus.stop(), this.ai.stop(), this.tunnelClient.stop(), this.scheduler.stop()])

			// Phase 59 — flush pending last_used_at writes BEFORE closing the DB
			// pool so the final UPDATEs land. Best-effort; errors are swallowed
			// by dispose() so a stop() failure here never blocks the rest of
			// the shutdown chain.
			await this.apiKeyCache.dispose().catch(() => {})

			// Close database connection pool
			await closeDatabase()

			return true
		} catch (error) {
			// If we fail to stop gracefully there's not really much we can do, just log the error and return false
			// so it can be handled elsewhere if needed
			this.logger.error(`Failed to stop livinityd`, error)
			return false
		}
	}
}
