// =========================================================================
// luks-eligibility.ts — STORD-02 (Phase 339-02, D-339-2) LUKS-target filter.
//
// ★ WHY THIS EXISTS: STORD-02 `luksFormat` irreversibly DESTROYS a whole disk.
//   The set of disks we may OFFER for encryption is a STRICT SUBSET of the pool
//   feature's eligible-internal set: on top of "not the OS/boot/EFI disk, not
//   USB, not removable" (already enforced by root-disk.ts, REUSED VERBATIM — the
//   CR-01 lesson: never fork that resolver, it is also consumed by the pool
//   feature which must never gain a side effect), a LUKS candidate must ALSO be
//   NOT a pool member, NOT already LUKS-managed, and EMPTY (no partitions / fs /
//   mount — v1 is new/empty-disk-only; in-place reencrypt is DEFERRED).
//
// ★ PURE CORE (the Windows-testable seam): `filterLuksEligible` is pure, no I/O,
//   unit-tested with fixtures. The live wrapper `getLuksEligibleDisks` composes
//   `getEligibleInternalDrives` (root-disk.ts) + store reads + the emptiness
//   probe, then calls the pure filter.
//
// ★ FAIL-CLOSED: `getEligibleInternalDrives` THROWS `OsDiskResolutionError` when
//   the OS disk is unresolvable — we let it propagate (the route surfaces a safe
//   "cannot list drives" state and offers NOTHING). The emptiness probe fails
//   closed too: a disk we cannot PROVE empty is treated as non-empty (excluded).
//
// ★ DEVICE_ID_RE (monitoring/smart.ts:259) is the single source of truth for a
//   valid kernel device name — imported, never re-declared (pool.ts precedent).
// =========================================================================

import {$} from 'execa'

import {DEVICE_ID_RE} from '../monitoring/smart.js'

import {getEligibleInternalDrives, type EligibleDrive} from './root-disk.js'

// The extra LUKS-only exclusions layered ON TOP of getEligibleInternalDrives.
export interface LuksFilterOpts {
	// Ids in storagePool.members[].deviceId — pool members are EXCLUDED (D-339-2:
	// LUKS-on-a-pool-member is a deferred, higher-risk open question).
	poolMemberIds: Set<string>
	// Ids already in the `encryptedDisks` registry — never re-offer a managed disk.
	encryptedIds: Set<string>
	// deviceId → "is empty" (no partitions / fs / mountpoint). Only `true` passes;
	// an absent key or `false` EXCLUDES (fail-closed: v1 = new/empty disk only).
	emptiness: Record<string, boolean>
}

// The pure filter — the Windows-testable core. Drops any drive that is (a) not a
// well-formed kernel device id, (b) a pool member, (c) already LUKS-managed, or
// (d) not provably empty. NO I/O.
export function filterLuksEligible(internal: EligibleDrive[], opts: LuksFilterOpts): EligibleDrive[] {
	return internal.filter(
		(drive) =>
			DEVICE_ID_RE.test(drive.id) &&
			!opts.poolMemberIds.has(drive.id) &&
			!opts.encryptedIds.has(drive.id) &&
			opts.emptiness[drive.id] === true,
	)
}

// Injectable seam for the live wrapper (tests supply a stub; the route supplies
// live implementations). `listInternalDrives` wraps getEligibleInternalDrives so
// its OsDiskResolutionError propagates (fail-closed).
export interface LuksEligibilityDeps {
	listInternalDrives(): Promise<EligibleDrive[]>
	listPoolMemberIds(): Promise<string[]>
	listEncryptedIds(): Promise<string[]>
	isEmptyDisk(id: string): Promise<boolean>
}

// Live emptiness probe: a disk with NO partition, NO filesystem, and NO mount on
// any of its rows is "empty". `lsblk -no FSTYPE,PARTTYPE,MOUNTPOINT /dev/<id>`
// emits one row per device+partition; an all-blank output means nothing is on it.
// Fail-closed: any lsblk error / bad id → false (cannot prove empty → not offered).
export async function isEmptyDiskLive(deviceId: string): Promise<boolean> {
	if (!DEVICE_ID_RE.test(deviceId)) return false
	try {
		const {stdout} = await $`lsblk -no FSTYPE,PARTTYPE,MOUNTPOINT /dev/${deviceId}`
		return stdout.split('\n').every((line) => line.trim().length === 0)
	} catch {
		return false
	}
}

// Thin live wrapper: compose the eligible-internal set (root-disk.ts) with the
// store-derived exclusions + the emptiness probe, then run the pure filter. Lets
// OsDiskResolutionError propagate (fail-closed — the route offers NOTHING).
export async function getLuksEligibleDisks(deps: LuksEligibilityDeps): Promise<EligibleDrive[]> {
	// Fail-closed: getEligibleInternalDrives THROWS when the OS disk is unresolvable.
	const internal = await deps.listInternalDrives()
	const [poolIds, encryptedIdsArr] = await Promise.all([deps.listPoolMemberIds(), deps.listEncryptedIds()])
	const poolMemberIds = new Set(poolIds)
	const encryptedIds = new Set(encryptedIdsArr)

	// Probe emptiness ONLY for the not-yet-excluded remainder (bounded work),
	// serialized (one lsblk at a time bounds the I/O on a small box). A probe error
	// resolves to false (fail-closed → excluded).
	const emptiness: Record<string, boolean> = {}
	for (const drive of internal) {
		if (poolMemberIds.has(drive.id) || encryptedIds.has(drive.id)) continue
		emptiness[drive.id] = await deps.isEmptyDisk(drive.id).catch(() => false)
	}

	return filterLuksEligible(internal, {poolMemberIds, encryptedIds, emptiness})
}

// Convenience live-deps factory for the route: wires getEligibleInternalDrives +
// the two store reads + the live emptiness probe. Store getters are passed in so
// this module never imports index.ts (no cycle).
export function makeLuksEligibilityDeps(getters: {
	poolMemberIds(): Promise<string[]>
	encryptedIds(): Promise<string[]>
}): LuksEligibilityDeps {
	return {
		listInternalDrives: () => getEligibleInternalDrives(),
		listPoolMemberIds: getters.poolMemberIds,
		listEncryptedIds: getters.encryptedIds,
		isEmptyDisk: isEmptyDiskLive,
	}
}
