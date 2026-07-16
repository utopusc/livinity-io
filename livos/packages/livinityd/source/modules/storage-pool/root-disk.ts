// =========================================================================
// root-disk.ts — OS-disk resolver + eligible-internal-drive filter
// (Phase 318, POOL-04, D-10 gate 2 + gate 3). THE safety-critical net-new
// piece of the phase.
//
// ★ WHY THIS EXISTS: the pooling feature FORMATS whole disks. A candidate that
//   leaks the OS/boot/EFI backing disk into the eligible set destroys the OS
//   install, not a feature (threat T-318-05). Every downstream consumer — the
//   wizard eligible list (318-08), pool.ts `formatInternalDevice` membership
//   set (318-05), and the TOCTOU re-check before every destructive wrapper
//   call — reads the OS-disk exclusion THROUGH this module. The bash wrapper
//   (`livos-power.sh` / 318-01 `_refuse_system_disk`) re-validates the same
//   exclusion as belt-and-braces, but this TS list is the primary gate.
//
// ★ RESOLVER PORT (not the fragile df resolver): this is a faithful TS port of
//   `livos-power.sh`'s `_disk_for_mount()` + `_refuse_system_disk()` — the
//   codebase's ONLY robust root-disk resolver:
//       findmnt -no SOURCE <mp>   →   lsblk -no PKNAME <src>   (+ digit-strip fallback)
//   run for `/`, `/boot`, AND `/boot/efi`. We DELIBERATELY do NOT copy
//   `external-storage.ts` `isExternalDeviceConnectedOnUnsupportedDevice()`'s
//   df-based source string-split (Trap 15) — that resolver has no PKNAME and
//   silently mis-resolves LVM/mdadm/EFI roots (e.g. /dev/mapper/vg-root →
//   "vg-root", excluding nothing).
//
// ★ FAIL-SAFE (fail CLOSED): if the OS disk cannot be proven (resolution errors
//   or yields an empty set), we treat the state as "cannot assess" — the
//   eligible filter THROWS rather than offering every disk, and isOsDisk
//   returns true (refuse) for any id. An unresolved root must NEVER widen the
//   eligible set.
//
// ★ NO CACHE (Trap 9 / TOCTOU): `assertNotOsDisk` re-resolves findmnt/lsblk on
//   EVERY call, immediately before each destructive wrapper invocation. Disk
//   enumeration can change between the list build and the format call; a cached
//   verdict is a foot-gun. Nothing here is memoised.
//
// ★ UNPRIVILEGED read-only layer: findmnt/lsblk run at the SAME unprivileged
//   layer as `getBlockDevices()` (plain execa), NOT behind the sudo wrapper —
//   this is pure read-only enumeration.
//
// ★ OFFLINE-TESTABLE: all four external calls are injected via `RootDiskDeps`,
//   so root-disk.test.ts feeds canned findmnt/lsblk JSON with ZERO live disk
//   access (marathon standing rule).
// =========================================================================

import {$} from 'execa'

import {getBlockDevices} from '../files/external-storage.js'

// The mountpoints whose backing disk is off-limits. Any disk that backs ANY of
// these is excluded from the eligible set. `/` and `/boot` mirror the bash
// `_refuse_system_disk` pair; `/boot/efi` extends it for EFI-partition disks.
const OS_MOUNTPOINTS = ['/', '/boot', '/boot/efi'] as const

// A candidate disk as consumed by this module (a projection of getBlockDevices).
export interface CandidateDevice {
	id: string
	name: string
	size: number
	transport: 'unknown' | 'usb' | 'nvme'
}

// The eligible-internal drive shape returned to the wizard + pool.ts.
export interface EligibleDrive {
	id: string
	model: string
	size: number
	transport: 'unknown' | 'usb' | 'nvme'
}

