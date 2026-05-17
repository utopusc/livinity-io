// Phase 141-01 — Drain install-time queued Redis seeds.
//
// `scripts/install/_logging.sh:set_livos_redis_key` writes `KEY=VALUE` lines to
// `/var/lib/livos/install-pending-redis-keys.txt` when Redis isn't reachable at
// install.sh time (which is the common case — Redis is brought up later in the
// install). Without this drainer the queued seeds (most importantly
// `livos:domain:local_mode`) never reach Redis, so:
//
//   1. apps.ts rebuildCaddy reads an empty `local_mode` and treats the box as
//      non-tunnel → emits bare host blocks (no `http://` prefix) and CF Tunnel
//      requests 308-redirect-loop.
//   2. Phase 112 boot-fallback for `livos:domain:config` falls into the default
//      branch (cloud) and skips seeding the config → App Gateway middleware
//      short-circuits and serves the livinityd UI on every subdomain instead of
//      proxying to the app container.
//
// This drainer runs on every livinityd boot, BEFORE the Phase 112 fallback so
// the config seed sees the correct `local_mode`. It is idempotent + crash-safe:
//
//   - SETNX semantics: queued line only writes if the key is currently absent.
//     Runtime edits via `redis-cli SET` survive reboots.
//   - File is removed only after every line was either applied or skipped — a
//     partial-failure leaves the file in place so the next boot retries.
//   - Empty lines + lines without `=` are silently ignored.

import {readFile, unlink} from 'node:fs/promises'

export const PENDING_FILE_PATH = '/var/lib/livos/install-pending-redis-keys.txt'

export interface RedisLike {
	setnx(key: string, value: string): Promise<number | string>
}

export interface DrainLogger {
	log: (msg: string) => void
	error: (msg: string, err?: unknown) => void
}

export interface DrainResult {
	applied: number
	skipped: number
	errored: number
}

// Module-level for easier test stubbing.
const fileOps = {
	read: (p: string) => readFile(p, 'utf8'),
	remove: (p: string) => unlink(p),
}

export async function drainInstallPendingRedisKeys(
	redis: RedisLike,
	logger: DrainLogger,
	pendingPath: string = PENDING_FILE_PATH,
): Promise<DrainResult> {
	let raw: string
	try {
		raw = await fileOps.read(pendingPath)
	} catch (err: unknown) {
		// ENOENT = nothing queued. Anything else = real I/O error.
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
			return {applied: 0, skipped: 0, errored: 0}
		}
		logger.error(`drain-install-pending: failed to read ${pendingPath}`, err)
		return {applied: 0, skipped: 0, errored: 1}
	}

	const result: DrainResult = {applied: 0, skipped: 0, errored: 0}
	const lines = raw.split('\n')

	for (const line of lines) {
		const trimmed = line.trim()
		if (!trimmed) continue

		const eqIdx = trimmed.indexOf('=')
		if (eqIdx <= 0) continue // malformed — no key or no `=`

		const key = trimmed.slice(0, eqIdx)
		const value = trimmed.slice(eqIdx + 1)

		try {
			// SETNX: only apply if Redis doesn't already hold a value. This
			// preserves any runtime overrides the operator may have made since
			// the queue file was written.
			const writtenRaw = await redis.setnx(key, value)
			const written = typeof writtenRaw === 'number' ? writtenRaw : Number(writtenRaw)
			if (written === 1) {
				result.applied++
				logger.log(`drain-install-pending: applied ${key}=${value}`)
			} else {
				result.skipped++
			}
		} catch (err) {
			result.errored++
			logger.error(`drain-install-pending: failed to apply ${key}`, err)
		}
	}

	// Only remove the file when nothing errored. A partial failure leaves the
	// file in place so the next boot retries the failed keys (the successful
	// ones are no-ops thanks to SETNX).
	if (result.errored === 0) {
		try {
			await fileOps.remove(pendingPath)
		} catch (err) {
			logger.error(`drain-install-pending: failed to remove ${pendingPath}`, err)
		}
	}

	return result
}

// Test seam — production callers should not touch this.
export const _testing = {
	setFileOps(ops: Partial<typeof fileOps>) {
		Object.assign(fileOps, ops)
	},
	resetFileOps() {
		fileOps.read = (p: string) => readFile(p, 'utf8')
		fileOps.remove = (p: string) => unlink(p)
	},
}
