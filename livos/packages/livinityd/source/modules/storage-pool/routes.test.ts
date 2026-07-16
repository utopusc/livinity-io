/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase 318-06 (POOL-02/03/04) — storagePool router route tests. This is the
// destructive trust boundary (T-318-11 / T-318-12); the two load-bearing controls
// it ADDS on top of pool.ts / snapraid-cli are:
//   V4 — every mutation is adminProcedure-gated (a non-admin caller is refused
//        BEFORE the resolver — before any wrapper/snapraid call);
//   V5 — every device input is DEVICE_ID_RE-zod-constrained BEFORE the resolver,
//        so a malformed id never reaches formatInternalDevice / create-pool /
//        mount-data-disk.
//
// Strategy mirrors monitoring/routes.test.ts: build a caller via
// `router.createCaller(ctx)` with `dangerouslyBypassAuthentication: true` (skips
// isAuthenticated) + an explicit `currentUser.role` (so requireRole('admin') is
// still exercised). The tests deliberately assert ONLY rejection / read paths, so
// NO live pool operation (execa → sudo → livos-pool.sh / snapraid) is ever
// reached — admin-gating rejects before the resolver, and zod rejects a malformed
// id before the resolver. A stub `store` whose getter would surface if the
// resolver ran seeds the poolStatus read test.

import {describe, expect, test} from 'vitest'

import storagePoolRouter from './routes.js'

// In-memory livinityd stub: a single `storagePool` store cell + no-op
// notifications. If a resolver actually ran a destructive op it would need
// execa/sudo (absent in test) — but every test below rejects BEFORE the resolver.
function makeStubLivinityd(initial?: unknown) {
	let value: unknown = initial
	return {
		store: {
			get: async () => value,
			set: async (_k: string, v: unknown) => {
				value = v
				return true
			},
		},
		notifications: {add: async () => {}, clear: async () => {}},
		files: {},
	}
}

function makeCaller(opts?: {role?: string; storeInitial?: unknown}) {
	const ctx = {
		livinityd: makeStubLivinityd(opts?.storeInitial),
		currentUser: {id: 'test-user', username: 'admin', role: opts?.role ?? 'admin'},
		// The read queries use publicProcedureWhenNoUserExists → isAuthenticatedIfUserExists
		// reads ctx.user.exists(); `false` = "no user yet" → the read gate passes through
		// (mirrors a fresh box browsing the wizard before first-user registration).
		user: {exists: async () => false},
		dangerouslyBypassAuthentication: true,
		logger: {error: () => {}, info: () => {}, warn: () => {}, verbose: () => {}, log: () => {}},
	}
	return (storagePoolRouter as any).createCaller(ctx)
}

// The full set of destructive mutations that MUST be adminProcedure-gated (V4).
const ADMIN_MUTATIONS = [
	'createPool',
	'addDisk',
	'formatInternalDevice',
	'syncNow',
	'forceSyncOverride',
	'replaceDetect',
	'replaceFormat',
	'replaceMount',
	'replaceFix',
	'replaceCheck',
	'replaceSync',
	'replaceClear',
] as const

// A minimal valid-shape input per mutation (valid enough to PASS zod, so the ONLY
// thing that can reject a non-admin caller is the admin gate — proving V4, not a
// zod accident). Device ids are DEVICE_ID_RE-valid; disk labels are label-valid.
const VALID_INPUT: Record<string, unknown> = {
	createPool: {selectedDeviceIds: ['sda'], protectionLevel: 'combine-only'},
	addDisk: {deviceId: 'sdb'},
	formatInternalDevice: {deviceId: 'sdb'},
	syncNow: undefined,
	forceSyncOverride: {confirm: true},
	replaceDetect: {failedDeviceId: 'sda'},
	replaceFormat: {deviceId: 'sdb'},
	replaceMount: {deviceId: 'sdb', mountpoint: '/mnt/disk2'},
	replaceFix: {disk: 'd2'},
	replaceCheck: {disk: 'd2'},
	replaceSync: undefined,
	replaceClear: undefined,
}

describe('storagePool router — namespace shape', () => {
	test('is a fresh router exposing the read queries + every lifecycle mutation', () => {
		const procs = (storagePoolRouter as any)._def?.procedures ?? {}
		expect(procs['listEligibleDrives']).toBeDefined()
		expect(procs['poolStatus']).toBeDefined()
		for (const name of ADMIN_MUTATIONS) expect(procs[name]).toBeDefined()
	})
})

describe('storagePool mutations are adminProcedure-gated (V4 / T-318-11)', () => {
	for (const name of ADMIN_MUTATIONS) {
		test(`${name} rejects a non-admin (member) caller before the resolver`, async () => {
			const caller = makeCaller({role: 'member'})
			await expect(caller[name](VALID_INPUT[name])).rejects.toThrow()
		})
	}
})

