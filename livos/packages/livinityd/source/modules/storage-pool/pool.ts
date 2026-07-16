// =========================================================================
// pool.ts — storage-pool state assembly + config renderers + destructive
// internal-drive format + safety-freeze gate + pool creation/growth
// orchestration (Phase 318, POOL-02 / POOL-04). The heaviest backend module of
// the phase: everything a route (318-06), the wizard (318-08), the scheduler
// (318-07) and the Files base-dir hook (318-10) delegate to.
//
// ★ SAFETY POSTURE (this module touches DESTRUCTIVE wrapper actions):
//   Every destructive call site funnels through the SAME layered guard order as
//   files/external-storage.ts `formatExternalDevice`, with the membership guard
//   INVERTED to the eligible-INTERNAL set from root-disk.ts (Trap 1 — reusing
//   the USB-only set would reject every internal drive), a DEVICE_ID_RE shape
//   guard FIRST, a TOCTOU `assertNotOsDisk` re-check (NO cache, Trap 9)
//   IMMEDIATELY before the destructive wrapper call, and a hard block for
//   pool-member / in-flight-runbook devices. Destructive steps go ONLY through
//   `livos-pool.sh` via execa argv ARRAYS (default shell:false) — livinityd
//   never string-builds a shell command (D-03/D-17). Up-front validation
//   failure destroys NOTHING (createPool re-validates every device before ANY
//   side-effect).
//
// ★ CONFIG RENDERERS ARE BYTE-EXACT + WHOLE-FILE (samba.ts precedent, never
//   hand-patched): the fstab line (D-05) mirrors the wrapper's baked
//   POOL_FSTAB_LINE verbatim — `category.create=mfs` is a DELIBERATE override of
//   upstream's `pfrd` default (Trap 4) and `branches-mount-timeout-fail=true` is
//   NON-NEGOTIABLE (Trap 5, a missing branch must be a loud mount failure, never
//   a silent write to the OS disk). The snapraid.conf (D-06) puts parity at
//   `/mnt/parity1` DELIBERATELY OUTSIDE the `/mnt/disk*` mergerfs glob (Trap 3)
//   so the parity disk is never pooled as a data branch.
//
// ★ WRAPPER-CONTRACT RECONCILIATION (built 318-01 wrapper is authoritative, same
//   posture as 318-04): the wrapper exposes `create-pool` as the single guarded
//   FORMAT-all(+parity-MOUNT) action, and mount-data-disk's `--target` regex
//   `^/mnt/disk[0-9]+$` deliberately REJECTS `/mnt/parity1` (Trap 3) — so parity
//   is mounted ONLY by `create-pool`. createPool therefore routes the guarded
//   per-disk format + parity mount through `create-pool` (its intra-script
//   _guard runs gate1+2+3 on every device including parity), preceded by the
//   full TS-side per-device guard chain (DEVICE_ID_RE + eligible re-resolve +
//   assertNotOsDisk) — the belt-and-braces "per-disk format guard" the plan
//   requires. `formatInternalDevice` remains the single-disk guarded primitive
//   used by addDisk (growth) and the replacement runbook.
//
// ★ OFFLINE-TESTABLE: the wrapper / store / root-disk seams are injected via
//   PoolDeps so pool.test.ts drives everything with fakes — ZERO live
//   format/mount/write against the host (marathon standing rule). The actual
//   disk-wipe primitives live ONLY in the root wrapper, never in this module.
// =========================================================================

import {execa} from 'execa'

// Trap 2 — single DEVICE-regex strategy: REUSE the exported kernel-device guard
// from the monitoring domain (monitoring/smart.ts:259) rather than diverging a
// 4th copy of `^(sd[a-z]+|nvme\d+n\d+|mmcblk\d+)$`.
import {DEVICE_ID_RE} from '../monitoring/smart.js'

import {
	assertNotOsDisk as liveAssertNotOsDisk,
	getEligibleInternalDrives as liveGetEligibleInternalDrives,
} from './root-disk.js'
import type {EligibleDrive} from './root-disk.js'
import {POOL_WRAPPER} from './snapraid-cli.js'

// ── Persisted pool state (the `storagePool` StoreSchema key, D-15) ───────────
// NOTE: these are `type` aliases (not interfaces) so they carry the implicit
// index signature that keeps the dedicated top-level `storagePool` StoreSchema
// key assignable to FileStore's `Serializable` constraint.

export type PoolProtectionLevel = 'combine-only' | 'protected'

