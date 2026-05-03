// Phase 59 FR-BROKER-B1-01..02 — api_keys PG CRUD.
//
// One row per user-issued Bearer key. createApiKey() returns the cleartext
// `liv_sk_<base64url-32>` token ONCE; only SHA-256(plaintext) is persisted in
// `key_hash`, so a leaked DB never reveals tokens. Verification path:
//   hashKey(presentedToken) -> findApiKeyByHash() -> row WHERE revoked_at IS NULL
//
// Token format: `liv_sk_` (7 chars) + 32 base64url chars = 39 chars total.
// Hash format:  SHA-256 hex (64 chars). Stored in key_hash CHAR(64) UNIQUE.
// Prefix:       first 8 chars of plaintext (e.g. `liv_sk_X`) for UI display.
//
// Twin pattern: docker/agents.ts (Phase 22 MH-04). The shape is intentionally
// near-identical so future maintainers see the contract immediately. The two
// deltas vs docker_agents:
//   - last_used_at is debounced via the cache module in Wave 2 (NOT here).
//   - listAll joins `users.username` for the admin-only listAll route.

import {createHash, randomBytes} from 'node:crypto'

import {getPool} from '../database/index.js'

export interface ApiKeyRow {
	id: string
	userId: string
	keyPrefix: string
	name: string
	createdAt: Date
	lastUsedAt: Date | null
	revokedAt: Date | null
}

// SELECT cols deliberately EXCLUDE key_hash — callers never need the hash
// after creation (the hash is the lookup key, not a payload). Defends against
// accidentally exposing the hash to API clients.
const SELECT_COLS = `id, user_id, key_prefix, name, created_at, last_used_at, revoked_at`

function rowToApiKey(row: any): ApiKeyRow {
	return {
		id: row.id,
		userId: row.user_id,
		keyPrefix: row.key_prefix,
		name: row.name,
		createdAt: row.created_at,
		lastUsedAt: row.last_used_at,
		revokedAt: row.revoked_at,
	}
}

/**
 * Hash a cleartext API key for storage / lookup. SHA-256 hex of the FULL
 * plaintext (including the `liv_sk_` prefix) — not just the body — so prefix
 * collisions cannot collapse two distinct keys to the same hash (T-59-08).
 *
 * Exposed because the Bearer middleware on every request hashes the presented
 * key before the lookup.
 */
export function hashKey(plaintext: string): string {
	return createHash('sha256').update(plaintext, 'utf-8').digest('hex')
}

/**
 * Generate a fresh `liv_sk_<base64url-32>` plaintext key, store its SHA-256
 * hash + 8-char prefix, return BOTH the row and the cleartext key. The
 * cleartext is shown to the user ONCE — never retrievable later.
 *
 * T-59-05 mitigation: plaintext is returned in the `{row, plaintext}` tuple
 * but is never persisted to PG (only `key_hash`) and is never written to the
 * logger from this module.
 */
export async function createApiKey(opts: {
	userId: string
	name: string
}): Promise<{row: ApiKeyRow; plaintext: string}> {
	const pool = getPool()
	if (!pool) throw new Error('Database not initialized')

	const body = randomBytes(24).toString('base64url').slice(0, 32) // 32 base64url chars
	const plaintext = `liv_sk_${body}` // 39 chars total
	const keyHash = hashKey(plaintext) // 64 hex chars
	const keyPrefix = plaintext.slice(0, 8) // 8 chars: 'liv_sk_X'

	const {rows} = await pool.query(
		`INSERT INTO api_keys (user_id, key_hash, key_prefix, name)
		 VALUES ($1, $2, $3, $4)
		 RETURNING ${SELECT_COLS}`,
		[opts.userId, keyHash, keyPrefix, opts.name],
	)
	return {row: rowToApiKey(rows[0]), plaintext}
}

/**
 * Look up an api_keys row by its SHA-256 hash, IFF not revoked.
 * Returns null if no matching row OR row is revoked.
 *
 * Hot path — every Bearer-authed broker request hits this exactly once
 * (cached by the Wave 2 cache module). Backed by partial index
 * idx_api_keys_active(key_hash) WHERE revoked_at IS NULL.
 */
export async function findApiKeyByHash(keyHash: string): Promise<ApiKeyRow | null> {
	const pool = getPool()
	if (!pool) return null
	const {rows} = await pool.query(
		`SELECT ${SELECT_COLS} FROM api_keys WHERE key_hash = $1 AND revoked_at IS NULL`,
		[keyHash],
	)
	if (rows.length === 0) return null
	return rowToApiKey(rows[0])
}

/**
 * List api_keys rows for a single user. INCLUDES revoked rows so the user can
 * see history (RESEARCH.md Open Question 2 verdict). Most-recent-first.
 *
 * Never returns key_hash (SELECT_COLS deliberately excludes it).
 */
export async function listApiKeysForUser(userId: string): Promise<ApiKeyRow[]> {
	const pool = getPool()
	if (!pool) return []
	const {rows} = await pool.query(
		`SELECT ${SELECT_COLS} FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
		[userId],
	)
	return rows.map(rowToApiKey)
}

/**
 * Admin-only cross-user listing. Joins `users.username` for display.
 * Optional userId filter narrows to a single user (incident response).
 *
 * Mirrors usage.queryUsageAll (Phase 44). adminProcedure-bound at the tRPC
 * layer in Wave 3 (NOT here — this layer is auth-agnostic).
 */
export async function listAllApiKeys(opts?: {userId?: string}): Promise<
	Array<ApiKeyRow & {username: string}>
> {
	const pool = getPool()
	if (!pool) return []
	if (opts?.userId) {
		const {rows} = await pool.query(
			`SELECT ${SELECT_COLS.split(', ').map((c) => `ak.${c}`).join(', ')}, u.username
			 FROM api_keys ak
			 LEFT JOIN users u ON ak.user_id = u.id
			 WHERE ak.user_id = $1
			 ORDER BY ak.created_at DESC`,
			[opts.userId],
		)
		return rows.map((r: any) => ({...rowToApiKey(r), username: r.username ?? ''}))
	}
	const {rows} = await pool.query(
		`SELECT ${SELECT_COLS.split(', ').map((c) => `ak.${c}`).join(', ')}, u.username
		 FROM api_keys ak
		 LEFT JOIN users u ON ak.user_id = u.id
		 ORDER BY ak.created_at DESC`,
	)
	return rows.map((r: any) => ({...rowToApiKey(r), username: r.username ?? ''}))
}

/**
 * Revoke an api_keys row. User-scoped (T-59-06: a malicious or compromised
 * user cannot revoke another user's key by guessing IDs) AND idempotent
 * (revoked_at IS NULL guard means second call is a no-op, preserving the
 * FIRST-revoke timestamp).
 *
 * Returns rowCount so the Wave 3 tRPC route can throw NOT_FOUND on rowCount=0
 * (key already revoked OR doesn't belong to caller OR doesn't exist).
 */
export async function revokeApiKey(opts: {
	id: string
	userId: string
}): Promise<{rowCount: number}> {
	const pool = getPool()
	if (!pool) return {rowCount: 0}
	const result = await pool.query(
		`UPDATE api_keys SET revoked_at = NOW()
		 WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
		[opts.id, opts.userId],
	)
	return {rowCount: result.rowCount ?? 0}
}
