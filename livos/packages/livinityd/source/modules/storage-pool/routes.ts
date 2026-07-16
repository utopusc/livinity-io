// =========================================================================
// storage-pool/routes.ts — the adminProcedure-gated tRPC surface for ALL pool
// lifecycle operations (Phase 318, POOL-02 / POOL-03 / POOL-04). Mounted as a
// FRESH top-level `storagePool` namespace (server/trpc/index.ts), a sibling of
// `files` / `scheduler` / `monitoring` — NOT nested under `files` (318-CODEBASE
// §7, D-15: pooling is its own domain).
//
// ★ THIS IS THE DESTRUCTIVE TRUST BOUNDARY (T-318-11 / T-318-12). It is a THIN
//   delegation layer — the safety logic already lives in 318-05 pool.ts (the
//   clone-and-INVERT three-gate format, the D-08 freeze gate, the byte-exact
//   config renderers, the createPool/addDisk orchestration) and 318-04
//   snapraid-cli.ts (diff/sync/status/check/fix). routes.ts ADDS the two
//   load-bearing boundary controls the client must cross:
//     V4 — EVERY mutation is `adminProcedure`-gated (auth + admin role +
//          audit-log); only read-only enumeration (`listEligibleDrives`,
//          `poolStatus`) uses the `publicProcedureWhenNoUserExists` read gate
//          (mirrors files.externalDevices — browseable before first-user).
//     V5 — EVERY device input is zod-constrained by `DEVICE_ID_RE` BEFORE the
//          resolver runs, so a malformed id can never reach formatInternalDevice
//          / the wrapper / snapraid. (Disk LABELS use the snapraid.conf label
//          shape; snapraid-cli additionally refuses a raw-device token there.)
//
// ★ syncNow passes the SAME D-08 freeze gate as the nightly job (318-07):
//   diff → checkFreezeGate → (blocked → raise `pool-sync-frozen`, return blocked)
//   else sync. `forceSyncOverride` is the explicit admin-confirmed one-shot
//   forced sync (the "these deletions are intentional — continue" affordance).
//
// ★ REPLACE-RUNBOOK (D-11) steps persist `storagePool.runbookStep`, which pool.ts
//   already uses to HARD-BLOCK any competing format/add/create. `replaceCheck`
//   is a HARD-STOP: it returns the check result and NEVER auto-chains into a
//   sync (the UI drives step progression). `replaceMount` remounts the
//   replacement disk at the SAME `/mnt/diskN` by invoking the 318-01 wrapper's
//   `mount-data-disk` action BY NAME (plan-check W-4 — never improvised).
//
// ★ WRAPPER-CONTRACT RECONCILIATION (built 318-05 pool.ts is authoritative):
//   pool.ts does NOT export its private `liveWrapper` seam, and its
//   `formatInternalDevice` deliberately HARD-REFUSES a device while a runbook is
//   in flight (so the runbook itself cannot use it once runbookStep is set).
//   `replaceMount` therefore invokes the audited wrapper action locally via an
//   execa argv ARRAY (default shell:false), reusing the shared `POOL_WRAPPER`
//   path constant from snapraid-cli.ts — the SAME argv-array, no-shell posture as
//   pool.ts's own liveWrapper, only the action string ('mount-data-disk') passed
//   by name. `replaceFormat` runs pool.ts `formatInternalDevice` (full three-gate
//   primitive) BEFORE it stamps runbookStep, so the guarded primitive is reused
//   rather than reimplemented.
// =========================================================================

import {execa} from 'execa'
import z from 'zod'

import type Livinityd from '../../index.js'
import {router, adminProcedure, publicProcedureWhenNoUserExists} from '../server/trpc/trpc.js'
// Trap 2 — single DEVICE-regex strategy: REUSE the exported kernel-device guard
// (monitoring/smart.ts:259) — never a divergent copy.
import {DEVICE_ID_RE} from '../monitoring/smart.js'
import {isWsl2} from '../system/gpu.js'

import {getEligibleInternalDrives} from './root-disk.js'
import {POOL_WRAPPER, diff, sync, status, check, fix} from './snapraid-cli.js'
import {
	createPool as poolCreatePool,
	addDisk as poolAddDisk,
	formatInternalDevice as poolFormatInternalDevice,
	checkFreezeGate,
} from './pool.js'
import type {FilesHook, PoolDeps, PoolStore, StoragePoolState} from './pool.js'

