import nodePath from 'node:path'

import fse from 'fs-extra'
import PQueue from 'p-queue'

import getDirectorySize from '../utilities/get-directory-size.js'
import {getDiskUsageByPath} from '../system/system.js'
import {findUserByUsername} from '../database/index.js'

import type Livinityd from '../../index.js'

// Phase 340 USBIMP-01 (D-340-2) — role captured on a rule; re-resolved fresh from the
// DB at import time. Structurally the same union as files.ts' FileUserInfo['role'] —
// declared locally (not imported) to keep this runner free of a `fileUserContext`
// value-import (WARN-2: avoids the files⇄usb-import cycle).
export type UsbImportRole = 'admin' | 'member' | 'guest'

// Phase 340 USBIMP-01 (D-340-2) — one opt-in copy-on-insert rule. `id` is a stable
// uuid independent of device identity; the EXPLICIT owner (`ownerUsername`/`ownerRole`)
// is captured at rule-create because a USB insert has no request/session. `lastRun` is
// fail-soft observability written by the runner (undefined until the first import).
export type UsbImportRule = {
	id: string
	enabled: boolean
	destinationVirtualPath: string
	ownerUsername: string
	ownerRole: UsbImportRole
	lastRun?: {
		at: number
		copied: number
		failed: number
		skipped: number
		destinationPath: string
	}
}

type LastRun = NonNullable<UsbImportRule['lastRun']>

// Standard removable-media junk excluded from the copy (rsync bare-name `--exclude`
// patterns match by basename at any depth) and tallied as `skipped` in the summary.
// `._*` covers AppleDouble sidecar files. Case-sensitive (canonical names) for v1.
export const USB_IMPORT_JUNK = [
	'.Spotlight-V100',
	'.Trashes',
	'.fseventsd',
	'.TemporaryItems',
	'.DS_Store',
	'System Volume Information',
	'$RECYCLE.BIN',
	'Thumbs.db',
	'desktop.ini',
	'._*',
] as const

// Basename junk matcher — exact match for the canonical names, prefix match for `._*`.
function isJunkName(name: string): boolean {
	for (const pattern of USB_IMPORT_JUNK) {
		if (pattern === '._*') {
			if (name.startsWith('._')) return true
		} else if (name === pattern) {
			return true
		}
	}
	return false
}

// Offline-testable Node walk (no shell-out) counting regular importable files and
// tallying junk. A junk-named entry is counted once and NOT descended (mirrors the
// rsync `--exclude` of the whole tree). Defensive: a readdir failure (vanished device
// mid-walk) degrades to whatever was counted, never a throw.
export async function scanSourceCounts(systemPath: string): Promise<{fileCount: number; junkCount: number}> {
	let fileCount = 0
	let junkCount = 0

	async function walk(directory: string): Promise<void> {
		let entries: fse.Dirent[]
		try {
			entries = await fse.readdir(directory, {withFileTypes: true})
		} catch {
			// Treat an unreadable directory as a leaf — count nothing, never throw.
			return
		}
		for (const entry of entries) {
			if (isJunkName(entry.name)) {
				junkCount++
				continue
			}
			if (entry.isDirectory()) {
				await walk(nodePath.join(directory, entry.name))
			} else if (entry.isFile()) {
				fileCount++
			}
			// symlinks / special files are ignored for counting purposes
		}
	}

	await walk(systemPath)
	return {fileCount, junkCount}
}

// Filename-safe local timestamp `YYYY-MM-DD HH-MM-SS` (dashes, NO colon). A3 — new Date()
// is allowed in the daemon runtime.
function formatTimestamp(date: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0')
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
}

// The outcome of a single import attempt. `skip` fires NEITHER a notification NOR a
// lastRun write (empty/suppressed insert = a true no-op).
type ImportOutcome = {kind: 'skip'} | {kind: 'success'; lastRun: LastRun} | {kind: 'failed'; lastRun?: LastRun}

// Phase 340 USBIMP-01 — the detached USB copy-on-insert runner, constructed as
// Files#usbImport (mirrors Files#externalStorage). Owns a concurrency:1 PQueue = the
// module-level in-flight guard so several rapid inserts queue rather than thrash the
// disk. Hooked (NOT awaited) from #mountExternalDevices after a successful mount.
export default class UsbImport {
	#livinityd: Livinityd
	logger: Livinityd['logger']
	#queue = new PQueue({concurrency: 1})

	constructor(livinityd: Livinityd) {
		this.#livinityd = livinityd
		this.logger = livinityd.logger.createChildLogger('files:usbimport')
	}

