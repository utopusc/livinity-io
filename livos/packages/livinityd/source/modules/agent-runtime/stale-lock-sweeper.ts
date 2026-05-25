/**
 * Phase 208-04 — Stale lock sweeper.
 *
 * Boot-time scan that deletes `.lock` and `.trajectory-path.json.lock` files
 * older than 24h from `/opt/livos/data/openclaw/agents/` (and subdirectories).
 *
 * Replaces the in-log `find ... -mtime +1 -delete` directive from 208-CONTEXT
 * R5. Pure module so unit tests can mock fs + logger.
 *
 * Behaviour contract:
 *   - Returns `{scanned, removed[]}` for caller logging.
 *   - Caller-supplied logger receives (level: 'info'|'warn', msg: string).
 *     'info' for successful removals (path + age annotation); 'warn' for
 *     EBUSY / EACCES / inaccessible-root.
 *   - Non-lock files NEVER touched. The match is suffix-based so
 *     `agent.log` / `state.json` / `.lockfile-without-trailing-dot` are
 *     ignored.
 *   - Inaccessible rootDir is non-fatal: returns {scanned:0, removed:[]} with
 *     a single WARN. Caller's degraded boot path proceeds.
 *
 * Threat: T-208-04-01 (T) — only files matching the explicit LOCK_SUFFIXES
 * list are unlinked; arbitrary directory traversal cannot delete unrelated
 * files. Sweeper does not follow symlinks (readdir withFileTypes returns
 * Symbol-tagged dirents; isFile() is false for symlinks → skipped).
 */

import {readdir, stat, unlink} from 'node:fs/promises'
import type {Dirent} from 'node:fs'
import path from 'node:path'

export const STALE_LOCK_MAX_AGE_MS = 24 * 60 * 60 * 1000
const LOCK_SUFFIXES = ['.lock', '.trajectory-path.json.lock'] as const

export type SweepLogLevel = 'info' | 'warn'
export type SweepLogger = (level: SweepLogLevel, msg: string) => void

export interface SweepStaleLocksOptions {
	rootDir: string
	maxAgeMs?: number
	logger?: SweepLogger
	/** Test seam — defaults to `node:fs/promises` unlink. */
	unlinkImpl?: (full: string) => Promise<void>
}

export interface SweepStaleLocksResult {
	scanned: number
	removed: string[]
}

function defaultLogger(level: SweepLogLevel, msg: string): void {
	if (level === 'warn') console.warn(msg)
	else console.log(msg)
}

export async function sweepStaleLocks(
	opts: SweepStaleLocksOptions,
): Promise<SweepStaleLocksResult> {
	const maxAge = opts.maxAgeMs ?? STALE_LOCK_MAX_AGE_MS
	const log = opts.logger ?? defaultLogger
	const doUnlink = opts.unlinkImpl ?? ((full: string) => unlink(full))
	const removed: string[] = []
	let scanned = 0

	let entries: Dirent<string>[]
	try {
		// Cast through `unknown` — the readdir overload picker on @types/node 18
		// returns `Dirent<NonSharedBuffer>[]` when both flags are set, but at
		// runtime with string rootDir the names are strings.
		entries = (await readdir(opts.rootDir, {
			withFileTypes: true,
			recursive: true,
		})) as unknown as Dirent<string>[]
	} catch (err) {
		log(
			'warn',
			`[stale-lock-sweep] root dir not accessible: ${opts.rootDir} (${(err as Error).message})`,
		)
		return {scanned: 0, removed: []}
	}

	const now = Date.now()
	for (const entry of entries) {
		if (!entry.isFile()) continue
		if (!LOCK_SUFFIXES.some((s) => entry.name.endsWith(s))) continue
		scanned++
		// Node 20+ exposes `parentPath` on Dirent; cast through `unknown` since
		// the @types/node 18 baseline lacks the field.
		const parent =
			(entry as unknown as {parentPath?: string}).parentPath ?? opts.rootDir
		const full = path.join(parent, entry.name)
		try {
			const st = await stat(full)
			const ageMs = now - st.mtimeMs
			if (ageMs < maxAge) continue
			await doUnlink(full)
			removed.push(full)
			log(
				'info',
				`[stale-lock-sweep] removed ${full} (age=${Math.round(ageMs / 3600000)}h)`,
			)
		} catch (err) {
			const e = err as NodeJS.ErrnoException
			log(
				'warn',
				`[stale-lock-sweep] could not remove ${full}: ${e.code ?? ''} ${e.message}`.trim(),
			)
		}
	}
	return {scanned, removed}
}
