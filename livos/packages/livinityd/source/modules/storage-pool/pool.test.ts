// =========================================================================
// pool.test.ts — Phase 318 (POOL-02 / POOL-04) storage-pool core tests.
//
// Covers, with ZERO live disk access (execa / wrapper / root-disk / store are
// all injected fakes — marathon standing rule, no real mkfs/mount/write):
//   • BYTE-EXACT fstab (D-05) + snapraid.conf (D-06) renderers (2- and 1-data-disk)
//   • formatInternalDevice — cloned-and-INVERTED membership (Trap 1) + TOCTOU
//     re-check (Trap 9) + pool-member / in-flight-runbook hard blocks
//   • checkFreezeGate — D-08 boundaries + the W-2 absent-protectedFileCount lock
//   • createPool / addDisk orchestration (plan-check B-1): parity=largest,
//     up-front rejection destroys nothing, seam present/absent both green,
//     addDisk appends the dN line and NEVER auto-chains a sync.
// =========================================================================

import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, describe, expect, test, vi} from 'vitest'

import FileStore from '../utilities/file-store.js'
import type {EligibleDrive} from './root-disk.js'
import {
	addDisk,
	checkFreezeGate,
	createPool,
	DEFAULT_FREEZE_THRESHOLD,
	formatInternalDevice,
	POOL_FSTAB_LINE,
	renderFstabLine,
	renderSnapraidConf,
	type PoolDeps,
	type PoolStore,
	type PoolWrapper,
	type RootDiskGuards,
	type StoragePoolState,
} from './pool.js'

// ── Fixtures / fakes ───────────────────────────────────────────────────────

// An in-memory PoolStore: the persist target, so tests can read back exactly
// what the orchestration wrote (no FileStore / dot-prop in the hot path).
function makeStore(initial?: StoragePoolState): PoolStore & {state?: StoragePoolState} {
	const box: {state?: StoragePoolState} = {state: initial}
	return {
		state: box.state,
		async getPoolState() {
			return box.state
		},
		async setPoolState(next: StoragePoolState) {
			box.state = next
			// keep the readable mirror in sync
			;(this as {state?: StoragePoolState}).state = next
		},
	}
}

// A recording wrapper: captures every action/args/input and returns a canned
// exit. `failOn` forces a non-zero exit (a mid-sequence failure) for one action.
function makeWrapper(opts: {failOn?: string} = {}): PoolWrapper & {
	calls: {action: string; args: string[]; input?: string}[]
} {
	const calls: {action: string; args: string[]; input?: string}[] = []
	return {
		calls,
		async run(action: string, args: string[], input?: string) {
			calls.push({action, args, input})
			if (opts.failOn === action) throw new Error(`[livos-pool] action '${action}' failed (exit 2): guard refused`)
			return {stdout: '', exitCode: 0}
		},
	}
}

function drive(id: string, size: number, transport: EligibleDrive['transport'] = 'unknown'): EligibleDrive {
	return {id, model: `Model-${id}`, size, transport}
}

// Root-disk guards fake: an explicit eligible set + an OS-disk denylist that
// assertNotOsDisk re-consults on EVERY call (so a test can flip it to prove the
// TOCTOU re-check is live, not cached).
function makeGuards(config: {eligible: EligibleDrive[]; osDisks?: Set<string>}): RootDiskGuards & {
	osDisks: Set<string>
	assertCalls: string[]
} {
	const osDisks = config.osDisks ?? new Set<string>()
	const assertCalls: string[] = []
	return {
		osDisks,
		assertCalls,
		async getEligibleInternalDrives() {
			return config.eligible
		},
		async assertNotOsDisk(deviceId: string) {
			assertCalls.push(deviceId)
			if (osDisks.has(deviceId)) throw new Error(`[os-disk-refused] ${deviceId}`)
		},
	}
}

function makeDeps(overrides: Partial<PoolDeps> = {}): PoolDeps & {
	store: ReturnType<typeof makeStore>
	wrapper: ReturnType<typeof makeWrapper>
	guards: ReturnType<typeof makeGuards>
} {
	const store = (overrides.store as ReturnType<typeof makeStore>) ?? makeStore()
	const wrapper = (overrides.wrapper as ReturnType<typeof makeWrapper>) ?? makeWrapper()
	const guards =
		(overrides.guards as ReturnType<typeof makeGuards>) ??
		makeGuards({eligible: [drive('sdb', 2_000), drive('sdc', 4_000), drive('sdd', 8_000)]})
	return {store, wrapper, guards, files: overrides.files} as never
}

