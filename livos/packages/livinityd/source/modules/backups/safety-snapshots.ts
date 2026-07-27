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

// ── Phase 368.8-22 — how many safety snapshots to keep ───────────────────────
//
// Operator: "atıyorum 3 tane kayıt etsin dediğimde en sonuncuyu kayıt ederken
// en sondakini silsin".
//
// SAFETY-ONLY, exactly like the interval. USER_RETENTION_FLAGS must not move —
// it is regression-pinned byte-for-byte, and changing what a USB or NAS keeps
// would be a data-retention change nobody asked for.
//
// 'smart' is the DEFAULT and is byte-identical to what shipped before, so an
// absent store field changes nothing on an existing box.
//
// The numeric options are deliberately not just `--keep-latest=N`: kopia keeps
// the UNION of every rule, so leaving --keep-hourly=24 in place while asking for
// "keep 3" would keep 24. To mean three, every other rule has to be zero — and
// saying "3" while keeping 24 is precisely the kind of quiet lie this phase has
// spent itself removing.
export const SAFETY_RETENTION_OPTIONS = ['smart', '3', '5', '10', '24'] as const
export type SafetyRetentionOption = (typeof SAFETY_RETENTION_OPTIONS)[number]

export const DEFAULT_SAFETY_RETENTION: SafetyRetentionOption = 'smart'

export function isSafetyRetentionOption(value: unknown): value is SafetyRetentionOption {
	return typeof value === 'string' && (SAFETY_RETENTION_OPTIONS as readonly string[]).includes(value)
}

/** Fail SAFE: anything unrecognised means 'smart', i.e. the shipped behaviour. */
export function safetyRetentionFlags(value: unknown): string[] {
	const option = isSafetyRetentionOption(value) ? value : DEFAULT_SAFETY_RETENTION
	if (option === 'smart') return SAFETY_RETENTION_FLAGS
	return [
		`--keep-latest=${option}`,
		'--keep-hourly=0',
		'--keep-daily=0',
		'--keep-weekly=0',
		'--keep-monthly=0',
		'--keep-annual=0',
	]
}

export function retentionFlagsFor(repository: {isSafety?: boolean}, safetyRetention?: unknown): string[] {
	if (!repository.isSafety) return USER_RETENTION_FLAGS
	// Omitted argument = the shipped flags, so every existing caller is unchanged.
	return safetyRetention === undefined ? SAFETY_RETENTION_FLAGS : safetyRetentionFlags(safetyRetention)
}

export type EnsureSafetyResult = 'created' | 'reconnected' | 'exists' | 'disabled' | 'error'

// IN-02: tri-state dir probe. 'repository' = kopia marker present (orphan
// reconnect path); 'empty' = safe to create; 'foreign' = non-empty WITHOUT a
// kopia marker — a stray file (lost+found, editor droppings) must not send us
// into an unrecoverable hourly connect-error loop, and `repository create`
// would refuse the non-empty dir anyway. Foreign ⇒ warn + skip, NEVER delete.
export type SafetyRepoDirState = 'repository' | 'empty' | 'foreign'

