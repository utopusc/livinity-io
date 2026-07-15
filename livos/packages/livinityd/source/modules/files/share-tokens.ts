// Phase 324-01 FILES-01 (D-01) — file_shares opaque-token DAO.
//
// Clones modules/api-keys/{database,bearer-auth}.ts almost verbatim. One row
// per public share link. createShare() returns the cleartext
// `liv_share_<base64url-32>` token ONCE; only SHA-256(plaintext) is persisted
// in `token_hash`, so a leaked DB never reveals a usable link. Verification:
//   hashKey(presentedToken) -> findShareByHash() -> row WHERE
//     token_hash = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())
//
// Token format: `liv_share_` (10 chars) + 32 base64url chars = 42 chars total.
// Hash format:  SHA-256 hex (64 chars). Stored in token_hash CHAR(64) UNIQUE.
// Prefix:       first 18 chars of plaintext (e.g. `liv_share_XXXXXXXX`) for UI.
//
// DELTAS vs api-keys/database.ts:
//   - prefix `liv_share_` (not `liv_sk_`); table `file_shares` (not `api_keys`)
//   - extra cols: virtual_path, password_hash, expires_at, max_downloads,
//     download_count, last_accessed_at, owner_user_id (D-01)
//   - findShareByHash bakes the not-expired guard INTO the SQL so a not-found,
//     a revoked, and an expired share ALL collapse to the same generic null
//     (D-05 enumeration resistance — the caller cannot tell them apart)
//   - listSharesForUser returns ALL rows incl. revoked (D-05, CVE-2026-45285:
//     the owner's "my shares" audit must surface every share ever minted)
//
// `constantTimeHashEqual` is copied verbatim from api-keys/bearer-auth.ts:87-97.

import {createHash, randomBytes} from 'node:crypto'
import {Buffer} from 'node:buffer'
// NB: namespace import so a unit test's `vi.spyOn(crypto, 'timingSafeEqual')`
// intercepts THIS module's call site (mirrors bearer-auth.ts:43).
import * as crypto from 'node:crypto'

import {getPool} from '../database/index.js'

export interface FileShareRow {
	id: string
	ownerUserId: string
	virtualPath: string
	tokenPrefix: string
	passwordHash: string | null
	expiresAt: Date | null
	maxDownloads: number | null
	downloadCount: number
	lastAccessedAt: Date | null
	revokedAt: Date | null
	createdAt: Date
}

// SELECT cols deliberately EXCLUDE token_hash — callers never need the hash
// after creation (it is the lookup key, not a payload). password_hash IS
// selected because the route's password branch bcrypt-compares against it.
const SELECT_COLS = `id, owner_user_id, virtual_path, token_prefix, password_hash, expires_at, max_downloads, download_count, last_accessed_at, revoked_at, created_at`

function rowToShare(row: any): FileShareRow {
	return {
		id: row.id,
		ownerUserId: row.owner_user_id,
		virtualPath: row.virtual_path,
		tokenPrefix: row.token_prefix,
		passwordHash: row.password_hash ?? null,
		expiresAt: row.expires_at ?? null,
		maxDownloads: row.max_downloads ?? null,
		downloadCount: row.download_count ?? 0,
		lastAccessedAt: row.last_accessed_at ?? null,
		revokedAt: row.revoked_at ?? null,
		createdAt: row.created_at,
	}
}

/**
 * SHA-256 hex of the FULL plaintext (including the `liv_share_` prefix) — not
 * just the body — so prefix collisions cannot collapse two distinct tokens to
 * the same hash. Exposed because the share route hashes the presented token
 * before the lookup (mirrors api-keys/database.ts:57-59).
 */
export function hashKey(plaintext: string): string {
	return createHash('sha256').update(plaintext, 'utf-8').digest('hex')
}

