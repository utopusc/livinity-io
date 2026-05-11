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
import {access, mkdir} from 'node:fs/promises'
import {constants as fsConstants} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {promisify} from 'node:util'

export const MASTER_PROFILE_DIR = '/opt/livos/data/chrome-master'
export const APP_PROFILE_PREFIX = '/tmp/livos-chrome-app-'

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
}

export interface ProfileSeederHandle {
	/** Seed-copy master → /tmp/livos-chrome-app-<uuid>. */
	seed(opts?: SeedOpts): Promise<{uuid: string; appDir: string}>
	/** Idempotent — mkdir -p masterDir when absent. Used at livinityd boot. */
	ensureMasterExists(): Promise<void>
	/** Remove /tmp/livos-chrome-app-<uuid>. Idempotent (swallows rm errors). */
	cleanup(uuid: string): Promise<void>
	/** Remove all /tmp/livos-chrome-app-* dirs (boot-time orphan sweep). */
	sweepOrphans(): Promise<number>
}

export function createProfileSeeder(opts: ProfileSeederOpts = {}): ProfileSeederHandle {
	const masterDir = opts.masterDir ?? MASTER_PROFILE_DIR
	const appPrefix = opts.appPrefix ?? APP_PROFILE_PREFIX
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

		async seed(seedOpts: SeedOpts = {}): Promise<{uuid: string; appDir: string}> {
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

			// Master must exist BEFORE we attempt cp. Without this guard, cp
			// would surface a less-actionable ENOENT.
			try {
				await accFn(masterDir, fsConstants.R_OK | fsConstants.X_OK)
			} catch {
				throw new MasterProfileMissingError(masterDir)
			}

			const appDir = `${appPrefix}${uuid}`
			const t0 = Date.now()

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

			log.info?.(`profile-seeder: seeded ${appDir} from ${masterDir} in ${Date.now() - t0}ms`)
			return {uuid, appDir}
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
