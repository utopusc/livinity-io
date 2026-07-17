// Phase 338 (RECYCLE-01, D-338-1) — the daily `.Recycle.Bin` purge job.
//
// Mirrors the connectivity module split: a PURE, deterministic, no-I/O planner
// (unit-tested on fixtures) + a never-throw scheduler handler that does the fs
// I/O and persists fail-soft observability. The purge is the disk-fill safety net
// the per-user quota scan CANNOT provide for non-Home shares (CODEBASE §8 pitfall
// 2): it deletes bin entries older than `purgeDays` by mtime AND force-purges
// oldest-first when the share disk's free space drops under a floor.

import nodePath from 'node:path'

import fse from 'fs-extra'

import {getDiskUsageByPath} from '../system/system.js'
import {DEFAULT_SMB_RECYCLE, RECYCLE_BIN_DIRNAME} from './samba.js'

import type {BuiltInJobHandler} from '../scheduler/types.js'

// The size-floor safety net for non-Home shares that the per-user quota scan cannot
// see (CODEBASE §8 pitfall 2). When a share disk drops below this, the purge job
// force-evicts oldest-first regardless of age so a bin can never silently fill a disk.
export const RECYCLE_FREE_FLOOR_BYTES = 5 * 1024 * 1024 * 1024 // 5 GiB

const MS_PER_DAY = 86_400_000

export type RecycleEntry = {path: string; mtimeMs: number; sizeBytes: number}
export type PurgePlan = {toDelete: RecycleEntry[]; forced: boolean; bytesReclaimed: number}

// PURE — the age-purge (mtime older than purgeDays) UNION the force-purge (oldest-first
// until projected free clears the floor). Deterministic, no I/O, never throws.
export function planRecyclePurge(
	entries: readonly RecycleEntry[],
	opts: {nowMs: number; purgeDays: number; availableBytes: number; floorBytes: number},
): PurgePlan {
	const {nowMs, purgeDays, availableBytes, floorBytes} = opts
	const ageCutoff = nowMs - purgeDays * MS_PER_DAY

	// Age set — anything at/older than the retention window.
	const aged = new Set<RecycleEntry>()
	for (const entry of entries) if (entry.mtimeMs <= ageCutoff) aged.add(entry)

	const toDelete: RecycleEntry[] = [...aged]
	let bytesReclaimed = 0
	for (const entry of toDelete) bytesReclaimed += entry.sizeBytes

	// Force-purge: only when the disk is already under the floor. Add the oldest
	// still-live entries (mtime ascending) until projected free (available + reclaimed)
	// clears the floor. `forced` flips only if we actually evict a not-yet-aged entry.
	let forced = false
	if (availableBytes < floorBytes) {
		const remaining = entries.filter((entry) => !aged.has(entry)).sort((a, b) => a.mtimeMs - b.mtimeMs)
		for (const entry of remaining) {
			if (availableBytes + bytesReclaimed >= floorBytes) break
			toDelete.push(entry)
			bytesReclaimed += entry.sizeBytes
			forced = true
		}
	}

	return {toDelete, forced, bytesReclaimed}
}

// RAW fs enumeration of a single `.Recycle.Bin` (W6 — NEVER files.list()/isHidden(),
// whose new `.Recycle.Bin` entry would make the walk skip its own target). Collects
// every leaf file (recursing through the `%U` subtrees). Per-entry errors are swallowed
// so a racing delete never aborts the walk.
async function walkRecycleBin(binPath: string): Promise<RecycleEntry[]> {
	const out: RecycleEntry[] = []
	async function recurse(dir: string): Promise<void> {
		let dirents
		try {
			dirents = await fse.readdir(dir, {withFileTypes: true})
		} catch {
			return
		}
		for (const dirent of dirents) {
			const full = nodePath.join(dir, dirent.name)
			try {
				if (dirent.isDirectory()) {
					await recurse(full)
				} else if (dirent.isFile()) {
					const stat = await fse.stat(full)
					out.push({path: full, mtimeMs: stat.mtimeMs, sizeBytes: stat.size})
				}
			} catch {
				// Racing delete / permission blip on a single entry — skip it.
			}
		}
	}
	await recurse(binPath)
	return out
}