/**
 * Constant-time SHA-256-hex comparison — copied verbatim from
 * api-keys/bearer-auth.ts:87-97. Defense-in-depth even though the SQL WHERE
 * `token_hash = $1` already establishes identity: length-mismatched inputs
 * return false WITHOUT calling `timingSafeEqual` (which throws on length
 * mismatch), and any error short-circuits to false — never throws. Pins the
 * code path to the constant-time primitive so a future refactor cannot
 * accidentally downgrade to a variable-time `===` (T-324-01).
 */
export function constantTimeHashEqual(presentedHex: string, rowHex: string): boolean {
	if (presentedHex.length !== rowHex.length) return false
	try {
		// Uint8Array (not Buffer) so the timingSafeEqual arg type is exactly
		// NodeJS.ArrayBufferView under the current @types/node — behaviourally
		// identical to the bearer-auth donor, but without inheriting its
		// Buffer<ArrayBufferLike> variance tsc error (keeps net-new tsc = 0).
		const a = new Uint8Array(Buffer.from(presentedHex, 'hex'))
		const b = new Uint8Array(Buffer.from(rowHex, 'hex'))
		if (a.length !== b.length) return false
		return crypto.timingSafeEqual(a, b)
	} catch {
		return false
	}
}

/**
 * Mint a fresh `liv_share_<base64url-32>` token, store its SHA-256 hash + an
 * 18-char prefix, return BOTH the row and the cleartext token. The cleartext is
 * shown to the owner ONCE — never retrievable later (only token_hash persists).
 *
 * Token entropy = randomBytes(24) = 192 bits, base64url-encoded then sliced to
 * 32 chars — NEVER shortened below that (D-05 anti-guessing).
 */
export async function createShare(opts: {
	ownerUserId: string
	virtualPath: string
	passwordHash?: string | null
	expiresAt?: Date | null
	maxDownloads?: number | null
}): Promise<{row: FileShareRow; plaintext: string}> {
	const pool = getPool()
	if (!pool) throw new Error('Database not initialized')

	const body = randomBytes(24).toString('base64url').slice(0, 32) // 32 base64url chars
	const plaintext = `liv_share_${body}` // 42 chars total
	const tokenHash = hashKey(plaintext) // 64 hex chars
	const tokenPrefix = plaintext.slice(0, 18) // 'liv_share_' + 8 chars for UI display

	const {rows} = await pool.query(
		`INSERT INTO file_shares
		   (owner_user_id, virtual_path, token_hash, token_prefix, password_hash, expires_at, max_downloads)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING ${SELECT_COLS}`,
		[
			opts.ownerUserId,
			opts.virtualPath,
			tokenHash,
			tokenPrefix,
			opts.passwordHash ?? null,
			opts.expiresAt ?? null,
			opts.maxDownloads ?? null,
		],
	)
	return {row: rowToShare(rows[0]), plaintext}
}

/**
 * Look up a file_shares row by its SHA-256 hash, IFF it is live: not revoked
 * AND not expired. Returns null if no matching row, OR the row is revoked, OR
 * the row has expired — the three cases are INDISTINGUISHABLE to the caller
 * (D-05), because the not-expired guard is baked into the SQL WHERE clause.
 *
 * Hot path — backed by the partial index idx_file_shares_active(token_hash)
 * WHERE revoked_at IS NULL.
 */
export async function findShareByHash(tokenHash: string): Promise<FileShareRow | null> {
	const pool = getPool()
	if (!pool) return null
	const {rows} = await pool.query(
		`SELECT ${SELECT_COLS} FROM file_shares
		 WHERE token_hash = $1
		   AND revoked_at IS NULL
		   AND (expires_at IS NULL OR expires_at > NOW())`,
		[tokenHash],
	)
	if (rows.length === 0) return null
	return rowToShare(rows[0])
}

/**
 * List file_shares rows for a single owner. INCLUDES revoked AND expired rows
 * so the owner's "my shares" audit list surfaces EVERY share ever minted — no
 * code path may mint a row that is invisible here (D-05, CVE-2026-45285).
 * Most-recent-first. Never returns token_hash (SELECT_COLS excludes it).
 */
