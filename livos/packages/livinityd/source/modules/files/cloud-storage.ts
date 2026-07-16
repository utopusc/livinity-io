import {setTimeout as sleep} from 'node:timers/promises'

import fse from 'fs-extra'
import {$} from 'execa'

import {decrypt, getKey, getLegacyKey, deriveConfigPassword} from '../secrets/dek.js'
import {runRclone} from '../system/routes.js'

import type Livinityd from '../../index.js'

// ─── Phase 324-05 FILES-03 (D-12/D-13/D-14) — cloud-drive mount manager ──────────
// A DIRECT clone of network-storage.ts's shape (store-key-driven lifecycle, ~60s
// re-mount watch, `mountpoint` liveness check, and the strict input-guard
// discipline) — DELTA: mounts go through the 324-03 rclone wrapper's templated
// `rclone-mount@<remote>.service` systemd unit (NOT the CIFS kernel mount that
// network-storage uses), and the store
// key is the dedicated TOP-LEVEL `cloudDrives` (webdav precedent — dot-prop path
// collisions silently drop nested writes, D-14/D-17).
//
// SECURITY — the rclone `remote` name reaches BOTH a privileged `sudo <wrapper>`
// argv AND the systemd `%I` instance template, so it MUST be charset-guarded to a
// safe `[a-z0-9_-]` token BEFORE any mount/config side effect (T-324-16). The
// wrapper re-validates too (defense-in-depth), exactly like network-storage's
// re-validate-at-the-mount-sink discipline. The raw OAuth token is DEK-encrypted at
// rest in the store (`configBlob`) and rclone.conf is regenerated on-demand 0600
// root via the wrapper's `config-write` (samba.ts applyShares idiom) — the plaintext
// token is NEVER an argv and NEVER persisted in the clear (T-324-14/T-324-15).

export type CloudBackend = 'drive' | 'dropbox' | 'onedrive'

/** The rclone backends surfaced by the guided authorize wizard — must mirror the
 *  324-03 wrapper's `authorize-start` backend allowlist exactly. */
export const CLOUD_BACKENDS: readonly CloudBackend[] = ['drive', 'dropbox', 'onedrive']

/**
 * A safe rclone remote name: lowercase alnum + `-`/`_` only. This is the SINGLE
 * most important guard in this module — the value crosses into a privileged
 * `sudo livos-rclone.sh mount <remote> …` argv and, via the wrapper, into the
 * systemd `rclone-mount@<remote>.service` instance name (the `%I` template). Any
 * path separator, whitespace, shell metachar, `%`, `.`, `@`, or uppercase char is
 * rejected — mirrors the network-storage SMB_HOST_RE / assertValid idiom (T-324-16).
 */
const REMOTE_NAME_RE = /^[a-z0-9_-]+$/
/** rclone.conf is line-oriented (`key = value`, `[section]`), so a `\n`/`\r` in a
 *  token / client value could inject an attacker-chosen extra `[section]`. Reject
 *  any control-char-bearing config value before rendering (config-section injection). */
const CONFIG_VALUE_INJECTION_RE = /[\n\r]/

/** True iff `remote` is a safe rclone remote name (see REMOTE_NAME_RE). */
export function isValidRemoteName(remote: string): boolean {
	return typeof remote === 'string' && remote.length > 0 && remote.length <= 64 && REMOTE_NAME_RE.test(remote)
}

/** Throws `[invalid-remote-name]` unless `remote` is a safe rclone remote name. */
export function assertValidRemoteName(remote: string): void {
	if (!isValidRemoteName(remote)) throw new Error('[invalid-remote-name]')
}

/** The writable `/Cloud/<remote>` virtual mount path for a (validated) remote. */
export function cloudMountPath(remote: string): string {
	assertValidRemoteName(remote)
	return `/Cloud/${remote}`
}

/** Throws `[invalid-cloud-config-value]` if a rendered config value carries a
 *  control char that could inject an extra rclone.conf section. */
function assertValidConfigValue(value: string): void {
	if (CONFIG_VALUE_INJECTION_RE.test(value)) throw new Error('[invalid-cloud-config-value]')
}

