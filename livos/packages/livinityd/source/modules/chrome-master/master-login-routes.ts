/**
 * Phase 102-07 — Chrome Master Login tRPC routes (D-102-MASTER-LOGIN-UI).
 *
 * Admin-gated routes for managing the master Chrome profile that lives at
 * /opt/livos/data/chrome-master/ (also exported as `MASTER_PROFILE_DIR`).
 *
 *   chromeMaster.status        — privateProcedure query; reads
 *                                /opt/livos/data/chrome-master/Default/Cookies
 *                                presence (does NOT decrypt the contents) and
 *                                returns {hasCookies, dir, running, pid?,
 *                                startedAt?} so the Settings UI can render the
 *                                "Logged in" / "Not logged in" indicator
 *                                plus the running-master state.
 *
 *   chromeMaster.startLogin    — adminProcedure mutation (T-102-07); spawns
 *                                google-chrome under bruce on the physical
 *                                :0 display with
 *                                --user-data-dir=/opt/livos/data/chrome-master.
 *                                The user logs into Google then closes the
 *                                window; profile-seeder.seed() (102-03) copies
 *                                this dir into per-app /tmp/livos-chrome-app-*
 *                                profiles, so every subsequent WebApp inherits
 *                                the login state.
 *
 *   chromeMaster.reset         — adminProcedure mutation (T-102-07c); wipes
 *                                /opt/livos/data/chrome-master, optionally
 *                                renaming to .backup first (default
 *                                backup=true). Re-creates the master dir so
 *                                profile-seeder.ensureMasterExists short-
 *                                circuits cleanly on the next spawn.
 *
 *   chromeMaster.restoreBackup — adminProcedure mutation; renames
 *                                /opt/livos/data/chrome-master.backup back
 *                                over /opt/livos/data/chrome-master.
 *
 * Threat mitigations:
 *
 *   T-102-07  Elevation of Privilege — adminProcedure gate on the three
 *             mutations. The procedure middleware (requireRole('admin'))
 *             throws TRPCError({code:'FORBIDDEN'}) for non-admin sessions
 *             BEFORE the handler runs, so spawn()/rm()/rename() are never
 *             invoked by a non-admin caller. Test 1 + Test 8 exercise this.
 *
 *   T-102-07b Tampering (concurrent master spawns) — module-singleton
 *             `currentMaster` is checked at the top of startLogin; second
 *             concurrent call throws CONFLICT. The child exit watcher clears
 *             `currentMaster` so retry works after the user closes Chrome.
 *
 *   T-102-07c Data Loss (accidental reset) — default backup=true renames
 *             master → master.backup BEFORE delete. UI confirms via
 *             AlertDialog before invoking. restoreBackup is also
 *             adminProcedure-gated.
 *
 *   T-102-07d Information Disclosure (Cookies content) — accepted.
 *             status() checks file existence only, never reads bytes.
 *
 * Sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f (D-102-SACRED) —
 * never touched.
 */

import {z} from 'zod'
import {TRPCError} from '@trpc/server'
import {spawn as nodeSpawn, type ChildProcess} from 'node:child_process'
import {
	access as nodeAccess,
	rm as nodeRm,
	rename as nodeRename,
	mkdir as nodeMkdir,
} from 'node:fs/promises'
import {constants as fsConstants} from 'node:fs'

import {router, adminProcedure, privateProcedure} from '../server/trpc/trpc.js'

export const MASTER_PROFILE_DIR = '/opt/livos/data/chrome-master'
export const MASTER_BACKUP_DIR = '/opt/livos/data/chrome-master.backup'
const COOKIES_PATH = `${MASTER_PROFILE_DIR}/Default/Cookies`

/**
 * Injection bag for unit tests. Production callers use defaults (node:fs +
 * node:child_process). Tests pass mocks via createChromeMasterRouter({...})
 * — mirrors the apps/native-routes.ts factory-injection pattern.
 */
export interface MasterLoginInjectables {
	spawnFn?: typeof nodeSpawn
	accessFn?: typeof nodeAccess
	rmFn?: typeof nodeRm
	renameFn?: typeof nodeRename
	mkdirFn?: typeof nodeMkdir
}

interface CurrentMaster {
	pid: number
	child: ChildProcess
	startedAt: number
}

// Module-singleton state (per livinityd boot). T-102-07b: prevents concurrent
// master Chrome spawns from racing on the same --user-data-dir.
let currentMaster: CurrentMaster | null = null

/**
 * Test-only state reset. The router uses a module-scoped `currentMaster`
 * singleton (T-102-07b lock); test 3 then test 8 both call startLogin so
 * we need a way to clear the lock between tests. NOT exported from
 * index.ts barrel — internal-only.
 */
export function _resetMasterStateForTest(): void {
	currentMaster = null
}

/**
 * Factory: returns a tRPC router with injected fs+child_process primitives.
 *
 * The default export `chromeMasterRouter` calls this with empty injectables
 * (production code path); tests build their own caller with mocks. Mirrors
 * the apps/native-routes.ts `nativeAppsRouter` shape so the index.ts root
 * router composition (`router({chromeMaster: chromeMasterRouter})`) Just
 * Works.
 */
