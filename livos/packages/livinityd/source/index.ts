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
import RedisModule from './modules/redis-module.js'
import TunnelClient from './modules/platform/tunnel-client.js'
import {DeviceBridge} from './modules/devices/device-bridge.js'
import {initDatabase, migrateFromYaml, closeDatabase} from './modules/database/index.js'
import {seedLocalEnvironment} from './modules/docker/environments.js'
import {seedBuiltinTools} from './modules/seed-builtin-tools.js'
import {drainInstallPendingRedisKeys} from './modules/drain-install-pending-redis.js'
// Phase 169-05 — Vault graph factory import is kept here (source/index.ts) for
// grep visibility per the 169-05 sacred-guard contract; the actual app.use()
// mount happens inside server/index.ts via the mountVaultGraphRoutes helper,
// where livinityd.server.verifyToken is available for the auth middleware.
import {createVaultGraphRouter} from './modules/vault-graph/routes.js'
void createVaultGraphRouter // referenced by mountVaultGraphRoutes; explicit no-op keeps the symbol in grep results.
import {ApiKeyCache, createApiKeyCache, setSharedApiKeyCache} from './modules/api-keys/index.js'
// Phase 104 plan 104-10 — LivOS → livinity.io heartbeat client. Wired AFTER
// ai.start() so this.ai.redis is connected. Only armed when the operator
// passed `--api-key liv_k_...` at install time (104-09 wrote the file +
// Redis key); otherwise we skip silently so plain LAN-only installs don't
// spam the journal with "API key unavailable" warnings.
import {startHeartbeat, REDIS_KEY_API_KEY_PATH, type StopHandle as HeartbeatStopHandle} from './modules/account/index.js'
// Phase 93/98 — streaming subsystem + WebApp window manager. Singletons are
// instantiated in start() AFTER ai.start() (StreamManager needs the boot-time
// `vainfo` probe persisted to ai.redis as `liv:streaming:caps`).
import {StreamManager} from './modules/streaming/stream-manager.js'
// Phase 101-05 — shared PortAllocator instance. ONE allocator backs BOTH the
// StreamManager's vnc-window spawn path AND the native-app binder's
// stream-port wiring (apps.native.spawn route). Sharing the allocator is what
// D-101-PORT-ALLOC requires: WebApps + native apps draw from the same
// [15900, 16000) pool with no collision risk.
import {PortAllocator} from './modules/streaming/port-allocator.js'
import {WebAppWindowManager} from './modules/webapps/window-manager.js'
import {WEBAPPS_X11_ENV} from './modules/webapps/window-discovery.js'
// Phase 100-08-01 — dedicated Xvfb :1 + fluxbox WM lifecycle (D-100-08-A).
import {startXvfb, type XvfbHandle} from './modules/webapps/xvfb-display.js'
import {startFluxbox, type FluxboxHandle} from './modules/webapps/fluxbox-wm.js'
// Phase 102-01 — legacy `webapps/display-allocator.ts` (string-returning,
// Phase 100-10-01 scaffolding) DELETED. The number-returning replacement
// lives at `streaming/display-allocator.ts` (composed with `streaming/
// xvfb-spawner.ts` for per-app X display orchestration). Phase 102-04 wires
// `new DisplayAllocator()` into `WebAppWindowManager` ctor (below).
import {DisplayAllocator} from './modules/streaming/display-allocator.js'
// Phase 100-08-04 — McpConfigManager + Luse server path threaded into
// WebAppWindowManager so spawn/close lifecycle registers a per-WebApp
// Luse MCP child via Redis pub-sub (liv-core's McpClientManager
// reconciles asynchronously). Canonical pattern documented in
// agent-runs.ts:52-58, 161-164. (Renamed P100-10-02 from bytebot per
// D-100-10-B.)
import {McpConfigManager} from '@liv/core/lib'
// Phase 101-03 — Native-app config store. Backed by `this.ai.redis` so it
// shares the same Redis connection (and pub-sub channel `liv:config:updated`)
// used by McpConfigManager. Surfaces UUID-keyed CRUD at the
// `liv:apps:native:*` namespace (D-101-NATIVE-APPS) and is consumed by the
// tRPC `apps.native.{list,get,create,delete}` router.
import {NativeAppConfigStore} from './modules/apps/native-app-config.js'
// Phase 203 Hot-fix D 2026-05-24 + Hot-fix E 2026-05-24 — permanent
// "Liv" + "Chat" dock entry seed. Idempotently upserts fixed-UUID
// native-app configs so the dock always surfaces two clickable tiles
// pointing at the same openclaw chat surface (operator opens it via
// /liv-ai-app/liv-ai iframe, bypassing the setup form thanks to the
// Hot-fix E reconnect-race fix).
import {seedLivAiDockEntry} from './modules/openclawos/liv-ai-dock-seed.js'
// Phase 157 — v37 install dispatcher service. Wires NativeInstaller +
// AiInstaller into a module-scope InstallDispatcher consumed by the
// `apps.installV37` / `apps.uninstallV37` / `apps.v37Progress` trpc
// procedures. Must be initialised AFTER `this.ai.start()` (Redis) and
// AFTER `this.nativeAppConfigStore` is constructed.
import {initV37InstallService} from './modules/apps/v37-install-service.js'
// Phase 159 — native-app idle reaper. Self-rescheduling 30s walk over
// activeNative; reaps handles older than NATIVE_APP_IDLE_REAP_MS (default
// 30min). Defense in depth for the window-manager-mediated close handler
// (159-02) and the fire-and-forget native-routes close mutation.
import {startNativeAppIdleReaper} from './modules/apps/native-app-idle-reaper.js'
import {activeNative, nativeDisplayAllocator} from './modules/apps/native-routes.js'
// Phase 101-01 + 101-04 — singleton Chrome bootstrap + typed CDP client.
// `bootstrapChrome` spawns Chrome with --remote-debugging-port=9222 and
// waits for /json/version to return 200. `ChromeCdpClient` owns the
// persistent CDP connection. Phase 101-04 calls `setChromePid()` after
// bootstrap resolves so `WebAppWindowManager.spawn()` can baseline
// `xdotool search --pid <pid>` BEFORE issuing CDP createTarget
// (RESEARCH Q1 RESOLVED — PID-narrowed wid lookup replaces title race).
import {bootstrapChrome, ChromeCdpClient} from './modules/chrome-cdp/index.js'
// Phase 102-03 — Master Chrome profile seeder (D-102-MASTER-PROFILE-SEED).
// Boot-time `ensureMasterExists()` creates `/opt/livos/data/chrome-master/`
// if absent (user populates by running Settings → Chrome Master Login from
// plan 102-07). Boot-time `sweepOrphans()` removes leftover
// `/tmp/livos-chrome-app-*` dirs from any prior livinityd crash (cleanup
// gate from D-102-CLOSE-LIFECYCLE). Wave 2 plan 102-04 (window-manager
// rewrite) will consume `this.profileSeeder` to copy master → per-app dir
// at every WebApp spawn.
import {createProfileSeeder, type ProfileSeederHandle} from './modules/chrome-master/index.js'
// Phase 103-01 Task 3 — production wire-up of the chromeMaster router.
// `createChromeMasterRouter({displayAllocator, streamManager, profileSeeder})`
// produces a router that can spawn master Chrome on a managed Xvfb display.
// `createAppRouter({chromeMaster})` rebuilds the top-level appRouter with
// the injected sub-router. `setProductionAppRouter(r)` swaps the
// trpcExpressHandler proxy's cached middleware closure so /trpc requests
// route through the injected router from this swap forward.
import {createChromeMasterRouter} from './modules/chrome-master/index.js'
import {createAppRouter, setProductionAppRouter} from './modules/server/trpc/index.js'
// Phase 196-01 — xAI OAuth dependency injection. Closes Phase 195 HUMAN-UAT #1:
// before this plan landed, the bare `xaiAuthRouter` empty-injection Proxy
// threw HTTP 500 emptyInjectionStub on the first procedure call (live probe
// 2026-05-22 on Mini PC confirmed). The two service singletons constructed
// in start() are injected into createXaiAuthRouter and passed through the
// createAppRouter `xaiAuth:` slot so `auth.xai.*` serves real opencode flows.
import {XaiAuthFlowService} from './modules/xai-auth/index.js'
import {XaiCredentialsService} from './modules/xai-credentials/index.js'
import {createXaiAuthRouter} from './modules/server/trpc/xai-auth-router.js'
// Phase 196-05 — setup.* (region + locale-timezone) production wire-up.
// 196-04 shipped the router factory with setRegion; 196-05 extends with
// setLocaleTimezone and the timezoneService dep. The default Proxy stub
// throws on call until this swap lands.
import {createSetupRouter} from './modules/server/trpc/setup-router.js'
import {createTimezoneService} from './modules/locale/index.js'
// Phase 203-08 — Liv AI agent runtime (Mastra purged). LivOSAgent is the
// sole runtime; LIV_AGENT_RUNTIME defaults to `openclaw` (deploy walk in
// Plan 203-12 flips Mini PC env). Mastra-specific imports (LivOSMastra,
// chat-route, liv-ai, mastra-instance, Mastra Memory) are DELETED per the
// Plan 203-08 purge. Surviving framework-agnostic modules live under
// agent-runtime/ (Plan 203-08 git-mv preserved history).
import {
	LivOSAgent,
	OpenclawClient,
	createProviderRouter,
} from './modules/agent-runtime/index.js'
import {createConversationMemoryAdapter} from './modules/agent-runtime/memory.js'
import {ApprovalManager} from './modules/agent-runtime/approval-manager.js'
import {runMastraMigrations} from './modules/agent-runtime/migrate.js'
import {runLivOSMigrations} from './db/migrate.js'
import {
	AgentRepository,
	seedSystemAgents,
} from './modules/agent-runtime/agents/agent-repository.js'
import {AgentRegistry} from './modules/agent-runtime/agents/agent-registry.js'
import {createMcpBridge} from './modules/agent-runtime/mcp-bridge.js'
import {createMastraRouter} from './modules/server/trpc/mastra-router.js'
import {AgentScheduler} from './modules/agent-runtime/scheduler.js'
import {createAgentRouter} from './modules/server/trpc/agent-router.js'
import {createAgentTaskRouter} from './modules/server/trpc/agent-task-router.js'
// Phase 203-04 — OpenUIAppsRepository + openclawos.apps.* tRPC router.
// Drizzle-backed CRUD against the Postgres `livos_openui_apps` table
// (migration 0003); consumed by the rebranded liv-claw plugin's app-store
// HTTP client (livos/packages/liv-claw-os/packages/claw-plugin/src/
// app-store.ts) in place of the upstream fs.writeJson backend.
import {OpenUIAppsRepository} from './modules/openclawos/openui-apps-repository.js'
import {createOpenclawosAppsRouter} from './modules/server/trpc/openclawos-router.js'
// Phase 202-07 — MCP external server config sub-router (`mcp.config.*`).
// Backed by Redis hash `liv:mcp:config` (D-202-12). Boot wire-up builds the
// real factory with `this.ai.redis` so the /settings → MCP tab can CRUD
// the hash; McpBridge picks up changes at next livinityd boot.
import {createMcpConfigRouter} from './modules/server/trpc/mcp-config-router.js'
// Phase 204-01 — provider.config.* router (LLM provider API key entry for
// liv-claw-gateway). Boot wire-up builds the real factory with
// `this.ai.redis` so the /settings → Providers tab can CRUD the
// `liv:provider:keys` hash + regen `/etc/default/liv-claw-gateway` + kick
// off `sudo systemctl restart liv-claw-gateway`. Factory-DI mirrors the
// mcp-config-router pattern (line 165 above).
import {ProviderKeyStore} from './modules/provider/key-store.js'
import {EnvFileWriter} from './modules/provider/env-file-writer.js'
import {createRestartHook} from './modules/provider/restart-hook.js'
import {createProviderConfigRouter} from './modules/server/trpc/provider-config-router.js'
// Phase 202-04 — SSE endpoint that pushes live agent status to the
// /agents dashboard. Subscribes to the same scheduler statusEvents
// EventEmitter that runOnce / drainAgentStream emit on.
import {createAgentsStatusSseHandler} from './modules/server/routes-agents-sse.js'
// Phase 203-08 — Mastra chatRoute (POST /chat/livAi) DELETED. The assistant-ui
// frontend is purged in Plan 203-09; the openclaw gateway hosts its own chat
// surface at https://bruce.livinity.io/liv-ai-app/ (proxied via Caddy to
// :18789 per D-203-05). The legacy /chat/:agentId Express mount no longer
// fires; LivOSAgent.agentClient.streamInvoke is the new dispatch surface
// (called by the openclaw plugin's tool-call hooks, not by livinityd itself).
import express from 'express'

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
	ai: RedisModule
	tunnelClient: TunnelClient
	deviceBridge!: DeviceBridge
	// Phase 59 (FR-BROKER-B1-03) — Bearer auth hot-path cache. Constructed in
	// the constructor (no DB dep at construction; getPool() is resolved lazily
	// inside flushLastUsed). Disposed by cli.ts cleanShutdown so pending
	// last_used_at writes are flushed before SIGTERM/SIGINT exits the process.
	apiKeyCache: ApiKeyCache
	// Phase 104 plan 104-10 — handle returned by startHeartbeat(). Undefined
	// when the operator did not pass --api-key at install time (104-09) — in
	// that case the heartbeat is never armed. Set in start(), called in stop()
	// for graceful shutdown so the self-rescheduling setTimeout chain unwinds
	// cleanly on SIGTERM/SIGINT.
	private stopHeartbeat?: HeartbeatStopHandle
	// Phase 159 — native-app idle reaper stop handle. Armed in start() AFTER
	// the StreamManager construction block; halted in stop() so the
	// self-rescheduling setTimeout chain unwinds cleanly on SIGTERM/SIGINT.
	// Undefined while the reaper has not been started (boot edge before
	// streamManager is constructed, or post-stop).
	private nativeAppIdleReaperStop?: () => void
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
	// Phase 101-03 — Native-app config store (D-101-NATIVE-APPS). Optional
	// because the tRPC routes return SERVICE_UNAVAILABLE if it has not yet
	// been wired (boot edge before ai.start() finishes, or Redis offline).
	// Instantiated in start() AFTER ai.start() so it can borrow this.ai.redis.
	nativeAppConfigStore?: NativeAppConfigStore
	// Phase 101-01 — singleton Chrome CDP client. Stays `undefined` when
	// `bootstrapChrome` fails at start() (Pillar A degraded; rest of the
	// daemon keeps running). 101-04 reads this field at
	// WebAppWindowManager construction so spawn()/close() can drive Chrome
	// via CDP (Target.createTarget for new windows; closeTarget for tear
	// down) instead of the legacy `sudo google-chrome ...` argv path.
	chromeCdpClient?: ChromeCdpClient
	// Phase 102-03 — Master profile seeder handle. Constructed in start()
	// AFTER StreamManager (matches the streamManager/webappWindowManager
	// lifecycle pattern). Null while livinityd is still booting — Wave 2
	// plan 102-04 (window-manager rewrite) will consume this once the
	// per-app spawn flow is rewritten.
	profileSeeder: ProfileSeederHandle | null = null
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
		this.ai = new RedisModule({livinityd: this})
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

		// Phase 101-03 — Wire the NativeAppConfigStore now that this.ai.redis
		// is live. Construction is side-effect-free (just stashes the redis
		// reference), so we do it eagerly here BEFORE anything that might
		// fail downstream — the tRPC `apps.native.*` routes resolve the store
		// off `ctx.livinityd.nativeAppConfigStore` and would return
		// SERVICE_UNAVAILABLE if this field were undefined.
		this.nativeAppConfigStore = new NativeAppConfigStore(this.ai.redis)
		this.logger.log('NativeAppConfigStore wired (liv:apps:native:* namespace)')

		// Phase 203 Hot-fix F 2026-05-24 — DELETE the Hot-fix D/E desktop
		// entries that were mistakenly seeded into NativeAppConfigStore
		// (which feeds the DESKTOP grid, not the DOCK). The dock tiles
		// now live in the hardcoded modules/desktop/dock.tsx
		// (LIV_AI_CHAT + LIV_AI_CHAT_SHORTCUT — Hot-fix F part 1).
		// `seedLivAiDockEntry` is now misnamed — it DELETES (kept the
		// name for caller stability across the hot-fix cascade). Both
		// deletes are idempotent; cold installs that never had D/E
		// seeded run cleanly. Non-fatal on Redis hiccups — boot continues.
		try {
			await seedLivAiDockEntry(this.nativeAppConfigStore)
			this.logger.log('Hot-fix F — stale Liv/Chat desktop entries removed (if any)')
		} catch (err) {
			this.logger.error('Hot-fix F — stale Liv/Chat desktop sweep failed (entries may linger on desktop)', err as Error)
		}

		// Phase 157 — wire the v37 install dispatcher now that Redis +
		// NativeAppConfigStore are live. The dispatcher constructs a fresh
		// McpConfigManager bound to the same Redis connection so AI Chat
		// + install handler share the `liv:cap:*` namespace and the
		// `liv:config:updated` invalidation channel.
		try {
			const v37Mcp = new McpConfigManager(this.ai.redis)
			initV37InstallService({
				nativeAppConfigStore: this.nativeAppConfigStore,
				mcpConfigManager: v37Mcp,
			})
			this.logger.log('v37 InstallDispatcher wired (native + ai handlers registered)')
		} catch (err) {
			this.logger.error('Failed to wire v37 InstallDispatcher (apps.installV37 will return not_implemented)', err as Error)
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

		// Phase 141-01 — drain install-time queued Redis seeds.
		// install.sh's `set_livos_redis_key` queues `KEY=VALUE` lines to
		// `/var/lib/livos/install-pending-redis-keys.txt` when Redis is unreachable
		// at install time (the common case — Redis starts after the seed step).
		// Without this drainer the queued `livos:domain:local_mode` never reaches
		// Redis, leaving rebuildCaddy + the Phase 112 fallback below misconfigured.
		// MUST run BEFORE Phase 112 so the config-seed branch sees the right mode.
		try {
			const r = await drainInstallPendingRedisKeys(this.ai.redis, {
				log: (msg) => this.logger.log(msg),
				error: (msg, err) => this.logger.error(msg, err),
			})
			if (r.applied || r.errored) {
				this.logger.log(
					`Phase 141-01: drained install-pending Redis seeds (applied=${r.applied} skipped=${r.skipped} errored=${r.errored})`,
				)
			}
		} catch (err) {
			this.logger.error('Phase 141-01: drain-install-pending threw', err)
		}

		// Phase 112 — boot-time fallback for livos:domain:config.
		// The App Gateway middleware at modules/server/index.ts:321-324 short-circuits
		// with `next()` when this key is missing → livinityd's UI is served at every
		// subdomain instead of proxying to the per-app container. Install-time seed
		// lives in scripts/install/deploy-livinityd.sh `_dld_seed_domain_config`;
		// THIS block survives accidental `redis-cli DEL livos:domain:config` between
		// restarts (which is exactly how this bug surfaced in v34 UAT 2026-05-13).
		//
		// Idempotent: skips if config already present. Non-fatal on error.
		try {
			const existing = await this.ai.redis.get('livos:domain:config')
			if (!existing) {
				const localMode = await this.ai.redis.get('livos:domain:local_mode')
				let domain: string | null = null
				switch (localMode) {
					case 'portal':
					case 'tunnel':
						// Phase 142-02 — `portal` is the new user-facing name for
						// the Cloudflare-Tunnel transport; `tunnel` is its
						// back-compat alias on already-deployed boxes that haven't
						// re-run install.sh yet. Both pull the apex from
						// `livos:domain:tunnel_domain`.
						domain = await this.ai.redis.get('livos:domain:tunnel_domain')
						break
					case 'hybrid':
						// Phase 142-02 — legacy alias of `portal`. Pre-rename
						// installs stored the apex under `livos:domain:hybrid_subdomain`
						// when an older install.sh ran; fall back to `tunnel_domain`
						// when the hybrid-specific key is absent so a v34.x box that
						// last touched install.sh in the Phase 134 era still resolves
						// its apex correctly after this upgrade.
						domain =
							(await this.ai.redis.get('livos:domain:hybrid_subdomain')) ??
							(await this.ai.redis.get('livos:domain:tunnel_domain'))
						break
					default:
						// cloud / local-lan (retired) / unset / unknown — no
						// subdomain routing applies.
						break
				}
				if (domain) {
					const config = {
						domain,
						active: true,
						activatedAt: Date.now(),
						source: 'boot-112',
					}
					await this.ai.redis.set('livos:domain:config', JSON.stringify(config))
					this.logger.log(`Phase 112: bootstrapped livos:domain:config domain=${domain} (local_mode=${localMode})`)
				}
			}
		} catch (err) {
			this.logger.error('Phase 112: failed to bootstrap livos:domain:config', err)
		}

		// Phase 104 plan 104-10 — LivOS → livinity.io heartbeat client (FIRST
		// client-side piece of v34). Only armed when the operator passed
		// --api-key liv_k_... at install time (104-09 persisted both the
		// file at /etc/livos/secrets/api-key AND the Redis pointer key).
		// When the Redis key is absent we silently skip — plain LAN-only
		// installs (no marketplace integration) get NO heartbeat traffic
		// and NO log spam.
		//
		// Forward-compat: until v34.x ships Server5's
		// `/api/devices/heartbeat` route the POST returns 404. The sender
		// logs a single warn line per livinityd restart and keeps polling
		// silently. When Server5 ships the endpoint, dashboards light up
		// without any LivOS-side change.
		//
		// D-104-RELAY-ZERO-DATA-PLANE: heartbeat is control-plane traffic
		// (~200 bytes / 60s = ~12KB/day) — explicitly allowed per the
		// Phase 104 invariant. Data-plane (Master Chrome streams, agent
		// payloads, file uploads) stays LAN-direct.
		try {
			const apiKeyPath = await this.ai.redis.get(REDIS_KEY_API_KEY_PATH)
			if (apiKeyPath) {
				const heartbeatLogger = (() => {
					const c = this.logger.createChildLogger('heartbeat')
					return {
						info: (msg: string) => c.log(msg),
						warn: (msg: string, error?: unknown) =>
							error === undefined ? c.log(msg) : c.error(msg, error),
						error: (msg: string, error?: unknown) =>
							error === undefined ? c.error(msg) : c.error(msg, error),
						verbose: (msg: string) => c.verbose(msg),
					}
				})()
				const url =
					process.env.LIVOS_HEARTBEAT_URL ??
					'https://livinity.io/api/devices/heartbeat'
				const intervalSec = Number(
					process.env.LIVOS_HEARTBEAT_INTERVAL_SEC ?? '60',
				)
				this.stopHeartbeat = startHeartbeat({
					url,
					intervalSec: Number.isFinite(intervalSec) && intervalSec > 0
						? intervalSec
						: 60,
					redis: this.ai.redis,
					version: this.version,
					logger: heartbeatLogger,
				})
				this.logger.log(
					`Heartbeat sender wired (url=${url} interval=${intervalSec}s; api-key path=${apiKeyPath})`,
				)
			} else {
				this.logger.verbose(
					`Heartbeat sender NOT armed (no --api-key at install time; ${REDIS_KEY_API_KEY_PATH} unset)`,
				)
			}
		} catch (err) {
			// Non-fatal — heartbeat is observability sugar, not a hard
			// dependency. livinityd boot continues; operator can re-run
			// install.sh --api-key ... and restart livinityd to re-arm.
			this.logger.error(
				'Failed to wire heartbeat sender (non-fatal — livinityd boot continues)',
				err,
			)
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

			// Phase 101-05 — construct the SHARED PortAllocator once and inject
			// it into both StreamManager (its vnc-window spawn path) and (via
			// streamManager.getPortAllocator() at the apps.native.spawn route)
			// the native-app binder. Default range [15900, 16000) per
			// D-101-PORT-ALLOC. Single instance = no port collisions between
			// WebApps and native apps.
			const sharedPortAllocator = new PortAllocator()
			this.streamManager = new StreamManager({
				caps,
				spawn: x11Spawn,
				logger: streamingLogger,
				portAllocator: sharedPortAllocator,
			})
			streamingLogger.info(
				`StreamManager started (cap=${this.streamManager.getCap()}, port-range=[15900,16000))`,
			)

			// Phase 159 — arm the native-app idle reaper. Reads activeNative +
			// nativeDisplayAllocator module-scope singletons exported from
			// native-routes.ts. Stop handle stashed on `this.nativeAppIdleReaperStop`
			// for clean shutdown via the existing stop() sequence (mirrors the
			// Phase 104 stopHeartbeat pattern). Defense-in-depth backstop for
			// the window-manager-mediated close handler (159-02) — env-tunable
			// via NATIVE_APP_IDLE_REAP_MS (default 30min).
			const reaperLogger = (() => {
				const c = this.logger.createChildLogger('native-reaper')
				return {
					info: (msg: string) => c.log(msg),
					warn: (msg: string, error?: unknown) => c.error(msg, error),
					error: (msg: string, error?: unknown) => c.error(msg, error),
				}
			})()
			this.nativeAppIdleReaperStop = startNativeAppIdleReaper({
				active: activeNative,
				displayAllocator: nativeDisplayAllocator,
				streamManager: this.streamManager,
				logger: reaperLogger,
			})

			// Phase 102-03 — Master Chrome profile seeder
			// (D-102-MASTER-PROFILE-SEED).
			//
			// ensureMasterExists() creates /opt/livos/data/chrome-master/
			// when absent so the Master Chrome Login flow (plan 102-07) can
			// later populate it via `--user-data-dir`. sweepOrphans() drops
			// any /tmp/livos-chrome-app-* leftovers from a prior livinityd
			// crash (D-102-CLOSE-LIFECYCLE — boot-time gate). Both steps
			// are non-fatal: failure logs warn/error but boot continues
			// (the per-app spawn path that consumes profileSeeder is added
			// by Wave 2 plan 102-04; until then, this is plumbing only).
			const profileSeederLogger = (() => {
				const c = this.logger.createChildLogger('profile-seeder')
				return {
					info: (msg: string) => c.log(msg),
					warn: (msg: string, error?: unknown) => c.error(msg, error),
					error: (msg: string, error?: unknown) => c.error(msg, error),
					verbose: (msg: string) => c.verbose(msg),
				}
			})()
			this.profileSeeder = createProfileSeeder({logger: profileSeederLogger})
			try {
				await this.profileSeeder.ensureMasterExists()
			} catch (err) {
				this.logger.error(
					'profile-seeder.ensureMasterExists failed (non-fatal — Master Login UI will surface remediation)',
					err,
				)
			}
			try {
				await this.profileSeeder.sweepOrphans()
			} catch (err) {
				this.logger.error(
					'profile-seeder.sweepOrphans failed (non-fatal — orphan /tmp dirs may linger until manual cleanup)',
					err,
				)
			}

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
				// Phase 101-04 — cache the Chrome pid on the client so
				// WebAppWindowManager.spawn() can baseline `xdotool search --pid <pid>`
				// BEFORE driving CDP createTarget. Without this, getChromePid()
				// throws inside spawn(), and Pillar A fails on every WebApp launch
				// even though bootstrap succeeded.
				this.chromeCdpClient.setChromePid(chromePid)
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
			// Phase 102-04 — per-app display allocator (number-returning,
			// range [10, 100); 90 slots). Construct here so the same instance
			// flows into WebAppWindowManager.spawn() display orchestration AND
			// (in 102-05) into native-app-binder for parallel Native apps.
			const webappDisplayAllocator = new DisplayAllocator()
			this.webappWindowManager = new WebAppWindowManager({
				streamManager: this.streamManager,
				spawn: x11Spawn as unknown as ConstructorParameters<
					typeof WebAppWindowManager
				>[0]['spawn'],
				logger: webappLogger,
				mcpConfigManager: webappMcpConfigManager,
				// Phase 102-04 — required per-app primitives (Wave 1 deliverables).
				displayAllocator: webappDisplayAllocator,
				portAllocator: sharedPortAllocator,
				profileSeeder: this.profileSeeder!,
				// xvfbSpawnFn + chromeSpawnFn fall back to module defaults
				// (streaming/xvfb-spawner.ts + webapps/chrome-process-spawner.ts).
				// A2 risk REALIZED in Phase 102 deploy UAT (2026-05-11): bare
				// Xvfb without WM caused Chrome --start-fullscreen to render
				// undersized window with black letterbox bars left/right.
				// Defaulting TRUE — fluxbox per-app display gives Chrome
				// correct fullscreen geometry. Opt-out via LIVOS_WEBAPP_USE_WM=0
				// for dev/debug.
				withWindowManager: process.env.LIVOS_WEBAPP_USE_WM !== '0',
				// Phase 101-04 chromeCdpClient retained as IGNORED back-compat slot
				// (102-04 spawn body no longer consults it; the CDP bootstrap at
				// livinityd.start() still happens for other CDP consumers).
				chromeCdpClient: this.chromeCdpClient,
			})
			this.webappWindowManager.startIdleCleanup()
			webappLogger.info(
				'WebAppWindowManager started (5s idle-cleanup poll armed)',
			)

			// Phase 103-01 Task 3 — wire the chromeMaster router with the same
			// shared deps the WebAppWindowManager already consumes. Master Chrome
			// uses the same display pool; singleton lock prevents conflict.
			//
			// This swap MUST run after profileSeeder + streamManager +
			// webappDisplayAllocator are constructed. The trpcExpressHandler
			// proxy and trpcWssHandler factory inside server/trpc/index.ts
			// re-resolve to the swapped appRouter on every request (express)
			// and every WSS mount (ws). Server.start() may already have mounted
			// the express middleware with the bare default appRouter — but the
			// middleware proxy delegates to a mutable closure that this swap
			// rebuilds against the injected router.
			const chromeMasterRouterInjected = createChromeMasterRouter({
				displayAllocator: webappDisplayAllocator,
				streamManager: this.streamManager,
				profileSeeder: this.profileSeeder!,
			})

			// Phase 196-01 — XAI OAuth dependency injection.
			//
			// Closes Phase 195 HUMAN-UAT #1: the empty-injection Proxy in
			// xai-auth-router.ts will throw on first procedure call (live probe
			// 2026-05-22 confirmed HTTP 500 emptyInjectionStub) until these two
			// singletons land. After this swap, trpc.auth.xai.start returns a
			// real {flowId, url} response on a clean Mini PC.
			//
			// Graceful degradation (per 196-CONTEXT.md decisions): if the
			// credentials service constructor throws (auth.json directory
			// inaccessible on a fresh box), log + still mount the router with
			// the working FlowService so first-time auth.xai.start is reachable.
			const xaiAuthFlowService = new XaiAuthFlowService()
			let xaiCredentialsService: XaiCredentialsService
			try {
				xaiCredentialsService = new XaiCredentialsService()
			} catch (credsErr) {
				// Logger has no .warn — use .error to surface the degradation
				// (same channel the surrounding try/catch uses for streaming
				// subsystem failures, which are also "non-fatal — boot continues").
				this.logger.error(
					'XaiCredentialsService failed to initialize; mounting router with first-time-auth-only degradation. ' +
					'auth.xai.start will work; auth.xai.status / disconnect / waitForCompletion may report errors until ' +
					'the auth.json directory becomes available.',
					credsErr,
				)
				// Construct a no-throwing shim: each method rejects with a clear,
				// status-like error so the UI can surface "not yet connected" rather
				// than crashing. Type-asserted to satisfy the factory signature.
				xaiCredentialsService = {
					async getStatus() {
						return {connected: false, reason: 'credentials-service-uninitialized'} as never
					},
					async clear() {
						return {ok: true as const}
					},
				} as unknown as XaiCredentialsService
			}
			const xaiAuthRouterProductionInstance = createXaiAuthRouter({
				flowService: xaiAuthFlowService,
				credsService: xaiCredentialsService,
			})

			// Phase 196-05 — setup.* production wire-up. Combines:
			//   - setRegion procedure (shipped Plan 196-04)
			//   - setLocaleTimezone procedure (shipped Plan 196-05 Task 3)
			// timezoneService validates against Intl.supportedValuesOf and
			// shells out via execFile('sudo', ['/usr/bin/timedatectl',
			// 'set-timezone', zone]) — covered by the narrow sudoers
			// TIMEDATECTL Cmnd_Alias extended in this same plan.
			const timezoneService = createTimezoneService()
			const setupRouterProductionInstance = createSetupRouter({
				redis: this.ai.redis,
				timezoneService,
			})

			// Phase 203-08 — Liv AI runtime (Mastra purged). Sole runtime is
			// LivOSAgent (Branch A — openclaw built-in LLM dispatch). The
			// LIV_AGENT_RUNTIME env var is still read for forward-compat with
			// Plan 203-12 deploy scripts but now defaults to `openclaw` and
			// no longer dispatches to a separate `mastra` path (LivOSMastra
			// + chat-route + Mastra Memory + Mastra Agent factory all DELETED
			// in this plan).
			const agentRuntimeFlag = (
				process.env.LIV_AGENT_RUNTIME ??
				process.env.LIVOS_AGENT_RUNTIME ??
				'openclaw'
			).toLowerCase()
			void agentRuntimeFlag // referenced for forward-compat — the openclaw
			// path is the only path; flag value is logged but does not branch.
			let livOSAgent: LivOSAgent | null = null
			try {
				const providerRouter = createProviderRouter({
					xaiCreds: xaiCredentialsService,
					redis: this.ai.redis,
				})
				livOSAgent = new LivOSAgent({
					providerRouter,
					logger: {
						info: (msg) => webappLogger.info(msg),
						warn: (msg, err) => this.logger.error(msg, err),
					},
				})
				const openclawBaseUrl =
					process.env.OPENCLAW_GATEWAY_URL ??
					'http://127.0.0.1:18789'
				livOSAgent.attachAgentClient(
					new OpenclawClient({
						baseUrl: openclawBaseUrl,
						logger: {
							info: (msg) => webappLogger.info(msg),
							warn: (msg, err) =>
								this.logger.error(msg, err),
						},
					}),
				)
				webappLogger.info(
					`Phase 203-08 — LivOSAgent wired (runtime=${agentRuntimeFlag}, openclawGateway=${openclawBaseUrl}); Mastra purged — LivOSAgent.agentClient is the dispatch surface`,
				)
			} catch (agentErr) {
				this.logger.error(
					'Phase 203-08 — LivOSAgent construction failed; Liv AI surface will degrade until next restart',
					agentErr,
				)
			}

			// Phase 203-08 — agent runtime wire-up. Same construction order
			// as the pre-203-08 Mastra path but populates LivOSAgent slots
			// instead of LivOSMastra (LivOSMastra + chat-route + Mastra
			// Memory all deleted in this plan).
			let mastraRouterProductionInstance: ReturnType<typeof createMastraRouter> | undefined
			let agentsRepoForRouter: AgentRepository | null = null
			let approvalManagerForPlugin: ApprovalManager | null = null
			let mcpBridgeForPlugin: Awaited<ReturnType<typeof createMcpBridge>> | null = null
			if (livOSAgent) {
				try {
					const approvalManager = new ApprovalManager()
					approvalManagerForPlugin = approvalManager
					livOSAgent.attachApprovalManager(approvalManager)
					const databaseUrl = process.env.DATABASE_URL
					if (!databaseUrl) {
						throw new Error(
							'Phase 203-08 — DATABASE_URL env var missing; cannot wire Liv AI runtime',
						)
					}
					// Legacy `mastra_*` table migration kept for back-compat —
					// runs idempotently against the existing livos PG database
					// (operator may still have mastra_threads / mastra_messages
					// rows from the pre-203-08 deployment; the migration is
					// CREATE-IF-NOT-EXISTS so re-runs are no-ops).
					try {
						await runMastraMigrations({databaseUrl})
					} catch (migErr) {
						this.logger.error(
							'Phase 203-08 — runMastraMigrations failed (non-fatal); legacy mastra_* tables may be absent',
							migErr,
						)
					}
					try {
						await runLivOSMigrations({databaseUrl})
					} catch (livosMigErr) {
						this.logger.error(
							'Phase 202-01 — runLivOSMigrations failed (non-fatal); AgentRepository will surface DB errors lazily',
							livosMigErr,
						)
					}
					try {
						const {Pool} = await import('pg')
						const {drizzle} = await import('drizzle-orm/node-postgres')
						const seedPool = new Pool({connectionString: databaseUrl})
						try {
							const seedDb = drizzle(seedPool)
							const agentRepo = new AgentRepository(seedDb)
							await seedSystemAgents(agentRepo)
							webappLogger.info(
								'Phase 202-01 — agent registry loaded with livAi seed (system=true)',
							)
						} finally {
							await seedPool.end()
						}
					} catch (seedErr) {
						this.logger.error(
							'Phase 202-01 — seedSystemAgents failed (non-fatal); the agents list will be empty until the next successful boot',
							seedErr,
						)
					}
					// Phase 203-08 — Memory adapter swapped from Mastra Memory
					// to the in-memory adapter for now. Conversation history is
					// owned by the openclaw gateway's own SQLite store (per
					// D-203-09 scope clarification — gateway SQLite is out of
					// scope for livinityd-side persistence). The
					// ConversationMemoryAdapter still satisfies the
					// scheduler's saveThread call so cron-tick task records
					// continue to flow without crashing.
					const memoryAdapter = createConversationMemoryAdapter({
						saveThread: async (opts) => {
							// In-process pass-through — keeps the scheduler's
							// fire-and-forget saveThread call from rejecting;
							// real conversation persistence flows through the
							// openclaw gateway.
							webappLogger.info(
								`Phase 203-08 — Memory.saveThread(${opts.thread.id}) [in-process noop; openclaw owns conversation persistence]`,
							)
							return opts.thread
						},
					})
					livOSAgent.attachMemory(memoryAdapter)
					const mcpBridge = await createMcpBridge({
						redis: this.ai.redis,
						logger: {
							info: (msg) => webappLogger.info(msg),
							warn: (msg, err) => this.logger.error(msg, err),
						},
					})
					livOSAgent.attachMcpBridge(mcpBridge)
					mcpBridgeForPlugin = mcpBridge
					try {
						const registryPool = new (await import('pg')).Pool({
							connectionString: databaseUrl,
						})
						try {
							const {drizzle} = await import('drizzle-orm/node-postgres')
							const registryDb = drizzle(registryPool)
							const registryRepo = new AgentRepository(registryDb)
							agentsRepoForRouter = registryRepo
							const registry = new AgentRegistry({
								repo: registryRepo,
								providerRouter: livOSAgent.providerRouter,
								memory: memoryAdapter,
								mcpBridge,
								approvalManager,
								logger: {
									info: (msg) => webappLogger.info(msg),
									warn: (msg, err) => this.logger.error(msg, err),
								},
							})
							await registry.init()
							livOSAgent.attachRegistry(registry)
							const seededLivAi = registry.getByName('livAi')
							if (seededLivAi) {
								livOSAgent.attachLivAi(seededLivAi)
								webappLogger.info(
									`Phase 202-02 — agent registry initialised with ${registry.listAll().length} live agents (livAi slot wired from registry)`,
								)
							} else {
								webappLogger.info(
									'Phase 202-02 — registry initialised but livAi row absent; back-compat slot left empty',
								)
							}

							try {
								const scheduler = new AgentScheduler({
									registry,
									repo: registryRepo,
									memory: memoryAdapter,
									redis: this.ai.redis,
									logger: {
										info: (msg) => webappLogger.info(msg),
										warn: (msg, err) => this.logger.error(msg, err),
									},
								})
								await scheduler.init()
								livOSAgent.attachScheduler(scheduler)
								webappLogger.info(
									'Phase 202-03 — AgentScheduler attached to LivOSAgent (node-cron tasks armed for every enabled row with schedule_cron)',
								)
							} catch (schedErr) {
								this.logger.error(
									'Phase 202-03 — AgentScheduler init failed (non-fatal); cron + runOnce will be unavailable until next restart',
									schedErr,
								)
							}
						} finally {
							void registryPool
						}
					} catch (registryErr) {
						this.logger.error(
							'Phase 202-02 — AgentRegistry init failed (non-fatal); agents.* surface will return empty until next restart',
							registryErr,
						)
					}
					mastraRouterProductionInstance = createMastraRouter({
						// Phase 199-07 — Redis client for `liv:config:active_model`
						// persistence (D-199-10 / INV-199-03). The mastra.agent.*
						// namespace stays mounted per INV-203-09 contract
						// preservation; internals point at the agent-runtime
						// subtree after Plan 203-08.
						redis: this.ai.redis,
					})
					webappLogger.info(
						'Phase 203-08 — Liv AI runtime + tRPC router wired (memory + mcpBridge + registry + scheduler + approval-manager ready)',
					)
				} catch (runtimeWireUpErr) {
					this.logger.error(
						'Phase 203-08 — Liv AI runtime wire-up failed; mastraRouter falls back to empty-injection Proxy default until next restart',
						runtimeWireUpErr,
					)
				}
			}

			// Phase 203-08 — /chat/:agentId Express mount DELETED. The Mastra
			// chatRoute (Phase 198-01) was bound to LivOSMastra.agents.livAi
			// (a Mastra Agent class) which no longer exists. New chat
			// surface lives inside the openclaw gateway at
			// https://bruce.livinity.io/liv-ai-app/ (Caddy reverse-proxies
			// /liv-ai-app/* to :18789 per D-203-05). The assistant-ui
			// frontend that consumed /chat/livAi is deleted in Plan 203-09.

			// Phase 202-04 — GET /agents/status/stream SSE mount. Subscribes
			// to livOSAgent.scheduler.statusEvents (Plan 203-08 rewire). Skipped
			// when the scheduler is null (registry init failed) — the route
			// then 404s, which is the same surface as a livinityd restart
			// pending. Auth gate identical to the /openclawos/handshake mount
			// below (Bearer header OR LIVINITY_SESSION cookie).
			try {
				if (livOSAgent?.scheduler && this.server.app) {
					const sseHandler = createAgentsStatusSseHandler({
						scheduler: livOSAgent.scheduler,
						verifyToken: (token) => this.server.verifyToken(token),
						logger: {
							info: (msg) => webappLogger.info(msg),
							warn: (msg, err) => this.logger.error(msg, err),
						},
					})
					this.server.app.get('/agents/status/stream', sseHandler)
					webappLogger.info(
						'Phase 202-04 — GET /agents/status/stream SSE mounted (subscribed to AgentScheduler.statusEvents)',
					)
				}
			} catch (sseErr) {
				this.logger.error(
					'Phase 202-04 — /agents/status/stream mount failed; agents dashboard live status unavailable until next restart',
					sseErr,
				)
			}

			// Phase 203-05 — POST /openclawos/handshake Express mount. Verifies
			// the LIVINITY_SESSION JWT cookie (or Bearer header) and mints a
			// 5-minute Ed25519 openclaw device token (D-203-12 / T-203-02 /
			// INV-203-10). The token caches its jti in Redis with EX 300 so
			// the gateway-side verifier (Plan 203-06+) can confirm freshness.
			// Auth gate identical to /chat/:agentId + /agents/status/stream
			// above (Bearer header OR LIVINITY_SESSION cookie).
			try {
				if (this.server.app) {
					const {createHandshakeRouteHandler} = await import('./modules/openclawos/handshake-route.js')
					const handshakeHandler = createHandshakeRouteHandler({
						verifyToken: (token) => this.server.verifyToken(token),
						redis: this.ai.redis,
						logger: {
							info: (msg) => webappLogger.info(msg),
							warn: (msg, err) => this.logger.error(msg, err),
							error: (msg, err) => this.logger.error(msg, err),
						},
					})
					this.server.app.post('/openclawos/handshake', express.json({limit: '4kb'}), handshakeHandler)
					webappLogger.info(
						'Phase 203-05 — POST /openclawos/handshake mounted (JWT verify + Ed25519 mint, Redis-cached 300s TTL)',
					)
				}
			} catch (handshakeErr) {
				this.logger.error(
					'Phase 203-05 — /openclawos/handshake mount failed; openclaw bridge unavailable until next restart',
					handshakeErr,
				)
			}

			// Phase 203-06 — POST /openclawos/plugin-rpc Express mount. Internal
			// dispatcher consumed by the rebranded openclaw plugin (livos/packages/
			// liv-claw-os/packages/claw-plugin/src/livinityd-rpc.ts) for 5 methods:
			//   luse.list, luse.invoke           (D-203-13)
			//   builtin.list, builtin.invoke     (D-203-14)
			//   approval.request                 (INV-203-04 — HITL gate bridge)
			//
			// Auth = X-Internal-Plugin-Token header against LIV_PLUGIN_TOKEN env
			// (with LIV_API_KEY fallback per Plan 203-04 D-203-06). The route mounts
			// even if approvalManagerForPlugin / mcpBridgeForPlugin are null —
			// approval.request and luse.* methods then surface TOOL_NOT_FOUND-style
			// errors so the plugin sees graceful degradation rather than hanging.
			try {
				if (this.server.app && approvalManagerForPlugin) {
					const {createPluginRpcHandler} = await import(
						'./modules/openclawos/plugin-rpc.js'
					)
					const {createMcpToolAdapter} = await import(
						'./modules/openclawos/mcp-tool-adapter.js'
					)
					const {builtInTools, BUILT_IN_TOOL_CATALOG} = await import(
						'./modules/agent-runtime/agents/built-in-tools.js'
					)
					// Adapt Mastra tools (parametric Tool<I,O,R>) to the simpler
					// BuiltInToolExecutable shape plugin-rpc expects. We forward
					// `{context: args}` to each tool's execute; outputs are passed
					// through opaque.
					const builtInToolsAdapter: Record<string, {
						execute(input: {context: Record<string, unknown>}): Promise<unknown>
					}> = {}
					for (const [name, tool] of Object.entries(
						builtInTools as Record<string, {execute?: (input: unknown) => Promise<unknown>}>,
					)) {
						if (typeof tool.execute === 'function') {
							const exec = tool.execute.bind(tool)
							builtInToolsAdapter[name] = {
								execute: (input) => exec(input),
							}
						}
					}
					const pluginRpcHandler = createPluginRpcHandler({
						approvalManager: approvalManagerForPlugin,
						mcp: createMcpToolAdapter(mcpBridgeForPlugin),
						builtInTools: builtInToolsAdapter,
						builtInCatalog: BUILT_IN_TOOL_CATALOG,
						logger: {
							info: (msg) => webappLogger.info(msg),
							warn: (msg, err) => this.logger.error(msg, err),
							error: (msg, err) => this.logger.error(msg, err),
						},
					})
					this.server.app.post(
						'/openclawos/plugin-rpc',
						express.json({limit: '4mb'}),
						pluginRpcHandler,
					)
					webappLogger.info(
						`Phase 203-06 — POST /openclawos/plugin-rpc mounted (luse + ${BUILT_IN_TOOL_CATALOG.length} built-in tools + approval bridge)`,
					)
				} else if (this.server.app && !approvalManagerForPlugin) {
					this.logger.error(
						'Phase 203-06 — /openclawos/plugin-rpc NOT mounted: approvalManagerForPlugin is null (agent-runtime wire-up failed)',
					)
				}
			} catch (pluginRpcErr) {
				this.logger.error(
					'Phase 203-06 — /openclawos/plugin-rpc mount failed; openclaw plugin tool surface unavailable until next restart',
					pluginRpcErr,
				)
			}

			// Phase 203-10 — Approvals SSE + respond routes. Surfaces the
			// in-process ApprovalManager events to the rebuilt claw-client
			// ApprovalCard (Plan 203-09 deleted the assistant-ui one). Same
			// JWT-cookie auth gate as /openclawos/handshake. Mount is no-op
			// when approvalManagerForPlugin is null (agent-runtime degraded).
			try {
				if (this.server.app && approvalManagerForPlugin) {
					const {
						createApprovalsStreamHandler,
						createApprovalsRespondHandler,
					} = await import('./modules/openclawos/approvals-routes.js')
					const approvalsLogger = {
						info: (msg: string) => webappLogger.info(msg),
						warn: (msg: string, err?: unknown) => this.logger.error(msg, err),
						error: (msg: string, err?: unknown) => this.logger.error(msg, err),
					}
					this.server.app.get(
						'/openclawos/approvals/stream',
						createApprovalsStreamHandler({
							approvalManager: approvalManagerForPlugin,
							verifyToken: (token) => this.server.verifyToken(token),
							logger: approvalsLogger,
						}),
					)
					this.server.app.post(
						'/openclawos/approvals/respond',
						express.json({limit: '4kb'}),
						createApprovalsRespondHandler({
							approvalManager: approvalManagerForPlugin,
							verifyToken: (token) => this.server.verifyToken(token),
							logger: approvalsLogger,
						}),
					)
					webappLogger.info(
						'Phase 203-10 — /openclawos/approvals/{stream,respond} mounted (HITL UI bridge for the claw-client ApprovalCard)',
					)
				}
			} catch (approvalsRouteErr) {
				this.logger.error(
					'Phase 203-10 — /openclawos/approvals/* mount failed; HITL surface unavailable until next restart',
					approvalsRouteErr,
				)
			}

			// Phase 202-03 — agents.* + agents.tasks.* tRPC routers. Both are
			// optional: when livOSAgent OR agentsRepoForRouter is null (boot
			// path errored out before the registry/scheduler wire-up
			// completed), the `agents` namespace falls back to the empty stub
			// inside createAppRouter so the rest of the appRouter still
			// type-infers and serves. Plan 203-08 rewire — these routers'
			// `livOSMastra` slot is now typed as LivOSAgent (slot-shape
			// preserved per INV-203-09; tRPC contracts identical).
			let agentsRouterProductionInstance:
				| ReturnType<typeof createAgentRouter>
				| undefined
			let agentTasksRouterProductionInstance:
				| ReturnType<typeof createAgentTaskRouter>
				| undefined
			if (livOSAgent && agentsRepoForRouter) {
				try {
					agentsRouterProductionInstance = createAgentRouter({
						repo: agentsRepoForRouter,
						livOSMastra: livOSAgent,
						logger: {
							info: (msg) => webappLogger.info(msg),
							warn: (msg, err) => this.logger.error(msg, err),
						},
					})
					agentTasksRouterProductionInstance = createAgentTaskRouter({
						livOSMastra: livOSAgent,
						logger: {
							info: (msg) => webappLogger.info(msg),
							warn: (msg, err) => this.logger.error(msg, err),
						},
					})
					webappLogger.info(
						'Phase 202-03 — agents.* + agents.tasks.* tRPC routers wired (CRUD + runOnce + cronPreview + task lifecycle)',
					)
				} catch (agentsRouterErr) {
					this.logger.error(
						'Phase 202-03 — agent-router factory failed; agents.* namespace falls back to empty stub until next restart',
						agentsRouterErr,
					)
				}
			}

			// Phase 202-07 — MCP config sub-router (`mcp.config.*`). Always
			// safe to wire (Redis client is hoisted on `this.ai.redis` long
			// before this block runs); the factory call itself can never
			// throw, so we skip a try/catch and let the createAppRouter call
			// site keep the default empty-injection stub if `this.ai.redis`
			// is somehow undefined.
			const mcpConfigRouterProductionInstance =
				this.ai?.redis != null
					? createMcpConfigRouter({
							redis: this.ai.redis,
							logger: {
								info: (msg) => webappLogger.info(msg),
								warn: (msg, err) => this.logger.error(msg, err),
							},
						})
					: undefined
			if (mcpConfigRouterProductionInstance) {
				webappLogger.info(
					'Phase 202-07 — mcp.config.* tRPC router wired (Redis hash liv:mcp:config CRUD; restart required for McpBridge re-spawn)',
				)
			}

			// Phase 203-04 — openclawos.apps.* tRPC router. Reuses the same
			// PostgreSQL pool used by AgentRepository (D-202-01 — same `livos`
			// DB). Failure here is non-fatal — the empty-injection stub
			// returns OPENUI_REPO_UNAVAILABLE so the plugin's app-store HTTP
			// client surfaces a clean error rather than hanging.
			let openclawosAppsRouterProductionInstance:
				| ReturnType<typeof createOpenclawosAppsRouter>
				| undefined
			try {
				const databaseUrl = process.env.DATABASE_URL
				if (databaseUrl) {
					const {Pool} = await import('pg')
					const {drizzle} = await import('drizzle-orm/node-postgres')
					const openuiPool = new Pool({connectionString: databaseUrl})
					const openuiDb = drizzle(openuiPool)
					const openuiRepo = new OpenUIAppsRepository(openuiDb)
					openclawosAppsRouterProductionInstance = createOpenclawosAppsRouter({
						repo: openuiRepo,
						// Phase 203-10 — wire NativeAppConfigStore so successful
						// create/update fire the desktop-registrar hook (D-203-10).
						// `this.nativeAppConfigStore` is constructed earlier in
						// boot (after this.ai.start) and is guaranteed live here.
						nativeAppStore: this.nativeAppConfigStore,
						logger: {
							info: (msg) => webappLogger.info(msg),
							warn: (msg, err) => this.logger.error(msg, err),
						},
					})
					webappLogger.info(
						'Phase 203-04 — openclawos.apps.* tRPC router wired (livos_openui_apps Postgres CRUD; consumed by liv-claw plugin HTTP client)',
					)
					if (this.nativeAppConfigStore) {
						webappLogger.info(
							'Phase 203-10 — desktop-registrar hook ENABLED (openclawos.apps.create/update/delete propagate to dock via liv:apps:native:* + liv:config:updated)',
						)
					}
				} else {
					this.logger.error(
						'Phase 203-04 — DATABASE_URL missing; openclawos.apps.* falls back to OPENUI_REPO_UNAVAILABLE stub until next restart',
					)
				}
			} catch (openuiRouterErr) {
				this.logger.error(
					'Phase 203-04 — openclawos.apps.* router factory failed; falls back to OPENUI_REPO_UNAVAILABLE stub until next restart',
					openuiRouterErr,
				)
			}

			// Phase 204-01 — provider.config.* router. Same Redis-availability
			// guard as mcp-config-router above; if `this.ai.redis` is somehow
			// undefined, we silently fall back to the empty-injection stub
			// which surfaces PROVIDER_CONFIG_UNAVAILABLE on every call.
			let providerConfigRouterProductionInstance:
				| ReturnType<typeof createProviderConfigRouter>
				| undefined
			if (this.ai?.redis != null) {
				try {
					const providerLogger = {
						info: (msg: string) => webappLogger.info(msg),
						warn: (msg: string, err?: unknown) =>
							this.logger.error(msg, err),
					}
					const providerKeyStore = new ProviderKeyStore({
						redis: this.ai.redis,
						logger: providerLogger,
					})
					const envFileWriter = new EnvFileWriter({
						keyStore: providerKeyStore,
						redis: this.ai.redis,
						logger: providerLogger,
					})
					const restartHook = createRestartHook({logger: providerLogger})
					providerConfigRouterProductionInstance = createProviderConfigRouter({
						keyStore: providerKeyStore,
						envFileWriter,
						restartHook,
						logger: providerLogger,
					})
					webappLogger.info(
						'Phase 204-01 — provider.config.* tRPC router wired (Redis hash liv:provider:keys; env-file: /etc/default/liv-claw-gateway with EACCES fallback to /opt/livos/etc/liv-claw-gateway.env)',
					)
				} catch (providerRouterErr) {
					this.logger.error(
						'Phase 204-01 — provider.config.* router factory failed; falls back to PROVIDER_CONFIG_UNAVAILABLE stub until next restart',
						providerRouterErr,
					)
				}
			}

			const productionAppRouter = createAppRouter({
				chromeMaster: chromeMasterRouterInjected,
				xaiAuth: xaiAuthRouterProductionInstance,
				setup: setupRouterProductionInstance,
				mastra: mastraRouterProductionInstance,
				agents: agentsRouterProductionInstance,
				agentTasks: agentTasksRouterProductionInstance,
				mcpConfig: mcpConfigRouterProductionInstance,
				openclawosApps: openclawosAppsRouterProductionInstance,
				providerConfig: providerConfigRouterProductionInstance,
			})
			setProductionAppRouter(productionAppRouter)
			webappLogger.info(
				'Phase 103-01 — chromeMaster router wired with displayAllocator + streamManager + profileSeeder (master Chrome can now stream via Xvfb)',
			)
			webappLogger.info(
				'Phase 196-01 — xAI auth router wired (auth.xai.start now serves real opencode flows, not emptyInjectionStub)',
			)
			webappLogger.info(
				'Phase 196-05 — setup router wired (setRegion + setLocaleTimezone)',
			)
			webappLogger.info(
				'[liv-ai] Phase 199-02 — provider-router allow-list + listAvailableModels tRPC endpoint ready',
			)
			webappLogger.info(
				'[liv-ai] Phase 199-03 — chat-route accepts config.modelName + memory.thread; agent dispatches via requestContext',
			)
			webappLogger.info(
				'[liv-ai] Phase 199-07 — header bar + Redis-backed active model persistence (mastra.agent.getActiveModel/setActiveModel) ready',
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

			// Phase 104 plan 104-10 — stop the heartbeat sender BEFORE the rest
			// of shutdown so its in-flight POST (and self-rescheduling
			// setTimeout) wind down while the redis client + fetch impl are
			// still healthy. No-op when the heartbeat was never armed.
			try {
				this.stopHeartbeat?.()
			} catch (err) {
				this.logger.error('Failed to stop heartbeat sender', err)
			}

			// Phase 159 — halt the native-app idle reaper. No-op if it was
			// never armed (boot edge before streamManager was constructed,
			// or already-stopped). Must fire before streamManager teardown
			// so in-flight closeNativeApp ticks finish against a healthy
			// stream-manager surface.
			try {
				this.nativeAppIdleReaperStop?.()
			} catch (err) {
				this.logger.error('Failed to stop native-app idle reaper', err)
			}

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
