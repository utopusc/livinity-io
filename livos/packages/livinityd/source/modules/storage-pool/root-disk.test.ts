// Phase 318 (POOL-04, D-10 gate 2 + gate 3) — root-disk.ts OS-disk resolver +
// eligible-internal-drive filter tests.
//
// ★ THIS IS THE SAFETY-CRITICAL TEST FILE OF THE PHASE. A wrong OS-disk
//   exclusion formats the OS install, not a feature. The correctness of the
//   resolver is proven HERE by EXPLICIT NEGATIVE fixtures — the OS disk (and,
//   separately, a distinct /boot disk and an EFI /boot/efi disk) is deliberately
//   OFFERED as a candidate and MUST be absent from the eligible set (D-16
//   mandate: negatives proven by fixtures, never asserted by comment).
//
// ★ CR-01 REGRESSION COVERAGE: the resolver walks the WHOLE-DISK ancestor tree
//   (lsblk -rsno NAME,TYPE), so a stacked root — LVM, LUKS, mdadm, or an NVMe
//   partition — must exclude the actual PHYSICAL disk(s), never the intermediate
//   backing partition. The `ancestors` fixtures below model what the real
//   `lsblk -rsno NAME,TYPE <src>` walk returns for each layout (e.g. an LVM root
//   yields ['sda'], a mdadm mirror yields ['sda','sdb'] — BOTH excluded). The
//   previous fixture hardcoded a single-hop PKNAME of 'sda', which MASKED the
//   real two-hop chain where PKNAME returns the partition 'sda3'.
//
// ★ ZERO LIVE DISK ACCESS: every external call (findmnt, lsblk ancestor walk,
//   block-device enumeration, removable-flag read) is injected via a
//   `RootDiskDeps` object. Tests feed canned findmnt/lsblk data — no execa, no
//   real lsblk/findmnt is ever executed against the host (marathon standing rule).

import {describe, expect, test} from 'vitest'

import {
	assertNotOsDisk,
	getEligibleInternalDrives,
	isOsDisk,
	OsDiskResolutionError,
	resolveOsDisks,
	type RootDiskDeps,
} from './root-disk.js'

// --- Injectable-fixture builder -------------------------------------------
//
// Builds a RootDiskDeps whose four functions return canned data instead of
// shelling out. `mounts` maps a mountpoint → the `findmnt -no SOURCE` result
// (an ABSENT key means "this mount does not exist" → null, exactly like a real
// box where /boot or /boot/efi may not be a separate mount). `ancestors` maps a
// source path → the `lsblk -rsno NAME,TYPE` TYPE=disk rows (the physical whole
// disk(s) backing that source; an ABSENT key or [] forces the nvme/mmcblk-aware
// digit-strip fallback). `candidates` are the `type==='disk'` block devices
// offered. `removable` maps a disk name → its lsblk RM flag (default false).

interface Candidate {
	id: string
	name?: string
	size?: number
	transport?: 'unknown' | 'usb' | 'nvme'
}

function makeDeps(config: {
	mounts: Record<string, string | null>
	ancestors?: Record<string, string[]>
	candidates: Candidate[]
	removable?: Record<string, boolean>
	// If set, findmntSource throws for these mountpoints (simulates execa reject).
	throwOnFindmnt?: string[]
}): RootDiskDeps {
	return {
		async findmntSource(mountpoint: string) {
			if (config.throwOnFindmnt?.includes(mountpoint)) {
				throw new Error(`findmnt: ${mountpoint} exploded`)
			}
			// Absent key => mount does not exist => null (mirrors findmnt exit 1).
			return mountpoint in config.mounts ? config.mounts[mountpoint] : null
		},
		async lsblkAncestorDisks(source: string) {
			return config.ancestors && source in config.ancestors ? config.ancestors[source] : []
		},
		async listBlockDevices() {
			return config.candidates.map((candidate) => ({
				id: candidate.id,
				name: candidate.name ?? 'Untitled',
				size: candidate.size ?? 1_000_000_000_000,
				transport: candidate.transport ?? ('unknown' as const),
			}))
		},
		async listRemovableFlags() {
			return config.removable ?? {}
		},
	}
}

// A canonical single-OS-disk box: `/` sits on sda2 whose whole disk is sda.
// `/boot` and `/boot/efi` are NOT separate mounts (absent keys) — the common
// single-disk laptop/Pi/VPS reality.
const singleOsDisk = (candidates: Candidate[], extra?: Partial<Parameters<typeof makeDeps>[0]>) =>
	makeDeps({
		mounts: {'/': '/dev/sda2'},
		ancestors: {'/dev/sda2': ['sda']},
		candidates,
		...extra,
	})