export type PoolMember = {
	deviceId: string
	role: 'data' | 'parity'
	mountpoint: string
	// Disk serial, when known. root-disk.ts does not project serials in v1, so
	// this is left unset by createPool/addDisk; a follow-up may enrich from SMART.
	serial?: string
}

export type FreezeThreshold = {files: number; percent: number}

// The last persisted `snapraid status` summary — the W-2 source for the freeze
// gate's percentage leg. Written by 318-07's sync/scrub handlers after each run.
export type PoolStatusSummary = {protectedFileCount: number; scrubOldestDays?: number; at: number}

export type StoragePoolState = {
	members: PoolMember[]
	protectionLevel: PoolProtectionLevel
	parityDeviceId?: string
	// Operator-tunable D-08 mass-deletion freeze threshold.
	safetyFreezeThreshold: FreezeThreshold
	// Set while a D-11 replacement runbook is mid-flight (blocks concurrent formats).
	runbookStep?: string
	lastSync?: {at: number; added: number; removed: number; updated: number}
	lastScrub?: {at: number}
	// W-2 source for checkFreezeGate's percentage leg (protected-file count + scrub age).
	lastStatusSummary?: PoolStatusSummary
	// Set true when a createPool/addDisk sequence failed mid-way — the pool is in a
	// partial state and must never be treated as a clean, fully-mounted pool.
	incomplete?: boolean
}

// The default D-08 threshold: block when > 500 files OR > 20% of protected files
// were removed (both operator-tunable via storagePool.safetyFreezeThreshold).
export const DEFAULT_FREEZE_THRESHOLD: FreezeThreshold = {files: 500, percent: 20}

// ── Path constants (mirror the wrapper's own, livos-pool.sh:84-88) ───────────
const PARITY_MOUNT = '/mnt/parity1'
// Data disks mount at /mnt/disk2..N (D-05); disk1 is reserved so the first data
// disk lands at /mnt/disk2.
const DATA_DISK_START = 2
// Tiny content copy on the OS disk (D-06) — always the last content line.
const OS_CONTENT_COPY = '/opt/livos/snapraid/content.content'
// snapraid caps content copies to keep the config lean; one per data disk up to 2.
const MAX_DATA_CONTENT_COPIES = 2

// ── Injectable seams (offline-testable; live defaults shell out) ─────────────

// The single execa boundary onto `livos-pool.sh`. Throws on a non-zero exit so a
// mid-sequence orchestration failure surfaces (a pool.sh action returning exit 2
// = a guard refusal, NOT a normal snapraid bitmask — unlike snapraid-cli.ts).
export interface PoolWrapper {
	run(action: string, args: string[], input?: string): Promise<{stdout: string; exitCode: number}>
}

// Read / persist the dedicated top-level `storagePool` StoreSchema key. Consumers
// (318-06 routes, 318-07 jobs) back this with `ctx.livinityd.store`.
export interface PoolStore {
	getPoolState(): Promise<StoragePoolState | undefined>
	setPoolState(state: StoragePoolState): Promise<void>
}

// The root-disk.ts safety seam (318-03): the eligible-INTERNAL membership set +
// the re-resolving TOCTOU OS-disk guard.
export interface RootDiskGuards {
	getEligibleInternalDrives(): Promise<EligibleDrive[]>
	assertNotOsDisk(deviceId: string): Promise<void>
}

// The Files base-dir hook (318-10 implements `registerPoolBaseDir` /
// `unregisterPoolBaseDir` on the Files class). The register call is
// optional-chained + no-op-safe. createPool fires registerPoolBaseDir on success;
// unregisterPoolBaseDir is the teardown seam (v1 has no destroyPool orchestration —
// manual teardown + restart re-evaluates from the store, Files.evaluatePoolBaseDir).
export interface FilesHook {
	registerPoolBaseDir?: () => void
	unregisterPoolBaseDir?: () => void
}

export interface PoolDeps {
	// Required — the persist target (no live default: it needs livinityd.store).
	store: PoolStore
	// The Files module seam (318-10). Absent-safe.
	files?: FilesHook
	// Defaults to the live sudo→livos-pool.sh wrapper.
	wrapper?: PoolWrapper
	// Defaults to the live root-disk.ts resolver.
	guards?: RootDiskGuards
}

