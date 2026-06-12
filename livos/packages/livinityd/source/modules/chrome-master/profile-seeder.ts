/**
 * Phase 102-03 — MasterProfileSeeder (D-102-MASTER-PROFILE-SEED).
 *
 * Master profile lives at `/opt/livos/data/chrome-master/` (livos data
 * volume, persistent). User logs in once via the Master Login flow (Wave 3
 * plan 102-07 ships the Settings UI). On every WebApp spawn the per-app
 * Chrome process is given an isolated copy at `/tmp/livos-chrome-app-<uuid>/`
 * so Google login state is inherited from master WITHOUT sharing
 * `--user-data-dir` (sharing forces Chrome's singleton-lock IPC merge, the
 * bug that motivated this whole Phase 102 pivot).
 *
 * Empirical risk mitigations:
 *
 *   A1 (reflink): `cp -r --reflink=auto` requires a CoW filesystem
 *   (btrfs/xfs). On ext4 it either silently falls back to plain copy on
 *   newer coreutils builds OR errors with "cp: failed to clone … reflink
 *   not supported". We TRY the reflink form first and FALL BACK to plain
 *   `cp -r` when it rejects. Test 2 in profile-seeder.test.ts exercises
 *   this fall-through.
 *
 *   A7 (SingletonLock): the master profile dir contains
 *   `SingletonLock`/`SingletonCookie`/`SingletonSocket` symlinks pointing
 *   at the master Chrome's PID. After `cp -r`, these point at a process
 *   that may not exist (or worse, a different process that happens to
 *   share the PID). A fresh per-app Chrome that sees these refuses to
 *   start, citing "Chrome is already running". We explicitly `rm -f` the
 *   three Singleton* entries after every seed. Test 3 verifies the rm
 *   argv.
 *
 * Threat mitigation:
 *
 *   T-102-03 (path traversal): caller-supplied `uuid` opt is validated
 *   against an RFC 4122 v4 regex BEFORE filesystem interpolation. Default
 *   uuid generation uses Node's `randomUUID()` (CSPRNG-backed,
 *   guaranteed-conforming). `masterDir` is a constant — no caller input.
 *   Reject non-UUID with `ProfileSeederInputError` so the threat surface
 *   never reaches `execFile`. Tests 5+6 exercise the two reject branches.
 *
 * Sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f — never touched.
 */

import {execFile} from 'node:child_process'
import {access, mkdir, writeFile} from 'node:fs/promises'
import {constants as fsConstants} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {promisify} from 'node:util'
import {getDesktopUser} from '../system/desktop-user.js'

// Phase 102 r13 — minimal `Default/Preferences` JSON that primes a fresh
// per-app user-data-dir so Chrome's profile-setup ("Welcome! Add a name or
// label…") modal does not appear at first launch. The modal blocks the
// rendered web page below it and swallows synthetic keyboard events sent
// via xdotool — even after the user clicks past it, internal Chrome focus
// remains in an inconsistent state. By materialising a `name`/`avatar`
// pair in Preferences before Chrome boots we satisfy the profile-naming
// guard in chrome/browser/profiles/profile_attributes_entry.cc and the
// modal is suppressed for the entire session.
//
// Only invoked when the cp -r from chrome-master leaves the per-app dir
// without a Default/Preferences (i.e. the master was never populated by
// the user via Settings → Chrome Master Login).
const DEFAULT_PREFERENCES_JSON = JSON.stringify({
	profile: {
		name: 'LivOS WebApp',
		using_default_name: false,
		avatar_index: 0,
		avatar_is_default: true,
		exit_type: 'Normal',
		exited_cleanly: true,
	},
})

export const MASTER_PROFILE_DIR = '/opt/livos/data/chrome-master'
export const APP_PROFILE_PREFIX = '/tmp/livos-chrome-app-'
// Phase 259 (WebApp persistent profiles) — persistent per-WebApp profile root on
// the livos data volume (survives close AND reboot). Keyed by webappId (already a
// UUID), NOT by domain, so two concurrent opens never collide on one
// --user-data-dir (Chrome's process-singleton would otherwise merge them) and the
// window-manager's webappId idempotency already prevents a double-open of the same
// WebApp. The throwaway /tmp/livos-chrome-app-<uuid> path stays for any caller that
// does NOT pass persistent (back-compat).
export const WEBAPP_PROFILE_DIR = '/opt/livos/data/chrome-webapps'