// Injectable seam. Defaults shell out via execa (same style as getBlockDevices);
// tests supply canned data so no real lsblk/findmnt runs against the host.
export interface RootDiskDeps {
	// `findmnt -no SOURCE <mountpoint>` → the source device path (e.g. /dev/sda2),
	// or null when the mount does not exist / findmnt fails.
	findmntSource(mountpoint: string): Promise<string | null>
	// `lsblk -no PKNAME <source>` → the parent kernel disk name (e.g. sda), or
	// null when PKNAME is empty (forces the digit-strip fallback).
	lsblkPkname(source: string): Promise<string | null>
	// Candidate disks (`type==='disk'`), projected from getBlockDevices().
	listBlockDevices(): Promise<CandidateDevice[]>
	// `lsblk -d -n -o NAME,RM` → map of disk name → removable (RM===1). getBlockDevices
	// does not project RM, so this is a supplementary read (D-10 gate 3).
	listRemovableFlags(): Promise<Record<string, boolean>>
}

// Thrown when a disk cannot be proven safe (OS resolution failed/empty) or when
// a device IS the OS/boot/EFI disk. Callers MUST treat this as a hard refusal.
export class OsDiskResolutionError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'OsDiskResolutionError'
	}
}

// --- default (live) deps ---------------------------------------------------

const liveDeps: RootDiskDeps = {
	async findmntSource(mountpoint: string) {
		try {
			// -no SOURCE = no header, SOURCE column only. Exits non-zero if the mount
			// does not exist → execa rejects → caught → null (fail-safe, like bash
			// `2>/dev/null || return 0`).
			const {stdout} = await $`findmnt -no SOURCE ${mountpoint}`
			const first = stdout.split('\n')[0]?.trim()
			return first && first.length > 0 ? first : null
		} catch {
			return null
		}
	},
	async lsblkPkname(source: string) {
		try {
			const {stdout} = await $`lsblk -no PKNAME ${source}`
			const first = stdout.split('\n')[0]?.trim()
			return first && first.length > 0 ? first : null
		} catch {
			return null
		}
	},
	async listBlockDevices() {
		const devices = await getBlockDevices()
		return devices.map((device) => ({
			id: device.id,
			name: device.name,
			size: device.size,
			transport: device.transport,
		}))
	},
	async listRemovableFlags() {
		try {
			// -d = disks only, -n = no header, RM = removable flag (0/1).
			const {stdout} = await $`lsblk -d -n -o NAME,RM`
			const flags: Record<string, boolean> = {}
			for (const line of stdout.split('\n')) {
				const [name, rm] = line.trim().split(/\s+/)
				if (name) flags[name] = rm === '1'
			}
			return flags
		} catch {
			// Fail-safe read: on error, an empty map means "removable-status unknown".
			// This does NOT fall open — the OS-disk exclusion (the real safety gate)
			// is independent, and an unknown RM simply isn't used to widen the set.
			return {}
		}
	},
}

// --- resolver primitives (ports of livos-power.sh) -------------------------

