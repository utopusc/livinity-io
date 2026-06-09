// Phase 257-04 WS-A (LIVOS-005) — session/JWT revocation DAO.
//
// Wires the long-dormant `sessions` table (schema.sql:16-26 + the 257-04
// idempotent `jti TEXT` ADD COLUMN) so a credential/state change can revoke an
// already-issued JWT. Pure DAO over the sessions table: no business logic, no
// logger, no env reads. Stateless — resolves `getPool()` per call (so callers
// in is-authenticated / user/routes don't have to thread a pool), but accepts
// an injectable query-runner so the unit test runs OFFLINE (no live Postgres),
// matching the 256-04 auth-test discipline.
//
// CRITICAL back-compat invariants (honored by the CALLERS, not here):
//   - When `getPool()` is null (pure legacy single-user / no DB), the caller
//     SKIPS the jti check entirely — legacy tokens carry no jti, so single-user
//     mode keeps working. These functions are DB-only; with no pool they no-op
//     (createSession/revokeSessionsForUser) or report "active" conservatively is
//     NOT done here — instead the caller guards on getPool() before invoking.
//   - The X-Api-Key service-token path resolves no user JWT (no jti) and is
//     never subject to this check.
//
// All queries use parameterized $1..$N placeholders (pg driver escapes).

import type pg from 'pg'

import {getPool} from './index.js'

// A minimal query-runner shape so the unit test can inject a fake.
export type QueryRunner = Pick<pg.Pool, 'query'>

/**
 * Resolve the active query runner. Prefer an injected runner (tests / explicit
 * pool); otherwise fall back to the process-wide pool. Returns null when no DB
 * is available (pure legacy single-user) — callers MUST guard on this.
 */
function resolveRunner(injected?: QueryRunner | null): QueryRunner | null {
	if (injected) return injected
	return getPool()
}

/**
 * Record a session row keyed by the token's `jti` so it can later be revoked.
 * No-op when no DB is available (legacy single-user).
 */
export async function createSession(
	args: {userId: string; jti: string; expiresAt: Date; deviceName?: string | null; ipAddress?: string | null},
	runner?: QueryRunner | null,
): Promise<void> {
	const db = resolveRunner(runner)
	if (!db) return
	// token_hash is NOT NULL UNIQUE in the legacy schema; we key revocation off
	// the jti column (added by 257-04) and store the jti as the token_hash too so
	// the historic UNIQUE/NOT-NULL constraints are satisfied without a second id.
	await db.query(
		`INSERT INTO sessions (user_id, token_hash, jti, device_name, ip_address, expires_at, revoked)
		 VALUES ($1, $2, $3, $4, $5, $6, FALSE)
		 ON CONFLICT (token_hash) DO NOTHING`,
		[args.userId, args.jti, args.jti, args.deviceName ?? null, args.ipAddress ?? null, args.expiresAt],
	)
}

/**
 * Revoke ALL of a user's outstanding sessions (called on password change,
 * deactivation, and deletion). No-op when no DB is available.
 */
export async function revokeSessionsForUser(userId: string, runner?: QueryRunner | null): Promise<void> {
	const db = resolveRunner(runner)
	if (!db) return
	await db.query(`UPDATE sessions SET revoked = TRUE WHERE user_id = $1`, [userId])
}

/**
 * Is the session for this jti still active (exists, not revoked, not expired)?
 * DB-only: when no DB is available this returns `false` — but the CALLER must
 * NOT reach here in that case (it guards on getPool() first), because a legacy
 * single-user token has no jti to check.
 */
export async function isSessionActive(jti: string, runner?: QueryRunner | null): Promise<boolean> {
	const db = resolveRunner(runner)
	if (!db) return false
	const {rows} = await db.query(
		`SELECT 1 FROM sessions WHERE jti = $1 AND revoked = FALSE AND expires_at > NOW()`,
		[jti],
	)
	return rows.length > 0
}

/**
 * Has the session for this jti been EXPLICITLY revoked? Returns true ONLY when a
 * row exists for `jti` with `revoked = TRUE`. A MISSING row → `false` (NOT
 * revoked): a token whose jti was never recorded (minted before session-tracking
 * existed, or if `createSession` failed) must be ALLOWED, not locked out. This is
 * the fail-OPEN revocation check the auth gate uses — only a deliberate revoke
 * (password change / deactivation, which sets `revoked = TRUE`) rejects a token.
 * Per-token expiry is enforced by the JWT's own `exp`, not here. DB-absent → false.
 */
export async function isSessionRevoked(jti: string, runner?: QueryRunner | null): Promise<boolean> {
	const db = resolveRunner(runner)
	if (!db) return false
	const {rows} = await db.query(
		`SELECT 1 FROM sessions WHERE jti = $1 AND revoked = TRUE`,
		[jti],
	)
	return rows.length > 0
}

// A row as returned to the Settings → Security & Sessions panel.
export type SessionRow = {
	id: string
	jti: string | null
	device_name: string | null
	ip_address: string | null
	created_at: Date
	last_seen_at: Date
	expires_at: Date
}

/**
 * List a user's currently-active (not revoked, not expired) sessions, newest
 * first. DB-only: returns [] when no DB is available (legacy single-user).
 */
export async function listSessions(userId: string, runner?: QueryRunner | null): Promise<SessionRow[]> {
	const db = resolveRunner(runner)
	if (!db) return []
	const {rows} = await db.query(
		`SELECT id, jti, device_name, ip_address, created_at, last_seen_at, expires_at
		 FROM sessions
		 WHERE user_id = $1 AND revoked = FALSE AND expires_at > NOW()
		 ORDER BY created_at DESC`,
		[userId],
	)
	return rows as SessionRow[]
}

/**
 * Revoke ONE specific session, scoped to the owning user so a caller can never
 * revoke another user's session. Returns true when a row was actually revoked.
 * No-op (false) when no DB is available.
 */
export async function revokeSession(
	args: {sessionId: string; userId: string},
	runner?: QueryRunner | null,
): Promise<boolean> {
	const db = resolveRunner(runner)
	if (!db) return false
	const {rowCount} = await db.query(
		`UPDATE sessions SET revoked = TRUE WHERE id = $1 AND user_id = $2 AND revoked = FALSE`,
		[args.sessionId, args.userId],
	)
	return (rowCount ?? 0) > 0
}
