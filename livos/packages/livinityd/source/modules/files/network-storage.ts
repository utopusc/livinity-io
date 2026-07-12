import os from 'node:os'
import nodePath from 'node:path'
import {mkdtemp} from 'node:fs/promises'
import {setTimeout} from 'node:timers/promises'

import fse from 'fs-extra'
import {$} from 'execa'
import ky from 'ky'

import {getHostname} from '../system/system.js'

import type Livinityd from '../../index.js'

type NetworkShare = {
	host: string
	share: string
	username: string
	password: string
	mountPath: string
}

// ─── LIVOS-051 (262-04) input guards ─────────────────────────────────────────
// The CIFS mount options used to be built by string interpolation
// (`-o username=...,password=...`), so a `,`/`=`/newline inside any field
// injected attacker-chosen mount options; the host param doubled as an
// arbitrary-host SMB/HTTP connect (SSRF) primitive. These guards run BEFORE
// any mount/probe side effect, and creds now travel via a 0600 credentials=
// file so option-string injection is structurally impossible.

/** Hostname / IPv4 literal only — no `,`/`=`/`/`/`:`/whitespace/newline. */
const SMB_HOST_RE = /^[a-zA-Z0-9._-]+$/
/**
 * Typical SMB share names. Includes `(`/`)`/`'` because LivOS's own Samba
 * shares are named `<dir> (Livinity)`; still excludes every option-injection
 * char (`,`/`=`), path separators, and control chars.
 */
