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
// ★ ZERO LIVE DISK ACCESS: every external call (findmnt, lsblk PKNAME, block-
//   device enumeration, removable-flag read) is injected via a `RootDiskDeps`
//   object. Tests feed canned findmnt/lsblk JSON — no execa, no real lsblk/
//   findmnt is ever executed against the host (marathon standing rule).

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
// box where /boot or /boot/efi may not be a separate mount). `pkname` maps a
// source path → the `lsblk -no PKNAME` result (null → forces the digit-strip
// fallback path). `candidates` are the `type==='disk'` block devices offered.
// `removable` maps a disk name → its lsblk RM flag (default false = fixed).

interface Candidate {
	id: string
	name?: string
	size?: number
	transport?: 'unknown' | 'usb' | 'nvme'
}

function makeDeps(config: {
	mounts: Record<string, string | null>
	pkname?: Record<string, string | null>
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
		async lsblkPkname(source: string) {
			return config.pkname && source in config.pkname ? config.pkname[source] : null
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

// A canonical single-OS-disk box: `/` sits on sda2 whose parent disk is sda.
// `/boot` and `/boot/efi` are NOT separate mounts (absent keys) — the common
// single-disk laptop/Pi/VPS reality.
const singleOsDisk = (candidates: Candidate[], extra?: Partial<Parameters<typeof makeDeps>[0]>) =>
	makeDeps({
		mounts: {'/': '/dev/sda2'},
		pkname: {'/dev/sda2': 'sda'},
		candidates,
		...extra,
	})

// =========================================================================
// resolveOsDisks — the primitive every gate reads through
// =========================================================================

describe('resolveOsDisks', () => {
	test('resolves / via findmnt SOURCE → lsblk PKNAME', async () => {
		const deps = singleOsDisk([{id: 'sda'}, {id: 'sdb'}])
		const osDisks = await resolveOsDisks(deps)
		expect(osDisks.has('sda')).toBe(true)
		expect(osDisks.has('sdb')).toBe(false)
	})

	test('includes a DISTINCT /boot disk (both / and /boot backing disks resolved)', async () => {
		const deps = makeDeps({
			mounts: {'/': '/dev/sda2', '/boot': '/dev/sdb1'},
			pkname: {'/dev/sda2': 'sda', '/dev/sdb1': 'sdb'},
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
			pkname: {'/dev/nvme0n1p2': 'nvme0n1', '/dev/sda1': 'sda'},
			candidates: [{id: 'nvme0n1', transport: 'nvme'}, {id: 'sda'}, {id: 'sdb'}],
		})
		const osDisks = await resolveOsDisks(deps)
		expect(osDisks.has('nvme0n1')).toBe(true) // root
		expect(osDisks.has('sda')).toBe(true) // EFI partition disk
		expect(osDisks.has('sdb')).toBe(false)
	})

	test('LVM/mdadm root resolves via PKNAME (the df-split resolver would break here)', async () => {
		// findmnt SOURCE of an LVM root is /dev/mapper/vg-root — no trailing digit,
		// so a df `.split('/').pop().replace(/\d+$/,'')` (Trap 15) yields "vg-root"
		// and NEVER excludes the real disk. PKNAME resolves it to the true parent.
		const deps = makeDeps({
			mounts: {'/': '/dev/mapper/vg0-root'},
			pkname: {'/dev/mapper/vg0-root': 'sda'},
			candidates: [{id: 'sda'}, {id: 'sdb'}],
		})
		const osDisks = await resolveOsDisks(deps)
		expect(osDisks.has('sda')).toBe(true)
	})

	test('digit-strip fallback when PKNAME is empty (/dev/sda2 → sda)', async () => {
		const deps = makeDeps({
			mounts: {'/': '/dev/sda2'},
			pkname: {'/dev/sda2': null}, // PKNAME failed → fallback
			candidates: [{id: 'sda'}, {id: 'sdb'}],
		})
		const osDisks = await resolveOsDisks(deps)
		expect(osDisks.has('sda')).toBe(true)
	})

	test('a mount that does not resolve contributes nothing (no phantom disk)', async () => {
		// / resolves; /boot is a separate mount whose source cannot be PKNAME-d and
		// has no strippable name → it must add NOTHING, never a bogus disk name.
		const deps = makeDeps({
			mounts: {'/': '/dev/sda2', '/boot': null},
			pkname: {'/dev/sda2': 'sda'},
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
			pkname: {'/dev/sdb1': 'sdb'},
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

	test('NEGATIVE: a DISTINCT /boot disk is EXCLUDED (both / and /boot disks gone)', async () => {
		const deps = makeDeps({
			mounts: {'/': '/dev/sda2', '/boot': '/dev/sdb1'},
			pkname: {'/dev/sda2': 'sda', '/dev/sdb1': 'sdb'},
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
			pkname: {'/dev/nvme0n1p2': 'nvme0n1', '/dev/sda1': 'sda'},
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

	test('assertNotOsDisk throws for the OS disk, resolves for a spare', async () => {
		const deps = singleOsDisk([{id: 'sda'}, {id: 'sdb'}])
		await expect(assertNotOsDisk('sda', deps)).rejects.toBeInstanceOf(OsDiskResolutionError)
		await expect(assertNotOsDisk('sdb', deps)).resolves.toBeUndefined()
	})

	test('assertNotOsDisk throws for a distinct /boot disk too', async () => {
		const deps = makeDeps({
			mounts: {'/': '/dev/sda2', '/boot': '/dev/sdb1'},
			pkname: {'/dev/sda2': 'sda', '/dev/sdb1': 'sdb'},
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
			async lsblkPkname(source) {
				return source === '/dev/sda2' ? 'sda' : source === '/dev/sdb2' ? 'sdb' : null
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