// ── Renderers (D-05 / D-06, BYTE-EXACT) ─────────────────────────────────────

describe('renderFstabLine (D-05, byte-exact)', () => {
	// The exact D-05 string: minfreespace=20G, category.create=mfs (pfrd override),
	// branches-mount-timeout-fail=true — identical to the wrapper's baked POOL_FSTAB_LINE.
	const EXPECTED =
		'/mnt/disk* /mnt/pool mergerfs cache.files=off,category.create=mfs,func.getattr=newest,' +
		'dropcacheonclose=false,minfreespace=20G,moveonenospc=true,branches-mount-timeout=30,' +
		'branches-mount-timeout-fail=true,x-systemd.mount-timeout=45s,fsname=livinity-pool,allow_other 0 0'

	test('renders the exact D-05 line (glob spec — same for any pool shape)', () => {
		expect(renderFstabLine()).toBe(EXPECTED)
		expect(POOL_FSTAB_LINE).toBe(EXPECTED)
	})

	test('carries the two non-negotiable safety tokens verbatim', () => {
		expect(renderFstabLine()).toContain('branches-mount-timeout-fail=true')
		expect(renderFstabLine()).toContain('minfreespace=20G')
		expect(renderFstabLine()).toContain('category.create=mfs')
	})
})

describe('renderSnapraidConf (D-06, byte-exact)', () => {
	const HEADER =
		'# SnapRAID configuration — generated whole-file by LivOS storage-pool (Phase 318, D-06).\n' +
		'# DO NOT hand-edit: this file is regenerated from pool state on every pool change.\n' +
		'#\n' +
		'# parity = the LARGEST selected disk, at /mnt/parity1 — DELIBERATELY OUTSIDE the\n' +
		'# /mnt/disk* mergerfs glob (Trap 3) so the parity disk is never pooled as a data branch.\n'

	test('2-data-disk protected pool → exact layout', () => {
		const EXPECTED =
			HEADER +
			'parity /mnt/parity1/snapraid.parity\n' +
			'\n' +
			'# Content files: one copy per data disk (capped at 2) + a tiny copy on the OS disk.\n' +
			'content /mnt/disk2/snapraid.content\n' +
			'content /mnt/disk3/snapraid.content\n' +
			'content /opt/livos/snapraid/content.content\n' +
			'\n' +
			'# Data disks — one line per pooled data branch (label dN <-> /mnt/diskN).\n' +
			'data d2 /mnt/disk2\n' +
			'data d3 /mnt/disk3\n' +
			'\n' +
			'# Excludes (D-06): scratch, temp, recovery, and snapraid metadata dirs.\n' +
			'exclude /tmp/\n' +
			'exclude *.tmp\n' +
			'exclude /lost+found/\n' +
			'exclude .snapraid/\n'
		expect(renderSnapraidConf(['/mnt/disk2', '/mnt/disk3'])).toBe(EXPECTED)
	})

	test('1-data-disk protected pool → single data + single per-disk content copy', () => {
		const EXPECTED =
			HEADER +
			'parity /mnt/parity1/snapraid.parity\n' +
			'\n' +
			'# Content files: one copy per data disk (capped at 2) + a tiny copy on the OS disk.\n' +
			'content /mnt/disk2/snapraid.content\n' +
			'content /opt/livos/snapraid/content.content\n' +
			'\n' +
			'# Data disks — one line per pooled data branch (label dN <-> /mnt/diskN).\n' +
			'data d2 /mnt/disk2\n' +
			'\n' +
			'# Excludes (D-06): scratch, temp, recovery, and snapraid metadata dirs.\n' +
			'exclude /tmp/\n' +
			'exclude *.tmp\n' +
			'exclude /lost+found/\n' +
			'exclude .snapraid/\n'
		expect(renderSnapraidConf(['/mnt/disk2'])).toBe(EXPECTED)
	})

	test('parity path is OUTSIDE the /mnt/disk* glob (Trap 3)', () => {
		const conf = renderSnapraidConf(['/mnt/disk2', '/mnt/disk3'])
		expect(conf).toContain('parity /mnt/parity1/snapraid.parity')
		// No `data`/`content` line ever targets /mnt/parity1 (would pool parity as data).
		for (const line of conf.split('\n')) {
			if (line.startsWith('data ') || line.startsWith('content /mnt')) {
				expect(line).not.toContain('/mnt/parity1')
			}
		}
	})
})