export async function listSharesForUser(ownerUserId: string): Promise<FileShareRow[]> {
	const pool = getPool()
	if (!pool) return []
	const {rows} = await pool.query(
		`SELECT ${SELECT_COLS} FROM file_shares WHERE owner_user_id = $1 ORDER BY created_at DESC`,
		[ownerUserId],
	)
	return rows.map(rowToShare)
}

/**
 * Soft-revoke a file_shares row. Owner-scoped (a user cannot revoke another
 * user's share by guessing IDs) AND idempotent (revoked_at IS NULL guard makes
 * a second call a no-op, preserving the FIRST-revoke timestamp). The row is
 * NEVER hard-deleted — it stays visible in listSharesForUser for audit.
 *
 * Returns `{rowCount, tokenHash?}`: rowCount 0 → not updated (already revoked
 * OR not owned OR not found); rowCount 1 → tokenHash is the just-revoked row's
 * hash (for negative-cache invalidation, mirroring api-keys revokeApiKey).
 */
export async function revokeShare(opts: {
	id: string
	ownerUserId: string
}): Promise<{rowCount: number; tokenHash?: string}> {
	const pool = getPool()
	if (!pool) return {rowCount: 0}
	const result = await pool.query(
		`UPDATE file_shares SET revoked_at = NOW()
		 WHERE id = $1 AND owner_user_id = $2 AND revoked_at IS NULL
		 RETURNING token_hash`,
		[opts.id, opts.ownerUserId],
	)
	const rowCount = result.rowCount ?? 0
	if (rowCount === 0) return {rowCount: 0}
	return {rowCount, tokenHash: result.rows[0]?.token_hash as string | undefined}
}

/**
 * Record a successful download: bump download_count and last_accessed_at
 * atomically. Best-effort — a failed accounting write must never block the
 * download itself (the caller swallows errors).
 */
export async function incrementDownload(id: string): Promise<void> {
	const pool = getPool()
	if (!pool) return
	await pool.query(
		`UPDATE file_shares SET download_count = download_count + 1, last_accessed_at = NOW() WHERE id = $1`,
		[id],
	)
}

/**
 * Record a non-download access (metadata view / directory browse). Best-effort.
 */
export async function touchLastAccessed(id: string): Promise<void> {
	const pool = getPool()
	if (!pool) return
	await pool.query(`UPDATE file_shares SET last_accessed_at = NOW() WHERE id = $1`, [id])
}

// ─── In-memory negative cache (D-01, optional aid) ──────────────────────────
// Mirrors the two-TTL Map shape of api-keys/cache.ts:86-152 for the token-hash
// hot path. This is a brute-force-throttle AID only — the per-token Redis
// rate-limiter (D-03, built in the route layer) is the non-negotiable control.
// We do NOT reuse the last_used_at debouncer half: shares track
// download_count / last_accessed_at in PG on each hit instead.
const NEGATIVE_TTL_MS = 5_000 // caps brute-force PG QPS on unknown tokens

type NegativeEntry = {expiresAt: number}

export class ShareTokenNegativeCache {
	private readonly entries: Map<string, NegativeEntry> = new Map()

	/** True IFF this hash is cached as known-invalid and not yet expired. */
	isInvalid(tokenHash: string): boolean {
		const entry = this.entries.get(tokenHash)
		if (!entry) return false
		if (entry.expiresAt <= Date.now()) {
			this.entries.delete(tokenHash)
			return false
		}
		return true
	}

	setInvalid(tokenHash: string): void {
		this.entries.set(tokenHash, {expiresAt: Date.now() + NEGATIVE_TTL_MS})
	}

	/** Synchronous removal — call on revoke so a re-mint can't be masked. */
	invalidate(tokenHash: string): void {
		this.entries.delete(tokenHash)
	}
}