// Port of `_disk_for_mount()`: resolve the parent kernel disk backing a mount.
// findmnt SOURCE → lsblk PKNAME, with a basename digit-strip fallback for a
// /dev/sdXN source when PKNAME is empty. Returns null (contributes NOTHING) on
// any failure — never a phantom disk name (fail-safe).
async function diskForMount(mountpoint: string, deps: RootDiskDeps): Promise<string | null> {
	let source: string | null
	try {
		source = await deps.findmntSource(mountpoint)
	} catch {
		return null
	}
	if (!source) return null

	let pkname: string | null
	try {
		pkname = await deps.lsblkPkname(source)
	} catch {
		pkname = null
	}
	if (pkname) return pkname

	// Fallback: strip a trailing partition number off a /dev/sdXN basename.
	// Mirrors bash `pk="${pk%%[0-9]*}"` — cut from the FIRST digit onward.
	// Only meaningful for plain sdX sources; LVM/mapper sources resolve via
	// PKNAME above (this fallback would not yield a real disk for them, so we
	// return null rather than a bogus name).
	const base = source.replace(/^.*\//, '') // basename
	const stripped = base.replace(/[0-9].*$/, '')
	// Reject a fallback that did not actually strip a partition digit or that
	// produced an empty / mapper-style name — better to contribute nothing than
	// a wrong disk.
	if (stripped && stripped !== base && /^[a-z]+$/.test(stripped)) return stripped
	return null
}

// Port of the `/` + `/boot` (+ EFI) union in `_refuse_system_disk()`: the SET of
// disks backing any OS mountpoint. A mount that does not resolve contributes
// nothing. An EMPTY result is the fail-safe signal (see callers): it means we
// could not prove which disk is the OS, NOT that there is no OS disk.
export async function resolveOsDisks(deps: RootDiskDeps = liveDeps): Promise<Set<string>> {
	const osDisks = new Set<string>()
	for (const mountpoint of OS_MOUNTPOINTS) {
		const disk = await diskForMount(mountpoint, deps)
		if (disk) osDisks.add(disk)
	}
	return osDisks
}

// --- eligible-internal filter (D-10 gate 2 + gate 3) -----------------------

// The candidate set that crosses into destructive-format territory. It is
// `listBlockDevices()` MINUS:
//   - usb-transport disks       (external — D-10 gate 3)
//   - removable (RM=1) disks    (card readers / hot-swap bays — D-10 gate 3)
//   - any OS/boot/EFI disk       (D-10 gate 2)
//
// FAIL-SAFE: if resolveOsDisks yields an EMPTY set we cannot prove which disk is
// the OS — we THROW rather than return a list we cannot vouch for. Callers (the
// wizard, pool.ts) surface this as a safe "cannot list drives right now" state;
// they NEVER receive every disk.
export async function getEligibleInternalDrives(deps: RootDiskDeps = liveDeps): Promise<EligibleDrive[]> {
	const osDisks = await resolveOsDisks(deps)
	if (osDisks.size === 0) {
		throw new OsDiskResolutionError(
			'Refusing to enumerate eligible drives: could not resolve the OS backing disk ' +
				'(findmnt/lsblk returned nothing for /, /boot, or /boot/efi). Failing closed so the ' +
				'OS disk can never leak into the format candidate set.',
		)
	}

	const [candidates, removable] = await Promise.all([deps.listBlockDevices(), deps.listRemovableFlags()])

	return candidates
		.filter((device) => device.transport !== 'usb') // gate 3: non-USB (internal)
		.filter((device) => removable[device.id] !== true) // gate 3: non-removable
		.filter((device) => !osDisks.has(device.id)) // gate 2: not the OS/boot/EFI disk
		.map((device) => ({
			id: device.id,
			model: device.name,
			size: device.size,
			transport: device.transport,
		}))
}

// --- TOCTOU re-check (Trap 9 — re-resolve, NEVER cache) --------------------

// True if `deviceId` backs the OS (/, /boot, or /boot/efi). RE-RESOLVES on every
// call — no cache. FAIL-SAFE: if the OS disk cannot be proven (empty resolution)
// we return TRUE (treat the device as if it were the OS disk), so an unknown
// state can never green-light a destructive call.
export async function isOsDisk(deviceId: string, deps: RootDiskDeps = liveDeps): Promise<boolean> {
	const osDisks = await resolveOsDisks(deps)
	if (osDisks.size === 0) return true // cannot prove safe → refuse
	return osDisks.has(deviceId)
}

// Guard called IMMEDIATELY before every destructive wrapper call (mkfs / wipe /
// pool-format). Re-resolves (no cache) and THROWS if `deviceId` is — or cannot
// be proven NOT to be — the OS/boot/EFI disk. This is the final TS-side gate;
// the bash wrapper re-checks again as belt-and-braces.
export async function assertNotOsDisk(deviceId: string, deps: RootDiskDeps = liveDeps): Promise<void> {
	if (await isOsDisk(deviceId, deps)) {
		throw new OsDiskResolutionError(
			`Refusing destructive operation on "${deviceId}": it backs the OS/boot/EFI install ` +
				'(or the OS disk could not be resolved — failing closed).',
		)
	}
}