// ── StoreSchema round-trip (D-15 / Trap 6 — dedicated top-level key) ─────────

describe('storagePool store key (dedicated top-level, no dot-prop collision)', () => {
	let dir: string
	afterEach(() => {
		if (dir) rmSync(dir, {recursive: true, force: true})
	})

	test('a write to the top-level storagePool key round-trips intact', async () => {
		dir = mkdtempSync(join(tmpdir(), 'livos-pool-store-'))
		type TestSchema = {storagePool: StoragePoolState}
		const store = new FileStore<TestSchema>({filePath: join(dir, 'livinity.yaml')})
		const state: StoragePoolState = {
			members: [
				{deviceId: 'sdb', role: 'data', mountpoint: '/mnt/disk2'},
				{deviceId: 'sdc', role: 'parity', mountpoint: '/mnt/parity1'},
			],
			protectionLevel: 'protected',
			parityDeviceId: 'sdc',
			safetyFreezeThreshold: DEFAULT_FREEZE_THRESHOLD,
			lastStatusSummary: {protectedFileCount: 1234, scrubOldestDays: 7, at: 111},
		}
		await store.set('storagePool', state)
		expect(await store.get('storagePool')).toEqual(state)
	})
})

// ── formatInternalDevice (Trap 1 inverted membership + Trap 9 TOCTOU) ────────

describe('formatInternalDevice — inverted membership + TOCTOU + hard blocks', () => {
	test('ACCEPTS an eligible internal drive and routes the wipe through format-disk', async () => {
		const deps = makeDeps()
		await expect(formatInternalDevice('sdc', deps)).resolves.toBe(true)
		expect(deps.wrapper.calls).toEqual([{action: 'format-disk', args: ['--dev', 'sdc'], input: undefined}])
		// TOCTOU re-check ran immediately before the destructive call.
		expect(deps.guards.assertCalls).toContain('sdc')
	})

	test('REJECTS a device not in the eligible-internal set (USB / OS disk — inverted guard)', async () => {
		const deps = makeDeps({
			// eligible = internal only; sdx (a USB stick) is NOT eligible → rejected.
			guards: makeGuards({eligible: [drive('sdb', 2_000)]}),
		})
		await expect(formatInternalDevice('sdx', deps)).rejects.toThrow('[invalid-device-id]')
		// zero destructive calls
		expect(deps.wrapper.calls).toEqual([])
	})

	test('REJECTS a malformed device id BEFORE any resolution', async () => {
		const deps = makeDeps()
		await expect(formatInternalDevice('sdb; rm -rf /', deps)).rejects.toThrow('[invalid-device-id]')
		expect(deps.wrapper.calls).toEqual([])
	})

	test('TOCTOU: refuses a device that became the OS disk between list build and format', async () => {
		const guards = makeGuards({eligible: [drive('sdb', 2_000)], osDisks: new Set(['sdb'])})
		const deps = makeDeps({guards})
		// sdb is eligible in the set but assertNotOsDisk re-resolves and refuses it.
		await expect(formatInternalDevice('sdb', deps)).rejects.toThrow('[os-disk-refused]')
		expect(deps.wrapper.calls).toEqual([])
	})

	test('hard-refuses a device that is already a pool member', async () => {
		const store = makeStore({
			members: [{deviceId: 'sdc', role: 'data', mountpoint: '/mnt/disk2'}],
			protectionLevel: 'combine-only',
			safetyFreezeThreshold: DEFAULT_FREEZE_THRESHOLD,
		})
		const deps = makeDeps({store})
		await expect(formatInternalDevice('sdc', deps)).rejects.toThrow('[device-is-pool-member]')
		expect(deps.wrapper.calls).toEqual([])
	})

	test('hard-refuses any format while a replacement runbook is in-flight', async () => {
		const store = makeStore({
			members: [{deviceId: 'sdb', role: 'data', mountpoint: '/mnt/disk2'}],
			protectionLevel: 'combine-only',
			safetyFreezeThreshold: DEFAULT_FREEZE_THRESHOLD,
			runbookStep: 'awaiting-replacement',
		})
		const deps = makeDeps({store})
		await expect(formatInternalDevice('sdc', deps)).rejects.toThrow('[replacement-runbook-in-flight]')
		expect(deps.wrapper.calls).toEqual([])
	})
})

