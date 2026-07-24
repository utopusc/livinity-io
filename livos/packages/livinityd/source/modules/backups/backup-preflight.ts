import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * Phase 368 BKP-03 (AD-3.4 layer a) — boot preflight recovering from an
 * interrupted backup. MUST run before apps.cleanDockerState(): docker stop
 * against a paused (cgroup-frozen) container can hang indefinitely
 * (moby#41579), stalling the whole boot.
 *
 * Three independent, individually-fault-isolated steps:
 *   1. Unpause any app container a prior interrupted backup left paused
 *      (groundwork for Phase 369's pause-fallback hooks — nothing pauses
 *      containers today, so this is latent-risk defense until then).
 *   2. Sweep stale `*.tmp` staging debris. Guarded no-op while the Phase 369
 *      staging pipeline doesn't exist yet — activates automatically once the
 *      staging dir appears.
 *   3. Flip a stale 'running' run record (process died mid-backup) to
 *      'failed' so a crashed run can never silently look successful.
 *      Internal state + log line ONLY — deliberately no notification (the
 *      existing backups-engine-unavailable / backups-failing:<repo> pair
 *      covers the user-visible failure modes).
 *
 * All deps are injected (no direct docker/store imports) so the module stays
 * unit-testable without mocks and free of boot-order import side effects.
 */

export type PreflightLogger = {
	log: (message: string) => void
	error: (message: string, error?: unknown) => void
}

export type LastRunStatus = {
	startedAt: number
	status: 'running' | 'success' | 'failed'
	repositoryId: string
}

export type PreflightDeps = {
	listContainers: () => Promise<Array<{name: string; state: string}>>
	unpause: (name: string) => Promise<unknown>
	stagingDirectory: string
	getLastRunStatus: () => Promise<LastRunStatus | undefined>
	setLastRunStatus: (status: LastRunStatus) => Promise<unknown>
	logger: PreflightLogger
}

/**
 * Unpause every container Docker reports as 'paused'. One container
 * failing to unpause must not strand the rest, and a dead Docker socket must
 * not throw out of the preflight. Returns the count of successful unpauses.
 */
export async function unpauseStrandedContainers({
	listContainers,
	unpause,
	logger,
}: Pick<PreflightDeps, 'listContainers' | 'unpause' | 'logger'>): Promise<number> {
	let containers: Array<{name: string; state: string}>
	try {
		containers = await listContainers()
	} catch (error) {
		logger.error('[backup-preflight] failed to list containers', error)
		return 0
	}

	let unpaused = 0
	for (const container of containers) {
		if (container.state !== 'paused') continue
		try {
			await unpause(container.name)
			unpaused++
			logger.log(`[backup-preflight] unpaused stranded container: ${container.name}`)
		} catch (error) {
			logger.error(`[backup-preflight] failed to unpause ${container.name}`, error)
		}
	}
	return unpaused
}

/**
 * Remove every direct child of the staging dir whose name ends `.tmp`
 * (file OR directory — Phase 369 stages volume copies as dirs). Missing
 * staging dir ⇒ silent no-op (the staging pipeline doesn't exist yet).
 * Returns the count of removed entries.
 */
export async function cleanStaleStaging(stagingDirectory: string, logger: PreflightLogger): Promise<number> {
	// Guarded no-op: the Phase 369 staging pipeline hasn't created this dir yet.
	const stats = await fs.stat(stagingDirectory).catch(() => undefined)
	if (!stats?.isDirectory()) return 0

	const entries = await fs.readdir(stagingDirectory, {withFileTypes: true})
	let removed = 0
	for (const entry of entries) {
		if (!entry.name.endsWith('.tmp')) continue
		try {
			await fs.rm(path.join(stagingDirectory, entry.name), {recursive: true, force: true})
			removed++
			logger.log(`[backup-preflight] removed stale staging entry: ${entry.name}`)
		} catch (error) {
			logger.error(`[backup-preflight] failed to remove stale staging entry ${entry.name}`, error)
		}
	}
	return removed
}

/**
 * If the last recorded run is still 'running' the previous process died
 * mid-backup — flip it to 'failed' (preserving startedAt + repositoryId) so
 * run history never lies. Log line only, NO notification by design.
 * Returns true when a stale run was recovered.
 */
export async function recoverInterruptedRun({
	getLastRunStatus,
	setLastRunStatus,
	logger,
}: Pick<PreflightDeps, 'getLastRunStatus' | 'setLastRunStatus' | 'logger'>): Promise<boolean> {
	const status = await getLastRunStatus()
	if (status?.status !== 'running') return false
	await setLastRunStatus({...status, status: 'failed'})
	logger.log(
		`[backup-preflight] previous backup run (repository ${status.repositoryId}) was interrupted — marking FAILED in run history`,
	)
	return true
}

/**
 * Writer-side counterpart to recoverInterruptedRun (MD-01): the terminal
 * run-history write in backup()'s finally MUST be a compare-and-set.
 * `lastRunStatus` is one shared key and backup() runs can overlap (a manual
 * tRPC backup of repo B during the interval's backup of repo A — the
 * isAlreadyBackingUp guard only dedupes the same repository). A finishing run
 * may only write its terminal state while the stored record is still its OWN
 * record — otherwise a concurrent run has since taken the key, and clobbering
 * its 'running' record would let that run's crash silently look successful.
 * Returns true when the terminal state was written.
 */
export async function writeTerminalRunStatus({
	getStored,
	setStored,
	run,
}: {
	getStored: () => Promise<LastRunStatus | undefined>
	setStored: (status: LastRunStatus) => Promise<unknown>
	run: LastRunStatus
}): Promise<boolean> {
	const stored = await getStored()
	if (stored?.startedAt !== run.startedAt || stored?.repositoryId !== run.repositoryId) return false
	await setStored(run)
	return true
}

/**
 * Run the three preflight steps in order. Every step is individually
 * fault-isolated and this orchestrator itself NEVER throws — preflight
 * problems must never block boot.
 */
export async function runBackupPreflight(deps: PreflightDeps): Promise<void> {
	const {stagingDirectory, logger} = deps
	try {
		await unpauseStrandedContainers(deps)
	} catch (error) {
		logger.error('[backup-preflight] unpause step threw', error)
	}
	try {
		await cleanStaleStaging(stagingDirectory, logger)
	} catch (error) {
		logger.error('[backup-preflight] staging sweep threw', error)
	}
	try {
		await recoverInterruptedRun(deps)
	} catch (error) {
		logger.error('[backup-preflight] run-history recovery threw', error)
	}
}
