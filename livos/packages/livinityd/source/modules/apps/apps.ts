import {fileURLToPath} from 'node:url'
import {dirname, join} from 'node:path'
import os from 'node:os'
import path from 'node:path'

import fse from 'fs-extra'
import {$} from 'execa'
import pRetry from 'p-retry'
import semver from 'semver'

import randomToken from '../../modules/utilities/random-token.js'
import type Livinityd from '../../index.js'
import appEnvironment from './legacy-compat/app-environment.js'
import App, {readManifestInDirectory} from './app.js'
import type {AppManifest, AppSettings} from './schema.js'
import {fillSelectedDependencies} from '../utilities/dependencies.js'
import {getBuiltinApp} from './builtin-apps.js'
import {NativeApp, NATIVE_APP_CONFIGS} from './native-app.js'
import {generateAppTemplate} from './compose-generator.js'
import {applyCaddyConfig, generateFullCaddyfile, writeCaddyfile, reloadCaddy, type SubdomainConfig, type CaddyConfig} from '../domain/caddy.js'
import {
	allocatePort,
	createUserAppInstance,
	deleteUserAppInstance,
	getUserAppInstance,
	listAllUserAppInstances,
	findUserById,
} from '../database/index.js'

// Redis keys for domain config
const REDIS_DOMAIN_KEY = 'livos:domain:config'
const REDIS_SUBDOMAINS_KEY = 'livos:domain:subdomains'
const REDIS_PLATFORM_API_KEY = 'livos:platform:api_key'
const REDIS_PLATFORM_URL = 'livos:platform:url'

export default class Apps {
	#livinityd: Livinityd
	logger: Livinityd['logger']
	instances: App[] = []
	nativeInstances: NativeApp[] = []
	isTorBeingToggled = false

	constructor(livinityd: Livinityd) {
		this.#livinityd = livinityd
		const {name} = this.constructor
		this.logger = livinityd.logger.createChildLogger(name.toLowerCase())
	}

	// This is a really brutal and heavy handed way of cleaning up old Docker state.
	// We should only do this sparingly. It's needed if an old version of Docker
	// didn't shutdown cleanly and then we update to a new version of Docker.
	// The next version of Docker can have issues starting containers if the old
	// containers/networks are still hanging around. We had this issue because sometimes
	// 0.5.4 installs didn't clean up properly on shutdown and it causes critical errors
	// bringing up containers in 1.0.
	async cleanDockerState() {
		try {
			const containerIds = (await $`docker ps -aq`).stdout.split('\n').filter(Boolean)
			if (containerIds.length) {
				this.logger.log('Cleaning up old containers...')
				await $({stdio: 'inherit'})`docker stop --time 30 ${containerIds}`
				await $({stdio: 'inherit'})`docker rm ${containerIds}`
			}
		} catch (error) {
			this.logger.error(`Failed to clean containers`, error)
		}
		try {
			this.logger.log('Cleaning up old networks...')
			await $({stdio: 'inherit'})`docker network prune -f`
		} catch (error) {
			this.logger.error(`Failed to clean networks`, error)
		}
	}