// =========================================================================
// resolveOsDisks — the primitive every gate reads through
// =========================================================================

describe('resolveOsDisks', () => {
	test('resolves / via findmnt SOURCE → lsblk whole-disk walk', async () => {
		const deps = singleOsDisk([{id: 'sda'}, {id: 'sdb'}])
		const osDisks = await resolveOsDisks(deps)
		expect(osDisks.has('sda')).toBe(true)
		expect(osDisks.has('sdb')).toBe(false)
	})

	test('includes a DISTINCT /boot disk (both / and /boot backing disks resolved)', async () => {
		const deps = makeDeps({
			mounts: {'/': '/dev/sda2', '/boot': '/dev/sdb1'},
			ancestors: {'/dev/sda2': ['sda'], '/dev/sdb1': ['sdb']},
			candidates: [{id: 'sda'}, {id: 'sdb'}, {id: 'sdc'}],
		})
		const osDisks = await resolveOsDisks(deps)
		expect(osDisks.has('sda')).toBe(true)
		expect(osDisks.has('sdb')).toBe(true) // the /boot disk
		expect(osDisks.has('sdc')).toBe(false)
	})

	test('includes an EFI /boot/efi backing disk', async () => {
		const deps = makeDeps({
			mounts: {'/': '/dev/nvme0n1p2', '/boot/efi': '/dev/sda1'},
			ancestors: {'/dev/nvme0n1p2': ['nvme0n1'], '/dev/sda1': ['sda']},
			candidates: [{id: 'nvme0n1', transport: 'nvme'}, {id: 'sda'}, {id: 'sdb'}],
		})
		const osDisks = await resolveOsDisks(deps)
		expect(osDisks.has('nvme0n1')).toBe(true) // root
		expect(osDisks.has('sda')).toBe(true) // EFI partition disk
		expect(osDisks.has('sdb')).toBe(false)
	})

	// --- CR-01: stacked roots must resolve to the WHOLE DISK, not the partition ---

	test('CR-01 plain partition root: sda3 → sda (whole disk, not the partition)', async () => {
		// A BIOS-boot plain root on /dev/sda3 with no ESP: the ancestor walk must
		// yield the whole disk sda, so a candidate "sda" is excluded.
		const deps = makeDeps({
			mounts: {'/': '/dev/sda3'},
			ancestors: {'/dev/sda3': ['sda']},
			candidates: [{id: 'sda'}, {id: 'sdb'}],
		})
		const osDisks = await resolveOsDisks(deps)
		expect(osDisks.has('sda')).toBe(true)
		expect(osDisks.has('sda3')).toBe(false) // never the partition name
	})

	test('CR-01 LVM root (dm-0 → sda3 → sda): excludes the WHOLE disk sda', async () => {
		// The exact case the old fixture MASKED: real `lsblk -no PKNAME
		// /dev/mapper/vg0-root` returns the backing partition "sda3", NOT "sda".
		// The whole-disk walk (lsblk -rsno NAME,TYPE) reports TYPE=disk → sda.
		const deps = makeDeps({
			mounts: {'/': '/dev/mapper/vg0-root'},
			ancestors: {'/dev/mapper/vg0-root': ['sda']},
			candidates: [{id: 'sda'}, {id: 'sdb'}],
		})
		const osDisks = await resolveOsDisks(deps)
		expect(osDisks.has('sda')).toBe(true)
		expect(osDisks.has('sda3')).toBe(false)
	})

	test('CR-01 LUKS-on-partition root (cryptroot → sda3 → sda): excludes sda', async () => {
		const deps = makeDeps({
			mounts: {'/': '/dev/mapper/cryptroot'},
			ancestors: {'/dev/mapper/cryptroot': ['sda']},
			candidates: [{id: 'sda'}, {id: 'sdb'}],
		})
		const osDisks = await resolveOsDisks(deps)
		expect(osDisks.has('sda')).toBe(true)
	})

	test('CR-01 mdadm root (md0 → sda3 + sdb3): excludes ALL backing disks', async () => {
		// A mdadm mirror backs / from TWO partitions on TWO disks — the walk yields
		// BOTH physical disks and EVERY one must be excluded.
		const deps = makeDeps({
			mounts: {'/': '/dev/md0'},
			ancestors: {'/dev/md0': ['sda', 'sdb']},
			candidates: [{id: 'sda'}, {id: 'sdb'}, {id: 'sdc'}],
		})
		const osDisks = await resolveOsDisks(deps)
		expect(osDisks.has('sda')).toBe(true)
		expect(osDisks.has('sdb')).toBe(true)
		expect(osDisks.has('sdc')).toBe(false)
	})

	test('CR-01 NVMe stacked root (nvme0n1p2 → nvme0n1): excludes the whole nvme disk', async () => {
		const deps = makeDeps({
			mounts: {'/': '/dev/nvme0n1p2'},
			ancestors: {'/dev/nvme0n1p2': ['nvme0n1']},
			candidates: [{id: 'nvme0n1', transport: 'nvme'}, {id: 'sdb'}],
		})
		const osDisks = await resolveOsDisks(deps)
		expect(osDisks.has('nvme0n1')).toBe(true)
		expect(osDisks.has('nvme0n1p2')).toBe(false)
	})

	// --- IN-02 / CR-01 fallback: nvme/mmcblk-aware digit-strip when lsblk gives no disk ---

	test('fallback (no disk ancestor) sd: /dev/sda2 → sda', async () => {
		const deps = makeDeps({
			mounts: {'/': '/dev/sda2'},
			ancestors: {'/dev/sda2': []}, // ancestor walk empty → fallback strip
			candidates: [{id: 'sda'}, {id: 'sdb'}],
		})
		const osDisks = await resolveOsDisks(deps)
		expect(osDisks.has('sda')).toBe(true)
	})

	test('IN-02 fallback nvme: /dev/nvme0n1p2 → nvme0n1 (NOT "nvme")', async () => {
		const deps = makeDeps({
			mounts: {'/': '/dev/nvme0n1p2'},
			ancestors: {'/dev/nvme0n1p2': []}, // force fallback
			candidates: [{id: 'nvme0n1', transport: 'nvme'}, {id: 'sdb'}],
		})
		const osDisks = await resolveOsDisks(deps)
		expect(osDisks.has('nvme0n1')).toBe(true)
		expect(osDisks.has('nvme')).toBe(false) // the old digit-strip bug
	})

	test('IN-02 fallback mmcblk: /dev/mmcblk0p1 → mmcblk0 (NOT "mmcblk")', async () => {
		const deps = makeDeps({
			mounts: {'/': '/dev/mmcblk0p1'},
			ancestors: {'/dev/mmcblk0p1': []}, // force fallback
			candidates: [{id: 'mmcblk0'}, {id: 'sdb'}],
		})
		const osDisks = await resolveOsDisks(deps)
		expect(osDisks.has('mmcblk0')).toBe(true)
		expect(osDisks.has('mmcblk')).toBe(false)
	})

	test('fallback refuses a mapper/lvm basename (no disk ancestor → contributes nothing)', async () => {
		// When even the ancestor walk fails on an LVM source, the basename
		// "vg0-root" is NOT a strippable partition → contributes NOTHING rather than
		// a bogus disk name.
		const deps = makeDeps({
			mounts: {'/': '/dev/mapper/vg0-root'},
			ancestors: {}, // walk yields nothing
			candidates: [{id: 'sda'}, {id: 'sdb'}],
		})
		const osDisks = await resolveOsDisks(deps)
		expect(osDisks.size).toBe(0)
	})

	test('a mount that does not resolve contributes nothing (no phantom disk)', async () => {
		// / resolves; /boot is a separate mount whose source cannot be walked and
		// has no strippable name → it must add NOTHING, never a bogus disk name.
		const deps = makeDeps({
			mounts: {'/': '/dev/sda2', '/boot': '/dev/mapper/vg0-boot'},
			ancestors: {'/dev/sda2': ['sda']},
			candidates: [{id: 'sda'}, {id: 'sdb'}],
		})
		const osDisks = await resolveOsDisks(deps)
		expect(osDisks.has('sda')).toBe(true)
		expect(osDisks.size).toBe(1)
	})

	test('FAIL-SAFE: root unresolvable → empty set (never a false "no OS disk")', async () => {
		// findmnt returns nothing for every mount → we genuinely cannot prove which
		// disk is the OS. resolveOsDisks returns EMPTY; the eligible filter (below)
		// must then fail CLOSED, not offer every disk.
		const deps = makeDeps({
			mounts: {}, // nothing resolves
			candidates: [{id: 'sda'}, {id: 'sdb'}],
		})
		const osDisks = await resolveOsDisks(deps)
		expect(osDisks.size).toBe(0)
	})

	test('findmnt throwing for / is caught (contributes nothing, does not crash)', async () => {
		const deps = makeDeps({
			mounts: {'/boot': '/dev/sdb1'},
			ancestors: {'/dev/sdb1': ['sdb']},
			candidates: [{id: 'sda'}, {id: 'sdb'}],
			throwOnFindmnt: ['/'],
		})
		const osDisks = await resolveOsDisks(deps)
		// / blew up → contributes nothing; /boot still resolved.
		expect(osDisks.has('sda')).toBe(false)
		expect(osDisks.has('sdb')).toBe(true)
	})
})

