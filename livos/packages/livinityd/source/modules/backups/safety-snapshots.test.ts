import {expect, test} from 'vitest'

import {
	ensureSafetyRepository,
	evaluateDiskPressure,
	retentionFlagsFor,
	SAFETY_MIN_FREE_PERCENT,
	DISK_ABORT_FREE_PERCENT,
	shouldAbortForDiskPressure,
	freePercentOf,
	SAFETY_REPO_ID,
	SAFETY_REPO_PATH,
	SAFETY_RETENTION_FLAGS,
	USER_RETENTION_FLAGS,
	SAFETY_INTERVAL_OPTIONS,
	DEFAULT_SAFETY_INTERVAL,
	safetyIntervalMs,
	schedulerTickMs,
	isRepositoryDue,
	type DiskPressureDeps,
	type EnsureSafetyDeps,
} from './safety-snapshots.js'
import {DEFAULT_BACKUP_SCOPE, scopeExclusionPatterns} from './system-state.js'

// ── retentionFlagsFor (Phase 368.5 BKP-16 — the non-leak proof) ──────────

test('retentionFlagsFor({isSafety: true}) returns the aggressive safety flag set', () => {
	const flags = retentionFlagsFor({isSafety: true})
	expect(flags).toBe(SAFETY_RETENTION_FLAGS)
	expect(flags).toContain('--keep-weekly=0')
	expect(flags).toContain('--keep-monthly=0')
	expect(flags).toContain('--keep-annual=0')
	expect(flags).toContain('--keep-latest=3')
	expect(flags).toContain('--keep-hourly=24')
	expect(flags).toContain('--keep-daily=7')
})

test('retentionFlagsFor for user repos is byte-equal to the currently-shipped values (regression pin)', () => {
	// User-repo retention MUST NOT change — these are the exact values shipped
	// in backup() today. If this test fails, user retention regressed.
	const shipped = [
		'--keep-latest=10',
		'--keep-hourly=24',
		'--keep-daily=7',
		'--keep-weekly=4',
		'--keep-monthly=12',
		'--keep-annual=0',
	]
	expect(retentionFlagsFor({})).toBe(USER_RETENTION_FLAGS)
	expect(retentionFlagsFor({isSafety: false})).toBe(USER_RETENTION_FLAGS)
	expect(USER_RETENTION_FLAGS).toEqual(shipped)
})

test('safety retention is disjoint from user retention (thinning cannot leak)', () => {
	// backups.ts applies these per-repo via repository()'s per-repo
	// --config-file, so a DIFFERENT flag set here is the non-leak proof.
	expect(retentionFlagsFor({isSafety: true})).not.toEqual(retentionFlagsFor({}))
})

// ── ensureSafetyRepository ───────────────────────────────────────────────

type EnsureCalls = {
	created: string[]
	connected: string[]
	registered: Array<{id: string; path: string; password: string; isSafety: true}>
	written: string[]
	logs: string[]
	errors: string[]
}

function makeEnsureDeps(overrides: Partial<EnsureSafetyDeps> = {}): {deps: EnsureSafetyDeps; calls: EnsureCalls} {
	const calls: EnsureCalls = {created: [], connected: [], registered: [], written: [], logs: [], errors: []}
	const deps: EnsureSafetyDeps = {
		isDisabled: async () => false,
		getRepositories: async () => [],
		registerRepository: async (row) => {
			calls.registered.push(row)
		},
		readPassword: async () => undefined,
		writePassword: async (password) => {
			calls.written.push(password)
		},
		ensureRepoDir: async () => {},
		repoDirState: async () => 'empty',
		createKopiaRepository: async (password) => {
			calls.created.push(password)
		},
		connectKopiaRepository: async (password) => {
			calls.connected.push(password)
		},
		log: (message) => calls.logs.push(message),
		error: (message) => calls.errors.push(message),
		...overrides,
	}
	return {deps, calls}
}

test('ensureSafetyRepository: opt-out → disabled, no kopia or register calls, logged', async () => {
	const {deps, calls} = makeEnsureDeps({isDisabled: async () => true})
	const result = await ensureSafetyRepository(deps)
	expect(result).toBe('disabled')
	expect(calls.created).toEqual([])
	expect(calls.connected).toEqual([])
	expect(calls.registered).toEqual([])
	expect(calls.logs.some((message) => message.includes('disabled'))).toBe(true)
})