// Live execa wrapper: `sudo -n livos-pool.sh <action> [args]` with the optional
// whole-file config body on STDIN (never argv — write-snapraid-conf reads STDIN).
// argv ARRAY + default shell:false (no interpolation ever reaches a shell).
const liveWrapper: PoolWrapper = {
	async run(action: string, args: string[], input?: string) {
		const res = await execa('sudo', ['-n', POOL_WRAPPER, action, ...args], {reject: false, input})
		const exitCode = res.exitCode ?? 0
		if (exitCode !== 0) {
			throw new Error(`[livos-pool] action '${action}' failed (exit ${exitCode}): ${res.stderr ?? ''}`.trim())
		}
		return {stdout: res.stdout ?? '', exitCode}
	},
}

const liveGuards: RootDiskGuards = {
	getEligibleInternalDrives: () => liveGetEligibleInternalDrives(),
	assertNotOsDisk: (deviceId: string) => liveAssertNotOsDisk(deviceId),
}

// ── Renderers (BYTE-EXACT, whole-file — D-05 / D-06) ─────────────────────────

// The single mergerfs fstab line (D-05). Byte-identical to the wrapper's baked
// POOL_FSTAB_LINE (livos-pool.sh:96); the `mount` action writes it, this string
// is the TS mirror used for the byte-exact test + the UAT file compare.
//
// SAFETY TOKENS (do NOT touch):
//   • category.create=mfs — a DELIBERATE override of mergerfs's upstream `pfrd`
//     default (317 lock, Trap 4), chosen for the heterogeneous-disk use case.
//     NEVER "fix" it back to pfrd.
//   • branches-mount-timeout-fail=true — NON-NEGOTIABLE (Trap 5): a member disk
//     that fails to mount before mergerfs starts must be a LOUD, alertable
//     systemd mount failure, never a silent fall-through that writes to the
//     (empty) mountpoint on the OS disk.
//   • minfreespace=20G — flat v1 (D-05 lock; supersedes RESEARCH's 100G/200G).
export const POOL_FSTAB_LINE =
	'/mnt/disk* /mnt/pool mergerfs cache.files=off,category.create=mfs,func.getattr=newest,' +
	'dropcacheonclose=false,minfreespace=20G,moveonenospc=true,branches-mount-timeout=30,' +
	'branches-mount-timeout-fail=true,x-systemd.mount-timeout=45s,fsname=livinity-pool,allow_other 0 0'

// Render the whole fstab pool line. It is a glob spec (`/mnt/disk*`) so the
// output is identical for any pool shape — the member disks are enumerated by
// the glob at mount time, not baked into the line.
export function renderFstabLine(): string {
	return POOL_FSTAB_LINE
}

// Extract the trailing disk number from a `/mnt/diskN` mountpoint (→ N).
function diskNumber(mountpoint: string): number {
	const match = /\/mnt\/disk(\d+)$/.exec(mountpoint)
	if (!match) throw new Error(`[pool] not a data-disk mountpoint: ${mountpoint}`)
	return Number(match[1])
}

// Render the whole-file /etc/snapraid.conf from the ordered list of data-disk
// mountpoints (D-06). Parity is always /mnt/parity1/snapraid.parity (the caller
// guarantees parity = the largest selected disk). Content copies = one per data
// disk (capped at 2) + the tiny OS-disk copy. Data labels: dN ↔ /mnt/diskN.
export function renderSnapraidConf(dataMountpoints: string[]): string {
	const lines: string[] = [
		'# SnapRAID configuration — generated whole-file by LivOS storage-pool (Phase 318, D-06).',
		'# DO NOT hand-edit: this file is regenerated from pool state on every pool change.',
		'#',
		'# parity = the LARGEST selected disk, at /mnt/parity1 — DELIBERATELY OUTSIDE the',
		'# /mnt/disk* mergerfs glob (Trap 3) so the parity disk is never pooled as a data branch.',
		'parity /mnt/parity1/snapraid.parity',
		'',
		'# Content files: one copy per data disk (capped at 2) + a tiny copy on the OS disk.',
	]
	for (const mountpoint of dataMountpoints.slice(0, MAX_DATA_CONTENT_COPIES)) {
		lines.push(`content ${mountpoint}/snapraid.content`)
	}
	lines.push(`content ${OS_CONTENT_COPY}`)
	lines.push('')
	lines.push('# Data disks — one line per pooled data branch (label dN <-> /mnt/diskN).')
	for (const mountpoint of dataMountpoints) {
		lines.push(`data d${diskNumber(mountpoint)} ${mountpoint}`)
	}
	lines.push('')
	lines.push('# Excludes (D-06): scratch, temp, recovery, and snapraid metadata dirs.')
	lines.push('exclude /tmp/')
	lines.push('exclude *.tmp')
	lines.push('exclude /lost+found/')
	lines.push('exclude .snapraid/')
	// Trailing newline (POSIX text file).
	return lines.join('\n') + '\n'
}