// Best-effort bottom-up prune of now-empty subdirectories (keeps the top-level bin
// itself). Never throws — a non-empty or racing dir is simply left in place.
async function pruneEmptyDirs(binPath: string): Promise<void> {
	async function recurse(dir: string): Promise<void> {
		let dirents
		try {
			dirents = await fse.readdir(dir, {withFileTypes: true})
		} catch {
			return
		}
		for (const dirent of dirents) {
			if (dirent.isDirectory()) await recurse(nodePath.join(dir, dirent.name))
		}
		if (dir === binPath) return
		try {
			const remaining = await fse.readdir(dir)
			if (remaining.length === 0) await fse.rmdir(dir)
		} catch {
			// Non-empty / raced — leave it.
		}
	}
	await recurse(binPath)
}

// Never-throw scheduler handler — mirrors userQuotaScanHandler / connectivitySelfCheckHandler.
//
// W3: runs REGARDLESS of `smbRecycle.enabled` — disabling recycle stops stanza
// rendering + bin creation, NOT reclamation of already-binned files (exactly the
// cleanup an operator expects after toggling recycle off). Only the retention window
// is read from the store.
export const recyclePurgeHandler: BuiltInJobHandler = async (job, ctx) => {
	if (!ctx.livinityd) {
		ctx.logger.log(`[scheduler/recycle-purge] no daemon reference — skipping job ${job.name}`)
		return {status: 'skipped', error: 'daemon reference unavailable'}
	}
	const livinityd = ctx.livinityd
	try {
		ctx.logger.log(`[scheduler/recycle-purge] running job ${job.name}`)
		const current = (await livinityd.store.get('smbRecycle').catch(() => undefined)) ?? DEFAULT_SMB_RECYCLE
		const purgeDays = current.purgeDays > 0 ? current.purgeDays : DEFAULT_SMB_RECYCLE.purgeDays
		const shares = (await livinityd.store.get('files.shares').catch(() => [])) ?? []
		const nowMs = Date.now()

		let filesRemoved = 0
		let bytesReclaimed = 0
		let forced = false

		// Serialized per-share — bound I/O like the quota scan (one bin walk at a time).
		for (const share of shares) {
			try {
				const systemPath = await livinityd.files.virtualToSystemPath(share.path)
				const binPath = nodePath.join(systemPath, RECYCLE_BIN_DIRNAME)
				const entries = await walkRecycleBin(binPath)
				if (entries.length === 0) continue
				const {available} = await getDiskUsageByPath(systemPath).catch(() => ({available: Number.MAX_SAFE_INTEGER}))
				const plan = planRecyclePurge(entries, {
					nowMs,
					purgeDays,
					availableBytes: available,
					floorBytes: RECYCLE_FREE_FLOOR_BYTES,
				})
				for (const entry of plan.toDelete) {
					try {
						await fse.remove(entry.path)
						filesRemoved++
						bytesReclaimed += entry.sizeBytes
					} catch {
						// Per-entry failure must not abort the tick.
					}
				}
				if (plan.forced) forced = true
				await pruneEmptyDirs(binPath).catch(() => {})
			} catch (err) {
				// Per-share failure degrades gracefully (job overall still succeeds).
				ctx.logger.error(`[scheduler/recycle-purge] share ${share.path} failed`, err)
			}
		}

		// Persist fail-soft observability INSIDE the write lock, re-reading current so a
		// concurrent enabled/purgeDays edit that landed during the walk is not clobbered
		// (333-review F1 pattern — we own only lastPurge*).
		await livinityd.store
			.getWriteLock(async ({get, set}) => {
				const latest = (await get('smbRecycle')) ?? DEFAULT_SMB_RECYCLE
				await set('smbRecycle', {
					...latest,
					lastPurgeAt: Date.now(),
					lastPurgeStats: {filesRemoved, bytesReclaimed, forced},
				})
			})
			.catch((e) => ctx.logger.error('[scheduler/recycle-purge] failed to persist stats', e))

		ctx.logger.log(
			`[scheduler/recycle-purge] removed ${filesRemoved} file(s), reclaimed ${bytesReclaimed} bytes${forced ? ' (forced free-floor purge)' : ''}`,
		)
		return {status: 'success', output: {filesRemoved, bytesReclaimed, forced}}
	} catch (err) {
		// NOTE: 'failure', NOT 'error' — JobRunResult.status has no 'error' member.
		return {status: 'failure', error: err instanceof Error ? err.message : String(err)}
	}
}