// ── zod input shapes (V5 — device-shape validation BEFORE any resolver) ──────

// A kernel block-device id (sdX / nvmeXnY / mmcblkX). The load-bearing V5 guard:
// a malformed id is rejected at the zod boundary, so it never reaches the
// destructive formatInternalDevice / create-pool / mount-data-disk sink.
const deviceIdSchema = z.string().regex(DEVICE_ID_RE, '[invalid-device-id]')

// A pool data mountpoint. Constrained to /mnt/diskN so replaceMount can only ever
// re-mount at a data slot (the wrapper's mount-data-disk --target regex also
// rejects /mnt/parity1, Trap 3 — belt-and-braces).
const dataMountpointSchema = z.string().regex(/^\/mnt\/disk\d+$/, '[invalid-mountpoint]')

// A snapraid.conf disk LABEL (dN / diskN) — NOT a kernel device. snapraid-cli
// additionally refuses a raw-device-shaped token here (defence-in-depth).
const diskLabelSchema = z.string().regex(/^[A-Za-z0-9_-]{1,32}$/, '[invalid-disk-label]')

// ── ctx → pool.ts deps adapters ──────────────────────────────────────────────

// Back pool.ts's PoolStore seam with the dedicated top-level `storagePool`
// StoreSchema key (D-15) on livinityd.store. Callers pass `ctx.livinityd!` (the
// merged tRPC Context types livinityd optional because the WSS context branch is
// async — the established `ctx.livinityd!` pattern, monitoring/routes.ts:169).
function poolStore(livinityd: Livinityd): PoolStore {
	return {
		getPoolState: () => livinityd.store.get('storagePool'),
		setPoolState: async (s: StoragePoolState) => {
			await livinityd.store.set('storagePool', s)
		},
	}
}

// Assemble the PoolDeps pool.ts orchestration needs. `files` backs the no-op-safe
// base-dir hook (318-10 implements registerPoolBaseDir); wrapper/guards default to
// the live root-side implementations inside pool.ts.
function poolDeps(livinityd: Livinityd): PoolDeps {
	// The Files instance is the no-op-safe base-dir hook target: FilesHook exposes
	// only the optional `registerPoolBaseDir?` method (318-10 adds it to Files), so
	// the cast is intentional — createPool optional-chains the call and it is a
	// no-op until 318-10 implements it.
	return {store: poolStore(livinityd), files: livinityd.files as unknown as FilesHook}
}

// The single local wrapper-action invocation (W-4 — replaceMount only). Mirrors
// pool.ts's private liveWrapper posture EXACTLY: execa argv ARRAY, default
// shell:false (no interpolation ever reaches a shell), throws on a non-zero exit
// so a failed remount surfaces. The action name is passed BY NAME.
async function runPoolWrapper(action: string, args: string[]): Promise<void> {
	const res = await execa('sudo', ['-n', POOL_WRAPPER, action, ...args], {reject: false})
	const exitCode = res.exitCode ?? 0
	if (exitCode !== 0) {
		throw new Error(`[livos-pool] action '${action}' failed (exit ${exitCode}): ${res.stderr ?? ''}`.trim())
	}
}

// Read-modify-write the persisted runbookStep. Requires an existing pool.
async function setRunbookStep(livinityd: Livinityd, step: string | undefined): Promise<StoragePoolState> {
	const store = poolStore(livinityd)
	const state = await store.getPoolState()
	if (!state?.members?.length) throw new Error('[no-pool-exists]')
	const next: StoragePoolState = {...state, runbookStep: step}
	await store.setPoolState(next)
	return next
}

