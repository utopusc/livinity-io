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
import {reconcileAppVolumeOwnership} from './reconcile-volume-ownership.js'
import type {AppManifest, AppSettings} from './schema.js'
import {fillSelectedDependencies} from '../utilities/dependencies.js'
import {getBuiltinApp} from './builtin-apps.js'
import {NativeApp, NATIVE_APP_CONFIGS} from './native-app.js'
import {generateAppTemplate} from './compose-generator.js'
import {shouldPreferCatalog} from './builtin-precedence.js'
import {injectAiProviderConfig} from './inject-ai-provider.js'
import {
	detectHostAiClis,
	injectLocalAiClisConfig,
	writeLocalAiCliWrappers,
	grantContainerCredsAcl,
} from './inject-local-ai-clis.js'
import {startCredEgressProxyIfNeeded} from './cred-egress-proxy.js'
import {sanitizeNonBuiltinCompose, ComposeRejected} from './compose-sanitizer.js'
import {assertInstallAllowed, InstallForbidden} from './install-admin-gate.js'
import {effectivePublicAccess, isPublicForbidden, type PublicForbiddenSignals} from './public-forbidden.js'
import type {PublicAccessConfig, PublicAccessInstallSetting} from './public-access.js'
import {
	chooseCredentialPath,
	mintMeteredKeyForApp,
	revokeMeteredKeyForApp,
	type BrokerClient,
} from './metered-key.js'
import {applyCaddyConfig, generateFullCaddyfile, writeCaddyfile, reloadCaddy, type SubdomainConfig, type CaddyConfig} from '../domain/caddy.js'
import {buildCaddyConfigFromState, type CaddyStateInstance, type CaddyStateSubdomain} from '../domain/caddy-state.js'
import {getTunnelStatus} from '../domain/tunnel.js'
import {
	allocatePort,
	createUserAppInstance,
	deleteUserAppInstance,
	getUserAppInstance,
	listAllUserAppInstances,
	findUserById,
	findUserByUsername,
	getAdminUser,
	getPool,
} from '../database/index.js'
// writeSurfaceContext / removeSurfaceContext lived in claude-runner/ — removed
// with the AI Chat teardown. No-op stubs preserve install/uninstall flow.

// Redis keys for domain config
const REDIS_DOMAIN_KEY = 'livos:domain:config'
const REDIS_SUBDOMAINS_KEY = 'livos:domain:subdomains'
// Phase 258 WS-C (258-03) — per-install public-access operator setting, persisted
// on a SubdomainConfig-ADJACENT sibling key (same `livos:domain:` namespace +
// same Redis store registerAppSubdomain writes the SubdomainConfig to). Chosen as
// a sibling key (not a field on the SubdomainConfig entry) so the setting survives
// even when no subdomain row exists yet (set-before-register) and so a stale
// public setting on a now-forbidden app is independently inspectable; the
// fail-closed re-assert in computeEffectivePublicAccess guarantees a forbidden app
// can never emit a public block regardless of this stored value (T-258C-03).
const REDIS_PUBLIC_ACCESS_PREFIX = 'livos:apps:public-access:'
const REDIS_PLATFORM_API_KEY = 'livos:platform:api_key'
// Phase 210 Bug C: this constant was referenced by reportInstallEvent() but
// never declared; tsx hides the bug as a runtime ReferenceError caught by the
// surrounding try/catch, silently dropping every install/uninstall event.
// Value matches the key tunnel-client.ts writes (the instance URL like
// https://bruce.livinity.io), which is what reportInstallEvent strips for the
// instance_name body field.
const REDIS_PLATFORM_URL = 'livos:platform:url'
// Phase 140-08.1 (2026-05-17): `livos:platform:url` is overwritten by
// platform/tunnel-client.ts:463 with the INSTANCE'S assigned URL (e.g.
// https://socinity.livinity.io). Phase 140-08 reads the same key expecting
// the SERVER5 PLATFORM URL (https://livinity.io) for app-subdomain
// provisioning. Until tunnel-client is refactored to use a different key,
// hardcode the platform URL so app installs reach the right endpoint.
// Env override (LIVINITY_PLATFORM_URL) is honored for staging / mainserver
// testing where the platform lives at a different host.
const LIVINITY_PLATFORM_URL = process.env.LIVINITY_PLATFORM_URL || 'https://livinity.io'

/**
 * Phase 218 follow-up — detect whether cloudflared.service is running.
 * Used as an additional signal for "CF tunnel terminates TLS at the edge,
 * so emit `http://` prefix on every Caddy host block". Boxes provisioned
 * via `install.sh --mode tunnel` before the Phase 142-02 Redis seed
 * landed don't have `livos:domain:local_mode` set, but the cloudflared
 * unit is the canonical truth source. `systemctl is-active` is cheap
 * (single read of /sys/fs/cgroup state); the catch swallows any error
 * (missing systemctl on non-Linux dev boxes, etc.) so detection
 * gracefully degrades to false.
 */
async function isCloudflaredActive(): Promise<boolean> {
	try {
		const result = await $({reject: false})`systemctl is-active cloudflared`
		return result.stdout.trim() === 'active'
	} catch {
		return false
	}
}

/**
 * Phase 141-03: extract a hostname from a Server5-minted app subdomain URL.
 * Returns the hostname (e.g. `n8n-socinity.livinity.io`) or undefined when
 * the input can't be parsed. Defensive — Server5 should always return a valid
 * absolute URL, but we never want a malformed response to abort the install.
 */
function hostFromUrl(url: string): string | undefined {
	try {
		return new URL(url).hostname || undefined
	} catch {
		return undefined
	}
}

export default class Apps {
	#livinityd: Livinityd
	logger: Livinityd['logger']
	instances: App[] = []
	nativeInstances: NativeApp[] = []

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

		// Phase 286 (SC3): boot backfill — reconcile volume ownership for EVERY
		// installed app so existing broken boxes self-heal on restart/Update. Each
		// call is idempotent/no-op when ownership is already correct. Best-effort
		// per app; one failure never blocks boot. Concurrency-capped (5) so a box
		// with many apps does not add minutes to boot — chowns are idempotent +
		// commutative so parallelism is safe.
		const BACKFILL_CONCURRENCY = 5
		const backfillStart = Date.now()
		const backfillQueue = [...this.instances]
		const backfillWorkers = Array.from({length: Math.min(BACKFILL_CONCURRENCY, backfillQueue.length)}, async () => {
			for (;;) {
				const app = backfillQueue.shift()
				if (!app) return
				await reconcileAppVolumeOwnership(app, {projectName: app.id}).catch((error) =>
					this.logger.error(`[reconcile] boot backfill failed for ${app.id}`, error),
				)
			}
		})
		await Promise.all(backfillWorkers)
		this.logger.log(
			`[reconcile] boot backfill done for ${this.instances.length} app(s) in ${Date.now() - backfillStart}ms`,
		)

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

