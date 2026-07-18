// Phase 339-02 (STORD-02, D-339-2) — LUKS eligibility filter tests.
//
// ★ THE SAFETY SEAM. `filterLuksEligible` is the pure, Windows-testable core that
//   decides which disks may be OFFERED for a destructive `luksFormat`. Every
//   excluded class is proven by an EXPLICIT NEGATIVE fixture (a disk deliberately
//   OFFERED that MUST be dropped): a pool member, an already-encrypted disk, and a
//   non-empty / partitioned / mounted disk. The OS/boot/EFI + USB + removable
//   exclusions are proven in root-disk.test.ts (reused VERBATIM — not re-proven
//   here), so these tests feed only the ALREADY-internal set.
//
// ★ FAIL-CLOSED: getLuksEligibleDisks must let an OsDiskResolutionError from
//   getEligibleInternalDrives propagate (never offer a list it cannot vouch for).
//
// ★ ZERO LIVE DISK ACCESS: the pure filter takes plain fixtures; the wrapper test
//   injects a stub `LuksEligibilityDeps` — no execa, no real lsblk.

import {describe, expect, test} from 'vitest'

import {OsDiskResolutionError, type EligibleDrive} from './root-disk.js'
import {filterLuksEligible, getLuksEligibleDisks, type LuksEligibilityDeps} from './luks-eligibility.js'

function drive(id: string, extra?: Partial<EligibleDrive>): EligibleDrive {
	return {id, model: extra?.model ?? 'Disk', size: extra?.size ?? 1_000_000_000_000, transport: extra?.transport ?? 'unknown'}
}

// All-empty maps → the "everything eligible" baseline the negatives subtract from.
const allEmpty = (ids: string[]): Record<string, boolean> => Object.fromEntries(ids.map((id) => [id, true]))

describe('filterLuksEligible (pure core)', () => {
	test('happy: internal, empty, non-pool, non-encrypted disks pass', () => {
		const internal = [drive('sdb'), drive('sdc')]
		const out = filterLuksEligible(internal, {
			poolMemberIds: new Set(),
			encryptedIds: new Set(),
			emptiness: allEmpty(['sdb', 'sdc']),
		})
		expect(out.map((d) => d.id)).toEqual(['sdb', 'sdc'])
	})

	test('NEGATIVE: a POOL MEMBER offered as a candidate is EXCLUDED (D-339-2)', () => {
		const internal = [drive('sdb'), drive('sdc')]
		const out = filterLuksEligible(internal, {
			poolMemberIds: new Set(['sdb']),
			encryptedIds: new Set(),
			emptiness: allEmpty(['sdb', 'sdc']),
		})
		expect(out.map((d) => d.id)).toEqual(['sdc'])
		expect(out.some((d) => d.id === 'sdb')).toBe(false)
	})

	test('NEGATIVE: an ALREADY-ENCRYPTED disk is EXCLUDED (never re-offered)', () => {
		const internal = [drive('sdb'), drive('sdc')]
		const out = filterLuksEligible(internal, {
			poolMemberIds: new Set(),
			encryptedIds: new Set(['sdc']),
			emptiness: allEmpty(['sdb', 'sdc']),
		})
		expect(out.map((d) => d.id)).toEqual(['sdb'])
	})

	test('NEGATIVE: a NON-EMPTY / partitioned / mounted disk is EXCLUDED (emptiness !== true)', () => {
		const internal = [drive('sdb'), drive('sdc'), drive('sdd')]
		const out = filterLuksEligible(internal, {
			poolMemberIds: new Set(),
			encryptedIds: new Set(),
			// sdc is non-empty (false); sdd was never probed (absent key) → both excluded.
			emptiness: {sdb: true, sdc: false},
		})
		expect(out.map((d) => d.id)).toEqual(['sdb'])
		expect(out.some((d) => d.id === 'sdc')).toBe(false)
		expect(out.some((d) => d.id === 'sdd')).toBe(false)
	})

	test('NEGATIVE: a DEVICE_ID_RE-invalid id never passes even if flagged empty', () => {
		const internal = [drive('sda1'), drive('sda; reboot'), drive('/dev/sdb'), drive('sdb')]
		const out = filterLuksEligible(internal, {
			poolMemberIds: new Set(),
			encryptedIds: new Set(),
			emptiness: {'sda1': true, 'sda; reboot': true, '/dev/sdb': true, 'sdb': true},
		})
		expect(out.map((d) => d.id)).toEqual(['sdb'])
	})

	test('combined: only the disk clearing ALL exclusions survives', () => {
		const internal = [drive('sdb'), drive('sdc'), drive('sdd'), drive('sde')]
		const out = filterLuksEligible(internal, {
			poolMemberIds: new Set(['sdb']), // pool member
			encryptedIds: new Set(['sdc']), // already encrypted
			emptiness: {sdb: true, sdc: true, sdd: false, sde: true}, // sdd non-empty
		})
		expect(out.map((d) => d.id)).toEqual(['sde'])
	})

	test('empty candidate set → empty result (OS-only box, no crash)', () => {
		expect(filterLuksEligible([], {poolMemberIds: new Set(), encryptedIds: new Set(), emptiness: {}})).toEqual([])
	})
})

describe('getLuksEligibleDisks (live wrapper composition)', () => {
	function stubDeps(over: Partial<LuksEligibilityDeps>): LuksEligibilityDeps {
		return {
			listInternalDrives: async () => [drive('sdb'), drive('sdc')],
			listPoolMemberIds: async () => [],
			listEncryptedIds: async () => [],
			isEmptyDisk: async () => true,
			...over,
		}
	}

	test('composes the exclusions and returns the pure-filtered set', async () => {
		const out = await getLuksEligibleDisks(
			stubDeps({
				listInternalDrives: async () => [drive('sdb'), drive('sdc'), drive('sdd')],
				listPoolMemberIds: async () => ['sdb'],
				listEncryptedIds: async () => ['sdc'],
				isEmptyDisk: async (id) => id === 'sdd',
			}),
		)
		expect(out.map((d) => d.id)).toEqual(['sdd'])
	})

	test('FAIL-CLOSED: an OsDiskResolutionError from listInternalDrives propagates (offers NOTHING)', async () => {
		await expect(
			getLuksEligibleDisks(
				stubDeps({
					listInternalDrives: async () => {
						throw new OsDiskResolutionError('cannot resolve OS disk')
					},
				}),
			),
		).rejects.toBeInstanceOf(OsDiskResolutionError)
	})

	test('an emptiness-probe throw resolves to non-empty (excluded), never crashes the list', async () => {
		const out = await getLuksEligibleDisks(
			stubDeps({
				listInternalDrives: async () => [drive('sdb'), drive('sdc')],
				isEmptyDisk: async (id) => {
					if (id === 'sdc') throw new Error('lsblk exploded')
					return true
				},
			}),
		)
		expect(out.map((d) => d.id)).toEqual(['sdb'])
	})

	test('does NOT probe emptiness for pool members / encrypted disks (skipped before the probe)', async () => {
		const probed: string[] = []
		const out = await getLuksEligibleDisks(
			stubDeps({
				listInternalDrives: async () => [drive('sdb'), drive('sdc')],
				listPoolMemberIds: async () => ['sdb'],
				isEmptyDisk: async (id) => {
					probed.push(id)
					return true
				},
			}),
		)
		expect(out.map((d) => d.id)).toEqual(['sdc'])
		expect(probed).toEqual(['sdc']) // sdb (pool member) was never probed
	})
})