test('ensureSafetyRepository: safety repo already registered → exists fast path, zero kopia/register calls', async () => {
	const {deps, calls} = makeEnsureDeps({
		getRepositories: async () => [{id: SAFETY_REPO_ID, isSafety: true}],
	})
	const result = await ensureSafetyRepository(deps)
	expect(result).toBe('exists')
	expect(calls.created).toEqual([])
	expect(calls.connected).toEqual([])
	expect(calls.registered).toEqual([])
})

test('ensureSafetyRepository fresh path → created: password written BEFORE create, 64-hex, registered with isSafety', async () => {
	const order: string[] = []
	const {deps, calls} = makeEnsureDeps()
	const baseWrite = deps.writePassword
	const baseCreate = deps.createKopiaRepository
	deps.writePassword = async (password) => {
		order.push('write')
		await baseWrite(password)
	}
	deps.createKopiaRepository = async (password) => {
		order.push('create')
		await baseCreate(password)
	}

	const result = await ensureSafetyRepository(deps)

	expect(result).toBe('created')
	// Crash between write and create leaves the password recoverable.
	expect(order).toEqual(['write', 'create'])
	// Full-strength 256-bit random password (64 hex chars).
	expect(calls.written).toHaveLength(1)
	expect(calls.written[0]).toMatch(/^[0-9a-f]{64}$/)
	expect(calls.created).toEqual([calls.written[0]])
	expect(calls.registered).toEqual([
		{id: SAFETY_REPO_ID, path: SAFETY_REPO_PATH, password: calls.written[0], isSafety: true},
	])
	expect(calls.logs.some((message) => message.includes('created'))).toBe(true)
})

test('ensureSafetyRepository: existing password file is REUSED (no new generation, no rewrite)', async () => {
	const existing = 'a'.repeat(64)
	const {deps, calls} = makeEnsureDeps({readPassword: async () => existing})
	const result = await ensureSafetyRepository(deps)
	expect(result).toBe('created')
	expect(calls.written).toEqual([])
	expect(calls.created).toEqual([existing])
	expect(calls.registered[0]?.password).toBe(existing)
})

test('ensureSafetyRepository orphan path → connect (NOT create), registered, reconnected logged', async () => {
	const existing = 'b'.repeat(64)
	const {deps, calls} = makeEnsureDeps({
		readPassword: async () => existing,
		repoDirState: async () => 'repository',
	})
	const result = await ensureSafetyRepository(deps)
	expect(result).toBe('reconnected')
	expect(calls.connected).toEqual([existing])
	expect(calls.created).toEqual([])
	expect(calls.registered).toEqual([{id: SAFETY_REPO_ID, path: SAFETY_REPO_PATH, password: existing, isSafety: true}])
	expect(calls.logs.some((message) => message.includes('reconnected'))).toBe(true)
})

test('ensureSafetyRepository orphan WITHOUT password → error, not registered', async () => {
	const {deps, calls} = makeEnsureDeps({
		readPassword: async () => undefined,
		repoDirState: async () => 'repository',
	})
	const result = await ensureSafetyRepository(deps)
	expect(result).toBe('error')
	expect(calls.errors.length).toBeGreaterThan(0)
	expect(calls.registered).toEqual([])
	expect(calls.connected).toEqual([])
	expect(calls.created).toEqual([])
})

test('ensureSafetyRepository: FOREIGN dir (non-empty, no kopia marker) → error, no kopia calls, never destructive', async () => {
	// IN-02: a stray file (lost+found, editor droppings) must not be treated as
	// an orphan repo (hourly connect-error loop) nor be created over.
	const {deps, calls} = makeEnsureDeps({repoDirState: async () => 'foreign'})
	const result = await ensureSafetyRepository(deps)
	expect(result).toBe('error')
	expect(calls.created).toEqual([])
	expect(calls.connected).toEqual([])
	expect(calls.registered).toEqual([])
	expect(calls.errors.some((message) => message.includes('no kopia repository marker'))).toBe(true)
})

test('ensureSafetyRepository: createKopiaRepository throwing → error result, never propagates', async () => {
	const {deps, calls} = makeEnsureDeps({
		createKopiaRepository: async () => {
			throw new Error('kopia exploded')
		},
	})
	await expect(ensureSafetyRepository(deps)).resolves.toBe('error')
	expect(calls.errors.length).toBeGreaterThan(0)
})

// ── evaluateDiskPressure (15% free guard — never fill the disk) ──────────

type PressureCalls = {maintenance: number; logs: string[]; errors: string[]}

