import {createHash} from 'node:crypto'
import nodePath from 'node:path'
import {setTimeout} from 'node:timers/promises'

import {execa, ExecaError, ExecaChildProcess} from 'execa'
import fse from 'fs-extra'
import pQueue from 'p-queue'
import prettyBytes from 'pretty-bytes'

import randomToken from '../../modules/utilities/random-token.js'
import {captureSystemState, DEFAULT_BACKUP_SCOPE, scopeExclusionPatterns, type BackupScope} from './system-state.js'
import {detectEngine, installEngine, kopiaSpawnEnv, KOPIA_MINIMUM_VERSION, type EngineStatus} from './engine.js'
import {writeTerminalRunStatus, type LastRunStatus} from './backup-preflight.js'
import {
	SAFETY_REPO_ID,
	SAFETY_REPO_PATH,
	SAFETY_PASSWORD_FILENAME,
	retentionFlagsFor,
	ensureSafetyRepository,
	evaluateDiskPressure,
	shouldAbortForDiskPressure,
	freePercentOf,
	DISK_ABORT_FREE_PERCENT,
} from './safety-snapshots.js'
import {
	classifyDestination,
	probeDestination,
	repositoryIgnorePatterns,
	resolveOffSystemDisk,
	isRealDestination,
	INTERNAL_BACKUP_ROOT,
	INTERNAL_VIRTUAL_ROOT,
	MIN_FREE_PERCENT,
	type DestinationKind,
	type DestinationProbeDeps,
	type OffSystemDiskDeps,
} from './destination-policy.js'
import {copyWithProgress} from '../utilities/copy-with-progress.js'
import {diskForPath, resolveOsDisks} from '../storage-pool/root-disk.js'

// TODO: These should be refactored into proper livinityd modules
import {getSystemDiskUsage, getDiskUsageByPath} from '../system/system.js'
import {setSystemStatus} from '../system/routes.js'
import {reboot} from '../system/system.js'
import {BACKUP_RESTORE_FIRST_START_FLAG, POOL_MOUNTPOINT} from '../../constants.js'
import type Livinityd from '../../index.js'
import type {ProgressStatus} from '../apps/schema.js'

type Backup = {
	// Our internal id in the format: <repositoryId>:<snapshotId>
	id: string
	time: number
	size: number
}

type BackupProgress = {
	repositoryId: string
	percent: number
}

// RestoreStatus extends ProgressStatus with optional restore-specific fields
// ProgressStatus includes: running: boolean, progress: number (0-100), description: string, error: boolean | string
export type RestoreStatus = ProgressStatus & {
	backupId?: string
	bytesPerSecond?: number
	secondsRemaining?: number
}

export type BackupsInProgress = BackupProgress[]

// P0 backups-v2: how often we re-nag about a box with zero backup destinations.
const NO_DESTINATION_NAG_INTERVAL = 1000 * 60 * 60 * 24 * 7 // 7 days

export default class Backups {
	#livinityd: Livinityd
	logger: Livinityd['logger']
	internalMountPath: string
	backupRoot: string
	backupsInProgress: BackupsInProgress = []
	restoreStatus: RestoreStatus = {
		running: false,
		progress: 0,
		description: '',
		error: false,
		// backupId, bytesPerSecond, and secondsRemaining are undefined by default
	}
	running = false
	startedAt?: number
	backupInterval = 1000 * 60 * 60 // 1 hour
	backupJobPromise?: Promise<void>
	kopiaQueue = new pQueue({concurrency: 1})
	backupDirectoryName = 'Livinity Backup.backup'
	runningKopiaProcesses: ExecaChildProcess[] = []
	// P0 backups-v2: kopia engine preflight state. Starts pessimistic; start()
	// and every interval / engineStatus query re-detect, so it self-heals the
	// moment an update (or the self-installer) puts kopia in place.
	engineStatus: EngineStatus = {available: false, reason: 'unknown', minimumVersion: KOPIA_MINIMUM_VERSION}
	#engineInstallInFlight = false

	constructor(livinityd: Livinityd) {
		this.#livinityd = livinityd
		const {name} = this.constructor
		this.logger = livinityd.logger.createChildLogger(name.toLocaleLowerCase())
		this.internalMountPath = nodePath.join(livinityd.dataDirectory, 'backup-mounts')
		this.backupRoot = livinityd.files.getBaseDirectory('/Backups')
	}

	async start() {
		this.logger.log('Starting backups')
		this.running = true
		this.startedAt = Date.now()

		// Cleanup any left over backup mounts
		await this.unmountAll().catch((error) => this.logger.error('Error unmounting backups', error))

		// P0 backups-v2: engine preflight. If kopia is missing/outdated, kick a
		// background self-install (deploy covers fresh installs; update.sh never
		// runs the deploy script, so existing boxes get the engine HERE). Both
		// are non-blocking — boot must never wait on a GitHub download. The
		// hourly interval below re-detects AND re-attempts the install, so a
		// boot while offline is retried, not lost.
		await this.checkEngine().catch((error) => this.logger.error('Engine preflight failed', error))
		await this.syncEngineNotification().catch(() => {})
		if (!this.engineStatus.available) {
			void (async () => {
				await this.retryEngineInstall()
				await this.syncEngineNotification()
			})().catch((error) => this.logger.error('Engine self-install failed', error))
		}

		// Phase 368.8 (Route C): the internal backup root is a plain directory with no
		// dependency on the backup engine, so it is created UNCONDITIONALLY — outside
		// and before the engineStatus guard below. On a box whose kopia self-install is
		// still pending, putting it inside that guard would mean the root is never
		// created at boot and healing would silently depend on the operator opening the
		// wizard, turning Route C's "heals on the first update" into a conditional.
		await this.ensureInternalBackupRoot().catch(() => false)

		// Phase 368.5 BKP-16: default-ON local safety snapshots. Non-fatal; if the
		// engine isn't up yet the hourly interval retries once self-install lands.
		if (this.engineStatus.available) {
			await this.ensureSafetySnapshots().catch((error) => this.logger.error('Safety snapshots ensure failed', error))
		}

		// Fire off background backup process
		this.backupJobPromise = this.backupOnInterval().catch((error) =>
			this.logger.error('Error running backups on interval', error),
		)
	}

	async stop() {
		this.logger.log('Stopping backups')
		this.running = false

		const ONE_SECOND = 1000

		// Cleanup any currently mounted backups (up to 5s)
		await Promise.race([
			setTimeout(ONE_SECOND * 5),
			(async () => {
				this.logger.log('Cleaning up mounts')
				await this.unmountAll().catch((error) => this.logger.error('Error unmounting backups', error))
			})(),
		])

		// Kill any running kopia processes
		for (const process of this.runningKopiaProcesses) process.kill('SIGTERM', {forceKillAfterTimeout: ONE_SECOND * 3})

		// Wait for any backup jobs (up to 5s)
		await Promise.race([
			setTimeout(ONE_SECOND * 5),
			(async () => {
				this.logger.log('Waiting for any backup job to finish')
				if (this.backupJobPromise) await this.backupJobPromise.catch(() => {})
				await Promise.allSettled(this.runningKopiaProcesses)
			})(),
		])
	}