// ── checkFreezeGate (D-08 boundaries + W-2 absent-count lock) ────────────────

describe('checkFreezeGate — D-08 threshold (absolute 500 OR >20%)', () => {
	const protectedFiles = 1000 // so the percentage leg = 200 files at 20%

	test('499 removed → allow (under absolute)', () => {
		expect(checkFreezeGate({removed: 499}, 100_000).blocked).toBe(false)
	})
	test('500 removed → allow (boundary is strictly greater-than)', () => {
		expect(checkFreezeGate({removed: 500}, 100_000).blocked).toBe(false)
	})
	test('501 removed → BLOCK (over absolute)', () => {
		expect(checkFreezeGate({removed: 501}, 100_000).blocked).toBe(true)
	})

	test('exactly 20% removed → allow (strict >, small file counts under 500)', () => {
		// 20 of 100 = 20% exactly, and 20 < 500 → not blocked by either leg
		expect(checkFreezeGate({removed: 20}, 100).blocked).toBe(false)
	})
	test('21% removed → BLOCK (over percentage, still under absolute)', () => {
		// 21 of 100 = 21% > 20%, 21 < 500 → percentage leg blocks
		expect(checkFreezeGate({removed: 21}, 100).blocked).toBe(true)
	})
	test('19% removed → allow', () => {
		expect(checkFreezeGate({removed: 19}, 100).blocked).toBe(false)
	})

	test('W-2: absent protectedFileCount → percentage leg SKIPPED, absolute still enforced (501 → BLOCK)', () => {
		expect(checkFreezeGate({removed: 501}, null).blocked).toBe(true)
		expect(checkFreezeGate({removed: 501}, undefined).blocked).toBe(true)
	})
	test('W-2: absent protectedFileCount + 499 removed → allow (percentage never triggers)', () => {
		// 499 removed with no known protected count: a naive percentage rule (huge %)
		// would falsely block; W-2 says skip percentage → allow (only absolute applies).
		expect(checkFreezeGate({removed: 499}, null).blocked).toBe(false)
		expect(checkFreezeGate({removed: 499}, undefined).blocked).toBe(false)
	})
	test('protectedFileCount = 0 → treated as absent (no divide-by-zero blowout)', () => {
		expect(checkFreezeGate({removed: 499}, 0).blocked).toBe(false)
		expect(checkFreezeGate({removed: 501}, 0).blocked).toBe(true)
	})

	test('operator-tunable threshold is honored', () => {
		expect(checkFreezeGate({removed: 51}, null, {files: 50, percent: 20}).blocked).toBe(true)
		expect(checkFreezeGate({removed: 50}, null, {files: 50, percent: 20}).blocked).toBe(false)
	})

	// keep protectedFiles referenced so the shared fixture is not flagged unused
	test('percentage leg uses the supplied protected-file total', () => {
		expect(checkFreezeGate({removed: 300}, protectedFiles).blocked).toBe(true) // 30% > 20%
	})
})

// ── createPool orchestration (plan-check B-1) ────────────────────────────────

