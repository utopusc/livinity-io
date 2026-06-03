import os from 'node:os'
import path from 'node:path'

import fse from 'fs-extra'
import {$} from 'execa'

import type {AppManifest} from './schema.js'

/**
 * Direct (NO broker) container → host AI-CLI access.
 *
 * When an app manifest declares `requiresLocalAiClis: true`, the installer
 * mounts the HOST's already-installed AI CLIs (claude, gemini), the host glibc
 * runtime, the host node binary, and the operator's CLI credentials into the
 * app's container, then drops thin wrapper scripts on the container `PATH`. The
 * app then detects and runs the real local CLIs directly — exactly as they run
 * on the host, with the operator's own auth — with no Livinity broker involved.
 *
 * Why this works across container base images (musl Alpine AND glibc Debian):
 *   - claude ships as a self-contained glibc ELF (a bun single-file binary).
 *   - We mount the host glibc into an ISOLATED prefix (`/opt/livos-clis/glibc`)
 *     — NOT over the container's own `/lib64` / `/lib/x86_64-linux-gnu`. The
 *     proven spike mounted over those canonical paths, which is safe on a musl
 *     container (the paths don't exist) but would SHADOW a glibc app container's
 *     own libraries and break it. Mounting into a private prefix never touches
 *     the container's runtime.
 *   - The wrappers invoke the CLIs through the host dynamic loader explicitly
 *     (`ld-linux-x86-64.so.2 --library-path <our glibc> <binary>`), so the
 *     embedded interpreter path is irrelevant and the container's own libs are
 *     never consulted.
 *
 * gemini is plain JS → run by the mounted host node (also via the explicit
 * loader so it works on musl too).
 *
 * Credentials are bind-mounted read/write (the CLIs refresh OAuth tokens in
 * place); the container's uid is granted access via POSIX ACL after the
 * container starts (`grantContainerCredsAcl`). The container's HOME is
 * redirected to a writable per-app scratch dir so the CLIs can write their
 * own config (`~/.claude.json`, etc.) without the app's real HOME being
 * disturbed, while `~/.claude` / `~/.gemini` resolve to the operator's creds.
 */

/** All host artefacts live under this single prefix inside the container. */
export const CLI_MOUNT_PREFIX = '/opt/livos-clis'

// Invoke the REAL loader ELF (the file under /lib/x86_64-linux-gnu), NOT the
// /lib64/ld-linux-x86-64.so.2 entry — on Ubuntu that's a relative symlink
// (`../lib/x86_64-linux-gnu/…`) which would dangle inside our isolated prefix.
const LOADER = `${CLI_MOUNT_PREFIX}/glibc/lib-x86_64/ld-linux-x86-64.so.2`
const LIB_PATH = [
	`${CLI_MOUNT_PREFIX}/glibc/lib64`,
	`${CLI_MOUNT_PREFIX}/glibc/lib-x86_64`,
	`${CLI_MOUNT_PREFIX}/glibc/usrlib-x86_64`,
].join(':')

/** Standard Linux PATH used when the compose service declares none of its own. */
const DEFAULT_PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'

export interface DetectedHostClis {
	/** Host glibc dirs (loader + shared libs). Null if the host isn't glibc x86_64. */
	glibc: {lib64: string; libX86: string; usrLibX86: string} | null
	/** realpath to the host node binary (gemini needs it). Null if node absent. */
	node: string | null
	/** claude-code package dir + the host path to its executable. */
	claude: {pkgDir: string; hostExe: string} | null
	/** gemini-cli package dir + the host path to its JS entrypoint. */
	gemini: {pkgDir: string; hostEntry: string} | null
	/** Operator credential dirs on the host (bind-mounted into the container). */
	creds: {claudeDir: string | null; geminiDir: string | null}
	/** The host home whose creds are shared (livinityd runs as this user). */
	homeDir: string
}