describe('DEVICE_ID_RE zod rejects a malformed deviceId before the resolver (V5 / T-318-12)', () => {
	// Admin caller (so ONLY the zod device-shape guard can reject) with hostile /
	// malformed ids. None reach formatInternalDevice / create-pool / mount-data-disk.
	const BAD_IDS = ['', 'sda1', 'sda; rm -rf /', '../../dev/sda', '/dev/sda', 'nvme0', 'SDA', 'sdaa ']

	test('formatInternalDevice refuses every malformed device id', async () => {
		const caller = makeCaller()
		for (const bad of BAD_IDS) {
			await expect(caller.formatInternalDevice({deviceId: bad})).rejects.toThrow()
		}
	})

	test('addDisk refuses a malformed device id', async () => {
		const caller = makeCaller()
		await expect(caller.addDisk({deviceId: 'sda; reboot'})).rejects.toThrow()
	})

	test('createPool refuses a selection containing a malformed device id', async () => {
		const caller = makeCaller()
		await expect(
			caller.createPool({selectedDeviceIds: ['sda', 'not-a-device'], protectionLevel: 'protected'}),
		).rejects.toThrow()
	})

	test('createPool refuses an empty selection (min(1))', async () => {
		const caller = makeCaller()
		await expect(caller.createPool({selectedDeviceIds: [], protectionLevel: 'combine-only'})).rejects.toThrow()
	})

	test('replaceMount refuses a mountpoint outside /mnt/diskN (parity / traversal)', async () => {
		const caller = makeCaller()
		await expect(caller.replaceMount({deviceId: 'sdb', mountpoint: '/mnt/parity1'})).rejects.toThrow()
		await expect(caller.replaceMount({deviceId: 'sdb', mountpoint: '/etc/passwd'})).rejects.toThrow()
	})

	test('replaceFix / replaceCheck refuse a raw-device-shaped disk label', async () => {
		const caller = makeCaller()
		// A DEVICE_ID_RE-shaped token in the label slot is refused by the label zod
		// only if it violates the label regex — here we assert a shell-metachar label
		// is refused at the zod boundary.
		await expect(caller.replaceFix({disk: 'd2; rm'})).rejects.toThrow()
		await expect(caller.replaceCheck({disk: '../d2'})).rejects.toThrow()
	})

	test('forceSyncOverride requires the explicit confirm:true literal', async () => {
		const caller = makeCaller()
		await expect(caller.forceSyncOverride({confirm: false as any})).rejects.toThrow()
		await expect(caller.forceSyncOverride({} as any)).rejects.toThrow()
	})
})

describe('WR-03: replacement runbook enforces the linear step order server-side', () => {
	// A minimal protected pool seeded at a given runbookStep. All assertions below
	// reject INSIDE the resolver (assertRunbookStep) BEFORE any diff/fix/sync execa
	// runs — so they stay fully offline (no sudo / snapraid).
	const poolAt = (runbookStep?: string) => ({
		members: [{deviceId: 'sdb', role: 'data', mountpoint: '/mnt/disk2'}],
		protectionLevel: 'protected',
		safetyFreezeThreshold: {files: 500, percent: 20},
		runbookStep,
	})

	test('replaceSync refuses when the prior step is not a PASSING check', async () => {
		const caller = makeCaller({storeInitial: poolAt('replace:fixed')})
		await expect(caller.replaceSync()).rejects.toThrow(/out-of-order/)
	})

	test('replaceSync refuses after a BLOCKED (unrecoverable) check — never syncs over good parity', async () => {
		const caller = makeCaller({storeInitial: poolAt('replace:checked:blocked')})
		await expect(caller.replaceSync()).rejects.toThrow(/out-of-order/)
	})

	test('replaceFix refuses on a healthy pool that never went through format/mount', async () => {
		const caller = makeCaller({storeInitial: poolAt(undefined)})
		await expect(caller.replaceFix({disk: 'd2'})).rejects.toThrow(/out-of-order/)
	})

	test('replaceMount refuses unless the replacement disk was just formatted', async () => {
		const caller = makeCaller({storeInitial: poolAt('replace:mounted')})
		await expect(caller.replaceMount({deviceId: 'sdb', mountpoint: '/mnt/disk2'})).rejects.toThrow(/out-of-order/)
	})

	test('replaceCheck refuses unless a fix (or a prior check) preceded it', async () => {
		const caller = makeCaller({storeInitial: poolAt('replace:formatted')})
		await expect(caller.replaceCheck({disk: 'd2'})).rejects.toThrow(/out-of-order/)
	})
})

describe('poolStatus read query (isWsl2 hard-hide flag, D-14)', () => {
	test('with no pool: returns {pool:null, isWsl2:boolean, snapraid:null} — no destructive op', async () => {
		const caller = makeCaller({storeInitial: undefined})
		const result = await caller.poolStatus()
		expect(result.pool).toBeNull()
		expect(typeof result.isWsl2).toBe('boolean')
		expect(result.snapraid).toBeNull()
	})
})