export type EnsureSafetyDeps = {
	isDisabled: () => Promise<boolean>
	getRepositories: () => Promise<Array<{id: string; isSafety?: boolean}>>
	registerRepository: (row: {id: string; path: string; password: string; isSafety: true}) => Promise<void>
	readPassword: () => Promise<string | undefined>
	writePassword: (password: string) => Promise<void>
	ensureRepoDir: () => Promise<void>
	repoDirState: () => Promise<SafetyRepoDirState>
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

		const dirState = await deps.repoDirState()
		if (dirState === 'foreign') {
			// Non-destructive by contract: we never delete or overwrite unknown
			// files. Without this guard a stray file would loop create/connect
			// errors every hour forever with no self-heal.
			deps.error(
				`Safety repo dir ${SAFETY_REPO_PATH} is non-empty but contains no kopia repository marker — ` +
					'skipping safety repo creation (never destructive); remove the foreign files to enable safety snapshots',
			)
			return 'error'
		}
		const orphan = dirState === 'repository'
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

/**
 * Phase 368.5 gate — the mid-run floor.
 *
 * evaluateDiskPressure only guards the START of a run. A snapshot that begins
 * with 16% free can still write the disk to zero on its way through, and on this
 * box that does not mean "the backup failed" — it means Postgres and Docker go
 * down with it. This floor is deliberately LOWER than SAFETY_MIN_FREE_PERCENT:
 * crossing 15% mid-run is normal for a large first snapshot, crossing 5% is an
 * emergency.
 */
export const DISK_ABORT_FREE_PERCENT = 5

/** Percentage free, or null when the reading is missing or degenerate. */
export function freePercentOf(usage: {size: number; available: number}): number | null {
	return Number.isFinite(usage.size) && Number.isFinite(usage.available) && usage.size > 0
		? (usage.available / usage.size) * 100
		: null
}

/**
 * Whether an in-flight snapshot must be killed to protect the system disk.
 *
 * Note the ASYMMETRY with the pre-flight guard, which is deliberate: an
 * unreadable probe BEFORE a run means "don't start" (cheap, retried next hour),
 * but an unreadable probe DURING a run must NOT abort. The pre-flight already
 * proved there was room, a df hiccup is usually transient, and aborting on it
 * would make a box with a flaky probe never complete a backup at all. Unknown ⇒
 * keep going and log it.
 */
export function shouldAbortForDiskPressure(
	usage: {size: number; available: number},
	floorPercent: number = DISK_ABORT_FREE_PERCENT,
): boolean {
	const percent = freePercentOf(usage)
	if (percent === null) return false
	return percent < floorPercent
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
	// IN-04: a probe that RETURNS degenerate values (size 0, NaN, Infinity) must
	// fail SAFE exactly like a probe that throws — null ⇒ skip. Never treat an
	// unverifiable disk as 100% free.
	const freePercent = (usage: {size: number; available: number}): number | null =>
		Number.isFinite(usage.size) && Number.isFinite(usage.available) && usage.size > 0
			? (usage.available / usage.size) * 100
			: null

	let pct: number | null
	try {
		pct = freePercent(await deps.getDiskUsage())
	} catch (error) {
		deps.error('Disk usage probe failed — skipping safety snapshot (fail-safe)', error)
		return 'skip'
	}
	if (pct === null) {
		deps.error('Disk usage probe returned degenerate values — skipping safety snapshot (fail-safe)')
		return 'skip'
	}
	if (pct >= SAFETY_MIN_FREE_PERCENT) return 'proceed'

	deps.log(
		`Disk pressure: ${pct.toFixed(1)}% free (<${SAFETY_MIN_FREE_PERCENT}%) — running retention + maintenance before safety snapshot`,
	)
	await deps
		.runRetentionAndMaintenance()
		.catch((error) => deps.error('Retention/maintenance under disk pressure failed', error))

	let pct2: number | null
	try {
		pct2 = freePercent(await deps.getDiskUsage())
	} catch (error) {
		deps.error('Disk usage probe failed — skipping safety snapshot (fail-safe)', error)
		return 'skip'
	}
	if (pct2 === null) {
		deps.error('Disk usage probe returned degenerate values — skipping safety snapshot (fail-safe)')
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

// ── Phase 368.8 SAFE-02 / OP-01 — safety snapshot cadence ────────────────────
//
// SAFETY-ONLY. `backups.ts backupInterval` still governs every user destination
// and must not change: a global change would silently alter USB/NAS cadence,
// which the operator explicitly ruled out. Pure arithmetic lives here so the
// scheduler's behaviour is unit-testable without a livinityd, a clock or a disk.

export const SAFETY_INTERVAL_OPTIONS = ['30m', '1h', '6h', 'daily'] as const
export type SafetyIntervalOption = (typeof SAFETY_INTERVAL_OPTIONS)[number]

/** Absent store field = this. Byte-identical to the cadence shipped before 368.8. */
export const DEFAULT_SAFETY_INTERVAL: SafetyIntervalOption = '1h'

const MINUTE_MS = 1000 * 60
const SAFETY_INTERVAL_MS: Record<SafetyIntervalOption, number> = {
	'30m': 30 * MINUTE_MS,
	'1h': 60 * MINUTE_MS,
	'6h': 6 * 60 * MINUTE_MS,
	daily: 24 * 60 * MINUTE_MS,
}

export function isSafetyIntervalOption(value: unknown): value is SafetyIntervalOption {
	return typeof value === 'string' && (SAFETY_INTERVAL_OPTIONS as readonly string[]).includes(value)
}

/** Fail SAFE: anything unrecognised (absent, stale, hand-edited store) means the default. */
export function safetyIntervalMs(value: unknown): number {
	return SAFETY_INTERVAL_MS[isSafetyIntervalOption(value) ? value : DEFAULT_SAFETY_INTERVAL]
}

/**
 * How often the outer scheduler must WAKE. The loop body only runs on a tick, so
 * the tick is a floor on resolution: with a 1-hour tick a "30 minutes" setting
 * silently behaves as 60. Never slower than backupInterval, so user destinations
 * cannot be delayed by a long safety interval.
 */
export function schedulerTickMs(safetyMs: number, backupMs: number): number {
	return Math.min(safetyMs, backupMs)
}

/**
 * Per-CLASS due check. Two cursors: a safety run must never advance the user
 * cursor (that would DELAY user destinations) and a user run must never advance
 * the safety cursor (that would SKIP safety snapshots).
 */
export function isRepositoryDue(input: {
	isSafety?: boolean
	now: number
	lastSafetyRun: number
	lastUserRun: number
	safetyMs: number
	backupMs: number
}): boolean {
	return input.isSafety
		? input.now - input.lastSafetyRun >= input.safetyMs
		: input.now - input.lastUserRun >= input.backupMs
}