const SMB_SHARE_RE = /^[a-zA-Z0-9._$ ()'-]+$/
/** The CIFS option-string injection characters — never allowed in creds. */
const CRED_INJECTION_RE = /[\n\r,=]/

/**
 * Block loopback / link-local (incl. 169.254.169.254 cloud metadata) /
 * IPv6-loopback literals so the SMB host param cannot probe box-internal
 * services. Replicates webapps/url-validator.ts's syntactic range checks (no
 * DNS resolution — mDNS `<host>.local` names from discoverServers must keep
 * working). `LIVOS_ALLOW_PRIVATE_SMB_HOSTS=1` is a test-harness escape used by
 * the integration suite, which mounts a samba server on localhost.
 *
 * Backups-v2 P0 (D11): RFC1918 ranges are deliberately ALLOWED — a home NAS
 * lives at 192.168.x/10.x by definition, and the original blanket-private
 * block made "add NAS by IP" (and therefore NAS backups) fail with
 * [invalid-smb-host] for every home-LAN user. The SSRF targets that matter
 * from the box's own perspective stay blocked: loopback and the link-local
 * metadata range.
 */
function isPrivateSmbHost(host: string): boolean {
	if (process.env.LIVOS_ALLOW_PRIVATE_SMB_HOSTS === '1') return false
	const lower = host.toLowerCase()
	if (lower === 'localhost') return true
	const m = lower.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
	if (m) {
		const a = Number(m[1])
		const b = Number(m[2])
		if (a > 255 || b > 255 || Number(m[3]) > 255 || Number(m[4]) > 255) return true // malformed → reject
		if (a === 127) return true // loopback
		if (a === 169 && b === 254) return true // link-local + cloud metadata
	}
	// IPv6 loopback (SMB_HOST_RE already rejects `:`, defence-in-depth).
	if (lower === '::1') return true
	return false
}

/** Throws `[invalid-smb-host]` unless `host` is a safe, non-internal SMB host. */
function assertValidSmbHost(host: string): void {
	if (!SMB_HOST_RE.test(host) || isPrivateSmbHost(host)) throw new Error('[invalid-smb-host]')
}

/** Throws on share-name / credential charset violations (option injection). */
function assertValidSmbShareAndCreds({share, username, password}: {share?: string; username: string; password: string}): void {
	if (share !== undefined && !SMB_SHARE_RE.test(share)) throw new Error('[invalid-smb-share]')
	if (CRED_INJECTION_RE.test(username) || CRED_INJECTION_RE.test(password)) throw new Error('[invalid-credentials]')
}

export default class NetworkStorage {
	#livinityd: Livinityd
	logger: Livinityd['logger']
	mountedShares: Set<string>
	shareWatchInterval = 1000 * 60 // One minute
	isRunning = false
	watchJobPromise?: Promise<void>

	constructor(livinityd: Livinityd) {
		this.#livinityd = livinityd
		const {name} = this.constructor
		this.logger = livinityd.logger.createChildLogger(`files:${name.toLowerCase()}`)
		this.mountedShares = new Set()
	}

	async start() {
		this.isRunning = true
		this.watchJobPromise = this.#watchAndMountShares().catch((error) =>
			this.logger.error('Error watching and mounting shares', error),
		)
	}

	async stop() {
		this.logger.log('Stopping network storage')
		this.isRunning = false

		const ONE_SECOND = 1000

		// Wait for background job to finish
		if (this.watchJobPromise) {
			await Promise.race([
				setTimeout(ONE_SECOND * 10),
				(async () => {
					this.logger.log('Waiting for background job to finish')
					await this.watchJobPromise!.catch(() => {})
				})(),
			])
		}

		// Cleanup any currently mounted shares
		await Promise.race([
			setTimeout(ONE_SECOND * 10),
			(async () => {
				this.logger.log('Unmounting shares')
				await this.#unmountAllShares().catch((error) => this.logger.error('Error unmounting shares', error))
			})(),
		])
	}

	// List all shares from the store
	async getShares() {
		return (await this.#livinityd.store.get('files.networkStorage')) || []
	}

	// List all shares including mount status
	async getShareInfo() {
		const shares = await this.getShares()
		return shares.map(({host, share, mountPath}) => ({
			host,
			share,
			mountPath,
			isMounted: this.mountedShares.has(mountPath),
		}))
	}

	// Constantly check if shares are mounted and if not, mount them
	async #watchAndMountShares() {
		this.logger.log('Scheduling network share watch interval')
		let lastRun = 0
		while (this.isRunning) {
			await setTimeout(100)
			const shouldRun = Date.now() - lastRun >= this.shareWatchInterval
			if (!shouldRun) continue
			lastRun = Date.now()

			this.logger.verbose('Running network share watch interval')
			const shares = await this.getShares()
			await Promise.all(
				shares.map(async (share) => {
					try {
						if (await this.#isMounted(share)) {
							this.mountedShares.add(share.mountPath)
						} else {
							this.mountedShares.delete(share.mountPath)
							await this.#mountShare(share)
						}
					} catch (error) {
					this.logger.verbose(`Failed to check/mount share ${share.mountPath}: ${error}`)
				}
				}),
			)
			this.logger.verbose('Network share watch interval complete')
		}
	}

	// Check if a share is mounted
	async #isMounted(share: NetworkShare): Promise<boolean> {
		try {
			const systemMountPath = await this.#livinityd.files.virtualToSystemPathUnsafe(share.mountPath)
			await $`mountpoint ${systemMountPath}`

			return true
		} catch (error) {
			return false
		}
	}

	// Attempt to mount a share
	async #mountShare(share: NetworkShare): Promise<void> {
		this.logger.log(`Mounting network share: ${share.mountPath}`)

		// LIVOS-051 (262-04): re-validate at the mount sink too — covers shares
		// persisted BEFORE this fix that the 60s #watchAndMountShares loop would
		// otherwise keep re-mounting with injectable values.
		assertValidSmbHost(share.host)
		assertValidSmbShareAndCreds(share)

		// Ensure mount directory exists
		const systemMountPath = this.#livinityd.files.virtualToSystemPathUnsafe(share.mountPath)
		await fse.ensureDir(systemMountPath)

		try {
			// Mount the network share
			const smbPath = `//${share.host}/${share.share}`
			const {userId, groupId} = this.#livinityd.files.fileOwner
			// LIVOS-051 (262-04): pass credentials via a 0600 `credentials=` file
			// instead of inline `-o username=...,password=...` — option-string
			// injection is structurally impossible even if a charset check is ever
			// bypassed. The temp dir is 0700 (mkdtemp) and owned by the livinityd
			// process user; the file is deleted in `finally` (success OR failure).
			const credDir = await mkdtemp(nodePath.join(os.tmpdir(), 'livos-cifs-'))
			const credFile = nodePath.join(credDir, 'credentials')
			try {
				const credLines = [`username=${share.username}`, 'password=' + share.password]
				await fse.writeFile(credFile, credLines.join('\n') + '\n', {mode: 0o600})
				await $`mount -t cifs ${smbPath} ${systemMountPath} -o credentials=${credFile},uid=${userId},gid=${groupId},iocharset=utf8`
			} finally {
				await fse.remove(credDir).catch(() => {})
			}
			this.mountedShares.add(share.mountPath)
			this.logger.log(`Successfully mounted network share: ${smbPath} to ${share.mountPath}`)
		} catch (error) {
			// Clean up the directory we created if mount fails
			this.logger.error(`Failed to mount network share: ${share.mountPath}, cleaning up mount directory`)
			this.#unmountShare(share).catch((error) =>
				this.logger.error(`Failed to clean up mount directory after mount failure: ${share.mountPath}`, error),
			)

			// Re-throw the original mount error
			throw error
		}
	}

	// Unmount a share, don't throw on failure
	async #unmountShare(share: NetworkShare): Promise<void> {
		this.logger.log(`Unmounting network share: ${share.mountPath}`)
		try {
			// If we're mounted, unmount
			const systemMountPath = this.#livinityd.files.virtualToSystemPathUnsafe(share.mountPath)
			if (await this.#isMounted(share)) await $`umount ${systemMountPath}`

			// Clean up empty mount directory
			await fse.rmdir(systemMountPath)

			// Clean up parent dir if it's empty
			const parentDirectory = nodePath.dirname(systemMountPath)
			const parentFiles = await fse.readdir(parentDirectory)
			const isParentEmpty = parentFiles.length === 0
			const isParentChildOfNetwork =
				nodePath.dirname(parentDirectory) === this.#livinityd.files.getBaseDirectory('/Network')
			if (isParentEmpty && isParentChildOfNetwork) await fse.rmdir(parentDirectory)

			this.mountedShares.delete(share.mountPath)
			this.logger.log(`Successfully unmounted network share: ${share.mountPath}`)
		} catch (error) {
			this.logger.error(`Failed to unmount network share ${share.mountPath}`, error)
		}
	}

	// Unmount all shares concurrently
	async #unmountAllShares(): Promise<void> {
		const shares = await this.getShares()
		await Promise.all(shares.map(async (share) => this.#unmountShare(share)))
	}

	// Add a new share
	async addShare(newShare: Omit<NetworkShare, 'mountPath'>) {
		// LIVOS-051 (262-04): validate ALL inputs before any mount/persist side
		// effect — host charset + internal-range SSRF block, share-name charset,
		// and strict `,`/`=`/newline rejection in creds (option injection).
		assertValidSmbHost(newShare.host)
		assertValidSmbShareAndCreds(newShare)

		// Generate mount path
		const sanitize = (string: string) => string.replace(/[^a-zA-Z0-9\-\.\' \(\)]/g, '')
		const mountPath = `/Network/${sanitize(newShare.host)}/${sanitize(newShare.share)}`

		// Check if the share already exists
		const alreadyExists = await this.getShare(mountPath)
			.then(() => true)
			.catch(() => false)
		if (alreadyExists) throw new Error(`Share with mount path ${mountPath} already exists`)

		// Create share object
		const share: NetworkShare = {...newShare, mountPath}

		// Check we can mount the share
		await this.#mountShare(share)

		// Save new share in the store
		await this.#livinityd.store.getWriteLock(async ({set}) => {
			const shares = await this.getShares()
			if (shares.find((existingShare) => existingShare.mountPath === share.mountPath)) return
			shares.push(share)
			await set('files.networkStorage', shares)
		})

		return share.mountPath
	}

	// Get a share by mount path
	async getShare(mountPath: string) {
		const shares = await this.getShares()
		const share = shares.find((share) => share.mountPath === mountPath)
		if (!share) throw new Error(`Share with mount path ${mountPath} not found`)
		return share
	}

	// Remove a share
	async removeShare(sharePath: string) {
		const share = await this.getShare(sharePath)

		// Attempt to unmount the share first
		await this.#unmountShare(share)

		// Remove the share from the store
		await this.#livinityd.store.getWriteLock(async ({set}) => {
			const shares = await this.getShares()
			const newShares = shares.filter((existingShare) => existingShare.mountPath !== sharePath)
			await set('files.networkStorage', newShares)
		})

		return true
	}

	// Discover available servers
	// Used to help the user find servers if they don't already know the address
	async discoverServers() {
		const avahiBrowse = await $`avahi-browse --resolve --terminate _smb._tcp --parsable`

		const hostname = await getHostname().catch(() => '')

		const servers = avahiBrowse.stdout
			.split('\n')
			// Grab mDNS domain name
			.map((line) => line.split(';')[6])
			// Filter out empty values
			.filter((line) => typeof line === 'string' && line !== '')
			// Filter out the current hostname
			.filter((line) => line !== `${hostname}.local`)

		// Only return each address once
		return Array.from(new Set(servers))
	}

	// Discover shares for a given samba server
	// Used to help the user find share names if they don't already know them
	async discoverSharesOnServer(host: string, username: string, password: string) {
		// LIVOS-051 (262-04): same host guard as addShare — `smbclient --list
		// //<host>` is an arbitrary-host SMB connect (SSRF) primitive otherwise.
		assertValidSmbHost(host)
		assertValidSmbShareAndCreds({username, password})

		// TODO: Figure out if we can speed this up
		// The command usually returns data quite quickly but then hangs for like 10 seconds
		// and returns some weird compatibility error. Is there some way we can disable whatever
		// is causing the hang so we can get the command to return as soon as we have the info
		// we care about?
		const smbclient = await $`smbclient --list //${host} --user ${username} --password ${password} --grepable`

		const shares = smbclient.stdout
			// Process line by line
			.split('\n')
			// Filter out any lines that don't have 3 '|' separated columns
			.filter((line) => line.split('|').length === 3)
			// Grab the second column (the share name)
			.map((line) => line.split('|')[1])
			// Filter out the IPC$ share that Samba always creates
			.filter((share) => share !== 'IPC$')

		return shares
	}

	// Checks if the given network address is an Livinity device
	async isServerAnLivinityDevice(address: string) {
		try {
			// LIVOS-051 (262-04): same host guard as addShare (the `ky(http://...)`
			// probe is an SSRF primitive). `address` may carry an optional :port —
			// validate the host part; anything else returns false (no probe).
			const addressMatch = address.match(/^([a-zA-Z0-9._-]+)(:\d{1,5})?$/)
			if (!addressMatch) return false
			assertValidSmbHost(addressMatch[1])

			const responseText = (await ky(`http://${address}/trpc/system.version`, {timeout: 1000}).text()) as any
			return responseText.toLowerCase().includes('livinity')
		} catch {
			return false
		}
	}
}