function makePressureDeps(
	usages: Array<{size: number; available: number} | Error>,
	overrides: Partial<DiskPressureDeps> = {},
): {deps: DiskPressureDeps; calls: PressureCalls} {
	const calls: PressureCalls = {maintenance: 0, logs: [], errors: []}
	let probe = 0
	const deps: DiskPressureDeps = {
		getDiskUsage: async () => {
			const usage = usages[Math.min(probe++, usages.length - 1)]
			if (usage instanceof Error) throw usage
			return usage
		},
		runRetentionAndMaintenance: async () => {
			calls.maintenance++
		},
		log: (message) => calls.logs.push(message),
		error: (message) => calls.errors.push(message),
		...overrides,
	}
	return {deps, calls}
}

test('evaluateDiskPressure: 20% free → proceed without maintenance', async () => {
	const {deps, calls} = makePressureDeps([{size: 100, available: 20}])
	await expect(evaluateDiskPressure(deps)).resolves.toBe('proceed')
	expect(calls.maintenance).toBe(0)
})

test('evaluateDiskPressure: 10% free then 20% after maintenance → maintenance once, proceed, pressure logged', async () => {
	const {deps, calls} = makePressureDeps([
		{size: 100, available: 10},
		{size: 100, available: 20},
	])
	await expect(evaluateDiskPressure(deps)).resolves.toBe('proceed')
	expect(calls.maintenance).toBe(1)
	expect(calls.logs.some((message) => message.includes('Disk pressure'))).toBe(true)
})

test('evaluateDiskPressure: still low after maintenance → skip with SKIPPED log line', async () => {
	const {deps, calls} = makePressureDeps([
		{size: 100, available: 10},
		{size: 100, available: 10},
	])
	await expect(evaluateDiskPressure(deps)).resolves.toBe('skip')
	expect(calls.logs.some((message) => message.includes('SKIPPED'))).toBe(true)
})

test('evaluateDiskPressure: disk usage probe throwing → fail-safe skip, error logged', async () => {
	const {deps, calls} = makePressureDeps([new Error('df exploded')])
	await expect(evaluateDiskPressure(deps)).resolves.toBe('skip')
	expect(calls.errors.length).toBeGreaterThan(0)
})

test('evaluateDiskPressure: probe RETURNING size 0 → fail-safe skip (not 100% free), error logged, no snapshot risk', async () => {
	// IN-04: degenerate probe result must behave like a thrown probe.
	const {deps, calls} = makePressureDeps([{size: 0, available: 0}])
	await expect(evaluateDiskPressure(deps)).resolves.toBe('skip')
	expect(calls.errors.some((message) => message.includes('degenerate'))).toBe(true)
})

test('evaluateDiskPressure: non-finite probe values (NaN) → fail-safe skip', async () => {
	const {deps, calls} = makePressureDeps([{size: NaN, available: NaN}])
	await expect(evaluateDiskPressure(deps)).resolves.toBe('skip')
	expect(calls.errors.length).toBeGreaterThan(0)
})

test('evaluateDiskPressure: degenerate RE-probe after maintenance → fail-safe skip', async () => {
	const {deps, calls} = makePressureDeps([
		{size: 100, available: 10},
		{size: 0, available: 0},
	])
	await expect(evaluateDiskPressure(deps)).resolves.toBe('skip')
	expect(calls.maintenance).toBe(1)
	expect(calls.errors.some((message) => message.includes('degenerate'))).toBe(true)
})

test('evaluateDiskPressure: maintenance throwing is caught — decision comes from the re-probe', async () => {
	const {deps, calls} = makePressureDeps(
		[
			{size: 100, available: 10},
			{size: 100, available: 20},
		],
		{
			runRetentionAndMaintenance: async () => {
				throw new Error('maintenance exploded')
			},
		},
	)
	await expect(evaluateDiskPressure(deps)).resolves.toBe('proceed')
	expect(calls.errors.length).toBeGreaterThan(0)
})

test('SAFETY_MIN_FREE_PERCENT is the locked 15% threshold', () => {
	expect(SAFETY_MIN_FREE_PERCENT).toBe(15)
})

// ── Phase 368.5 gate — mid-run disk protection ──────────────────────────

test('DISK_ABORT_FREE_PERCENT sits BELOW the pre-flight floor', () => {
	// Crossing 15% mid-run is normal for a large first snapshot; crossing 5% is
	// an emergency. If these were equal, every big first backup would self-abort.
	expect(DISK_ABORT_FREE_PERCENT).toBe(5)
	expect(DISK_ABORT_FREE_PERCENT).toBeLessThan(SAFETY_MIN_FREE_PERCENT)
})