	// Called DETACHED from the mount loop. Reads the rules, enqueues one import job per
	// enabled rule, returns fast (never awaits a copy). Never throws.
	async handleNewMount(mount: {label: string; virtualMountPoint: string}): Promise<void> {
		let rules: UsbImportRule[] = []
		try {
			rules = (await this.#livinityd.store.get('usbImport')) ?? []
		} catch (error) {
			this.logger.error('[usb-import] failed to read rules', error)
			return
		}
		for (const rule of rules) {
			if (!rule.enabled) continue
			// Enqueue detached — do NOT await the copy; the queue serializes at concurrency:1.
			void this.#queue.add(() => this.#runImport(rule, mount)).catch((error) =>
				this.logger.error(`[usb-import] rule ${rule.id} crashed`, error),
			)
		}
	}

	// Resolves when all queued imports have settled. The mount flow NEVER awaits this
	// (a slow import must not block hotplug); it exists for stop()/tests.
	onIdle(): Promise<void> {
		return this.#queue.onIdle()
	}

	async #runImport(rule: UsbImportRule, mount: {label: string; virtualMountPoint: string}): Promise<void> {
		// 1. Resolve the owner fresh from the DB (fail-closed — a deleted/deactivated owner
		//    is inert, never a fall-through to the global tree).
		let dbUser
		try {
			dbUser = await findUserByUsername(rule.ownerUsername)
		} catch {
			dbUser = null
		}
		if (!dbUser || !dbUser.isActive) {
			this.logger.error(`[usb-import] rule ${rule.id} owner '${rule.ownerUsername}' missing/inactive — skipping`)
			await this.#notifyFailed(rule.id)
			return
		}
		const owner: {username: string; role: UsbImportRole} = {username: dbUser.username, role: dbUser.role}

		// 2. Everything runs inside the owner's file context, entered via Files.runAsUser
		//    (WARN-2: NOT a fileUserContext value-import — avoids the files⇄usb-import cycle).
		let outcome: ImportOutcome
		try {
			outcome = await this.#livinityd.files.runAsUser(owner, () => this.#importForOwner(rule, mount, owner))
		} catch (error) {
			// 5. Backstop for any unexpected throw — a clean failed outcome, never a reject
			//    out to the queue that matters.
			this.logger.error(`[usb-import] rule ${rule.id} unexpected failure`, error)
			outcome = {
				kind: 'failed',
				lastRun: {at: Date.now(), copied: 0, failed: 0, skipped: 0, destinationPath: rule.destinationVirtualPath},
			}
		}