/**
 * Render the rclone.conf `[remote]` section for a configured drive. The plaintext
 * of this string is what the wrapper's `config-write` receives on STDIN (never
 * argv) and writes to /etc/rclone/rclone.conf 0600 root; livinityd persists it only
 * as the DEK-encrypted `configBlob`. Uses rclone's built-in SHARED client_id by
 * default (zero per-provider setup, D-13); `clientId`/`clientSecret` are the UI
 * escape-hatch for an operator's own OAuth app if the shared client is throttled.
 */
export function renderRcloneConfigSection(input: {
	remote: string
	backend: CloudBackend
	token: string
	clientId?: string
	clientSecret?: string
}): string {
	assertValidRemoteName(input.remote)
	if (!CLOUD_BACKENDS.includes(input.backend)) throw new Error('[invalid-backend]')
	assertValidConfigValue(input.token)
	const lines = [`[${input.remote}]`, `type = ${input.backend}`, `token = ${input.token.trim()}`]
	if (input.clientId != null && input.clientId !== '') {
		assertValidConfigValue(input.clientId)
		lines.push(`client_id = ${input.clientId.trim()}`)
	}
	if (input.clientSecret != null && input.clientSecret !== '') {
		assertValidConfigValue(input.clientSecret)
		lines.push(`client_secret = ${input.clientSecret.trim()}`)
	}
	return lines.join('\n') + '\n'
}

/**
 * The guided TWO-MACHINE copy-paste `rclone authorize` wizard text (D-13's
 * guaranteed v1 fallback — the parseable-URL browser-proxy is a 324-HUMAN-UAT
 * box-follow-up). Because a headless box cannot open a browser, the operator runs
 * `rclone authorize "<backend>"` on ANY machine that HAS a browser + rclone, signs
 * in there, then copy-pastes the resulting token blob back into the add-drive
 * dialog (→ cloudDriveAdd → the wrapper's config-write). Uses rclone's built-in
 * SHARED client_id, so there is zero per-provider OAuth-app setup.
 */
export function buildAuthorizeInstructions(backend: CloudBackend): string {
	if (!CLOUD_BACKENDS.includes(backend)) throw new Error('[invalid-backend]')
	return [
		`To connect this ${backend} drive, authorize it from a computer that has a web browser:`,
		'',
		`  1. On that computer, install rclone (https://rclone.org/downloads/) and run:`,
		`         rclone authorize "${backend}"`,
		`  2. A browser window opens — sign in and approve access.`,
		`  3. rclone prints a token blob. Copy it and paste it back here to finish.`,
		'',
		'No browser is needed on the server itself; the pasted token is stored encrypted.',
	].join('\n')
}

// The label under which RCLONE_CONFIG_PASS is derived from the credential DEK
// (deriveConfigPassword) — a stable, box-local, never-persisted obscure-password.
// The privileged wrapper path itself lives in system/routes.ts's runRclone (the
// shared route helper this manager calls for config-write/mount/unmount).
const RCLONE_CONFIG_PASS_LABEL = 'rclone-config'

type CloudDrive = {
	remote: string
	backend: CloudBackend
	mountPath: string
	// DEK-encrypted rclone.conf section (base64 iv+tag+ct) — holds the raw OAuth
	// token. NEVER logged, NEVER passed as argv; decrypted on-demand for config-write.
	configBlob: string
	enabled: boolean
}

export default class CloudStorage {
	#livinityd: Livinityd
	logger: Livinityd['logger']
	mountedDrives: Set<string>
	driveWatchInterval = 1000 * 60 // One minute (mirrors network-storage)
	isRunning = false
	watchJobPromise?: Promise<void>

	constructor(livinityd: Livinityd) {
		this.#livinityd = livinityd
		const {name} = this.constructor
		this.logger = livinityd.logger.createChildLogger(`files:${name.toLowerCase()}`)
		this.mountedDrives = new Set()
	}

