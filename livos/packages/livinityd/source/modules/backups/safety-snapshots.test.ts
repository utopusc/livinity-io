import {expect, test} from 'vitest'

import {
	ensureSafetyRepository,
	evaluateDiskPressure,
	retentionFlagsFor,
	SAFETY_MIN_FREE_PERCENT,
	SAFETY_REPO_ID,
	SAFETY_REPO_PATH,
	SAFETY_RETENTION_FLAGS,
	USER_RETENTION_FLAGS,
	type DiskPressureDeps,
	type EnsureSafetyDeps,
} from './safety-snapshots.js'

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
