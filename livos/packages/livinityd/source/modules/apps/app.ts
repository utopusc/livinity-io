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
import {isNvidiaToolkitConfigured, detectGpu} from '../system/gpu.js'
import {validateManifest, type AppSettings} from './schema.js'
import appScript from './legacy-compat/app-script.js'
import {reconcileAppVolumeOwnership} from './reconcile-volume-ownership.js'
import {pollContainerHealth} from './health-poll.js'
import {
	resolveJellyfinHwAccel,
	resolveJellyfinPermissions,
	seedEncodingXml,
	ensureNvidiaVideoCap,
	precreateMediaFolders,
} from './jellyfin-preconfig.js'
import {getBuiltinApp} from './builtin-apps.js'
import {deriveOidcClientSecret as deriveOidcSecret} from '../oidc/clients.js'
import {provisionOidcForApp, type ProvisionResult} from '../oidc/provisioning.js'
import {getKey, encrypt, decrypt} from '../secrets/dek.js'

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

// 330 WR-04: the bare-metal AMD branch of patchComposeFile swaps Ollama's image to
// the ROCm variant. `OLLAMA_DEFAULT_IMAGE` is the tag to restore when GPU access is
// later turned off, so opting out never strands the app on the heavier ROCm
// runtime. Both are FIXED literals (T-330-11) — no caller/manifest string reaches
// them; scoped by `this.id === 'ollama'` and the exact tag this code sets.
const OLLAMA_ROCM_IMAGE = 'ollama/ollama:rocm'
const OLLAMA_DEFAULT_IMAGE = 'ollama/ollama:latest'

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
	// 343-01 RESIL-01: STABLE recovery state — container up on sleep-infinity,
	// entrypoint suppressed; NOT transient (never auto-reconciled) and never
	// health-judged (health-monitor owns only ready/unhealthy). Set by
	// enterDebugMode + the boot loop's debug re-entry path (B1); cleared by
	// exitDebugMode restoring the original entrypoint → normal ready flow.
	| 'debug'
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

	// 322-05 (IDENT-02, D-322-4): derive this app's OIDC client secret from the SAME
	// box seed as deriveDeterministicPassword, delegating to the shared pure HMAC fn
	// (oidc/clients.ts) so the secret matches byte-for-byte what buildStaticClients
	// registers with the provider. Zero storage — reproducible on every boot/toggle.
	// The suffix is DISTINCT from the app-password one so the two can never collide.
	// NEVER logged.
	async deriveOidcClientSecret() {
		const seed = await fse.readFile(`${this.#livinityd.dataDirectory}/db/livinity-seed/seed`)
		return deriveOidcSecret(this.id, seed)
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
		// 331-03 (FIX-03): catalog-precedence guard. shouldPreferCatalog('jellyfin')
		// is true, so a platform-DB catalog template can shadow the builtin manifest —
		// a catalog manifest with NO `permissions` field silently strips the builtin's
		// GPU permission and makes the whole MEDIA-02 preconfig inert (329-11 caveat #5).
		// resolveJellyfinPermissions falls back to the builtin permission when the
		// field was dropped, and flags an EXPLICIT catalog non-GPU choice so it is
		// surfaced (notification below), never silent. Every other app is untouched.
		let gpuPermissions = manifest.permissions
		if (this.id === 'jellyfin') {
			const resolution = resolveJellyfinPermissions(manifest.permissions, getBuiltinApp('jellyfin')?.permissions)
			gpuPermissions = resolution.permissions
			if (resolution.shadowFallback) {
				this.logger.log(
					'[jellyfin-preconfig] installed manifest carries no permissions field (catalog template in effect) — using the builtin GPU permission so preconfig is not silently inert (331-03)',
				)
			}
			if (resolution.explicitSkip) {
				this.logger.log(
					'[warn] [jellyfin-preconfig] catalog template in effect with an explicit non-GPU permissions list — GPU preconfig skipped (331-03)',
				)
				// Fail-soft: a notification-store hiccup must never abort a compose patch.
				await this.#livinityd.notifications
					.add('jellyfin-catalog-gpu-preconfig-skipped', {severity: 'warning'})
					.catch(() => {})
			} else {
				await this.#livinityd.notifications.clear('jellyfin-catalog-gpu-preconfig-skipped').catch(() => {})
			}
		}
		const wantsGpu = resolveWantsGpu(gpuAccessOverride, gpuPermissions)
		const nvidiaToolkitInstalled = wantsGpu ? await isNvidiaToolkitConfigured() : false

		// 330 CR-01 (GPU-03/GPU-05): a SINGLE WSL2-aware composite probe drives BOTH
		// the NVIDIA and AMD branches below. Read ONCE per patch (same discipline as
		// the toolkit probe above), guarded by wantsGpu so an app nobody has toggled
		// never shells out. `detectGpu()` never throws (degrades to vendor:'none').
		// CRITICAL: `hostHasNvidia` MUST come from detectGpu().vendor, NOT 316's
		// lspci-only detectNvidiaGpu() — on WSL2 lspci reports "Microsoft Corporation
		// Device" so detectNvidiaGpu() is always false, which would leave a WSL2-NVIDIA
		// host (the flagship desktop case) without its GPU reservation even after the
		// guided toolkit install. detectGpu() reads nvidia-smi on WSL2 and calls
		// detectNvidiaGpu() internally on bare-metal, so bare-metal behavior is
		// byte-identical. WSL2-AMD gets NO compose change (no /dev/kfd there — it
		// exposes /dev/dxg instead, FLAG 2 bare-metal-only).
		const gpuInfo = wantsGpu ? await detectGpu() : null
		const hostHasNvidia = gpuInfo?.vendor === 'nvidia'
		const hostVendorAmd = gpuInfo?.vendor === 'amd'
		const hostWsl2 = gpuInfo?.wsl2 ?? false

		// 329-11 (MEDIA-02, D-22): resolve the Jellyfin hwaccel branch ONCE, using the
		// SAME precedence as the GPU service-loop branches below, so the encoding.xml
		// seed (at the end of this method) agrees with the reservation actually applied.
		// Null for non-Jellyfin apps or when no GPU branch resolves — encoding.xml is
		// then not seeded (guarded inside seedEncodingXml).
		const jellyfinHwAccel =
			this.id === 'jellyfin'
				? resolveJellyfinHwAccel({
						wantsGpu,
						hostHasNvidia,
						nvidiaToolkitInstalled,
						hostVendorAmd,
						hostWsl2,
						deviceHasGpu,
					})
				: null

		// APPS-01/03 (326-01): re-read per-app settings on EVERY patch so Configure
		// values + limits survive update()/start()/restart() (all call patchComposeFile()
		// with no args). Mirrors gpuAccessOverride above. storedEnvOverrides is the
		// allowlist-filtered map persisted by apps.setEnvironmentOverrides; cpuLimit is
		// decimal cores and memoryLimit is BYTES, both authoritative from the store.
		const storedEnvOverrides = await this.store.get('environmentOverrides')
		const cpuLimit = await this.store.get('cpuLimit')
		const memoryLimit = await this.store.get('memoryLimit')
		// 342-01 APPD-02 (D-342-4): per-app CPU pinning (cpuset), authoritative from the store.
		const cpuSet = await this.store.get('cpuSet')
		// 343-01 RESIL-01 (D-343-1): debug-mode suppression + restore inputs, authoritative from
		// the store. debugMode true ⇒ suppress the main entrypoint; else debugStash (if present)
		// restores the captured original.
		const debugMode = await this.store.get('debugMode')
		const debugStash = await this.store.get('debugStash')

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
				// 329-11 (MEDIA-02, research A5 / D-22): Jellyfin NVENC needs the `video`
				// NVIDIA driver capability. If the image env lacks it, add the explicit
				// FIXED literal NVIDIA_DRIVER_CAPABILITIES=compute,video,utility (T-329-29).
				// Fail-soft — a docker-inspect error never aborts the patch/install.
				if (this.id === 'jellyfin' && typeof service.image === 'string') {
					await ensureNvidiaVideoCap(service, service.image, this.logger)
				}
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
					service.image = OLLAMA_ROCM_IMAGE
				}
			} else if (wantsGpu && deviceHasGpu) {
				// Pass through host DRI device to all app containers if the app requests it
				compose.services![serviceName].devices = compose.services![serviceName].devices || []
				compose.services![serviceName].devices.push(DRI_DEVICE_PATH)
			}

			// 330 WR-04: the bare-metal AMD branch above swaps Ollama's image to the
			// ROCm variant. When this service is NOT taking that branch (GPU toggled
			// off, vendor no longer AMD, or WSL2), a previously-swapped :rocm image is
			// reverted to the default tag — otherwise opting out of GPU access silently
			// leaves the app on the heavier ROCm runtime forever. Scoped to ollama +
			// the exact tag this code sets; FIXED literals only (T-330-11).
			const takingAmdBranch = wantsGpu && hostVendorAmd && !hostWsl2
			if (this.id === 'ollama' && !takingAmdBranch) {
				const svc = compose.services![serviceName]
				if (svc.image === OLLAMA_ROCM_IMAGE) {
					svc.image = OLLAMA_DEFAULT_IMAGE
				}
			}
		}

		// Apply environment overrides from install dialog.
		// APPS-01 (326-01): the arg (install-time) wins; on a re-patch with no arg
		// (update/start/restart) the allowlist-filtered store value is applied so
		// Configure values survive. The store value is ALREADY allowlist-filtered at
		// write time (apps.setEnvironmentOverrides) — do NOT re-filter here.
		const effectiveEnvOverrides = environmentOverrides ?? storedEnvOverrides
		if (effectiveEnvOverrides && Object.keys(effectiveEnvOverrides).length > 0) {
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
				for (const [key, value] of Object.entries(effectiveEnvOverrides)) {
					const idx = (service.environment as string[]).findIndex((e: string) => typeof e === 'string' && e.startsWith(`${key}=`))
					if (idx >= 0) {
						(service.environment as string[])[idx] = `${key}=${value}`
					} else {
						(service.environment as string[]).push(`${key}=${value}`)
					}
				}
			} else {
				// Object format: {KEY: VALUE}
				for (const [key, value] of Object.entries(effectiveEnvOverrides)) {
					(service.environment as Record<string, string>)[key] = value
				}
			}
			this.logger.log(`Applied ${Object.keys(effectiveEnvOverrides).length} environment overrides for ${this.id}`)

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
				for (const [key, value] of Object.entries(effectiveEnvOverrides)) {
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

		// APPS-03 (326-01, D-07/D-08/D-09): CPU/RAM limits on the MAIN service only.
		// deploy.resources.limits is honored by docker compose v2 without swarm
		// (Compose-Spec). `as any` escape hatch — compose-spec-schema does not model
		// deploy.resources (same reason as the GPU branch). Authoritative from the
		// store: set when present (cpus = decimal cores, memory = BYTES as a string),
		// delete when cleared. `typeof === 'number'` (not `!= null`) is deliberate —
		// the schema types these as numbers, and it also refuses any corrupt/non-number
		// store value so a stray truthy read can never write String(<non-number>).
		const hasCpuLimit = typeof cpuLimit === 'number'
		const hasMemoryLimit = typeof memoryLimit === 'number'
		const limitSvcNames = Object.keys(compose.services!)
		const limitMainName = limitSvcNames.find((n) => n === this.id || n === 'server' || n === 'app' || n === 'web')
			|| limitSvcNames.find((n) => !['docker', 'dind', 'tor', 'proxy', 'sidecar', 'init'].includes(n))
			|| limitSvcNames[0]
		const limitMainService = compose.services![limitMainName]
		const limitExistingDeploy = (limitMainService?.deploy || {}) as any
		if (hasCpuLimit || hasMemoryLimit || limitExistingDeploy.resources?.limits) {
			const service = limitMainService
			const deploy = (service.deploy || {}) as any
			const limits = {...(deploy.resources?.limits ?? {})} as Record<string, string>
			if (hasCpuLimit) limits.cpus = String(cpuLimit)
			else delete limits.cpus
			if (hasMemoryLimit) limits.memory = String(memoryLimit)
			else delete limits.memory
			if (Object.keys(limits).length > 0) {
				deploy.resources = {...(deploy.resources ?? {}), limits}
				service.deploy = deploy
			} else if (deploy.resources) {
				delete deploy.resources.limits
			}
		}

		// 342-01 APPD-02 (D-342-4): CPU pinning on the SAME main service as the limits above.
		// Store-authoritative: set when a non-empty trimmed string, delete when cleared. Coexists
		// with deploy.resources.limits (docker honors both). Semantic validation happened at the
		// route (validateCpuSet) BEFORE persist — a bad cpuset would brick `compose up`.
		// compose-spec-schema models Service.cpuset?: string — NO `as any` needed.
		const hasCpuSet = typeof cpuSet === 'string' && cpuSet.trim() !== ''
		if (limitMainService) {
			// INFO-02: emit the TRIMMED value (hasCpuSet guarantees cpuSet is a string) so a
			// whitespace-laden corrupt store value can never reach the compose cpuset field.
			if (hasCpuSet) limitMainService.cpuset = (cpuSet as string).trim()
			else if ('cpuset' in limitMainService) delete (limitMainService as {cpuset?: string}).cpuset
		}

		// 343-01 RESIL-01 (D-343-1): debug-mode entrypoint suppression on the SAME main service as
		// the limits/cpuset blocks above. patchComposeFile re-patches its OWN on-disk output
		// (readCompose app.ts:130 → writeCompose app.ts:604), so a debug CLEAR can NOT blind-delete
		// entrypoint/command/healthcheck — many apps ship their own, and deleting would strand them
		// on the image defaults. The original values are captured into debugStash at enter-time and
		// RESTORED here (delete when the stash records `null` = "absent originally", else set). The
		// suppression literals are FIXED (T-343-02) — no caller/manifest string reaches the compose.
		// entrypoint/command/healthcheck are natively modeled by compose-spec-schema (no `as any`).
		if (limitMainService) {
			if (debugMode === true) {
				// command:[] so images whose ENTRYPOINT script consumes CMD don't re-trigger.
				limitMainService.entrypoint = ['sleep', 'infinity']
				limitMainService.command = []
				limitMainService.healthcheck = {disable: true}
			} else if (debugStash) {
				// Restore the captured original. W3/W4: an absent-original (null) and an explicit
				// delete collapse to the same "key not present" compose — functionally identical.
				for (const k of ['entrypoint', 'command', 'healthcheck'] as const) {
					if (debugStash[k] == null) {
						if (k in limitMainService) delete (limitMainService as Record<string, unknown>)[k]
					} else {
						;(limitMainService as Record<string, unknown>)[k] = debugStash[k]
					}
				}
				// NOTE: debugStash is NOT cleared here — exitDebugMode owns clearing it AFTER this
				// restore succeeds, so a livinityd restart mid-exit still restores next start. This
				// restore branch runs on EVERY patch while debugMode is false AND a stash survives:
				// the stash IS re-read each patch and idempotently re-restores the original
				// entrypoint/command/healthcheck — that repeated, harmless re-restore is exactly the
				// self-heal for a crash mid-exit (the stash only stops mattering once exitDebugMode
				// deletes it after a clean restore).
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

		// 322-05 (IDENT-02, D-322-4 mechanism #1): Vaultwarden SSO env-inject. The ONLY
		// app whose OIDC provisioning is pure compose env — Nextcloud/Gitea use docker-exec
		// CLI and Immich a REST call (the out-of-band 322-06 mechanism), NOT this branch.
		// Gated on the admin "Enable SSO" toggle AND a configured domain (no stable HTTPS
		// issuer otherwise). The sso-only flag below stays false so the master-password
		// login survives — SSO COEXISTS, never replaces (SC3, T-322-18). Clones the Portainer TRUSTED_ORIGINS
		// branch shape (resolve main service, guard array-vs-object environment). The
		// derived client secret is NEVER logged (T-322-11).
		if (this.id === 'vaultwarden' && (await this.getOidcEnabled())) {
			try {
				const mainDomain = await this.#livinityd.server.getActiveMainDomain()
				if (mainDomain) {
					const clientSecret = await this.deriveOidcClientSecret()
					const mainServiceName = Object.keys(compose.services!).find(n => n === 'server') || Object.keys(compose.services!)[0]
					const service = compose.services![mainServiceName]
					if (!service.environment) service.environment = {}
					if (typeof service.environment === 'object' && !Array.isArray(service.environment)) {
						Object.assign(service.environment as Record<string, string>, {
							SSO_ENABLED: 'true',
							SSO_ONLY: 'false',
							SSO_CLIENT_ID: `livos-${this.id}`,
							SSO_CLIENT_SECRET: clientSecret,
							SSO_AUTHORITY: `https://${mainDomain}/oidc`,
							SSO_SCOPES: 'openid email profile groups',
						})
					}
					// Deliberately never log the secret (T-322-11) — only the non-sensitive authority.
					this.logger.log(`Enabled Vaultwarden SSO (authority https://${mainDomain}/oidc) for ${this.id}`)
				}
			} catch (error) {
				this.logger.error(`Failed to inject SSO env for ${this.id}`, error)
			}
		}

		// 329-11 (MEDIA-02, D-22): seed a minimal-delta encoding.xml BEFORE first
		// container start, ONLY when a GPU branch resolved AND no encoding.xml exists
		// yet (never clobber a wizard/user-authored file — T-329-28). patchComposeFile
		// runs before pull/start on install, so the seed lands before Jellyfin boots;
		// on later update()/start()/restart() the absent-guard keeps it a no-op.
		if (this.id === 'jellyfin') {
			await seedEncodingXml(this.dataDirectory, jellyfinHwAccel, this.logger)
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

		// 329-11 (MEDIA-02, D-23): a NEW install is signalled by the absence of the
		// first default library folder — captured BEFORE patchComposeFile so a re-run
		// over pre-existing media (existing install) is detected and skipped, never
		// restructured. Only Jellyfin cares; every other app leaves this false.
		const jellyfinIsNewInstall =
			this.id === 'jellyfin' ? !(await fse.pathExists(`${this.dataDirectory}/media/Movies`)) : false

		await this.patchComposeFile(environmentOverrides)

		// 329-11 (MEDIA-02, D-23): pre-create the default Movies/Shows/Music libraries
		// under the /media mount for NEW installs only, BEFORE first container start.
		// Existing installs are a no-op (no breaking volume change).
		if (this.id === 'jellyfin') {
			await precreateMediaFolders(this.dataDirectory, jellyfinIsNewInstall, this.logger)
		}

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
		// 343-review WARN-02: a compose-mutating accessor (setResourceLimits/setGpuAccess/
		// setEnvironmentOverrides/setSelectedDependencies/setOidcEnabled) patch-THEN-restarts. When
		// the app is in debug, patchComposeFile re-applies the sleep-infinity suppression, so the
		// recreated container is STILL frozen — landing 'ready' here would flip the app to a state
		// that lies about a frozen container (health-monitor re-owns it, the icon menu re-enables
		// Restart). Read the debugMode store key and land 'debug' instead so ALL current+future
		// accessor callers stay honest without guarding each route. exitDebugMode deletes debugMode
		// BEFORE it calls restart(), so the normal debug-EXIT path still lands 'ready' as before.
		// The W1 route guards (restart/start routes reject in debug) are unaffected — they gate on
		// the app state, and this only makes that state MORE accurate (stays 'debug', never 'ready').
		const landState: AppState = (await this.store.get('debugMode')) ? 'debug' : 'ready'
		try {
			await appScript(this.#livinityd, 'stop', this.id)
			await appScript(this.#livinityd, 'start', this.id)
			this.state = landState

			// Enable auto-start on boot
			await this.setAutoStart(true)

			return true
		} finally {
			if (this.state === 'restarting') {
				// appScript threw before the success line — land on a stable,
				// clickable state instead of wedging.
				this.state = landState
			}
		}
	}

	// 343-01 RESIL-01 (D-343-2, B1): the SHARED debug-start path. Used by enterDebugMode AND the
	// boot-loop debug re-entry (apps.ts) — IDENTICAL code both ways so a daemon restart (routine on
	// every box update) never collapses a 'debug' app to 'ready' (which would let health-monitor
	// re-judge it + oom-watch re-own it + the icon menu re-enable Restart on a frozen container).
	// Assumes debugMode is ALREADY persisted (the caller sets it) so patchComposeFile applies the
	// suppression transform. Starts the container WITHOUT pollContainerHealth (nothing serves on
	// sleep-infinity) and lands state='debug'. Mirrors restart()'s wedge guard (app.ts:801-807): if
	// appScript throws before success, land a clickable 'ready' instead of wedging on the transient
	// 'restarting' — the original error propagates (no catch swallows it).
	async startInDebugMode() {
		this.state = 'restarting'
		try {
			await this.patchComposeFile()
			await appScript(this.#livinityd, 'stop', this.id)
			await appScript(this.#livinityd, 'start', this.id)
			this.state = 'debug'
			return true
		} finally {
			if (this.state === 'restarting') {
				this.state = 'ready'
			}
		}
	}

	// 343-01 RESIL-01 (D-343-2): put a crash-looping app into recovery/debug mode. Idempotent — a
	// second enter (debugMode already set) is a no-op so the ORIGINAL stash is never overwritten
	// with the sleep-infinity suppression values. Captures the main service's LIVE
	// entrypoint/command/healthcheck into debugStash (null = "absent originally" → restore deletes
	// vs sets), flips debugMode, then takes the shared debug-start path. Debug is an operator-driven
	// transient repair, not a boot preference, so setAutoStart is deliberately left untouched.
	async enterDebugMode() {
		if (await this.store.get('debugMode')) return true
		const compose = await this.readCompose()
		// SAME main-service selection as patchComposeFile's limits/cpuset block.
		const svcNames = Object.keys(compose.services ?? {})
		const mainName =
			svcNames.find((n) => n === this.id || n === 'server' || n === 'app' || n === 'web') ||
			svcNames.find((n) => !['docker', 'dind', 'tor', 'proxy', 'sidecar', 'init'].includes(n)) ||
			svcNames[0]
		const mainService = compose.services![mainName]
		// 343-review WARN-01: NEVER re-capture an already-suppressed compose into the stash.
		// exitDebugMode deletes debugMode THEN re-patches; if that patchComposeFile throws, the
		// compose is left on sleep-infinity AND the stash is still present while debugMode is now
		// absent. A naive re-enter (debugMode guard above passes) would overwrite the ORIGINAL
		// stash with the ['sleep','infinity'] suppression literals — and the NEXT exit would then
		// "restore" sleep-infinity permanently, wedging the app frozen forever. So skip the capture
		// when a stash already survives OR the on-disk main entrypoint already IS the suppression
		// literal; keep the surviving original stash, just re-flip debugMode + re-suppress.
		const existingStash = await this.store.get('debugStash')
		const ep = mainService?.entrypoint
		const entrypointIsSuppressed =
			Array.isArray(ep) && ep.length === 2 && ep[0] === 'sleep' && ep[1] === 'infinity'
		if (!existingStash && !entrypointIsSuppressed) {
			await this.store.set('debugStash', {
				entrypoint: mainService?.entrypoint ?? null,
				command: mainService?.command ?? null,
				healthcheck: mainService?.healthcheck ?? null,
			})
		}
		await this.store.set('debugMode', true)
		return this.startInDebugMode()
	}

	// 343-01 RESIL-01 (D-343-2): leave debug mode. Delete debugMode FIRST so the next patch takes
	// patchComposeFile's RESTORE branch, re-patch (restores the original entrypoint/command/
	// healthcheck to disk), THEN delete the now-consumed stash, then a normal restart recreates the
	// container with the real entrypoint → the standard ready flow. Order matters (T-343-03): the
	// stash is cleared only AFTER a successful re-patch, so a crash mid-exit still restores next
	// start — while debugMode is false the restore branch re-reads the stash on EVERY patch and
	// idempotently re-restores the original entrypoint (the self-heal for a mid-exit crash), until
	// this delete removes it after a clean restore.
	async exitDebugMode() {
		await this.store.delete('debugMode')
		await this.patchComposeFile()
		await this.store.delete('debugStash')
		return this.restart()
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

	// 326-01 APPS-01 (WR-01): persist the (already allowlist-filtered) env overrides,
	// then patch-THEN-restart. restart() shells stop/start and NEVER re-runs
	// patchComposeFile(), so the compose must be patched FIRST (the .env + main-service
	// environment land on disk) so `compose up` recreates the container with them.
	// Fire-and-forget + failure-isolated, matching the Vaultwarden setOidcEnabled shape.
	async setEnvironmentOverrides(overrides: Record<string, string>) {
		const success = await this.store.set('environmentOverrides', overrides)
		if (success) {
			this.patchComposeFile()
				.then(() => this.restart())
				.catch((e) => this.logger.error(`Failed to apply env overrides + restart '${this.id}'`, e))
		}
		return success
	}

	// 326-01 APPS-03 (WR-01, D-07): persist the CPU/RAM limits then patch-THEN-restart so
	// the main-service deploy.resources.limits reconciliation in patchComposeFile takes
	// effect via compose recreation — NEVER an in-place live-container mutation.
	// FileStore.set() throws on undefined, so DELETE a key to CLEAR its limit and SET to
	// APPLY it (cpuLimit = decimal cores, memoryLimit = BYTES).
	// 342-01 APPD-02 (D-342-4): cpuSet extends this ADDITIVELY — added as the LAST write so
	// `success` still gates the patch-then-restart. 326 callers passing only {cpuLimit,
	// memoryLimit} are unaffected (cpuSet undefined → delete-to-clear, restart still fires).
	async setResourceLimits({cpuLimit, memoryLimit, cpuSet}: {cpuLimit?: number; memoryLimit?: number; cpuSet?: string}) {
		if (cpuLimit == null) await this.store.delete('cpuLimit')
		else await this.store.set('cpuLimit', cpuLimit)
		if (memoryLimit == null) await this.store.delete('memoryLimit')
		else await this.store.set('memoryLimit', memoryLimit)
		const success = cpuSet == null
			? await this.store.delete('cpuSet')
			: await this.store.set('cpuSet', cpuSet)
		if (success) {
			this.patchComposeFile()
				.then(() => this.restart())
				.catch((e) => this.logger.error(`Failed to apply resource limits + restart '${this.id}'`, e))
		}
		return success
	}

	// 326-01 APPS-02 (D-04): per-app auto-update policy. Plain store write — no compose
	// change, no restart (consumed by the app-auto-update scheduler job in a later plan).
	async setUpdatePolicy(policy: 'auto' | 'manual') {
		return this.store.set('autoUpdatePolicy', policy)
	}

	// 343-02 RESIL-02 (D-343-5): toggle this app's OOM self-heal. Plain store write — no compose
	// change, no restart (consumed by the oom-watch scheduler job). undefined = default ON; a stored
	// `false` is the opt-out, so a boolean write (never delete) captures both explicit states.
	async setOomSelfHeal(enabled: boolean) {
		return this.store.set('oomSelfHeal', enabled)
	}

	// 345-03 GUEST-01 (D-345-6): read the per-app "show on public dashboard" flag.
	// undefined = never toggled on (default OFF — NO manifest fallback). Read by the
	// publicDashboard.get curation + surfaced (raw) in apps.list for the admin section.
	async getShowOnPublicDashboard() {
		return this.store.get('showOnPublicDashboard')
	}

	// 345-03 GUEST-01 (D-345-6): set the per-app "show on public dashboard" flag. Plain
	// store write — NO compose change, NO restart (curation reads it at request time).
	// Mirrors getOidcEnabled/setOidcEnabled but without the Vaultwarden compose-patch/restart.
	// A boolean write (never delete) captures the explicit off state.
	async setShowOnPublicDashboard(enabled: boolean) {
		return this.store.set('showOnPublicDashboard', enabled)
	}

	// 342-01 APPD-01 (D-342-1): per-app maintenance window. delete-to-clear (FileStore.set throws
	// on undefined). No restart — the app-update-window job reads it; the 4am app-auto-update job
	// skips windowed apps (disjoint predicate → the two jobs never double-update the same app).
	async setUpdateWindow(window: {start: string; end: string} | undefined) {
		return window == null ? this.store.delete('updateWindow') : this.store.set('updateWindow', window)
	}

	// 326-01 APPS-02 (D-05): pin/un-pin an exact available version out of the updates
	// surfaces. FileStore.set() throws on undefined, so DELETE to un-pin, SET to pin.
	async setIgnoredVersion(version: string | undefined) {
		return version == null ? this.store.delete('ignoredVersion') : this.store.set('ignoredVersion', version)
	}

	// 326-01 MEDIA-01 (D-19): remember that the Immich onboarding QR card was dismissed.
	// UI-only flag, no compose change, no restart.
	async setImmichCardDismissed(dismissed: boolean) {
		return this.store.set('immichCardDismissed', dismissed)
	}

	// 329-11 MEDIA-02 (D-23): remember that the Jellyfin setup onboarding card was
	// dismissed. UI-only flag, no compose change, no restart (mirrors Immich).
	async setJellyfinCardDismissed(dismissed: boolean) {
		return this.store.set('jellyfinCardDismissed', dismissed)
	}

	// 322-05 (IDENT-02, D-322-6): read the per-app "Enable SSO" override.
	// undefined = never enabled (default OFF — NO manifest-permission fallback,
	// unlike GPU). Consumed by patchComposeFile's Vaultwarden branch + apps.list.
	async getOidcEnabled() {
		return this.store.get('oidcEnabled')
	}

	// 322-05 (IDENT-02, D-322-4/D-322-8): set the per-app "Enable SSO" override.
	// ONLY Vaultwarden restarts here — its SSO is a compose env change (patchComposeFile
	// injects SSO_*), so the container must re-create to pick it up. The docker-exec/REST
	// apps (Nextcloud/Gitea/Immich) are provisioned out-of-band in 322-06 (no compose
	// change → no restart from this accessor). Fire-and-forget restart, mirrors setGpuAccess.
	async setOidcEnabled(enabled: boolean) {
		const success = await this.store.set('oidcEnabled', enabled)
		if (success && this.id === 'vaultwarden') {
			// WR-01 (322-review): restart() shells stop/start directly and NEVER re-runs
			// patchComposeFile(), so the SSO_* env the Vaultwarden branch injects would
			// never reach the recreated container — `compose up` reconciles against the
			// on-disk docker-compose.yml, which nothing rewrote. Patch the compose FIRST
			// (mirrors App.start()'s sequencing) so the injected env lands on disk, THEN
			// restart. Fire-and-forget + failure-isolated, matching setGpuAccess.
			this.patchComposeFile()
				.then(() => this.restart())
				.catch((error) => {
					this.logger.error(`Failed to apply SSO compose patch + restart '${this.id}'`, error)
				})
		}
		// 322-06 (IDENT-02, D-322-4): the CLI/REST apps (Nextcloud/Gitea/Immich) provision
		// OUT-OF-BAND — no compose change, so no restart. Run the SECOND provisioning
		// mechanism (docker-exec CLI / loopback REST) AFTER the container is healthy, but
		// fire-and-forget: the readiness gate can take up to 120s and the toggle response
		// must not block. provisionOidcAfterHealth is failure-isolated and NEVER logs the secret.
		if (success && enabled && ['nextcloud', 'gitea', 'immich'].includes(this.id)) {
			this.provisionOidcAfterHealth().catch((error) => {
				this.logger.error(`[oidc] provisioning failed for '${this.id}'`, error)
			})
		}
		return success
	}

	// 322-06 (IDENT-02, D-322-4): health-gated wrapper around provisionOidcForApp — the
	// SECOND OIDC provisioning mechanism (docker-exec CLI for Nextcloud/Gitea, loopback
	// REST for Immich). REUSES the EXISTING pollContainerHealth gate (never a new poll
	// loop) + getMainContainerName (the same main service Caddy proxies) — provisioning
	// runs strictly AFTER health. Resolves the derived client secret and, for Immich, the
	// DEK-encrypted admin key (322-05 producer, via getImmichApiKey) + the host port.
	// Failure-isolated: provisionOidcForApp never throws, and a health-poll timeout is
	// caught here — this NEVER breaks a toggle or install. Returns null when there is no
	// active main domain (no stable HTTPS issuer) or no resolvable container.
	// Callers: setOidcEnabled (toggle) + apps.#finishInstall (install-time enablement).
	async provisionOidcAfterHealth(): Promise<ProvisionResult | null> {
		const mainDomain = await this.#livinityd.server.getActiveMainDomain()
		if (!mainDomain) {
			this.logger.log(`[oidc] no active main domain — skipping SSO provisioning for ${this.id}`)
			return null
		}
		const containerName = await this.getMainContainerName()
		if (!containerName) return null
		try {
			// Reuse the existing readiness gate — do NOT re-implement a polling loop.
			await pollContainerHealth(containerName, {timeoutMs: 120_000, logger: this.logger})
		} catch (error) {
			this.logger.error(`[oidc] ${this.id} not healthy — deferring SSO provisioning`, error)
			const unhealthy: ProvisionResult = {ok: false, reason: 'container-not-healthy'}
			await this.#persistOidcProvisionResult(unhealthy)
			return unhealthy
		}
		let immichPort: number | undefined
		let immichAdminApiKey: string | undefined
		if (this.id === 'immich') {
			// Pitfall-7 producer (322-05): the admin-pasted, DEK-encrypted key. undefined
			// when never pasted → provisionOidcForApp returns {deferred:true}. The host
			// port Immich publishes == manifest.port (patchComposeFile force-adds it).
			immichAdminApiKey = (await this.getImmichApiKey()) ?? undefined
			immichPort = (await this.readManifest()).port
		}
		const result = await provisionOidcForApp(this, {
			mainDomain,
			clientSecret: await this.deriveOidcClientSecret(),
			containerName,
			immichPort,
			immichAdminApiKey,
			logger: this.logger,
		})
		if (result.deferred) {
			// Immich not onboarded yet — surface (not fatal). The 322-07 UI reads the
			// deferred state (getOidcEnabled + immichApiKeySet) to show the manual-order note.
			this.logger.log(`[oidc] ${this.id} SSO provisioning deferred (${result.reason})`)
		} else if (!result.ok) {
			this.logger.error(`[oidc] ${this.id} SSO provisioning failed (${result.reason})`)
		} else {
			this.logger.log(`[oidc] ${this.id} SSO provisioning succeeded`)
		}
		// 331-02 (FIX-02): persist the outcome so the UI can show an honest state —
		// the fire-and-forget caller discards this return value, so the store is the
		// only surface the operator can actually see.
		await this.#persistOidcProvisionResult(result)
		return result
	}

	// 331-02 (FIX-02): best-effort persist of the last SSO provisioning outcome
	// (`oidcLastProvision` per-app store flag, exposed via apps.list). A store write
	// failure must NEVER break the provisioning path (same isolation posture as
	// provisionOidcForApp itself). `reason` arrives already secret-redacted.
	async #persistOidcProvisionResult(result: ProvisionResult): Promise<void> {
		try {
			await this.store.set('oidcLastProvision', {
				ok: result.ok,
				...(result.deferred !== undefined ? {deferred: result.deferred} : {}),
				...(result.reason !== undefined ? {reason: result.reason} : {}),
				at: Date.now(),
			})
		} catch (error) {
			this.logger.error(`[oidc] failed to persist provisioning outcome for '${this.id}'`, error)
		}
	}

	// 322-05 (IDENT-02, Pitfall 7 closure): persist Immich's admin API key
	// DEK-encrypted at rest (secrets/dek.ts codec, its 6th consumer). WRITE-ONLY from
	// the outside — 322-06's REST provisioning consumes it via getImmichApiKey below.
	// The plaintext key is NEVER logged and NEVER returned by any query.
	async setImmichApiKey(key: string) {
		const blob = encrypt(key, await getKey())
		return this.store.set('immichApiKeyEnc', blob)
	}

	// 322-05 (IDENT-02, Pitfall 7): decrypt the stored Immich admin API key for
	// 322-06 provisioning. Returns null when absent or on any decrypt failure (never
	// throws). The ONLY reader of the ciphertext; the plaintext is NEVER logged.
	async getImmichApiKey(): Promise<string | null> {
		const blob = await this.store.get('immichApiKeyEnc')
		if (!blob || typeof blob !== 'string') return null
		try {
			return decrypt(blob, await getKey())
		} catch {
			return null
		}
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
