import {randomBytes} from 'node:crypto'

/**
 * Phase 368.5 BKP-16 (AD-4) — system-managed local Safety Snapshots.
 *
 * The box protects itself against MISTAKES out of the box: a kopia filesystem
 * repo on the internal disk, default ON, joined to the existing hourly
 * interval, aggressively thinned, and disk-pressure-guarded so it can never
 * fill the system disk. This module holds the pure decision logic:
 *
 *   - retentionFlagsFor(): per-repository retention selector. Safety thinning
 *     is a DIFFERENT flag set from user repos; backups.ts applies it through
 *     repository()'s per-repo --config-file, which scopes kopia's
 *     `policy set --global` to that one repo — so safety thinning provably
 *     cannot leak onto USB/SMB repos (and vice versa).
 *   - ensureSafetyRepository(): idempotent create/reconnect lifecycle for the
 *     fixed-path safety repo. This is the sanctioned INTERNAL create path —
 *     the public addRepository() /External-/Network validation stays the
 *     security boundary for user-chosen destinations and is never touched.
 *   - evaluateDiskPressure(): <15% free ⇒ thin + maintain first; still <15%
 *     ⇒ SKIP with a logged reason. A skip is not an error state (no
 *     notification, no RED) — the next interval retries.
 *
 * All deps are injected (backup-preflight.ts idiom): pure exported functions,
 * never-throws orchestration, unit-testable with plain fakes — no mocks, no
 * fs/process imports (only node:crypto for password generation).
 */

export const SAFETY_REPO_ID = 'local-safety'
// OUTSIDE dataDirectory (/opt/livos/data) so the safety repo is naturally
// excluded from its own snapshot scope (snapshot source is dataDirectory
// only — see backup()).
export const SAFETY_REPO_PATH = '/opt/livos/backups-local'
export const SAFETY_PASSWORD_FILENAME = 'backup-safety-repo-password'
export const SAFETY_MIN_FREE_PERCENT = 15

// Aggressive thinning for the local safety repo (CONTEXT lock: ≈24 hourly +
// 7 daily + small keep-latest floor). Applied per-repository via
// repository()'s per-repo --config-file — this is WHY safety thinning cannot
// leak onto USB/SMB repos (the backups.ts "global policy" is
// global-within-one-repo in kopia terms).
export const SAFETY_RETENTION_FLAGS = [
	'--keep-latest=3',
	'--keep-hourly=24',
	'--keep-daily=7',
	'--keep-weekly=0',
	'--keep-monthly=0',
	'--keep-annual=0',
]
// Byte-identical to the values shipped in backup() today — regression-pinned
// by test. User-repo retention MUST NOT change.
export const USER_RETENTION_FLAGS = [
	'--keep-latest=10',
	'--keep-hourly=24',
	'--keep-daily=7',
	'--keep-weekly=4',
	'--keep-monthly=12',
	'--keep-annual=0',
]

export function retentionFlagsFor(repository: {isSafety?: boolean}): string[] {
	return repository.isSafety ? SAFETY_RETENTION_FLAGS : USER_RETENTION_FLAGS
}

export type EnsureSafetyResult = 'created' | 'reconnected' | 'exists' | 'disabled' | 'error'

export type EnsureSafetyDeps = {
	isDisabled: () => Promise<boolean>
	getRepositories: () => Promise<Array<{id: string; isSafety?: boolean}>>
	registerRepository: (row: {id: string; path: string; password: string; isSafety: true}) => Promise<void>
	readPassword: () => Promise<string | undefined>
	writePassword: (password: string) => Promise<void>
	ensureRepoDir: () => Promise<void>
	repoDirHasRepository: () => Promise<boolean>
	createKopiaRepository: (password: string) => Promise<void>
	connectKopiaRepository: (password: string) => Promise<void>
	log: (message: string) => void
	error: (message: string, error?: unknown) => void
}

/**
 * Idempotent safety-repo lifecycle. Runs at boot and every interval tick, so
 * the 'exists' fast path (one store read) must stay cheap and silent. The
 * password is persisted BEFORE any kopia call — a crash between the two
 * leaves the password recoverable, and an existing password file is always
 * reused (recovery from a partial previous run). NEVER throws.
 */
