// Phase 339 (STORD-01, D-339-1) — per-FOLDER byte quotas, additive to the shipped
// per-USER quota scan (325-01).
//
// Mirrors the recycle-purge module split: a PURE, deterministic, no-I/O core
// (nearestAncestorFolderQuota / foldersOverSoftQuota / decideFolderQuota,
// unit-tested on fixtures) + a never-throw scheduler handler that walks each
// admin-designated folder with `du`, caches the size, and raises/clears a
// target-qualified soft-quota bell. Donor = 338's recyclePurgeHandler, NOT the
// per-user scan: it already walks a virtualToSystemPath list with per-target
// try/catch + a getWriteLock re-read persist (333-review F1).
//
// This file deliberately does NOT import from ../scheduler/jobs.js: it is imported
// BY files.ts (the write-gate), and files.ts documents (files.ts:196-198) that it
// must not pull the whole scheduler module graph. So QUOTA_SOFT_RATIO is mirrored
// locally here, kept in sync with the single canonical export in scheduler/jobs.ts
// (same duplication-with-a-reason pattern files.ts itself already uses).

import getDirectorySize from '../utilities/get-directory-size.js'

import type {BuiltInJobHandler} from '../scheduler/types.js'

// One per-folder quota row: config (virtualPath/limitBytes/hardBlock) + scan cache
// (usageBytes/scannedAt). Persisted in the dedicated top-level `folderQuotas`
// StoreSchema key (index.ts). limitBytes <= 0 = unlimited; hardBlock false = warn-only.
export type FolderQuotaEntry = {
	virtualPath: string
	limitBytes: number
	hardBlock: boolean
	usageBytes?: number
	scannedAt?: number
}

// Soft-warn threshold, kept in sync with scheduler/jobs.ts QUOTA_SOFT_RATIO (the
// single canonical export). Mirrored locally rather than imported to keep this file
// — which files.ts imports — free of the scheduler module graph (see file header).
export const QUOTA_SOFT_RATIO = 0.9

// Normalize a virtual path for segment-boundary comparison: trim, collapse trailing
// slashes, keep a single leading slash. '' → '/'.
function normalizeQuotaPath(p: string): string {
	const trimmed = p.trim()
	if (trimmed.length === 0) return '/'
	const stripped = trimmed.replace(/\/+$/, '')
	return stripped.length === 0 ? '/' : stripped
}

// PURE — resolve the entry that governs a write to `virtualPath`: the entry whose
// virtualPath equals it OR is a path-SEGMENT ancestor of it, the deepest (longest)
// ancestor winning. Segment-boundary only: `/Home/Docs` is NOT an ancestor of
// `/Home/DocsBackup`. A root `/` entry governs everything. No match → undefined.
// Same conceptual pattern as 336/337's nearestAncestorAclLevel. No I/O, never throws.
export function nearestAncestorFolderQuota<T extends {virtualPath: string}>(
	entries: readonly T[],
	virtualPath: string,
): T | undefined {
	const target = normalizeQuotaPath(virtualPath)
	let best: T | undefined
	let bestLength = -1
	for (const entry of entries) {
		const base = normalizeQuotaPath(entry.virtualPath)
		const governs = target === base || (base === '/' ? true : target.startsWith(base + '/'))
		if (!governs) continue
		if (base.length > bestLength) {
			best = entry
			bestLength = base.length
		}
	}
	return best
}

// PURE clone of usersOverSoftQuota (scheduler/jobs.ts) — returns the virtualPaths
// whose cached usageBytes is at/over the soft ratio of their limit. limit <= 0 =
// unlimited → skipped. Deterministic, no I/O, never throws.
export function foldersOverSoftQuota(
	entries: readonly FolderQuotaEntry[],
	softRatio: number = QUOTA_SOFT_RATIO,
): string[] {
	const over: string[] = []
	for (const entry of entries) {
		if (entry.limitBytes <= 0) continue // unlimited
		const used = entry.usageBytes ?? 0
		if (used >= entry.limitBytes * softRatio) over.push(entry.virtualPath)
	}
	return over
}

// PURE — the single write-gate decision. Given the governing entry (nearest
// ancestor, or undefined for none) and the growth delta, decide whether to BLOCK
// (over 100% AND the entry opts into hardBlock) and/or WARN (at/over the soft ratio).
// unlimited (limit <= 0) or no entry = neither. No I/O, never throws.
export function decideFolderQuota(
	entry: FolderQuotaEntry | undefined,
	addBytes: number,
	softRatio: number = QUOTA_SOFT_RATIO,
): {block: boolean; warn: boolean} {
	if (!entry || entry.limitBytes <= 0) return {block: false, warn: false}
	const projected = (entry.usageBytes ?? 0) + Math.max(0, addBytes)
	const block = projected > entry.limitBytes && entry.hardBlock
	const warn = projected >= entry.limitBytes * softRatio
	return {block, warn}
}

