import {fileURLToPath} from 'node:url'
import {dirname, join} from 'node:path'
import os from 'node:os'
import path from 'node:path'
import {randomUUID} from 'node:crypto'

import fse from 'fs-extra'
import {$} from 'execa'
import pRetry from 'p-retry'
import semver from 'semver'

import randomToken from '../../modules/utilities/random-token.js'
import type Livinityd from '../../index.js'
import appEnvironment from './legacy-compat/app-environment.js'
import App, {readManifestInDirectory, resolveWantsGpu} from './app.js'
import type {OidcEnabledApp} from '../oidc/clients.js'
import {reconcileAppVolumeOwnership} from './reconcile-volume-ownership.js'
// Phase 344-02 (XFER-01) — the import engine primitives (prechecks / safe-extract /
// volume restore / rollback ledger). docker-free + mockable; consumed ONLY by the
// additive importAppBundle() tail below.
import {
	newLedger,
	restoreVolumes,
	rollback,
	runImportPrechecks,
	safeExtractBundle,
} from './app-bundle-import.js'
import type {BundleManifest} from './app-bundle-format.js'
import {getDiskUsageByPath} from '../system/system.js'
import {classifyInspect} from './health-poll.js'
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
import {sanitizeNonBuiltinCompose, ComposeRejected, assertFederatedComposeSafe} from './compose-sanitizer.js'
// Phase 341-02 (REPO-02) — federated install path (deployCustom mirror, no creds).
import {namespacedAppId, type AppStoreSource} from './app-store-sources.js'
import {fetchFederatedCatalog} from './federated-catalog.js'
import {
	decodeTunnelToken,
	discoverZoneId,
	parseCfApiTokenSecret,
	provisionAppSubdomainLocal,
	deprovisionAppSubdomainLocal,
	type LocalCfConfig,
} from './cf-local.js'
import {assertInstallAllowed, InstallForbidden} from './install-admin-gate.js'
import {assertKvmAvailable, assertVmResourcesSane} from './vm-preflight.js'
import {VM_APP_IDS, composeRequiresKvm, stripKvmDeviceFromCompose} from '../vm/vm-template.js'
import {effectivePublicAccess, isPublicForbidden, type PublicForbiddenSignals} from './public-forbidden.js'
import type {PublicAccessConfig, PublicAccessInstallSetting} from './public-access.js'
import {
	chooseCredentialPath,
	mintMeteredKeyForApp,
	revokeMeteredKeyForApp,
	type BrokerClient,
} from './metered-key.js'
import {applyCaddyConfig, generateFullCaddyfile, writeCaddyfile, reloadCaddy, MAX_DNS_PER_USER, countOwnedSubdomains, appIdOwner, type SubdomainConfig, type CaddyConfig} from '../domain/caddy.js'
// Phase 332 (WAF-01/02) — per-app protection config type + validation for the
// setAppProtection route + Caddy regen threading.
import {validateWafConfig, type AppWafConfig} from '../domain/waf.js'
// Phase 332 (WAF-01): the fail-soft fail2ban abuse-jail sink.
import {installAbuseJail, removeAbuseJail} from '../domain/waf-jail.js'
import {buildCaddyConfigFromState, type CaddyStateInstance, type CaddyStateSubdomain} from '../domain/caddy-state.js'
import {getTunnelStatus} from '../domain/tunnel.js'
import {verifyDns} from '../domain/dns-check.js'
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
// FREE tier (BYO domain + BYO Cloudflare) — Redis refs the install script writes
// (mode-tunnel.sh) when the operator supplies --cf-token. Their presence is the
// discriminator that routes DNS provisioning to the box-side local Cloudflare
// client (cf-local.ts) on the operator's OWN zone instead of the platform. A PRO
// box never has these → the platform path is unchanged (fall-through).
const REDIS_CF_API_TOKEN_REF = 'livos:domain:cf_api_token_secret_ref'
const REDIS_CF_TUNNEL_TOKEN_REF = 'livos:domain:cf_tunnel_token_secret_ref'
const REDIS_TUNNEL_DOMAIN = 'livos:domain:tunnel_domain'
const REDIS_CF_ZONE_ID = 'livos:domain:cf_zone_id'
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

// W2 (344-review): a free-space floor an import extraction must leave UNUSED. The absolute
// extraction hard-ceiling passed to safeExtractBundle is (available − this floor), so a
// bundle can never fill the data disk to 0 (leaving no room for docker/app runtime).
const IMPORT_SPACE_FLOOR_BYTES = 512 * 1024 * 1024

