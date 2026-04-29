import {spawn} from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import {setTimeout} from 'node:timers/promises'
import {fileURLToPath} from 'node:url'

import {TRPCError} from '@trpc/server'
import {z} from 'zod'
import {$} from 'execa'

// TODO: import packageJson from '../../package.json' assert {type: 'json'}
const packageJson = (await import('../../../package.json', {assert: {type: 'json'}})).default

import type {ProgressStatus} from '../apps/schema.js'
import type Livinityd from '../../index.js'
import {LIVINITY_APP_STORE_REPO} from '../../constants.js'
import {performUpdate, getUpdateStatus} from './update.js'

// ─────────────────────────────────────────────────────────────────────────────
// v29.2 Factory Reset module — Phase 37
//
// This module exposes the v29.2 factoryReset lifecycle:
//   - factoryResetInputSchema / FactoryResetInput     — Zod-validated input
//   - preflightCheck(input)                           — gate: rejects when an
//                                                       update is in-progress
//                                                       OR when preserveApiKey
//                                                       requires a missing key
//   - stashApiKey()                                   — extracts the API key
//                                                       from /opt/livos/.env
//                                                       and writes it to
//                                                       /tmp/livos-reset-apikey
//                                                       (mode 0600)
//   - buildEventPath()                                — computes the JSON event
//                                                       row path under
//                                                       /opt/livos/data/update-history
//   - performFactoryReset(livinityd, input)           — top-level entry point
//                                                       called by the tRPC
//                                                       route.  Plan 02 STUB:
//                                                       the systemd-run spawn
//                                                       is replaced with a
//                                                       comment marker that
//                                                       Plan 03 will fill in.
//
// Legacy exports preserved for one cycle (D-RT-01 / D-DEF):
//   - getResetStatus / setResetStatus / resetResetStatus / performReset
//   These are no longer reachable from the tRPC route surface (system.factoryReset
//   was rewritten in routes.ts). The legacy `getFactoryResetStatus` query in
//   routes.ts still calls `getResetStatus()` so we keep that surface intact.
// ─────────────────────────────────────────────────────────────────────────────

// ── Module-level path constants (LITERAL — never variable-derived) ──────────

export const ENV_FILE_PATH = '/opt/livos/.env' as const
export const APIKEY_TMP_PATH = '/tmp/livos-reset-apikey' as const
export const UPDATE_HISTORY_DIR = '/opt/livos/data/update-history' as const
export const SNAPSHOT_SIDECAR_PATH = '/tmp/livos-pre-reset.path' as const

// Runtime deployment directories (D-CG-02): the bash artifacts get copied here
// at first-call cold-start. Mode 0755 — executable by root + livinityd's user.
export const RESET_SCRIPT_RUNTIME_DIR = '/opt/livos/data/factory-reset' as const
export const WRAPPER_RUNTIME_DIR = '/opt/livos/data/wrapper' as const

// Plan 03 fills in the deployment+spawn paths; this plan declares the runtime
// targets only so consumers can reference them without circular imports.
export const RESET_SCRIPT_RUNTIME_PATH = '/opt/livos/data/factory-reset/reset.sh' as const
export const WRAPPER_RUNTIME_PATH = '/opt/livos/data/wrapper/livos-install-wrap.sh' as const

// Source-tree paths (for first-call cold-start copy). At runtime on Mini PC
// the source IS the runtime tree: livinityd is launched with tsx against
// /opt/livos/packages/livinityd/source/, so __dirname here resolves to the
// directory holding both factory-reset.sh and livos-install-wrap.sh.
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
export const SOURCE_RESET_SH = path.join(__dirname, 'factory-reset.sh')
export const SOURCE_WRAPPER = path.join(__dirname, 'livos-install-wrap.sh')

// ── Zod input schema (D-RT-01) ──────────────────────────────────────────────

export const factoryResetInputSchema = z.object({
	preserveApiKey: z.boolean(),
})

export type FactoryResetInput = z.infer<typeof factoryResetInputSchema>

// ── Result type (D-RT-01 return shape) ──────────────────────────────────────

export interface FactoryResetAccepted {
	accepted: true
	eventPath: string
	// The path that *will* be written by the bash; sidecar at SNAPSHOT_SIDECAR_PATH
	// points to the actual tar.gz path once the bash starts. Plan 02 returns the
	// sidecar path (not the tar.gz path itself) because the tar isn't created
	// until Plan 03's spawn lands.
	snapshotPath: string
}