	// Run backups in background
	async backupOnInterval() {
		this.logger.log('Scheduling backups interval')
		let lastRun = Date.now()
		while (this.running) {
			await setTimeout(100)
			const userExists = await this.#livinityd.user.exists()
			const shouldRun = userExists && Date.now() - lastRun >= this.backupInterval
			if (!shouldRun) continue
			lastRun = Date.now()

			this.logger.log('Running backups interval')
			const repositories = await this.getRepositories().catch((error) => {
				this.logger.error('Error getting repositories', error)
				return []
			})
			// P0 backups-v2: say how much this interval actually protects — the
			// original line-pair ("Running…"/"…complete") looked identical whether
			// it backed up everything or nothing, which hid a fully dead feature.
			// Phase 368.5 BKP-16: the safety repo is not a real DESTINATION — count
			// user destinations separately (prefix stays intact — 368 UAT greps it).
			// Phase 368.6 (D5): nor is a folder on the system disk. It is a genuine
			// backup and it protects against every mistake, but it dies with the disk
			// it sits on, so it must not be counted as the protection that lets the
			// "add a drive or a NAS" reminder go quiet.
			const userDestinations = repositories.filter((repository) => isRealDestination(repository))
			this.logger.log(
				`Backups interval: ${repositories.length} repositories configured (${userDestinations.length} user destinations)`,
			)

			// P0 backups-v2: re-detect the engine each interval and, if it's
			// still missing, RETRY the self-install (a box that booted offline
			// must heal once connectivity returns, not wait for a restart).
			// The notification is re-asserted every interval while unavailable —
			// same idiom as the hourly backups-failing re-add — so one dismissal
			// never silences a dead engine for good.
			const engine = await this.checkEngine().catch(() => this.engineStatus)
			if (!engine.available) {
				this.logger.error(`Backup engine unavailable (${engine.reason ?? 'unknown'}) — retrying self-install`)
				await this.retryEngineInstall()
			}
			await this.syncEngineNotification().catch(() => {})

			// Phase 368.5 BKP-16: default-ON safety repo — (re)create once the engine is up.
			// Idempotent ('exists' fast-path is one store read); also heals a boot that
			// started engine-less and self-installed later.
			if (engine.available) {
				await this.ensureSafetySnapshots().catch((error) => this.logger.error('Safety snapshots ensure failed', error))
			}
			const safetyDisabled =
				(await this.#livinityd.store.get('backups.safetySnapshotsDisabled').catch(() => undefined)) === true

			// P0 backups-v2 + Phase 368.5 + 368.6: zero REAL destinations = nag weekly.
			// The safety repo and any same-disk destination are EXCLUDED from this
			// count by design — they protect against mistakes, not hardware death, and
			// must never silence the nag. Note this gates only the NAG: the backup loop
			// below still runs every repository, so an internal-only box is backed up.
			if (userDestinations.length === 0) {
				await this.maybeNagNoDestination().catch((error) => this.logger.error('No-destination nag failed', error))
			}
			if (repositories.length === 0) {
				this.logger.log('Backups interval complete')
				continue
			}

			// NOTE: when the engine is unavailable we still fall through to the
			// repo loop — backup() throws [engine-unavailable] immediately per
			// repository, which keeps the pre-existing >24h 'backups-failing'
			// alerts firing (an engine outage must never mute them).

			// Run each backup
			for (const repository of repositories) {
				// Skip if we're shutting down
				if (!this.running) break

				// Phase 368.5 BKP-16: opt-out stops safety runs (repo left on disk; reclaim is Phase 370).
				// `continue` also skips the 24h backups-failing alert for the disabled repo.
				// When ENABLED, the 24h alert intentionally stays active for the safety repo —
				// sustained disk-pressure skips >24h mean the box genuinely is not protected;
				// never-silent wins.
				if (repository.isSafety && safetyDisabled) {
					this.logger.log('Safety snapshots disabled — skipping safety repo backup')
					continue
				}

				// Skip if we already have a backup in progress
				const isAlreadyBackingUp = this.backupsInProgress.some((progress) => progress.repositoryId === repository.id)
				if (isAlreadyBackingUp) {
					this.logger.log(`Backup already in progress for ${repository.path}`)
				} else {
					await this.backup(repository.id).catch((error) =>
						this.logger.error(`Error backing up ${repository.id}`, error),
					)
				}

				// Alert the user if backups have failed for over 24 hours
				const {lastBackup} = await this.getRepository(repository.id)
				const hoursSinceLastBackup = (Date.now() - (lastBackup || this.startedAt!)) / (1000 * 60 * 60)
				if (hoursSinceLastBackup > 24) {
					this.logger.error(`Backup for ${repository.path} has not run in over 24 hours`)
					await this.#livinityd.notifications
						.add(`backups-failing:${repository.id}`, {severity: 'warning', external: true})
						.catch(() => {})
				}
			}

			this.logger.log('Backups interval complete')
		}
	}

	// ── Engine preflight (P0 backups-v2) ────────────────────────────────
	// Pure detection: probe the binary + update cached state. NO notification
	// writes here — this runs from the tRPC engineStatus query (every Settings
	// load) and from guards; notification maintenance lives in
	// syncEngineNotification(), called only from start() + the hourly interval.
	async checkEngine(): Promise<EngineStatus> {
		const wasAvailable = this.engineStatus.available
		this.engineStatus = await detectEngine()
		if (this.engineStatus.available && !wasAvailable) {
			this.logger.log(`Backup engine available: kopia ${this.engineStatus.version}`)
		} else if (!this.engineStatus.available && wasAvailable) {
			this.logger.error(`Backup engine LOST: kopia ${this.engineStatus.reason ?? 'unknown'}`)
		}
		return this.engineStatus
	}

	// Keep the persistent 'backups-engine-unavailable' notification honest.
	// While unavailable it is re-added EVERY interval (hourly re-nag, matching
	// the backups-failing idiom — one dismissal must never silence a dead
	// engine); once available it is cleared even across daemon restarts (the
	// presence check makes clears state-based, not transition-based).
	private async syncEngineNotification() {
		if (!this.engineStatus.available) {
			await this.#livinityd.notifications
				.add('backups-engine-unavailable', {severity: 'warning', external: true})
				.catch(() => {})
			return
		}
		const notifications = await this.#livinityd.notifications.get().catch(() => [] as string[])
		if (notifications.includes('backups-engine-unavailable')) {
			await this.#livinityd.notifications.clear('backups-engine-unavailable').catch(() => {})
		}
	}

	// Attempt the pinned-version self-install (at most one attempt in flight).
	// Called at boot and re-tried every interval while the engine is missing.
	private async retryEngineInstall() {
		if (this.#engineInstallInFlight || this.engineStatus.available) return
		this.#engineInstallInFlight = true
		try {
			const installed = await installEngine({
				log: (m) => this.logger.log(m),
				error: (m, e) => this.logger.error(m, e as Error),
			})
			if (installed) await this.checkEngine()
		} catch (error) {
			this.logger.error('Engine self-install attempt failed', error)
		} finally {
			this.#engineInstallInFlight = false
		}
	}

	// Throw a typed error instead of letting kopia calls die with a raw ENOENT.
	private assertEngineAvailable() {
		if (!this.engineStatus.available) {
			throw new Error('[engine-unavailable] Backup engine (kopia) is missing or outdated — update LivOS and try again')
		}
	}

	// Refresh a stale-unavailable status, then assert. Used by every kopia
	// entry point so a binary installed mid-run (manual install, deploy without
	// restart) is picked up immediately instead of after the next hourly tick.
	private async ensureEngine() {
		if (!this.engineStatus.available) await this.checkEngine()
		this.assertEngineAvailable()
	}

	// P0 backups-v2: weekly reminder that the box has no backup destination.
	// Dismissing the notification snoozes it for NO_DESTINATION_NAG_INTERVAL.
	private async maybeNagNoDestination() {
		const userExists = await this.#livinityd.user.exists()
		if (!userExists) return
		const lastNag = await this.#livinityd.store.get('backups.noDestinationNagTime').catch(() => undefined)
		if (lastNag && Date.now() - lastNag < NO_DESTINATION_NAG_INTERVAL) return
		await this.#livinityd.notifications
			.add('backups-not-configured', {severity: 'info', external: true})
			.catch(() => {})
		await this.#livinityd.store.getWriteLock(async ({set}) => {
			await set('backups.noDestinationNagTime', Date.now())
		})
	}