	async start() {
		// Set apps to empty array on first start
		if ((await this.#livinityd.store.get('apps')) === undefined) {
			await this.#livinityd.store.set('apps', [])
		}

		// Auto-register Chrome as a pre-installed default app
		const apps = (await this.#livinityd.store.get('apps')) || []
		if (!apps.includes('chrome')) {
			apps.push('chrome')
			await this.#livinityd.store.set('apps', apps)
			this.logger.log('Chrome registered as default app')
		}

		// Set torEnabled to false on first start
		if ((await this.#livinityd.store.get('torEnabled')) === undefined) {
			await this.#livinityd.store.set('torEnabled', false)
		}

		// Set recentlyOpenedApps to empty array on first start
		if ((await this.#livinityd.store.get('recentlyOpenedApps')) === undefined) {
			await this.#livinityd.store.set('recentlyOpenedApps', [])
		}

		// Create a random livinity seed on first start if one doesn't exist.
		// This is only used to determinstically derive app seed, app password
		// and custom app specific environment variables. It's needed to maintain
		// compatibility with legacy apps. In the future we'll migrate to apps
		// storing their own random seed/password/etc inside their own data directory.
		const livinitySeedFile = `${this.#livinityd.dataDirectory}/db/livinity-seed/seed`
		if (!(await fse.exists(livinitySeedFile))) {
			this.logger.log('Creating Livinity seed')
			await fse.ensureFile(livinitySeedFile)
			await fse.writeFile(livinitySeedFile, randomToken(256))
		}

		// Setup bin dir
		try {
			const currentFilename = fileURLToPath(import.meta.url)
			const currentDirname = dirname(currentFilename)
			const binSourcePath = join(currentDirname, 'legacy-compat/bin')
			const binDestPath = `${this.#livinityd.dataDirectory}/bin`
			await fse.mkdirp(binDestPath)
			const bins = await fse.readdir(binSourcePath)
			this.logger.log(`Copying bins to ${binDestPath}`)
			for (const bin of bins) {
				this.logger.log(`Copying ${bin}`)
				const source = join(binSourcePath, bin)
				const dest = join(binDestPath, bin)
				await fse.copyFile(source, dest)
			}
		} catch (error) {
			this.logger.error(`Failed to copy bins`, error)
		}

		// Create app instances
		const appIds = await this.#livinityd.store.get('apps')
		this.instances = appIds.map((appId) => new App(this.#livinityd, appId))

		// Don't save references to any apps that don't have a data directory on
		// startup. This will allow apps that were excluded from backups to be
		// reinstalled when the system is restored. Otherwise they'll have an id
		// entry but no data dir and will be stuck in a `not-running` state.
		const appIdsMissingDataDir: string[] = []
		for (const app of this.instances) {
			const appDataDirectoryExists = await fse.pathExists(app.dataDirectory).catch(() => false)
			if (!appDataDirectoryExists) {
				this.logger.error(`App ${app.id} does not have a data directory, removing from instances`)
				this.instances = this.instances.filter((instanceApp) => instanceApp.id !== app.id)
				appIdsMissingDataDir.push(app.id)
			}
		}

		// Force the app state to starting so users don't get confused.
		// They aren't actually starting yet, we need to make sure the app env is up first.
		// But if that takes a long time users see all their apps listed as not running and
		// get confused.
		for (const app of this.instances) app.state = 'starting'

		// Attempt to pre-load local Docker images
		try {
			// Loop over iamges in /images
			const images = await fse.readdir(`/images`)
			await Promise.all(
				images.map(async (image) => {
					try {
						this.logger.log(`Pre-loading local Docker image ${image}`)
						await $({stdio: 'inherit'})`docker load --input /images/${image}`
					} catch (error) {
						this.logger.error(`Failed to pre-load local Docker image ${image}`, error)
					}
				}),
			)
		} catch (error) {
			this.logger.error(`Failed to pre-load local Docker images`, error)
		}

		// Start app environment
		try {
			try {
				await appEnvironment(this.#livinityd, 'up')
			} catch (error) {
				this.logger.error(`Failed to start app environment`, error)
				this.logger.log('Attempting to clean Docker state before retrying...')
				await this.cleanDockerState()
			}
			await pRetry(() => appEnvironment(this.#livinityd, 'up'), {
				onFailedAttempt: (error) => {
					this.logger.error(
						`Attempt ${error.attemptNumber} starting app environmnet failed. There are ${error.retriesLeft} retries left.`,
						error,
					)
				},
				retries: 2, // This will do exponential backoff for 1s, 2s
			})
		} catch (error) {
			// Log the error but continue to try to bring apps up to make it a less bad failure
			this.logger.error(`Failed to start app environment`, error)
		}

		try {
			// Set permissions for tor data directory
			await $`sudo chown -R 1000:1000 ${this.#livinityd.dataDirectory}/tor`
		} catch (error) {
			this.logger.error(`Failed to set permissions for Tor data directory`, error)
		}

		this.logger.log('Starting apps')
		// Snapshot of currently installed apps (minus apps missing their data directories that will be reinstalled)
		// We start these apps (save Promise), fire reinstalls without awaiting, then await the starts.
		const appsToStart = [...this.instances]
		const startAppsPromise = Promise.all(
			appsToStart.map(async (app) => {
				const shouldStart = await app.shouldAutoStart()
				if (!shouldStart) {
					this.logger.log(`Skipping app ${app.id} (autoStart disabled)`)
					app.state = 'stopped'
					return
				}

				return app.start().catch((error) => {
					// We handle individual errors here to prevent apps start from throwing
					// if a single app fails.
					app.state = 'unknown'
					this.logger.error(`Failed to start app ${app.id}`, error)
				})
			}),
		)

		// If this is the first boot after a backup restore, we kick off reinstalls of any apps that are missing their data directory.
		// e.g., due to restoring a backup where the app was excluded.
		// We fire and forget here so users see apps installing as soon as possible.
		this.reinstallMissingAppsAfterRestore(appIdsMissingDataDir).catch((error) =>
			this.logger.error('Failed to schedule app reinstalls after restore', error),
		)

		// Wait for current installed apps to finish starting
		await startAppsPromise

		// Restart per-user Docker containers (they get destroyed by cleanDockerState)
		try {
			const perUserInstances = await listAllUserAppInstances()
			if (perUserInstances.length > 0) {
				this.logger.log(`Restarting ${perUserInstances.length} per-user container(s)...`)
				await Promise.all(
					perUserInstances.map(async (inst) => {
						const composePath = `${inst.volumePath}/docker-compose.yml`
						if (!(await fse.pathExists(composePath))) return
						// Extract username from container name pattern: {appId}_{service}_user_{username}_1
						const match = inst.containerName.match(/_user_(.+)_1$/)
						const username = match?.[1] || 'unknown'
						const projectName = `${inst.appId}-user-${username}`
						try {
							await $`docker compose --file ${composePath} --project-name ${projectName} up -d`
							this.logger.log(`Started per-user container ${inst.containerName}`)
						} catch (error) {
							this.logger.error(`Failed to start per-user container ${inst.containerName}`, error)
						}
					}),
				)
			}
		} catch (error) {
			this.logger.error('Failed to restart per-user containers', error)
		}

		// Initialize native app instances
		for (const config of NATIVE_APP_CONFIGS) {
			const nativeApp = new NativeApp(this.#livinityd, config)
			await nativeApp.getStatus()
			this.nativeInstances.push(nativeApp)
			this.logger.log(`Registered native app ${config.id} (${nativeApp.state})`)
		}
	}

	private async reinstallMissingAppsAfterRestore(appIds: string[]) {
		// Only run on the first start after a backup restore
		if (!this.#livinityd.isBackupRestoreFirstStart) return

		// If there are no apps to reinstall, return early
		if (appIds.length === 0) return

		this.logger.log(`Detected ${appIds.length} app(s) missing a data directory after restore, reinstalling...`)

		// Try to update app repos for community apps (builtin apps don't need repos)
		try {
			await pRetry(
				async () => {
					await this.#livinityd.appStore.update()
				},
				{
					retries: 3,
					onFailedAttempt: (error) => {
						this.logger.error(
							`Failed to update app store before reinstalls (attempt ${error.attemptNumber}, ${error.retriesLeft} retries left).`,
							error,
						)
					},
				},
			)
		} catch (error) {
			this.logger.error('Exhausted retries updating app store before reinstalls — builtin apps will still install from generated templates', error)
			// Don't return early — builtin apps can still install without repos
		}

		for (const appId of appIds) {
			// Fire off all installs in parallel without blocking
			// TODO: Consider adding concurrency limiting for app installs to avoid overwhelming system resources
			this.install(appId).catch((error) => this.logger.error(`Failed to reinstall app ${appId}`, error))
		}
	}

	async stop() {
		this.logger.log('Stopping apps')
		await Promise.all(
			this.instances.map((app) =>
				app.stop().catch((error) => {
					// We handle individual errors here to prevent apps stop from throwing
					// if a single app fails.
					this.logger.error(`Failed to stop app ${app.id}`, error)
				}),
			),
		)

		this.logger.log('Stopping app environment')
		await pRetry(() => appEnvironment(this.#livinityd, 'down'), {
			onFailedAttempt: (error) => {
				this.logger.error(
					`Attempt ${error.attemptNumber} stopping app environmnet failed. There are ${error.retriesLeft} retries left.`,
				)
			},
			retries: 2,
		})
	}

	async isInstalled(appId: string) {
		return this.instances.some((app) => app.id === appId)
	}

	getApp(appId: string) {
		const app = this.instances.find((app) => app.id === appId)
		if (!app) throw new Error(`App ${appId} not found`)

		return app
	}

	getNativeApp(appId: string): NativeApp | undefined {
		return this.nativeInstances.find((app) => app.id === appId)
	}

	isNativeApp(appId: string): boolean {
		return NATIVE_APP_CONFIGS.some((c) => c.id === appId)
	}

	async install(appId: string, alternatives?: AppSettings['dependencies'], environmentOverrides?: Record<string, string>) {
		// Native apps don't need Docker install — they're installed via setup script
		if (this.isNativeApp(appId)) {
			// Just register as installed
			await this.#livinityd.store.getWriteLock(async ({get, set}) => {
				const apps = (await get('apps')) || []
				if (!apps.includes(appId)) {
					apps.push(appId)
					await set('apps', apps)
				}
			})
			// Create minimal data directory for manifest
			const appDataDirectory = `${this.#livinityd.dataDirectory}/app-data/${appId}`
			await fse.mkdirp(appDataDirectory)
			// Write a minimal livinity-app.yml manifest
			const builtinApp = getBuiltinApp(appId)
			if (builtinApp) {
				const yaml = (await import('js-yaml')).default
				const manifest = {
					manifestVersion: '1.1',
					id: appId,
					name: builtinApp.name,
					version: builtinApp.version,
					category: builtinApp.category,
					tagline: builtinApp.tagline,
					description: builtinApp.description,
					developer: builtinApp.developer,
					website: builtinApp.website,
					port: builtinApp.port,
					icon: builtinApp.icon,
				}
				await fse.writeFile(`${appDataDirectory}/livinity-app.yml`, yaml.dump(manifest))
			}
			this.logger.log(`Native app ${appId} registered as installed`)

			// Register subdomain in Caddy for reverse proxy
			try {
				const subdomain = builtinApp?.installOptions?.subdomain
				await this.registerAppSubdomain(appId, builtinApp?.port ?? 6080, subdomain)
			} catch (error) {
				this.logger.error(`Failed to register subdomain for native app ${appId}`, error)
			}

			return true
		}

		if (await this.isInstalled(appId)) throw new Error(`App ${appId} is already installed`)

		this.logger.log(`Installing app ${appId}`)

		// Template resolution chain:
		// 1. Try builtin compose generation (no network needed)
		// 2. Try platform DB via API (for apps added via web admin)
		// 3. Fall back to community git repos (legacy)
		let appTemplatePath: string
		let isGeneratedTemplate = false

		// Step 1: Try builtin compose generation
		const generatedPath = await generateAppTemplate(appId)
		if (generatedPath) {
			this.logger.log(`Using builtin compose template for ${appId}`)
			appTemplatePath = generatedPath
			isGeneratedTemplate = true
		} else {
			// Step 2: Try fetching compose from platform API
			const platformTemplate = await this.fetchPlatformTemplate(appId)
			if (platformTemplate) {
				this.logger.log(`Using platform DB compose template for ${appId}`)
				appTemplatePath = platformTemplate
				isGeneratedTemplate = true
			} else {
				// Step 3: Fall back to community git repos
				try {
					appTemplatePath = await this.#livinityd.appStore.getAppTemplateFilePath(appId)
					this.logger.log(`Using community repo template for ${appId}`)
				} catch {
					throw new Error(`App ${appId} not found: no builtin definition, no platform compose, and not in any app repository`)
				}
			}
		}

		let manifest: AppManifest
		try {
			manifest = await readManifestInDirectory(appTemplatePath)
		} catch {
			throw new Error('App template not found')
		}
		const manifestVersionValid = semver.valid(manifest.manifestVersion)
		if (!manifestVersionValid) {
			throw new Error('App manifest version is invalid')
		}
		const livinityVersionValid = semver.valid(this.#livinityd.version)
		const manifestVersionIsSupported = !!livinityVersionValid && semver.lte(manifestVersionValid, livinityVersionValid)
		if (!manifestVersionIsSupported) {
			throw new Error(`App manifest version not supported`)
		}

		this.logger.log(`Setting up data directory for ${appId}`)
		const appDataDirectory = `${this.#livinityd.dataDirectory}/app-data/${appId}`
		await fse.mkdirp(appDataDirectory)

		// We use rsync to copy to preserve permissions
		await $`rsync --archive --verbose --exclude ".gitkeep" ${appTemplatePath}/. ${appDataDirectory}`

		// Clean up generated template directory (not needed after rsync)
		if (isGeneratedTemplate) {
			await fse.remove(appTemplatePath).catch(() => {})
		}

		// Save reference to app instance
		const app = new App(this.#livinityd, appId)
		const filledSelectedDependencies = fillSelectedDependencies(manifest.dependencies, alternatives)
		await app.store.set('dependencies', filledSelectedDependencies)
		this.instances.push(app)

		// Filter environment overrides to only allow keys declared in the builtin manifest
		let filteredEnvOverrides = environmentOverrides
		if (environmentOverrides && Object.keys(environmentOverrides).length > 0) {
			const builtinApp = getBuiltinApp(appId)
			const allowedKeys = new Set(builtinApp?.installOptions?.environmentOverrides?.map((o) => o.name) ?? [])
			filteredEnvOverrides = {}
			for (const [key, value] of Object.entries(environmentOverrides)) {
				if (allowedKeys.has(key)) {
					filteredEnvOverrides[key] = value
				} else {
					this.logger.error(`Rejected unknown environment override key '${key}' for app ${appId}`)
				}
			}
		}

		// Complete the install process via the app script
		try {
			// We quickly try to start the app env before installing the app. In most normal cases
			// this just quickly returns and does nothing since the app env is already running.
			// However in the case where the app env is down this ensures we start it again.
			await appEnvironment(this.#livinityd, 'up')
			await app.install(filteredEnvOverrides)
		} catch (error) {
			this.logger.error(`Failed to install app ${appId}`, error)
			this.instances = this.instances.filter((app) => app.id !== appId)
			return false
		}

		// Save installed app
		await this.#livinityd.store.getWriteLock(async ({get, set}) => {
			let apps = await get('apps')
			apps.push(appId)
			// Make sure we never add dupes
			// This can happen after restoring a backup with an excluded app and then reinstalling it
			apps = [...new Set(apps)]
			await set('apps', apps)
		})

		// Register subdomain in Caddy for reverse proxy
		try {
			const builtinApp = getBuiltinApp(appId)
			const subdomain = builtinApp?.installOptions?.subdomain
			await this.registerAppSubdomain(appId, manifest.port, subdomain)
		} catch (error) {
			this.logger.error(`Failed to register subdomain for ${appId}`, error)
			// Don't fail install if subdomain registration fails
		}

		// Report install event to platform (fire-and-forget)
		this.reportInstallEvent(appId, 'install').catch(() => {})

		return true
	}

	async uninstall(appId: string) {
		// If we can't read an app's dependencies for any reason just skip that app, don't abort the uninstall
		const allDependencies = await Promise.all(this.instances.map((app) => app.getDependencies().catch(() => null)))
		const isDependency = allDependencies.some((dependencies) => dependencies?.includes(appId))
		if (isDependency) throw new Error(`App ${appId} is a dependency of another app and cannot be uninstalled`)

		const app = this.getApp(appId)

		const uninstalled = await app.uninstall()
		if (uninstalled) {
			// Remove app instance
			this.instances = this.instances.filter((app) => app.id !== appId)

			// Remove subdomain from Caddy
			try {
				await this.removeAppSubdomain(appId)
			} catch (error) {
				this.logger.error(`Failed to remove subdomain for ${appId}`, error)
			}

			// Report uninstall event to platform (fire-and-forget)
			this.reportInstallEvent(appId, 'uninstall').catch(() => {})
		}
		return uninstalled
	}

	async restart(appId: string) {
		const app = this.getApp(appId)

		return app.restart()
	}

	async update(appId: string) {
		const app = this.getApp(appId)

		return app.update()
	}

	async trackOpen(appId: string) {
		const app = this.getApp(appId)

		// Save installed app
		await this.#livinityd.store.getWriteLock(async ({get, set}) => {
			let recentlyOpenedApps = await get('recentlyOpenedApps')

			// Add app.id to the beginning of the array
			recentlyOpenedApps.unshift(app.id)

			// Remove duplicates
			recentlyOpenedApps = [...new Set(recentlyOpenedApps)]

			// Limit to 10
			recentlyOpenedApps = recentlyOpenedApps.slice(0, 10)

			await set('recentlyOpenedApps', recentlyOpenedApps)
		})

		return true
	}

	async recentlyOpened() {
		return this.#livinityd.store.get('recentlyOpenedApps')
	}

	async setTorEnabled(torEnabled: boolean) {
		if (this.isTorBeingToggled) {
			throw new Error(
				'Tor is already in the process of being toggled. Please wait until the current process is finished.',
			)
		}
		this.isTorBeingToggled = true
		try {
			const currentTorEnabled = await this.#livinityd.store.get('torEnabled')

			// Check if we're applying the current setting
			if (currentTorEnabled === torEnabled) {
				throw new Error(`Tor is already ${torEnabled ? 'enabled' : 'disabled'}`)
			}

			// Toggle Tor
			await this.stop()
			await this.#livinityd.store.set('torEnabled', torEnabled)
			await this.start()

			return true
		} finally {
			this.isTorBeingToggled = false
		}
	}

	async getTorEnabled() {
		return this.#livinityd.store.get('torEnabled')
	}

	async setSelectedDependencies(appId: string, dependencies: Record<string, string>) {
		const app = this.getApp(appId)
		return app.setSelectedDependencies(dependencies)
	}

	async getDependents(appId: string) {
		const allDependencies = await Promise.all(
			this.instances.map(async (app) => ({
				id: app.id,
				// If we can't read an app's dependencies for any reason just skip that app, don't abort
				dependencies: await app.getDependencies().catch(() => [] as string[]),
			})),
		)
		return allDependencies.filter(({dependencies}) => dependencies.includes(appId)).map(({id}) => id)
	}

	async setHideCredentialsBeforeOpen(appId: string, value: boolean) {
		const app = this.getApp(appId)
		return app.store.set('hideCredentialsBeforeOpen', value)
	}

	// ─── Platform Template Fetching ──────────────────────────────────

	/**
	 * Fetch docker compose definition from platform API for non-builtin apps.
	 * Returns a temp directory path with docker-compose.yml + livinity-app.yml, or null.
	 */
	private async fetchPlatformTemplate(appId: string): Promise<string | null> {
		try {
			const apiKey = await this.#livinityd.ai.redis.get(REDIS_PLATFORM_API_KEY)
			if (!apiKey) return null

			const response = await fetch(`https://livinity.io/api/apps/${appId}`, {
				headers: {'X-Api-Key': apiKey},
			})
			if (!response.ok) return null

			const data = (await response.json()) as any
			if (!data.docker_compose) return null

			// Write compose and manifest to temp directory
			const tmpDir = path.join(os.tmpdir(), `livos-platform-${appId}-${Date.now()}`)
			await fse.mkdirp(tmpDir)

			// Write the docker-compose.yml from platform DB
			await fse.writeFile(path.join(tmpDir, 'docker-compose.yml'), data.docker_compose)

			// Build manifest from API response data
			const manifest = {
				manifestVersion: '1.0.0',
				id: data.app_id || appId,
				name: data.name || appId,
				tagline: data.tagline || '',
				category: data.category || 'other',
				version: data.version || '1.0.0',
				port: data.port || 8080,
				description: data.description || '',
				website: data.website || '',
				developer: data.developer || '',
				support: data.website || '',
				gallery: [],
			}

			const yaml = (await import('js-yaml')).default
			await fse.writeFile(path.join(tmpDir, 'livinity-app.yml'), yaml.dump(manifest, {lineWidth: -1, noRefs: true}))

			return tmpDir
		} catch (error) {
			this.logger.error(`Failed to fetch platform template for ${appId}`, error)
			return null
		}
	}

	// ─── Platform Event Reporting ────────────────────────────────────
	// Reports install/uninstall events to livinity.io platform API (server-to-server)

	private async reportInstallEvent(appId: string, action: 'install' | 'uninstall'): Promise<void> {
		try {
			const [apiKey, instanceUrl] = await Promise.all([
				this.#livinityd.ai.redis.get(REDIS_PLATFORM_API_KEY),
				this.#livinityd.ai.redis.get(REDIS_PLATFORM_URL),
			])
			if (!apiKey || !instanceUrl) return

			const instanceName = instanceUrl.replace('https://', '').replace('http://', '')
			const response = await fetch('https://livinity.io/api/install-event', {
				method: 'POST',
				headers: {'Content-Type': 'application/json', 'X-Api-Key': apiKey},
				body: JSON.stringify({app_id: appId, action, instance_name: instanceName}),
			})
			if (response.ok) {
				this.logger.log(`Reported ${action} event for ${appId} to platform`)
			}
		} catch (error) {
			this.logger.error(`Failed to report ${action} event for ${appId}`, error)
		}
	}

	// ─── Caddy Subdomain Management ─────────────────────────────────
	// Automatically manages reverse proxy subdomains for apps

	private async getSubdomains(): Promise<SubdomainConfig[]> {
		const raw = await this.#livinityd.ai.redis.get(REDIS_SUBDOMAINS_KEY)
		if (!raw) return []
		return JSON.parse(raw) as SubdomainConfig[]
	}

	/**
	 * Get all subdomain configurations (public method for routes).
	 */
	async getAllSubdomains(): Promise<SubdomainConfig[]> {
		return this.getSubdomains()
	}

	private async setSubdomains(subdomains: SubdomainConfig[]): Promise<void> {
		await this.#livinityd.ai.redis.set(REDIS_SUBDOMAINS_KEY, JSON.stringify(subdomains))
	}

	private async getDomainConfig(): Promise<{domain: string; active: boolean} | null> {
		const raw = await this.#livinityd.ai.redis.get(REDIS_DOMAIN_KEY)
		if (!raw) return null
		return JSON.parse(raw)
	}

	private async rebuildCaddy(): Promise<void> {
		const domainConfig = await this.getDomainConfig()
		const subdomains = await this.getSubdomains()

		const caddyConfig: CaddyConfig = {
			mainDomain: domainConfig?.active ? domainConfig.domain : null,
			subdomains: subdomains.filter((s) => s.enabled),
		}

		// Check if multi-user mode is enabled
		const multiUserEnabled = await this.#livinityd.ai.redis.get('livos:system:multi_user')
		const isMultiUser = multiUserEnabled === 'true'

		// Gather native app subdomain info for JWT-gated Caddy blocks
		const nativeAppSubdomains = this.nativeInstances.map((app) => {
			const builtinApp = getBuiltinApp(app.id)
			return {
				subdomain: builtinApp?.installOptions?.subdomain || app.id,
				port: app.port,
			}
		})

		const content = generateFullCaddyfile(caddyConfig, isMultiUser, false, nativeAppSubdomains)
		await writeCaddyfile(content)
		await reloadCaddy()
	}

	/**
	 * Register a subdomain for an app in Caddy.
	 * Called automatically after app installation.
	 */
	async registerAppSubdomain(appId: string, port: number, subdomain?: string): Promise<void> {
		const domainConfig = await this.getDomainConfig()
		if (!domainConfig?.active) {
			this.logger.log(`No active domain configured, skipping subdomain registration for ${appId}`)
			return
		}

		const subdomains = await this.getSubdomains()

		// Use provided subdomain or default to appId
		const subdomainName = subdomain || appId

		// Check if already exists
		const existingIdx = subdomains.findIndex((s) => s.appId === appId)
		const newSub: SubdomainConfig = {
			subdomain: subdomainName.toLowerCase(),
			appId,
			port,
			enabled: true,
		}

		if (existingIdx >= 0) {
			subdomains[existingIdx] = newSub
		} else {
			subdomains.push(newSub)
		}

		await this.setSubdomains(subdomains)
		await this.rebuildCaddy()

		this.logger.log(`Registered subdomain ${subdomainName}.${domainConfig.domain} -> localhost:${port} for ${appId}`)
	}

	/**
	 * Remove subdomain registration for an app.
	 * Called automatically when app is uninstalled.
	 */
	async removeAppSubdomain(appId: string): Promise<void> {
		const subdomains = await this.getSubdomains()
		const filtered = subdomains.filter((s) => s.appId !== appId)

		if (filtered.length !== subdomains.length) {
			await this.setSubdomains(filtered)
			await this.rebuildCaddy()
			this.logger.log(`Removed subdomain registration for ${appId}`)
		}
	}

	// ─── Multi-User App Management ──────────────────────────────────

	/**
	 * Check if multi-user mode is enabled.
	 */
	async isMultiUserEnabled(): Promise<boolean> {
		const val = await this.#livinityd.ai.redis.get('livos:system:multi_user')
		return val === 'true'
	}

	/**
	 * Toggle multi-user mode. When enabled, Caddy uses wildcard subdomain routing
	 * and the app gateway handles per-user container routing.
	 */
	async setMultiUserEnabled(enabled: boolean): Promise<void> {
		await this.#livinityd.ai.redis.set('livos:system:multi_user', enabled ? 'true' : 'false')
		await this.rebuildCaddy()
		this.logger.log(`Multi-user mode ${enabled ? 'enabled' : 'disabled'}`)
	}

	/**
	 * Install an app for a specific user (per-user Docker isolation).
	 * Creates a per-user copy of the app with unique container name, port, and volume.
	 */
	async installForUser(appId: string, userId: string): Promise<boolean> {
		const user = await findUserById(userId)
		if (!user) throw new Error(`User ${userId} not found`)

		// Check if user already has this app
		const existing = await getUserAppInstance(userId, appId)
		if (existing) throw new Error(`User ${user.username} already has ${appId} installed`)

		// Template resolution chain (same as install())
		let appTemplatePath: string
		let isGeneratedTemplate = false
		const generatedPath = await generateAppTemplate(appId)
		if (generatedPath) {
			appTemplatePath = generatedPath
			isGeneratedTemplate = true
		} else {
			const platformTemplate = await this.fetchPlatformTemplate(appId)
			if (platformTemplate) {
				appTemplatePath = platformTemplate
				isGeneratedTemplate = true
			} else {
				try {
					appTemplatePath = await this.#livinityd.appStore.getAppTemplateFilePath(appId)
				} catch {
					throw new Error(`App ${appId} not found: no builtin definition, no platform compose, and not in any app repository`)
				}
			}
		}

		let manifest
		try {
			manifest = await readManifestInDirectory(appTemplatePath)
		} catch {
			throw new Error('App template not found')
		}

		// Allocate a unique port
		const port = await allocatePort()

		// Per-user data directory
		const userDataDir = `${this.#livinityd.dataDirectory}/users/${user.username}/app-data/${appId}`
		await fse.mkdirp(userDataDir)

		// Copy app template to user directory
		await $`rsync --archive --verbose --exclude ".gitkeep" ${appTemplatePath}/. ${userDataDir}`

		// Clean up generated template directory (not needed after rsync)
		if (isGeneratedTemplate) {
			await fse.remove(appTemplatePath).catch(() => {})
		}

		// Read and patch compose file for this user
		// Resolve legacy env vars that the app-script would normally set
		const {hostname} = await import('os')
		const compose = (await fse.readFile(`${userDataDir}/docker-compose.yml`, 'utf8'))
			.replace(/\$\{APP_DATA_DIR\}/g, userDataDir)
			.replace(/\$\{UMBREL_ROOT\}/g, this.#livinityd.dataDirectory) // legacy env var in third-party app compose files
			.replace(/\$\{DEVICE_HOSTNAME\}/g, hostname())
		const composeData = (await import('js-yaml')).default.load(compose) as any

		// Detect internal port — prefer manifest.port (the web-accessible port)
		// Compose may only list peripheral ports (e.g., discovery), so manifest is authoritative
		const mainServiceName = Object.keys(composeData.services || {})[0]
		let internalPort: number = manifest.port || 8080
		if (!manifest.port && mainServiceName && composeData.services[mainServiceName]) {
			const service = composeData.services[mainServiceName]
			if (service.ports && Array.isArray(service.ports)) {
				for (const p of service.ports) {
					const portStr = p.toString().replace('/udp', '').replace('/tcp', '')
					if (portStr.includes(':')) {
						const parts = portStr.split(':')
						internalPort = parseInt(parts[parts.length - 1], 10)
						break
					}
				}
			}
			if (internalPort === 8080 && service.expose && Array.isArray(service.expose)) {
				internalPort = parseInt(service.expose[0].toString(), 10)
			}
		}

		// Patch all services with per-user container names and volumes
		for (const serviceName of Object.keys(composeData.services || {})) {
			const service = composeData.services[serviceName]
			service.container_name = `${appId}_${serviceName}_user_${user.username}_1`

			// Remap volumes to per-user paths (apply only the first matching replacement per volume
			// to prevent chaining, e.g., /data/storage/downloads → /users/X/home/Downloads
			// then /home/Downloads matching again in the result)
			if (service.volumes && Array.isArray(service.volumes)) {
				service.volumes = service.volumes.map((v: string) => {
					if (v.includes('/data/storage/downloads')) {
						return v.replace('/data/storage/downloads', `/users/${user.username}/home/Downloads`)
					}
					if (v.includes('/data/storage')) {
						return v.replace('/data/storage', `/users/${user.username}/home`)
					}
					if (v.includes('/home/Downloads')) {
						return v.replace('/home/Downloads', `/users/${user.username}/home/Downloads`)
					}
					if (v.includes('/home') && !v.includes('/users/')) {
						return v.replace('/home', `/users/${user.username}/home`)
					}
					return v
				})
			}
		}

		// Set the host port mapping on the main service
		if (mainServiceName && composeData.services[mainServiceName]) {
			const service = composeData.services[mainServiceName]
			service.ports = [`127.0.0.1:${port}:${internalPort}`]
		}

		// Write patched compose
		const yamlDump = (await import('js-yaml')).default.dump(composeData)
		await fse.writeFile(`${userDataDir}/docker-compose.yml`, yamlDump)

		// Start the container
		try {
			await $`docker compose --file ${userDataDir}/docker-compose.yml --project-name ${appId}-user-${user.username} up -d`
		} catch (error) {
			this.logger.error(`Failed to start per-user container for ${appId} (user: ${user.username})`, error)
			throw new Error(`Failed to start container: ${(error as Error).message}`)
		}

		// Record in database — use per-user subdomain so frontend routes to this user's instance
		const subdomain = `${appId}-${user.username}`
		await createUserAppInstance({
			userId,
			appId,
			subdomain,
			containerName: `${appId}_${mainServiceName || 'app'}_user_${user.username}_1`,
			port,
			volumePath: userDataDir,
		})

		this.logger.log(`Installed ${appId} for user ${user.username} on port ${port}`)
		return true
	}

	/**
	 * Uninstall a per-user app instance.
	 * Stops and removes the user's container and data.
	 */
	async uninstallForUser(appId: string, userId: string): Promise<boolean> {
		const user = await findUserById(userId)
		if (!user) throw new Error(`User ${userId} not found`)

		const instance = await getUserAppInstance(userId, appId)
		if (!instance) throw new Error(`User ${user.username} doesn't have ${appId} installed`)

		// Stop and remove containers
		const userDataDir = instance.volumePath
		try {
			await $`docker compose --file ${userDataDir}/docker-compose.yml --project-name ${appId}-user-${user.username} down --volumes`
		} catch (error) {
			this.logger.error(`Failed to stop per-user container for ${appId} (user: ${user.username})`, error)
		}

		// Remove data directory
		await fse.remove(userDataDir)

		// Remove from database
		await deleteUserAppInstance(userId, appId)

		this.logger.log(`Uninstalled ${appId} for user ${user.username}`)
		return true
	}
}