	async start() {
		this.isRunning = true
		this.watchJobPromise = this.#watchAndMountDrives().catch((error) =>
			this.logger.error('Error watching and mounting cloud drives', error),
		)
	}

	async stop() {
		this.logger.log('Stopping cloud storage')
		this.isRunning = false

		const ONE_SECOND = 1000

		if (this.watchJobPromise) {
			await Promise.race([
				sleep(ONE_SECOND * 10),
				(async () => {
					this.logger.log('Waiting for cloud watch job to finish')
					await this.watchJobPromise!.catch(() => {})
				})(),
			])
		}
	}

	// List all configured drives from the dedicated top-level `cloudDrives` store key.
	async getDrives(): Promise<CloudDrive[]> {
		return ((await this.#livinityd.store.get('cloudDrives')) as CloudDrive[] | undefined) || []
	}

	// List all drives with mount status (NEVER exposes configBlob).
	async getDriveInfo() {
		const drives = await this.getDrives()
		return drives.map(({remote, backend, mountPath, enabled}) => ({
			remote,
			backend,
			mountPath,
			enabled,
			isMounted: this.mountedDrives.has(mountPath),
		}))
	}

	// Constantly check enabled drives are mounted; (re-)mount any that dropped.
	async #watchAndMountDrives() {
		this.logger.log('Scheduling cloud drive watch interval')
		let lastRun = 0
		while (this.isRunning) {
			await sleep(100)
			const shouldRun = Date.now() - lastRun >= this.driveWatchInterval
			if (!shouldRun) continue
			lastRun = Date.now()

			this.logger.verbose('Running cloud drive watch interval')
			const drives = await this.getDrives()
			await Promise.all(
				drives.map(async (drive) => {
					try {
						if (!drive.enabled) return
						if (await this.#isMounted(drive)) {
							this.mountedDrives.add(drive.mountPath)
						} else {
							this.mountedDrives.delete(drive.mountPath)
							await this.#mountDrive(drive)
						}
					} catch (error) {
						this.logger.verbose(`Failed to check/mount cloud drive ${drive.mountPath}: ${error}`)
					}
				}),
			)
			this.logger.verbose('Cloud drive watch interval complete')
		}
	}

	// Check if a drive is mounted (identical mountpoint(1) probe as network-storage).
	async #isMounted(drive: CloudDrive): Promise<boolean> {
		try {
			const systemMountPath = this.#livinityd.files.virtualToSystemPathUnsafe(drive.mountPath)
			await $`mountpoint ${systemMountPath}`
			return true
		} catch {
			return false
		}
	}

	// Decrypt a stored rclone.conf section blob (DEK, with the LIVOS-052b legacy-key
	// fallback — a JWT-secret rotation never bricks a persisted drive).
	async #decryptConfig(configBlob: string): Promise<string> {
		const key = await getKey()
		try {
			return decrypt(configBlob, key)
		} catch (err) {
			const legacy = await getLegacyKey()
			if (!legacy) throw err
			return decrypt(configBlob, legacy) // throws if legacy also fails (genuine tamper)
		}
	}

	// Attempt to mount a drive via the rclone wrapper's systemd unit. Regenerates
	// rclone.conf on-demand from the DEK-decrypted section (samba.ts applyShares
	// idiom): the plaintext token travels on STDIN (never argv) and RCLONE_CONFIG_PASS
	// travels via ENV (never argv) — both derived from the credential DEK.
	async #mountDrive(drive: CloudDrive): Promise<void> {
		// Re-validate at the mount sink (covers drives persisted before a guard fix,
		// same discipline as network-storage's #mountShare) — the remote reaches a
		// privileged argv + the systemd %I template.
		assertValidRemoteName(drive.remote)

		this.logger.log(`Mounting cloud drive: ${drive.mountPath}`)
		const systemMountPath = this.#livinityd.files.virtualToSystemPathUnsafe(drive.mountPath)
		await fse.ensureDir(systemMountPath)

		const section = await this.#decryptConfig(drive.configBlob)
		const configPass = await deriveConfigPassword(RCLONE_CONFIG_PASS_LABEL)

		// Regenerate /etc/rclone/rclone.conf for this remote (token blob on STDIN).
		const wrote = await runRclone('config-write', [drive.remote], {stdin: section, configPass})
		if (!wrote.ok) throw new Error(`[cloud-config-write-failed] ${wrote.reason}`)

		const mounted = await runRclone('mount', [drive.remote, systemMountPath], {configPass})
		if (!mounted.ok) throw new Error(`[cloud-mount-failed] ${mounted.reason}`)

		this.mountedDrives.add(drive.mountPath)
		this.logger.log(`Successfully mounted cloud drive: ${drive.remote} → ${drive.mountPath}`)
	}

	// Unmount a drive, don't throw on failure (mirrors network-storage's #unmountShare).
	async #unmountDrive(drive: CloudDrive): Promise<void> {
		this.logger.log(`Unmounting cloud drive: ${drive.mountPath}`)
		try {
			assertValidRemoteName(drive.remote)
			await runRclone('unmount', [drive.remote])
			const systemMountPath = this.#livinityd.files.virtualToSystemPathUnsafe(drive.mountPath)
			await fse.rmdir(systemMountPath).catch(() => {})
			this.mountedDrives.delete(drive.mountPath)
			this.logger.log(`Successfully unmounted cloud drive: ${drive.mountPath}`)
		} catch (error) {
			this.logger.error(`Failed to unmount cloud drive ${drive.mountPath}`, error)
		}
	}

	// Get a drive by remote name.
	async getDrive(remote: string): Promise<CloudDrive> {
		const drives = await this.getDrives()
		const drive = drives.find((d) => d.remote === remote)
		if (!drive) throw new Error(`[cloud-drive-not-found] ${remote}`)
		return drive
	}

	// Persist an already-DEK-encrypted drive (the cloudDriveAdd wizard "finish" step
	// builds + encrypts the rclone.conf section in the route layer), then mount it.
	// Fail-soft: a persisted-but-unmounted drive is retried by the 60s watch loop.
	async addEncryptedDrive(input: {
		remote: string
		backend: CloudBackend
		mountPath: string
		configBlob: string
	}): Promise<{added: boolean; mounted: boolean; reason?: string}> {
		assertValidRemoteName(input.remote)
		const drive: CloudDrive = {
			remote: input.remote,
			backend: input.backend,
			mountPath: input.mountPath,
			configBlob: input.configBlob,
			enabled: true,
		}
		await this.#livinityd.store.getWriteLock(async ({set}) => {
			const drives = await this.getDrives()
			const next = drives.filter((d) => d.remote !== drive.remote)
			next.push(drive)
			await set('cloudDrives', next)
		})
		try {
			await this.#mountDrive(drive)
			return {added: true, mounted: true}
		} catch (error) {
			this.logger.error(`Cloud drive ${drive.remote} persisted but initial mount failed`, error)
			return {added: true, mounted: false, reason: String(error)}
		}
	}

	// Mount a configured drive by remote name (route: cloudDriveMount).
	async mountByRemote(remote: string): Promise<{ok: boolean; reason?: string}> {
		assertValidRemoteName(remote)
		const drive = await this.getDrive(remote)
		try {
			await this.#mountDrive(drive)
			return {ok: true}
		} catch (error) {
			return {ok: false, reason: String(error)}
		}
	}

	// Unmount a configured drive by remote name (route: cloudDriveUnmount).
	async unmountByRemote(remote: string): Promise<{ok: boolean}> {
		assertValidRemoteName(remote)
		const drive = await this.getDrive(remote)
		await this.#unmountDrive(drive)
		return {ok: true}
	}

	// Remove a drive: unmount, then drop it from the store.
	async removeDrive(remote: string): Promise<boolean> {
		assertValidRemoteName(remote)
		const drive = await this.getDrive(remote).catch(() => undefined)
		if (drive) await this.#unmountDrive(drive)
		await this.#livinityd.store.getWriteLock(async ({set}) => {
			const drives = await this.getDrives()
			await set(
				'cloudDrives',
				drives.filter((d) => d.remote !== remote),
			)
		})
		return true
	}
}
