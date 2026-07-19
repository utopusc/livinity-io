// Phase 346-01 (MCP-01, D-346-4) — mcp_control_keys PG CRUD (scoped `liv_mcp_*`).
//
// ─────────────────────────────────────────────────────────────────────────────
// ZERO imports from the broker/subscription path. This module (and the whole
// mcp-control/ tree) MUST NEVER import from apps/inject-ai-provider.ts,
// apps/cred-egress-proxy.ts, apps/metered-key.ts, plugins/livinity-broker/*, or
// api-keys/* — mirroring the usage-tracking/* "ZERO imports" discipline. The
// broker/subscription path (feedback_subscription_only, sacred) is never
// reached, extended, or referenced. __tests__/broker-zero-import.test.ts is the
// CI-provable enforcement of this rule (D-346-2).
// ─────────────────────────────────────────────────────────────────────────────
//
// One row per admin-minted MCP control-plane key. createMcpControlKey() returns
// the cleartext `liv_mcp_<base64url-32>` token ONCE; only SHA-256(plaintext) is
// persisted in `key_hash`, so a leaked DB never reveals a usable key.
// Verification path (built in Plan 02):
//   hashMcpControlKey(presentedToken) -> findMcpControlKeyByHash() -> row WHERE
//   revoked_at IS NULL
//
// Token format: `liv_mcp_` (8 chars) + 32 base64url chars = 40 chars total.
// Hash format:  SHA-256 hex (64 chars). Stored in key_hash CHAR(64) UNIQUE.
// Prefix:       first 8 chars of plaintext (== `liv_mcp_`) for UI display.
//
// This table is DELIBERATELY SEPARATE from api_keys (the broker `liv_sk_` table):
// physical table separation is the structural guarantee that a `liv_mcp_` value
// can never be resolved by the broker bearer path (bearer-auth.ts queries
// api_keys only) nor by the LIV_API_KEY env compare (is-authenticated.ts). The
// shape mirrors api_keys intentionally so maintainers see the contract at a
// glance; the sole delta is `created_by` (minter attribution) replacing
// `user_id` — an MCP key is a system-scoped credential, not a per-user token.

import {createHash, randomBytes} from 'node:crypto'

import {getPool} from '../database/index.js'

/**
 * The DISTINCT plaintext prefix for MCP control-plane keys. Deliberately NOT the
 * broker's `liv_sk_` — the two prefixes never collide, so a `liv_mcp_` value can
 * never be mistaken for a broker bearer token by any layer.
 */
export const MCP_KEY_PLAINTEXT_PREFIX = 'liv_mcp_' as const

export interface McpControlKeyRow {
	id: string
	keyPrefix: string
	name: string
	createdBy: string | null
	createdAt: Date
	lastUsedAt: Date | null
	revokedAt: Date | null
	/**
	 * SHA-256 hex hash. Populated ONLY by findMcpControlKeyByHash (the internal
	 * auth-lookup path) so the transport auth gate can run a REAL fail-closed
	 * constant-time compare (WARN-01). DELIBERATELY absent on listMcpControlKeys /
	 * createMcpControlKey rows — key_hash is NEVER surfaced to any route/UI.
	 */
	keyHash?: string
}

// SELECT cols deliberately EXCLUDE key_hash — list/create callers never need the
// hash (the hash is the lookup key, not a payload). Mirrors the api-keys
// discipline; defends against accidentally exposing the hash to API clients. The
// ONLY reader of key_hash is the internal by-hash auth lookup (SELECT_COLS_WITH_HASH).
const SELECT_COLS = `id, key_prefix, name, created_by, created_at, last_used_at, revoked_at`

// The by-hash auth lookup ALSO carries key_hash so the transport auth gate can
// run a REAL fail-closed constant-time compare (WARN-01). key_hash stays INTERNAL
// to this one lookup — list/create still project SELECT_COLS (hash excluded).
const SELECT_COLS_WITH_HASH = `${SELECT_COLS}, key_hash`

function rowToKey(row: any): McpControlKeyRow {
	const mapped: McpControlKeyRow = {
		id: row.id,
		keyPrefix: row.key_prefix,
		name: row.name,
		createdBy: row.created_by ?? null,
		createdAt: row.created_at,
		lastUsedAt: row.last_used_at,
		revokedAt: row.revoked_at,
	}
	// key_hash is carried ONLY when the query selected it (the internal by-hash
	// auth lookup). list/create SELECTs exclude it, so it stays absent here —
	// never surfaced to any route/UI.
	if (row.key_hash != null) mapped.keyHash = row.key_hash as string
	return mapped
}

/**
 * Fire-and-forget bump of last_used_at on a successful auth lookup (INFO-03) so
 * the admin UI "last used" reflects reality instead of always "never". This is a
 * best-effort, NON-BLOCKING write: a failure is swallowed and NEVER propagated —
 * an operational-visibility write must never block or fail an auth decision. A
 * direct UPDATE is sufficient at loopback v1 scale (no batched flush needed).
 */
