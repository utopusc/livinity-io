import crypto from 'node:crypto'
import nodePath from 'node:path'

import fse from 'fs-extra'
import yaml from 'js-yaml'
import {type Compose} from 'compose-spec-schema'
import {$} from 'execa'
import fetch from 'node-fetch'
import stripAnsi from 'strip-ansi'
import pRetry from 'p-retry'

import getDirectorySize from '../utilities/get-directory-size.js'
import {pullAll} from '../utilities/docker-pull.js'
import FileStore from '../utilities/file-store.js'
import {fillSelectedDependencies} from '../utilities/dependencies.js'
import type Livinityd from '../../index.js'
import {detectNvidiaGpu, isNvidiaToolkitConfigured, detectGpu} from '../system/gpu.js'
import {validateManifest, type AppSettings} from './schema.js'
import appScript from './legacy-compat/app-script.js'
import {reconcileAppVolumeOwnership} from './reconcile-volume-ownership.js'
import {pollContainerHealth} from './health-poll.js'

async function readYaml(path: string) {
	return yaml.load(await fse.readFile(path, 'utf8'))
}

async function writeYaml(path: string, data: any) {
	return fse.writeFile(path, yaml.dump(data))
}

export async function readManifestInDirectory(dataDirectory: string) {
	// Read livinity-app.yml manifest, fall back to legacy umbrel-app.yml (Umbrel app-store compatibility)
	let parseYaml
	try {
		parseYaml = await readYaml(`${dataDirectory}/livinity-app.yml`)
	} catch {
		parseYaml = await readYaml(`${dataDirectory}/umbrel-app.yml`)
	}
	return validateManifest(parseYaml)
}

/**
 * 316-02 (GPU-02) — the SINGLE source of truth for "does this app want the GPU".
 * An explicit per-app override (`gpuAccess` in settings.yml) always wins; when
 * unset (`undefined`) it falls back to the manifest GPU permission
 * (`GPU` or `GPU-NVIDIA`). Shared by `patchComposeFile` (the runtime compose
 * patch) and `apps.listAppsWithGpuAccess` (the exclusivity-warning list, IN-04)
 * so both agree on which apps hold the GPU — a raw override read under-counts
 * manifest-default GPU apps. Normalizes to a definite boolean.
 */
export function resolveWantsGpu(
	gpuAccessOverride: boolean | undefined,
	permissions: string[] | undefined,
): boolean {
	const appRequestsGpuAccess = permissions?.includes('GPU') ?? false
	const appRequestsNvidia = permissions?.includes('GPU-NVIDIA') ?? false
	return gpuAccessOverride ?? (appRequestsGpuAccess || appRequestsNvidia)
}

type AppState =
	| 'unknown'
	| 'installing'
	| 'starting'
	| 'running'
	| 'stopping'
	| 'stopped'
	| 'restarting'
	| 'uninstalling'
	| 'updating'
	| 'ready'
	// Phase 260-01 (SC1): terminal state set by uninstall() so the field never
	// wedges on the transient 'uninstalling' value.
	| 'not-installed'
	// Reliability A3: STABLE honest state for "installed but the container is
	// crash-looping / failed its healthcheck". Landed by the install health
	// gate; cleared (→'ready') by the continuous health monitor the moment the
	// container comes good, so a slow-boot app self-corrects instead of
	// wedging (what made the old v44.45 hard-fail unsafe).
	| 'unhealthy'
// TODO: Change ready to running.
// Also note that we don't currently handle failing events to update the app state into a failed state.
// That should be ok for now since apps rarely fail, but there will be the potential for state bugs here
// where the app instance state gets out of sync with the actual state of the app.
// We can handle this much more robustly in the future.

export default class App {
	#livinityd: Livinityd
	logger: Livinityd['logger']
	id: string
	dataDirectory: string
	state: AppState = 'unknown'
	stateProgress = 0
	store: FileStore<AppSettings>

	constructor(livinityd: Livinityd, appId: string) {
		// Throw on invalid appId
		if (!/^[a-zA-Z0-9-_]+$/.test(appId)) throw new Error(`Invalid app ID: ${appId}`)

		this.#livinityd = livinityd
		this.id = appId
		this.dataDirectory = `${livinityd.dataDirectory}/app-data/${this.id}`
		const {name} = this.constructor
		this.logger = livinityd.logger.createChildLogger(name.toLowerCase())
		this.store = new FileStore({filePath: `${this.dataDirectory}/settings.yml`})
	}

	readManifest() {
		return readManifestInDirectory(this.dataDirectory)
	}

