import path from 'node:path'
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

		// Phase 50 (v29.5 A1) — defensive eager seed of built-in tools to nexus:cap:tool:*
		// Survives factory resets and the v29.4 syncAll() stub (D-WAVE5-SYNCALL-STUB).
		try {
			await seedBuiltinTools(this.ai.redis)
			this.logger.log('Seeded 9 built-in tool manifests to capability registry')
		} catch (err) {
			// Non-fatal — boot continues; tools will be missing until next syncTools()
			this.logger.error('Failed to seed builtin tools', err)
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

			// Stop modules
			await Promise.all([this.files.stop(), this.apps.stop(), this.appStore.stop(), this.dbus.stop(), this.ai.stop(), this.tunnelClient.stop(), this.scheduler.stop()])

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
