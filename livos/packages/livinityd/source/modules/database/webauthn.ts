// Phase 323-01 (IDENT-03) — webauthn_credentials DAO (passkey / WebAuthn).
//
// Clones files/file-acls.ts + database/groups.ts VERBATIM in discipline: a pure,
// stateless DAO that resolves getPool() per call but accepts an injectable
// query-runner so the unit test runs OFFLINE (no live Postgres). This is the
// SINGLE passkey-credential source consumed by the enroll/login ceremony routes
// (323-02, verifyRegistration/AuthenticationResponse) and the manage list UI
// (323-03).
//
// CRITICAL back-compat invariant (mirrors groups.ts / file-acls.ts / sessions.ts):
// every function FAILS OPEN when getPool() is null (pure legacy single-user /
// no-DB box) — writes no-op (return null/false), reads return [] / null — so
// legacy boxes never throw and passkey auth is simply unavailable (password +
// TOTP untouched).
//
// v13 API (D-01): the row is persisted from the NESTED
// verifyRegistrationResponse().registrationInfo.credential.{id, publicKey,
// counter, transports} shape — NOT the pre-v13 flat credentialID /
// credentialPublicKey fields. `public_key` is stored PLAINTEXT/base64 and is NOT
// secret — the authenticator holds the private key, so there is NO DEK (unlike
// TOTP's totp_secret_enc). credential_id is TEXT UNIQUE and is the lookup key.
//
// All queries use parameterized $1..$N placeholders (pg driver escapes); no
// string interpolation of ids / keys / counters ever reaches the SQL. The
// counter is a BIGINT — pg returns it as a string; callers compare numerically.

import type pg from 'pg'

import {getPool} from './index.js'

// A minimal query-runner shape so the unit test can inject a fake.
export type QueryRunner = Pick<pg.Pool, 'query'>

// A webauthn_credentials row as stored (snake_case matches the SQL columns).
// counter is BIGINT → surfaced as a string by the pg driver.
export interface WebauthnCredentialRow {
	user_id: string
	credential_id: string
	public_key: string
	counter: string
	transports: string[] | null
	nickname: string | null
	created_at: string
}

// The v13 nested-shape payload persisted on enroll (registrationInfo.credential.*).
export interface WebauthnCredentialInput {
	credentialId: string
	publicKey: string
	counter: number
	transports: string[] | null
	nickname?: string | null
}

/**
 * Resolve the active query runner. Prefer an injected runner (tests / explicit
 * pool); otherwise fall back to the process-wide pool. Returns null when no DB
 * is available (pure legacy single-user) — every function below fails open on it.
 */
function resolveRunner(injected?: QueryRunner | null): QueryRunner | null {
	if (injected) return injected
	return getPool()
}

/**
 * Persist a newly-enrolled credential (or bump the counter of a known one).
 * Idempotent on credential_id: ON CONFLICT DO UPDATE SET counter=EXCLUDED.counter
 * so a resubmitted credential deterministically bumps the counter and never forks
 * a duplicate row. Returns the row when a pool exists; null (no throw) on no DB.
 */
export async function insertCredential(
	userId: string,
	cred: WebauthnCredentialInput,
	runner?: QueryRunner | null,
): Promise<WebauthnCredentialRow | null> {
	const db = resolveRunner(runner)
	if (!db) return null
	const {rows} = await db.query(
		`INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter, transports, nickname)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 ON CONFLICT (credential_id)
		 DO UPDATE SET counter = EXCLUDED.counter
		 RETURNING user_id, credential_id, public_key, counter, transports, nickname, created_at`,
		[
			userId,
			cred.credentialId,
			cred.publicKey,
			cred.counter,
			cred.transports ? JSON.stringify(cred.transports) : null,
			cred.nickname ?? null,
		],
	)
	return (rows[0] as WebauthnCredentialRow) ?? null
}

/**
 * Look up a credential by its (globally-unique) credential_id — the login-path
 * lookup that resolves which user a passkey belongs to. Returns null on miss /
 * no DB.
 */
export async function getCredentialById(
	credentialId: string,
	runner?: QueryRunner | null,
): Promise<WebauthnCredentialRow | null> {
	const db = resolveRunner(runner)
	if (!db) return null
	const {rows} = await db.query(
		`SELECT user_id, credential_id, public_key, counter, transports, nickname, created_at
		 FROM webauthn_credentials
		 WHERE credential_id = $1`,
		[credentialId],
	)
	return (rows[0] as WebauthnCredentialRow) ?? null
}

/**
 * List every credential enrolled by a user (the settings manage list). Returns
 * [] when the user has none / no DB is available.
 */
export async function listCredentialsForUser(
	userId: string,
	runner?: QueryRunner | null,
): Promise<WebauthnCredentialRow[]> {
	const db = resolveRunner(runner)
	if (!db) return []
	const {rows} = await db.query(
		`SELECT user_id, credential_id, public_key, counter, transports, nickname, created_at
		 FROM webauthn_credentials
		 WHERE user_id = $1
		 ORDER BY created_at ASC`,
		[userId],
	)
	return rows as WebauthnCredentialRow[]
}

/**
 * Persist the authenticator's post-authentication signature counter (replay
 * defence). Returns true when a row was updated, false on miss / no DB.
 */
export async function updateCounter(
	credentialId: string,
	counter: number,
	runner?: QueryRunner | null,
): Promise<boolean> {
	const db = resolveRunner(runner)
	if (!db) return false
	const {rowCount} = await db.query(
		`UPDATE webauthn_credentials SET counter = $2 WHERE credential_id = $1`,
		[credentialId, counter],
	)
	return (rowCount ?? 0) > 0
}

/**
 * Remove a credential — SCOPED by (credential_id, user_id) so one user can never
 * delete another user's credential (the manage-list revoke). Returns true when a
 * row was removed, false on miss / wrong owner / no DB.
 */
export async function deleteCredential(
	credentialId: string,
	userId: string,
	runner?: QueryRunner | null,
): Promise<boolean> {
	const db = resolveRunner(runner)
	if (!db) return false
	const {rowCount} = await db.query(
		`DELETE FROM webauthn_credentials WHERE credential_id = $1 AND user_id = $2`,
		[credentialId, userId],
	)
	return (rowCount ?? 0) > 0
}