		// Phase 286: the old boot-time hardcoded-uid permission fixes (the Tor dir,
		// removed in P276, and a blanket fix over /app-data) are gone — both
		// silently failed (livinityd is non-root) and the blanket one also clobbered
		// management-file ownership. The boot backfill above now reconciles each
		// app's data volumes to the correct per-service uid via the docker group.

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
							// Phase 286: reconcile per-user volume ownership before the up.
							await reconcileAppVolumeOwnership(
								{
									id: inst.appId,
									dataDirectory: inst.volumePath,
									readCompose: async () =>
										(await import('js-yaml')).default.load(
											await fse.readFile(composePath, 'utf8'),
										) as any,
									logger: this.logger,
								},
								{projectName, appDataDir: inst.volumePath, rootDir: this.#livinityd.dataDirectory},
							).catch((error) =>
								this.logger.error(`[reconcile] per-user boot failed for ${inst.containerName}`, error),
							)
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

		// Phase 218 T4 — backfill orphan Docker containers that landed via a
		// pre-multi-user install path (operator dogfood: bolt-diy, immich).
		// Runs BEFORE T5's boot-time Caddyfile regen so reconciled rows
		// participate in the regen.
		await this.reconcileOrphanInstances()

		// Phase 218 T5 — rebuild the Caddyfile from current DB+Redis state
		// after reconciliation so any orphan apps newly inserted into
		// user_app_instances get their subdomain block emitted. Non-fatal:
		// rebuildCaddyFromState swallows its own failures, so a Caddy outage
		// never blocks livinityd boot.
		await this.rebuildCaddyFromState()
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

	async install(appId: string, alternatives?: AppSettings['dependencies'], environmentOverrides?: Record<string, string>, isAdmin: boolean = true) {
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
					// Phase 262-05 (LIVOS-057): thread the public-forbidden load-bearing
					// flags into the written manifest (js-yaml drops undefined keys).
					requiresLocalAiClis: (builtinApp as any).requiresLocalAiClis ?? undefined,
					neverPublic: (builtinApp as any).neverPublic ?? undefined,
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

		// Phase 286 (SC5): catalog>builtin precedence. For plain builtins the
		// catalog def (named volume + pinned image + unique port) is strictly
		// better, so try it FIRST and fall back to the builtin only if the catalog
		// has no entry. Allowlisted specials (AI-broker/docker.sock/privileged)
		// keep builtin precedence — the catalog cannot replicate their injected
		// behavior. (Old order tried generateAppTemplate first, shadowing the
		// catalog for every app present in both — proven by n8n.)
		let appTemplatePath: string
		let isGeneratedTemplate = false

		const preferCatalog = shouldPreferCatalog(appId)
		if (preferCatalog) {
			const platformTemplate = await this.fetchPlatformTemplate(appId)
			if (platformTemplate) {
				this.logger.log(`Using platform DB compose template for ${appId} (catalog>builtin)`)
				appTemplatePath = platformTemplate
				isGeneratedTemplate = true
			} else {
				const generatedPath = await generateAppTemplate(appId)
				if (generatedPath) {
					this.logger.log(`Using builtin compose template for ${appId} (no catalog entry)`)
					appTemplatePath = generatedPath
					isGeneratedTemplate = true
				} else {
					throw new Error(`App ${appId} not found: no platform compose and no builtin definition`)
				}
			}
		} else {
			const generatedPath = await generateAppTemplate(appId)
			if (generatedPath) {
				this.logger.log(`Using builtin compose template for ${appId} (allowlisted special)`)
				appTemplatePath = generatedPath
				isGeneratedTemplate = true
			} else {
				const platformTemplate = await this.fetchPlatformTemplate(appId)
				if (platformTemplate) {
					this.logger.log(`Using platform DB compose template for ${appId}`)
					appTemplatePath = platformTemplate
					isGeneratedTemplate = true
				} else {
					throw new Error(`App ${appId} not found: no builtin definition and no platform compose`)
				}
			}
		}

		let manifest: AppManifest
		try {
			manifest = await readManifestInDirectory(appTemplatePath)
		} catch {
			throw new Error('App template not found')
		}
		const manifestVersionValid = semver.valid(manifest.manifestVersion) || semver.valid(semver.coerce(manifest.manifestVersion))
		if (!manifestVersionValid) {
			throw new Error('App manifest version is invalid')
		}
		const livinityVersionValid = semver.valid(this.#livinityd.version) || semver.valid(semver.coerce(this.#livinityd.version))
		const manifestVersionIsSupported = !!livinityVersionValid && semver.lte(manifestVersionValid, livinityVersionValid)
		if (!manifestVersionIsSupported) {
			throw new Error(`App manifest version not supported`)
		}

		// WS-C (256-03, LIVOS-007/013, SC5): admin-gate the privileged install
		// surface. A non-admin cannot install an app that uses the operator's AI
		// credentials (requiresLocalAiClis / requiresAiProvider) nor a NEW
		// non-builtin community-repo app (!isGeneratedTemplate). Builtin +
		// platform-DB apps remain installable by members. Legacy single-user
		// (no currentUser at the route) passes isAdmin=true. Throws InstallForbidden.
		assertInstallAllowed({isAdmin, isGeneratedTemplate, manifest})

		this.logger.log(`Setting up data directory for ${appId}`)
		const appDataDirectory = `${this.#livinityd.dataDirectory}/app-data/${appId}`
		await fse.mkdirp(appDataDirectory)

		// We use rsync to copy to preserve permissions
		await $`rsync --archive --verbose --exclude ".gitkeep" ${appTemplatePath}/. ${appDataDirectory}`

		// Pre-create volume mount directories so Docker doesn't create them as root.
		// Parse docker-compose.yml for volume mounts that reference ${APP_DATA_DIR}
		try {
			const composeFile = `${appDataDirectory}/docker-compose.yml`
			const composeContent = await fse.readFile(composeFile, 'utf8')
			const volumeMatches = composeContent.matchAll(/\$\{APP_DATA_DIR\}\/([^:]+):/g)
			for (const match of volumeMatches) {
				const subDir = match[1].trim()
				await fse.mkdirp(`${appDataDirectory}/${subDir}`)
			}
		} catch {}

		// Phase 286: no post-rsync `chown 1000:1000` here — app.install() reconciles
		// data-volume ownership to each service's real uid before its own up, and we
		// must NOT chown the whole app dir (it would clobber management-file ownership
		// that livinityd needs to keep writable). See reconcile-volume-ownership.ts.

		// Clean up generated template directory (not needed after rsync)
		if (isGeneratedTemplate) {
			await fse.remove(appTemplatePath).catch(() => {})
		}

		// WS-C (256-03, LIVOS-007/013, SC5): sanitize the compose for NON-builtin
		// community-repo apps BEFORE any inject + before `docker compose up`. Strip
		// privileged / network_mode:host / pid:host / userns_mode:host / cap_add /
		// security_opt unconfined; REJECT any host-path bind outside the app data
		// dir (docker.sock, /, other users' data, operator secrets). Builtin +
		// platform-DB composes (isGeneratedTemplate===true) are operator-curated and
		// are NOT sanitized — Portainer/OpenHands keep their declared mounts (SC7).
		// Ordering invariant (fix F): this runs BEFORE the WS-B requiresLocalAiClis
		// inject below, so the operator-trusted CA/CLI mounts under CLI_MOUNT_PREFIX
		// are added post-sanitize and never subject to the host-path check.
		if (!isGeneratedTemplate) {
			const composeFile = `${appDataDirectory}/docker-compose.yml`
			const yaml = (await import('js-yaml')).default
			const composeContent = await fse.readFile(composeFile, 'utf8')
			const composeData = yaml.load(composeContent)
			// Let ComposeRejected propagate — the install must abort on an
			// irremediable directive (a mount the app depends on we cannot allow).
			const {compose, removed} = sanitizeNonBuiltinCompose(composeData, appDataDirectory)
			await fse.writeFile(composeFile, yaml.dump(compose))
			this.logger.log(`LIVOS-013: sanitized non-builtin compose for ${appId} removed=${removed.join(',') || '(none)'}`)
		}

		// Phase 43.2 (FR-MARKET-01 single-user mode): inject AI broker config when
		// manifest opts in via `requiresAiProvider: true`. Mirrors Phase 43's
		// installForUser logic (line ~963) but runs in the single-user install path
		// that was originally missed by Phase 43 (only multi-user got the inject).
		// No-op when manifest.requiresAiProvider is absent or false.
		//
		// 256-02 SC4b: the credential PATH keys off isGeneratedTemplate (the same
		// trust dimension WS-C's admin-gate uses). VERIFIED → broker sentinel
		// (OAuth-managed, unchanged); UNVERIFIED → per-app metered virtual key
		// (budget + model allowlist, independently revocable on uninstall).
		let meteredKeyId: string | null = null
		if (manifest.requiresAiProvider === true) {
			const composeFile = `${appDataDirectory}/docker-compose.yml`
			try {
				const composeContent = await fse.readFile(composeFile, 'utf8')
				const yaml = (await import('js-yaml')).default
				const composeData = yaml.load(composeContent)
				// Resolve admin user_id for the broker URL path. In single-user mode
				// every request uses this admin id (broker_force_root_home env additionally
				// makes broker share /root/.claude/ creds across all users).
				const adminUser = await getAdminUser().catch(() => null)
				const userId = adminUser?.id || 'default'
				// 256-02 SC4b: verified→broker sentinel (unchanged); unverified→
				// per-app metered virtual key (community apps NEVER ride the
				// operator's personal subscription).
				if (chooseCredentialPath({isGeneratedTemplate}) === 'metered-key') {
					const {virtualKey, keyId} = await mintMeteredKeyForApp(
						{appSlug: appId, userId, budget: {maxUsd: 5}, modelAllowlist: undefined},
						this.#brokerClient(),
					)
					meteredKeyId = keyId
					injectAiProviderConfig(composeData, userId, manifest, {virtualKey})
					this.logger.log(`256-02 SC4b: minted per-app metered key for UNVERIFIED ${appId} (keyId=${keyId})`)
				} else {
					injectAiProviderConfig(composeData, userId, manifest)
				}
				await fse.writeFile(composeFile, yaml.dump(composeData))
				this.logger.log(`Phase 43.2: injected AI broker config for ${appId} (single-user, userId=${userId})`)
			} catch (error) {
				// Non-fatal for the verified path. The metered path does NOT fall
				// back to lending the operator subscription (ToS-safe failure mode).
				this.logger.error(`Phase 43.2: failed to inject broker config for ${appId}`, error)
			}
		}

		// Direct host-AI-CLI access (NO broker): when the manifest opts in via
		// `requiresLocalAiClis: true`, mount the host's claude/gemini CLIs +
		// glibc runtime + PATH wrappers, so agent-native apps (e.g. Open Design)
		// run the real local CLIs directly. Creds are NOT mounted (LIVOS-001) —
		// the CLIs reach the model through the host cred-egress proxy. No-op when
		// the flag is absent/false. Non-fatal.
		if (manifest.requiresLocalAiClis === true) {
			const composeFile = `${appDataDirectory}/docker-compose.yml`
			try {
				// 256-02 SC4b: a community (UNVERIFIED) app must NOT get the operator
				// OAuth subscription via the cred-egress proxy. Instead it gets a
				// per-app metered virtual key through the broker (base-URL + key in
				// env, no host CLI mount). Only VERIFIED apps take the OAuth proxy.
				if (chooseCredentialPath({isGeneratedTemplate}) === 'metered-key') {
					const adminUser = await getAdminUser().catch(() => null)
					const userId = adminUser?.id || 'default'
					const {virtualKey, keyId} = await mintMeteredKeyForApp(
						{appSlug: appId, userId, budget: {maxUsd: 5}, modelAllowlist: undefined},
						this.#brokerClient(),
					)
					meteredKeyId = keyId
					const composeContent = await fse.readFile(composeFile, 'utf8')
					const yaml = (await import('js-yaml')).default
					const composeData = yaml.load(composeContent)
					// Treat as a broker-provider app for the metered key injection.
					injectAiProviderConfig(composeData, userId, {...manifest, requiresAiProvider: true}, {virtualKey})
					await fse.writeFile(composeFile, yaml.dump(composeData))
					this.logger.log(`256-02 SC4b: UNVERIFIED ${appId} requiresLocalAiClis → metered key (keyId=${keyId}); operator OAuth NOT lent`)
				} else {
					// VERIFIED: the host cred-egress proxy / OAuth path (unchanged).
					// LIVOS-001 / SC4: start the proxy BEFORE the container comes up
					// so the CLIs' HTTPS_PROXY target is listening. Idempotent.
					await startCredEgressProxyIfNeeded(this.logger)
					const detected = await detectHostAiClis()
					if (!detected) {
						this.logger.error(`requiresLocalAiClis: no host AI CLIs detected for ${appId}; skipping mount`)
					} else {
						await writeLocalAiCliWrappers(appDataDirectory, detected)
						const composeContent = await fse.readFile(composeFile, 'utf8')
						const yaml = (await import('js-yaml')).default
						const composeData = yaml.load(composeContent)
						injectLocalAiClisConfig(composeData, detected, appDataDirectory, manifest)
						await fse.writeFile(composeFile, yaml.dump(composeData))
						this.logger.log(`requiresLocalAiClis: mounted host AI CLIs into ${appId} (claude=${!!detected.claude}, gemini=${!!detected.gemini}) via cred-egress proxy`)
					}
				}
			} catch (error) {
				this.logger.error(`requiresLocalAiClis: failed to inject host CLIs for ${appId}`, error)
			}
		}

		// Save reference to app instance
		const app = new App(this.#livinityd, appId)
		const filledSelectedDependencies = fillSelectedDependencies(manifest.dependencies, alternatives)
		await app.store.set('dependencies', filledSelectedDependencies)
		// 256-02 SC4b: persist the per-app metered keyId (if minted) so uninstall
		// can independently revoke it.
		if (meteredKeyId) {
			await app.store.set('meteredKeyId', meteredKeyId).catch(() => {})
		}
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

		// requiresLocalAiClis: now that the container is up, grant its uid ACL
		// access to the operator's mounted creds so non-root containers can read
		// (and refresh) the host OAuth tokens. Best-effort; never throws.
		if (manifest.requiresLocalAiClis === true) {
			try {
				const detected = await detectHostAiClis()
				await grantContainerCredsAcl(appDataDirectory, detected, this.logger)
			} catch (error) {
				this.logger.error(`requiresLocalAiClis: failed to grant creds ACL for ${appId}`, error)
			}
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

		// Phase 140 plan 140-08 — provision a CF DNS + Tunnel ingress subdomain
		// via Server5 BEFORE rebuilding Caddy locally. Best-effort: the helper
		// internally swallows all errors and returns null, so the install flow
		// never throws on a Server5 outage / missing platform credentials /
		// network error. The returned subdomain (e.g. "n8n-lucy") is the
		// canonical {app}-{user}.livinity.io shape minted by Server5.
		// Phase 141-03: capture the return value so the local Caddyfile + Redis
		// subdomain array carry the same hyphen-pattern host Server5 minted
		// (previously discarded → Caddy emitted `n8n.socinity.livinity.io`
		// instead of `n8n-socinity.livinity.io` → CF Tunnel 404).
		const provisioned = await this.provisionAppSubdomain(appId, manifest.port)
		if (!provisioned) {
			// Phase 210 Bug B: surface the silent provisioning failure. Without
			// the Server5-minted host the local Caddy block falls back to
			// `<sub>.<mainDomain>` (dot format) which does NOT match the
			// CF Tunnel ingress (`<sub>-<user>.livinity.io`, hyphen format)
			// — apps appear to "install" but are unreachable through the
			// public subdomain. Log loudly + report through the platform
			// event channel so operator dashboards see the missing wire.
			this.logger.error(
				`Phase 210: CF subdomain provisioning failed for ${appId}. ` +
					`App will use legacy dot-format subdomain which likely won't resolve via CF Tunnel. ` +
					`Causes: Server5 unreachable, missing platform api-key, 409 conflict from re-install, or single-char slug. ` +
					`Re-run install after Server5 connectivity is verified.`,
			)
		}

		// Phase 286 (SC6): verify the published host port == manifest.port (the
		// value Caddy reverse_proxies to via SubdomainConfig.port). A mismatch means
		// Caddy will proxy to a port nothing listens on → 502. Log it so the gap is
		// visible (do not auto-rewrite — the compose is authoritative; catalog
		// composes carry explicit 41xxx mappings).
		try {
			const composeCheck = await app.readCompose()
			const svcNames = Object.keys(composeCheck.services ?? {})
			const mainSvc =
				svcNames.find((n) => n === appId || n === 'server' || n === 'app' || n === 'web') ||
				svcNames.find((n) => !['docker', 'dind', 'tor', 'proxy', 'sidecar', 'init'].includes(n)) ||
				svcNames[0]
			const ports = (composeCheck.services?.[mainSvc]?.ports ?? []) as string[]
			const hostPorts = ports
				.map((p) => p.toString())
				.map((p) => {
					const parts = p.replace('/udp', '').replace('/tcp', '').split(':')
					return parts.length >= 2 ? parseInt(parts[parts.length - 2], 10) : NaN
				})
				.filter((n) => !Number.isNaN(n))
			if (hostPorts.length > 0 && !hostPorts.includes(manifest.port)) {
				this.logger.error(
					`Phase 286 (SC6): port mismatch for ${appId} — manifest.port=${manifest.port} but published host ports are [${hostPorts.join(',')}]. Caddy will proxy to ${manifest.port} which may 502.`,
				)
			}
		} catch (error) {
			this.logger.error(`Phase 286 (SC6): port-match check failed for ${appId}`, error)
		}

		// Register subdomain in Caddy for reverse proxy.
		// Phase 286 (SC6): retry on transient Caddy/Redis failures and SURFACE a
		// final failure loudly. Previously a single regen failure silently dropped
		// the Caddy block → the subdomain 404'd even though the container was healthy.
		try {
			const builtinApp = getBuiltinApp(appId)
			const subdomain = builtinApp?.installOptions?.subdomain || (manifest as any).subdomain
			const fullHost = provisioned ? hostFromUrl(provisioned.url) : undefined
			await pRetry(() => this.registerAppSubdomain(appId, manifest.port, subdomain, fullHost), {
				retries: 3,
				onFailedAttempt: (error) => {
					this.logger.error(
						`Attempt ${error.attemptNumber} registering subdomain for ${appId} failed. ${error.retriesLeft} retries left.`,
						error,
					)
				},
			})
		} catch (error) {
			// Final failure after retries — surface loudly. The container is up but
			// unreachable via its subdomain until Caddy is rebuilt; do NOT pretend it
			// succeeded. Still don't hard-fail the install (the data + container are
			// intact; a later restart's boot regen / reapply can recover the block).
			// NOTE: do NOT call reportInstallEvent here — its signature is
			// (appId, action: 'install'|'uninstall'); a new event value would be a
			// tsc type error (breaks the 305 baseline). The loud logger.error below is
			// sufficient operator visibility for SC6.
			this.logger.error(
				`Phase 286 (SC6): subdomain registration FAILED for ${appId} after retries — app is installed but may 404 via its subdomain until Caddy is rebuilt.`,
				error,
			)
		}

		// Report install event to platform (fire-and-forget)
		this.reportInstallEvent(appId, 'install').catch(() => {})

		return true
	}

	/**
	 * Auto-heal an already-installed app: re-runs broker injection if the manifest
	 * declares `requiresAiProvider: true` (catches pre-fix installs that were
	 * created before Phase 43.2 added single-user inject) and re-registers the
	 * Caddy subdomain with the canonical port from the builtin manifest (catches
	 * stale Redis subdomain entries pointing at the wrong port).
	 *
	 * Called from the install mutation's already-installed admin branch so a
	 * second click on "Install" effectively re-runs the post-install config
	 * steps without uninstalling the app.
	 */
	async reapplyAppConfig(appId: string): Promise<void> {
		const appDataDirectory = `${this.#livinityd.dataDirectory}/app-data/${appId}`
		const composeFile = `${appDataDirectory}/docker-compose.yml`
		const manifestFile = `${appDataDirectory}/livinity-app.yml`

		if (!(await fse.pathExists(composeFile))) {
			this.logger.log(`reapplyAppConfig: ${appId} not on disk, skipping`)
			return
		}

		// Load the on-disk manifest; fall back to BUILTIN_APPS for fields the
		// store manifest may omit (port, requiresAiProvider, installOptions.subdomain).
		let manifest: AppManifest | undefined
		try {
			manifest = await readManifestInDirectory(appDataDirectory)
		} catch {}
		const builtinApp = getBuiltinApp(appId)
		const requiresAiProvider =
			manifest?.requiresAiProvider ?? builtinApp?.requiresAiProvider ?? false
		const requiresLocalAiClis =
			manifest?.requiresLocalAiClis ?? (builtinApp as any)?.requiresLocalAiClis ?? false
		const port = manifest?.port ?? builtinApp?.port
		const subdomain =
			builtinApp?.installOptions?.subdomain ?? (manifest as any)?.subdomain

		// Re-inject broker config when needed (idempotent — inject-ai-provider
		// overwrites existing broker keys).
		if (requiresAiProvider) {
			try {
				const composeContent = await fse.readFile(composeFile, 'utf8')
				const yaml = (await import('js-yaml')).default
				const composeData = yaml.load(composeContent)
				const adminUser = await getAdminUser().catch(() => null)
				const userId = adminUser?.id || 'default'
				injectAiProviderConfig(composeData, userId, manifest ?? (builtinApp as any) ?? {requiresAiProvider: true})
				await fse.writeFile(composeFile, yaml.dump(composeData))
				this.logger.log(`reapplyAppConfig: re-injected broker config for ${appId} (userId=${userId})`)
				// Recreate container so new env reaches the process.
				// Phase 286: reconcile volume ownership before recreate.
				try {
					await reconcileAppVolumeOwnership(this.getApp(appId), {projectName: appId})
				} catch (error) {
					this.logger.error(`[reconcile] reapply (broker) failed for ${appId}`, error)
				}
				try {
					await $({cwd: appDataDirectory})`docker compose up -d --force-recreate`
					this.logger.log(`reapplyAppConfig: recreated container for ${appId}`)
				} catch (error) {
					this.logger.error(`reapplyAppConfig: failed to recreate container for ${appId}`, error)
				}
			} catch (error) {
				this.logger.error(`reapplyAppConfig: failed to re-inject broker for ${appId}`, error)
			}
		}

		// Re-mount host AI CLIs (no broker) for apps that opt in. Idempotent —
		// injectLocalAiClisConfig de-dupes volume strings + the PATH prefix.
		// LIVOS-001: creds are NOT mounted; the cred-egress proxy serves them.
		if (requiresLocalAiClis) {
			try {
				// LIVOS-001 / SC4: ensure the cred-egress proxy is up before the
				// recreated container starts. Idempotent; best-effort.
				await startCredEgressProxyIfNeeded(this.logger)
				const detected = await detectHostAiClis()
				if (!detected) {
					this.logger.error(`reapplyAppConfig: no host AI CLIs detected for ${appId}; skipping re-mount`)
				} else {
					await writeLocalAiCliWrappers(appDataDirectory, detected)
					const composeContent = await fse.readFile(composeFile, 'utf8')
					const yaml = (await import('js-yaml')).default
					const composeData = yaml.load(composeContent)
					injectLocalAiClisConfig(composeData, detected, appDataDirectory, {requiresLocalAiClis: true})
					await fse.writeFile(composeFile, yaml.dump(composeData))
					// Phase 286: reconcile volume ownership before recreate.
					try {
						await reconcileAppVolumeOwnership(this.getApp(appId), {projectName: appId})
					} catch (error) {
						this.logger.error(`[reconcile] reapply (local-ai) failed for ${appId}`, error)
					}
					try {
						await $({cwd: appDataDirectory})`docker compose up -d --force-recreate`
						this.logger.log(`reapplyAppConfig: re-mounted host AI CLIs + recreated container for ${appId}`)
					} catch (error) {
						this.logger.error(`reapplyAppConfig: failed to recreate container for ${appId}`, error)
					}
					await grantContainerCredsAcl(appDataDirectory, detected, this.logger)
				}
			} catch (error) {
				this.logger.error(`reapplyAppConfig: failed to re-mount host CLIs for ${appId}`, error)
			}
		}

		// Re-register subdomain with canonical port. registerAppSubdomain
		// overwrites any existing entry with the same appId, so this fixes
		// stale Caddy routes pointing at the wrong port (e.g., MiroFish
		// subdomain pointing at the broker's :8080 instead of MiroFish :3000).
		if (port) {
			try {
				await this.registerAppSubdomain(appId, port, subdomain)
			} catch (error) {
				this.logger.error(`reapplyAppConfig: failed to re-register subdomain for ${appId}`, error)
			}
		}
	}

	async uninstall(appId: string) {
		// If we can't read an app's dependencies for any reason just skip that app, don't abort the uninstall
		const allDependencies = await Promise.all(this.instances.map((app) => app.getDependencies().catch(() => null)))
		const isDependency = allDependencies.some((dependencies) => dependencies?.includes(appId))
		if (isDependency) throw new Error(`App ${appId} is a dependency of another app and cannot be uninstalled`)

		const app = this.getApp(appId)

		// 256-02 SC4b: revoke this app's per-app metered virtual key (if any) so
		// the key stops authenticating the moment the app is removed. Independent
		// per app — never touches another app's key. Best-effort.
		try {
			const meteredKeyId = (await app.store.get('meteredKeyId').catch(() => null)) as
				| string
				| null
				| undefined
			if (meteredKeyId) {
				await revokeMeteredKeyForApp({keyId: meteredKeyId}, this.#brokerClient())
				this.logger.log(`256-02 SC4b: revoked per-app metered key for ${appId} (keyId=${meteredKeyId})`)
			}
		} catch (error) {
			this.logger.error(`256-02 SC4b: failed to revoke metered key for ${appId}`, error)
		}

		// Phase 140 plan 140-08 — deprovision the CF DNS + Tunnel ingress
		// subdomain BEFORE tearing down the container. We do it first so the
		// Server5 DB lookup (slug -> dns_record_id / ingress_rule_id) still
		// resolves. Best-effort: helper swallows errors and returns void, so
		// the local uninstall always proceeds even if Server5 is unreachable.
		await this.deprovisionAppSubdomain(appId)

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
				port: data.port || data.manifest?.port || 8080,
				description: data.description || '',
				website: data.website || '',
				developer: data.developer || '',
				support: data.website || '',
				gallery: [],
				// Carry the catalog icon_url into the installed-app manifest so the
				// desktop tile renders it. The UI (apps.list / app-icon.tsx) reads
				// manifest `icon`; without this, platform-API apps fell back to the
				// livinity-apps-gallery icon path, which 404s for apps not in that
				// gallery (e.g. MCP-published store apps) → blank icon.
				icon: data.icon_url || data.icon || undefined,
				// Carry the broker / local-CLI opt-in flags from the catalog so the
				// installer's inject steps fire for platform-API apps (the manifest
				// is rebuilt here from the API response, so flags must be threaded
				// through explicitly or they'd be lost). Read top-level first, then
				// the nested manifest blob.
				requiresAiProvider: data.requiresAiProvider ?? data.manifest?.requiresAiProvider ?? undefined,
				requiresLocalAiClis: data.requiresLocalAiClis ?? data.manifest?.requiresLocalAiClis ?? undefined,
				// Phase 262-05 (LIVOS-057): the platform path threaded
				// requiresLocalAiClis but DROPPED neverPublic — a platform app whose
				// ONLY forbidden signal is neverPublic could be made public against
				// author intent. Thread it the same way.
				neverPublic: data.neverPublic ?? data.manifest?.neverPublic ?? undefined,
			}

			const yaml = (await import('js-yaml')).default
			await fse.writeFile(path.join(tmpDir, 'livinity-app.yml'), yaml.dump(manifest, {lineWidth: -1, noRefs: true}))

			return tmpDir
		} catch (error) {
			this.logger.error(`Failed to fetch platform template for ${appId}`, error)
			return null
		}
	}

	/**
	 * Phase 262-02 (LIVOS-042) — fetch the TRUSTED catalog manifest for a v37
	 * install by appId. Privileged install methods (native apt/deb/apt-repo/
	 * appimage/script) must NEVER trust a client-supplied manifest; routes.ts
	 * installV37 discards the client `manifest` for section==='native' and
	 * re-fetches it here — same endpoint + X-Api-Key plumbing as
	 * fetchPlatformTemplate above. Fails closed: returns null on missing api
	 * key, fetch failure, no row, or a row without a manifest jsonb.
	 */
	async fetchPlatformAppManifest(appId: string): Promise<Record<string, unknown> | null> {
		try {
			const apiKey = await this.#livinityd.ai.redis.get(REDIS_PLATFORM_API_KEY)
			if (!apiKey) return null

			const response = await fetch(`https://livinity.io/api/apps/${encodeURIComponent(appId)}`, {
				headers: {'X-Api-Key': apiKey},
			})
			if (!response.ok) return null

			const data = (await response.json()) as any
			if (!data || typeof data !== 'object') return null
			// The catalog row carries the section-specific manifest as a jsonb blob
			// (same `data.manifest` the platform install path above consumes).
			if (!data.manifest || typeof data.manifest !== 'object') return null
			return data.manifest as Record<string, unknown>
		} catch (error) {
			this.logger.error(`Failed to fetch platform manifest for ${appId}`, error)
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

	// ─── Phase 140 plan 140-08 — CF-for-SaaS subdomain provisioning ──
	// Calls Server5's POST/DELETE /api/me/app-subdomain endpoints (shipped in
	// 140-05) so that installing/uninstalling an app on the home LivOS box
	// triggers Cloudflare DNS + Tunnel ingress creation/removal at the edge.
	//
	// Both calls are best-effort: on failure (Server5 unreachable, missing
	// api-key, missing platform url, network error) we log + continue. The
	// existing install/uninstall flow must succeed without these calls for
	// local-lan users and air-gapped deployments.
	//
	// Deviation (Rule 3): plan 140-08 prescribed a new `server5-client.ts`
	// abstraction. Skipped — two helpers reusing the same Redis-keyed fetch
	// pattern as reportInstallEvent above is enough; introducing a class
	// wrapper for two HTTP calls is over-engineering. Sacred SHA
	// f3538e1d811992b782a9bb057d1b7f0a0189f95f preserved.

	/**
	 * Provision a Cloudflare subdomain for an installed app via Server5.
	 * Returns the assigned subdomain + URL on success, null on any failure
	 * (best-effort — caller MUST tolerate null and continue install).
	 */
	private async provisionAppSubdomain(
		appId: string,
		port: number,
	): Promise<{subdomain: string; url: string; ready?: boolean; readyAt?: number} | null> {
		try {
			const apiKey = await this.#livinityd.ai.redis.get(REDIS_PLATFORM_API_KEY)
			if (!apiKey) {
				this.logger.log(`Skipping CF subdomain provisioning for ${appId}: no api-key`)
				return null
			}

			const response = await fetch(`${LIVINITY_PLATFORM_URL.replace(/\/$/, '')}/api/me/app-subdomain`, {
				method: 'POST',
				headers: {'Content-Type': 'application/json', 'X-Api-Key': apiKey},
				body: JSON.stringify({app_slug: appId, port}),
			})
			if (!response.ok) {
				const text = await response.text().catch(() => '')
				this.logger.error(`CF subdomain provisioning failed for ${appId}: ${response.status} ${text}`)
				return null
			}

			// Phase 287: also capture the Tier-1 platform-DoH readiness signal the
			// Vercel route now returns (Plan 01). `ready` is advisory — absent/false
			// just means the box must rely on the Tier-2 box-resolver re-poll (or the
			// UI's client probe). Never required: malformed/missing → undefined.
			const data = (await response.json()) as {
				subdomain?: string
				url?: string
				ready?: boolean
				readyAt?: number
			}
			if (!data.subdomain || !data.url) {
				this.logger.error(`CF subdomain provisioning returned malformed response for ${appId}`)
				return null
			}
			this.logger.log(`Provisioned CF subdomain ${data.subdomain} for ${appId} -> ${data.url}`)
			return {subdomain: data.subdomain, url: data.url, ready: data.ready, readyAt: data.readyAt}
		} catch (error) {
			this.logger.error(`Failed to provision CF subdomain for ${appId}`, error)
			return null
		}
	}

	/**
	 * Deprovision a previously-provisioned CF subdomain. Best-effort: errors
	 * are logged and swallowed so the local uninstall always proceeds.
	 */
	private async deprovisionAppSubdomain(appId: string): Promise<void> {
		try {
			const apiKey = await this.#livinityd.ai.redis.get(REDIS_PLATFORM_API_KEY)
			if (!apiKey) {
				this.logger.log(`Skipping CF subdomain deprovisioning for ${appId}: no api-key`)
				return
			}

			const response = await fetch(
				`${LIVINITY_PLATFORM_URL.replace(/\/$/, '')}/api/me/app-subdomain/${encodeURIComponent(appId)}`,
				{
					method: 'DELETE',
					headers: {'X-Api-Key': apiKey},
				},
			)
			if (response.ok) {
				this.logger.log(`Deprovisioned CF subdomain for ${appId}`)
			} else {
				const text = await response.text().catch(() => '')
				this.logger.error(`CF subdomain deprovisioning failed for ${appId}: ${response.status} ${text}`)
			}
		} catch (error) {
			this.logger.error(`Failed to deprovision CF subdomain for ${appId}`, error)
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
			return {
				subdomain: app.subdomain,
				port: app.proxyPort,
				streaming: app.id === 'desktop-stream',
			}
		})

		// Phase 134+ — detect CF Tunnel mode so every Caddyfile block emits the
		// `http://` prefix and dodges the auto-HTTPS-redirect loop with cloudflared.
		// Phase 140-08.2 (2026-05-17): `getTunnelStatus()` only reports on the
		// LEGACY Server5 RELAY tunnel — Phase 134 cloudflared transport doesn't
		// run that tunnel, so isTunnel kept falling through to false → every
		// host block was emitted without `http://` → CF Tunnel 308 loop.
		// Phase 142-02 (2026-05-17): the user-facing name `hybrid` was renamed
		// → `portal`. We accept ALL THREE values here (`portal` for new
		// installs; `hybrid`/`tunnel` for already-deployed boxes that haven't
		// re-run install.sh yet) so re-deploys never break.
		const tunnelStatus = await getTunnelStatus().catch(() => null)
		const relayTunnelRunning = Boolean(tunnelStatus?.running)
		const localMode = await this.#livinityd.ai.redis.get('livos:domain:local_mode')
		const cfTunnelMode = localMode === 'portal' || localMode === 'hybrid' || localMode === 'tunnel'
		// Phase 218 follow-up — cloudflared.service is the canonical truth
		// when the Redis seed isn't present (pre-Phase-142-02 boxes).
		const cloudflaredRunning = await isCloudflaredActive().catch(() => false)
		const isTunnel = relayTunnelRunning || cfTunnelMode || cloudflaredRunning
		const content = generateFullCaddyfile(caddyConfig, isMultiUser, isTunnel, nativeAppSubdomains)
		await writeCaddyfile(content)
		await reloadCaddy()
	}

	/**
	 * Phase 218 T1/T5 — DB+Redis-state-derived Caddy regen. Used by per-user
	 * install/uninstall flows (installForUser, uninstallForUser) and the
	 * boot-time orphan reconciler so the Caddyfile reflects every running
	 * `user_app_instances` row plus any single-user-shape `livos:domain:subdomains`
	 * entries that registerAppSubdomain wrote.
	 *
	 * Merge rules:
	 *   - State-derived per-user blocks come first (multi-user installs).
	 *   - Redis-Stored subdomains are appended unless their host would
	 *     collide with a state-derived host (defense in depth — shouldn't
	 *     happen in practice but a single-→multi-user mid-flight migration
	 *     could cause it).
	 *
	 * Non-fatal: any failure logs an error but does NOT throw. Callers
	 * (post-install hooks, boot regen) must not abort their own flow if
	 * Caddy is unavailable.
	 */
	/**
	 * 256-02 SC4b: a BrokerClient backed by the livinityd pg pool, writing to
	 * `plugin_livinity_broker.api_keys` (the same table the livinity-broker
	 * plugin owns). Mints/revokes per-app metered virtual keys for UNVERIFIED
	 * apps. Mirrors the plugin createKey/deleteKey SQL so the key authenticates
	 * + revokes identically. Throws if pg is unavailable (the caller surfaces
	 * the failure — we must NOT silently lend the operator OAuth instead).
	 */
	#brokerClient(): BrokerClient {
		return {
			createKey: async (opts) => {
				const pool = getPool()
				if (!pool) throw new Error('brokerClient: no pg pool — cannot mint a metered key')
				const {randomBytes, randomUUID, createHash} = await import('node:crypto')
				const plaintext = 'lvb_' + randomBytes(24).toString('base64url')
				const salt = randomBytes(8).toString('hex')
				const hash = createHash('sha256').update(salt + ':' + plaintext).digest('hex')
				const id = randomUUID()
				const prefix = plaintext.slice(0, 10)
				await pool.query(
					`INSERT INTO plugin_livinity_broker.api_keys
					   (id, user_id, name, prefix, hash, salt, revoked, scope, created_at)
					 VALUES ($1, $2, $3, $4, $5, $6, false, $7, NOW())`,
					[id, opts.userId, opts.name, prefix, hash, salt, JSON.stringify({budget: opts.budget ?? null, modelAllowlist: opts.modelAllowlist ?? null})],
				)
				return {id, plaintext, prefix}
			},
			deleteKey: async (keyId) => {
				const pool = getPool()
				if (!pool) return
				await pool.query(
					'UPDATE plugin_livinity_broker.api_keys SET revoked = true WHERE id = $1',
					[keyId],
				)
			},
		}
	}

	private async rebuildCaddyFromState(): Promise<void> {
		try {
			const pool = getPool()
			const stateConfig = await buildCaddyConfigFromState({
				getInstances: async (): Promise<CaddyStateInstance[]> => {
					if (!pool) return []
					const {rows} = await pool.query(
						`SELECT i.user_id, u.username, i.app_id, i.port, i.status
						 FROM user_app_instances i
						 JOIN users u ON i.user_id = u.id`,
					)
					return rows.map((r: any) => ({
						userId: r.user_id,
						username: r.username,
						appSlug: r.app_id,
						port: r.port,
						status: r.status,
					}))
				},
				getSubdomains: async (): Promise<CaddyStateSubdomain[]> => {
					if (!pool) return []
					const {rows} = await pool.query(
						`SELECT user_id, app_slug, subdomain FROM user_app_subdomains`,
					)
					return rows.map((r: any) => ({
						userId: r.user_id,
						appSlug: r.app_slug,
						subdomain: r.subdomain,
					}))
				},
				getMainDomain: async () => {
					const config = await this.getDomainConfig()
					return config?.active ? config.domain : null
				},
			})

			// Merge with existing Redis-stored single-user subdomains.
			const redisSubs = await this.getSubdomains()
			const stateHosts = new Set(
				stateConfig.subdomains
					.map((s) => s.host?.toLowerCase())
					.filter((h): h is string => Boolean(h)),
			)
			const merged: SubdomainConfig[] = [...stateConfig.subdomains]
			for (const r of redisSubs) {
				if (!r.enabled) continue
				const candidateHost = (r.host ?? (stateConfig.mainDomain ? `${r.subdomain}.${stateConfig.mainDomain}` : '')).toLowerCase()
				if (candidateHost && stateHosts.has(candidateHost)) continue
				merged.push(r)
			}

			// Phase 258 HOTFIX — re-derive publicAccess FRESH for EVERY emitted sub,
			// keyed by appId, regardless of which source it came from. This MUST run
			// over the merged list (not just the Redis subs) because:
			//   1. DB-state subs (buildCaddyConfigFromState, from user_app_instances)
			//      NEVER carry publicAccess — and a single-user app can live there via
			//      the Phase 218 orphan reconciliation (the n8n symptom: n8n is a
			//      user_app_instances row, so it took the DB-state path and shadowed the
			//      Redis sub in the merge above, dropping the operator's setting).
			//   2. The cached SubdomainConfig.publicAccess on Redis subs is only
			//      re-threaded by a registerAppSubdomain call, so a plain restart (which
			//      runs this regen, not registerAppSubdomain) would keep the STALE shape.
			// The live operator setting lives in livos:apps:public-access:<appId>;
			// resolve it here so a restart reflects it. Read the daemon bearer fresh for
			// the forbidden re-assert (DB-state subs carry none) — isPublicForbidden is
			// re-asserted on EVERY emit (fail-closed), so a now-forbidden app loses any
			// stale public block at restart, not only at the next install.
			const resolvedSubs: SubdomainConfig[] = await Promise.all(
				merged.map(async (s) => {
					const bearer = s.upstreamBearer ?? (await this.readAppDaemonToken(s.appId))
					const publicAccess = await this.computeEffectivePublicAccess(s.appId, bearer)
					const {publicAccess: _stale, ...rest} = s
					return publicAccess ? {...rest, publicAccess} : rest
				}),
			)

			const caddyConfig: CaddyConfig = {
				mainDomain: stateConfig.mainDomain,
				subdomains: resolvedSubs,
			}

			const multiUserEnabled = await this.#livinityd.ai.redis.get('livos:system:multi_user')
			const isMultiUser = multiUserEnabled === 'true'

			const nativeAppSubdomains = this.nativeInstances.map((app) => ({
				subdomain: app.subdomain,
				port: app.proxyPort,
				streaming: app.id === 'desktop-stream',
			}))

			// Phase 134+ tunnel detection — mirrors rebuildCaddy() plus Phase 218
			// follow-up: also probe cloudflared.service. Without the probe a box
			// that was provisioned via `install.sh --mode tunnel` BEFORE the
			// `livos:domain:local_mode` Redis seed landed (Phase 142-02) emits
			// the apex block without the `http://` prefix → Caddy auto-HTTPS-
			// redirect loop with the CF tunnel (Mini PC dogfood 2026-05-26).
			const tunnelStatus = await getTunnelStatus().catch(() => null)
			const relayTunnelRunning = Boolean(tunnelStatus?.running)
			const localMode = await this.#livinityd.ai.redis.get('livos:domain:local_mode')
			const cfTunnelMode = localMode === 'portal' || localMode === 'hybrid' || localMode === 'tunnel'
			const cloudflaredRunning = await isCloudflaredActive().catch(() => false)
			const isTunnel = relayTunnelRunning || cfTunnelMode || cloudflaredRunning

			const content = generateFullCaddyfile(caddyConfig, isMultiUser, isTunnel, nativeAppSubdomains)
			await writeCaddyfile(content)
			await reloadCaddy()
			this.logger.log(`[caddy] regenerated from state: ${caddyConfig.subdomains.length} subdomain blocks`)
		} catch (err) {
			this.logger.error('[caddy] rebuildCaddyFromState failed (non-fatal)', err)
		}
	}

	/**
	 * Phase 218 T4 — backfill orphan Docker containers into user_app_instances.
	 *
	 * Operator's box (2026-05-26) had bolt-diy and immich containers running
	 * from a pre-multi-user install path that didn't write to the
	 * user_app_instances table, so the admin UI couldn't see them AND the
	 * Caddyfile regen (T1/T5) couldn't emit blocks for them. This method
	 * walks `docker ps`, matches container names against the two known
	 * install shapes (single-user `<slug>_<service>_<N>` and multi-user
	 * `<slug>_<service>_user_<username>_<N>`), and INSERTs missing rows.
	 *
	 * Attribution: single-user-shape orphans are attributed to the admin
	 * user (the only user that existed pre-multi-user). Multi-user-shape
	 * orphans resolve username → user lookup.
	 *
	 * Idempotent: re-runs are safe (ON CONFLICT (user_id, app_id) DO NOTHING).
	 * Non-fatal: any failure logs and continues to the next container.
	 */
	private async reconcileOrphanInstances(): Promise<void> {
		try {
			const pool = getPool()
			if (!pool) {
				this.logger.log('[recon] database pool unavailable, skipping orphan reconciliation')
				return
			}

			const admin = await getAdminUser()
			if (!admin) {
				this.logger.log('[recon] no admin user, skipping orphan reconciliation')
				return
			}

			let containerNames: string[]
			try {
				const result = await $`docker ps --format {{.Names}}`
				containerNames = result.stdout.split('\n').filter(Boolean)
			} catch (err) {
				this.logger.error('[recon] docker ps failed, skipping orphan reconciliation', err)
				return
			}

			// System / livinityd-managed containers we should never reconcile.
			const SYSTEM_PATTERNS = [
				/^caddy/i,
				/^livinityd/i,
				/^liv-core/i,
				/^liv-worker/i,
				/^liv-memory/i,
				/^liv-mcp/i,
				/^postgres/i,
				/^redis/i,
				/_run_/, // ephemeral docker compose run containers
			]

			let inserted = 0
			let skipped = 0

			for (const name of containerNames) {
				if (SYSTEM_PATTERNS.some((re) => re.test(name))) continue

				// Multi-user shape: <appSlug>_<service>_user_<username>_<N>
				let appSlug: string | null = null
				let userId: string | null = null
				let username: string | null = null

				const muMatch = name.match(/^(.+?)_(?:.+?)_user_(.+?)_(\d+)$/)
				if (muMatch) {
					appSlug = muMatch[1]
					const candidateUsername = muMatch[2]
					const user = await findUserByUsername(candidateUsername).catch(() => null)
					if (!user) {
						skipped++
						continue
					}
					userId = user.id
					username = user.username
				} else {
					// Single-user shape: <appSlug>_<service>_<N>
					const suMatch = name.match(/^([a-z0-9][a-z0-9-]*)_([a-z0-9][a-z0-9-]*)_(\d+)$/i)
					if (!suMatch) {
						skipped++
						continue
					}
					appSlug = suMatch[1]
					userId = admin.id
					username = admin.username
				}

				// Already reconciled?
				const {rows: existing} = await pool.query(
					`SELECT 1 FROM user_app_instances WHERE container_name = $1 OR (user_id = $2 AND app_id = $3) LIMIT 1`,
					[name, userId, appSlug],
				)
				if (existing.length > 0) {
					skipped++
					continue
				}

				// Resolve host port via `docker port <name>`.
				// Output lines look like: `8080/tcp -> 127.0.0.1:10001`.
				let port = 0
				try {
					const portResult = await $`docker port ${name}`
					for (const line of portResult.stdout.split('\n')) {
						const m = line.match(/->\s*[^:]+:(\d+)/)
						if (m) {
							port = parseInt(m[1], 10)
							break
						}
					}
				} catch {
					skipped++
					continue
				}
				if (!port) {
					skipped++
					continue
				}

				try {
					await pool.query(
						`INSERT INTO user_app_instances
							(user_id, app_id, subdomain, container_name, port, volume_path, status)
						 VALUES ($1, $2, $3, $4, $5, $6, 'running')
						 ON CONFLICT (user_id, app_id) DO NOTHING`,
						// subdomain = appSlug (short slug only). UI's appToUrl()
						// adds the `-<userPart>.livinity.io` suffix from
						// location.hostname; storing pre-suffixed values here
						// double-suffixes the rendered link (operator saw
						// `n8n-bruce-oz-bruce.livinity.io` on 2026-05-26 UAT).
						[userId, appSlug, appSlug, name, port, '/opt/livos/data/orphan-reconciled'],
					)
					this.logger.log(`[recon] inserted user_app_instances for orphan ${name} (user=${username}, app=${appSlug}, port=${port})`)
					inserted++
				} catch (err) {
					this.logger.error(`[recon] failed to insert orphan ${name}`, err)
					skipped++
				}
			}

			this.logger.log(`[recon] orphan reconciliation complete: ${inserted} inserted, ${skipped} skipped`)
		} catch (err) {
			this.logger.error('[recon] reconcileOrphanInstances failed (non-fatal)', err)
		}
	}

	/**
	 * Phase 141-05 — public wrappers around the private CF provisioning
	 * helpers, so the domain.routes.ts tRPC layer can drive Server5
	 * deprovision+provision on subdomain rename. The "appId" param name in the
	 * underlying helpers is misleading — it's used verbatim as the CF slug
	 * sent to Server5, NOT the LivOS internal app identifier. These wrappers
	 * pass the SLUG explicitly to make the intent clear at call sites.
	 */
	async cfProvisionSubdomain(slug: string, port: number): Promise<{subdomain: string; url: string} | null> {
		return this.provisionAppSubdomain(slug, port)
	}
	async cfDeprovisionSubdomain(slug: string): Promise<void> {
		return this.deprovisionAppSubdomain(slug)
	}

	/**
	 * Register a subdomain for an app in Caddy.
	 * Called automatically after app installation.
	 *
	 * Phase 141-03: optional `fullHost` carries the Phase 140 canonical FQDN
	 * minted by Server5 (e.g. `n8n-socinity.livinity.io`). When set, the Caddy
	 * emitter + UI use it directly. Absent → legacy `${subdomain}.${mainDomain}`
	 * compute path. Always lowercased.
	 */
	/**
	 * Read an app's daemon API token from its installed docker-compose.yml so
	 * the gated Caddy block can inject it as an upstream `Authorization: Bearer`
	 * header (see SubdomainConfig.upstreamBearer). Looks at the first service's
	 * environment (map or array form) for a known daemon-token var. Returns the
	 * literal non-empty value, or undefined when absent / still a `${VAR}`
	 * placeholder (nothing to inject). Best-effort: never throws.
	 */
	private async readAppDaemonToken(appId: string): Promise<string | undefined> {
		// Extend this list as more agent-native apps ship bundled web UIs that
		// gate their own daemon with a single bearer token.
		const DAEMON_TOKEN_ENV_VARS = ['OD_API_TOKEN']
		try {
			const composeFile = `${this.#livinityd.dataDirectory}/app-data/${appId}/docker-compose.yml`
			if (!(await fse.pathExists(composeFile))) return undefined
			const yaml = (await import('js-yaml')).default
			const compose = yaml.load(await fse.readFile(composeFile, 'utf8')) as any
			const services = compose?.services
			if (!services || typeof services !== 'object') return undefined
			const service = services[Object.keys(services)[0]]
			if (!service) return undefined
			const env = service.environment
			const readVar = (name: string): string | undefined => {
				let raw: string | undefined
				if (Array.isArray(env)) {
					const hit = env.find((e: unknown) => typeof e === 'string' && e.startsWith(`${name}=`)) as string | undefined
					raw = hit?.slice(name.length + 1)
				} else if (env && typeof env === 'object') {
					raw = env[name] != null ? String(env[name]) : undefined
				}
				if (!raw) return undefined
				let trimmed = raw.trim()
				// The on-disk compose keeps Docker's `${VAR:-default}` form (rsynced
				// verbatim). Resolve to the literal default — that's exactly what
				// Docker passes the container when VAR is unset, so Caddy injects a
				// matching token. A bare `${VAR}` (no default) has no materialised
				// value to inject → skip.
				const interp = /^\$\{[^:}]+:-(.*)\}$/.exec(trimmed)
				if (interp) trimmed = interp[1].trim()
				else if (trimmed.includes('${')) return undefined
				if (trimmed.length === 0) return undefined
				return trimmed
			}
			for (const name of DAEMON_TOKEN_ENV_VARS) {
				const v = readVar(name)
				if (v) return v
			}
			return undefined
		} catch (error) {
			this.logger.error(`readAppDaemonToken: failed for ${appId}`, error)
			return undefined
		}
	}

	// ─── Phase 258 WS-C (258-03) — public-access persistence + re-assert ─────

	/**
	 * Read the per-install public-access operator setting for an app from Redis
	 * (the SubdomainConfig-adjacent sibling key). Returns undefined when the
	 * operator never opted in (→ default private / mode 'none'). Best-effort:
	 * never throws — a parse/read error fails CLOSED to undefined (private).
	 */
	async getPublicAccessSetting(appId: string): Promise<PublicAccessInstallSetting | undefined> {
		try {
			const raw = await this.#livinityd.ai.redis.get(`${REDIS_PUBLIC_ACCESS_PREFIX}${appId}`)
			if (!raw) return undefined
			return JSON.parse(raw) as PublicAccessInstallSetting
		} catch (error) {
			this.logger.error(`getPublicAccessSetting: failed for ${appId}`, error)
			return undefined
		}
	}

	/**
	 * Persist the per-install public-access operator setting (the runtime toggle
	 * 258-03's setPublicAccess mutation writes BEFORE re-registering the subdomain).
	 * Stored as-is; the fail-closed re-assert in computeEffectivePublicAccess is
	 * what guarantees a forbidden app can never emit a public block even if a stale
	 * non-'none' value lands here.
	 */
	async setPublicAccessSetting(appId: string, setting: PublicAccessInstallSetting): Promise<void> {
		await this.#livinityd.ai.redis.set(`${REDIS_PUBLIC_ACCESS_PREFIX}${appId}`, JSON.stringify(setting))
	}

	/**
	 * Build the PublicForbiddenSignals for an app from its manifest + parsed
	 * compose + the (already-read) daemon bearer.
	 *
	 * WHICH COMPOSE (NOTE-2): we read the app's on-disk compose via
	 * `app.readCompose()`. That compose may have been SANITIZED at install
	 * (privileged/network_mode:host deleted, docker.sock rejected), so the compose
	 * signals here are DEFENSE-IN-DEPTH only. The LOAD-BEARING guarantee comes from
	 * manifest.neverPublic / manifest.requiresLocalAiClis / the daemon bearer —
	 * those are NOT stripped and are sufficient to protect the dangerous classes.
	 * Best-effort: a manifest/compose read failure yields a signal struct that
	 * still carries the load-bearing flags it could read (never fails open).
	 */
	async buildPublicForbiddenSignals(
		appId: string,
		upstreamBearer: string | undefined,
	): Promise<{signals: PublicForbiddenSignals; manifest: any}> {
		let manifest: any
		let compose: any
		try {
			const app = this.getApp(appId)
			manifest = await app.readManifest().catch(() => undefined)
			compose = await app.readCompose().catch(() => undefined)
		} catch {
			// getApp throws for an unregistered app — fall through with whatever we have.
		}
		// Phase 262-05 (LIVOS-057): OR the load-bearing flags with the builtin
		// catalog definition (mirroring the credential mount path at the
		// reapplyAppConfig getBuiltinApp OR) so a manifest-write regression on an
		// install path can never silently disable the public-forbidden guard for
		// a credentialed builtin.
		const builtinDef = getBuiltinApp(appId) as any
		const signals: PublicForbiddenSignals = {
			neverPublic: manifest?.neverPublic === true || builtinDef?.neverPublic === true,
			requiresLocalAiClis:
				manifest?.requiresLocalAiClis === true || builtinDef?.requiresLocalAiClis === true,
			hasDaemonBearer: !!upstreamBearer,
			compose,
		}
		return {signals, manifest}
	}

	/**
	 * Public read of an app's PublicForbiddenSignals + manifest for the
	 * setPublicAccess/getPublicAccess routes — reads the 256-04 daemon bearer
	 * itself so the route layer never needs the private readAppDaemonToken. The
	 * ONE forbidden-input builder both apps.ts (computeEffectivePublicAccess) and
	 * routes.ts (the 403 gate) feed into isPublicForbidden.
	 */
	async getPublicForbiddenSignals(appId: string): Promise<{signals: PublicForbiddenSignals; manifest: any}> {
		const upstreamBearer = await this.readAppDaemonToken(appId)
		return this.buildPublicForbiddenSignals(appId, upstreamBearer)
	}

	/**
	 * Compute the EFFECTIVE PublicAccessConfig for an app install — the value that
	 * rides on SubdomainConfig.publicAccess. Re-asserts isPublicForbidden on EVERY
	 * call (fail-closed against a stale/forged persisted setting, T-258C-03): a
	 * forbidden app returns undefined (private) regardless of the stored setting.
	 * Otherwise resolves the persisted operator setting; returns undefined when the
	 * resolved mode is 'none' so the emit stays the fully-gated 256-04 block (SC5).
	 */
	async computeEffectivePublicAccess(
		appId: string,
		upstreamBearer: string | undefined,
	): Promise<PublicAccessConfig | undefined> {
		try {
			const {signals, manifest} = await this.buildPublicForbiddenSignals(appId, upstreamBearer)
			const setting = await this.getPublicAccessSetting(appId)
			return effectivePublicAccess(signals, manifest, setting)
		} catch (error) {
			// Never fail open to public — any error → private.
			this.logger.error(`computeEffectivePublicAccess: failed for ${appId}`, error)
			return undefined
		}
	}

	async registerAppSubdomain(appId: string, port: number, subdomain?: string, fullHost?: string): Promise<void> {
		const domainConfig = await this.getDomainConfig()
		if (!domainConfig?.active) {
			this.logger.log(`No active domain configured, skipping subdomain registration for ${appId}`)
			return
		}

		const subdomains = await this.getSubdomains()

		// Use provided subdomain or default to appId
		const subdomainName = subdomain || appId

		// Agent-native apps (Open Design) bind their daemon to 0.0.0.0 inside the
		// container and require a token for non-loopback callers, but their web
		// UI calls /api WITHOUT a token (it expects a loopback bypass that never
		// fires through Docker's NAT). Read the daemon token from the app's
		// compose so the gated Caddy block can inject it as an upstream bearer —
		// authenticating the UI while the daemon stays loopback-bound + login-
		// gated. Persisted on the Redis SubdomainConfig so it survives regen.
		const upstreamBearer = await this.readAppDaemonToken(appId)

		// Phase 258 WS-C (258-03): resolve the persisted per-install public-access
		// setting → effective PublicAccessConfig, re-asserting isPublicForbidden so a
		// forbidden app (load-bearing: neverPublic/requiresLocalAiClis/daemon-bearer;
		// defense-in-depth: compose docker.sock/privileged/host-net) NEVER gets a
		// public block emitted even if a stale/forged setting exists (fail-closed,
		// T-258C-03). undefined → SubdomainConfig.publicAccess omitted → the
		// fully-gated 256-04 block is emitted exactly as today (default private, SC5).
		const publicAccess = await this.computeEffectivePublicAccess(appId, upstreamBearer)

		// Check if already exists
		const existingIdx = subdomains.findIndex((s) => s.appId === appId)
		const newSub: SubdomainConfig = {
			subdomain: subdomainName.toLowerCase(),
			appId,
			port,
			enabled: true,
			...(fullHost ? {host: fullHost.toLowerCase()} : {}),
			...(upstreamBearer ? {upstreamBearer} : {}),
			...(publicAccess ? {publicAccess} : {}),
		}

		if (existingIdx >= 0) {
			subdomains[existingIdx] = newSub
		} else {
			subdomains.push(newSub)
		}

		await this.setSubdomains(subdomains)
		// Phase 218 follow-up: use the state-derived regen so both single-user
		// Redis-tracked subdomains AND multi-user user_app_instances rows land
		// in the same Caddyfile. The legacy rebuildCaddy() only reads Redis,
		// so any single-user install (Linkwarden 2026-05-26 UAT) wiped the
		// multi-user app blocks that T1+T5 had emitted.
		await this.rebuildCaddyFromState()

		const displayHost = newSub.host ?? `${subdomainName}.${domainConfig.domain}`
		this.logger.log(`Registered subdomain ${displayHost} -> localhost:${port} for ${appId}`)
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
			// Phase 218 follow-up: use the state-derived regen so both single-user
		// Redis-tracked subdomains AND multi-user user_app_instances rows land
		// in the same Caddyfile. The legacy rebuildCaddy() only reads Redis,
		// so any single-user install (Linkwarden 2026-05-26 UAT) wiped the
		// multi-user app blocks that T1+T5 had emitted.
		await this.rebuildCaddyFromState()
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
		// Phase 218 follow-up: use the state-derived regen so both single-user
		// Redis-tracked subdomains AND multi-user user_app_instances rows land
		// in the same Caddyfile. The legacy rebuildCaddy() only reads Redis,
		// so any single-user install (Linkwarden 2026-05-26 UAT) wiped the
		// multi-user app blocks that T1+T5 had emitted.
		await this.rebuildCaddyFromState()
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

		// Template resolution chain (same as install()).
		// Phase 286 (SC5): catalog>builtin precedence — plain builtins prefer the
		// catalog def; allowlisted specials keep builtin precedence. Mirrors the
		// install() flip above (same fall-through semantics).
		let appTemplatePath: string
		let isGeneratedTemplate = false
		if (shouldPreferCatalog(appId)) {
			const platformTemplate = await this.fetchPlatformTemplate(appId)
			if (platformTemplate) {
				appTemplatePath = platformTemplate
				isGeneratedTemplate = true
			} else {
				const generatedPath = await generateAppTemplate(appId)
				if (generatedPath) {
					appTemplatePath = generatedPath
					isGeneratedTemplate = true
				} else {
					throw new Error(`App ${appId} not found: no platform compose and no builtin definition`)
				}
			}
		} else {
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
					throw new Error(`App ${appId} not found: no builtin definition and no platform compose`)
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

		// WS-C (256-03, LIVOS-007/013, SC5): this per-user path is ALWAYS
		// non-builtin marketplace compose templated for a user — sanitize it
		// (strip privileged/host-net/pid/userns/caps/unconfined, reject host-path
		// binds outside the user's own data subtree incl. docker.sock, /,
		// operator secrets, OTHER users' data). Run AFTER the volume-remap above
		// so the legacy `/data/storage`→`/users/<user>/home` rewrites have already
		// landed inside the user subtree; the allowlist root is the user's own
		// `${dataDirectory}/users/${username}` tree (covers both the app-data dir
		// and the remapped per-user /home + /data/storage mounts). The
		// CLI_MOUNT_PREFIX allowlist additionally preserves any WS-B inject mounts
		// (fix F). Runs BEFORE injectAiProviderConfig + `docker compose up -d`.
		// Reject propagates (install aborts).
		{
			const userSubtreeRoot = `${this.#livinityd.dataDirectory}/users/${user.username}`
			const {removed} = sanitizeNonBuiltinCompose(composeData, userSubtreeRoot)
			this.logger.log(`LIVOS-013: sanitized per-user non-builtin compose for ${appId} (user ${user.username}) removed=${removed.join(',') || '(none)'}`)
		}

		// Phase 43 (FR-MARKET-01, D-43-06/07): inject AI broker config when manifest opts in.
		// No-op when manifest.requiresAiProvider is absent or false.
		injectAiProviderConfig(composeData, userId, manifest)

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
			// Phase 286: reconcile per-user volume ownership before the up.
			await reconcileAppVolumeOwnership(
				{
					id: appId,
					dataDirectory: userDataDir,
					readCompose: async () =>
						(await import('js-yaml')).default.load(
							await fse.readFile(`${userDataDir}/docker-compose.yml`, 'utf8'),
						) as any,
					logger: this.logger,
				},
				{projectName: `${appId}-user-${user.username}`, appDataDir: userDataDir, rootDir: this.#livinityd.dataDirectory},
			).catch((error) => this.logger.error(`[reconcile] per-user install failed for ${appId}`, error))
			await $`docker compose --file ${userDataDir}/docker-compose.yml --project-name ${appId}-user-${user.username} up -d`
		} catch (error) {
			this.logger.error(`Failed to start per-user container for ${appId} (user: ${user.username})`, error)
			throw new Error(`Failed to start container: ${(error as Error).message}`)
		}

		// Record in database — `subdomain` stores the SHORT slug (just appId)
		// because the UI's `appToUrl()` helper (livos/packages/ui/src/utils/
		// misc.ts) computes `<subdomain>-<userPart>.livinity.io` itself, where
		// userPart comes from location.hostname. Storing a pre-suffixed value
		// here (`appId-username`) caused double-suffixing on Mini PC UAT
		// 2026-05-26 — operator saw `n8n-bruce-oz-bruce.livinity.io`. Fix:
		// keep the slug clean; the UI is the single source of suffix truth.
		await createUserAppInstance({
			userId,
			appId,
			subdomain: appId,
			containerName: `${appId}_${mainServiceName || 'app'}_user_${user.username}_1`,
			port,
			volumePath: userDataDir,
		})

		// Surface context (vault CLAUDE.md scaffolder) removed with AI Chat teardown.

		// Phase 218 T1 — regenerate Caddyfile so the new per-user subdomain
		// (e.g. bolt-diy-bruce.livinity.io) actually routes to the container
		// we just started. Without this, the install lands but the subdomain
		// falls through Caddy's catch-all to livinityd's LivOS UI — the
		// real-world dogfood bug operator reported 2026-05-26.
		await this.rebuildCaddyFromState()

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

		// Surface context cleanup removed with AI Chat teardown.

		// Phase 218 T1 — regenerate Caddyfile after the row is gone so the
		// dead subdomain stops 502'ing.
		await this.rebuildCaddyFromState()

		this.logger.log(`Uninstalled ${appId} for user ${user.username}`)
		return true
	}
}
