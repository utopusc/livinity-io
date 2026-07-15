import fse from 'fs-extra'
import {$} from 'execa'

/**
 * Phase 329-11 (MEDIA-02, D-22/D-23) — Jellyfin install-time preconfig.
 *
 * Three host-side install hooks, ALL gated to app id 'jellyfin' by the caller
 * (app.ts) so the generic GPU pipeline stays byte-identical for every other app:
 *
 *  1. `seedEncodingXml` — write a MINIMAL-delta `${appDataDir}/config/encoding.xml`
 *     (HardwareAccelerationType + EnableHardwareEncoding + VaapiDevice for the vaapi
 *     branch only) BEFORE first container start, ONLY when a GPU branch actually
 *     resolved AND no encoding.xml exists yet (never clobber a wizard/user-authored
 *     file — T-329-28). The container's `/config` mount reads it on first boot.
 *
 *  2. `ensureNvidiaVideoCap` — `docker inspect` the Jellyfin image env for
 *     `NVIDIA_DRIVER_CAPABILITIES` including `video`; if absent, add the explicit
 *     FIXED literal `NVIDIA_DRIVER_CAPABILITIES=compute,video,utility` to the
 *     Jellyfin compose service (NVIDIA branch only). The env value is a fixed
 *     literal — no caller/manifest string reaches the compose patch (T-329-29).
 *     Fail-soft: an inspect error must NOT abort install (log + skip).
 *
 *  3. `precreateMediaFolders` — for NEW installs only, pre-create the default
 *     `Movies/Shows/Music` libraries under the app's `/media` mount. Existing
 *     installs are a no-op — no breaking volume restructure (D-23).
 *
 * NO first-run wizard API automation anywhere here (D-23, the undocumented
 * setup-wizard endpoints are drift risk) — the operator completes Jellyfin's wizard
 * once, guided by the dismissible jellyfin-setup onboarding card.
 */

// Jellyfin EncodingOptions.HardwareAccelerationType values (verified from
// Jellyfin's EncodingOptions.cs): vaapi | qsv | nvenc | amf | none.
export type JellyfinHwAccel = 'nvenc' | 'vaapi' | 'qsv' | 'amf'

interface Logger {
	log: (message: string) => void
}

/**
 * Map the resolved GPU pipeline state to a Jellyfin hwaccel type using the EXACT
 * SAME branch precedence as patchComposeFile's service loop (NVIDIA reservation
 * first, then bare-metal AMD, then the generic /dev/dri passthrough) so the seeded
 * encoding.xml agrees with the compose reservation actually applied. Returns null
 * when no GPU branch resolves (encoding.xml is then NOT seeded — D-22).
 */
export function resolveJellyfinHwAccel(input: {
	wantsGpu: boolean
	hostHasNvidia: boolean
	nvidiaToolkitInstalled: boolean
	hostVendorAmd: boolean
	hostWsl2: boolean
	deviceHasGpu: boolean
}): JellyfinHwAccel | null {
	if (!input.wantsGpu) return null
	// NVIDIA reservation branch → NVENC.
	if (input.hostHasNvidia && input.nvidiaToolkitInstalled) return 'nvenc'
	// Bare-metal AMD ROCm (kfd + dri) branch → VA-API (Jellyfin's Linux AMD path).
	if (input.hostVendorAmd && !input.hostWsl2) return 'vaapi'
	// Generic /dev/dri passthrough (Intel iGPU / other) → VA-API.
	if (input.deviceHasGpu) return 'vaapi'
	return null
}

/**
 * Build the minimal-delta encoding.xml body. Only the three verified fields are
 * written — Jellyfin fills every other EncodingOptions default itself on first boot.
 * VaapiDevice is emitted ONLY for the vaapi branch (D-22).
 */
export function buildEncodingXml(branch: JellyfinHwAccel): string {
	const lines = [
		'<?xml version="1.0" encoding="utf-8"?>',
		'<EncodingOptions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">',
		`  <HardwareAccelerationType>${branch}</HardwareAccelerationType>`,
		'  <EnableHardwareEncoding>true</EnableHardwareEncoding>',
	]
	if (branch === 'vaapi') {
		lines.push('  <VaapiDevice>/dev/dri/renderD128</VaapiDevice>')
	}
	lines.push('</EncodingOptions>', '')
	return lines.join('\n')
}

export type SeedEncodingResult = 'written' | 'skipped-no-branch' | 'skipped-exists' | 'error'

/**
 * Seed `${appDataDir}/config/encoding.xml` if (a) a GPU branch resolved and (b) no
 * encoding.xml exists yet. Never overwrites an existing file — a wizard/user-authored
 * config always wins (T-329-28). All errors are swallowed (log + return 'error') so a
 * seed failure never aborts the install.
 */
export async function seedEncodingXml(
	appDataDir: string,
	branch: JellyfinHwAccel | null,
	logger?: Logger,
): Promise<SeedEncodingResult> {
	if (!branch) {
		logger?.log('[jellyfin-preconfig] no GPU branch resolved — not seeding encoding.xml (D-22)')
		return 'skipped-no-branch'
	}
	const configDir = `${appDataDir}/config`
	const target = `${configDir}/encoding.xml`
	try {
		if (await fse.pathExists(target)) {
			logger?.log(`[jellyfin-preconfig] encoding.xml already present — NOT overwriting (${target})`)
			return 'skipped-exists'
		}
		await fse.mkdirp(configDir)
		await fse.writeFile(target, buildEncodingXml(branch))
		logger?.log(`[jellyfin-preconfig] seeded encoding.xml (HardwareAccelerationType=${branch}) at ${target}`)
		return 'written'
	} catch (err: any) {
		logger?.log(`[warn] [jellyfin-preconfig] failed to seed encoding.xml: ${err?.message ?? err}`)
		return 'error'
	}
}