async function resolveRealBin(name: string): Promise<string | null> {
	try {
		// `command -v` honours PATH and resolves shims; realpath follows symlinks
		// to the actual on-disk target (e.g. /usr/bin/claude → …/claude.exe).
		const {stdout} = await $`sh -c ${`command -v ${name} 2>/dev/null`}`
		const which = stdout.trim()
		if (!which) return null
		const {stdout: real} = await $`readlink -f ${which}`
		return real.trim() || which
	} catch {
		return null
	}
}

/**
 * Given a resolved host path that lives inside a package dir whose name ends in
 * `marker` (e.g. `/claude-code`), return that package dir. Falls back to the
 * grandparent dir (…/<pkg>/bin/<exe> → …/<pkg>) when the marker isn't present.
 */
function packageDirFor(realPath: string, marker: string): string {
	const needle = `${marker}/`
	const i = realPath.indexOf(needle)
	if (i >= 0) return realPath.slice(0, i + marker.length)
	return path.dirname(path.dirname(realPath))
}

async function pathExists(p: string): Promise<boolean> {
	try {
		return await fse.pathExists(p)
	} catch {
		return false
	}
}

/**
 * Probe the host for the installed AI CLIs, runtime, and operator creds.
 * Returns null when neither CLI is present (nothing to inject).
 */
export async function detectHostAiClis(homeDir: string = os.homedir()): Promise<DetectedHostClis | null> {
	const [lib64, libX86, usrLibX86] = await Promise.all([
		pathExists('/lib64'),
		pathExists('/lib/x86_64-linux-gnu'),
		pathExists('/usr/lib/x86_64-linux-gnu'),
	])
	const glibc =
		lib64 && libX86 && usrLibX86
			? {lib64: '/lib64', libX86: '/lib/x86_64-linux-gnu', usrLibX86: '/usr/lib/x86_64-linux-gnu'}
			: null

	const [claudeReal, geminiReal, nodeReal] = await Promise.all([
		resolveRealBin('claude'),
		resolveRealBin('gemini'),
		resolveRealBin('node'),
	])

	const claude = claudeReal
		? {pkgDir: packageDirFor(claudeReal, '/claude-code'), hostExe: claudeReal}
		: null
	const gemini = geminiReal
		? {pkgDir: packageDirFor(geminiReal, '/gemini-cli'), hostEntry: geminiReal}
		: null

	if (!claude && !gemini) return null

	const claudeDir = (await pathExists(path.join(homeDir, '.claude'))) ? path.join(homeDir, '.claude') : null
	const geminiDir = (await pathExists(path.join(homeDir, '.gemini'))) ? path.join(homeDir, '.gemini') : null

	return {glibc, node: nodeReal, claude, gemini, creds: {claudeDir, geminiDir}, homeDir}
}

/** Map a host path under `pkgDir` to its in-container path under `<prefix>/<sub>`. */
function rebase(hostPath: string, pkgDir: string, sub: string): string {
	return `${CLI_MOUNT_PREFIX}/${sub}${hostPath.slice(pkgDir.length)}`
}

function setServiceEnv(service: any, key: string, value: string): void {
	if (Array.isArray(service.environment)) {
		const idx = service.environment.findIndex(
			(e: unknown) => typeof e === 'string' && (e === key || e.startsWith(`${key}=`)),
		)
		if (idx >= 0) service.environment[idx] = `${key}=${value}`
		else service.environment.push(`${key}=${value}`)
		return
	}
	if (!service.environment || typeof service.environment !== 'object') service.environment = {}
	service.environment[key] = value
}

function getServiceEnv(service: any, key: string): string | undefined {
	if (Array.isArray(service.environment)) {
		const hit = service.environment.find(
			(e: unknown) => typeof e === 'string' && e.startsWith(`${key}=`),
		) as string | undefined
		return hit ? hit.slice(key.length + 1) : undefined
	}
	if (service.environment && typeof service.environment === 'object') return service.environment[key]
	return undefined
}

/**
 * Mutate `composeData` (parsed docker-compose object) to mount the host AI CLIs
 * + runtime + creds + wrappers into the FIRST service, and prepend the wrapper
 * dir to PATH. No-op when `manifest.requiresLocalAiClis !== true` or `detected`
 * is null. Idempotent: volume strings and the PATH prefix are de-duplicated.
 *
 * Only mutates compose; the wrapper scripts themselves are written by
 * `writeLocalAiCliWrappers`, and the creds ACL is granted post-start by
 * `grantContainerCredsAcl`.
 */