// W4 (344-review): local mirror of the (NON-exported) SUBDOMAIN_RE at domain/caddy.ts:94.
// A subdomain STRING replayed from an imported bundle (attacker-influenced meta/subdomain.json)
// MUST match this exact Caddy charset before it reaches registerAppSubdomain / is persisted
// as a SubdomainConfig — otherwise a crafted label could corrupt the generated Caddyfile.
// Keep in sync with caddy.ts:94.
const IMPORT_SUBDOMAIN_RE = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/

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

				// 343-01 RESIL-01 (B1): a daemon restart (routine on every box update) must NOT
				// collapse a 'debug' app back to 'ready' — app.start() unconditionally lands 'ready'
				// (app.ts:751 and the advisory-health catch at :755), which would let health-monitor
				// re-judge the frozen container, oom-watch re-own it, and the icon menu re-enable
				// Restart on a sleep-infinity container. Take the SAME shared debug-start path
				// enterDebugMode uses (patch + start, skip health poll, land 'debug') so debug
				// survives reboots.
				if (await app.store.get('debugMode')) {
					return app.startInDebugMode().catch((error) => {
						app.state = 'unknown'
						this.logger.error(`Failed to start app ${app.id} in debug mode`, error)
					})
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

	async install(appId: string, alternatives?: AppSettings['dependencies'], environmentOverrides?: Record<string, string>, isAdmin: boolean = true, gpuAccess?: boolean) {
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
		// Phase 349 (CR-01): derive requiresKvm from the RESOLVED compose that will
		// actually run — NOT from getBuiltinApp alone. 349 emptied the windows/vm
		// builtins, so `getBuiltinApp(id)?.requiresKvm` is now permanently undefined
		// for a VM; a catalog-served (isGeneratedTemplate=true, sanitizer-skipped)
		// VM compose would otherwise slip the admin gate + KVM preflight and hand a
		// non-admin member a /dev/kvm+NET_ADMIN container. Fail-closed OR: builtin
		// flag, catalog manifest flag, the hardcoded VM id set, and a scan of the
		// resolved compose for the kernel-facing /dev/kvm device — the gate fires
		// regardless of which tier produced the compose, never on provenance alone.
		let resolvedComposeText = ''
		try {
			resolvedComposeText = await fse.readFile(`${appTemplatePath}/docker-compose.yml`, 'utf8')
		} catch {}
		const requiresKvm =
			getBuiltinApp(appId)?.requiresKvm === true ||
			(manifest as {requiresKvm?: boolean}).requiresKvm === true ||
			VM_APP_IDS.has(appId) ||
			composeRequiresKvm(resolvedComposeText)
		assertInstallAllowed({isAdmin, isGeneratedTemplate, manifest, requiresKvm})

		// Phase 349 (VM-01): hardware-virtualization preflight. A VM app declares
		// requiresKvm; refuse the install up front when /dev/kvm is absent
		// rather than letting QEMU fall back to unusable TCG software emulation
		// ("running" but 5% speed). requiresKvm is now derived from the resolved
		// compose (CR-01), so this fires for a catalog/module VM too, not just a builtin.
		if (requiresKvm) {
			await assertKvmAvailable()
			// #6 foot-gun guard: reject absurd guest RAM/CPU vs this box's capacity.
			assertVmResourcesSane(environmentOverrides ?? {})
		}

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

		// Phase 288: the install tail (instance-register -> docker up -> store
		// persist -> provisionAppSubdomain -> registerAppSubdomain -> re-poll) is
		// factored into #finishInstall so deployCustom() reuses it verbatim.
		return this.#finishInstall(appId, manifest, app, filteredEnvOverrides, gpuAccess)
	}

	/**
	 * Phase 288: the shared install TAIL, extracted verbatim from install() with
	 * NO behavior change. Both install() and deployCustom() call this after the
	 * compose has been staged + sanitized + injected. It owns the single
	 * `this.instances.push(app)` (and its rollback on docker-up failure), runs
	 * `docker compose up`, persists the installed app, provisions the Phase-287
	 * verify-live subdomain (username appended server-side — pass ONLY the slug),
	 * registers it in Caddy (pRetry), reports the install event, and kicks the
	 * Phase-287 box-side re-poll. Returns false on docker-up failure, true on
	 * success.
	 */
	async #finishInstall(
		appId: string,
		manifest: AppManifest,
		app: App,
		filteredEnvOverrides?: Record<string, string>,
		gpuAccess?: boolean,
	): Promise<boolean> {
		// Phase 288: recompute the app data dir deterministically (same formula
		// install()/deployCustom() use to stage the compose) so the requiresLocalAiClis
		// ACL grant below keeps working without threading an extra parameter.
		const appDataDirectory = `${this.#livinityd.dataDirectory}/app-data/${appId}`
		this.instances.push(app)

		// Complete the install process via the app script
		try {
			// We quickly try to start the app env before installing the app. In most normal cases
			// this just quickly returns and does nothing since the app env is already running.
			// However in the case where the app env is down this ensures we start it again.
			await appEnvironment(this.#livinityd, 'up')
			// 330 GPU-05: persist the install-time GPU choice BEFORE the first container
			// create so patchComposeFile (inside app.install() below) picks it up on the
			// very first pass — a direct store write, NOT app.setGpuAccess() which also
			// fire-and-forgets this.restart() and would race the container being created
			// (FLAG 5). Only written when a value was threaded (install() → here); the
			// other #finishInstall caller (deployCustom) passes none → undefined → no-op.
			if (gpuAccess !== undefined) {
				await app.store.set('gpuAccess', gpuAccess)
			}
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

		// 322-06 (IDENT-02, D-322-4): install-time SSO enablement. If "Enable SSO" was
		// toggled ON before this install, run the SECOND provisioning mechanism
		// (provisionOidcForApp: docker-exec CLI for Nextcloud/Gitea, loopback REST for
		// Immich) now — in the same slot reconcileAppVolumeOwnership uses, strictly AFTER
		// health. app.install() above already polled the main container to 'ready', and
		// provisionOidcAfterHealth re-gates on pollContainerHealth + is failure-isolated
		// (never throws into the install path), so this is fire-and-forget.
		if (await app.getOidcEnabled()) {
			app.provisionOidcAfterHealth().catch((error) => {
				this.logger.error(`[oidc] install-time provisioning failed for ${appId}`, error)
			})
		}

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
		// Reliability B1 — truthful DNS status. A null return collapses two very
		// different outcomes; split them so the persisted status is honest:
		//   no api-key  → 'skipped' (self-hosted/LAN — automation intentionally
		//                 does not apply; the dot-format host may be valid there)
		//   api-key set → 'failed'  (Server5 outage / 4xx — the dot-format
		//                 fallback will NOT match the CF ingress → 404)
		let dnsStatus: 'ready' | 'pending' | 'failed' | 'skipped' = provisioned?.ready ? 'ready' : 'pending'
		if (!provisioned) {
			const hasApiKey = Boolean(await this.#livinityd.ai.redis.get(REDIS_PLATFORM_API_KEY).catch(() => null))
			dnsStatus = hasApiKey ? 'failed' : 'skipped'
			// Phase 210 Bug B: surface the silent provisioning failure. Without
			// the Server5-minted host the local Caddy block falls back to
			// `<sub>.<mainDomain>` (dot format) which does NOT match the
			// CF Tunnel ingress (`<sub>-<user>.livinity.io`, hyphen format)
			// — apps appear to "install" but are unreachable through the
			// public subdomain. Only a real failure logs loudly; the no-api-key
			// skip is intentional (self-hosted) and stays quiet.
			if (dnsStatus === 'failed') {
				this.logger.error(
					`Phase 210: CF subdomain provisioning failed for ${appId}. ` +
						`App will use legacy dot-format subdomain which likely won't resolve via CF Tunnel. ` +
						`Causes: Server5 unreachable, 409 conflict from re-install, or single-char slug. ` +
						`A second Install click (admin) re-provisions; dnsStatus='failed' is persisted for the UI.`,
				)
			}
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
			await pRetry(
				() =>
					this.registerAppSubdomain(
						appId,
						manifest.port,
						subdomain,
						fullHost,
						provisioned?.ready,
						provisioned?.readyAt,
						dnsStatus,
						// Reliability B5 — strict: a Caddy apply failure must reach this
						// pRetry (previously swallowed inside rebuildCaddyFromState, so
						// the retries + the loud SC6 failure below were phantom).
						true,
					),
				{
					retries: 3,
					onFailedAttempt: (error) => {
						this.logger.error(
							`Attempt ${error.attemptNumber} registering subdomain for ${appId} failed. ${error.retriesLeft} retries left.`,
							error,
						)
					},
				},
			)
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

		// Phase 287: box-side advisory re-poll (Tier-2, WEAK floor). Only when
		// Tier-1 (platform DoH) was NOT ready, loop the box's own resolver until
		// the host resolves, then flip subdomainReady on the persisted config.
		// WEAK: the box resolver (Tailscale MagicDNS / resolv.conf) is NOT the
		// operator's client resolver — this is a floor for the slow-box case, not
		// proof the client can reach it. NEVER throws into the install path.
		if (provisioned && !provisioned.ready) {
			const reHost = hostFromUrl(provisioned.url)
			if (reHost) void this.rePollSubdomainReady(appId, reHost).catch(() => {})
		}

		return true
	}

	/**
	 * Phase 288 — deploy an AI-authored custom Docker app onto THIS box and mint a
	 * live `{slug}-{user}.livinity.io` URL by reusing the factored install tail.
	 *
	 * SECURITY (288): the AI-authored compose is UNTRUSTED. Unlike install(), which
	 * sets `isGeneratedTemplate=true` for builtin/catalog templates and BYPASSES the
	 * sanitizer, deployCustom forces `isGeneratedTemplate=false` so
	 * `sanitizeNonBuiltinCompose` ALWAYS runs (no docker.sock, no host-net/pid/userns,
	 * no privileged/cap_add, no host-path bind outside app-data — ComposeRejected
	 * propagates and aborts the deploy). NEVER reuse the install() catalog branch for
	 * AI input.
	 *
	 * MVP (288): deploys as the BOX OWNER (admin) — the same identity catalog installs
	 * use via LIV_API_KEY -> getAdminUser (is-authenticated.ts:46). True per-user
	 * isolation (thread the chatting user into installForUser + provision the subdomain
	 * under the user's api_key) is DEFERRED to a follow-up phase. Do not silently ship
	 * multi-user attribution. Future hardening (also DEFERRED): an image allow/deny
	 * list + per-deploy resource limits + a tool-level rate limit.
	 */
	async deployCustom(input: {
		slug: string
		dockerCompose?: string
		image?: string
		port: number
		manifest?: {name: string; icon?: string}
		isAdmin?: boolean
	}): Promise<boolean> {
		const {slug, image, port} = input
		// 1. Validate.
		if (!slug || typeof slug !== 'string') throw new Error('deployCustom: slug is required')
		if (await this.isInstalled(slug)) throw new Error(`App ${slug} is already installed`)
		if (!input.dockerCompose && !image) throw new Error('deployCustom: dockerCompose or image is required')
		if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('deployCustom: a valid port (1-65535) is required')

		this.logger.log(`Phase 288: deployCustom for ${slug} (port=${port}, source=${input.dockerCompose ? 'compose' : 'image'})`)

		const yaml = (await import('js-yaml')).default

		// 2. Synthesize a one-service compose from a bare image, else use the
		// AI-supplied compose string verbatim.
		const composeString =
			input.dockerCompose ??
			yaml.dump({
				services: {
					[slug]: {
						image,
						ports: [`127.0.0.1:${port}:${port}`],
						restart: 'unless-stopped',
					},
				},
			})

		// 3. Stage the compose + a synthesized manifest to a tmpdir, mirroring
		// fetchPlatformTemplate's write pattern (apps.ts ~:1160-1204) but sourcing
		// the compose from the AI input instead of GET /api/apps/{slug}.
		const tmpDir = path.join(os.tmpdir(), `livos-deploy-${slug}-${Date.now()}`)
		await fse.mkdirp(tmpDir)
		await fse.writeFile(path.join(tmpDir, 'docker-compose.yml'), composeString)
		const synthManifest = {
			manifestVersion: '1.0.0',
			id: slug,
			name: input.manifest?.name || slug,
			tagline: '',
			category: 'other',
			version: '1.0.0',
			port,
			description: '',
			website: '',
			developer: '',
			support: '',
			gallery: [],
			icon: input.manifest?.icon || undefined,
		}
		await fse.writeFile(path.join(tmpDir, 'livinity-app.yml'), yaml.dump(synthManifest, {lineWidth: -1, noRefs: true}))

		// 4. SECURITY (288): AI compose is UNTRUSTED. Force isGeneratedTemplate=false
		// so sanitizeNonBuiltinCompose ALWAYS runs (the builtin/catalog path bypasses
		// it). NEVER reuse the install() catalog branch for AI input. This is the
		// entire security premise of deployCustom — DO NOT reassign this to true.
		const isGeneratedTemplate = false

		// 5. Stage into app-data/{slug} (copy install()'s rsync + volume-precreate).
		const appDataDirectory = `${this.#livinityd.dataDirectory}/app-data/${slug}`
		await fse.mkdirp(appDataDirectory)
		await $`rsync --archive --verbose --exclude ".gitkeep" ${tmpDir}/. ${appDataDirectory}`
		// Pre-create volume mount directories so Docker doesn't create them as root.
		try {
			const composeFile = `${appDataDirectory}/docker-compose.yml`
			const composeContent = await fse.readFile(composeFile, 'utf8')
			const volumeMatches = composeContent.matchAll(/\$\{APP_DATA_DIR\}\/([^:]+):/g)
			for (const match of volumeMatches) {
				const subDir = match[1].trim()
				await fse.mkdirp(`${appDataDirectory}/${subDir}`)
			}
		} catch {}
		await fse.remove(tmpDir).catch(() => {})

		// 6. THE SANITIZER GATE — security crux. Verbatim from install() (apps.ts
		// ~:632-642). isGeneratedTemplate is FORCED false above so this ALWAYS runs.
		// Let ComposeRejected propagate (do NOT catch) — the deploy MUST abort on an
		// irremediable directive (docker.sock / host-path bind / etc.).
		if (!isGeneratedTemplate) {
			const composeFile = `${appDataDirectory}/docker-compose.yml`
			const composeContent = await fse.readFile(composeFile, 'utf8')
			const composeData = yaml.load(composeContent)
			const {compose, removed} = sanitizeNonBuiltinCompose(composeData, appDataDirectory)
			await fse.writeFile(composeFile, yaml.dump(compose))
			this.logger.log(`LIVOS-013: sanitized deployCustom compose for ${slug} removed=${removed.join(',') || '(none)'}`)
		}

		// 7. Read the staged manifest and run the shared install tail (docker up ->
		// provisionAppSubdomain (pass ONLY the slug; username appended server-side) ->
		// registerAppSubdomain -> Phase-287 re-poll). DNS minted for free.
		let manifest: AppManifest
		try {
			manifest = await readManifestInDirectory(appDataDirectory)
		} catch {
			throw new Error('deployCustom: staged manifest not found')
		}
		const app = new App(this.#livinityd, slug)
		return this.#finishInstall(slug, manifest, app)
	}

	/**
	 * Phase 341-02 (REPO-02, D-341-2 / D-341-2b / D-341-5) — install a FEDERATED
	 * (third-party catalog) app. THE credential-denial gate.
	 *
	 * A federated source is UNTRUSTED-by-default. This method mirrors deployCustom
	 * VERBATIM in its trust posture — it FORCES `isGeneratedTemplate = false`,
	 * always runs the compose-safety REJECT gate + `sanitizeNonBuiltinCompose`, and
	 * NEVER calls `injectAiProviderConfig` / `chooseCredentialPath` /
	 * `mintMeteredKeyForApp` / `fetchPlatformTemplate`. So a federated app receives
	 * NOTHING privileged: no broker sentinel, no OAuth, no metered key, no
	 * host-CLI / cred-proxy reach. The broker/metered path is UNREACHABLE from any
	 * `fed-*` id by construction (there is simply no call to it on this path).
	 *
	 * `requiresLocalAiClis` is a HARD DENY (install refused) — a federated app
	 * never gets a cred-proxy per-app token / host-CLI reach.
	 * `requiresAiProvider` installs providerless (badged in the UI; 341-03).
	 *
	 * MVP (like deployCustom): installs as the BOX OWNER (admin). Per-user
	 * federated isolation is DEFERRED.
	 */
	async installFederated(input: {sourceId: string; catalogSlug: string}): Promise<boolean> {
		const {sourceId, catalogSlug} = input

		// 1. Resolve the source (must exist + be enabled). Fail-closed: an unknown
		// or disabled source is not installable.
		const sources = ((await this.#livinityd.store.get('appStoreSources', [])) as AppStoreSource[]) ?? []
		const source = sources.find((s) => s.id === sourceId)
		if (!source) throw new Error(`installFederated: unknown app-store source ${sourceId}`)
		if (source.enabled === false) throw new Error(`installFederated: source ${sourceId} is disabled`)

		// 2. The installed id is source-namespaced (fed-<sourceId12hex>-<slug>) —
		// un-shadowable + docker/path/subdomain-safe. Throws on an invalid slug.
		// isInstalled also blocks any official-id collision (slug is always fed-*).
		const slug = namespacedAppId(sourceId, catalogSlug)
		if (await this.isInstalled(slug)) throw new Error(`App ${slug} is already installed`)

		// 3. Re-fetch FRESH from the source, never the browse cache (D-341-5 "on
		// every fetch"). fetchFederatedCatalog is SSRF-hardened + strict-parses each
		// manifest (Zod), so `entry.manifest` is already a validated AppManifest.
		const apps = await fetchFederatedCatalog(source.url, {})
		const entry = apps.find((a) => a.catalogSlug === catalogSlug)
		if (!entry) throw new Error(`installFederated: ${catalogSlug} not found in ${source.name} — refusing install`)
		const manifest = entry.manifest

		// 4. HARD DENY requiresLocalAiClis (D-341-2) — a federated app is never
		// granted a cred-proxy per-app token / host-CLI reach. MUST be BEFORE any
		// staging / #finishInstall.
		if (manifest.requiresLocalAiClis === true) {
			throw new Error(
				'Federated apps cannot request host AI CLIs (requiresLocalAiClis) — install refused',
			)
		}

		// 5. FORCE isGeneratedTemplate = false — the entire trust premise. DO NOT
		// reassign to true (deployCustom discipline). Kept explicit for the reader;
		// the federated path simply never calls the credential-injecting branches.
		const isGeneratedTemplate = false
		void isGeneratedTemplate

		this.logger.log(`341-02: installFederated ${slug} from source ${sourceId} (${source.name}) — untrusted, no creds`)

		const yaml = (await import('js-yaml')).default

		// 6. Stage the source compose + a synthesized manifest (mirror deployCustom
		// L1063-1103). The staged manifest FORCES id=slug and STRIPS requiresAiProvider
		// / requiresLocalAiClis so NO downstream re-config path (e.g. reapplyAppConfig)
		// can ever inject a broker credential for this untrusted app. NO broker/user
		// env is interpolated.
		const composeString = entry.dockerCompose
		const tmpDir = path.join(os.tmpdir(), `livos-fed-${slug}-${Date.now()}`)
		await fse.mkdirp(tmpDir)
		await fse.writeFile(path.join(tmpDir, 'docker-compose.yml'), composeString)
		const {requiresAiProvider: _rap, requiresLocalAiClis: _rlc, ...manifestRest} = manifest as AppManifest & {
			requiresAiProvider?: boolean
			requiresLocalAiClis?: boolean
		}
		const stagedManifest = {...manifestRest, id: slug}
		await fse.writeFile(
			path.join(tmpDir, 'livinity-app.yml'),
			yaml.dump(stagedManifest, {lineWidth: -1, noRefs: true}),
		)

		const appDataDirectory = `${this.#livinityd.dataDirectory}/app-data/${slug}`
		await fse.mkdirp(appDataDirectory)
		await $`rsync --archive --verbose --exclude ".gitkeep" ${tmpDir}/. ${appDataDirectory}`
		// Pre-create ${APP_DATA_DIR} volume mount dirs so Docker doesn't own them as root.
		try {
			const composeFile = `${appDataDirectory}/docker-compose.yml`
			const composeContent = await fse.readFile(composeFile, 'utf8')
			const volumeMatches = composeContent.matchAll(/\$\{APP_DATA_DIR\}\/([^:]+):/g)
			for (const match of volumeMatches) {
				await fse.mkdirp(`${appDataDirectory}/${match[1].trim()}`)
			}
		} catch {}
		await fse.remove(tmpDir).catch(() => {})

		// 7. THE REJECT GATE, then loopback port rewrite, then the mutating sanitizer.
		// Order matters: assert FIRST (an escape-class directive / broker reach /
		// sensitive port aborts the install BEFORE we neutralize anything). Let
		// ComposeRejected propagate — do NOT catch.
		const composeFile = `${appDataDirectory}/docker-compose.yml`
		const composeContent = await fse.readFile(composeFile, 'utf8')
		const composeData = yaml.load(composeContent) as any

		assertFederatedComposeSafe(composeData, appDataDirectory)

		// Rewrite ports to loopback-only regardless of what the catalog declared:
		// main service → 127.0.0.1:<port>:<internalPort>; strip every other
		// service's host publishes (mirror installForUser L2878-2892). MVP: single
		// host port from manifest.port (per-user allocatePort() isolation DEFERRED).
		const svcNames = Object.keys(composeData.services || {})
		const mainServiceName = svcNames[0]
		let internalPort = manifest.port
		const mainSvc = mainServiceName ? composeData.services?.[mainServiceName] : undefined
		if (mainSvc?.ports && Array.isArray(mainSvc.ports)) {
			for (const p of mainSvc.ports) {
				const ps = p.toString().replace('/udp', '').replace('/tcp', '')
				if (ps.includes(':')) {
					const parts = ps.split(':')
					const n = parseInt(parts[parts.length - 1], 10)
					if (n) {
						internalPort = n
						break
					}
				}
			}
		}
		for (const svcName of svcNames) {
			if (svcName === mainServiceName) continue
			if (composeData.services[svcName]?.ports) delete composeData.services[svcName].ports
		}
		if (mainServiceName && composeData.services[mainServiceName]) {
			composeData.services[mainServiceName].ports = [`127.0.0.1:${manifest.port}:${internalPort}`]
		}

		// Defense-in-depth: the mutating sanitizer for no-new-privileges hardening.
		const {removed} = sanitizeNonBuiltinCompose(composeData, appDataDirectory)
		await fse.writeFile(composeFile, yaml.dump(composeData))
		this.logger.log(`341-02: staged federated ${slug} (sanitizer removed=${removed.join(',') || '(none)'})`)

		// 8. NEVER inject a credential. requiresAiProvider is NOT honored for an
		// untrusted source — the box never mints/forwards a broker/metered key. The
		// app installs providerless (badged, 341-03). We stripped the flag from the
		// staged manifest so nothing re-adds it later.
		if (manifest.requiresAiProvider === true) {
			this.logger.log(
				`341: federated ${slug} declares requiresAiProvider — NOT honored (untrusted source, no broker/metered key)`,
			)
		}

		// 9. Reuse the shared install tail. #finishInstall's requiresLocalAiClis ACL
		// branch is unreachable (step 4 denied it; the staged manifest omits it too).
		let installedManifest: AppManifest
		try {
			installedManifest = await readManifestInDirectory(appDataDirectory)
		} catch {
			throw new Error('installFederated: staged manifest not found')
		}
		const app = new App(this.#livinityd, slug)
		return this.#finishInstall(slug, installedManifest, app)
	}

	/**
	 * Phase 344-02 (XFER-01, D-344-4) — import ONE app from an uploaded `.livbundle`
	 * produced by exportAppBundle() on another box. The bundle is UNTRUSTED input even
	 * though it came from the operator's own box, so this method mirrors installFederated's
	 * trust posture: it funnels through the SAME untrusted-compose sanitize gate + the
	 * shared `#finishInstall` tail (NO new install path), and rolls back COMPLETELY on any
	 * failure so the box is left as-if-never-imported.
	 *
	 * Order (fail as early + as cheaply as possible):
	 *   1. safeExtractBundle → staging  (path-traversal-safe + per-entry sha256 verified)
	 *   2. B1 appId charset assert + runImportPrechecks (schema/version/collision/space)
	 *   3. collision hard-reject: instances + isInstalled + on-disk app-data + persisted
	 *      `apps` array + on-disk dir (an orphaned dir from an interrupted uninstall is
	 *      REJECTED, never silently merged into — W addendum)
	 *   4. stage app-data + compose + manifest → THE SANITIZE GATE (deployCustom-identical)
	 *   5. restore volumes + reconcile ownership → `#finishInstall` → best-effort subdomain
	 *      replay → clean staging
	 * Any throw runs the FULL rollback (volumes + app-data + staging + instance/apps revert).
	 *
	 * D-344-7: GLOBAL apps only (this.instances) — per-user-instance import is DEFERRED.
	 * D-344-6: bundles are PLAINTEXT — there is NO decrypt path.
	 */
	async importAppBundle(input: {
		bundlePath: string
	}): Promise<{ok: true; appId: string} | {ok: false; reason: string}> {
		const {bundlePath} = input
		// W2 (344-review): stage under the DATA directory (the same filesystem the free-space
		// check measures + where the app-data/volumes ultimately land), NOT os.tmpdir() (which
		// is frequently a separate/small tmpfs). The `.`-prefixed name can never collide with a
		// real appId (charset excludes `.`) and is skipped by app enumeration.
		const staging = path.join(
			this.#livinityd.dataDirectory,
			'app-data',
			`.import-staging-${randomUUID()}`,
		)
		const ledger = newLedger()
		let manifest: BundleManifest | undefined
		let appDataDirectory: string | undefined

		try {
			// W2: measure real free space at the data root BEFORE extraction and derive an
			// ABSOLUTE extraction hard-ceiling (available − floor), INDEPENDENT of the
			// attacker-declared manifest.totalBytes. safeExtractBundle enforces
			// min(manifest-derived, hardCeiling) from the first byte, so a bundle that
			// under-declares its size can never fill the data disk during extraction.
			const availableBytes = (await getDiskUsageByPath(this.#livinityd.dataDirectory)).available
			const hardCeiling = Math.max(0, availableBytes - IMPORT_SPACE_FLOOR_BYTES)

			// 1. Extract into a fresh staging dir. safeExtractBundle validates every tar
			// entry BEFORE writing and verifies every manifest sha256 AFTER — so nothing
			// past this point trusts an unverified byte. Staging is always cleaned (success
			// removes it; failure pushes it onto the ledger for the catch-block rollback).
			const extracted = await safeExtractBundle(bundlePath, staging, {hardCeiling})
			manifest = extracted.manifest

			// 2a. B1 (BLOCKER, belt-and-suspenders): the appId is the SOLE manifest string
			// that flows into a path join / fse.copy / volume runtime name below. The Zod
			// schema already pinned it, but re-assert the App-ctor charset HERE before any
			// path use — reject '[invalid-app-id]' rather than construct a path from it.
			if (!/^[a-zA-Z0-9-_]+$/.test(manifest.appId)) {
				await fse.remove(staging).catch(() => {})
				return {ok: false, reason: '[invalid-app-id]'}
			}

			// 2b. Prechecks (schema / version-floor / collision / free-space). Run against
			// the LIVE instance list + the real free space measured above (secondary gate —
			// the extraction hard-ceiling already bounded actual disk use). Nothing applied yet.
			const installedAppIds = this.instances.map((a) => a.id)
			const pre = runImportPrechecks(manifest, {installedAppIds, availableBytes})
			if (!pre.ok) {
				await fse.remove(staging).catch(() => {})
				return {ok: false, reason: pre.reason}
			}

			// 3. Collision hard-reject (D-344-4) — defense-in-depth beyond the precheck:
			// the running instance list, the persisted `apps` FileStore array, AND an
			// on-disk app-data dir (an orphan from an interrupted uninstall must be
			// rejected, never silently merged into — W addendum). No in-place overwrite
			// in v1; the operator uninstalls first.
			appDataDirectory = `${this.#livinityd.dataDirectory}/app-data/${manifest.appId}`
			if (await this.isInstalled(manifest.appId)) {
				await fse.remove(staging).catch(() => {})
				return {ok: false, reason: '[app-already-installed]'}
			}
			const persistedApps = ((await this.#livinityd.store.get('apps')) as string[]) ?? []
			if (persistedApps.includes(manifest.appId)) {
				await fse.remove(staging).catch(() => {})
				return {ok: false, reason: '[app-already-installed]'}
			}
			if (await fse.pathExists(appDataDirectory)) {
				await fse.remove(staging).catch(() => {})
				return {ok: false, reason: '[app-data-dir-exists]'}
			}

			// --- From here EVERYTHING is under the rollback ledger. ---

			// 4. Stage the extracted payload into app-data/<appId> (mirror deployCustom's
			// write pattern). Register the app-data dir on the ledger BEFORE writing into it
			// so a failure mid-copy still cleans it.
			await fse.mkdirp(appDataDirectory)
			ledger.dirs.push(appDataDirectory)
			const stagedAppData = path.join(staging, 'app-data')
			if (await fse.pathExists(stagedAppData)) await fse.copy(stagedAppData, appDataDirectory)
			const stagedCompose = path.join(staging, 'compose', 'docker-compose.yml')
			if (await fse.pathExists(stagedCompose)) {
				await fse.copy(stagedCompose, path.join(appDataDirectory, 'docker-compose.yml'))
			}
			const stagedManifestFile = path.join(staging, 'livinity-app.yml')
			if (await fse.pathExists(stagedManifestFile)) {
				await fse.copy(stagedManifestFile, path.join(appDataDirectory, 'livinity-app.yml'))
			}

			const composeFile = `${appDataDirectory}/docker-compose.yml`
			// Pre-create ${APP_DATA_DIR}/<subdir> mount dirs so Docker doesn't own them as
			// root — the SAME regex install()/deployCustom() use.
			try {
				const composeContent0 = await fse.readFile(composeFile, 'utf8')
				const volumeMatches = composeContent0.matchAll(/\$\{APP_DATA_DIR\}\/([^:]+):/g)
				for (const match of volumeMatches) await fse.mkdirp(`${appDataDirectory}/${match[1].trim()}`)
			} catch {}

			// 5. THE SANITIZE GATE — identical to deployCustom (isGeneratedTemplate forced
			// false). An uploaded compose is UNTRUSTED; ComposeRejected propagates to the
			// catch → full rollback. Never reuse the builtin/catalog bypass for this input.
			const yaml = (await import('js-yaml')).default
			const composeContent = await fse.readFile(composeFile, 'utf8')
			const composeData = yaml.load(composeContent)
			const {compose, removed} = sanitizeNonBuiltinCompose(composeData, appDataDirectory)
			await fse.writeFile(composeFile, yaml.dump(compose))
			this.logger.log(
				`344-02: sanitized imported compose for ${manifest.appId} removed=${removed.join(',') || '(none)'}`,
			)

			// 6. Restore named volumes (each tar.gz already sha256-verified) + reconcile
			// ownership via the TESTED reconcile path BEFORE the app starts. The App ctor
			// `/^[a-zA-Z0-9-_]+$/` guard is the final appId safety net.
			await restoreVolumes(manifest, {projectName: manifest.appId, stagingRoot: staging}, ledger)
			const app = new App(this.#livinityd, manifest.appId)
			await reconcileAppVolumeOwnership(app, {projectName: manifest.appId})

			// 7. Hand off to the shared install tail. #finishInstall owns the single
			// instances.push + docker-up + persist + subdomain provision. On docker-up
			// failure it returns false (having already filtered this.instances and WITHOUT
			// writing the `apps` array), so we throw to run the rest of the rollback.
			let appManifest: AppManifest
			try {
				appManifest = await readManifestInDirectory(appDataDirectory)
			} catch {
				throw new Error('[import-manifest-not-found]')
			}
			const ok = await this.#finishInstall(manifest.appId, appManifest, app)
			if (!ok) throw new Error('[finish-install-failed]')

			// 8. Subdomain-STRING replay (best-effort, AFTER a successful #finishInstall —
			// which already registered the appId-derived DEFAULT subdomain). Only re-register
			// when the source captured a DIFFERENT subdomain string, and only when that
			// string is not already taken by ANOTHER app on this target (W addendum: reject
			// the replay with a clear error naming the conflict; the imported app stays
			// functional on its default subdomain — v1: no auto-rename).
			//
			// D-344-5 / SC5 fail-safe: public-access + WAF are NOT auto-restored here. A
			// forbidden/public flag from the SOURCE box must never silently make the app
			// public on the TARGET — the imported app comes up PRIVATE by default and the
			// operator re-enables public access explicitly. Documented deferral (D-344-7).
			try {
				const subdomainFile = path.join(staging, 'meta', 'subdomain.json')
				if (manifest.hasSubdomain && (await fse.pathExists(subdomainFile))) {
					const captured = JSON.parse(await fse.readFile(subdomainFile, 'utf8')) as {
						subdomain?: string
					} | null
					const desiredSub = (captured?.subdomain ?? '').toLowerCase()
					if (desiredSub && desiredSub !== manifest.appId.toLowerCase()) {
						if (!IMPORT_SUBDOMAIN_RE.test(desiredSub)) {
							// W4 (344-review): the replay string is attacker-influenced (it rides in
							// the bundle's meta/subdomain.json). A label that fails Caddy's charset is
							// SKIPPED — never handed to registerAppSubdomain, never persisted as a
							// SubdomainConfig — so it cannot corrupt the generated Caddyfile. The app
							// stays functional on its appId-derived default subdomain.
							this.logger.error(
								`344-02: imported subdomain '${desiredSub}' fails the Caddy subdomain charset — ` +
									`skipping replay; imported app '${manifest.appId}' stays on its default appId-derived subdomain.`,
							)
						} else {
							const all = await this.getAllSubdomains()
							const conflict = all.find(
								(s) => (s.subdomain ?? '').toLowerCase() === desiredSub && s.appId !== manifest!.appId,
							)
							if (conflict) {
								this.logger.error(
									`344-02: imported subdomain '${desiredSub}' is already used by app '${conflict.appId}' on this box — ` +
										`skipping replay; imported app '${manifest.appId}' stays on its default appId-derived subdomain (v1: no auto-rename).`,
								)
							} else {
								await this.registerAppSubdomain(manifest.appId, appManifest.port, desiredSub)
								this.logger.log(`344-02: replayed subdomain '${desiredSub}' for imported app ${manifest.appId}`)
							}
						}
					}
				}
			} catch (replayErr) {
				// A replay hiccup must NOT fail a good import — the app is already up on its
				// freshly-minted default subdomain.
				this.logger.error(
					`344-02: subdomain replay failed for ${manifest.appId} (app is up on its default subdomain)`,
					replayErr,
				)
			}

			// 9. Success — remove staging (it was never added to the ledger yet).
			await fse.remove(staging).catch(() => {})
			return {ok: true, appId: manifest.appId}
		} catch (err) {
			const reason =
				err instanceof ComposeRejected
					? `[compose-rejected] ${err.message}`
					: err instanceof Error
						? err.message
						: String(err)

			// FULL rollback — leave the box as-if-never-imported. #finishInstall structurally
			// cannot throw AFTER it writes the `apps` array (verified), so a throw here means
			// either a pre-#finishInstall stage failed OR #finishInstall returned false having
			// already filtered this.instances and NOT written the array. The instance/array
			// reverts below are therefore idempotent defense-in-depth.
			if (manifest) {
				const doomedId = manifest.appId
				this.instances = this.instances.filter((a) => a.id !== doomedId)
				try {
					await this.#livinityd.store.getWriteLock(async ({get, set}) => {
						const apps = (await get('apps')) as string[]
						await set(
							'apps',
							apps.filter((id) => id !== doomedId),
						)
					})
				} catch (revertErr) {
					this.logger.error(`344-02: failed to revert persisted apps array for ${doomedId}`, revertErr)
				}
			}
			// W5 (344-review): if #finishInstall/app.install() partially created containers (or
			// the compose network) before throwing, tear them down BEFORE the ledger force-removes
			// the volumes those containers still reference — otherwise a `volume rm -f` orphans the
			// running containers and leaves the compose network dangling. Best-effort: gated on the
			// app-data dir existing (so it's a no-op when we failed before staging the compose),
			// caught + logged (never swallowed), and it never masks the original import error.
			if (manifest && appDataDirectory && (await fse.pathExists(appDataDirectory))) {
				try {
					await new App(this.#livinityd, manifest.appId).stop()
				} catch (teardownErr) {
					this.logger.error(
						`344-02: best-effort container/network teardown for ${manifest.appId} during rollback failed`,
						teardownErr,
					)
				}
			}
			// Volumes + app-data dir + staging (add staging so rollback cleans it too).
			ledger.dirs.push(staging)
			const result = await rollback(ledger, {logger: this.logger})
			if (result.failed.length) {
				this.logger.error(`344-02: import rollback had failures: ${result.failed.join(', ')}`)
			}
			this.logger.error(`344-02: importAppBundle failed (${reason}) — rolled back`)
			return {ok: false, reason}
		}
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
		//
		// Reliability B1 — this is also the "Retry DNS" path (a second Install
		// click routes here). Two prior bugs fixed:
		// (1) it never re-provisioned, so a failed CF record was never retried;
		// (2) it re-registered with NO fullHost/ready args, so the overwrite
		//     DOWNGRADED a working entry: hyphen host + subdomainReady wiped →
		//     Caddy fell back to the dot-format host → 404 after every recovery
		//     click. Now: re-provision first; if provisioning does not answer
		//     (Server5 down, 409 on an already-existing record), PRESERVE the
		//     existing entry's host/readiness instead of downgrading it.
		if (port) {
			try {
				const provisioned = await this.provisionAppSubdomain(appId, port)
				const existing = (await this.getSubdomains()).find((s) => s.appId === appId)
				const fullHost = provisioned ? hostFromUrl(provisioned.url) : existing?.host
				const ready = provisioned ? provisioned.ready : existing?.subdomainReady
				const readyAt = provisioned ? provisioned.readyAt : existing?.readyAt
				let dnsStatus: 'ready' | 'pending' | 'failed' | 'skipped' | undefined
				if (provisioned) {
					dnsStatus = provisioned.ready ? 'ready' : 'pending'
				} else if (existing?.host) {
					dnsStatus = existing.dnsStatus // keep whatever truth we had
				} else {
					const hasApiKey = Boolean(await this.#livinityd.ai.redis.get(REDIS_PLATFORM_API_KEY).catch(() => null))
					dnsStatus = hasApiKey ? 'failed' : 'skipped'
				}
				await this.registerAppSubdomain(appId, port, subdomain, fullHost, ready, readyAt, dnsStatus)
				if (provisioned && !provisioned.ready) {
					const reHost = hostFromUrl(provisioned.url)
					if (reHost) void this.rePollSubdomainReady(appId, reHost).catch(() => {})
				}
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

	// 316-02 (GPU-02): set the per-app GPU-access override (delegates to the app
	// instance, which persists to settings.yml and restarts to re-patch compose).
	async setGpuAccess(appId: string, enabled: boolean) {
		const app = this.getApp(appId)
		return app.setGpuAccess(enabled)
	}

	// 326-01 APPS-01 (D-02): set post-install env overrides. RE-RUNS the install-time
	// manifest allowlist BEFORE delegating — unknown keys are post-install arbitrary env
	// injection, so reject + log them here (same filter as install(), apps.ts:769-782).
	// The app-instance setter persists the ALREADY-filtered map + patch-then-restarts.
	async setEnvironmentOverrides(appId: string, overrides: Record<string, string>) {
		const app = this.getApp(appId)
		const builtinApp = getBuiltinApp(appId)
		const allowedKeys = new Set(builtinApp?.installOptions?.environmentOverrides?.map((o) => o.name) ?? [])
		const filtered: Record<string, string> = {}
		for (const [key, value] of Object.entries(overrides)) {
			if (allowedKeys.has(key)) filtered[key] = value
			else this.logger.error(`Rejected unknown environment override key '${key}' for app ${appId}`)
		}
		return app.setEnvironmentOverrides(filtered)
	}

	// 326-01 APPS-03 (D-07): set per-app CPU/RAM limits (delegates; app instance
	// patch-then-restarts so deploy.resources.limits reconciles via compose recreation).
	async setResourceLimits(appId: string, limits: {cpuLimit?: number; memoryLimit?: number; cpuSet?: string}) {
		return this.getApp(appId).setResourceLimits(limits)
	}

	// 326-01 APPS-02 (D-04): set the per-app auto-update policy (plain store write).
	async setUpdatePolicy(appId: string, policy: 'auto' | 'manual') {
		return this.getApp(appId).setUpdatePolicy(policy)
	}

	// 343-02 RESIL-02 (D-343-5): toggle the per-app OOM self-heal (plain store write; no restart).
	async setOomSelfHeal(appId: string, enabled: boolean) {
		return this.getApp(appId).setOomSelfHeal(enabled)
	}

	// 345-03 GUEST-01 (D-345-6): toggle whether this app appears on the anonymous public
	// dashboard (plain store write; no restart). Admin-only at the route layer.
	async setShowOnPublicDashboard(appId: string, enabled: boolean) {
		return this.getApp(appId).setShowOnPublicDashboard(enabled)
	}

	// 342-01 APPD-01: set/clear the per-app maintenance window (plain store write; delete-to-clear).
	async setUpdateWindow(appId: string, window: {start: string; end: string} | undefined) {
		return this.getApp(appId).setUpdateWindow(window)
	}

	// 343-01 RESIL-01 (D-343-2): enter/exit debug mode (entrypoint-suppression recovery for a
	// crash-looping app). Mirrors the setUpdateWindow delegator shape.
	async enterDebugMode(appId: string) {
		return this.getApp(appId).enterDebugMode()
	}

	async exitDebugMode(appId: string) {
		return this.getApp(appId).exitDebugMode()
	}

	// 326-01 APPS-02 (D-05): pin/un-pin an exact ignored version (plain store write).
	async setIgnoredVersion(appId: string, version: string | undefined) {
		return this.getApp(appId).setIgnoredVersion(version)
	}

	// 326-01 MEDIA-01 (D-19): remember the Immich onboarding QR-card dismissal (UI-only).
	async setImmichCardDismissed(appId: string, dismissed: boolean) {
		return this.getApp(appId).setImmichCardDismissed(dismissed)
	}

	// 329-11 MEDIA-02 (D-23): remember the Jellyfin setup onboarding card dismissal (UI-only).
	async setJellyfinCardDismissed(appId: string, dismissed: boolean) {
		return this.getApp(appId).setJellyfinCardDismissed(dismissed)
	}

	// 316-02 (GPU-02): list the ids of every app currently claiming GPU access,
	// so the UI can warn about GPU exclusivity. Mirrors getDependents' cross-app
	// scan — catch-per-app so one unreadable app never fails the whole scan.
	// IN-04: resolve "wants GPU" exactly like patchComposeFile — the explicit
	// override OR the manifest GPU permission — via the shared resolveWantsGpu
	// helper. Reading only the raw override under-counted apps relying on the
	// manifest default (GPU permission, never toggled), so the exclusivity banner
	// silently missed real GPU-holding apps.
	async listAppsWithGpuAccess(): Promise<string[]> {
		const allGpuAccess = await Promise.all(
			this.instances.map(async (app) => {
				const [override, manifest] = await Promise.all([
					app.getGpuAccess().catch(() => undefined),
					app.readManifest().catch(() => undefined),
				])
				return {
					id: app.id,
					wantsGpu: resolveWantsGpu(override, manifest?.permissions),
				}
			}),
		)
		return allGpuAccess.filter(({wantsGpu}) => wantsGpu).map(({id}) => id)
	}

	// 322-05 (IDENT-02): thin passthrough to the app instance's "Enable SSO" toggle
	// (mirrors setGpuAccess). The admin/domain gate + provider rebuild live in the
	// setOidcEnabled route; this only persists the per-app override.
	async setOidcEnabled(appId: string, enabled: boolean) {
		const app = this.getApp(appId)
		return app.setOidcEnabled(enabled)
	}

	// 322-05 (IDENT-02, Pitfall 7): thin passthrough to the app instance's write-only
	// DEK-encrypted Immich admin-key store (the route already restricts appId to 'immich').
	async setImmichApiKey(appId: string, apiKey: string) {
		const app = this.getApp(appId)
		return app.setImmichApiKey(apiKey)
	}

	// 322-05 (IDENT-02, D-322-8): resolve the currently SSO-enabled apps into the
	// OidcEnabledApp[] the in-process provider rebuilds its static clients from. Only
	// apps that are BOTH oidcNative (manifest) AND toggled on (getOidcEnabled) qualify.
	// Returns [] on a no-domain box — no stable issuer, so no clients to register.
	async listOidcEnabledApps(): Promise<OidcEnabledApp[]> {
		const domainConfig = await this.getDomainConfig()
		const mainDomain = domainConfig?.active ? domainConfig.domain : null
		if (!mainDomain) return []

		const subdomains = await this.getAllSubdomains()
		const subByAppId = new Map(subdomains.map((s) => [s.appId, s]))

		const results: OidcEnabledApp[] = []
		for (const app of this.instances) {
			try {
				const [manifest, enabled] = await Promise.all([
					app.readManifest().catch(() => undefined),
					app.getOidcEnabled().catch(() => undefined),
				])
				if (!manifest?.installOptions?.oidcNative) continue
				if (enabled !== true) continue

				// Resolve the app's public host: prefer the canonical FQDN minted by
				// Server5 (Phase 140 hyphen-pattern) when present, else compute
				// {subdomain}.{mainDomain} — operator-renamed-subdomain-safe.
				const sub = subByAppId.get(app.id)
				const subdomain = sub?.subdomain || manifest.installOptions?.subdomain || app.id
				const host = sub?.host || `${subdomain}.${mainDomain}`

				const redirectUris = this.buildOidcRedirectUris(app.id, host)
				if (redirectUris.length === 0) continue
				results.push({appId: app.id, redirectUris})
			} catch (error) {
				this.logger.error(`[oidc] failed to resolve enabled app ${app.id}`, error)
			}
		}
		return results
	}

	// 322-05 (IDENT-02, T-322-17): FIXED per-app redirect-URI templates. Only the
	// resolved host is interpolated — the PATH is an immutable literal per app id, so
	// no manifest/user free string can reach the URI (open-redirect / URI-injection
	// surface). panva re-validates exact-match at auth time.
	private buildOidcRedirectUris(appId: string, host: string): string[] {
		const base = `https://${host}`
		switch (appId) {
			case 'nextcloud':
				return [`${base}/apps/user_oidc/code`]
			case 'vaultwarden':
				return [`${base}/identity/connect/oidc-signin`]
			case 'gitea':
				return [`${base}/user/oauth2/livos/callback`]
			case 'immich':
				return [`${base}/auth/login`, `${base}/user-settings`, `${base}/api/oauth/mobile-redirect`]
			default:
				return []
		}
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

			// Write the docker-compose.yml from platform DB.
			// Phase 349 (CR-01 defense-in-depth): the platform catalog is NOT the
			// sanctioned VM source — VMs are backend-owned templates (modules/vm)
			// consumed programmatically, never the app-install path. A catalog row is
			// TRUSTED (isGeneratedTemplate=true → skips the non-builtin sanitizer), so a
			// row carrying the kernel-facing /dev/kvm device would mint a privileged VM
			// container purely on catalog provenance. Strip /dev/kvm from any catalog app
			// that is NOT a known VM id — fail-closed; no non-VM app has any legitimate
			// use for the KVM device. (GPU /dev/dri and VPN /dev/net/tun + NET_ADMIN are
			// left intact — legitimately used by transcoder/VPN catalog apps.) Known VM
			// ids keep it but are admin-gated + KVM-preflighted at the install call site.
			let composeToWrite: string = data.docker_compose
			if (!VM_APP_IDS.has(appId) && typeof data.docker_compose === 'string' && data.docker_compose.includes('/dev/kvm')) {
				try {
					const yaml = (await import('js-yaml')).default
					const parsed = yaml.load(data.docker_compose)
					const {compose, stripped} = stripKvmDeviceFromCompose(parsed)
					if (stripped) {
						composeToWrite = yaml.dump(compose, {lineWidth: -1, noRefs: true})
						this.logger.log(`Phase 349 CR-01: stripped /dev/kvm from non-VM catalog compose for ${appId}`)
					}
				} catch {
					// Could not parse to strip → refuse rather than write an un-de-fanged
					// KVM compose for a non-VM id (fail-closed).
					this.logger.error(`Phase 349 CR-01: refusing unparseable catalog compose carrying /dev/kvm for ${appId}`)
					return null
				}
			}
			await fse.writeFile(path.join(tmpDir, 'docker-compose.yml'), composeToWrite)

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
				// Hermes incident (2026-07-02): thread the store importer's
				// authoritative main-service + internal-port metadata through to the
				// installed manifest. Without these, both install paths fall back to
				// name heuristics / "manifest.port is internal" assumptions, which
				// break multi-service catalog apps (wrong service published / proxy
				// to a container port nothing listens on → 502).
				mainService: data.manifest?.mainService ?? undefined,
				internalPort: data.manifest?.internalPort ?? undefined,
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
	// (Server5 was retired — these helpers now call the PLATFORM Next.js app at
	// livinity.io: POST/DELETE /api/me/app-subdomain, which holds the sole CF API
	// token and makes the real Cloudflare DNS + Tunnel-ingress calls.) So
	// installing/uninstalling an app on the home LivOS box triggers Cloudflare
	// DNS + Tunnel ingress creation/removal at the edge. On a FREE (BYO-domain)
	// box the provisionAppSubdomain branch above handles this locally instead.
	//
	// Both calls are best-effort: on failure (platform unreachable, missing
	// api-key, missing platform url, network error) we log + continue. The
	// existing install/uninstall flow must succeed without these calls for
	// self-hosted users and air-gapped deployments.
	//
	// Deviation (Rule 3): plan 140-08 prescribed a new `server5-client.ts`
	// abstraction. Skipped — two helpers reusing the same Redis-keyed fetch
	// pattern as reportInstallEvent above is enough; introducing a class
	// wrapper for two HTTP calls is over-engineering. Sacred SHA
	// f3538e1d811992b782a9bb057d1b7f0a0189f95f preserved.

	/**
	 * FREE tier — load the box-side Cloudflare config (operator's own token +
	 * domain) if this box was installed with --cf-token. Returns null on a PRO
	 * box (no local CF secrets) or on any missing/malformed piece, in which case
	 * the caller falls through to the platform-managed path (Pro untouched).
	 *
	 * Zone id is discovered once from the operator's apex and cached in Redis so
	 * every install doesn't re-probe the CF /zones endpoint.
	 */
	private async loadLocalCfConfig(): Promise<LocalCfConfig | null> {
		try {
			const [apiTokenRef, tunnelTokenRef, apex] = await Promise.all([
				this.#livinityd.ai.redis.get(REDIS_CF_API_TOKEN_REF),
				this.#livinityd.ai.redis.get(REDIS_CF_TUNNEL_TOKEN_REF),
				this.#livinityd.ai.redis.get(REDIS_TUNNEL_DOMAIN),
			])
			if (!apiTokenRef || !tunnelTokenRef || !apex) return null

			const [apiTokenRaw, tunnelTokenRaw] = await Promise.all([
				fse.readFile(apiTokenRef, 'utf8').catch(() => ''),
				fse.readFile(tunnelTokenRef, 'utf8').catch(() => ''),
			])
			const apiToken = parseCfApiTokenSecret(apiTokenRaw)
			const decoded = decodeTunnelToken(tunnelTokenRaw)
			if (!apiToken || !decoded) return null

			let zoneId = await this.#livinityd.ai.redis.get(REDIS_CF_ZONE_ID).catch(() => null)
			if (!zoneId) {
				zoneId = await discoverZoneId(apiToken, apex)
				if (!zoneId) {
					this.logger.error(`FREE tier: could not discover a Cloudflare zone for apex '${apex}' — check the API token scope + that the zone exists`)
					return null
				}
				await this.#livinityd.ai.redis.set(REDIS_CF_ZONE_ID, zoneId).catch(() => {})
			}

			return {apiToken, accountId: decoded.accountId, tunnelId: decoded.tunnelId, zoneId, apex}
		} catch (error) {
			this.logger.error('FREE tier: failed to load local Cloudflare config', error)
			return null
		}
	}

	/**
	 * Provision a Cloudflare subdomain for an installed app.
	 * FREE tier (own domain + own CF token): provisioned box-side on the
	 * operator's own zone. PRO tier (no local CF secrets): provisioned via the
	 * platform (livinity.io). Returns the assigned subdomain + URL on success,
	 * null on any failure (best-effort — caller MUST tolerate null and continue).
	 */
	private async provisionAppSubdomain(
		appId: string,
		port: number,
	): Promise<{subdomain: string; url: string; ready?: boolean; readyAt?: number} | null> {
		// FREE tier branch — BEFORE the platform api-key gate. A box with its own
		// CF token provisions locally on the operator's zone; Pro boxes (no local
		// secrets) fall through to the unchanged platform path below.
		const localCf = await this.loadLocalCfConfig()
		if (localCf) {
			try {
				const result = await provisionAppSubdomainLocal(localCf, appId)
				this.logger.log(`FREE tier: provisioned ${result.host} for ${appId} on the operator's own Cloudflare zone`)
				// DNS is created synchronously + proxied (CF-proxied propagation ~1-5s),
				// so mark ready so the UI/Caddy adopt the canonical host immediately.
				return {subdomain: result.subdomain, url: result.url, ready: true}
			} catch (error) {
				this.logger.error(`FREE tier: local CF provisioning failed for ${appId}`, error)
				return null
			}
		}

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
		// FREE tier branch — mirror provisionAppSubdomain. Removing the CNAME +
		// tunnel ingress on the operator's own zone (cf-saas :753 parity) so a
		// free-tier uninstall never orphans DNS. Pro boxes fall through.
		const localCf = await this.loadLocalCfConfig()
		if (localCf) {
			try {
				await deprovisionAppSubdomainLocal(localCf, appId)
				this.logger.log(`FREE tier: deprovisioned ${appId} from the operator's own Cloudflare zone`)
			} catch (error) {
				this.logger.error(`FREE tier: local CF deprovisioning failed for ${appId} (non-fatal)`, error)
			}
			return
		}

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

	// Reliability B5 — `rethrow: true` makes a Caddy write/validate/reload
	// failure visible to the caller (used by the interactive install path so
	// its pRetry + loud SC6 failure are real). Default stays swallow: the BOOT
	// path must never turn one bad block into a daemon-boot abort (T4 class).
	private async rebuildCaddyFromState(opts: {rethrow?: boolean} = {}): Promise<void> {
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
					// Phase 332 (WAF-01/02): re-thread the per-app protection on EVERY
					// emit from the live `appSecurity` store key (same discipline as
					// publicAccess — a stale cached SubdomainConfig.waf is dropped). '' emit
					// when absent keeps the block byte-identical (SC5).
					const waf = await this.getAppWafConfig(s.appId)
					const {publicAccess: _stale, waf: _staleWaf, ...rest} = s
					return {...rest, ...(publicAccess ? {publicAccess} : {}), ...(waf ? {waf} : {})}
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
			this.logger.error(`[caddy] rebuildCaddyFromState failed${opts.rethrow ? '' : ' (non-fatal)'}`, err)
			if (opts.rethrow) throw err
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
					// Self-heal (2026-07-02): the container IS running (it appears in
					// `docker ps`), so force the row's status to 'running'. Rows written
					// by the pre-fix createUserAppInstance INSERT omitted `status`, so on
					// boxes whose column default is not 'running' they landed a non-running
					// status → buildCaddyConfigFromState (caddy-state.ts:114) skipped them →
					// NO Caddy block was emitted → the app served an empty 200 and opened as
					// a blank white window. This UPDATE repairs those existing rows on the
					// next boot (which an update triggers), so the operator does NOT have to
					// reinstall. Safe: only ever sets 'running' for a confirmed-running
					// container.
					await pool
						.query(
							`UPDATE user_app_instances SET status = 'running'
							 WHERE (container_name = $1 OR (user_id = $2 AND app_id = $3)) AND status <> 'running'`,
							[name, userId, appSlug],
						)
						.catch((err) => this.logger.error(`[recon] status self-heal failed for ${name}`, err))
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

	// ─── Phase 332 (WAF-01/02) — per-app protection persistence ──────────────

	/**
	 * Read the per-app WAF/protection config from the dedicated `appSecurity`
	 * store key. Returns undefined when the app has no protection set (→ zero
	 * Caddy emit, byte-identical block). Best-effort: a read error fails to
	 * undefined (open for the app — WAF is additive; never breaks routing).
	 */
	async getAppWafConfig(appId: string): Promise<AppWafConfig | undefined> {
		try {
			const state = await this.#livinityd.store.get('appSecurity')
			const cfg = state?.apps?.[appId]
			if (!cfg) return undefined
			// Only surface a config that has at least one active control.
			const hasContent = (cfg.banIps?.length ?? 0) > 0 || (cfg.banUserAgents?.length ?? 0) > 0 || !!cfg.abuseBan
			return hasContent ? cfg : undefined
		} catch (error) {
			this.logger.error(`getAppWafConfig: failed for ${appId}`, error)
			return undefined
		}
	}

	/**
	 * Persist a per-app WAF/protection config to the `appSecurity` store key and
	 * regenerate the Caddyfile so it takes effect WITHOUT a reinstall (mirrors the
	 * setPublicAccess → registerAppSubdomain flow). Rejects a config that fails
	 * strict validation BEFORE persisting (injection kill — the route also
	 * validates, this is defense in depth). Uses the FileStore write lock so a
	 * concurrent per-app write can't clobber the sibling apps map.
	 */
	async setAppWafConfig(appId: string, cfg: AppWafConfig): Promise<void> {
		const problems = validateWafConfig(cfg)
		if (problems.length > 0) {
			throw new Error(`[waf-invalid] ${problems.join('; ')}`)
		}
		// 332-REVIEW WARN-1 (defense in depth): capture the PRIOR value so a config
		// that somehow still fails `caddy validate` (a future emit bug, an entry that
		// slips the validator) can be ROLLED BACK — it must never persist and freeze
		// every future Caddy regen. The write + regen-verify + rollback are one unit.
		let priorEntry: AppWafConfig | undefined
		await this.#livinityd.store.getWriteLock(async ({get, set}) => {
			const state = (await get('appSecurity')) ?? {apps: {}}
			priorEntry = state.apps?.[appId]
			const apps = {...(state.apps ?? {})}
			// Normalize: drop empty arrays / false so an all-cleared config removes
			// the entry entirely (keeps the store tidy + getAppWafConfig undefined).
			const next: AppWafConfig = {}
			if (cfg.banIps && cfg.banIps.length > 0) next.banIps = cfg.banIps
			if (cfg.banUserAgents && cfg.banUserAgents.length > 0) next.banUserAgents = cfg.banUserAgents
			if (cfg.abuseBan) next.abuseBan = true
			if (Object.keys(next).length === 0) {
				delete apps[appId]
			} else {
				apps[appId] = next
			}
			await set('appSecurity', {...state, apps})
		})
		// Regenerate the Caddyfile from live state — RETHROW so a validate failure
		// surfaces here (writeCaddyfile leaves the LIVE config untouched on a bad
		// generate, so the proxy is never taken down; we just need to know it failed).
		try {
			await this.rebuildCaddyFromState({rethrow: true})
		} catch (error) {
			// Roll the store back to the prior entry so the poison does not persist and
			// freeze every subsequent regen (the Phase-232 frozen-Caddyfile class), then
			// re-assert the previous good config and surface the failure to the admin.
			await this.#livinityd.store.getWriteLock(async ({get, set}) => {
				const state = (await get('appSecurity')) ?? {apps: {}}
				const apps = {...(state.apps ?? {})}
				if (priorEntry === undefined) delete apps[appId]
				else apps[appId] = priorEntry
				await set('appSecurity', {...state, apps})
			})
			await this.rebuildCaddyFromState({rethrow: false})
			throw new Error(
				`[waf-config-rejected] the generated Caddy config was rejected — protection change reverted (${
					error instanceof Error ? error.message : String(error)
				})`,
			)
		}
		// WAF-01 abuse-jail lifecycle (fail-soft): install the fail2ban jail when
		// ANY app now opts into abuse-ban, remove it when none do. Never blocks the
		// setter — a box without the wrapper/fail2ban just keeps the stock-Caddy
		// matcher leg (332-01). Best-effort; errors are swallowed inside the sink.
		try {
			const state = await this.#livinityd.store.get('appSecurity')
			const anyAbuseBan = Object.values(state?.apps ?? {}).some((c) => c?.abuseBan)
			if (anyAbuseBan) {
				await installAbuseJail(state?.jail ?? {}, {run: undefined, logger: this.logger})
			} else {
				await removeAbuseJail({run: undefined, logger: this.logger})
			}
		} catch (error) {
			this.logger.error('[waf] abuse-jail reconcile failed (non-fatal)', error)
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

	async registerAppSubdomain(
		appId: string,
		port: number,
		subdomain?: string,
		fullHost?: string,
		ready?: boolean,
		readyAt?: number,
		dnsStatus?: 'ready' | 'pending' | 'failed' | 'skipped',
		// Reliability B5 — strict=true propagates a Caddy apply failure to the
		// caller (the interactive install's pRetry), instead of logging inside
		// rebuildCaddyFromState and reporting phantom success. Non-strict
		// callers (per-user route, reapply, toggles) keep today's behaviour.
		strict = false,
	): Promise<void> {
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

		// Phase 301 — per-user DNS cap on the AUTO-install path. Only NEW per-user
		// subdomains count (re-registers update in place → existingIdx>=0; builtin/
		// global plain appIds have no owner → uncapped). Skip GRACEFULLY (never
		// throw / never break an install) when the owner is already at the cap —
		// the app still installs locally, it just doesn't get an auto public host.
		const ownerId = appIdOwner(appId)
		if (existingIdx < 0 && ownerId && countOwnedSubdomains(subdomains, ownerId) >= MAX_DNS_PER_USER) {
			this.logger.log(
				`DNS limit (${MAX_DNS_PER_USER}/user) reached for ${ownerId} — skipping auto-subdomain for ${appId}`,
			)
			return
		}

		const newSub: SubdomainConfig = {
			subdomain: subdomainName.toLowerCase(),
			appId,
			port,
			enabled: true,
			...(ownerId ? {userId: ownerId} : {}),
			...(fullHost ? {host: fullHost.toLowerCase()} : {}),
			...(upstreamBearer ? {upstreamBearer} : {}),
			...(publicAccess ? {publicAccess} : {}),
			// Phase 287: persist the Tier-1 platform-DoH readiness. A falsy `ready`
			// MUST omit the field so a pre-287 / not-yet-ready blob defaults to
			// NOT-ready on read (fail-safe → the UI shows Provisioning, never a
			// clickable broken link). The Tier-2 box-resolver re-poll flips it later.
			...(ready ? {subdomainReady: true, readyAt, readySource: 'platform-doh' as const} : {}),
			// Reliability B1 — truthful DNS provisioning status (see SubdomainConfig).
			...(dnsStatus ? {dnsStatus} : {}),
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
		await this.rebuildCaddyFromState({rethrow: strict})

		const displayHost = newSub.host ?? `${subdomainName}.${domainConfig.domain}`
		this.logger.log(`Registered subdomain ${displayHost} -> localhost:${port} for ${appId}`)
	}

	/**
	 * Phase 287 — Tier-2 box-resolver advisory re-poll. Runs ONLY when Tier-1
	 * (platform DoH, from the Vercel route) did not confirm the record at install
	 * time. Loops the box's OWN resolver (`verifyDns(host, '', true)` — tunnelMode
	 * floor = "resolves anywhere = pass") on a hard 60s budget / 5s interval; on
	 * the first resolve it flips `subdomainReady=true` + `readySource:'box-resolver'`
	 * on the persisted SubdomainConfig.
	 *
	 * WEAK signal: the box resolver (Tailscale MagicDNS / resolv.conf) is NOT the
	 * operator's client resolver, so this is a floor for the slow-box case only,
	 * not proof the operator's browser can resolve it. Fire-and-forget + fully
	 * advisory: it NEVER throws into the install path (caller wraps it in
	 * `.catch(() => {})`), and it never overwrites an existing readiness flag.
	 */
	private async rePollSubdomainReady(appId: string, host: string): Promise<void> {
		const deadline = Date.now() + 60_000
		while (Date.now() < deadline) {
			try {
				const {resolved, match} = await verifyDns(host, '', true)
				if (resolved && match) {
					const subs = await this.getSubdomains()
					const idx = subs.findIndex((s) => s.appId === appId)
					if (idx >= 0 && !subs[idx].subdomainReady) {
						subs[idx] = {
							...subs[idx],
							subdomainReady: true,
							readyAt: Date.now(),
							readySource: 'box-resolver',
							// Reliability B1 — the pending status resolves here.
							dnsStatus: 'ready',
						}
						await this.setSubdomains(subs)
					}
					return
				}
			} catch {
				/* advisory — ignore and retry */
			}
			await new Promise((r) => setTimeout(r, 5_000))
		}
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

		// Phase 349 (VM-01 security review + CR-01): VM apps are ADMIN-ONLY.
		// installForUser is the per-user (non-admin member) install path (routes.ts
		// install → the role!=='admin' branch), which bypasses assertInstallAllowed
		// entirely — so a member must not be able to get a per-user VM with
		// /dev/kvm+NET_ADMIN here. Refuse regardless of caller (v1 VMs are global
		// admin-installed shared apps, never per-user instances). CR-01: key the
		// refusal off the RESOLVED compose (+ VM id set / manifest flag), not
		// getBuiltinApp alone — the windows/vm builtins are gone, so a catalog-served
		// VM compose would otherwise pass this gate for a member.
		let perUserComposeText = ''
		try {
			perUserComposeText = await fse.readFile(`${appTemplatePath}/docker-compose.yml`, 'utf8')
		} catch {}
		const perUserRequiresKvm =
			getBuiltinApp(appId)?.requiresKvm === true ||
			(manifest as {requiresKvm?: boolean}).requiresKvm === true ||
			VM_APP_IDS.has(appId) ||
			composeRequiresKvm(perUserComposeText)
		if (perUserRequiresKvm) {
			throw new InstallForbidden(
				'This app requires admin privileges to install (runs a virtual machine with hardware device access) — per-user VM instances are not supported',
			)
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

		// Hermes incident (2026-07-02) — main-service + internal-port detection.
		// The old logic blindly took services[0] as main and treated manifest.port
		// as the INTERNAL port. Both are wrong for multi-service catalog apps:
		// hermes-agent-with-webui's services are [hermes-agent, hermes-webui] (the
		// UI is NOT first) and manifest.port (42050) is the HOST port — the UI
		// listens on 8787 inside. That produced a mapping to a container port
		// nothing listens on → 502 behind the gate.
		// Priority now: (1) manifest.mainService / manifest.internalPort — written
		// by the store importer, authoritative; (2) the container side of the main
		// service's OWN host mapping in the compose; (3) legacy umbrel semantics
		// (manifest.port IS the internal port); (4) 8080.
		const svcNames = Object.keys(composeData.services || {})
		const declaredMain = (manifest as {mainService?: string}).mainService
		const mainServiceName = (declaredMain && composeData.services?.[declaredMain] ? declaredMain : undefined)
			|| svcNames.find((n) => n === appId || n === 'server' || n === 'app' || n === 'web')
			|| svcNames.find((n) => !['docker', 'dind', 'tor', 'proxy', 'sidecar', 'init'].includes(n))
			|| svcNames[0]
		let internalPort: number = Number((manifest as {internalPort?: number}).internalPort) || 0
		if (!internalPort && mainServiceName && composeData.services[mainServiceName]) {
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
			if (!internalPort && service.expose && Array.isArray(service.expose)) {
				internalPort = parseInt(service.expose[0].toString(), 10)
			}
		}
		if (!internalPort) internalPort = manifest.port || 8080

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
		//
		// Phase 341-02 (REPO-02, D-341-2 §2b) — CLOSE THE MULTI-USER SENTINEL GAP,
		// FAIL-CLOSED. Previously this was a BARE injectAiProviderConfig that always
		// wired the REAL broker OAuth sentinel with no chooseCredentialPath branch —
		// so anything reaching installForUser got broker access. Now it keys off the
		// SAME trust dimension install() uses (isGeneratedTemplate, computed L2731):
		//   - VERIFIED (official/builtin, isGeneratedTemplate===true) → sentinel,
		//     BYTE-IDENTICAL to the previous behavior (the ONLY case that reaches
		//     installForUser today — no change for existing apps).
		//   - UNVERIFIED (isGeneratedTemplate===false) → per-app metered key, NEVER
		//     the operator sentinel (the fail-closed guard for this latent path).
		// Federated apps NEVER reach installForUser — they install via
		// installFederated, which injects NO credential at all.
		if (manifest.requiresAiProvider === true) {
			if (chooseCredentialPath({isGeneratedTemplate}) === 'metered-key') {
				const {virtualKey, keyId} = await mintMeteredKeyForApp(
					{appSlug: appId, userId, budget: {maxUsd: 5}, modelAllowlist: undefined},
					this.#brokerClient(),
				)
				injectAiProviderConfig(composeData, userId, manifest, {virtualKey})
				// NOTE (341-02 deviation, documented): user_app_instances has no
				// meteredKeyId column, so per-user metered keys are not yet persisted
				// for uninstall-revocation. This branch is effectively dead today
				// (installForUser only sees isGeneratedTemplate===true official apps);
				// revocation-parity for a future federated/unverified multi-user path
				// is a documented follow-up — do NOT expand the schema this phase.
				this.logger.log(`341-02: installForUser UNVERIFIED ${appId} → per-app metered key (keyId=${keyId}); operator OAuth NOT lent`)
			} else {
				// VERIFIED → broker sentinel (unchanged for official/builtin).
				injectAiProviderConfig(composeData, userId, manifest)
			}
		}

		// Set the host port mapping on the main service — and STRIP host ports
		// from every other service. A per-user instance is only reachable via its
		// allocated port; sidecar host publishes from the catalog compose (e.g. a
		// second service declaring the catalog's fixed 42xxx port) would race
		// other instances/services for the host port (the hermes 42050 collision
		// class). Inter-service traffic rides the docker network by name and
		// needs no host publish.
		for (const svcName of Object.keys(composeData.services || {})) {
			if (svcName === mainServiceName) continue
			if (composeData.services[svcName]?.ports) delete composeData.services[svcName].ports
		}
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

		// Reliability A3 — honest per-user install. `up -d` returning 0 only means
		// "containers created"; a container that immediately exits/dies (bad env,
		// broken image) previously still got a DB row + subdomain and reported
		// success — the user landed on a dead tile. Take one classifying sample
		// after a short grace and abort ONLY on the terminal 'failed' verdict
		// (exited/dead — a `restart: unless-stopped` crash-looper shows
		// 'restarting' → 'pending' → passes). Timeout/starting/unhealthy samples
		// stay non-fatal: slow boots must not break install, and the per-user
		// state endpoint derives live status from docker inspect anyway.
		{
			const mainContainerName = `${appId}_${mainServiceName || 'app'}_user_${user.username}_1`
			await new Promise((r) => setTimeout(r, 6_000))
			try {
				const {stdout: status} = await $`docker inspect -f {{.State.Status}} ${mainContainerName}`
				const {stdout: health} = await $`docker inspect -f {{.State.Health.Status}} ${mainContainerName}`
				if (classifyInspect({status: status.trim(), health: health.trim()}) === 'failed') {
					this.logger.error(`Per-user container ${mainContainerName} is terminally dead post-up (status=${status.trim()}) — tearing down so a retry starts clean`)
					await $`docker compose --file ${userDataDir}/docker-compose.yml --project-name ${appId}-user-${user.username} down`.catch(
						(err) => this.logger.error(`Cleanup of dead per-user stack ${appId} failed`, err),
					)
					throw new Error(`App ${appId} failed to start (container ${mainContainerName} is ${status.trim()})`)
				}
			} catch (error) {
				// Re-throw only our own terminal verdict; inspect flakes (name
				// mismatch, docker hiccup) stay non-fatal.
				if (error instanceof Error && error.message.includes('failed to start')) throw error
				this.logger.log(`[health] per-user post-up sample unavailable for ${mainContainerName} (non-fatal)`)
			}
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

		// Reliability B1 (per-user DNS gap) — provision the Cloudflare DNS +
		// Tunnel ingress for the per-user subdomain. This call was PRESENT on the
		// global install path (#finishInstall) but MISSING here, so every install
		// that went through the per-user path (the cloud install_commands poller
		// AND the store iframe) created the container + local Caddy route but
		// NEVER minted a public CNAME → "app installed and running, but the
		// subdomain never resolves (000)". Proven live 2026-07-02 (openspeedtest
		// via poller: success=true yet <slug>-everything.livinity.io = no DNS).
		// Best-effort + never throws: on a Server5 outage / missing api-key the
		// install still succeeds and the local Caddy route stands; dnsStatus
		// records the truth. The platform route derives the username from the
		// box api-key, so the minted host is `<appId>-<owner>` — matching the
		// owner-install (poller/store) case. A genuine SECOND box user still
		// needs the per-tenant key work (tracked separately); this closes the
		// dominant owner-install gap.
		try {
			const provisioned = await this.provisionAppSubdomain(appId, port)
			if (provisioned) {
				this.logger.log(
					`Per-user install: provisioned CF subdomain for ${appId} (user ${user.username}) → ${provisioned.url} (ready=${provisioned.ready ?? false})`,
				)
			} else {
				const hasApiKey = Boolean(await this.#livinityd.ai.redis.get(REDIS_PLATFORM_API_KEY).catch(() => null))
				this.logger.error(
					hasApiKey
						? `Per-user install: CF subdomain provisioning FAILED for ${appId} (user ${user.username}) — the app runs but its public host will not resolve. Server5 outage or 409; a re-install re-provisions.`
						: `Per-user install: no platform api-key — skipping CF subdomain for ${appId} (LAN/self-hosted; local Caddy route still applied).`,
				)
			}
		} catch (error) {
			this.logger.error(`Per-user install: provisionAppSubdomain threw for ${appId} (non-fatal)`, error)
		}

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

		// Reliability B1 (per-user DNS gap) — deprovision the CF DNS + Tunnel
		// ingress BEFORE teardown, mirroring the global uninstall path (which
		// always did this). Its absence here left an orphan CNAME after every
		// per-user uninstall → the "530 error" debris the operator saw when
		// revisiting a removed app's old host. Best-effort: swallows errors so
		// the local uninstall always proceeds.
		await this.deprovisionAppSubdomain(appId)

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
