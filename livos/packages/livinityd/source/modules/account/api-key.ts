// livos/packages/livinityd/source/modules/account/api-key.ts
//
// Phase 104 plan 104-10 — read the marketplace API key persisted at install
// time by plan 104-09's `--api-key liv_k_...` flag (mode-tunnel.sh's
// `_write_api_key_secret_if_provided`).
//
// 104-09 invariants we read:
//   - Redis key `livos:account:api_key_path` → absolute path to the secret file
//   - File is mode 0600, owned by root, inside /etc/livos/secrets/api-key
//   - Content is a single line: `liv_k_<nanoid(20)>` (minted at
//     platform/web api/dashboard/route.ts as `liv_k_${nanoid(20)}` — NOT
//     base64url / crypto.randomBytes; the 14-char prefix is stored in plaintext)
//
// SECURITY: this module NEVER returns the raw key on its happy-path API
// boundary outside the heartbeat sender's HTTP-header injection. The
// `redactedPreview()` helper returns a 6-char prefix + `***` for log lines.

import {readFile} from 'node:fs/promises'

const REDIS_API_KEY_PATH = 'livos:account:api_key_path'
const LIVOS_API_KEY_PREFIX = 'liv_k_'

/**
 * Phase 368.8-19 — fallback source for the same key.
 *
 * The file above is written mode 0600 owned by ROOT, and livinityd runs
 * unprivileged. Measured on the operator's box: run-user `everything` (uid
 * 1001), `/etc/livos/secrets/api-key` root:root 0600, `test -r` → NO. So the
 * heartbeat could never read it there and logged "API key unavailable (file
 * missing/empty/malformed)" on every restart — the file was neither missing nor
 * malformed, it was unreadable, which the message could not distinguish.
 *
 * Same archetype as the bind mount and the root-owned state directories in this
 * phase: an unprivileged service pointed at a privileged resource.
 *
 * install.sh already writes the identical key into Redis for the App Store
 * (`SET livos:platform:api_key`). Verified on the box rather than assumed —
 * sha256 of the Redis value and of the file matched exactly. So when the file
 * cannot be read, the key is still available, and refusing to send a heartbeat
 * over a permission bit we do not need is a self-inflicted outage.
 */
const REDIS_PLATFORM_API_KEY = 'livos:platform:api_key'
export const REDIS_KEY_SOURCE = `redis:${REDIS_PLATFORM_API_KEY}`

export interface ApiKeyRecord {
	readonly apiKey: string
	readonly path: string
}

export interface ApiKeyRedis {
	get(key: string): Promise<string | null>
}

/**
 * Read the marketplace API key from disk. Returns null when:
 *   - Redis key `livos:account:api_key_path` is unset (user didn't pass --api-key)
 *   - The pointed-to file is missing (operator deleted it)
 *   - The file is empty / whitespace-only
 *   - The file content doesn't start with `liv_k_` (malformed; refuse to send)
 *
 * Never throws — heartbeat sender treats `null` as "skip this round, don't crash".
 *
 * @param redis - ioredis-compatible client (only `get` used)
 */
export async function readApiKey(redis: ApiKeyRedis): Promise<ApiKeyRecord | null> {
	return (await readApiKeyFromFile(redis)) ?? (await readApiKeyFromRedis(redis))
}

/**
 * The original path: Redis holds a path, the file holds the key. Unchanged, and
 * still tried FIRST — on a box where the file is readable this is the source of
 * truth and nothing about its behaviour moves.
 */
async function readApiKeyFromFile(redis: ApiKeyRedis): Promise<ApiKeyRecord | null> {
	let path: string | null = null
	try {
		path = await redis.get(REDIS_API_KEY_PATH)
	} catch {
		// Redis transient error — caller will retry next interval
		return null
	}
	if (!path || path.length === 0) return null

	let raw: string
	try {
		raw = await readFile(path, 'utf-8')
	} catch {
		// File missing / permission denied / I/O error
		return null
	}

	const apiKey = raw.trim()
	if (apiKey.length === 0) return null
	if (!apiKey.startsWith(LIVOS_API_KEY_PREFIX)) {
		// Malformed — refuse to send. Heartbeat sender logs "API key shape
		// invalid" once and keeps looping (operator may have edited the file
		// by hand; on next valid write it auto-recovers).
		return null
	}

	return {apiKey, path}
}

/**
 * Phase 368.8-19 fallback: the key itself, straight out of Redis.
 *
 * Deliberately NOT a silent equal of the file path — `path` reports
 * `redis:livos:platform:api_key`, so a log line or a support session can tell
 * which source answered. Same validation as the file: a value that is not a
 * `liv_k_` key is refused rather than sent.
 *
 * This does not widen exposure. install.sh already puts this exact value in
 * Redis in plaintext for the App Store; reading what is already there is not a
 * new secret surface.
 */
async function readApiKeyFromRedis(redis: ApiKeyRedis): Promise<ApiKeyRecord | null> {
	let value: string | null = null
	try {
		value = await redis.get(REDIS_PLATFORM_API_KEY)
	} catch {
		return null
	}
	if (!value) return null

	const apiKey = value.trim()
	if (apiKey.length === 0) return null
	if (!apiKey.startsWith(LIVOS_API_KEY_PREFIX)) return null

	return {apiKey, path: REDIS_KEY_SOURCE}
}

/**
 * Produce a safe-for-logs preview of an API key value: prefix + 6 chars after
 * `liv_k_` + `***`. Example: `liv_k_iCCxIa***`. Never log the full key.
 */
export function redactedPreview(apiKey: string): string {
	if (!apiKey.startsWith(LIVOS_API_KEY_PREFIX)) return '<malformed>'
	const tail = apiKey.slice(LIVOS_API_KEY_PREFIX.length)
	const visible = tail.slice(0, 6)
	return `${LIVOS_API_KEY_PREFIX}${visible}***`
}

export const REDIS_KEY_API_KEY_PATH = REDIS_API_KEY_PATH