// ── Safety-freeze gate (D-08 + plan-check W-2 LOCK) ──────────────────────────

// Pure gate run before EVERY auto-sync AND manual "Sync now" (Trap 11). BLOCK when:
//   • absolute: `removed` > threshold.files (default 500) — ALWAYS applies; OR
//   • percentage: protectedFileCount present AND removed/protectedFileCount >
//     threshold.percent/100 (default 20%).
//
// W-2 LOCK: `protectedFileCount` is the last persisted `snapraid status` summary
// (storagePool.lastStatusSummary, written by 318-07). When it is null / undefined
// / 0 (first-ever sync, or the status tag was unavailable) the PERCENTAGE leg is
// SKIPPED and ONLY the absolute-count leg applies — a fail-safe that never blocks
// a legitimate small deletion just because the protected total is unknown, and
// never divides by zero.
export function checkFreezeGate(
	diff: {removed: number},
	protectedFileCount: number | null | undefined,
	threshold: FreezeThreshold = DEFAULT_FREEZE_THRESHOLD,
): {blocked: boolean; reason?: string} {
	const removed = diff.removed

	// Absolute leg — always enforced.
	if (removed > threshold.files) {
		return {
			blocked: true,
			reason: `We paused protection updates because a lot of files were just deleted (${removed} removed, over the ${threshold.files}-file safety limit).`,
		}
	}

	// Percentage leg — SKIPPED when the protected-file total is unknown (W-2).
	if (protectedFileCount != null && protectedFileCount > 0) {
		const fraction = removed / protectedFileCount
		if (fraction > threshold.percent / 100) {
			return {
				blocked: true,
				reason: `We paused protection updates because a large share of your protected files was just deleted (${removed} of ${protectedFileCount}, over ${threshold.percent}%).`,
			}
		}
	}

	return {blocked: false}
}

// ── formatInternalDevice (CLONE-AND-INVERT — Trap 1 + Trap 9) ────────────────

// In-progress guard (mirrors external-storage.ts `formatJobs`): a device being
// formatted cannot be re-entered until the `finally` clears it.
const formatJobs = new Set<string>()

// Guarded destructive format of ONE internal drive. Cloned from
// formatExternalDevice's layered-guard order, with the membership guard INVERTED
// to the eligible-INTERNAL set (Trap 1) and destructive work routed through the
// wrapper `format-disk` action (execa argv array, no inline shell). Re-runs the
// TOCTOU OS-disk guard IMMEDIATELY before the destructive call (Trap 9) and hard-
// refuses a pool-member / in-flight-runbook device. Returns true on success.
export async function formatInternalDevice(deviceId: string, deps: PoolDeps): Promise<true> {
	// (1) shape guard FIRST — never trust the caller's deviceId (LIVOS-050 posture).
	if (!DEVICE_ID_RE.test(deviceId)) throw new Error('[invalid-device-id]')

	// (2) in-progress guard.
	if (formatJobs.has(deviceId)) throw new Error('[format-job-already-in-progress]')
	formatJobs.add(deviceId)
	try {
		const wrapper = deps.wrapper ?? liveWrapper
		const guards = deps.guards ?? liveGuards

		// (3) hard blocks: a pool member or an in-flight replacement runbook can
		// never be formatted (D-10 / D-11).
		const state = await deps.store.getPoolState()
		if (state?.members?.some((member) => member.deviceId === deviceId)) {
			throw new Error('[device-is-pool-member]')
		}
		if (state?.runbookStep) throw new Error('[replacement-runbook-in-flight]')

		// (4) membership re-resolve against the INVERTED (eligible-internal) set —
		// Trap 1. A USB / OS / non-eligible device is absent here and is refused
		// with the same [invalid-device-id] signal the external path uses.
		const eligible = await guards.getEligibleInternalDrives()
		if (!eligible.some((drive) => drive.id === deviceId)) throw new Error('[invalid-device-id]')

		// (5) TOCTOU re-check — re-resolve the OS disk IMMEDIATELY before the
		// destructive call (Trap 9; do NOT cache the eligible set above).
		await guards.assertNotOsDisk(deviceId)

		// (6) destructive: guarded wrapper format-disk via an execa argv array.
		await wrapper.run('format-disk', ['--dev', deviceId])
		return true
	} finally {
		// (7) always clear the in-progress guard.
		formatJobs.delete(deviceId)
	}
}