	// ── Safety snapshots (Phase 368.5 BKP-16) ───────────────────────────
	// Sanctioned INTERNAL create path — deliberately bypasses addRepository's
	// /External-/Network validation, which remains the security boundary for
	// user-chosen destinations (D10 context). Path + id are fixed constants,
	// never user input.
	async getSafetySnapshotsEnabled(): Promise<boolean> {
		return (await this.#livinityd.store.get('backups.safetySnapshotsDisabled').catch(() => undefined)) !== true
	}

	async setSafetySnapshotsEnabled(enabled: boolean): Promise<boolean> {
		await this.#livinityd.store.getWriteLock(async ({set}) => {
			await set('backups.safetySnapshotsDisabled', !enabled)
		})
		this.logger.log(`Safety snapshots ${enabled ? 'enabled' : 'disabled'} by admin`)
		if (enabled) await this.ensureSafetySnapshots().catch((error) => this.logger.error('Safety snapshots ensure failed', error))
		return enabled
	}

	// IN-01: tRPC setSafetySnapshotsEnabled(true) and the interval tick can enter
	// ensure concurrently — both could pass the repo checks, generate DIFFERENT
	// passwords, and interleave password-file write vs `repository create`,
	// leaving the file mismatched with the repo. One ensure in flight at a time
	// (same idiom as #engineInstallInFlight); losers return — the next tick
	// re-runs ensure anyway.
	#safetyEnsureInFlight = false

	private async ensureSafetySnapshots() {
		if (this.#safetyEnsureInFlight) return
		this.#safetyEnsureInFlight = true
		try {
			await this.#ensureSafetySnapshotsInner()
		} finally {
			this.#safetyEnsureInFlight = false
		}
	}

	async #ensureSafetySnapshotsInner() {
		if (!this.engineStatus.available) return
		const secretsPath = nodePath.join(this.#livinityd.dataDirectory, 'secrets', SAFETY_PASSWORD_FILENAME)
		const result = await ensureSafetyRepository({
			isDisabled: async () =>
				(await this.#livinityd.store.get('backups.safetySnapshotsDisabled').catch(() => undefined)) === true,
			getRepositories: () => this.getRepositories(),
			registerRepository: async (row) => {
				await this.#livinityd.store.getWriteLock(async ({set}) => {
					const repositories = await this.getRepositories()
					if (!repositories.some((repository) => repository.id === row.id)) repositories.push(row)
					await set('backups.repositories', repositories)
				})
			},
			readPassword: async () => {
				try {
					return (await fse.readFile(secretsPath, 'utf8')).trim() || undefined
				} catch {
					return undefined
				}
			},
			writePassword: async (password) => {
				// AD-9 spirit: canonical copy under secrets/, 0600 (samba-password precedent).
				await fse.ensureDir(nodePath.dirname(secretsPath))
				await fse.writeFile(secretsPath, password, {mode: 0o600})
				await fse.chmod(secretsPath, 0o600)
			},
			ensureRepoDir: async () => {
				await fse.ensureDir(SAFETY_REPO_PATH)
				await fse.chmod(SAFETY_REPO_PATH, 0o700)
			},
			repoDirState: async () => {
				const entries = await fse.readdir(SAFETY_REPO_PATH).catch(() => [] as string[])
				if (entries.length === 0) return 'empty'
				// IN-02: a kopia filesystem repo stores its format blob as
				// `kopia.repository` (filesystem storage suffixes blob files, e.g.
				// `kopia.repository.f`). Marker present = real repo (orphan
				// reconnect); non-empty WITHOUT it = foreign files — warn + skip
				// upstream, never treat a stray file as a repo (hourly
				// connect-error loop) and never delete anything.
				return entries.some((entry) => String(entry).startsWith('kopia.repository')) ? 'repository' : 'foreign'
			},
			createKopiaRepository: async (password) => {
				// --override-hostname at CREATE time too: maintenance ownership must match
				// the connect()-time identity or `maintenance run` silently no-ops
				// (AD-8 root-vs-user/hostname owner trap).
				await this.kopia([
					'repository',
					'create',
					'filesystem',
					`--path=${SAFETY_REPO_PATH}`,
					`--config-file=/kopia/config/${SAFETY_REPO_ID}.config`,
					`--password=${password}`,
					'--override-hostname=livinity',
				])
			},
			connectKopiaRepository: async (password) => {
				await this.kopia([
					'repository',
					'connect',
					'filesystem',
					`--path=${SAFETY_REPO_PATH}`,
					`--config-file=/kopia/config/${SAFETY_REPO_ID}.config`,
					`--password=${password}`,
					'--override-hostname=livinity',
					'--content-cache-size-mb=2000',
					'--metadata-cache-size-mb=1000',
				])
			},
			log: (m) => this.logger.log(m),
			error: (m, e) => this.logger.error(m, e as Error),
		})
		if (result === 'created') {
			// First protection shouldn't wait up to 1h for the next tick — same
			// fire-and-forget-first-backup pattern as the setup wizard's setupBackup.
			void this.backup(SAFETY_REPO_ID).catch((error) => this.logger.error('Initial safety snapshot failed', error))
		}
	}

	// Get repositories
	async getRepositories() {
		return (await this.#livinityd.store.get('backups.repositories')) || []
	}

	// Get repository by id
	async getRepository(id: string) {
		const repositories = await this.getRepositories()
		const repository = repositories.find((repository) => repository.id === id)
		if (!repository) throw new Error(`Repository ${id} not found`)
		return repository
	}

	// Run a kopia command
	// We just default to bypassing the queue to effectively disable it now. It was causing blocking problems.
	// We can carefully re-enable it in select places in the future if we need to.
	async kopia(
		flags: string[] = [],
		{onOutput, bypassQueue = true}: {onOutput?: (output: string) => void; bypassQueue?: boolean} = {},
	) {
		// Refuse to spawn new kopia processes if we're shutting down
		if (!this.running) throw new Error('[shutting-down] Refusing to spawn new kopia processes')

		// P0 backups-v2: a missing engine must never surface as a raw
		// spawn-ENOENT (or as a silently EMPTY backup list through per-repo
		// catches in listAllBackups). Re-detect once, then throw typed.
		if (!this.engineStatus.available) {
			await this.checkEngine()
			this.assertEngineAvailable()
		}

		const spawnKopiaProcess = async () => {
			// Spawn process. The env (and therefore where kopia keeps its config and
			// cache) is owned by engine.ts — see kopiaSpawnEnv's comment for why it is
			// a single pure function rather than an inline literal.
			const env = kopiaSpawnEnv()
			const process = execa('kopia', flags, {env})

			// Store reference to running process
			this.runningKopiaProcesses.push(process)
			// Remove the process reference once the process is no longer running
			process
				.finally(() => (this.runningKopiaProcesses = this.runningKopiaProcesses.filter((p) => p !== process)))
				.catch(() => {}) // Swallow errors here to avoid unhandled promise rejections (they should be handled by the caller)

			// Pipe output to verbose logger and optional onOutput handler
			const handleOutput = (data: Buffer) => {
				const line = data.toString()
				this.logger.verbose(line.trim())
				onOutput?.(line)
			}
			process.stdout?.on('data', (data) => handleOutput(data))
			process.stderr?.on('data', (data) => handleOutput(data))

			// Return process promise
			return process
		}
		// Ensure we only run one kopia process at a time
		return bypassQueue ? spawnKopiaProcess() : this.kopiaQueue.add(spawnKopiaProcess)
	}

	/**
	 * Phase 368.6 (D9) — the destination roots the wizard may offer.
	 *
	 * Derived from the SAME constants and the same registration flag the backend
	 * predicate uses, because a UI that offers a root addRepository then refuses is
	 * a dead-end wizard: the operator picks a disk, names a folder, types a
	 * password, and only then gets told no.
	 *
	 * Capacity is reported per root so the wizard can show "X free of Y" and
	 * disable a row whose free space cannot be read (matching the fail-safe posture
	 * of the destination probe, which refuses a degenerate df rather than assuming
	 * the best).
	 */
	async getDestinationRoots(): Promise<
		Array<{
			root: string
			kind: DestinationKind
			available: boolean
			offSystemDisk: boolean
			unavailableReason?: string
			size?: number
			free?: number
		}>
	> {
		// Phase 368.8 (Route C): self-heal a box whose boot-time attempt failed, and
		// give the 368.8-03 pre-flight a root that has just had its best chance to
		// exist before it measures one.
		await this.ensureInternalBackupRoot().catch(() => false)

		const roots: Array<{
			root: string
			kind: DestinationKind
			available: boolean
			offSystemDisk: boolean
			unavailableReason?: string
			size?: number
			free?: number
		}> = []

		// Storage pool — offered only when one is registered, and only counts as
		// separate hardware when every branch is off the OS disk.
		const poolRegistered = this.#livinityd.files.poolBaseDirRegistered
		const poolUsage = poolRegistered
			? await getDiskUsageByPath(POOL_MOUNTPOINT).catch(() => undefined)
			: undefined
		roots.push({
			root: '/Pool',
			kind: 'pool',
			available: poolRegistered && poolUsage !== undefined,
			offSystemDisk: poolRegistered
				? await resolveOffSystemDisk({kind: 'pool', systemPath: POOL_MOUNTPOINT}, this.offSystemDiskDeps()).catch(
						() => false,
					)
				: false,
			unavailableReason: !poolRegistered ? 'no-pool' : poolUsage === undefined ? 'space-unreadable' : undefined,
			size: poolUsage?.size,
			free: poolUsage?.available,
		})

		// The system disk. Always OFFERED, never off-system — that is the whole
		// honesty contract: it protects against mistakes, not against this disk dying.
		//
		// Phase 368.8 (COR-04): but "offered" is not "available". Until this phase the
		// row's `available` depended only on whether df could be read, so the wizard
		// happily offered a root that addRepository would then refuse — the dead-end
		// this method's own docstring above forbids, and precisely the v1.1.13 field
		// bug. Now the three conditions addRepository will actually apply are checked
		// HERE, before the operator types a folder name and a password.
		const systemUsage = await getSystemDiskUsage(this.#livinityd).catch(() => undefined)
		const internalFreePercent =
			systemUsage && Number.isFinite(systemUsage.size) && systemUsage.size > 0
				? (systemUsage.available / systemUsage.size) * 100
				: undefined
		const internalRootExists = await fse.pathExists(INTERNAL_BACKUP_ROOT).catch(() => false)
		// Reuse the SAME write proof the probe uses, so the wizard and addRepository
		// can never disagree about what "writable" means.
		const internalRootWritable = internalRootExists
			? await this.destinationProbeDeps().canWrite(INTERNAL_BACKUP_ROOT)
			: false
		// COR-05: the 15% floor is evaluated against the SYSTEM disk for an internal
		// destination, so a full box is refused even after the P0 fix. Name it here
		// rather than after the password step.
		const internalUnavailableReason = !internalRootExists
			? 'internal-root-missing'
			: !internalRootWritable
				? 'internal-root-not-writable'
				: systemUsage === undefined || internalFreePercent === undefined || Number.isNaN(internalFreePercent)
					? 'space-unreadable'
					: internalFreePercent < MIN_FREE_PERCENT
						? 'internal-too-full'
						: undefined
		if (internalUnavailableReason !== undefined) {
			this.logger.error(
				`Destination root ${INTERNAL_VIRTUAL_ROOT} unavailable: ${internalUnavailableReason} (root=${INTERNAL_BACKUP_ROOT}, exists=${internalRootExists}, writable=${internalRootWritable}, free=${internalFreePercent?.toFixed(1) ?? 'unknown'}%)`,
			)
		}
		roots.push({
			root: INTERNAL_VIRTUAL_ROOT,
			kind: 'internal',
			available: internalUnavailableReason === undefined,
			offSystemDisk: false,
			unavailableReason: internalUnavailableReason,
			size: systemUsage?.size,
			free: systemUsage?.available,
		})

		return roots
	}

	/**
	 * Phase 368.8 (Route C) — create INTERNAL_BACKUP_ROOT.
	 *
	 * This is why the root moved under $LIVOS_DIR: /opt is root-owned and livinityd is
	 * unprivileged (sudoers.d/livinityd grants no mkdir and no general chown), but
	 * update.sh chowns /opt/livos to the run-user on every update (update.sh:4566-4568),
	 * so we can create children here. Exactly the same mechanism that lets
	 * ensureRepoDir create SAFETY_REPO_PATH today.
	 *
	 * Idempotent and never throws: a failure leaves the root absent, which
	 * probeDestination reports as the actionable `internal-root-missing` rather than a
	 * crash. Mode 0755, not 0700: the repositories underneath are kopia-encrypted and
	 * this matches the surrounding /opt/livos convention.
	 */
	async ensureInternalBackupRoot(): Promise<boolean> {
		try {
			await fse.ensureDir(INTERNAL_BACKUP_ROOT)
			await fse.chmod(INTERNAL_BACKUP_ROOT, 0o755)
			// Logged on SUCCESS, not only on failure: the 368.8-04 box UAT and the
			// 368.8-05 release check both gate on seeing this line in the journal, and
			// a gate whose evidence is never emitted teaches an operator to wave gates
			// through. Unconditional (not first-run-only) so a re-run still proves it.
			this.logger.log(`Backup destination root ready: ${INTERNAL_BACKUP_ROOT}`)
			return true
		} catch (error) {
			this.logger.error(`Could not create ${INTERNAL_BACKUP_ROOT}`, error)
			return false
		}
	}

	// Create a repository
	async createRepository(virtualPath: string, password: string) {
		const createNew = true
		// adminProcedure (routes.ts) — the Phase 368.6 destination set (storage pool,
		// named system-disk folder) is reachable only from here.
		return this.addRepository(virtualPath, password, createNew, {allowWidenedDestinations: true})
	}

	// Connect to existing repository
	async connectToExistingRepository(virtualPath: string, password: string) {
		const createNew = false
		// D8: this is adminProcedureWhenNoUserExists — genuinely UNAUTHENTICATED
		// while the box has no user yet, because onboarding-restore needs it. It
		// therefore keeps the pre-368.6 predicate verbatim: /External and /Network
		// only. Widening the destination set on an unauthenticated route would let
		// anyone who can reach a fresh box write into the pool or the system disk.
		return this.addRepository(virtualPath, password, createNew)
	}

	/**
	 * Phase 368.6 (D1) — resolve a virtual destination to a proven system path.
	 *
	 * Every refusal is logged WITH the resolved realpath before it is thrown, so a
	 * field report ("it just says no") can be diagnosed from the box's own log
	 * without a second round-trip.
	 */
	private async resolveDestination(
		virtualPath: string,
		{allowWidenedDestinations}: {allowWidenedDestinations: boolean},
	): Promise<{kind: DestinationKind; systemPath: string; offSystemDisk: boolean}> {
		const classified = classifyDestination(virtualPath, {
			poolRegistered: this.#livinityd.files.poolBaseDirRegistered,
			poolMountpoint: POOL_MOUNTPOINT,
			repositoryDirectoryName: this.backupDirectoryName,
		})
		if (!classified.ok) {
			this.logger.error(`Refusing backup destination ${virtualPath}: [${classified.code}] ${classified.reason}`)
			throw new Error(`Invalid path ${virtualPath} — ${classified.reason}`)
		}

		const widened = classified.kind === 'pool' || classified.kind === 'internal'
		if (widened && !allowWidenedDestinations) {
			this.logger.error(`Refusing backup destination ${virtualPath}: widened destinations are admin-only`)
			throw new Error(`Invalid path ${virtualPath}`)
		}

		// External/Network still resolve through files.ts' per-user base-directory
		// map; pool/internal carry their own resolved path from classification.
		const systemPath =
			classified.systemPath ?? (await this.#livinityd.files.virtualToSystemPath(virtualPath).catch(() => ''))
		if (!systemPath) {
			this.logger.error(`Refusing backup destination ${virtualPath}: could not resolve a system path`)
			throw new Error(`Invalid path ${virtualPath}`)
		}

		// 368.8: the probe may create the internal leaf directory (PROBE-02). Track
		// what it made so a refusal does not litter /opt/livos/backups-internal with empty
		// folders from abandoned wizard attempts.
		const createdDirectories: string[] = []
		const decision = await probeDestination(
			{
				kind: classified.kind,
				systemPath,
				dataDirectory: this.#livinityd.dataDirectory,
				poolMountpoint: POOL_MOUNTPOINT,
			},
			this.destinationProbeDeps(createdDirectories),
		)
		if (!decision.ok) {
			// rmdir, never remove: rmdir refuses a non-empty directory, so a folder that
			// somehow already held data can never be deleted by a refused probe.
			for (const directory of createdDirectories.reverse()) {
				await fse.rmdir(directory).catch(() => {})
			}
			this.logger.error(`Refusing backup destination ${virtualPath} -> ${systemPath}: [${decision.code}] ${decision.reason}`)
			// Typed bracketed code — features/backups/utils/error-messages.ts turns
			// these into the operator-facing sentence.
			throw new Error(`[${decision.code}] ${decision.reason}`)
		}

		const offSystemDisk = await resolveOffSystemDisk(
			{kind: classified.kind, systemPath: decision.systemPath!},
			this.offSystemDiskDeps(),
		)
		this.logger.log(
			`Accepted backup destination ${virtualPath} -> ${decision.systemPath} (kind=${classified.kind}, offSystemDisk=${offSystemDisk})`,
		)

		return {kind: classified.kind, systemPath: decision.systemPath!, offSystemDisk}
	}

	private destinationProbeDeps(createdDirectories?: string[]): DestinationProbeDeps {
		return {
			// fse.realpath's typings union in a Buffer overload; the string form is what
			// we call, so normalise before it reaches the pure policy module.
			realpath: async (path) => fse.realpath(path).then((resolved) => String(resolved)).catch(() => null),
			mountpointFor: async (path) => {
				try {
					const {stdout} = await execa('findmnt', ['-no', 'TARGET', '--target', path])
					const first = stdout.split('\n')[0]?.trim()
					return first && first.length > 0 ? first : null
				} catch {
					return null
				}
			},
			fstypeOf: async (path) => {
				try {
					const {stdout} = await execa('findmnt', ['-no', 'FSTYPE', '--target', path])
					const first = stdout.split('\n')[0]?.trim()
					return first && first.length > 0 ? first : null
				} catch {
					return null
				}
			},
			canWrite: async (path) => {
				// Prove it rather than trust the mode bits: a read-only remount and a
				// full-but-writable-looking share both pass a permission check and fail
				// the first real write.
				const probe = nodePath.join(path, `.livinity-write-probe-${randomToken(8)}`)
				try {
					await fse.ensureDir(path)
					await fse.writeFile(probe, 'livinity')
					await fse.stat(probe)
					return true
				} catch {
					return false
				} finally {
					await fse.remove(probe).catch(() => {})
				}
			},
			freePercent: async (path) => {
				try {
					const {size, available} = await getDiskUsageByPath(path)
					if (!Number.isFinite(size) || !Number.isFinite(available) || size <= 0) return null
					return (available / size) * 100
				} catch {
					return null
				}
			},
			existingRepositoryPaths: async () => {
				const repositories = await this.getRepositories().catch(() => [])
				return repositories
					.map((repository) => repository.systemPath ?? (repository.isSafety ? repository.path : ''))
					.filter((path): path is string => Boolean(path))
			},
			// Phase 368.8 (PROBE-02): create the per-repository leaf for an internal
			// destination so the probe has a real path to resolve. The PURE policy
			// module decides WHETHER to call this (internal only, exactly one segment
			// under INTERNAL_BACKUP_ROOT, root proven to exist first); this closure only
			// performs it and records what it made so a refusal can clean up after
			// itself. `recursive: false` is load-bearing — it keeps root creation inside
			// ensureInternalBackupRoot, the one place that creates and logs it, instead of
			// letting a probe conjure it as a side effect. No chown: livinityd creates this as the run-user, so
			// ownership is already correct, and files.chownSystemPath hardcodes uid 1000
			// (files.ts:224) which is wrong on a box whose run-user is 1001+.
			ensureLeafDirectory: async (path) => {
				try {
					if (await fse.pathExists(path)) return true
					await fse.mkdir(path, {recursive: false})
					createdDirectories?.push(path)
					return true
				} catch {
					return false
				}
			},
		}
	}

	private offSystemDiskDeps(): OffSystemDiskDeps {
		return {
			disksForPath: (path) => diskForPath(path),
			osDisks: () => resolveOsDisks(),
			poolMemberDisks: async () => {
				// Resolve from the POOL's own member list, never from findmnt on
				// /mnt/pool — that resolves to the mergerfs FUSE source, which names no
				// physical disk (and st_dev would lie outright).
				const members = (await this.#livinityd.store.get('storagePool').catch(() => undefined))?.members ?? []
				const disks = new Set<string>()
				for (const member of members) {
					const mountpoint = (member as {mountpoint?: string}).mountpoint
					if (!mountpoint) continue
					for (const disk of await diskForPath(mountpoint)) disks.add(disk)
				}
				return [...disks]
			},
		}
	}

	// Add a repository to the store and connect to it
	// Conditionally creates a new repository if createNew is true
	async addRepository(
		virtualPath: string,
		password: string,
		createNew = true,
		{allowWidenedDestinations = false}: {allowWidenedDestinations?: boolean} = {},
	) {
		// P0 backups-v2: fail with a clear typed error instead of a raw kopia
		// ENOENT deep inside the wizard. Re-checks live so a just-installed
		// engine is picked up without waiting for the hourly interval.
		await this.ensureEngine()

		virtualPath = nodePath.join(virtualPath, this.backupDirectoryName)

		// Phase 368.6 (D1): the destination gauntlet — classification, the
		// restore-wipe containment bound, mount proof, fstype/write/capacity and
		// no-nesting. Defaults to the pre-368.6 /External+/Network set unless the
		// caller is the admin-only route.
		const {kind, systemPath, offSystemDisk} = await this.resolveDestination(virtualPath, {allowWidenedDestinations})

		// TODO: We might also want to store some kind of unique identifier like filesystem uuid. Otherwise
		// a different destination mounted at the same path could be used as the destination. Or if there
		// are two external drives "Untitled" and "Untitled (2)" that are then mounted in different orders
		// we won't be able to resolve the path. (368.6 closes part of this: the
		// resolved systemPath is persisted, and a destination that is no longer
		// mounted is now refused rather than silently landing on the OS disk.)

		// Derive 128 bit hex string from password
		// This is not key stretching, key stretching is handled internally by kopia with scrypt.
		// This is just to avoid keeping plain text passwords around in the store.
		password = createHash('sha256').update(password).digest('hex').slice(0, 16)

		// Derive unique id from path
		const id = createHash('sha256').update(virtualPath).digest('hex').slice(0, 8)

		// Create kopia repository if we're creating a new one
		if (createNew) {
			this.logger.log(`Creating repository ${id}`)

			// 368.6: a pool/internal destination's PARENT may not exist yet (nobody has
			// ever written to <INTERNAL_BACKUP_ROOT>/<name>). Create it first, but keep the
			// repository directory itself non-recursive — that is what makes EEXIST
			// mean "a repository is already here" rather than silently reusing a path.
			// 368.8: for `internal` the probe has already created that parent (PROBE-02),
			// so this is an idempotent no-op there; it stays because it is still the only
			// thing that creates a `pool` parent. Do NOT re-derive the old sibling root
			// this comment used to name — see destination-policy.ts:37-58 for why.
			if (kind === 'pool' || kind === 'internal') {
				await fse.mkdir(nodePath.dirname(systemPath), {recursive: true})
				await this.#livinityd.files.chownSystemPath(nodePath.dirname(systemPath)).catch(() => {})
			}

			// Create the directory
			await fse.mkdir(systemPath, {recursive: false}).catch((error) => {
				if (error.code === 'EEXIST') throw new Error(`Repository already exists at ${virtualPath}`)
				throw error
			})
			await this.#livinityd.files.chownSystemPath(systemPath).catch(() => {}) // Might throw on fs without chown

			// Create the kopia repository
			// TODO: Investigate all the possible options here
			await this.kopia([
				'repository',
				'create',
				'filesystem',
				// Location to backup the data to
				`--path=${systemPath}`,
				// Path to local config file for this repository
				// These don't seem to need to be persisted. If you nuke them they
				// get recreated the next time we connect.
				`--config-file=/kopia/config/${id}.config`,
				// Password for the repository
				`--password=${password}`,
			])
		}

		// Update the store
		await this.#livinityd.store.getWriteLock(async ({set}) => {
			const repositories = await this.getRepositories()

			// Sanity check to prevent dupes but this shouldn't ever happen because
			// the repository creation should fail
			const repositoryExists = repositories.some((existingRepository) => existingRepository.id === id)
			// 368.6 (D4): persist the resolved facts. systemPath means connect() never
			// has to re-resolve a virtual path — which is also what makes the hourly
			// job work in multi-user mode, where files.ts hands a context-less caller
			// an EMPTY base-directory map and every virtual path stops resolving.
			if (!repositoryExists) repositories.push({id, path: virtualPath, password, kind, systemPath, offSystemDisk})

			await set('backups.repositories', repositories)
		})

		// Connect to repository
		await this.connect(id).catch(async (error) => {
			// If connecting fails when setting up an existing repository it means the details are incorrect.
			// Clean up and remove it from the store.
			const isConnectingToExistingRepository = !createNew
			if (isConnectingToExistingRepository) await this.forgetRepository(id).catch(() => {})
			throw error
		})

		this.logger.log(`Connected to repository ${id}`)

		// P0 backups-v2: the box now has a destination — clear the weekly
		// "backups are not set up" nag if it's showing.
		// Phase 368.6 (D5): only a REAL destination may silence it. An internal
		// folder on the system disk is a genuine and useful backup, but it does not
		// survive that disk failing — so the "add a drive or a NAS" reminder has to
		// keep coming. Clearing it here would also snooze it for a full week.
		if (isRealDestination({offSystemDisk})) {
			await this.#livinityd.notifications.clear('backups-not-configured').catch(() => {})
		}

		return id
	}

	// Forget a repository
	async forgetRepository(repositoryId: string) {
		this.logger.log(`Forgetting repository ${repositoryId}`)

		// TODO: Ideally we would unmount any mounts we have from this repository but we
		// don't really have a clean way to do that with the current architecture. Probably
		// fine for now.

		await this.#livinityd.store.getWriteLock(async ({set}) => {
			let repositories = await this.getRepositories()
			repositories = repositories.filter((repository) => repository.id !== repositoryId)
			await set('backups.repositories', repositories)
		})

		this.logger.log(`Forgot repository ${repositoryId}`)
	}

	// Restore a backup
	async restoreBackup(backupId: string) {
		if (this.restoreStatus.running) throw new Error('[in-progress] Restore already in progress')
		let success = false

		// Check we have enough free space to restore the backup
		const backup = await this.getBackup(backupId)
		const diskUsage = await getSystemDiskUsage(this.#livinityd)
		const buffer = 1024 * 1024 * 1024 * 5 // 5GB
		const neededSpace = backup.size + buffer
		if (diskUsage.available < neededSpace) throw new Error('[not-enough-space] Not enough free space to restore backup')

		this.logger.log(`Restoring backup ${backupId}`)
		setSystemStatus('restoring')
		const temporaryData = `${this.#livinityd.dataDirectory}/.temporary-migration`
		const finalData = `${this.#livinityd.dataDirectory}/import`

		// Set restore status to running and emit operation status event
		this.restoreStatus = {
			running: true,
			progress: 0,
			description: 'Restoring backup',
			error: false,
			backupId,
			bytesPerSecond: 0,
		}
		this.#livinityd.eventBus.emit('backups:restore-progress', this.restoreStatus)

		try {
			// If mount fails, finally will emit failure state that UI can handle in the restore cover
			const backupDirectoryName = await this.mountBackup(backupId)
			const internalBackupMountpoint = nodePath.join(this.internalMountPath, backupDirectoryName)

			// Copy over data dir from previous install to temp dir while preserving permissions
			await fse.remove(temporaryData)
			let previousProgress: number
			await copyWithProgress(`${internalBackupMountpoint}/`, temporaryData, (progress) => {
				this.restoreStatus.progress = progress.progress
				this.restoreStatus.bytesPerSecond = progress.bytesPerSecond
				this.restoreStatus.secondsRemaining = progress.secondsRemaining
				this.#livinityd.eventBus.emit('backups:restore-progress', this.restoreStatus)
				if (previousProgress !== this.restoreStatus.progress) {
					previousProgress = this.restoreStatus.progress
					this.logger.log(`Restored ${this.restoreStatus.progress}% of backup`)
				}
			})
			// We mark that the next boot is the first start after a backup restore.
			await fse.ensureFile(`${temporaryData}/${BACKUP_RESTORE_FIRST_START_FLAG}`).catch(() => {})
			await fse.move(temporaryData, finalData, {overwrite: true})
			success = true
		} finally {
			if (!success) {
				// Best-effort cleanup on failure (non-blocking to not delay status updates)
				// - Remove temp data to prevent disk space leaks if user never retries
				// - Remove any mounts to avoid any issues with retries
				fse.remove(temporaryData).catch(() => {})
				this.unmountAll().catch(() => {})

				// Emit failure status
				this.restoreStatus = {
					running: false,
					progress: 0,
					description: 'Restore failed',
					error: 'Restore failed',
					// backupId, bytesPerSecond, secondsRemaining are undefined
				}
				this.#livinityd.eventBus.emit('backups:restore-progress', this.restoreStatus)
			}

			// Reset system status to 'running' on failure, or always in test mode (no reboot)
			if (!success || process.env.LIVINITYD_RESTORE_SKIP_REBOOT === 'true') setSystemStatus('running')
		}

		if (success) {
			this.restoreStatus = {
				running: false,
				progress: 100,
				description: 'Restore complete',
				error: false,
			}
			this.#livinityd.eventBus.emit('backups:restore-progress', this.restoreStatus)

			// Dirty hack to allow us to test restore without rebooting
			if (process.env.LIVINITYD_RESTORE_SKIP_REBOOT !== 'true') {
				this.logger.log(`Rebooting into newly recovered data`)
				setSystemStatus('restarting')
				await this.#livinityd.stop().catch(() => {})
				await reboot()
			}
		}

		return
	}

	// Connect to a repository
	// We must be connected to a repository before we can backup to it
	private async connect(repositoryId: string) {
		const repository = await this.getRepository(repositoryId)

		// Phase 368.5 BKP-16: the system-managed safety repo lives at a fixed SYSTEM path
		// outside the virtual filesystem — every other repo still resolves virtually.
		// Phase 368.6 (D4): a persisted systemPath wins over both. It is resolved once,
		// when the destination is added and proven, so pool/internal destinations (which
		// have no virtual root to resolve) work — and so the hourly job stops depending
		// on a virtual-path resolution that returns nothing in multi-user mode, where
		// files.ts hands a context-less caller an EMPTY base-directory map.
		const systemPath =
			repository.systemPath ??
			(repository.isSafety ? repository.path : this.#livinityd.files.virtualToSystemPathUnsafe(repository.path))
		await this.kopia([
			'repository',
			'connect',
			'filesystem',
			// Location to backup the data to
			`--path=${systemPath}`,
			// Path to local config file for this repository
			// These don't seem to need to be persisted. If you nuke them they
			// get recreated the next time we connect.
			`--config-file=/kopia/config/${repository.id}.config`,
			// Password for the repository
			`--password=${repository.password}`,
			// Force the hostname to 'livinity' so backups always match the same host.
			// Without this if you start backing up, then change your hostname, then
			// continue to backup, kopia will see these as backups originating from
			// different machines.
			'--override-hostname=livinity',
			// P0 backups-v2: cap the local cache so it can never eat the system
			// disk (umbrelOS shipped exactly that bug — getumbrel/umbrel#2099).
			'--content-cache-size-mb=2000',
			'--metadata-cache-size-mb=1000',
		])
	}

	/**
	 * Phase 368.5 gate — in-flight system-disk protection.
	 *
	 * Polls free space while a snapshot is being written to the system disk and
	 * kills the kopia process if it crosses the emergency floor. Returns the stop
	 * function; the caller MUST call it in a finally, or the timer outlives the run.
	 *
	 * Killing mid-snapshot is safe: kopia commits a snapshot atomically, so an
	 * aborted run leaves the repository's previous snapshots intact and simply has
	 * no new one. The existing terminal-state writer marks the run failed, and the
	 * >24h backups-failing alert surfaces it. Losing one hourly run is a far better
	 * outcome than a full disk.
	 */
	private startDiskWatchdog(repositoryId: string): () => void {
		const POLL_MS = 20_000
		let killed = false

		const timer = setInterval(async () => {
			if (killed) return
			let usage: {size: number; available: number}
			try {
				usage = await getSystemDiskUsage(this.#livinityd)
			} catch (error) {
				// Deliberately NOT fatal — see shouldAbortForDiskPressure: the
				// pre-flight already proved there was room, and aborting on a transient
				// df failure would stop a flaky box ever completing a backup.
				this.logger.error('Disk watchdog probe failed — letting the snapshot continue', error as Error)
				return
			}

			if (!shouldAbortForDiskPressure(usage)) return

			killed = true
			const percent = freePercentOf(usage)
			this.logger.error(
				`ABORTING snapshot for repository ${repositoryId}: system disk at ${percent?.toFixed(1) ?? '?'}% free ` +
					`(<${DISK_ABORT_FREE_PERCENT}%). Stopping the write so the box stays up; the next interval will retry.`,
			)
			for (const process of this.runningKopiaProcesses) {
				try {
					process.kill('SIGTERM')
				} catch (error) {
					this.logger.error('Failed to stop kopia process under disk pressure', error as Error)
				}
			}
		}, POLL_MS)

		// Never hold the event loop open on this timer alone.
		timer.unref?.()

		return () => clearInterval(timer)
	}

	// Wrapper for kopia commands that interact with a repository
	async repository(
		repositoryId: string,
		flags: string[] = [],
		{onOutput, bypassQueue = true}: {onOutput?: (output: string) => void; bypassQueue?: boolean} = {},
	) {
		// Check we're connected to the repository
		// We technically only need to connect once, but there's no downside to connecting
		// once we're already connected. This also conveniently means we auto retry connecting
		// to repos that weren't accessible before.
		await this.connect(repositoryId)

		// Run the command
		return this.kopia([...flags, `--config-file=/kopia/config/${repositoryId}.config`], {onOutput, bypassQueue})
	}

	// Get size of a repository
	async getRepositorySize(repositoryId: string) {
		const repository = await this.getRepository(repositoryId)

		// Get the used size of the repository
		const stats = await this.repository(repository.id, ['content', 'stats', '--raw'])
		const sizeLinePattern = 'Total Packed: '
		const sizeLine = stats.stdout.split('\n').find((line) => line.startsWith(sizeLinePattern)) || ''
		const used = Number(sizeLine.replace(sizeLinePattern, '').split(' ')[0])

		// Get the capacity and available space of the repository
		const status = await this.repository(repository.id, ['repository', 'status', '--json'])
		const {capacity, available} = JSON.parse(status.stdout).volume
		return {used, capacity, available}
	}

	// Backup the livinity data directory to a repository
	async backup(repositoryId: string) {
		await this.ensureEngine()
		const repository = await this.getRepository(repositoryId)
		this.logger.log(`Backing up to ${repository.path}`)

		// Ensure policy is enforced
		this.logger.log(`Ensuring policy is enforced`)
		await this.repository(repository.id, [
			'policy',
			'set',
			'--global',
			// Phase 368.5 BKP-16: retention is selected per-repository (safety =
			// aggressive thinning). repository() scopes 'policy set --global' to THIS
			// repo via its per-repo --config-file, so safety thinning can never leak
			// onto USB/SMB repos (the backups.ts:481-498 trap).
			...retentionFlagsFor(repository),
			// Compression
			'--compression=zstd-fastest',
			// Never cross fs boundaries
			'--one-file-system=true',
			// Throttle CPU usage
			'--max-parallel-file-reads=1',
		])
		this.logger.log(`Retention policy enforced`)

		// Phase 368.5 BKP-16: a safety backup must never fill the system disk.
		// <15% free ⇒ thin + maintain first; still <15% ⇒ SKIP with a logged reason
		// (not an error state — no notification, no failed run history).
		//
		// Phase 368.6 (D7): the same guard now covers ANY repository that shares the
		// system disk — an internal destination can fill it just as effectively. But
		// the relief branch is SAFETY-ONLY on purpose: it runs `snapshot expire --all`
		// + `maintenance run --full`, which under USER_RETENTION_FLAGS (keep-monthly=12)
		// would silently destroy a year of the operator's own snapshots to buy space
		// they never agreed to trade. For a user repository we skip and say why; the
		// existing >24h `backups-failing` alert still fires, so a persistently skipped
		// destination surfaces rather than rotting quietly.
		const sharesSystemDisk = repository.isSafety || repository.offSystemDisk !== true
		if (sharesSystemDisk) {
			const decision = await evaluateDiskPressure({
				getDiskUsage: () => getSystemDiskUsage(this.#livinityd),
				runRetentionAndMaintenance: repository.isSafety
					? async () => {
							await this.repository(repository.id, ['snapshot', 'expire', '--all'])
							await this.repository(repository.id, ['maintenance', 'run', '--full'])
						}
					: // Non-safety: no relief attempt at all — evaluateDiskPressure's
						// contract is thin-then-recheck, so a no-op relief makes the second
						// check see the same reading and take the skip branch.
						async () => {},
				log: (m) => this.logger.log(m),
				error: (m, e) => this.logger.error(m, e as Error),
			})
			if (decision === 'skip') return false
		}

		// Ensure we have the latest ignore file before backing up
		this.logger.verbose(`Ensuring ignore file is up to date`)
		await this.createIgnoreFile()

		// Backup-completeness (2026-07-03): fold the box's out-of-tree state
		// (the livos Postgres DB — incl. Liv's memory + app-instance/routing
		// records — and /opt/liv-assistant/data) INTO dataDirectory so THIS
		// snapshot becomes a complete restore point, not just files. Best-effort:
		// a capture failure must never abort the file snapshot below.
		const backupScope = await this.getBackupScope().catch(() => DEFAULT_BACKUP_SCOPE)
		await captureSystemState(
			this.#livinityd.dataDirectory,
			{
				log: (m) => this.logger.log(m),
				error: (m, e) => this.logger.error(m, e as Error),
			},
			backupScope,
		).catch((error) => this.logger.error('[system-state] capture threw (non-fatal)', error))

		// Initialize progress tracking
		const backupProgress: BackupProgress = {repositoryId, percent: 0}
		this.backupsInProgress.push(backupProgress)
		this.#livinityd.eventBus.emit('backups:backup-progress', this.backupsInProgress)

		// Phase 368 BKP-03 — run-history lifecycle. 'running' is written before the
		// snapshot; the finally below writes the terminal state. If the process dies
		// mid-run the key stays 'running' and the boot preflight flips it to
		// 'failed'. Best-effort: history writes must never abort a backup.
		const runStartedAt = Date.now()
		let runSucceeded = false
		await this.#livinityd.store
			.getWriteLock(async ({set}) => {
				await set('backups.lastRunStatus', {
					startedAt: runStartedAt,
					status: 'running',
					repositoryId,
				} satisfies LastRunStatus)
			})
			.catch(() => {})

		try {
			// Create the snapshot
			// TODO: Attempt recovering from device out of space errors by deleting old snapshots
			this.logger.log(`Creating snapshot`)
			// Phase 368.5 gate: the pre-flight guard only proves there was room when
			// the run STARTED. A snapshot writing to the system disk can still take it
			// to zero on the way through, and on this box that is not "the backup
			// failed" — it is Postgres and Docker going down with it. Watch the disk
			// for the duration and kill the write if it crosses the emergency floor.
			const stopDiskWatchdog = sharesSystemDisk ? this.startDiskWatchdog(repository.id) : undefined
			try {
				await this.repository(repository.id, ['snapshot', 'create', this.#livinityd.dataDirectory], {
					onOutput: (output) => {
						// Pluck progress in brackets from output like:
						// '/ 1 hashing, 216 hashed (1.6 GB), 21121 cached (5.4 GB), uploaded 1.4 GB, estimated 7.6 GB (91.6%) 0s left'
						const match = output.match(/estimated.*\((\d+(?:\.\d+)?)%\).*left/)
						if (!match) return

						// Update progress
						backupProgress.percent = Number(match[1])
						this.#livinityd.eventBus.emit('backups:backup-progress', this.backupsInProgress)
					},
				})
			} finally {
				stopDiskWatchdog?.()
			}

			// Clear any backup failure notifications if we get a successful backup
			await this.#livinityd.notifications.clear(`backups-failing:${repository.id}`).catch(() => {})

			this.logger.log(`Backed up ${repository.path}`)

			// Phase 368.5 BKP-16: evidence-rich, distinguishable safety-run log (BKP-07 spirit).
			if (repository.isSafety) this.logger.log(`Safety snapshot complete (repo: ${repository.id}, kept 24h/7d)`)

			// Save last backed up date
			await this.#livinityd.store.getWriteLock(async ({set}) => {
				const repositories = await this.getRepositories()
				repositories.find((repository) => repository.id === repositoryId)!.lastBackup = Date.now()
				await set('backups.repositories', repositories)
			})

			// Check the size of the repository
			const size = await this.getRepositorySize(repository.id)
			this.logger.log(
				`${repository.path} size after backup: Used ${prettyBytes(size.used)} of ${prettyBytes(size.capacity)}`,
			)

			runSucceeded = true
			return true
		} finally {
			// Remove progress tracking
			this.backupsInProgress = this.backupsInProgress.filter((progress) => progress !== backupProgress)
			this.#livinityd.eventBus.emit('backups:backup-progress', this.backupsInProgress)

			// Phase 368 BKP-03 — terminal run-history state (best-effort). Compare-
			// and-set (review MD-01): overlapping backup() runs share this single
			// key, so only write the terminal state while the stored record is
			// still THIS run's own — never clobber a concurrent run's 'running'
			// record (a crashed concurrent run must stay recoverable as FAILED).
			await this.#livinityd.store
				.getWriteLock(async ({get, set}) => {
					await writeTerminalRunStatus({
						getStored: () => get('backups.lastRunStatus'),
						setStored: (status) => set('backups.lastRunStatus', status),
						run: {
							startedAt: runStartedAt,
							status: runSucceeded ? 'success' : 'failed',
							repositoryId,
						} satisfies LastRunStatus,
					})
				})
				.catch(() => {})
		}
	}

	// ── Backup scope (what to include) ──────────────────────────────────
	// Positive selection of the OUT-OF-TREE stores folded into the snapshot by
	// system-state.ts. Files + bind-mount app data are ALWAYS included (they ARE
	// the dataDirectory snapshot; use exclusions to skip pieces). These toggles
	// govern the extra captures. Default ON so a fresh box is fully covered.
	async getBackupScope(): Promise<BackupScope> {
		const stored = (await this.#livinityd.store.get('backups.scope')) as Partial<BackupScope> | undefined
		return {...DEFAULT_BACKUP_SCOPE, ...(stored ?? {})}
	}

	async setBackupScope(scope: Partial<BackupScope>): Promise<BackupScope> {
		let next: BackupScope = DEFAULT_BACKUP_SCOPE
		await this.#livinityd.store.getWriteLock(async ({set}) => {
			const current = await this.getBackupScope()
			next = {...current, ...scope}
			await set('backups.scope', next)
		})
		return next
	}

	// Get ignored paths
	async getIgnoredPaths() {
		return (await this.#livinityd.store.get('backups.ignore')) || []
	}

	// Set ignored paths
	async addIgnoredPath(path: string) {
		path = nodePath.resolve(path)
		const isHomePath = path === '/Home' || path.startsWith('/Home/')
		if (!isHomePath) throw new Error(`Path to exclude must be in /Home`)

		await this.#livinityd.store.getWriteLock(async ({set}) => {
			let ignore = await this.getIgnoredPaths()
			ignore = Array.from(new Set([...ignore, path]))
			await set('backups.ignore', ignore)
		})
		return true
	}

	// Remove ignored path
	async removeIgnoredPath(path: string) {
		path = nodePath.resolve(path)
		const isHomePath = path === '/Home' || path.startsWith('/Home/')
		if (!isHomePath) throw new Error(`Path to exclude must be in /Home`)

		await this.#livinityd.store.getWriteLock(async ({set}) => {
			let ignore = await this.getIgnoredPaths()
			ignore = ignore.filter((p) => p !== path)
			await set('backups.ignore', ignore)
		})
		return true
	}

	// Create ignore file for kopia
	async createIgnoreFile() {
		const ignoreFilePath = nodePath.join(this.#livinityd.dataDirectory, '.kopiaignore')
		let ignoreFileContents = []

		// Ignore non critical directories that can be rebuilt and cause a lot of churn
		ignoreFileContents.push('app-stores')
		ignoreFileContents.push(this.#livinityd.files.thumbnails.thumbnailDirectory)

		// Ignore temporary migration directory
		ignoreFileContents.push('.temporary-migration')

		// Ignore backup mount points
		ignoreFileContents.push(this.internalMountPath)
		ignoreFileContents.push(this.backupRoot)

		// Add all user specified ignored paths
		const alwaysIgnoredPaths = ['/External', '/Network']
		const userIgnoredPaths = await this.getIgnoredPaths().catch(() => [])
		;[...alwaysIgnoredPaths, ...userIgnoredPaths].forEach((path) => {
			try {
				const systemPath = this.#livinityd.files.virtualToSystemPathUnsafe(path)
				ignoreFileContents.push(systemPath)
			} catch (error) {
				this.logger.error(`Failed to get system path for ignored path ${path}`, error)
			}
		})

		// Loop over apps
		await Promise.all(
			this.#livinityd.apps.instances.map(async (app) => {
				// Ignore entire data dir of user specified apps to ignore
				const isIgnored = await app.isBackupIgnored().catch((error) => {
					// If some app is in a broken state don't kill the whole backup
					this.logger.error(`Failed to get backup ignored status for ${app.id}`, error)
					return false
				})
				if (isIgnored) ignoreFileContents.push(app.dataDirectory)

				// Ignore paths that apps have signaled should be ignored
				const backupIgnore = await app.getBackupIgnoredFilePaths().catch((error) => {
					// If some app is in a broken state don't kill the whole backup
					this.logger.error(`Failed to get backup ignored file paths for ${app.id}`, error)
					return []
				})
				ignoreFileContents.push(...backupIgnore)
			}),
		)

		// Map all paths to absolute backup root paths
		// We make them absolute from the root like `/app-stores` instead of `app-stores` because
		// the relative would match any file or directory called `app-stores` but prepending with `/`
		// ensure it ony matches the exact path we want to ignore. Also if we use absolute system paths
		// we won't get match because kopia is assuming `/` is the backup root not the system root.
		const toBackupRootPath = (path: string) => {
			// If it's an absolute system path, convert it to a relative data directory path
			if (path.startsWith(this.#livinityd.dataDirectory)) path = nodePath.relative(this.#livinityd.dataDirectory, path)
			// All paths should now be relative to the data directory which is the backup root,
			// prepend a `/` to make these absolute paths from from the backup root from kopia's perspective
			if (!path.startsWith('/')) path = `/${path}`
			return path
		}
		ignoreFileContents = ignoreFileContents.map(toBackupRootPath)

		// Phase 368.5 gate — the two things inside dataDirectory big enough to fill
		// the system disk on their own. Browser caches go unconditionally (pure
		// regenerable bulk); VM disk images follow the operator's scope toggle,
		// default OFF. Without these an hourly local safety repo can fill a small
		// system disk and take Postgres and Docker down with it, which is exactly
		// why Safety Snapshots could not ship to stable before now.
		ignoreFileContents.push(...scopeExclusionPatterns(await this.getBackupScope().catch(() => DEFAULT_BACKUP_SCOPE)))

		// Phase 368.6 (D6) — self-referential-snapshot belts. Pushed AFTER the
		// mapping above (the mapper `/`-prefixes any entry lacking one, which would
		// anchor the depth-agnostic name pattern at the backup root) and OUTSIDE the
		// per-path try/catch (which swallows failures and would otherwise let a
		// backup proceed with no protection at all).
		ignoreFileContents.push(
			...repositoryIgnorePatterns(await this.getRepositories(), {
				toBackupRootPath,
				repositoryDirectoryName: this.backupDirectoryName,
			}),
		)

		// NOTE: /Pool is deliberately NOT added to alwaysIgnoredPaths. /mnt/pool is
		// outside dataDirectory, so the mapper would emit a rule kopia reads as
		// `${dataDirectory}/mnt/pool` — a silent no-op that only looks like safety.
		// `--one-file-system=true` on the snapshot is what actually stops the walk.

		// Write the file atomically
		const temporaryIgnoreFilePath = `${ignoreFilePath}.${randomToken(32)}`
		await fse.writeFile(temporaryIgnoreFilePath, ignoreFileContents.join('\n'))
		await fse.move(temporaryIgnoreFilePath, ignoreFilePath, {overwrite: true})
	}

	// List backups
	async listBackups(repositoryId: string) {
		const repository = await this.getRepository(repositoryId)
		this.logger.log(`Listing backups for ${repository.path}`)

		// Dump all snapshots in JSON format
		const snapshots = await this.repository(repository.id, ['snapshot', 'list', '--json'])

		// Parse the JSON output
		const snapshotsParsed = JSON.parse(snapshots.stdout)

		// Create typed backup object from snapshot output with composite IDs
		const backups: Backup[] = []
		for (const snapshot of snapshotsParsed) {
			backups.push({
				id: `${repositoryId}:${snapshot.id}`,
				time: new Date(snapshot.startTime).getTime(),
				size: Number(snapshot.stats.totalSize),
			})
		}

		// Sort by time ascending
		return backups.sort((a, b) => a.time - b.time)
	}

	// List all backups
	async listAllBackups() {
		const repositories = await this.getRepositories()
		const backups: Backup[] = []
		await Promise.all(
			repositories.map(async (repository) => {
				const repositoryBackups = await this.listBackups(repository.id).catch((error) => {
					// If we can't list backups for a repository don't kill the whole backup list
					this.logger.error(`Failed to list backups for ${repository.id}`, error)
					return []
				})
				backups.push(...repositoryBackups)
			}),
		)

		// Sort by time ascending
		return backups.sort((a, b) => a.time - b.time)
	}

	// Parse a backup id into its repository id and snapshot id
	parseBackupId(backupId: string) {
		const [repositoryId, snapshotId] = backupId.split(':')
		return {repositoryId, snapshotId}
	}

	// Get a specific backup by id
	async getBackup(backupId: string) {
		const {repositoryId} = this.parseBackupId(backupId)
		const backups = await this.listBackups(repositoryId)
		const backup = backups.find((backup) => backup.id === backupId)
		if (!backup) throw new Error(`[not-found] Backup ${backupId} not found`)
		return backup
	}

	// List the files in a backup
	// Note: you can append a path to a backup id to traverse the fs
	async listBackupFiles(backupId: string, path = '/') {
		const {repositoryId, snapshotId} = this.parseBackupId(backupId)
		const ls = await this.repository(repositoryId, ['ls', `${snapshotId}${path}`])
		return ls.stdout.split('\n')
	}

	// Mount backup
	async mountBackup(backupId: string) {
		await this.ensureEngine()
		const {repositoryId, snapshotId} = this.parseBackupId(backupId)

		// Get the backup time for directory naming
		const backup = await this.getBackup(backupId)
		if (!backup) throw new Error(`Backup ${backupId} not found`)

		this.logger.log(`Mounting backup ${backupId}`)

		this.logger.verbose(`Setting up internal mount`)
		const directoryName = new Date(backup.time).toISOString()
		const internalMountpoint = nodePath.join(this.internalMountPath, directoryName)
		await fse.mkdir(internalMountpoint, {recursive: true})
		let mountProcessExitCode = null
		this.repository(repositoryId, ['mount', snapshotId, internalMountpoint], {bypassQueue: true})
			.then((process) => (mountProcessExitCode = process.exitCode))
			.catch((error) => {
				this.logger.error(`Failed to mount backup ${backupId}`, error)
				mountProcessExitCode = (error as ExecaError).exitCode
			})

		// Wait for the mount to complete
		const startTime = Date.now()
		const timeout = 10_000 // 10 seconds
		while (true) {
			// Check timeout
			if (Date.now() - startTime > timeout) throw new Error(`Mount timeout after ${timeout}ms`)

			// Check if process has exited
			if (mountProcessExitCode !== null) throw new Error(`Mount exited with code ${mountProcessExitCode}`)

			// Check if mountpoint has contents
			const contents = await fse.readdir(internalMountpoint).catch(() => [])
			if (contents.length > 0) break // Mount complete

			// Wait a bit before checking again
			await setTimeout(100)
		}
		this.logger.verbose(`Internal mount complete`)

		this.logger.verbose(`Setting up virtual filesystem mounts`)
		const backupRoot = nodePath.join(this.backupRoot, directoryName)
		const homeMount = nodePath.join(backupRoot, 'Home')
		const appsMount = nodePath.join(backupRoot, 'Apps')
		await fse.mkdir(homeMount, {recursive: true})
		await fse.mkdir(appsMount, {recursive: true})
		await execa('mount', ['--bind', nodePath.join(internalMountpoint, 'home'), homeMount])
		await execa('mount', ['--bind', nodePath.join(internalMountpoint, 'app-data'), appsMount])
		this.logger.log(`Virtual filesystem mount complete`)

		return directoryName
	}

	// Unmount a backup
	// We use the directory name here because we may not have the full backup object if we're cleaning up
	async unmountBackup(directoryName: string) {
		this.logger.log(`Unmounting backup ${directoryName}`)

		// Unmount virtual filesystem mounts
		const backupRoot = nodePath.join(this.backupRoot, directoryName)
		const homeMount = nodePath.join(backupRoot, 'Home')
		const appsMount = nodePath.join(backupRoot, 'Apps')
		await execa('umount', [homeMount]).catch((error) =>
			this.logger.error(`Failed to unmount ${homeMount}: ${error.message}`),
		)
		await execa('umount', [appsMount]).catch((error) =>
			this.logger.error(`Failed to unmount ${appsMount}: ${error.message}`),
		)
		await fse.remove(backupRoot).catch((error) => this.logger.error(`Failed to remove ${backupRoot}: ${error.message}`))

		// Unmount internal mount
		const internalMountpoint = nodePath.join(this.internalMountPath, directoryName)
		await execa('umount', [internalMountpoint]).catch((error) =>
			this.logger.error(`Failed to unmount ${internalMountpoint}: ${error.message}`),
		)
		await fse
			.remove(internalMountpoint)
			.catch((error) => this.logger.error(`Failed to remove ${internalMountpoint}: ${error.message}`))

		this.logger.log(`Unmounted backup ${directoryName}`)
		return true
	}

	// Check if we have any backups mounted and unmount them
	async unmountAll(): Promise<void> {
		// List current backups mounted in the virtual filesystem
		const backups = await fse.readdir(this.backupRoot).catch(() => [])

		// Unmount each backup
		await Promise.all(
			backups.map((backup) =>
				this.unmountBackup(backup).catch((error) => this.logger.error(`Failed to unmount ${backup}: ${error.message}`)),
			),
		)

		// We should now have no backups mounted but just incase we somehow have an internal backup mounted
		// without a virtual filesystem mount we check for internal mount directories too
		const internalMounts = await fse.readdir(this.internalMountPath).catch(() => [])
		await Promise.all(
			internalMounts.map((internalMount) =>
				this.unmountBackup(internalMount).catch((error) =>
					this.logger.error(`Failed to unmount ${internalMount}: ${error.message}`),
				),
			),
		)
	}
}