// ── Pre-flight check (D-RT-05) ──────────────────────────────────────────────

/**
 * Pre-flight checks that gate the spawn. Each check is fast (<50ms target).
 * Throws TRPCError on rejection:
 *   - CONFLICT when an *-update.json with status:in-progress exists
 *   - BAD_REQUEST when preserveApiKey=true but /opt/livos/.env is missing or
 *     does not contain a non-empty LIV_PLATFORM_API_KEY
 *
 * preserveApiKey=false skips the .env check entirely (D-KEY-02).
 */
export async function preflightCheck(input: FactoryResetInput): Promise<void> {
	// Check 1: update-in-progress (D-RT-05)
	try {
		const entries = await fs.readdir(UPDATE_HISTORY_DIR)
		for (const f of entries) {
			if (!f.endsWith('-update.json')) continue
			try {
				const raw = await fs.readFile(path.join(UPDATE_HISTORY_DIR, f), 'utf8')
				const parsed = JSON.parse(raw)
				if (parsed?.status === 'in-progress') {
					throw new TRPCError({
						code: 'CONFLICT',
						message: 'An update is currently in progress; cannot factory-reset',
					})
				}
			} catch (err) {
				if (err instanceof TRPCError) throw err
				// corrupt JSON — skip this file, continue scanning
			}
		}
	} catch (err: any) {
		if (err instanceof TRPCError) throw err
		if (err && err.code === 'ENOENT') {
			// dir absent — no updates have ever run; allow reset
		} else {
			throw err
		}
	}

	// Check 2: API key present in .env if preserveApiKey (D-RT-05)
	if (input.preserveApiKey) {
		let envContent = ''
		try {
			envContent = await fs.readFile(ENV_FILE_PATH, 'utf8')
		} catch (err: any) {
			if (err && err.code === 'ENOENT') {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: '/opt/livos/.env not found — cannot preserve API key',
				})
			}
			throw err
		}
		const m = envContent.match(/^LIV_PLATFORM_API_KEY=(.*)$/m)
		const value = m ? m[1].replace(/^["']|["']$/g, '').trim() : ''
		if (!value) {
			throw new TRPCError({
				code: 'BAD_REQUEST',
				message: 'LIV_PLATFORM_API_KEY missing from /opt/livos/.env — cannot preserve API key',
			})
		}
	}
}

// ── API key stash (D-KEY-01) ────────────────────────────────────────────────

/**
 * Reads LIV_PLATFORM_API_KEY from /opt/livos/.env and writes it to
 * /tmp/livos-reset-apikey with mode 0600. Returns the path on success.
 *
 * Caller MUST have already passed preflightCheck(input={preserveApiKey:true}).
 * The bash spawned by Plan 03 has an EXIT trap that removes APIKEY_TMP_PATH
 * unconditionally (D-KEY-03), so this file never outlives the reset run.
 */
export async function stashApiKey(): Promise<string> {
	const envContent = await fs.readFile(ENV_FILE_PATH, 'utf8')
	const m = envContent.match(/^LIV_PLATFORM_API_KEY=(.*)$/m)
	if (!m) {
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: 'LIV_PLATFORM_API_KEY not found in /opt/livos/.env',
		})
	}
	const value = m[1].replace(/^["']|["']$/g, '').trim()
	if (!value) {
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: 'LIV_PLATFORM_API_KEY is empty in /opt/livos/.env',
		})
	}
	// Write with mode 0600 (umask-safe via the explicit mode option).
	await fs.writeFile(APIKEY_TMP_PATH, value, {mode: 0o600})
	// Re-chmod defensively in case the file existed beforehand with looser perms.
	await fs.chmod(APIKEY_TMP_PATH, 0o600)
	return APIKEY_TMP_PATH
}

// ── Event metadata helper ───────────────────────────────────────────────────

/**
 * Computes the JSON event row path for this reset invocation.
 * Format matches Phase 33 OBS-01 (UTC ISO timestamp basic-format),
 * e.g. "20260429T120030Z".
 *
 * Uses path.posix.join so the resulting path stays POSIX-shaped on Windows
 * dev hosts — the path flows into bash argv on the Mini PC.
 */
export function buildEventPath(): {timestamp: string; eventPath: string} {
	const timestamp = new Date()
		.toISOString()
		.replace(/[-:]/g, '')
		.replace(/\.\d{3}Z$/, 'Z')
	const eventPath = path.posix.join(UPDATE_HISTORY_DIR, `${timestamp}-factory-reset.json`)
	return {timestamp, eventPath}
}