// =========================================================================
// getEligibleInternalDrives — the candidate set that crosses into
// destructive-format territory. THE OS DISK MUST NEVER BE IN IT.
// =========================================================================

describe('getEligibleInternalDrives', () => {
	test('happy 2-drive: OS disk excluded, two spare internals eligible', async () => {
		const deps = singleOsDisk([
			{id: 'sda', name: 'OS SSD'}, // the OS disk — offered but MUST be rejected
			{id: 'sdb', name: 'Spare 1'},
			{id: 'sdc', name: 'Spare 2'},
		])
		const eligible = await getEligibleInternalDrives(deps)
		const ids = eligible.map((drive) => drive.id)
		expect(ids).toEqual(['sdb', 'sdc'])
		expect(ids).not.toContain('sda') // OS disk excluded from eligible set
	})

	test('NEGATIVE: the OS disk offered as a candidate is EXCLUDED', async () => {
		const deps = singleOsDisk([{id: 'sda'}, {id: 'sdb'}])
		const eligible = await getEligibleInternalDrives(deps)
		expect(eligible.some((drive) => drive.id === 'sda')).toBe(false)
	})

	test('CR-01 NEGATIVE: LVM-root whole disk is EXCLUDED (not just its partition)', async () => {
		// The core CR-01 fix: root on /dev/mapper/vg0-root whose whole disk is sda —
		// sda MUST NOT be offered for format even though PKNAME would say "sda3".
		const deps = makeDeps({
			mounts: {'/': '/dev/mapper/vg0-root'},
			ancestors: {'/dev/mapper/vg0-root': ['sda']},
			candidates: [{id: 'sda', name: 'OS SSD'}, {id: 'sdb'}, {id: 'sdc'}],
		})
		const ids = (await getEligibleInternalDrives(deps)).map((d) => d.id)
		expect(ids).toEqual(['sdb', 'sdc'])
		expect(ids).not.toContain('sda') // the LVM-backed OS disk is NOT eligible
	})

	test('CR-01 NEGATIVE: LUKS-root whole disk is EXCLUDED', async () => {
		const deps = makeDeps({
			mounts: {'/': '/dev/mapper/cryptroot'},
			ancestors: {'/dev/mapper/cryptroot': ['sda']},
			candidates: [{id: 'sda'}, {id: 'sdb'}],
		})
		const ids = (await getEligibleInternalDrives(deps)).map((d) => d.id)
		expect(ids).toEqual(['sdb'])
		expect(ids).not.toContain('sda')
	})

	test('CR-01 NEGATIVE: mdadm root excludes BOTH backing disks', async () => {
		const deps = makeDeps({
			mounts: {'/': '/dev/md0'},
			ancestors: {'/dev/md0': ['sda', 'sdb']},
			candidates: [{id: 'sda'}, {id: 'sdb'}, {id: 'sdc'}],
		})
		const ids = (await getEligibleInternalDrives(deps)).map((d) => d.id)
		expect(ids).toEqual(['sdc'])
		expect(ids).not.toContain('sda')
		expect(ids).not.toContain('sdb') // the SECOND mdadm member is also excluded
	})

	test('CR-01 NEGATIVE: NVMe stacked root excludes the whole nvme disk', async () => {
		const deps = makeDeps({
			mounts: {'/': '/dev/nvme0n1p2'},
			ancestors: {'/dev/nvme0n1p2': ['nvme0n1']},
			candidates: [{id: 'nvme0n1', transport: 'nvme'}, {id: 'sdb'}],
		})
		const ids = (await getEligibleInternalDrives(deps)).map((d) => d.id)
		expect(ids).toEqual(['sdb'])
		expect(ids).not.toContain('nvme0n1')
	})

	test('NEGATIVE: a DISTINCT /boot disk is EXCLUDED (both / and /boot disks gone)', async () => {
		const deps = makeDeps({
			mounts: {'/': '/dev/sda2', '/boot': '/dev/sdb1'},
			ancestors: {'/dev/sda2': ['sda'], '/dev/sdb1': ['sdb']},
			candidates: [{id: 'sda'}, {id: 'sdb'}, {id: 'sdc'}],
		})
		const eligible = await getEligibleInternalDrives(deps)
		const ids = eligible.map((drive) => drive.id)
		expect(ids).toEqual(['sdc'])
		expect(ids).not.toContain('sda')
		expect(ids).not.toContain('sdb') // the /boot disk is NOT eligible
	})

	test('NEGATIVE: an EFI /boot/efi partition disk is EXCLUDED', async () => {
		const deps = makeDeps({
			mounts: {'/': '/dev/nvme0n1p2', '/boot/efi': '/dev/sda1'},
			ancestors: {'/dev/nvme0n1p2': ['nvme0n1'], '/dev/sda1': ['sda']},
			candidates: [{id: 'nvme0n1', transport: 'nvme'}, {id: 'sda'}, {id: 'sdb'}],
		})
		const eligible = await getEligibleInternalDrives(deps)
		const ids = eligible.map((drive) => drive.id)
		expect(ids).toEqual(['sdb'])
		expect(ids).not.toContain('sda') // EFI disk excluded
		expect(ids).not.toContain('nvme0n1') // root excluded
	})

	test('NEGATIVE: a USB-transport disk is EXCLUDED (D-10 gate 3)', async () => {
		const deps = singleOsDisk([
			{id: 'sda'},
			{id: 'sdb', transport: 'usb'}, // external USB — not internal, excluded
			{id: 'sdc', transport: 'unknown'},
		])
		const eligible = await getEligibleInternalDrives(deps)
		const ids = eligible.map((drive) => drive.id)
		expect(ids).toEqual(['sdc'])
		expect(ids).not.toContain('sdb')
	})

	test('NEGATIVE: a REMOVABLE (RM=1) disk is EXCLUDED (D-10 gate 3)', async () => {
		const deps = singleOsDisk([{id: 'sda'}, {id: 'sdb'}, {id: 'sdc'}], {
			removable: {sdb: true}, // removable SATA bay / card reader — excluded
		})
		const eligible = await getEligibleInternalDrives(deps)
		const ids = eligible.map((drive) => drive.id)
		expect(ids).toEqual(['sdc'])
		expect(ids).not.toContain('sdb')
	})

	test('edge: 0 eligible drives (OS-only box) → empty list, no crash, no OS disk', async () => {
		const deps = singleOsDisk([{id: 'sda'}])
		const eligible = await getEligibleInternalDrives(deps)
		expect(eligible).toEqual([])
	})

	test('edge: exactly 1 eligible drive → single-entry list', async () => {
		const deps = singleOsDisk([{id: 'sda'}, {id: 'sdb'}])
		const eligible = await getEligibleInternalDrives(deps)
		expect(eligible.map((drive) => drive.id)).toEqual(['sdb'])
	})

	test('FAIL-SAFE: unresolvable OS disk → THROWS, never offers every disk', async () => {
		// The most dangerous fall-open: if we cannot prove which disk is the OS, an
		// empty exclusion set would offer sda AND sdb for formatting. Must fail CLOSED.
		const deps = makeDeps({
			mounts: {}, // OS disk unresolvable
			candidates: [{id: 'sda'}, {id: 'sdb'}],
		})
		await expect(getEligibleInternalDrives(deps)).rejects.toBeInstanceOf(OsDiskResolutionError)
	})

	test('returns model/size/transport for downstream wizard + pool.ts', async () => {
		const deps = singleOsDisk([
			{id: 'sda'},
			{id: 'sdb', name: 'WDC WD40EFRX', size: 4_000_787_030_016, transport: 'unknown'},
		])
		const [drive] = await getEligibleInternalDrives(deps)
		expect(drive).toMatchObject({
			id: 'sdb',
			model: 'WDC WD40EFRX',
			size: 4_000_787_030_016,
			transport: 'unknown',
		})
	})
})