// RFC 4122 v4 UUID. Used to validate caller-supplied uuid opts before they
// are interpolated into a filesystem path. Default-generation via
// randomUUID() always conforms — this regex only fires on the seed({uuid})
// branch.
const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/

export class MasterProfileMissingError extends Error {
	code = 'MASTER_PROFILE_MISSING' as const
	constructor(public masterDir: string) {
		super(
			`master profile directory does not exist: ${masterDir} — open LivOS Settings → Chrome Master Login to log into Google once and populate it`,
		)
		this.name = 'MasterProfileMissingError'
	}
}

export class ProfileSeederInputError extends Error {
	constructor(
		public code: 'PROFILE_INVALID_UUID',
		msg: string,
	) {
		super(msg)
		this.name = 'ProfileSeederInputError'
	}
}

export type ExecFileFn = typeof execFile
export type AccessFn = typeof access
export type MkdirFn = typeof mkdir

export interface ProfileSeederLogger {
	info?(msg: string): void
	warn?(msg: string, err?: unknown): void
	error?(msg: string, err?: unknown): void
	verbose?(msg: string): void
}

export interface ProfileSeederOpts {
	/** Override master dir (tests). Defaults to /opt/livos/data/chrome-master. */
	masterDir?: string
	/** Override app prefix (tests). Defaults to /tmp/livos-chrome-app-. */
	appPrefix?: string
	/** Override the persistent WebApp profile root (tests). Defaults to /opt/livos/data/chrome-webapps. */
	webappProfileDir?: string
	/** Override execFile (tests). Promisified internally. */
	execFileFn?: ExecFileFn
	/** Override fs.access (tests). */
	accessFn?: AccessFn
	/** Override fs.mkdir (tests). */
	mkdirFn?: MkdirFn
	/** Override uuid factory (tests). Defaults to crypto.randomUUID. */
	uuidFn?: () => string
	/** Adapter-shape logger (matches the livinityd in-process pattern). */
	logger?: ProfileSeederLogger
}

export interface SeedOpts {
	/** When supplied, MUST match RFC 4122 v4. Default: randomUUID(). */
	uuid?: string
	/**
	 * Phase 259 — when true the profile is PERSISTENT at
	 * /opt/livos/data/chrome-webapps/<uuid> (survives close + reboot) and is
	 * REUSED on the next open for the same uuid (no re-clone → the WebApp's login
	 * + state carry over, the operator's "kapanınca veri gitmesin" requirement).
	 * When false/absent → the legacy throwaway /tmp/livos-chrome-app-<uuid>.
	 */
	persistent?: boolean
}

export interface ProfileSeederHandle {
	/**
	 * Seed-copy master → the per-app profile dir. Default: throwaway
	 * /tmp/livos-chrome-app-<uuid>. With `persistent:true`: persistent
	 * /opt/livos/data/chrome-webapps/<uuid>, REUSED (not re-cloned) when it
	 * already exists. Returns `persistent` so the caller knows whether to clean up.
	 */
	seed(opts?: SeedOpts): Promise<{uuid: string; appDir: string; persistent: boolean}>
	/** Idempotent — mkdir -p masterDir when absent. Used at livinityd boot. */
	ensureMasterExists(): Promise<void>
	/** Remove /tmp/livos-chrome-app-<uuid>. Idempotent (swallows rm errors). NEVER touches persistent dirs. */
	cleanup(uuid: string): Promise<void>
	/** Remove all /tmp/livos-chrome-app-* dirs (boot-time orphan sweep). Persistent dirs are NOT swept. */
	sweepOrphans(): Promise<number>
}