// FIXED literal env applied to the Jellyfin compose service on the NVIDIA branch when
// the image env lacks `video`. No caller/manifest string reaches this value (T-329-29).
const NVIDIA_VIDEO_CAP_KEY = 'NVIDIA_DRIVER_CAPABILITIES'
const NVIDIA_VIDEO_CAP_VALUE = 'compute,video,utility'

function applyNvidiaVideoCapEnv(service: any): void {
	// docker-compose `environment:` is either an array of "KEY=VALUE" strings or a
	// {KEY: VALUE} object — handle both like patchComposeFile's env-override branch.
	if (Array.isArray(service.environment)) {
		const idx = (service.environment as string[]).findIndex(
			(e) => typeof e === 'string' && e.startsWith(`${NVIDIA_VIDEO_CAP_KEY}=`),
		)
		const entry = `${NVIDIA_VIDEO_CAP_KEY}=${NVIDIA_VIDEO_CAP_VALUE}`
		if (idx >= 0) (service.environment as string[])[idx] = entry
		else (service.environment as string[]).push(entry)
	} else {
		if (!service.environment || typeof service.environment !== 'object') service.environment = {}
		;(service.environment as Record<string, string>)[NVIDIA_VIDEO_CAP_KEY] = NVIDIA_VIDEO_CAP_VALUE
	}
}

export type NvidiaVideoCapResult = 'added' | 'already-present' | 'inspect-failed'

/**
 * Research A5 (D-22): inspect the Jellyfin image env for
 * `NVIDIA_DRIVER_CAPABILITIES` including `video` (or the `all` superset); if absent,
 * add the explicit FIXED literal env to the compose service so NVENC transcode has
 * the video capability. Fail-soft: a `docker inspect` error is logged and skipped —
 * it NEVER aborts install (T-329-29). The live inspect on the box is HUMAN-UAT; this
 * is the code branch that runs it.
 */
export async function ensureNvidiaVideoCap(
	service: any,
	image: string,
	logger?: Logger,
): Promise<NvidiaVideoCapResult> {
	let envStr: string
	try {
		const {stdout} = await $`docker inspect --format={{.Config.Env}} ${image}`
		envStr = stdout
	} catch (err: any) {
		// Fail-soft: inspect failed (image not pulled yet / docker unreachable). Log +
		// skip — the install proceeds; the onboarding card + HUMAN-UAT cover verification.
		logger?.log(
			`[warn] [jellyfin-preconfig] docker inspect ${image} failed (${err?.message ?? err}) — skipping NVIDIA_DRIVER_CAPABILITIES patch (fail-soft, T-329-29)`,
		)
		return 'inspect-failed'
	}
	const match = /NVIDIA_DRIVER_CAPABILITIES=([^\s\]]*)/.exec(envStr)
	const caps = (match?.[1] ?? '').split(',').map((s) => s.trim())
	if (caps.includes('all') || caps.includes('video')) {
		logger?.log(
			`[jellyfin-preconfig] image ${image} already exposes NVIDIA_DRIVER_CAPABILITIES incl. video — no compose patch needed`,
		)
		return 'already-present'
	}
	applyNvidiaVideoCapEnv(service)
	logger?.log(
		`[jellyfin-preconfig] added ${NVIDIA_VIDEO_CAP_KEY}=${NVIDIA_VIDEO_CAP_VALUE} to Jellyfin compose (image env lacked 'video')`,
	)
	return 'added'
}

export type PrecreateMediaResult = 'created' | 'skipped-existing-install' | 'error'

// The default Jellyfin library folders pre-created under the `/media` mount for new
// installs. FIXED literals (never caller-supplied).
const DEFAULT_MEDIA_LIBRARIES = ['Movies', 'Shows', 'Music'] as const

/**
 * Pre-create the default `Movies/Shows/Music` libraries under `${appDataDir}/media`
 * (the host side of the container's `/media` mount) for NEW installs ONLY. Existing
 * installs are a no-op so a pre-329 flat `/media` is NEVER restructured (D-23). Uses
 * mkdirp (non-destructive) so even a re-run never clobbers existing content.
 */
export async function precreateMediaFolders(
	appDataDir: string,
	isNewInstall: boolean,
	logger?: Logger,
): Promise<PrecreateMediaResult> {
	if (!isNewInstall) {
		logger?.log(
			'[jellyfin-preconfig] existing install — NOT migrating media folders (no breaking volume change, D-23)',
		)
		return 'skipped-existing-install'
	}
	try {
		const mediaRoot = `${appDataDir}/media`
		for (const library of DEFAULT_MEDIA_LIBRARIES) {
			await fse.mkdirp(`${mediaRoot}/${library}`)
		}
		logger?.log(
			`[jellyfin-preconfig] pre-created ${DEFAULT_MEDIA_LIBRARIES.join('/')} libraries under ${mediaRoot} (new install)`,
		)
		return 'created'
	} catch (err: any) {
		logger?.log(`[warn] [jellyfin-preconfig] failed to pre-create media folders: ${err?.message ?? err}`)
		return 'error'
	}
}