// The target-qualified soft-quota alert id. NEVER the bare 'quota-exceeded' (that is
// the per-USER bell — reusing it collides + loses which folder is over). Follows the
// <kind>:<id> convention (smart-failing:<id>, pool-degraded:<id>).
export function folderQuotaAlertId(virtualPath: string): string {
	return `folder-quota-exceeded:${virtualPath}`
}

// Never-throw scheduler handler — mirrors recyclePurgeHandler / userQuotaScanHandler.
// Walks each admin-designated folder SERIALIZED (one `du` at a time bounds the I/O
// the scan can generate on a small box, same discipline as the per-user scan),
// persists the per-folder byte cache under the store write-lock (re-reading current
// so a concurrent admin set/remove during the walk is not clobbered — 333-F1), and
// raises/clears the per-folder target-qualified bell against the fresh usage.
export const folderQuotaScanHandler: BuiltInJobHandler = async (job, ctx) => {
	if (!ctx.livinityd) {
		ctx.logger.log(`[scheduler/folder-quota-scan] no daemon reference — skipping job ${job.name}`)
		return {status: 'skipped', error: 'daemon reference unavailable'}
	}
	const livinityd = ctx.livinityd
	try {
		ctx.logger.log(`[scheduler/folder-quota-scan] running job ${job.name}`)
		const entries = (await livinityd.store.get('folderQuotas').catch(() => [])) ?? []

		// Serialized du walk — one folder at a time (T-325-02 discipline).
		const usageByPath = new Map<string, number>()
		// IN-03: only folders that actually re-measured get a fresh scannedAt; a du
		// failure preserves the stale value AND the stale timestamp (don't advance
		// "last scanned" when nothing was measured).
		const freshlyScanned = new Set<string>()
		for (const entry of entries) {
			try {
				const systemPath = await livinityd.files.virtualToSystemPath(entry.virtualPath)
				usageByPath.set(entry.virtualPath, await getDirectorySize(systemPath))
				freshlyScanned.add(entry.virtualPath)
			} catch (err) {
				// A missing/racing folder (or an unresolvable virtual path) must not fail the
				// whole tick — preserve the previous cache value (or 0) and move on.
				usageByPath.set(entry.virtualPath, entry.usageBytes ?? 0)
				ctx.logger.error(`[scheduler/folder-quota-scan] folder ${entry.virtualPath} failed`, err)
			}
		}

		// Persist INSIDE the write lock, re-reading current so a concurrent admin
		// set/remove during the walk is NOT clobbered (333-review F1). Match by
		// virtualPath: preserve config (virtualPath/limitBytes/hardBlock) + update the
		// cache for entries still present; leave any admin-added-mid-walk entry alone
		// (it gets scanned next tick), and naturally drop the cache for removed ones.
		await livinityd.store.getWriteLock(async ({get, set}) => {
			const latest = (await get('folderQuotas')) ?? []
			const merged = latest.map((entry) =>
				freshlyScanned.has(entry.virtualPath)
					? {...entry, usageBytes: usageByPath.get(entry.virtualPath)!, scannedAt: Date.now()}
					: entry,
			)
			await set('folderQuotas', merged)
		})

		// Raise/clear the per-folder target-qualified bell against the FRESH usage.
		const scanned: FolderQuotaEntry[] = entries.map((entry) => ({
			...entry,
			usageBytes: usageByPath.get(entry.virtualPath) ?? entry.usageBytes ?? 0,
		}))
		const over = new Set(foldersOverSoftQuota(scanned))
		for (const entry of entries) {
			const id = folderQuotaAlertId(entry.virtualPath)
			if (over.has(entry.virtualPath)) {
				await livinityd.notifications.add(id, {severity: 'warning', external: false}).catch(() => {})
			} else {
				await livinityd.notifications.clear(id).catch(() => {})
			}
		}

		return {status: 'success', output: {scanned: entries.length, over: [...over]}}
	} catch (err) {
		// NOTE: 'failure', NOT 'error' — JobRunResult.status has no 'error' member.
		return {status: 'failure', error: err instanceof Error ? err.message : String(err)}
	}
}