export function createProfileSeeder(opts: ProfileSeederOpts = {}): ProfileSeederHandle {
	const masterDir = opts.masterDir ?? MASTER_PROFILE_DIR
	const appPrefix = opts.appPrefix ?? APP_PROFILE_PREFIX
	const webappDir = opts.webappProfileDir ?? WEBAPP_PROFILE_DIR
	const execFn = opts.execFileFn ?? execFile
	const accFn = opts.accessFn ?? access
	const mkFn = opts.mkdirFn ?? mkdir
	const uuidGen = opts.uuidFn ?? randomUUID
	// promisify so each execFile call returns a Promise<{stdout, stderr}>.
	// We cast loosely to keep the public ExecFileFn type a vanilla
	// typeof execFile — caller-supplied mocks only need to honor the
	// (cmd, args, cb) callback contract.
	const execP = promisify(execFn) as (cmd: string, args: string[]) => Promise<{stdout: string; stderr: string}>
	const log = opts.logger ?? {}

	return {
		async ensureMasterExists(): Promise<void> {
			try {
				await accFn(masterDir, fsConstants.R_OK | fsConstants.X_OK)
				// already present — no-op
				return
			} catch {
				try {
					await mkFn(masterDir, {recursive: true})
					log.info?.(
						`profile-seeder: created empty master at ${masterDir} (user must run Settings → Chrome Master Login to populate)`,
					)
				} catch (err) {
					// non-fatal; boot continues. Per-app seeds will throw
					// MasterProfileMissingError when invoked.
					log.warn?.(`profile-seeder: mkdir ${masterDir} failed (non-fatal)`, err)
				}
			}
		},

		async seed(seedOpts: SeedOpts = {}): Promise<{uuid: string; appDir: string; persistent: boolean}> {
			// T-102-03 — validate caller-supplied uuid BEFORE any side effect.
			// Default-generation via randomUUID() always conforms; this only
			// fires when a caller passes their own uuid (rare, primarily tests).
			const uuid = seedOpts.uuid ?? uuidGen()
			if (!UUID_RE.test(uuid)) {
				throw new ProfileSeederInputError(
					'PROFILE_INVALID_UUID',
					`uuid must match RFC 4122 v4 (got: ${JSON.stringify(uuid)})`,
				)
			}

			// Phase 259 — persistent vs throwaway target. Persistent dirs live on the
			// livos data volume keyed by uuid and are REUSED across opens (the login +
			// state carry over); throwaway dirs are the legacy /tmp/<uuid> clone.
			const persistent = seedOpts.persistent === true
			const appDir = persistent ? `${webappDir}/${uuid}` : `${appPrefix}${uuid}`
			const t0 = Date.now()

			// Persistent: if the dir already exists, REUSE it (no cp → preserve the
			// WebApp's accumulated state). Only seed-from-master on the FIRST open.
			let reused = false
			if (persistent) {
				try {
					await mkFn(webappDir, {recursive: true})
				} catch (err) {
					log.warn?.(`profile-seeder: mkdir ${webappDir} failed (non-fatal)`, err)
				}
				try {
					await accFn(appDir, fsConstants.R_OK | fsConstants.X_OK)
					reused = true
				} catch {
					reused = false
				}
			}

			if (!reused) {
				// Master must exist BEFORE we attempt cp. Without this guard, cp
				// would surface a less-actionable ENOENT.
				try {
					await accFn(masterDir, fsConstants.R_OK | fsConstants.X_OK)
				} catch {
					throw new MasterProfileMissingError(masterDir)
				}

				// A1 — CoW reflink first; fall back to plain cp -r on rejection.
				try {
					await execP('cp', ['-r', '--reflink=auto', masterDir, appDir])
				} catch (err) {
					log.warn?.(
						`profile-seeder: cp --reflink=auto failed (likely non-CoW fs) — retrying plain cp -r`,
						err,
					)
					await execP('cp', ['-r', masterDir, appDir])
				}
			}

			// A7 — strip the master's Singleton{Lock,Cookie,Socket} so the
			// per-app Chrome doesn't refuse to start citing the master's PID.
			// Non-fatal if rm rejects (e.g., the files weren't there to begin
			// with, which is fine).
			try {
				await execP('rm', [
					'-f',
					`${appDir}/SingletonLock`,
					`${appDir}/SingletonCookie`,
					`${appDir}/SingletonSocket`,
				])
			} catch (err) {
				log.warn?.(`profile-seeder: Singleton{Lock,Cookie,Socket} cleanup failed (non-fatal)`, err)
			}

			// Phase 102 deploy fix — livinityd runs as root via systemd, but
			// Chrome is spawned with `sudo -n -u bruce …` (see
			// chrome-process-spawner.ts). The `cp -r` above creates appDir
			// owned by root, which prevents Chrome (running as bruce) from
			// writing the SingletonLock + Cookies + state DBs:
			//
			//   ERROR:chrome/browser/process_singleton_posix.cc:345]
			//     Failed to create .../SingletonLock: Permission denied (13)
			//   Failed to create a ProcessSingleton for your profile directory.
			//   Aborting now to avoid profile corruption.
			//
			// Chown the per-app profile to bruce so the spawned Chrome can
			// own its own profile state. Non-fatal — if chown rejects (e.g.,
			// dev box where livinityd runs as non-root), Chrome would have
			// the right perms already.
			try {
				const _du = getDesktopUser()
				await execP('chown', ['-R', `${_du}:${_du}`, appDir])
			} catch (err) {
				log.warn?.(`profile-seeder: chown ${appDir} → ${getDesktopUser()} failed (non-fatal — only required when livinityd is root)`, err)
			}

			// Phase 102 r13 — suppress Chrome's first-launch profile-setup
			// modal by ensuring `<appDir>/Default/Preferences` exists. When
			// the master at `/opt/livos/data/chrome-master/` is empty (the
			// user has not yet run Settings → Chrome Master Login), the
			// cp -r above leaves the per-app dir without Preferences and
			// Chrome shows a "Welcome! Add a name or label" modal that
			// blocks the rendered page AND breaks xdotool key/type dispatch.
			// Write a minimal Preferences only if one doesn't already exist
			// (master-populated dirs keep their richer state). chown to
			// bruce so Chrome — running as bruce — can read/write it.
			try {
				const defaultDir = `${appDir}/Default`
				const prefsPath = `${defaultDir}/Preferences`
				try {
					await accFn(prefsPath, fsConstants.R_OK)
					// Already present from master — no-op.
				} catch {
					await mkFn(defaultDir, {recursive: true})
					await writeFile(prefsPath, DEFAULT_PREFERENCES_JSON, {encoding: 'utf8'})
					try {
						const _du = getDesktopUser()
						await execP('chown', [`${_du}:${_du}`, defaultDir, prefsPath])
					} catch (err) {
						log.warn?.(`profile-seeder: chown Default/Preferences failed (non-fatal)`, err)
					}
					log.verbose?.(`profile-seeder: primed minimal Preferences at ${prefsPath}`)
				}
			} catch (err) {
				log.warn?.(`profile-seeder: failed to prime Default/Preferences at ${appDir} (non-fatal — Chrome may show first-launch modal)`, err)
			}

			log.info?.(
				reused
					? `profile-seeder: reused persistent ${appDir} in ${Date.now() - t0}ms`
					: `profile-seeder: seeded ${appDir} from ${masterDir} in ${Date.now() - t0}ms`,
			)
			return {uuid, appDir, persistent}
		},

		async cleanup(uuid: string): Promise<void> {
			if (!UUID_RE.test(uuid)) {
				// Defensive — caller passed something other than what seed()
				// returned. Don't risk path traversal via rm -rf.
				log.warn?.(`profile-seeder: cleanup got invalid uuid ${JSON.stringify(uuid)} — no-op`)
				return
			}
			const appDir = `${appPrefix}${uuid}`
			try {
				await execP('rm', ['-rf', appDir])
				log.info?.(`profile-seeder: cleaned ${appDir}`)
			} catch (err) {
				// Idempotency — second cleanup of the same uuid (or rm of an
				// already-gone dir) must NOT throw.
				log.warn?.(`profile-seeder: cleanup ${appDir} failed (non-fatal)`, err)
			}
		},

		async sweepOrphans(): Promise<number> {
			try {
				await execP('sh', ['-c', `rm -rf ${appPrefix}*`])
				log.info?.(`profile-seeder: swept orphan profiles matching ${appPrefix}*`)
				return 1
			} catch (err) {
				log.warn?.(`profile-seeder: sweep failed`, err)
				return 0
			}
		},
	}
}