export function createChromeMasterRouter(injectables: MasterLoginInjectables = {}) {
	const spawnFn = injectables.spawnFn ?? nodeSpawn
	const accessFn = injectables.accessFn ?? nodeAccess
	const rmFn = injectables.rmFn ?? nodeRm
	const renameFn = injectables.renameFn ?? nodeRename
	const mkdirFn = injectables.mkdirFn ?? nodeMkdir

	return router({
		/**
		 * chromeMaster.status — privateProcedure (any authenticated user can
		 * read the status; the *mutations* are admin-only). Returns:
		 *
		 *   - hasCookies: Default/Cookies file exists (user has logged in at
		 *                 least once)
		 *   - dir:        canonical master path (for UI display)
		 *   - running:    a master Chrome was spawned by this livinityd and
		 *                 hasn't yet exited
		 *   - pid?:       running master Chrome PID (only when running)
		 *   - startedAt?: monotonic spawn timestamp (only when running)
		 */
		status: privateProcedure.query(async () => {
			let hasCookies = false
			try {
				await accessFn(COOKIES_PATH, fsConstants.R_OK)
				hasCookies = true
			} catch {
				/* file absent — user has not yet completed master login */
			}
			return {
				hasCookies,
				dir: MASTER_PROFILE_DIR,
				running: currentMaster !== null,
				pid: currentMaster?.pid,
				startedAt: currentMaster?.startedAt,
			}
		}),

		/**
		 * chromeMaster.startLogin — adminProcedure mutation (T-102-07).
		 *
		 * Spawns:
		 *   sudo -n -u bruce DISPLAY=:0 google-chrome \
		 *     --user-data-dir=/opt/livos/data/chrome-master \
		 *     --no-first-run --no-default-browser-check
		 *
		 * `sudo -n -u bruce` keeps the privilege model identical to every
		 * other LivOS app subprocess (Xvfb, x11vnc, native apps). DISPLAY=:0
		 * targets the physical screen so the user can interact with the
		 * Google sign-in flow directly. The Chrome window appears, the user
		 * logs in, the user closes Chrome — at which point the exit watcher
		 * clears `currentMaster` and the master profile dir contains a fresh
		 * Default/Cookies with Google OAuth tokens.
		 */
		startLogin: adminProcedure.mutation(async () => {
			if (currentMaster !== null) {
				throw new TRPCError({
					code: 'CONFLICT',
					message: 'master chrome already running; close the existing window before starting a new login',
				})
			}
			const args = [
				'-n',
				'-u',
				'bruce',
				'DISPLAY=:0',
				'google-chrome',
				`--user-data-dir=${MASTER_PROFILE_DIR}`,
				'--no-first-run',
				'--no-default-browser-check',
			]
			const child = spawnFn('sudo', args, {
				detached: false,
				stdio: ['ignore', 'ignore', 'pipe'],
			})
			if (!child.pid) {
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'chrome failed to spawn (no pid)',
				})
			}
			const startedAt = Date.now()
			currentMaster = {pid: child.pid, child, startedAt}
			// Clear singleton on Chrome exit (user closes window). T-102-07b
			// retry-after-close path.
			child.on('exit', () => {
				currentMaster = null
			})
			return {pid: child.pid, startedAt}
		}),

		/**
		 * chromeMaster.reset — adminProcedure mutation (T-102-07c).
		 *
		 * Two paths:
		 *   - backup=true (default): rename master → master.backup, then
		 *     mkdir master. Existing master.backup is rm -rf'd first so the
		 *     rename can't ENOTEMPTY. If the master dir does not exist this
		 *     becomes a no-op for the rename path (mkdir still runs).
		 *   - backup=false: rm -rf master directly, no rename.
		 *
		 * Refuses to run while master Chrome is up; user must close it.
		 */
		reset: adminProcedure
			.input(z.object({backup: z.boolean().default(true)}))
			.mutation(async ({input}) => {
				if (currentMaster !== null) {
					throw new TRPCError({
						code: 'CONFLICT',
						message: 'master chrome is still running; close it before resetting the profile',
					})
				}
				if (input.backup) {
					// Try to back up; if master doesn't exist this branch is a no-op
					// for the rename, but mkdir still runs below so the directory
					// always exists at end-of-reset (profile-seeder.ensureMasterExists
					// will then be a no-op rather than re-creating it).
					let masterPresent = true
					try {
						await accessFn(MASTER_PROFILE_DIR, fsConstants.F_OK)
					} catch {
						masterPresent = false
					}
					if (masterPresent) {
						// Clear stale backup first so rename can succeed.
						try {
							await rmFn(MASTER_BACKUP_DIR, {recursive: true, force: true})
						} catch {
							/* nothing to clear */
						}
						await renameFn(MASTER_PROFILE_DIR, MASTER_BACKUP_DIR)
					}
				} else {
					await rmFn(MASTER_PROFILE_DIR, {recursive: true, force: true})
				}
				await mkdirFn(MASTER_PROFILE_DIR, {recursive: true})
				return {ok: true}
			}),

		/**
		 * chromeMaster.restoreBackup — adminProcedure mutation. Renames
		 * master.backup back over master, restoring the pre-reset profile.
		 * Throws NOT_FOUND if no backup exists.
		 */
		restoreBackup: adminProcedure.mutation(async () => {
			if (currentMaster !== null) {
				throw new TRPCError({
					code: 'CONFLICT',
					message: 'master chrome is still running; close it before restoring the backup',
				})
			}
			try {
				await accessFn(MASTER_BACKUP_DIR, fsConstants.F_OK)
			} catch {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'no master profile backup available',
				})
			}
			try {
				await rmFn(MASTER_PROFILE_DIR, {recursive: true, force: true})
			} catch {
				/* master may already be absent — fine */
			}
			await renameFn(MASTER_BACKUP_DIR, MASTER_PROFILE_DIR)
			return {ok: true}
		}),
	})
}

/**
 * Default export used by the root tRPC composition site
 * (server/trpc/index.ts) — production code path with real fs +
 * child_process primitives. Tests build their own caller via
 * createChromeMasterRouter({...mocks}).
 */
export const chromeMasterRouter = createChromeMasterRouter()

export type ChromeMasterRouter = typeof chromeMasterRouter