export default router({
	// ── READ ENUMERATION (publicProcedureWhenNoUserExists — browseable pre-first-
	//    user, exactly like files.externalDevices; NO mutation here) ────────────

	// The eligible-internal drive list the POOL-02 wizard renders (313 listDrives
	// membership, INVERTED to internal via root-disk.ts). Zero destructive surface.
	listEligibleDrives: publicProcedureWhenNoUserExists.query(async () => getEligibleInternalDrives()),

	// Pool status for the UI: persisted state + (protected pools only) a live
	// `snapraid status` + the `isWsl2` hard-hide flag (D-14 — same shape as
	// system.powerStatus.isWsl2; the UI HARD-HIDES the whole pooling card on WSL2
	// because a WSL2 VM has no real internal disks). Never runs a destructive op.
	poolStatus: publicProcedureWhenNoUserExists.query(async ({ctx}) => {
		const state = await poolStore(ctx.livinityd!).getPoolState()
		const wsl2 = await isWsl2()
		let snapraid = null
		if (state?.members?.length && state.protectionLevel === 'protected') {
			snapraid = await status().catch(() => null)
		}
		return {pool: state ?? null, isWsl2: wsl2, snapraid}
	}),

	// ── POOL LIFECYCLE MUTATIONS (adminProcedure — V4) ────────────────────────

	// POOL-02 wizard build. Every selected id is DEVICE_ID_RE-zod-constrained
	// BEFORE the resolver; pool.ts re-validates + TOCTOU-guards every device
	// up-front (ineligible/OS selection destroys nothing) then routes the guarded
	// format + parity mount through the wrapper `create-pool` action.
	createPool: adminProcedure
		.input(
			z.object({
				selectedDeviceIds: z.array(deviceIdSchema).min(1),
				protectionLevel: z.enum(['combine-only', 'protected']),
			}),
		)
		.mutation(async ({ctx, input}) =>
			poolCreatePool(input.selectedDeviceIds, input.protectionLevel, poolDeps(ctx.livinityd!)),
		),

	// POOL growth (Pattern 3). Guarded format + mount at the next free /mnt/diskN;
	// never auto-chains a sync (returns {needsSync:true}).
	addDisk: adminProcedure
		.input(z.object({deviceId: deviceIdSchema}))
		.mutation(async ({ctx, input}) => poolAddDisk(input.deviceId, poolDeps(ctx.livinityd!))),

	// POOL-04 destructive single-internal-drive format (three-gate primitive:
	// DEVICE_ID_RE + inverted-membership + TOCTOU assertNotOsDisk, wrapper
	// format-disk). Hard-refuses a pool member / in-flight runbook (pool.ts).
	formatInternalDevice: adminProcedure
		.input(z.object({deviceId: deviceIdSchema}))
		.mutation(async ({ctx, input}) => poolFormatInternalDevice(input.deviceId, poolDeps(ctx.livinityd!))),

	// POOL-03 manual "Sync now" — passes the SAME D-08 freeze gate as the nightly
	// job (Trap 11 / D-08). diff → checkFreezeGate(protectedFileCount from the last
	// persisted status summary, W-2) → blocked ⇒ raise `pool-sync-frozen` + return
	// {blocked:true, reason} (the UI surfaces forceSyncOverride); else sync.
	syncNow: adminProcedure.mutation(async ({ctx}) => {
		const state = await poolStore(ctx.livinityd!).getPoolState()
		if (!state?.members?.length) throw new Error('[no-pool-exists]')
		if (state.protectionLevel !== 'protected') throw new Error('[pool-not-protected]')

		const d = await diff()
		const gate = checkFreezeGate(
			{removed: d.counts.removed},
			state.lastStatusSummary?.protectedFileCount,
			state.safetyFreezeThreshold,
		)
		if (gate.blocked) {
			await ctx.livinityd!.notifications
				.add('pool-sync-frozen', {severity: 'warning', external: true})
				.catch(() => {})
			return {blocked: true as const, reason: gate.reason, diff: d.counts}
		}
		const result = await sync()
		await ctx.livinityd!.notifications.clear('pool-sync-frozen').catch(() => {})
		return {blocked: false as const, diff: d.counts, result}
	}),

	// The explicit-override affordance (D-08): admin confirms the mass deletion is
	// intentional (`confirm: true` literal — you cannot force by accident) → a
	// one-shot forced sync that BYPASSES the freeze gate.
	forceSyncOverride: adminProcedure
		.input(z.object({confirm: z.literal(true)}))
		.mutation(async ({ctx}) => {
			const state = await poolStore(ctx.livinityd!).getPoolState()
			if (!state?.members?.length) throw new Error('[no-pool-exists]')
			if (state.protectionLevel !== 'protected') throw new Error('[pool-not-protected]')

			const d = await diff()
			const result = await sync()
			await ctx.livinityd!.notifications.clear('pool-sync-frozen').catch(() => {})
			return {blocked: false as const, forced: true as const, diff: d.counts, result}
		}),

	// ── REPLACE RUNBOOK (D-11) — persisted step state; check = HARD-STOP ───────

	// Step 1 — enumerate replacement candidates for a failed member. Does NOT set
	// runbookStep (so replaceFormat's formatInternalDevice primitive still runs);
	// the runbook is stamped from replaceFormat onward.
	replaceDetect: adminProcedure
		.input(z.object({failedDeviceId: deviceIdSchema}))
		.mutation(async ({ctx, input}) => {
			const state = await poolStore(ctx.livinityd!).getPoolState()
			if (!state?.members?.length) throw new Error('[no-pool-exists]')
			const failed = state.members.find((m) => m.deviceId === input.failedDeviceId)
			if (!failed) throw new Error('[device-is-not-pool-member]')
			const memberIds = new Set(state.members.map((m) => m.deviceId))
			const candidates = (await getEligibleInternalDrives()).filter((d) => !memberIds.has(d.id))
			return {failedMember: failed, candidates}
		}),

	// Step 2 — format the replacement disk (reuses the guarded three-gate
	// primitive BEFORE stamping runbookStep), then mark the runbook in flight.
	replaceFormat: adminProcedure
		.input(z.object({deviceId: deviceIdSchema}))
		.mutation(async ({ctx, input}) => {
			await poolFormatInternalDevice(input.deviceId, poolDeps(ctx.livinityd!))
			await setRunbookStep(ctx.livinityd!, 'replace:formatted')
			return {ok: true as const, runbookStep: 'replace:formatted'}
		}),

	// Step 3 (W-4) — remount the replacement disk at the SAME /mnt/diskN via the
	// 318-01 wrapper `mount-data-disk` action BY NAME (mountpoint zod-locked to
	// /mnt/diskN; deviceId DEVICE_ID_RE).
	replaceMount: adminProcedure
		.input(z.object({deviceId: deviceIdSchema, mountpoint: dataMountpointSchema}))
		.mutation(async ({ctx, input}) => {
			await runPoolWrapper('mount-data-disk', ['--dev', input.deviceId, '--target', input.mountpoint])
			await setRunbookStep(ctx.livinityd!, 'replace:mounted')
			return {ok: true as const, mountpoint: input.mountpoint, runbookStep: 'replace:mounted'}
		}),

	// Step 4 — disk-scoped rebuild from parity (`fix -d <label>`, snapraid-cli
	// Pattern 4 — never whole-pool).
	replaceFix: adminProcedure
		.input(z.object({disk: diskLabelSchema}))
		.mutation(async ({ctx, input}) => {
			const result = await fix({disk: input.disk})
			await setRunbookStep(ctx.livinityd!, 'replace:fixed')
			return {result, runbookStep: 'replace:fixed'}
		}),

	// Step 5 (HARD-STOP) — disk-scoped verification (`check -d <label>`). Returns
	// the result and NEVER auto-chains into a sync; an `unrecoverable` outcome is
	// the caller's stop signal (D-11 / Pitfall 3).
	replaceCheck: adminProcedure
		.input(z.object({disk: diskLabelSchema}))
		.mutation(async ({ctx, input}) => {
			const result = await check({disk: input.disk})
			const hardStop = result.errorUnrecoverable > 0 || result.exit === 'unrecoverable'
			await setRunbookStep(ctx.livinityd!, 'replace:checked')
			return {result, hardStop, runbookStep: 'replace:checked'}
		}),

	// Step 6 — bring parity current after a verified rebuild (still gate-respecting).
	replaceSync: adminProcedure.mutation(async ({ctx}) => {
		const state = await poolStore(ctx.livinityd!).getPoolState()
		if (!state?.members?.length) throw new Error('[no-pool-exists]')
		const d = await diff()
		const gate = checkFreezeGate(
			{removed: d.counts.removed},
			state.lastStatusSummary?.protectedFileCount,
			state.safetyFreezeThreshold,
		)
		if (gate.blocked) {
			await ctx.livinityd!.notifications
				.add('pool-sync-frozen', {severity: 'warning', external: true})
				.catch(() => {})
			return {blocked: true as const, reason: gate.reason, diff: d.counts}
		}
		const result = await sync()
		await setRunbookStep(ctx.livinityd!, 'replace:synced')
		return {blocked: false as const, diff: d.counts, result}
	}),

	// Step 7 — clear the runbook (unblocks normal format/add/create in pool.ts).
	replaceClear: adminProcedure.mutation(async ({ctx}) => {
		await setRunbookStep(ctx.livinityd!, undefined)
		return {ok: true as const, runbookStep: null}
	}),
})