test('shouldAbortForDiskPressure kills the run only below the emergency floor', () => {
	expect(shouldAbortForDiskPressure({size: 100, available: 4})).toBe(true)
	expect(shouldAbortForDiskPressure({size: 100, available: 5})).toBe(false)
	expect(shouldAbortForDiskPressure({size: 100, available: 50})).toBe(false)
})

test('an unreadable probe DURING a run does not abort it (deliberate asymmetry)', () => {
	// The pre-flight guard fails SAFE by skipping. Mid-run the safe direction is
	// the opposite: it already proved there was room, a df hiccup is usually
	// transient, and aborting on it would stop a flaky box ever finishing a backup.
	expect(shouldAbortForDiskPressure({size: 0, available: 0})).toBe(false)
	expect(shouldAbortForDiskPressure({size: Number.NaN, available: 10})).toBe(false)
	expect(shouldAbortForDiskPressure({size: 100, available: Number.NaN})).toBe(false)
	expect(shouldAbortForDiskPressure({size: Number.POSITIVE_INFINITY, available: 1})).toBe(false)
})

test('freePercentOf reports null rather than a made-up number', () => {
	expect(freePercentOf({size: 200, available: 50})).toBe(25)
	expect(freePercentOf({size: 0, available: 0})).toBeNull()
	expect(freePercentOf({size: Number.NaN, available: 1})).toBeNull()
})

// ── Phase 368.5 gate — snapshot-scope exclusions ────────────────────────

test('VM disk images are excluded by DEFAULT — this is what unblocked stable', () => {
	// Tens of gigabytes, rewritten block-by-block on every VM boot. Snapshotting
	// that hourly onto the SAME disk is what could fill a small system disk and
	// take Postgres and Docker down with it.
	expect(DEFAULT_BACKUP_SCOPE.vmDiskImages).toBe(false)
	expect(scopeExclusionPatterns(DEFAULT_BACKUP_SCOPE)).toContain('/vm-data')
})

test('turning the toggle on puts VM disk images back in the snapshot', () => {
	// Excluded by a choice the operator can see and reverse — never a hidden rule.
	const patterns = scopeExclusionPatterns({...DEFAULT_BACKUP_SCOPE, vmDiskImages: true})
	expect(patterns).not.toContain('/vm-data')
})

test('browser caches are always excluded, and are anchored to the profile root', () => {
	const patterns = scopeExclusionPatterns({...DEFAULT_BACKUP_SCOPE, vmDiskImages: true})
	expect(patterns).toContain('/chrome-master/*/Cache')
	expect(patterns).toContain('/chrome-master/*/Code Cache')
	// Every pattern must be anchored: a depth-agnostic `Cache/` would match a
	// folder a user happened to name "Cache" in their own files and silently drop
	// it from every backup.
	for (const pattern of patterns) expect(pattern.startsWith('/')).toBe(true)
})

test('the exclusions never touch the parts of a browser profile that matter', () => {
	const patterns = scopeExclusionPatterns(DEFAULT_BACKUP_SCOPE)
	for (const kept of ['/chrome-master/Default/Cookies', '/chrome-master/Default/Login Data', '/chrome-master/Local State']) {
		expect(patterns).not.toContain(kept)
	}
})

// ── Phase 368.8 SAFE-02 / OP-01 — cadence ───────────────────────────────────

const HOUR = 1000 * 60 * 60

test('the four locked options map to the right millisecond values', () => {
	expect(SAFETY_INTERVAL_OPTIONS).toEqual(['30m', '1h', '6h', 'daily'])
	expect(safetyIntervalMs('30m')).toBe(30 * 60 * 1000)
	expect(safetyIntervalMs('1h')).toBe(HOUR)
	expect(safetyIntervalMs('6h')).toBe(6 * HOUR)
	expect(safetyIntervalMs('daily')).toBe(24 * HOUR)
})

test('anything unrecognised falls back to the shipped 1-hour default (no migration needed)', () => {
	expect(DEFAULT_SAFETY_INTERVAL).toBe('1h')
	for (const bad of [undefined, null, '', 'nonsense', '45m', 42, {}]) {
		expect(safetyIntervalMs(bad)).toBe(HOUR)
	}
})