		if (outcome.kind === 'skip') return
		if (outcome.lastRun) await this.#persistLastRun(rule.id, outcome.lastRun)
		if (outcome.kind === 'success') await this.#notifyComplete(rule.id)
		else await this.#notifyFailed(rule.id)
	}

	// Runs INSIDE fileUserContext.run(owner). Confined to the owner's base dir by every
	// virtualToSystemPath/getAllowedOperations call. Returns an outcome; the caller does
	// the persist + notify (so this never double-fires).
	async #importForOwner(
		rule: UsbImportRule,
		mount: {label: string; virtualMountPoint: string},
		owner: {username: string; role: UsbImportRole},
	): Promise<ImportOutcome> {
		// a. Source system path (throws [escapes-base]/[invalid-base] if not confined).
		const sourceSystemPath = await this.#livinityd.files.virtualToSystemPath(mount.virtualMountPoint)

		// b. REAL recursive size (D-340-3a — the gap fix; do NOT rely on copy()'s ~4KB
		//    directory-inode fse.stat().size).
		const realBytes = await getDirectorySize(sourceSystemPath)

		// c. File/junk pre-scan for the summary counts.
		const {fileCount: sourceFileCount, junkCount: skipped} = await scanSourceCounts(sourceSystemPath)

		// WARN-1 guard 1: an empty / all-junk source (e.g. a just-formatted card) produces
		// NO copy and NO notification — a true no-op, no bell.
		if (sourceFileCount === 0) {
			this.logger.log(`[usb-import] rule ${rule.id} source has no importable files — skipping`)
			return {kind: 'skip'}
		}

		// NOTE: create/confirm the destination BEFORE the free-space precheck —
		// getDiskUsageByPath/statvfs throws on a missing path. createDirectory is confined,
		// writable-gated and idempotent (returns true if it already exists); a failure here
		// (missing parent, escapes-base, unwritable) is a clean "destination unavailable".
		try {
			await this.#livinityd.files.createDirectory(rule.destinationVirtualPath)
		} catch (error) {
			this.logger.error(`[usb-import] rule ${rule.id} destination '${rule.destinationVirtualPath}' unavailable`, error)
			return {
				kind: 'failed',
				lastRun: {at: Date.now(), copied: 0, failed: sourceFileCount, skipped, destinationPath: rule.destinationVirtualPath},
			}
		}

		// d. Destination parent system path + free-space precheck against the REAL size.
		const destParentSystem = await this.#livinityd.files.virtualToSystemPath(rule.destinationVirtualPath)
		const {available} = await getDiskUsageByPath(destParentSystem)
		const buffer = 1024 * 1024 * 1024 // 1GB (mirrors copy())
		if (available < realBytes + buffer) {
			this.logger.error(`[usb-import] rule ${rule.id} not enough space (need ${realBytes + buffer}, have ${available}) — skipping copy`)
			return {
				kind: 'failed',
				lastRun: {at: Date.now(), copied: 0, failed: sourceFileCount, skipped, destinationPath: rule.destinationVirtualPath},
			}
		}

		// e. Owner quota precheck with the REAL bytes (D-340-3a — same gates copy() calls,
		//    fed the true size instead of the inode size). assertWithinQuota is a no-op for
		//    an admin/undefined subject.
		const quotaSubject = owner.role !== 'admin' ? owner.username : undefined
		try {
			await this.#livinityd.files.assertWithinQuota(quotaSubject, realBytes)
			await this.#livinityd.files.assertWithinFolderQuota(rule.destinationVirtualPath, realBytes)
		} catch (error) {
			this.logger.error(`[usb-import] rule ${rule.id} over quota — skipping copy`, error)
			return {
				kind: 'failed',
				lastRun: {at: Date.now(), copied: 0, failed: sourceFileCount, skipped, destinationPath: rule.destinationVirtualPath},
			}
		}

		// f. Timestamped destination + junk-skipped copy. copy() names the result by
		//    basename(source), so we rename to the timestamped name afterwards. Both are
		//    public, confined, quota-gated and give operation-progress for free.
		const ts = formatTimestamp(new Date())
		const folderBase = (mount.label?.trim() || 'USB Import').replace(/[^a-zA-Z0-9 '_\-]/g, '') || 'USB Import'
		const desired = `${folderBase} ${ts}`

		let copiedVirtual: string | undefined
		let destinationPath = rule.destinationVirtualPath
		try {
			copiedVirtual = await this.#livinityd.files.copy(mount.virtualMountPoint, rule.destinationVirtualPath, {
				collision: 'keep-both',
				excludes: [...USB_IMPORT_JUNK],
			})
			const finalSystem = await this.#livinityd.files.getUniqueName(nodePath.join(destParentSystem, desired))
			const finalName = nodePath.basename(finalSystem)
			destinationPath = await this.#livinityd.files.rename(copiedVirtual, finalName)
		} catch (error) {
			// 3. Partial / mid-copy failure (device yanked, ENOSPC mid-run, unreadable files).
			//    rsync rejects on a non-zero exit. The copied/failed split is an honest
			//    approximation from a best-effort re-scan of whatever landed (NOTE — the
			//    rsync-exit-based counting is an accepted v1 approximation).
			this.logger.error(`[usb-import] rule ${rule.id} copy failed/partial`, error)
			let landed = 0
			if (copiedVirtual) {
				try {
					const landedSystem = await this.#livinityd.files.virtualToSystemPath(copiedVirtual)
					landed = (await scanSourceCounts(landedSystem)).fileCount
				} catch {
					landed = 0
				}
			}
			return {
				kind: 'failed',
				lastRun: {
					at: Date.now(),
					copied: landed,
					failed: Math.max(1, sourceFileCount - landed),
					skipped,
					destinationPath: copiedVirtual ?? destinationPath,
				},
			}
		}

		// g. rsync exit 0 ⇒ success.
		return {
			kind: 'success',
			lastRun: {at: Date.now(), copied: sourceFileCount, failed: 0, skipped, destinationPath},
		}
	}

	// Read-modify-write persist of a rule's lastRun under the store write-lock (verbatim
	// shape from routes.ts folderQuotaSet). A failed lastRun write must never break the
	// import outcome or notification.
	async #persistLastRun(ruleId: string, lastRun: LastRun): Promise<void> {
		try {
			await this.#livinityd.store.getWriteLock(async ({get, set}) => {
				const current = (await get('usbImport')) ?? []
				const next = current.map((r) => (r.id === ruleId ? {...r, lastRun} : r))
				await set('usbImport', next)
			})
		} catch (error) {
			this.logger.error(`[usb-import] rule ${ruleId} failed to persist lastRun`, error)
		}
	}

	async #notifyComplete(ruleId: string): Promise<void> {
		await this.#livinityd.notifications
			.add('usb-import-complete:' + ruleId, {severity: 'info', external: false})
			.catch(() => {})
	}

	async #notifyFailed(ruleId: string): Promise<void> {
		await this.#livinityd.notifications
			.add('usb-import-failed:' + ruleId, {severity: 'warning', external: false})
			.catch(() => {})
	}
}