// ── createPool / addDisk orchestration (plan-check B-1) ──────────────────────

// Compute the parity + ordered data-disk split for a selection. Parity (protected
// only) = the LARGEST selected disk (D-06); data = the rest in selection order.
function assignRoles(
	selectedDeviceIds: string[],
	sizeById: Map<string, number>,
	protectionLevel: PoolProtectionLevel,
): {parityDeviceId?: string; dataDeviceIds: string[]} {
	if (protectionLevel === 'combine-only') {
		return {dataDeviceIds: [...selectedDeviceIds]}
	}
	if (selectedDeviceIds.length < 2) throw new Error('[protected-needs-at-least-two-disks]')
	// Largest = parity (ties broken by first-seen; deterministic).
	let parityDeviceId = selectedDeviceIds[0]
	for (const id of selectedDeviceIds) {
		if ((sizeById.get(id) ?? 0) > (sizeById.get(parityDeviceId) ?? 0)) parityDeviceId = id
	}
	return {parityDeviceId, dataDeviceIds: selectedDeviceIds.filter((id) => id !== parityDeviceId)}
}

// Map data-disk device ids → their /mnt/disk2..N mountpoints (selection order).
function dataMountpointsFor(dataDeviceIds: string[]): string[] {
	return dataDeviceIds.map((_, index) => `/mnt/disk${index + DATA_DISK_START}`)
}

// POOL CREATION (POOL-02, end-to-end): validate every device UP-FRONT (so an
// ineligible/OS selection destroys NOTHING) → format all + mount parity via the
// guarded `create-pool` wrapper action → mount each data disk at /mnt/disk2..N →
// write the whole-file snapraid.conf (protected) → write fstab + mount the pool →
// persist storagePool state → fire the no-op-safe Files base-dir hook.
//
// Failure handling: any wrapper step failure surfaces the error AND records the
// partial (incomplete) state — never a silent half-mounted pool, never a
// destructive auto-retry.
export async function createPool(
	selectedDeviceIds: string[],
	protectionLevel: PoolProtectionLevel,
	deps: PoolDeps,
): Promise<StoragePoolState> {
	const wrapper = deps.wrapper ?? liveWrapper
	const guards = deps.guards ?? liveGuards

	// ── UP-FRONT VALIDATION (zero side-effects) ──────────────────────────────
	if (selectedDeviceIds.length === 0) throw new Error('[no-devices-selected]')
	if (new Set(selectedDeviceIds).size !== selectedDeviceIds.length) {
		throw new Error('[duplicate-device-in-selection]')
	}

	const existing = await deps.store.getPoolState()
	if (existing?.members?.length) throw new Error('[pool-already-exists]')
	if (existing?.runbookStep) throw new Error('[replacement-runbook-in-flight]')

	// shape guard EVERY id first.
	for (const id of selectedDeviceIds) {
		if (!DEVICE_ID_RE.test(id)) throw new Error('[invalid-device-id]')
	}

	// re-resolve the eligible-internal set + assert membership + capture sizes.
	const eligible = await guards.getEligibleInternalDrives()
	const sizeById = new Map(eligible.map((drive) => [drive.id, drive.size]))
	for (const id of selectedDeviceIds) {
		if (!sizeById.has(id)) throw new Error('[invalid-device-id]')
	}

	// per-device TOCTOU re-check BEFORE any destructive step (Trap 9).
	for (const id of selectedDeviceIds) {
		await guards.assertNotOsDisk(id)
	}

	// role split (parity = largest when protected).
	const {parityDeviceId, dataDeviceIds} = assignRoles(selectedDeviceIds, sizeById, protectionLevel)
	const dataMountpoints = dataMountpointsFor(dataDeviceIds)

	const members: PoolMember[] = dataDeviceIds.map((id, index) => ({
		deviceId: id,
		role: 'data',
		mountpoint: dataMountpoints[index],
	}))
	if (parityDeviceId) {
		members.push({deviceId: parityDeviceId, role: 'parity', mountpoint: PARITY_MOUNT})
	}

	const nextState: StoragePoolState = {
		members,
		protectionLevel,
		parityDeviceId,
		safetyFreezeThreshold: existing?.safetyFreezeThreshold ?? DEFAULT_FREEZE_THRESHOLD,
	}

	// ── DESTRUCTIVE SEQUENCE (ordered; on ANY failure persist partial + rethrow) ─
	try {
		// (1) format every selected disk (+ format & mount parity at /mnt/parity1).
		// The wrapper `create-pool` action is the ONLY action that mounts parity
		// (mount-data-disk's --target regex rejects /mnt/parity1 by design, Trap 3);
		// its intra-script _guard re-runs gate1+2+3 on every device.
		const createArgs: string[] = []
		for (const id of dataDeviceIds) createArgs.push('--dev', id)
		if (parityDeviceId) createArgs.push('--parity', parityDeviceId)
		await wrapper.run('create-pool', createArgs)

		// (2) mount each data disk at /mnt/disk2..N.
		for (let index = 0; index < dataDeviceIds.length; index++) {
			await wrapper.run('mount-data-disk', ['--dev', dataDeviceIds[index], '--target', dataMountpoints[index]])
		}

		// (3) protected → write the whole-file snapraid.conf (body on STDIN).
		if (protectionLevel === 'protected') {
			await wrapper.run('write-snapraid-conf', [], renderSnapraidConf(dataMountpoints))
		}

		// (4) write the fstab pool line + mount the pool. The wrapper `mount` action
		// bakes POOL_FSTAB_LINE (== renderFstabLine()) idempotently.
		await wrapper.run('mount', [])

		// (5) persist the full pool state.
		await deps.store.setPoolState(nextState)

		// (6) fire the Files base-dir hook — NO-OP-SAFE seam (318-10 implements
		// registerPoolBaseDir later; the optional call compiles + passes today).
		deps.files?.registerPoolBaseDir?.()

		return nextState
	} catch (error) {
		// Never a silent half-mounted pool: record the partial (incomplete) state,
		// never auto-retry a destructive step.
		await deps.store.setPoolState({...nextState, incomplete: true}).catch(() => {})
		throw error
	}
}