function touchMcpControlKeyLastUsed(
	pool: NonNullable<ReturnType<typeof getPool>>,
	id: string,
): void {
	try {
		const result = pool.query(
			`UPDATE mcp_control_keys SET last_used_at = NOW() WHERE id = $1`,
			[id],
		) as unknown as {catch?: (onRejected: () => void) => unknown} | undefined
		if (result && typeof result.catch === 'function') result.catch(() => {})
	} catch {
		// best-effort: last_used_at visibility must never break auth.
	}
}

/**
 * Hash a cleartext MCP key for storage / lookup. SHA-256 hex of the FULL
 * plaintext (including the `liv_mcp_` prefix) — not just the body — so prefix
 * collisions cannot collapse two distinct keys to the same hash.
 *
 * Exposed because the Plan-02 MCP-transport auth gate hashes the presented key
 * before the lookup.
 */
export function hashMcpControlKey(plaintext: string): string {
	return createHash('sha256').update(plaintext, 'utf-8').digest('hex')
}

/**
 * Generate a fresh `liv_mcp_<base64url-32>` plaintext key, store its SHA-256
 * hash + 8-char prefix, return BOTH the row and the cleartext key. The cleartext
 * is shown to the admin ONCE — never retrievable later (only key_hash persists).
 *
 * `createdBy` is the minting admin's userId (attribution); nullable because a
 * legacy single-user box has no admin userId to attribute.
 */
export async function createMcpControlKey(opts: {
	name: string
	createdBy: string | null
}): Promise<{row: McpControlKeyRow; plaintext: string}> {
	const pool = getPool()
	if (!pool) throw new Error('Database not initialized')

	const body = randomBytes(24).toString('base64url').slice(0, 32) // 32 base64url chars
	const plaintext = `${MCP_KEY_PLAINTEXT_PREFIX}${body}` // 40 chars total
	const keyHash = hashMcpControlKey(plaintext) // 64 hex chars
	const keyPrefix = plaintext.slice(0, 8) // 8 chars: 'liv_mcp_'

	const {rows} = await pool.query(
		`INSERT INTO mcp_control_keys (key_hash, key_prefix, name, created_by)
		 VALUES ($1, $2, $3, $4)
		 RETURNING ${SELECT_COLS}`,
		[keyHash, keyPrefix, opts.name, opts.createdBy],
	)
	return {row: rowToKey(rows[0]), plaintext}
}

/**
 * Look up an mcp_control_keys row by its SHA-256 hash, IFF not revoked. Returns
 * null if no matching row OR the row is revoked — unknown and revoked collapse
 * to the same generic null. Returns null (fail-open) if the pool is absent.
 *
 * Backed by partial index idx_mcp_control_keys_active(key_hash) WHERE
 * revoked_at IS NULL.
 */
export async function findMcpControlKeyByHash(
	keyHash: string,
): Promise<McpControlKeyRow | null> {
	const pool = getPool()
	if (!pool) return null
	const {rows} = await pool.query(
		`SELECT ${SELECT_COLS_WITH_HASH} FROM mcp_control_keys WHERE key_hash = $1 AND revoked_at IS NULL`,
		[keyHash],
	)
	if (rows.length === 0) return null
	const row = rowToKey(rows[0])
	// INFO-03 — record that this key was just used (fire-and-forget, non-blocking).
	touchMcpControlKeyLastUsed(pool, row.id)
	return row
}

/**
 * List every MCP control-plane key, most-recent-first. INCLUDES revoked rows so
 * the admin sees full history (nothing is invisible to audit/revoke). Never
 * returns key_hash (SELECT_COLS deliberately excludes it). [] when pool absent.
 */
export async function listMcpControlKeys(): Promise<McpControlKeyRow[]> {
	const pool = getPool()
	if (!pool) return []
	const {rows} = await pool.query(
		`SELECT ${SELECT_COLS} FROM mcp_control_keys ORDER BY created_at DESC`,
	)
	return rows.map(rowToKey)
}

/**
 * Revoke an mcp_control_keys row. Idempotent (revoked_at IS NULL guard means a
 * second call is a no-op, preserving the FIRST-revoke timestamp).
 *
 * Returns `{rowCount, keyHash?}`:
 *   - rowCount === 0 → no row updated (already revoked OR not found).
 *   - rowCount === 1 → keyHash is the just-revoked row's key_hash (Plan 02/03
 *     use it to invalidate any auth cache synchronously).
 *
 * Not user-scoped: MCP keys are system-scoped, admin-managed credentials (the
 * revoke route is adminProcedure-bound in Plan 03). {rowCount:0} when pool absent.
 */
export async function revokeMcpControlKey(opts: {
	id: string
}): Promise<{rowCount: number; keyHash?: string}> {
	const pool = getPool()
	if (!pool) return {rowCount: 0}
	const result = await pool.query(
		`UPDATE mcp_control_keys SET revoked_at = NOW()
		 WHERE id = $1 AND revoked_at IS NULL
		 RETURNING key_hash`,
		[opts.id],
	)
	const rowCount = result.rowCount ?? 0
	if (rowCount === 0) return {rowCount: 0}
	return {rowCount, keyHash: result.rows[0]?.key_hash as string | undefined}
}