export async function ensureSafetyRepository(deps: EnsureSafetyDeps): Promise<EnsureSafetyResult> {
	try {
		if (await deps.isDisabled()) {
			deps.log('Safety snapshots disabled by opt-out — skipping auto-create')
			return 'disabled'
		}

		// Fast idempotent path — silent, this runs every interval.
		const repositories = await deps.getRepositories()
		if (repositories.some((repository) => repository.isSafety || repository.id === SAFETY_REPO_ID)) return 'exists'

		await deps.ensureRepoDir()

		// 256-bit full-strength random (AD-9 spirit) — deliberately NOT the
		// sha256-truncate scheme used for user-entered passwords.
		const existing = await deps.readPassword()
		const password = existing ?? randomBytes(32).toString('hex')
		if (!existing) await deps.writePassword(password)

		const orphan = await deps.repoDirHasRepository()
		if (orphan && !existing) {
			deps.error(
				'Safety repo exists on disk but its password file is missing — cannot reconnect (reclaim UX is Phase 370)',
			)
			return 'error'
		}

		if (orphan) {
			await deps.connectKopiaRepository(password)
			await deps.registerRepository({id: SAFETY_REPO_ID, path: SAFETY_REPO_PATH, password, isSafety: true})
			deps.log(`Safety repo reconnected (repo: ${SAFETY_REPO_ID}, path: ${SAFETY_REPO_PATH})`)
			return 'reconnected'
		}

		await deps.createKopiaRepository(password)
		await deps.registerRepository({id: SAFETY_REPO_ID, path: SAFETY_REPO_PATH, password, isSafety: true})
		deps.log(`Safety repo created (repo: ${SAFETY_REPO_ID}, path: ${SAFETY_REPO_PATH})`)
		return 'created'
	} catch (error) {
		deps.error('Safety repo ensure failed', error)
		return 'error'
	}
}

export type DiskPressureDecision = 'proceed' | 'skip'

export type DiskPressureDeps = {
	getDiskUsage: () => Promise<{size: number; available: number}>
	runRetentionAndMaintenance: () => Promise<void>
	log: (message: string) => void
	error: (message: string, error?: unknown) => void
}

/**
 * Guard before each safety run: a safety backup must never fill the system
 * disk. <15% free ⇒ thin (snapshot expire) + maintain first, then re-probe;
 * still <15% ⇒ SKIP with a logged reason. A probe failure fails SAFE (skip) —
 * if the guard cannot verify space it must not risk filling the disk. A skip
 * is not an error state: no notification, no RED, next interval retries.
 */
export async function evaluateDiskPressure(deps: DiskPressureDeps): Promise<DiskPressureDecision> {
	const freePercent = (usage: {size: number; available: number}) =>
		usage.size > 0 ? (usage.available / usage.size) * 100 : 100

	let pct: number
	try {
		pct = freePercent(await deps.getDiskUsage())
	} catch (error) {
		deps.error('Disk usage probe failed — skipping safety snapshot (fail-safe)', error)
		return 'skip'
	}
	if (pct >= SAFETY_MIN_FREE_PERCENT) return 'proceed'

	deps.log(
		`Disk pressure: ${pct.toFixed(1)}% free (<${SAFETY_MIN_FREE_PERCENT}%) — running retention + maintenance before safety snapshot`,
	)
	await deps
		.runRetentionAndMaintenance()
		.catch((error) => deps.error('Retention/maintenance under disk pressure failed', error))

	let pct2: number
	try {
		pct2 = freePercent(await deps.getDiskUsage())
	} catch (error) {
		deps.error('Disk usage probe failed — skipping safety snapshot (fail-safe)', error)
		return 'skip'
	}
	if (pct2 >= SAFETY_MIN_FREE_PERCENT) {
		deps.log(`Disk pressure relieved: ${pct2.toFixed(1)}% free — proceeding with safety snapshot`)
		return 'proceed'
	}
	deps.log(
		`Safety snapshot SKIPPED: ${pct2.toFixed(1)}% free after maintenance (<${SAFETY_MIN_FREE_PERCENT}%) — will retry next interval`,
	)
	return 'skip'
}