// =========================================================================
// isOsDisk / assertNotOsDisk — the TOCTOU re-check used before every
// destructive call (re-resolve, NEVER cache — Trap 9)
// =========================================================================

describe('isOsDisk / assertNotOsDisk', () => {
	test('isOsDisk(OS disk) === true, isOsDisk(spare) === false', async () => {
		const deps = singleOsDisk([{id: 'sda'}, {id: 'sdb'}])
		expect(await isOsDisk('sda', deps)).toBe(true)
		expect(await isOsDisk('sdb', deps)).toBe(false)
	})

	test('CR-01: isOsDisk(whole LVM disk) === true (partition name never leaks)', async () => {
		const deps = makeDeps({
			mounts: {'/': '/dev/mapper/vg0-root'},
			ancestors: {'/dev/mapper/vg0-root': ['sda']},
			candidates: [{id: 'sda'}, {id: 'sdb'}],
		})
		expect(await isOsDisk('sda', deps)).toBe(true)
		expect(await isOsDisk('sda3', deps)).toBe(false) // the partition is not a candidate id
		expect(await isOsDisk('sdb', deps)).toBe(false)
	})

	test('assertNotOsDisk throws for the OS disk, resolves for a spare', async () => {
		const deps = singleOsDisk([{id: 'sda'}, {id: 'sdb'}])
		await expect(assertNotOsDisk('sda', deps)).rejects.toBeInstanceOf(OsDiskResolutionError)
		await expect(assertNotOsDisk('sdb', deps)).resolves.toBeUndefined()
	})

	test('CR-01: assertNotOsDisk throws for the whole disk of a mdadm root', async () => {
		const deps = makeDeps({
			mounts: {'/': '/dev/md0'},
			ancestors: {'/dev/md0': ['sda', 'sdb']},
			candidates: [{id: 'sda'}, {id: 'sdb'}, {id: 'sdc'}],
		})
		await expect(assertNotOsDisk('sda', deps)).rejects.toBeInstanceOf(OsDiskResolutionError)
		await expect(assertNotOsDisk('sdb', deps)).rejects.toBeInstanceOf(OsDiskResolutionError)
		await expect(assertNotOsDisk('sdc', deps)).resolves.toBeUndefined()
	})

	test('assertNotOsDisk throws for a distinct /boot disk too', async () => {
		const deps = makeDeps({
			mounts: {'/': '/dev/sda2', '/boot': '/dev/sdb1'},
			ancestors: {'/dev/sda2': ['sda'], '/dev/sdb1': ['sdb']},
			candidates: [{id: 'sda'}, {id: 'sdb'}, {id: 'sdc'}],
		})
		await expect(assertNotOsDisk('sdb', deps)).rejects.toBeInstanceOf(OsDiskResolutionError)
		await expect(assertNotOsDisk('sdc', deps)).resolves.toBeUndefined()
	})

	test('FAIL-SAFE: unprovable OS resolution → isOsDisk true, assertNotOsDisk throws for ANY id', async () => {
		// Cannot prove which disk is the OS → treat EVERY device as if it were the
		// OS disk (refuse), never green-light a destructive call on an unknown state.
		const deps = makeDeps({mounts: {}, candidates: [{id: 'sda'}, {id: 'sdb'}]})
		expect(await isOsDisk('sda', deps)).toBe(true)
		expect(await isOsDisk('sdb', deps)).toBe(true)
		await expect(assertNotOsDisk('sdb', deps)).rejects.toBeInstanceOf(OsDiskResolutionError)
	})

	test('re-resolves on EACH call (no cached eligible set — Trap 9 TOCTOU)', async () => {
		// A disk that was a spare a moment ago can become the OS disk between the
		// list build and the destructive call; assertNotOsDisk must see the NEW
		// resolution, not a stale one. We prove re-resolution by flipping the fixture
		// between calls and observing the changed verdict.
		let rootSource = '/dev/sda2'
		const deps: RootDiskDeps = {
			async findmntSource(mountpoint) {
				return mountpoint === '/' ? rootSource : null
			},
			async lsblkAncestorDisks(source) {
				return source === '/dev/sda2' ? ['sda'] : source === '/dev/sdb2' ? ['sdb'] : []
			},
			async listBlockDevices() {
				return [
					{id: 'sda', name: 'a', size: 1, transport: 'unknown'},
					{id: 'sdb', name: 'b', size: 1, transport: 'unknown'},
				]
			},
			async listRemovableFlags() {
				return {}
			},
		}
		// Initially sdb is a safe spare.
		await expect(assertNotOsDisk('sdb', deps)).resolves.toBeUndefined()
		// The OS root moves to sdb (e.g. disks re-enumerated). A cached resolver
		// would still say sdb is safe — the re-resolving one must now REFUSE it.
		rootSource = '/dev/sdb2'
		await expect(assertNotOsDisk('sdb', deps)).rejects.toBeInstanceOf(OsDiskResolutionError)
	})
})