	readCompose() {
		return readYaml(`${this.dataDirectory}/docker-compose.yml`) as Promise<Compose>
	}

	async deriveDeterministicPassword() {
		const livinitySeed = await fse.readFile(`${this.#livinityd.dataDirectory}/db/livinity-seed/seed`)
		const identifier = `app-${this.id}-seed-APP_PASSWORD`
		const deterministicPassword = crypto.createHmac('sha256', livinitySeed).update(identifier).digest('hex')

		return deterministicPassword
	}

	writeCompose(compose: Compose) {
		return writeYaml(`${this.dataDirectory}/docker-compose.yml`, compose)
	}

	async patchComposeFile(environmentOverrides?: Record<string, string>) {
		const manifest = await this.readManifest()
		const DRI_DEVICE_PATH = '/dev/dri'
		const deviceHasGpu = await fse.exists(DRI_DEVICE_PATH).catch(() => false)

		// 316-02 (GPU-02): per-app GPU-access override + NVIDIA branch inputs.
		// Read/probe ONCE per patch (not per service). `gpuAccessOverride` is
		// undefined | boolean — undefined falls back to the manifest default so
		// an app nobody has toggled keeps exactly today's behavior. The shared
		// `resolveWantsGpu` helper is the single source of truth (IN-04 reuses it
		// in listAppsWithGpuAccess). The NVIDIA probes never throw (degrade to false).
		const gpuAccessOverride = await this.store.get('gpuAccess')
		const wantsGpu = resolveWantsGpu(gpuAccessOverride, manifest.permissions)
		const hostHasNvidia = wantsGpu ? await detectNvidiaGpu() : false
		const nvidiaToolkitInstalled = wantsGpu ? await isNvidiaToolkitConfigured() : false

		// 330 GPU-05 (GPU-04): bare-metal AMD probe. Read ONCE per patch (same
		// discipline as the NVIDIA probes above), guarded by wantsGpu so an app
		// nobody has toggled never shells out. `detectGpu()` never throws (degrades
		// to vendor:'none'). WSL2-AMD gets NO compose change (no /dev/kfd there —
		// it exposes /dev/dxg instead, FLAG 2 bare-metal-only).
		const gpuInfo = wantsGpu ? await detectGpu() : null
		const hostVendorAmd = gpuInfo?.vendor === 'amd'
		const hostWsl2 = gpuInfo?.wsl2 ?? false

		const compose = await this.readCompose()

		// Remove legacy app_proxy service if present (we use Caddy instead)
		if (compose.services?.app_proxy) {
			delete compose.services.app_proxy
			this.logger.log(`Removed app_proxy service from ${this.id} - using Caddy for reverse proxy`)
		}

		// Expose the app port to host for Caddy reverse proxy
		// manifest.port is the HOST port. Container internal port may differ.
		if (manifest.port) {
			const serviceNames = Object.keys(compose.services!)

			// Hermes incident (2026-07-02): if ANY service already publishes
			// manifest.port as a host port, the compose already owns the routing
			// port — do NOT force-add another mapping. Previously the name
			// heuristic picked the wrong service on multi-service catalog apps
			// (hermes-agent-with-webui: services [hermes-agent, hermes-webui] —
			// no name matched, so [first non-infra] = hermes-agent), saw it had
			// no ports, and force-added 127.0.0.1:42050:42050 onto the AGENT
			// while hermes-webui already declared 42050:8787. Both then raced
			// for host 42050; the agent won the bind and the subdomain routed to
			// the agent gateway instead of the web UI → 502.
			const anyServicePublishesManifestPort = serviceNames.some((name) => {
				const ports = (compose.services![name]?.ports ?? []) as unknown[]
				return ports.some((p) => String(p).includes(`${manifest.port}:`))
			})
			if (anyServicePublishesManifestPort) {
				this.logger.log(`Port ${manifest.port} already published by the compose for ${this.id} — skipping force-add`)
			} else {
				// Catalog-imported manifests carry the authoritative main service
				// (manifest.mainService, written by the store importer). Prefer it;
				// fall back to the legacy name heuristic.
				const declaredMain = (manifest as {mainService?: string}).mainService
				const mainServiceName = (declaredMain && compose.services![declaredMain] ? declaredMain : undefined)
					|| serviceNames.find(name =>
						name === this.id || name === 'server' || name === 'app' || name === 'web'
					) || serviceNames.find(name =>
						// Skip known infrastructure services (DinD, sidecar proxies, etc.)
						!['docker', 'dind', 'tor', 'proxy', 'sidecar', 'init'].includes(name)
					) || serviceNames[0]

				if (mainServiceName && compose.services![mainServiceName]) {
					const service = compose.services![mainServiceName]
					if (!service.ports) {
						service.ports = []
					}
					// No existing mapping anywhere — add manifest.port:manifest.port
					// (legacy umbrel-style semantics: container listens on manifest.port).
					const portMapping = `127.0.0.1:${manifest.port}:${manifest.port}`
					service.ports.push(portMapping)
					this.logger.log(`Exposed port ${manifest.port}:${manifest.port} for ${this.id} (service ${mainServiceName})`)
				}
			}
		}

		for (const serviceName of Object.keys(compose.services!)) {
			// Temporary patch to fix contianer names for modern docker-compose installs.
			// The contianer name scheme used to be <project-name>_<service-name>_1 but
			// recent versions of docker-compose use <project-name>-<service-name>-1
			// swapping underscores for dashes. This breaks Livinity in places where the
			// containers are referenced via name and it also breaks referring to other
			// containers via DNS since the hostnames are derived with the same method.
			// We manually force all container names to the old scheme to maintain compatibility.
			if (!compose.services![serviceName].container_name) {
				compose.services![serviceName].container_name = `${this.id}_${serviceName}_1`
			}

			// Migrate downloads volume from old `${LIVINITY_ROOT}/data/storage/downloads` path to new
			// `${LIVINITY_ROOT}/home/Downloads` path. Also handle raw data directory migration from
			// `${LIVINITY_ROOT}/data/storage` to `${LIVINITY_ROOT}/home`.
			// We need to do this here to handle any future app updates.
			compose.services![serviceName].volumes = compose.services![serviceName].volumes?.map((volume) => {
				return (volume as string)
					?.replace('/data/storage/downloads', `/home/Downloads`)
					?.replace('/data/storage', `/home`)
			})

			// 316-02 (GPU-02): GPU passthrough. `wantsGpu` is the per-app override
			// (falls back to the manifest default when untouched, so existing apps
			// are byte-identical). Prefer an NVIDIA device reservation when an NVIDIA
			// GPU + a configured toolkit are present; otherwise fall back to the
			// EXISTING Intel/AMD /dev/dri passthrough, preserved unchanged.
			if (wantsGpu && hostHasNvidia && nvidiaToolkitInstalled) {
				const service = compose.services![serviceName]
				// The pinned compose-spec-schema `Compose` type does not model
				// deploy.resources.reservations.devices[].driver/count/capabilities
				// (Pitfall 5) — localized `as any` escape hatch, no package bump.
				const deploy = (service.deploy || {}) as any
				deploy.resources = {
					reservations: {devices: [{driver: 'nvidia', count: 'all', capabilities: ['gpu']}]},
				}
				service.deploy = deploy
			} else if (wantsGpu && hostVendorAmd && !hostWsl2) {
				// 330 GPU-05 (GPU-04): bare-metal AMD ROCm passthrough. Distinct from
				// the NVIDIA reservation and the generic /dev/dri arm: AMD compute needs
				// BOTH the KFD compute node AND the DRI render node, plus membership in
				// the video/render groups. Bare-metal ONLY (gated `!hostWsl2`) — WSL2
				// has no /dev/kfd (FLAG 2). Ordered BEFORE the generic deviceHasGpu arm
				// so an AMD host takes this richer branch rather than the /dev/dri-only one.
				const service = compose.services![serviceName]
				service.devices = service.devices || []
				service.devices.push('/dev/kfd', '/dev/dri')
				// group_add is not modeled by the pinned compose-spec-schema type —
				// localized `as any` escape hatch (same discipline as deploy.resources
				// above, Pitfall 5/7); no package bump. Device nodes + group list are
				// FIXED literals — no caller/manifest string reaches them (T-330-11).
				;(service as any).group_add = [...(((service as any).group_add as string[]) ?? []), 'video', 'render']
				// AMD Ollama needs the ROCm image, not the CUDA/CPU default (Pitfall 4).
				// App-scoped by this.id + the ollama/ollama: prefix guard. Generalizing
				// this image swap to a manifest field (option b) is DEFERRED to a later
				// plan — Ollama is the only gpuCapable app today.
				if (this.id === 'ollama' && typeof service.image === 'string' && service.image.startsWith('ollama/ollama:')) {
					service.image = 'ollama/ollama:rocm'
				}
			} else if (wantsGpu && deviceHasGpu) {
				// Pass through host DRI device to all app containers if the app requests it
				compose.services![serviceName].devices = compose.services![serviceName].devices || []
				compose.services![serviceName].devices.push(DRI_DEVICE_PATH)
			}
		}

		// Apply environment overrides from install dialog
		if (environmentOverrides && Object.keys(environmentOverrides).length > 0) {
			const envServiceNames = Object.keys(compose.services!)
			const mainServiceName = envServiceNames.find(name =>
				name === this.id || name === 'server' || name === 'app' || name === 'web'
			) || envServiceNames.find(name =>
				!['docker', 'dind', 'tor', 'proxy', 'sidecar', 'init'].includes(name)
			) || envServiceNames[0]
			const service = compose.services![mainServiceName]
			if (!service.environment) service.environment = {}

			if (Array.isArray(service.environment)) {
				// Array format: ["KEY=VALUE", ...]
				for (const [key, value] of Object.entries(environmentOverrides)) {
					const idx = (service.environment as string[]).findIndex((e: string) => typeof e === 'string' && e.startsWith(`${key}=`))
					if (idx >= 0) {
						(service.environment as string[])[idx] = `${key}=${value}`
					} else {
						(service.environment as string[]).push(`${key}=${value}`)
					}
				}
			} else {
				// Object format: {KEY: VALUE}
				for (const [key, value] of Object.entries(environmentOverrides)) {
					(service.environment as Record<string, string>)[key] = value
				}
			}
			this.logger.log(`Applied ${Object.keys(environmentOverrides).length} environment overrides for ${this.id}`)

			// v30.5 — Also write a `.env` file alongside docker-compose.yml so
			// MULTI-SERVICE apps can reference user-provided values via Docker
			// Compose `${VAR}` interpolation in non-main services. The override
			// values above only land in the mainService's `environment:` block;
			// without an .env file, secondary services see literal `${VAR}`
			// strings and crash on validation. (E.g. Suna's kortix-api needs
			// SUPABASE_URL etc. that user enters in install dialog targeting
			// frontend mainService.) The .env file is mode 0600 — secrets only
			// readable by livinityd's owner, never world-readable.
			try {
				const envFileLines: string[] = []
				for (const [key, value] of Object.entries(environmentOverrides)) {
					// Quote value if it contains spaces, =, $, or newlines (defensive)
					const needsQuote = /[\s=$\n"]/.test(value)
					const quoted = needsQuote
						? `'${value.replace(/'/g, `'\\''`)}'`
						: value
					envFileLines.push(`${key}=${quoted}`)
				}
				const envFilePath = `${this.dataDirectory}/.env`
				await fse.writeFile(envFilePath, envFileLines.join('\n') + '\n', {mode: 0o600})
				this.logger.log(`Wrote .env file at ${envFilePath} (${envFileLines.length} entries) for compose interpolation`)
			} catch (err: any) {
				this.logger.log(`[warn] Failed to write .env for ${this.id}: ${err?.message || err}`)
			}
		}

		// For apps that need CSRF origin whitelisting (e.g. Portainer behind reverse proxy)
		// dynamically inject the subdomain URL based on current domain config
		if (this.id === 'portainer') {
			try {
				const domainRaw = await this.#livinityd.ai.redis.get('livos:domain:config')
				if (domainRaw) {
					const domainConfig = JSON.parse(domainRaw)
					if (domainConfig?.active && domainConfig?.domain) {
						const subdomainsRaw = await this.#livinityd.ai.redis.get('livos:domain:subdomains')
						const subdomains = subdomainsRaw ? JSON.parse(subdomainsRaw) : []
						const sub = subdomains.find((s: {appId: string}) => s.appId === this.id)
						const subdomain = sub?.subdomain || this.id
						const origin = `${subdomain}.${domainConfig.domain}`

						const mainServiceName = Object.keys(compose.services!).find(n => n === 'portainer') || Object.keys(compose.services!)[0]
						const service = compose.services![mainServiceName]
						if (!service.environment) service.environment = {}
						if (typeof service.environment === 'object' && !Array.isArray(service.environment)) {
							;(service.environment as Record<string, string>).TRUSTED_ORIGINS = origin
						}
						this.logger.log(`Set TRUSTED_ORIGINS=${origin} for ${this.id}`)
					}
				}
			} catch (error) {
				this.logger.error(`Failed to set TRUSTED_ORIGINS for ${this.id}`, error)
			}
		}

		// Phase 278: Suna's frontend needs its backend URL pointed at the operator's
		// OWN public suna-api subdomain (was hardcoded to bruce.livinity.io in
		// builtin-apps.ts). Browsers can't resolve Docker hostnames + CSP blocks
		// internal IPs, so it must be the public domain. Render
		// `https://suna-api.<operator-domain>/v1` from the live domain config; the
		// static definition only carries a localhost placeholder.
		if (this.id === 'suna') {
			try {
				const domainRaw = await this.#livinityd.ai.redis.get('livos:domain:config')
				if (domainRaw) {
					const domainConfig = JSON.parse(domainRaw)
					if (domainConfig?.active && domainConfig?.domain) {
						const subdomainsRaw = await this.#livinityd.ai.redis.get('livos:domain:subdomains')
						const subdomains = subdomainsRaw ? JSON.parse(subdomainsRaw) : []
						// suna-api is registered as its own public subdomain; honour any
						// operator-customised value, else default to `suna-api`.
						const apiSub = subdomains.find(
							(s: {appId?: string; subdomain?: string}) =>
								s.subdomain === 'suna-api' ||
								(s.appId === this.id && s.subdomain?.startsWith('suna-api')),
						)
						const apiSubdomain = apiSub?.subdomain || 'suna-api'
						const backendUrl = `https://${apiSubdomain}.${domainConfig.domain}/v1`

						const frontend = compose.services?.['frontend']
						if (frontend) {
							if (!frontend.environment) frontend.environment = {}
							if (typeof frontend.environment === 'object' && !Array.isArray(frontend.environment)) {
								;(frontend.environment as Record<string, string>).NEXT_PUBLIC_BACKEND_URL = backendUrl
							}
							this.logger.log(`Set NEXT_PUBLIC_BACKEND_URL=${backendUrl} for ${this.id}`)
						}
					}
				}
			} catch (error) {
				this.logger.error(`Failed to set NEXT_PUBLIC_BACKEND_URL for ${this.id}`, error)
			}
		}

		await this.writeCompose(compose)
	}

	async pull() {
		const compose = await this.readCompose()
		const images = Object.values(compose.services!)
			.map((service) => service.image)
			.filter(Boolean) as string[]
		await pullAll(images, (progress) => {
			this.stateProgress = Math.max(1, progress * 99)
			this.logger.log(`Downloaded ${this.stateProgress}% of app ${this.id}`)
		})
	}

	async install(environmentOverrides?: Record<string, string>) {
		this.state = 'installing'
		this.stateProgress = 1

		await this.patchComposeFile(environmentOverrides)

		await this.pull()

		// Phase 286 (SC1/SC2/SC7): reconcile volume ownership to each service's
		// REAL uid via a root alpine helper container (works through the docker
		// group even though livinityd is non-root). Replaces the silently-failing
		// `chmod 777` block — chmod broke postgres PGDATA and the path check never
		// matched the unexpanded ${APP_DATA_DIR} token anyway. Runs AFTER pull so
		// `docker image inspect` can resolve Config.User for no-`user:` images
		// (e.g. n8n=node) on first install.
		await reconcileAppVolumeOwnership(this, {projectName: this.id})

		await pRetry(() => appScript(this.#livinityd, 'install', this.id), {
			onFailedAttempt: (error) => {
				this.logger.error(
					`Attempt ${error.attemptNumber} installing app ${this.id} failed. There are ${error.retriesLeft} retries left.`,
					error,
				)
			},
			retries: 2,
		})

		// Phase 286 (SC4): verify the main container is actually Running (+ healthy
		// if a healthcheck exists) before claiming 'ready'. A crash-looper now lands
		// an error state instead of the old "Up but 502" lie.
		try {
			const mainContainer = await this.getMainContainerName()
			if (mainContainer) {
				// 120s budget (vs the 90s default): the known false-negative class is
				// images that turn healthy at ~120s.
				await pollContainerHealth(mainContainer, {timeoutMs: 120_000, logger: this.logger})
			}
			this.state = 'ready'
		} catch (error) {
			// Reliability A3 — on FIRST INSTALL health is a gate again, with
			// degrade-not-fail semantics: the install itself still succeeds (no
			// throw — the app stays installed and `restart: unless-stopped` keeps
			// retrying), but the state lands the honest STABLE 'unhealthy' instead
			// of the silent-success 'ready' lie. The continuous health monitor
			// flips unhealthy→ready as soon as the container comes good, so a
			// slow-boot app self-corrects — that self-correction is what makes
			// gating safe where the pre-v44.45 hard `throw` (which marked
			// umami/pastefy/openclaw/campfire "Failed to start") was not. The
			// start/boot path below stays ADVISORY (v44.45 hotfix preserved).
			this.logger.error(`App ${this.id} not healthy after install — landing state 'unhealthy' (visible + self-correcting)`, error)
			this.state = 'unhealthy'
			this.stateProgress = 0
		}
		this.stateProgress = 0

		return true
	}

	async update() {
		this.state = 'updating'
		this.stateProgress = 1

		// TODO: Pull images here before the install script and calculate live progress for
		// this.stateProgress so button animations work

		this.logger.log(`Updating app ${this.id}`)

		// Get a reference to the old images
		const compose = await this.readCompose()
		const oldImages = Object.values(compose.services!)
			.map((service) => service.image)
			.filter(Boolean) as string[]

		// Update the app, patching the compose file half way through
		await appScript(this.#livinityd, 'pre-patch-update', this.id)
		await this.patchComposeFile()
		await this.pull()
		await appScript(this.#livinityd, 'post-patch-update', this.id)

		// Delete the old images if we can. Silently fail on error cos docker
		// will return an error even if only one image is still needed.
		try {
			await $({stdio: 'inherit'})`docker rmi ${oldImages}`
		} catch {}

		this.state = 'ready'
		this.stateProgress = 0

		// Enable auto-start on boot
		await this.setAutoStart(true)

		return true
	}

	async start() {
		this.logger.log(`Starting app ${this.id}`)
		this.state = 'starting'
		// We re-run the patch here to fix an edge case where 0.5.x imported apps
		// wont run because they haven't been patched.
		await this.patchComposeFile()
		// Phase 286: reconcile volume ownership before the start chokepoint too
		// (handles restarts + apps installed before this fix).
		await reconcileAppVolumeOwnership(this, {projectName: this.id})
		await pRetry(() => appScript(this.#livinityd, 'start', this.id), {
			onFailedAttempt: (error) => {
				this.logger.error(
					`Attempt ${error.attemptNumber} starting app ${this.id} failed. There are ${error.retriesLeft} retries left.`,
					error,
				)
			},
			retries: 2,
		})

		// Phase 286 (SC4): same health gate on the start path.
		try {
			const mainContainer = await this.getMainContainerName()
			if (mainContainer) {
				await pollContainerHealth(mainContainer, {logger: this.logger})
			}
			this.state = 'ready'
		} catch (error) {
			// Phase 286 hotfix (v44.45): health is ADVISORY — NEVER fail the start.
			this.logger.error(`App ${this.id} not healthy yet after start (non-fatal)`, error)
			this.state = 'ready'
		}

		// Enable auto-start on boot
		await this.setAutoStart(true)

		return true
	}

	async stop({persistState = false}: {persistState?: boolean} = {}) {
		this.state = 'stopping'
		await pRetry(() => appScript(this.#livinityd, 'stop', this.id), {
			onFailedAttempt: (error) => {
				this.logger.error(
					`Attempt ${error.attemptNumber} stopping app ${this.id} failed. There are ${error.retriesLeft} retries left.`,
					error,
				)
			},
			retries: 2,
		})
		this.state = 'stopped'

		// Disable auto-start on boot
		if (persistState) {
			await this.setAutoStart(false)
		}

		return true
	}

	async restart() {
		// Phase 260-01 (SC1): wrap in try/finally so a throw inside appScript()
		// never leaves this.state wedged on the transient 'restarting' value
		// (which would render the tile as a perpetual un-clickable spinner). The
		// finally only resets a STILL-transient field; the success path already
		// set 'ready'. The original error is re-thrown for the caller/logging.
		this.state = 'restarting'
		try {
			await appScript(this.#livinityd, 'stop', this.id)
			await appScript(this.#livinityd, 'start', this.id)
			this.state = 'ready'

			// Enable auto-start on boot
			await this.setAutoStart(true)

			return true
		} finally {
			if (this.state === 'restarting') {
				// appScript threw before the success line — land on a stable,
				// clickable state instead of wedging.
				this.state = 'ready'
			}
		}
	}

	async uninstall() {
		// Phase 260-01 (SC1): wrap in try/finally so a throw mid-uninstall never
		// leaves this.state wedged on 'uninstalling'. On success we set
		// 'not-installed'; if the body threw the finally lands a clickable
		// fallback ('ready') rather than the transient value. Re-throws on error.
		this.state = 'uninstalling'
		try {
			await pRetry(() => appScript(this.#livinityd, 'stop', this.id), {
				onFailedAttempt: (error) => {
					this.logger.error(
						`Attempt ${error.attemptNumber} stopping app ${this.id} failed. There are ${error.retriesLeft} retries left.`,
						error,
					)
				},
				retries: 2,
			})
			await appScript(this.#livinityd, 'nuke-images', this.id)
			await fse.remove(this.dataDirectory)

			await this.#livinityd.store.getWriteLock(async ({get, set}) => {
				let apps = (await get('apps')) || []
				apps = apps.filter((appId) => appId !== this.id)
				await set('apps', apps)

				// Remove app from recentlyOpenedApps
				let recentlyOpenedApps = (await get('recentlyOpenedApps')) || []
				recentlyOpenedApps = recentlyOpenedApps.filter((appId) => appId !== this.id)
				await set('recentlyOpenedApps', recentlyOpenedApps)

				// Disable any associated widgets
				let widgets = (await get('widgets')) || []
				widgets = widgets.filter((widget) => !widget.startsWith(`${this.id}:`))
				await set('widgets', widgets)
			})

			// Uninstall succeeded — the containers + data are gone.
			this.state = 'not-installed'

			return true
		} finally {
			if (this.state === 'uninstalling') {
				// The body threw before completing — don't wedge on the transient
				// value. Default to a clickable state; the next apps.state poll
				// reconciles against Docker for the real status.
				this.state = 'ready'
			}
		}
	}

	async getPids() {
		const compose = await this.readCompose()
		const containers = Object.values(compose.services!).map((service) => service.container_name) as string[]
		try {
			// If we fail to get the PIDs of one container, skip it and continue for
			// the other containers. We'll expect to get it on some misses for the app
			// proxy and tor server containers.
			const cmd = containers.map((container) => `docker top ${container} -o pid 2>/dev/null || true`).join('\n')
			const {stdout} = await $({shell: true})`${cmd}`
			return stdout
				.split('\n') // Split on newline
				.map((line) => line.trim()) // Trim whitespace
				.filter((line) => /^([1-9][0-9]*|0)$/.test(line)) // Keep only integers
				.map((line) => parseInt(line, 10)) // And convert
		} catch (error) {
			this.logger.error(`Failed to get pids for app ${this.id}`, error)
			return []
		}
	}

	async getDiskUsage() {
		try {
			// Disk usage calculations can fail if the app is rapidly moving files around
			// since files in directories will be listed and then iterated over to have
			// their size summed up. If a file is moved between these two operations it
			// will fail. It happens rarely so simply retrying will catch most cases.
			return await pRetry(() => getDirectorySize(this.dataDirectory), {retries: 2})
		} catch (error) {
			this.logger.error(`Failed to get disk usage for app ${this.id}`, error)
			return 0
		}
	}

	async getLogs() {
		const inheritStdio = false
		const result = await appScript(this.#livinityd, 'logs', this.id, inheritStdio)
		return stripAnsi(result.stdout)
	}

	// Phase 286 (SC4): resolve the container name of the app's MAIN service so the
	// health poll knows which container to inspect. Reuses the EXACT mainService
	// selection rule from patchComposeFile() so we poll the same service Caddy
	// reverse-proxies to. The container_name (set by patchComposeFile to the
	// forced legacy scheme) is the source of truth; fall back to the deterministic
	// `${appId}_${service}_1` name if absent.
	// Public: the continuous health monitor (health-monitor.ts) samples the
	// same main container the install/start gates poll.
	async getMainContainerName(): Promise<string | undefined> {
		const compose = await this.readCompose()
		const serviceNames = Object.keys(compose.services ?? {})
		if (serviceNames.length === 0) return undefined
		const mainServiceName = serviceNames.find(name =>
			name === this.id || name === 'server' || name === 'app' || name === 'web'
		) || serviceNames.find(name =>
			!['docker', 'dind', 'tor', 'proxy', 'sidecar', 'init'].includes(name)
		) || serviceNames[0]
		const service = compose.services![mainServiceName]
		return service.container_name || `${this.id}_${mainServiceName}_1`
	}

	async getContainerIp(service: string) {
		// Retrieve the container name from the compose file
		// This works because we have a temporary patch to force all container names to the old Compose scheme to maintain compatibility between Compose v1 and v2
		const compose = await this.readCompose()
		const containerName = compose.services![service].container_name

		if (!containerName) throw new Error(`No container_name found for service ${service} in app ${this.id}`)

		const {stdout: containerIp} =
			await $`docker inspect -f {{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}} ${containerName}`

		return containerIp
	}

	// Returns a validated list of paths that should be ignored when backing up the app
	// This allows apps to signal to LivOS noncritical high churn or high data files
	// that can be ignored from backups like logs/cache/blockchain data/etc.
	async getBackupIgnoredFilePaths() {
		const manifest = await this.readManifest()
		if (!manifest.backupIgnore) return []

		// Sanitise paths
		const backupIgnore = []
		for (let path of manifest.backupIgnore) {
			// Only allow a limited subset of chars to strip out traversals and other weird stuff we don't want to allow
			// while supporting simple '*' globbing that Kopia understands in .kopiaignore
			// TODO: consider adding other globbing chars like '?' (single-char wildcard) and '**' (recursive wildcard).
			if (!/^[-a-zA-Z0-9._\/*]+$/.test(path)) {
				this.logger.error(`Invalid backupIgnore path ${path} for app ${this.id}, skipping`)
				continue // Skip invalid paths
			}

			// Convert to absolute path and normalise traversals
			path = nodePath.join(this.dataDirectory, path)

			// Ensure path doesn't escape the app's data directory
			if (!path.startsWith(this.dataDirectory)) {
				this.logger.error(`Invalid backupIgnore path ${path} for app ${this.id}, skipping`)
				continue // Skip paths that escape the app's data directory
			}

			// Save the sanitised path
			backupIgnore.push(path)
		}

		return backupIgnore
	}

	// Returns a specific widget's info from an app's manifest
	async getWidgetMetadata(widgetName: string) {
		const manifest = await this.readManifest()
		if (!manifest.widgets) throw new Error(`No widgets found for app ${this.id}`)

		const widgetMetadata = manifest.widgets.find((widget) => widget.id === widgetName)
		if (!widgetMetadata) throw new Error(`Invalid widget ${widgetName} for app ${this.id}`)

		return widgetMetadata
	}

	// Returns a specific widget's data
	async getWidgetData(widgetId: string) {
		// Get widget info from the app's manifest
		const widgetMetadata = await this.getWidgetMetadata(widgetId)

		const url = new URL(`http://${widgetMetadata.endpoint}`)
		const service = url.hostname

		url.hostname = await this.getContainerIp(service)

		try {
			const response = await fetch(url)

			if (!response.ok) throw new Error(`Failed to fetch data from ${url}: ${response.statusText}`)

			const widgetData = (await response.json()) as {[key: string]: any}
			return widgetData
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Failed to fetch data from ${url}: ${error.message}`)
			} else {
				throw new Error(`An unexpected error occured while fetching data from ${url}: ${error}`)
			}
		}
	}

	// Get the app's dependencies with selected dependencies applied
	async getDependencies() {
		const [{dependencies}, selectedDependencies] = await Promise.all([
			this.readManifest(),
			this.getSelectedDependencies(),
		])
		return dependencies?.map((dependencyId) => selectedDependencies?.[dependencyId] ?? dependencyId) ?? []
	}

	// Get the app's selected dependencies
	async getSelectedDependencies() {
		const [{dependencies}, selectedDependencies] = await Promise.all([
			this.readManifest(),
			this.store.get('dependencies'),
		])
		return fillSelectedDependencies(dependencies, selectedDependencies)
	}

	// Set the app's selected dependencies
	async setSelectedDependencies(selectedDependencies: Record<string, string>) {
		const {dependencies} = await this.readManifest()
		const filledSelectedDependencies = fillSelectedDependencies(dependencies, selectedDependencies)
		const success = await this.store.set('dependencies', filledSelectedDependencies)
		if (success) {
			this.restart().catch((error) => {
				this.logger.error(`Failed to restart '${this.id}'`, error)
			})
		}
		return success
	}

	// 316-02 (GPU-02): read the per-app GPU-access override.
	// undefined = no override set → patchComposeFile falls back to the manifest
	// default (unchanged behavior). true/false = explicit admin toggle.
	async getGpuAccess() {
		return this.store.get('gpuAccess')
	}

	// 316-02 (GPU-02): set the per-app GPU-access override, then restart so the
	// re-patched compose (with/without the NVIDIA reservation or DRI device)
	// takes effect. Mirrors setSelectedDependencies' fire-and-forget restart.
	async setGpuAccess(enabled: boolean) {
		const success = await this.store.set('gpuAccess', enabled)
		if (success) {
			this.restart().catch((error) => {
				this.logger.error(`Failed to restart '${this.id}'`, error)
			})
		}
		return success
	}

	// Check if app is ignored from backups
	async isBackupIgnored() {
		return (await this.store.get('backupIgnore')) || false
	}

	// Set if app is ignored from backups
	async setBackupIgnored(backupIgnore: boolean) {
		return this.store.set('backupIgnore', backupIgnore)
	}

	// Set if app should auto start on boot
	async setAutoStart(autoStart: boolean) {
		return this.store.set('autoStart', autoStart)
	}

	// Get if app should auto start on boot
	async shouldAutoStart() {
		return (await this.store.get('autoStart')) ?? true
	}
}
