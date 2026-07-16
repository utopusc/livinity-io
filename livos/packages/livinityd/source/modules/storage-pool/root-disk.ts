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
// ★ RESOLVER (walk to the WHOLE DISK, CR-01): resolve each OS mountpoint to the
//   PHYSICAL whole-disk(s) that back it:
//       findmnt -no SOURCE <mp>   →   lsblk -rsno NAME,TYPE <src>  (take every TYPE=disk row)
//   run for `/`, `/boot`, AND `/boot/efi`. `lsblk -s` walks the INVERSE dependency
//   tree (device → … → physical disk), so a stacked root — LVM (/dev/mapper/vg-root),
//   LUKS (/dev/mapper/cryptroot), mdadm (/dev/md0), or an NVMe partition
//   (/dev/nvme0n1p2) — resolves down to its actual disk name(s) (`sda`, `nvme0n1`),
//   NOT the intermediate backing PARTITION (`sda3`). A mdadm array backed by SEVERAL
//   partitions yields MULTIPLE disks and we exclude ALL of them.
//
//   ★ WHY NOT `lsblk -no PKNAME` (the CR-01 bug): PKNAME returns the device's
//     IMMEDIATE parent — for a stacked root that is the backing PARTITION (`sda3`),
//     never the whole disk (`sda`). Excluding `sda3` while candidates are whole
//     disks (`sda`) leaves the OS disk ELIGIBLE FOR FORMAT (OS-destroy). The
//     TYPE=disk walk closes that hole; a nvme/mmcblk-aware digit-strip remains ONLY
//     as a last-resort fallback when lsblk emits no disk ancestor.
//
//   We DELIBERATELY do NOT copy `external-storage.ts`
//   `isExternalDeviceConnectedOnUnsupportedDevice()`'s df-based source string-split
//   (Trap 15) — that resolver silently mis-resolves LVM/mdadm/EFI roots (e.g.
//   /dev/mapper/vg-root → "vg-root", excluding nothing).
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
	// `lsblk -rsno NAME,TYPE <source>` → EVERY whole-disk (TYPE=disk) ancestor of
	// <source>, walking the inverse dependency tree down through any LVM/LUKS/mdadm
	// layer to the physical disk(s). Returns e.g. ['sda'] for a partition/LVM/LUKS
	// root, ['nvme0n1'] for an NVMe root, or ['sda','sdb'] for a mdadm mirror.
	// Empty [] when nothing resolves (forces the nvme/mmcblk-aware digit-strip
	// fallback in diskForMount).
	lsblkAncestorDisks(source: string): Promise<string[]>
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
	async lsblkAncestorDisks(source: string) {
		try {
			// -s = inverse dependencies (walk ancestors up to the physical disk), -r =
			// raw (no tree-drawing chars), -n = no header. Every TYPE=disk row is a
			// whole physical disk backing <source>; a mdadm array yields several.
			const {stdout} = await $`lsblk -rsno NAME,TYPE ${source}`
			const disks: string[] = []
			for (const line of stdout.split('\n')) {
				const parts = line.trim().split(/\s+/)
				if (parts.length >= 2 && parts[parts.length - 1] === 'disk') {
					const name = parts[0]?.trim()
					if (name) disks.push(name)
				}
			}
			return disks
		} catch {
			return []
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

// Last-resort fallback (CR-01 / IN-02): reduce a partition BASENAME to its whole
// disk when lsblk emitted no disk ancestor at all. nvme/mmcblk use a `pN` suffix
// (nvme0n1p2 → nvme0n1, mmcblk0p1 → mmcblk0); plain sd disks use a trailing digit
// (sda3 → sda). Anything else (mapper/crypt/lvm names, a bare whole disk) yields
// null — better to contribute NOTHING than a bogus disk name. NOTE: this must
// NEVER run on a name lsblk already reported as TYPE=disk (it would wrongly strip
// nvme0n1 → nvme0n); it is reached ONLY when the ancestor walk returned nothing.
function stripPartitionSuffix(name: string): string | null {
	const nvmeOrMmc = /^(nvme\d+n\d+|mmcblk\d+)p\d+$/.exec(name)
	if (nvmeOrMmc) return nvmeOrMmc[1]
	const sd = /^(sd[a-z]+)\d+$/.exec(name)
	if (sd) return sd[1]
	return null
}

// Resolve the WHOLE physical disk(s) backing a mount (CR-01). findmnt SOURCE →
// lsblk -rsno NAME,TYPE ancestor walk, taking every TYPE=disk row so a stacked
// root (LVM/LUKS/mdadm) resolves to the actual disk(s), NOT the backing partition.
// A mdadm array contributes MULTIPLE disks. Returns [] (contributes NOTHING) on
// any failure — never a phantom/partition name (fail-safe).
async function diskForMount(mountpoint: string, deps: RootDiskDeps): Promise<string[]> {
	let source: string | null
	try {
		source = await deps.findmntSource(mountpoint)
	} catch {
		return []
	}
	if (!source) return []

	let ancestors: string[]
	try {
		ancestors = await deps.lsblkAncestorDisks(source)
	} catch {
		ancestors = []
	}
	// Primary path: lsblk walked the stack to the physical whole disk(s) — use
	// them verbatim (already TYPE=disk; a mdadm mirror yields several, ALL kept).
	const cleaned = ancestors.map((d) => d.trim()).filter((d) => d.length > 0)
	if (cleaned.length > 0) return cleaned

	// Fallback (only when lsblk gave no disk ancestor — rare): strip a partition
	// suffix off the /dev/sdXN | nvme0n1pN | mmcblk0pN basename, nvme/mmcblk-aware.
	// A mapper/lvm/crypt basename yields null → contributes nothing (never a
	// bogus disk name).
	const base = source.replace(/^.*\//, '') // basename
	const stripped = stripPartitionSuffix(base)
	return stripped ? [stripped] : []
}

// Port of the `/` + `/boot` (+ EFI) union in `_refuse_system_disk()`: the SET of
// disks backing any OS mountpoint. A mount that does not resolve contributes
// nothing. An EMPTY result is the fail-safe signal (see callers): it means we
// could not prove which disk is the OS, NOT that there is no OS disk.
export async function resolveOsDisks(deps: RootDiskDeps = liveDeps): Promise<Set<string>> {
	const osDisks = new Set<string>()
	for (const mountpoint of OS_MOUNTPOINTS) {
		for (const disk of await diskForMount(mountpoint, deps)) osDisks.add(disk)
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