// ── Runtime artifact deployment (D-CG-02) ───────────────────────────────────

/**
 * Copies factory-reset.sh and livos-install-wrap.sh from the source tree to
 * /opt/livos/data/{factory-reset,wrapper}/ with mode 0755.
 *
 * Idempotent: if the destination file exists with the executable bit set AND
 * its mtime is greater-than-or-equal-to the source's mtime, the copy is
 * skipped. Otherwise the destination is overwritten and re-chmodded. Both
 * source files MUST exist; absence is a TRPCError INTERNAL_SERVER_ERROR
 * (means dev/build broke).
 *
 * Per CONTEXT.md D-CG-02 (first-call cold-start deploy chosen for v29.2 —
 * source-tree shipping out of scope this milestone). Steady-state cost is a
 * single fs.stat per artifact (~1ms total).
 */
export async function deployRuntimeArtifacts(): Promise<void> {
	const pairs: Array<[string, string]> = [
		[SOURCE_RESET_SH, RESET_SCRIPT_RUNTIME_PATH],
		[SOURCE_WRAPPER, WRAPPER_RUNTIME_PATH],
	]

	for (const [src, dst] of pairs) {
		// Verify source exists (R_OK = readable by current EUID).
		try {
			await fs.access(src, fs.constants.R_OK)
		} catch {
			throw new TRPCError({
				code: 'INTERNAL_SERVER_ERROR',
				message: `factory-reset source missing in install: ${src}`,
			})
		}

		// Ensure destination directory exists (mkdir -p).
		await fs.mkdir(path.dirname(dst), {recursive: true, mode: 0o755})

		// Freshness check: if dest is fresh AND has the executable bit, skip.
		// Otherwise overwrite. Any stat failure on the destination → first call.
		let needsCopy = true
		try {
			const [srcStat, dstStat] = await Promise.all([fs.stat(src), fs.stat(dst)])
			const dstMode = dstStat.mode & 0o777
			if (dstStat.mtimeMs >= srcStat.mtimeMs && (dstMode & 0o100) !== 0) {
				needsCopy = false
			}
		} catch {
			// Destination doesn't exist (or stat failed) — first call, must copy.
		}

		if (needsCopy) {
			await fs.copyFile(src, dst)
			// Defensive chmod after copy in case the source mode is restrictive
			// or copyFile preserved a non-executable mode.
			await fs.chmod(dst, 0o755)
		}
	}
}

// ── Cgroup-escape spawn (D-CG-01) ───────────────────────────────────────────

/**
 * Spawns the wipe+reinstall bash inside a transient `systemd-run --scope --collect`
 * unit so the bash survives `systemctl stop livos` mid-flight (cgroup-escape
 * pattern, project memory reference_cgroup_escape.md).
 *
 * Returns immediately after spawn (does NOT await the bash). The bash writes
 * progress to the JSON event row at `eventPath`; the UI polls that row.
 *
 * Per CONTEXT.md D-CG-01 (canonical invocation). Throws TRPCError
 * INTERNAL_SERVER_ERROR if `systemd-run` is unavailable on the host (e.g., dev
 * machine without systemd) or if EUID is not 0 (livinityd should always run as
 * root on Mini PC; this is a defense-in-depth sanity check complementing
 * adminProcedure RBAC).
 */
export async function spawnResetScope(args: {
	preserveApiKey: boolean
	eventPath: string
	timestamp: string
}): Promise<void> {
	// Pre-spawn assertions: systemd-run must be on PATH AND livinityd must be
	// running as root. Both checks throw before the spawn call so the route
	// handler can surface a clear INTERNAL_SERVER_ERROR.
	await assertSystemdRunAvailable()
	assertRootEuid()

	const unitName = `livos-factory-reset-${args.timestamp}`
	const child = spawn(
		'systemd-run',
		[
			'--scope',
			'--collect',
			'--unit', unitName,
			'--quiet',
			'bash',
			RESET_SCRIPT_RUNTIME_PATH,
			args.preserveApiKey ? '--preserve-api-key' : '--no-preserve-api-key',
			args.eventPath,
		],
		{
			detached: true,
			stdio: 'ignore',
		},
	)
	child.unref()

	// We do NOT await the child. Route handler returns immediately; the bash
	// logs go to the JSON event row at args.eventPath.
}

