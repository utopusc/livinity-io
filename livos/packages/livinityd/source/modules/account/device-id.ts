// livos/packages/livinityd/source/modules/account/device-id.ts
//
// Phase 104 plan 104-10 — stable per-box UUID for the heartbeat payload.
//
// On first call this generates a UUIDv4 via the Node built-in
// `crypto.randomUUID()` (no external deps), persists it to
// `/var/lib/livos/device-id` (mode 0600), and returns it. On subsequent
// calls it reads the existing UUID off disk. Idempotent across restarts so
// Server5's `devices.device_id` column stays stable for this box for its
// entire life.
//
// Path lives under /var/lib/livos (writable by the livos user) rather than
// /etc/livos/secrets (root-only) because livinityd runs as the `livos`
// systemd user — /etc/livos/secrets/* is for install-time root writes only
// (CF tunnel token, marketplace api-key).

import {randomUUID} from 'node:crypto'
import {readFile, writeFile, mkdir, chmod} from 'node:fs/promises'
import path from 'node:path'

export const DEVICE_ID_DIR = '/var/lib/livos'
export const DEVICE_ID_PATH = path.join(DEVICE_ID_DIR, 'device-id')

// UUIDv4 shape sanity-check. randomUUID() never produces malformed values,
// but a stale/edited file on disk might — we re-generate in that case.
const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Returns the stable device-id UUID for this box. Generates + persists on
 * first call; reads + returns on subsequent calls. Persists with mode 0600.
 *
 * Robustness: if the on-disk file exists but contains a malformed value
 * (e.g. operator hand-edited it), regenerates a fresh UUID and overwrites
 * — the device "re-pairs" silently rather than wedging the heartbeat.
 */
export async function getOrCreateDeviceId(
	deviceIdPath: string = DEVICE_ID_PATH,
): Promise<string> {
	// Try to read existing
	try {
		const raw = await readFile(deviceIdPath, 'utf-8')
		const candidate = raw.trim()
		if (UUID_RE.test(candidate)) {
			return candidate
		}
		// Fall through to regeneration on malformed content
	} catch {
		// File doesn't exist — fall through to creation
	}

	// Generate, write, chmod
	const uuid = randomUUID()
	const dir = path.dirname(deviceIdPath)
	try {
		await mkdir(dir, {recursive: true, mode: 0o755})
	} catch {
		// Directory may already exist; mkdir with recursive:true is
		// idempotent, only rethrow if create fails for other reasons. Caller
		// will see writeFile error below if the path is truly unwritable.
	}
	await writeFile(deviceIdPath, uuid + '\n', {encoding: 'utf-8', mode: 0o600})
	// Re-chmod in case the file already existed with a different mode
	// (writeFile mode is honored only on file creation).
	try {
		await chmod(deviceIdPath, 0o600)
	} catch {
		// Non-fatal: ownership / FS may not support chmod (test envs).
	}
	return uuid
}