export function injectLocalAiClisConfig(
	composeData: any,
	detected: DetectedHostClis | null,
	appDataDir: string,
	manifest: Pick<AppManifest, 'requiresLocalAiClis'>,
): any {
	if (manifest.requiresLocalAiClis !== true || !detected) return composeData

	const services = composeData?.services
	if (!services || typeof services !== 'object') return composeData
	const mainServiceName = Object.keys(services)[0]
	if (!mainServiceName) return composeData
	const service = services[mainServiceName]
	if (!service || typeof service !== 'object') return composeData

	if (!Array.isArray(service.volumes)) service.volumes = []
	const add = (v: string) => {
		if (!service.volumes.includes(v)) service.volumes.push(v)
	}

	// Host glibc → isolated prefix (never shadows the container's own libs).
	if (detected.glibc) {
		add(`${detected.glibc.lib64}:${CLI_MOUNT_PREFIX}/glibc/lib64:ro`)
		add(`${detected.glibc.libX86}:${CLI_MOUNT_PREFIX}/glibc/lib-x86_64:ro`)
		add(`${detected.glibc.usrLibX86}:${CLI_MOUNT_PREFIX}/glibc/usrlib-x86_64:ro`)
	}
	// Host node binary (gemini runs on it).
	if (detected.node) add(`${detected.node}:${CLI_MOUNT_PREFIX}/node/bin/node:ro`)
	// CLI install dirs.
	if (detected.claude) add(`${detected.claude.pkgDir}:${CLI_MOUNT_PREFIX}/claude-code:ro`)
	if (detected.gemini) add(`${detected.gemini.pkgDir}:${CLI_MOUNT_PREFIX}/gemini-cli:ro`)
	// Wrapper scripts (read-only) + a writable scratch HOME for CLI self-config.
	add(`${appDataDir}/host-clis/bin:${CLI_MOUNT_PREFIX}/bin:ro`)
	add(`${appDataDir}/host-clis/home:${CLI_MOUNT_PREFIX}/home:rw`)
	// Operator creds, mounted INSIDE the scratch HOME (nested bind mount — the
	// longer target path wins) so $HOME/.claude resolves to the real creds.
	if (detected.creds.claudeDir) add(`${detected.creds.claudeDir}:${CLI_MOUNT_PREFIX}/home/.claude:rw`)
	if (detected.creds.geminiDir) add(`${detected.creds.geminiDir}:${CLI_MOUNT_PREFIX}/home/.gemini:rw`)

	// Prepend our wrapper dir to PATH so `claude` / `gemini` resolve to the
	// wrappers. Preserve an existing compose PATH if set; otherwise use the
	// standard Linux default (covers /usr/local/bin where node images put node).
	const existingPath = getServiceEnv(service, 'PATH')
	const basePath = existingPath && existingPath.length > 0 ? existingPath : DEFAULT_PATH
	if (!basePath.split(':').includes(`${CLI_MOUNT_PREFIX}/bin`)) {
		setServiceEnv(service, 'PATH', `${CLI_MOUNT_PREFIX}/bin:${basePath}`)
	}

	return composeData
}

const SH_HEADER = '#!/bin/sh\n'
const LOADER_INVOKE = `exec ${LOADER} --library-path ${LIB_PATH}`

/**
 * Write the wrapper scripts (and create the scratch HOME) under
 * `<appDataDir>/host-clis/`. Must run before the container starts so the
 * read-only bin mount has content. Returns the list of wrappers written.
 */