// POOL GROWTH (Pattern 3): validate + TOCTOU (via formatInternalDevice) →
// guarded format → wrapper `add-disk` (mount at the next free /mnt/diskN + the
// live setfattr branch add, 318-01 owns the shell) → whole-file snapraid.conf
// re-render + write (protected) → persist the new member → return a
// needs-scoped-sync SEAM. addDisk NEVER auto-chains a sync (Trap 11) — the caller
// (318-06 syncNow / 318-07 nightly) owns that.
export async function addDisk(deviceId: string, deps: PoolDeps): Promise<{needsSync: boolean}> {
	const wrapper = deps.wrapper ?? liveWrapper

	const state = await deps.store.getPoolState()
	if (!state?.members?.length) throw new Error('[no-pool-exists]')
	if (state.runbookStep) throw new Error('[replacement-runbook-in-flight]')
	if (state.members.some((member) => member.deviceId === deviceId)) throw new Error('[device-is-pool-member]')

	// Guarded format via the single primitive (DEVICE_ID_RE + inverted membership
	// + TOCTOU assertNotOsDisk + wrapper format-disk). Runs BEFORE the mount/add.
	await formatInternalDevice(deviceId, deps)

	// Next free /mnt/diskN = max existing DATA diskN + 1 (data disks start at disk2).
	const dataMembers = state.members.filter((member) => member.role === 'data')
	const maxDataN = dataMembers.reduce(
		(max, member) => Math.max(max, diskNumber(member.mountpoint)),
		DATA_DISK_START - 1,
	)
	const target = `/mnt/disk${maxDataN + 1}`

	// wrapper add-disk = mount at target + Pattern-3 live mergerfs branch add (setfattr).
	await wrapper.run('add-disk', ['--dev', deviceId, '--target', target])

	// whole-file snapraid.conf re-render with the NEW data line (protected pools only).
	if (state.protectionLevel === 'protected') {
		const newDataMountpoints = [...dataMembers.map((member) => member.mountpoint), target]
		await wrapper.run('write-snapraid-conf', [], renderSnapraidConf(newDataMountpoints))
	}

	// persist the new member.
	const newMember: PoolMember = {deviceId, role: 'data', mountpoint: target}
	await deps.store.setPoolState({...state, members: [...state.members, newMember], incomplete: false})

	// scoped-sync-needed SEAM — the caller decides when to sync; addDisk never does.
	return {needsSync: true}
}