describe('createPool — validate → format → configs → mount → persist → hook', () => {
	test('protected: parity = LARGEST selected disk; data mounts /mnt/disk2..N; byte-exact conf', async () => {
		const deps = makeDeps({
			guards: makeGuards({eligible: [drive('sdb', 2_000), drive('sdc', 8_000), drive('sdd', 4_000)]}),
		})
		const state = await createPool(['sdb', 'sdc', 'sdd'], 'protected', deps)

		// parity = sdc (8_000, largest); data = sdb, sdd in selection order
		expect(state.parityDeviceId).toBe('sdc')
		expect(state.protectionLevel).toBe('protected')
		expect(state.members).toEqual([
			{deviceId: 'sdb', role: 'data', mountpoint: '/mnt/disk2'},
			{deviceId: 'sdd', role: 'data', mountpoint: '/mnt/disk3'},
			{deviceId: 'sdc', role: 'parity', mountpoint: '/mnt/parity1'},
		])

		const actions = deps.wrapper.calls.map((c) => c.action)
		// create-pool formats every selected disk (+ mounts parity), then per-disk mounts,
		// then the snapraid.conf write, then the pool mount.
		expect(actions).toEqual(['create-pool', 'mount-data-disk', 'mount-data-disk', 'write-snapraid-conf', 'mount'])

		const createCall = deps.wrapper.calls[0]
		expect(createCall.args).toEqual(['--dev', 'sdb', '--dev', 'sdd', '--parity', 'sdc'])

		// byte-exact snapraid.conf handed to the wrapper on STDIN
		const confCall = deps.wrapper.calls.find((c) => c.action === 'write-snapraid-conf')!
		expect(confCall.input).toBe(renderSnapraidConf(['/mnt/disk2', '/mnt/disk3']))

		// state persisted
		expect(deps.store.state).toEqual(state)
	})

	test('per-device TOCTOU runs for EVERY selected disk before any destructive call', async () => {
		const guards = makeGuards({eligible: [drive('sdb', 2_000), drive('sdc', 4_000)]})
		const deps = makeDeps({guards})
		await createPool(['sdb', 'sdc'], 'protected', deps)
		expect(guards.assertCalls).toContain('sdb')
		expect(guards.assertCalls).toContain('sdc')
	})

	test('combine-only: no parity, no snapraid.conf write', async () => {
		const deps = makeDeps({guards: makeGuards({eligible: [drive('sdb', 2_000), drive('sdc', 4_000)]})})
		const state = await createPool(['sdb', 'sdc'], 'combine-only', deps)
		expect(state.parityDeviceId).toBeUndefined()
		const actions = deps.wrapper.calls.map((c) => c.action)
		expect(actions).toEqual(['create-pool', 'mount-data-disk', 'mount-data-disk', 'mount'])
		expect(deps.wrapper.calls[0].args).toEqual(['--dev', 'sdb', '--dev', 'sdc'])
		expect(actions).not.toContain('write-snapraid-conf')
	})

	test('UP-FRONT rejection: an OS/ineligible disk in the selection destroys NOTHING', async () => {
		const guards = makeGuards({eligible: [drive('sdb', 2_000), drive('sdc', 4_000)], osDisks: new Set(['sdc'])})
		const deps = makeDeps({guards})
		await expect(createPool(['sdb', 'sdc'], 'protected', deps)).rejects.toThrow()
		// zero destructive wrapper calls — no partial pool
		expect(deps.wrapper.calls).toEqual([])
		expect(deps.store.state).toBeUndefined()
	})

	test('a device outside the eligible set is rejected up-front', async () => {
		const deps = makeDeps({guards: makeGuards({eligible: [drive('sdb', 2_000)]})})
		await expect(createPool(['sdb', 'sdz'], 'protected', deps)).rejects.toThrow('[invalid-device-id]')
		expect(deps.wrapper.calls).toEqual([])
	})

	test('mid-sequence wrapper failure surfaces + records partial (incomplete) state, no auto-retry', async () => {
		const wrapper = makeWrapper({failOn: 'mount'})
		const deps = makeDeps({wrapper, guards: makeGuards({eligible: [drive('sdb', 2_000), drive('sdc', 4_000)]})})
		await expect(createPool(['sdb', 'sdc'], 'protected', deps)).rejects.toThrow(/mount/)
		// partial state persisted with incomplete flag; never a silent success
		expect(deps.store.state?.incomplete).toBe(true)
		// the failing action was attempted exactly once (no destructive auto-retry)
		expect(wrapper.calls.filter((c) => c.action === 'mount')).toHaveLength(1)
	})

	test('base-dir hook seam fires when registerPoolBaseDir is present', async () => {
		const registerPoolBaseDir = vi.fn()
		const deps = makeDeps({
			files: {registerPoolBaseDir},
			guards: makeGuards({eligible: [drive('sdb', 2_000), drive('sdc', 4_000)]}),
		})
		await createPool(['sdb', 'sdc'], 'protected', deps)
		expect(registerPoolBaseDir).toHaveBeenCalledTimes(1)
	})

	test('base-dir hook seam is a NO-OP when absent (318-10 lands later)', async () => {
		const deps = makeDeps({files: {}, guards: makeGuards({eligible: [drive('sdb', 2_000), drive('sdc', 4_000)]})})
		// must not throw despite files.registerPoolBaseDir being undefined
		await expect(createPool(['sdb', 'sdc'], 'protected', deps)).resolves.toBeDefined()
	})

	test('refuses to build over an existing pool', async () => {
		const store = makeStore({
			members: [{deviceId: 'sdb', role: 'data', mountpoint: '/mnt/disk2'}],
			protectionLevel: 'combine-only',
			safetyFreezeThreshold: DEFAULT_FREEZE_THRESHOLD,
		})
		const deps = makeDeps({store})
		await expect(createPool(['sdc', 'sdd'], 'protected', deps)).rejects.toThrow('[pool-already-exists]')
		expect(deps.wrapper.calls).toEqual([])
	})
})