/**
 * Runs `command -v systemd-run` via execa to assert the binary is on PATH.
 * Throws TRPCError INTERNAL_SERVER_ERROR with a diagnostic message if the
 * lookup fails (non-systemd hosts, container envs, broken PATH, etc.).
 *
 * Isolated as a helper for unit-test mockability — the test mocks 'execa' to
 * reject and verifies the wrapped TRPCError surfaces.
 */
async function assertSystemdRunAvailable(): Promise<void> {
	const {execa} = await import('execa')
	try {
		await execa('command', ['-v', 'systemd-run'], {shell: '/bin/bash'})
	} catch {
		throw new TRPCError({
			code: 'INTERNAL_SERVER_ERROR',
			message: 'systemd-run binary not found on host (factory reset requires systemd)',
		})
	}
}

/**
 * Asserts process.geteuid() returns 0. On Windows dev hosts process.geteuid
 * does not exist (typeof check returns -1), and on non-root linux it returns
 * the actual UID. Either case → INTERNAL_SERVER_ERROR with the observed EUID
 * in the message for diagnostics.
 *
 * On Mini PC at runtime, livinityd is launched by the livos.service systemd
 * unit as root (User=root in the unit file), so geteuid() === 0.
 */
function assertRootEuid(): void {
	const euid = typeof process.geteuid === 'function' ? process.geteuid() : -1
	if (euid !== 0) {
		throw new TRPCError({
			code: 'INTERNAL_SERVER_ERROR',
			message: `factory reset requires root (livinityd EUID is ${euid}); cannot proceed`,
		})
	}
}

// ── Top-level entry point (called by routes.ts) ─────────────────────────────

/**
 * Top-level entry point invoked by the tRPC route. Performs:
 *   1. preflightCheck (throws on rejection — D-RT-05)
 *   2. deployRuntimeArtifacts (lazy first-call cold-start copy — D-CG-02)
 *   3. stashApiKey if preserveApiKey (D-KEY-01)
 *   4. spawnResetScope: detached systemd-run --scope --collect spawn (D-CG-01)
 *   5. Returns FactoryResetAccepted with eventPath + snapshotPath sidecar
 *
 * Wall-clock budget: ≤200ms (D-RT-03). The spawn is detached and unref'd; the
 * bash runs in a separate transient cgroup so `systemctl stop livos` mid-wipe
 * does NOT kill it.
 */