export async function writeLocalAiCliWrappers(
	appDataDir: string,
	detected: DetectedHostClis | null,
): Promise<string[]> {
	if (!detected) return []
	const binDir = path.join(appDataDir, 'host-clis', 'bin')
	const homeDir = path.join(appDataDir, 'host-clis', 'home')
	await fse.mkdirp(binDir)
	await fse.mkdirp(homeDir)
	// World-writable so any container uid can write CLI self-config into $HOME.
	await fse.chmod(homeDir, 0o777).catch(() => {})

	const written: string[] = []
	const writeWrapper = async (name: string, body: string) => {
		const file = path.join(binDir, name)
		await fse.writeFile(file, body)
		await fse.chmod(file, 0o755).catch(() => {})
		written.push(name)
	}

	if (detected.claude) {
		const containerExe = rebase(detected.claude.hostExe, detected.claude.pkgDir, 'claude-code')
		await writeWrapper(
			'claude',
			`${SH_HEADER}export HOME=${CLI_MOUNT_PREFIX}/home\n${LOADER_INVOKE} ${containerExe} "$@"\n`,
		)
	}

	if (detected.gemini && detected.node) {
		const containerEntry = rebase(detected.gemini.hostEntry, detected.gemini.pkgDir, 'gemini-cli')
		const nodeBin = `${CLI_MOUNT_PREFIX}/node/bin/node`
		// GEMINI_CLI_NO_RELAUNCH=1: gemini-cli otherwise re-spawns process.execPath
		// with `--max-old-space-size=…` to bump the heap, but under the explicit
		// loader that re-exec passes the flag to ld-linux (which rejects it) and
		// crashes. Suppressing the relaunch makes it run in-process. Verified on
		// the Mini PC (gemini --version → 0.44.1).
		await writeWrapper(
			'gemini',
			`${SH_HEADER}export HOME=${CLI_MOUNT_PREFIX}/home\nexport GEMINI_CLI_NO_RELAUNCH=1\n${LOADER_INVOKE} ${nodeBin} ${containerEntry} "$@"\n`,
		)
		// NOTE: we deliberately do NOT drop a `node` wrapper on PATH. Doing so
		// shadows the app container's OWN node (musl) with the host glibc node,
		// which breaks the app's startup (its native .node addons are musl) —
		// observed as a crash-loop on the Alpine-based Open Design image. The
		// gemini wrapper invokes the host node by absolute path instead, and
		// GEMINI_CLI_NO_RELAUNCH stops gemini from re-spawning node itself.
	}

	return written
}

/**
 * After the container is up, grant its uid POSIX-ACL access to the operator's
 * bind-mounted credential dirs (read/write so OAuth token refresh persists).
 * No-op when the container runs as root (uid 0 reads everything) or when
 * setfacl / docker are unavailable. Best-effort: never throws.
 */
export async function grantContainerCredsAcl(
	appDataDir: string,
	detected: DetectedHostClis | null,
	logger?: {log: (m: string) => void; error: (m: string, e?: unknown) => void},
): Promise<void> {
	if (!detected) return
	const credDirs = [detected.creds.claudeDir, detected.creds.geminiDir].filter(Boolean) as string[]
	if (credDirs.length === 0) return
	try {
		const {stdout: ids} = await $({cwd: appDataDir})`docker compose ps -q`
		const containerId = ids.split('\n').map((s) => s.trim()).filter(Boolean)[0]
		if (!containerId) {
			logger?.log('grantContainerCredsAcl: no running container, skipping ACL')
			return
		}
		const {stdout: uidOut} = await $`docker exec ${containerId} id -u`
		const uid = uidOut.trim()
		if (!uid || uid === '0') {
			logger?.log(`grantContainerCredsAcl: container runs as uid ${uid || '?'} (root or unknown) — no ACL needed`)
			return
		}
		for (const dir of credDirs) {
			// rwX: read/write files, traverse dirs. -d sets the default ACL so
			// files the CLI creates later (refreshed tokens) inherit access.
			await $`setfacl -R -m ${`u:${uid}:rwX`} ${dir}`.catch((e) =>
				logger?.error(`grantContainerCredsAcl: setfacl failed for ${dir}`, e),
			)
			await $`setfacl -R -d -m ${`u:${uid}:rwX`} ${dir}`.catch(() => {})
		}
		logger?.log(`grantContainerCredsAcl: granted uid ${uid} rwX on ${credDirs.join(', ')}`)
	} catch (error) {
		logger?.error('grantContainerCredsAcl: failed', error)
	}
}