// ── addDisk orchestration (Pattern 3 growth) ─────────────────────────────────

describe('addDisk — format + add-disk + whole-file re-render + needs-sync SEAM', () => {
	function existingProtectedPool(): PoolStore & {state?: StoragePoolState} {
		return makeStore({
			members: [
				{deviceId: 'sdb', role: 'data', mountpoint: '/mnt/disk2'},
				{deviceId: 'sdc', role: 'parity', mountpoint: '/mnt/parity1'},
			],
			protectionLevel: 'protected',
			parityDeviceId: 'sdc',
			safetyFreezeThreshold: DEFAULT_FREEZE_THRESHOLD,
		})
	}

	test('appends the next dN data line (byte-exact) + calls add-disk at next free /mnt/diskN', async () => {
		const store = existingProtectedPool()
		const deps = makeDeps({store, guards: makeGuards({eligible: [drive('sdd', 4_000)]})})
		const result = await addDisk('sdd', deps)

		const actions = deps.wrapper.calls.map((c) => c.action)
		expect(actions).toEqual(['format-disk', 'add-disk', 'write-snapraid-conf'])

		const addCall = deps.wrapper.calls.find((c) => c.action === 'add-disk')!
		expect(addCall.args).toEqual(['--dev', 'sdd', '--target', '/mnt/disk3'])

		// whole-file re-render includes the NEW data disk line (byte-exact)
		const confCall = deps.wrapper.calls.find((c) => c.action === 'write-snapraid-conf')!
		expect(confCall.input).toBe(renderSnapraidConf(['/mnt/disk2', '/mnt/disk3']))

		// store updated with the new member
		expect(store.state?.members).toContainEqual({deviceId: 'sdd', role: 'data', mountpoint: '/mnt/disk3'})

		// returns a scoped-sync-needed flag; does NOT invoke sync itself (Trap 11)
		expect(result.needsSync).toBe(true)
		expect(actions).not.toContain('snapraid')
		expect(actions).not.toContain('sync')
	})

	test('combine-only growth writes no snapraid.conf but still flags needs-sync', async () => {
		const store = makeStore({
			members: [{deviceId: 'sdb', role: 'data', mountpoint: '/mnt/disk2'}],
			protectionLevel: 'combine-only',
			safetyFreezeThreshold: DEFAULT_FREEZE_THRESHOLD,
		})
		const deps = makeDeps({store, guards: makeGuards({eligible: [drive('sdc', 4_000)]})})
		const result = await addDisk('sdc', deps)
		const actions = deps.wrapper.calls.map((c) => c.action)
		expect(actions).toEqual(['format-disk', 'add-disk'])
		expect(actions).not.toContain('write-snapraid-conf')
		expect(result.needsSync).toBe(true)
	})

	test('refuses to add a device already in the pool', async () => {
		const store = existingProtectedPool()
		const deps = makeDeps({store, guards: makeGuards({eligible: [drive('sdb', 2_000)]})})
		await expect(addDisk('sdb', deps)).rejects.toThrow('[device-is-pool-member]')
	})

	test('refuses to grow when no pool exists', async () => {
		const deps = makeDeps({store: makeStore(), guards: makeGuards({eligible: [drive('sdd', 4_000)]})})
		await expect(addDisk('sdd', deps)).rejects.toThrow('[no-pool-exists]')
	})
})