export async function performFactoryReset(
	_livinityd: Livinityd,
	input: FactoryResetInput,
): Promise<FactoryResetAccepted> {
	await preflightCheck(input)

	// Lazy-deploy the bash artifacts on first call (D-CG-02). Idempotent: a
	// fresh executable copy at /opt/livos/data/{factory-reset,wrapper}/ skips
	// the copy and only stat()s.
	await deployRuntimeArtifacts()

	if (input.preserveApiKey) {
		await stashApiKey()
	}

	const {timestamp, eventPath} = buildEventPath()

	// Detached spawn into a cgroup-escaped transient scope (D-CG-01). The
	// helper performs systemd-run + EUID 0 sanity checks before spawning;
	// any rejection surfaces as TRPCError INTERNAL_SERVER_ERROR.
	await spawnResetScope({
		preserveApiKey: input.preserveApiKey,
		eventPath,
		timestamp,
	})

	return {
		accepted: true,
		eventPath,
		// Sidecar path — bash writes the actual tar.gz path here once the
		// snapshot step (Plan 01 §Snapshot) runs.
		snapshotPath: SNAPSHOT_SIDECAR_PATH,
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy exports — KEEP for backward compat with the public
// `getFactoryResetStatus` query in routes.ts. The legacy `performReset` is no
// longer reachable from the tRPC surface (system.factoryReset was rewritten),
// but is retained for one cycle so external callers (if any) don't break. The
// state-tracking variables are exported only via getResetStatus().
// ─────────────────────────────────────────────────────────────────────────────

type ResetStatus = ProgressStatus

let resetStatus: ResetStatus
resetResetStatus()

/** @deprecated v29.2 — replaced by JSON event row at /opt/livos/data/update-history/<ts>-factory-reset.json. UI should poll listUpdateHistory instead. */
export function resetResetStatus() {
	resetStatus = {
		running: false,
		progress: 0,
		description: '',
		error: false,
	}
}

/** @deprecated v29.2 — replaced by JSON event row. */
export function setResetStatus(properties: Partial<ResetStatus>) {
	resetStatus = {...resetStatus, ...properties}
}

/** @deprecated v29.2 — kept so the public `system.getFactoryResetStatus` query still compiles. */
export function getResetStatus() {
	return resetStatus
}

/**
 * @deprecated v29.2 — replaced by performFactoryReset() + bash. The legacy
 * implementation is preserved in source for one cycle; it is NOT reachable
 * from the tRPC route surface anymore (system.factoryReset was rewritten to
 * use performFactoryReset).
 */
export async function performReset(livinityd: Livinityd) {
	const {dataDirectory} = livinityd

	function failWithError(error: string) {
		try {
			livinityd.logger.error(`Factory reset failed at ${resetStatus.progress}%`, error)
		} catch {}
		resetResetStatus()
		setResetStatus({error})
		return false
	}

	setResetStatus({running: true, progress: 5, description: 'Resetting...', error: false})
	try {
		await Promise.race([livinityd.appStore.stop(), setTimeout(60000)])
	} catch {}
	try {
		await Promise.race([livinityd.apps.stop(), setTimeout(60000)])
	} catch {}

	setResetStatus({progress: 15})
	try {
		await Promise.race([$`systemctl stop docker docker.socket`, setTimeout(60000)])
	} catch {}
	try {
		await $`pkill -9 docker`
	} catch {
		// exits with status 1 if there are no matching processes anymore
	}

	setResetStatus({progress: 20})
	try {
		const dockerDataDirectory = '/var/lib/docker'
		await $`mkdir -p ${dockerDataDirectory}`
		await $`find ${dockerDataDirectory} -mindepth 1 -delete`
		await $`chmod 710 ${dockerDataDirectory}`
	} catch (err) {
		return failWithError(`Failed to wipe app data: ${(err as any).message}`)
	}

	let userExists = false
	let userName: string
	let userHashedPassword: string
	try {
		userName = await livinityd.store.get('user.name')
		userHashedPassword = await livinityd.store.get('user.hashedPassword')
		if (userName.length > 0 && userHashedPassword.length > 0) {
			userExists = true
		}
	} catch {}

	setResetStatus({progress: 35})

	try {
		await livinityd.backups.stop()
		await livinityd.files.externalStorage.stop()
		await livinityd.files.networkStorage.stop()
	} catch (error) {
		return failWithError(`Failed to stop livinityd services: ${(error as any).message}`)
	}

	try {
		await $`mkdir -p ${dataDirectory}`
		await $`find ${dataDirectory} -mindepth 1 -not -path ${livinityd.files.getBaseDirectory('/External')} -not -path ${livinityd.files.getBaseDirectory('/External')}/* -not -path ${livinityd.files.getBaseDirectory('/Network')} -not -path ${livinityd.files.getBaseDirectory('/Network')}/* -delete`
		await $`chmod 755 ${dataDirectory}`
	} catch (err) {
		return failWithError(`Failed to wipe user data: ${(err as any).message}`)
	} finally {
		try {
			if (userExists) {
				await livinityd.store.set('user.name', userName!)
				await livinityd.store.set('user.hashedPassword', userHashedPassword!)
			}
			livinityd.version = packageJson.version
			if (livinityd.appStore) {
				livinityd.appStore.defaultAppStoreRepo = LIVINITY_APP_STORE_REPO
			}
			await livinityd.store.set('version', livinityd.version)
			await livinityd.store.set('apps', [])
			await livinityd.store.set('appRepositories', [LIVINITY_APP_STORE_REPO])
		} catch {}
	}

	const updateStartPercentage = 50
	const updateEndPercentage = 95
	setResetStatus({progress: updateStartPercentage})
	let updating = true
	const relayUpdateProgress = async () => {
		while (updating) {
			try {
				const updatePercentage = getUpdateStatus().progress
				const combinedPercentage =
					updateStartPercentage + Math.floor((updatePercentage / 100) * (updateEndPercentage - updateStartPercentage))
				setResetStatus({progress: combinedPercentage})
				await setTimeout(1000)
			} catch {
				break
			}
		}
	}
	try {
		relayUpdateProgress()
		const success = await performUpdate(livinityd)
		if (!success) {
			const updateError = getUpdateStatus().error
			if (typeof updateError === 'string') {
				return failWithError(`Update failed: ${updateError}`)
			} else {
				return failWithError(`Update failed`)
			}
		}
	} catch (error) {
		return failWithError(`Update failed: ${(error as any).message}`)
	} finally {
		updating = false
	}

	setResetStatus({progress: 95})
	try {
		await $`rm -f ${dataDirectory}/livinity.yaml`
	} catch {}

	setResetStatus({running: false, progress: 100, description: 'Restarting...'})

	return true
}