test('the outer tick drops to the safety interval, but never slower than backupInterval', () => {
	expect(schedulerTickMs(30 * 60 * 1000, HOUR)).toBe(30 * 60 * 1000)
	expect(schedulerTickMs(HOUR, HOUR)).toBe(HOUR)
	expect(schedulerTickMs(24 * HOUR, HOUR)).toBe(HOUR)
})

/** Models backups.ts backupOnInterval exactly: two cursors, one wake gate. */
function simulate(safetyMs: number, backupMs: number, durationMs: number) {
	const stepMs = 60 * 1000
	let lastSafetyRun = 0
	let lastUserRun = 0
	let safetyRuns = 0
	let userRuns = 0
	for (let now = 0; now <= durationMs; now += stepMs) {
		const safetyDue = isRepositoryDue({isSafety: true, now, lastSafetyRun, lastUserRun, safetyMs, backupMs})
		const userDue = isRepositoryDue({isSafety: false, now, lastSafetyRun, lastUserRun, safetyMs, backupMs})
		if (!safetyDue && !userDue) continue
		if (safetyDue) {
			lastSafetyRun = now
			safetyRuns += 1
		}
		if (userDue) {
			lastUserRun = now
			userRuns += 1
		}
	}
	return {safetyRuns, userRuns}
}

test('a 30-minute safety interval really means 30 minutes', () => {
	const {safetyRuns} = simulate(30 * 60 * 1000, HOUR, 6 * HOUR)
	expect(safetyRuns).toBe(12)
})

test('REGRESSION (OP-01): non-safety repositories still fire on backupInterval and no more often', () => {
	// The whole point of "safety-only". Whatever the operator picks, a USB or NAS
	// destination must back up exactly once an hour — not twice, not half as often.
	for (const option of SAFETY_INTERVAL_OPTIONS) {
		const {userRuns} = simulate(safetyIntervalMs(option), HOUR, 6 * HOUR)
		expect(userRuns, `userRuns for safety=${option}`).toBe(6)
	}
})

test('a daily safety interval does not stall user destinations', () => {
	const {safetyRuns, userRuns} = simulate(24 * HOUR, HOUR, 48 * HOUR)
	expect(safetyRuns).toBe(2)
	expect(userRuns).toBe(48)
})
// ── The call-path pin ────────────────────────────────────────────────────────
//
// Everything above tests `simulate()`, a MODEL of the scheduler. Deleting the
// real per-class gate in backups.ts would leave every test above green while
// USB/NAS backups quietly sped up to the safety cadence — exactly the failure
// mode `feedback_pure_module_tests_never_exercise_call_path` records (60 green
// tests, feature dead on every box). So pin the real loop too.

test('CALL PATH: backupOnInterval actually gates each repository on its own class', async () => {
	const {readFile} = await import('node:fs/promises')
	const path = await import('node:path')
	const {fileURLToPath} = await import('node:url')
	const source = await readFile(
		path.join(path.dirname(fileURLToPath(import.meta.url)), 'backups.ts'),
		'utf8',
	)
	// Bound the slice to backupOnInterval ALONE — up to the next class method.
	// A looser bound swept in getSafetySnapshotInterval, whose (correct) store
	// read then tripped the "no store access in the 100ms loop" assertion below.
	const fromLoop = source.slice(source.indexOf('async backupOnInterval('))
	const nextMethod = fromLoop.slice(10).search(/\r?\n\t(async |#|[a-zA-Z]+\()/)
	const loop = nextMethod === -1 ? fromLoop : fromLoop.slice(0, nextMethod + 10)

	// Two cursors, advanced independently.
	expect(loop).toMatch(/let lastUserRun = Date\.now\(\)/)
	expect(loop).toMatch(/let lastSafetyRun = Date\.now\(\)/)
	expect(loop).toMatch(/if \(safetyDue\) lastSafetyRun = now/)
	expect(loop).toMatch(/if \(userDue\) lastUserRun = now/)

	// The gate that keeps a safety-only wake from backing up user destinations.
	expect(loop).toMatch(/repository\.isSafety \? !safetyDue : !userDue/)

	// The single-cursor version must be gone, or a safety run would advance the
	// user cursor and silently delay USB/NAS.
	expect(loop).not.toMatch(/let lastRun = Date\.now\(\)/)

	// backupInterval itself is untouched (OP-01) — the 100ms loop must also never
	// read the store, which is why the interval is cached on the instance.
	expect(source).toMatch(/backupInterval = 1000 \* 60 \* 60/)
	expect(loop).not.toMatch(/store\.get\('backups\.safetySnapshotInterval'\)/)
})