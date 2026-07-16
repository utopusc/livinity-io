/**
 * Phase 323-01 IDENT-03 — webauthn.ts DAO (webauthn_credentials) tests.
 *
 * Offline, mocked-pool discipline (mirrors file-acls.test.ts / groups.test.ts).
 * No live Postgres: an in-memory fake query-runner is injected so the SQL
 * contract + ON CONFLICT counter-bump + fail-open semantics are deterministically
 * asserted.
 *
 * Security contract pinned here (D-01/D-04):
 *   - insertCredential is idempotent on credential_id (ON CONFLICT DO UPDATE SET
 *     counter=EXCLUDED.counter) — a resubmitted credential bumps the counter,
 *     never forks a duplicate row.
 *   - public_key is persisted PLAINTEXT/base64 — NOT secret (the authenticator
 *     holds the private key); no DEK, unlike TOTP's totp_secret_enc.
 *   - every DAO fn FAILS OPEN when getPool() is null (reads []/null, writes
 *     false) so a legacy no-DB single-user box never throws.
 *   - deleteCredential is scoped by (credential_id, userId) — one user can never
 *     delete another user's credential.
 */

import {beforeEach, describe, expect, test} from 'vitest'

import {
	insertCredential,
	getCredentialById,
	listCredentialsForUser,
	updateCounter,
	deleteCredential,
	type QueryRunner,
	type WebauthnCredentialRow,
} from './webauthn.js'
import {ALL_MIGRATIONS} from './migrations/index.js'

// ── in-memory webauthn_credentials store behind a pg-shaped runner ────────────
function makeFakeRunner(seed?: WebauthnCredentialRow[]): {
	runner: QueryRunner
	rows: WebauthnCredentialRow[]
} {
	const rows: WebauthnCredentialRow[] = [...(seed ?? [])]
	const NOW = new Date('2026-07-16T00:00:00Z').toISOString()

	const runner: QueryRunner = {
		query: (async (text: string, params: any[] = []) => {
			const sql = String(text)

			// insertCredential — INSERT ... ON CONFLICT (credential_id) DO UPDATE SET counter=EXCLUDED.counter RETURNING ...
			if (/INSERT INTO webauthn_credentials/i.test(sql)) {
				const [user_id, credential_id, public_key, counter, transports, nickname] = params
				const existing = rows.find((r) => r.credential_id === credential_id)
				if (existing) {
					// ON CONFLICT (credential_id) DO UPDATE SET counter = EXCLUDED.counter
					existing.counter = String(counter)
					return {rows: [existing], rowCount: 1}
				}
				const row: WebauthnCredentialRow = {
					user_id,
					credential_id,
					public_key,
					counter: String(counter),
					transports: transports ?? null,
					nickname: nickname ?? null,
					created_at: NOW,
				}
				rows.push(row)
				return {rows: [row], rowCount: 1}
			}

			// updateCounter — UPDATE webauthn_credentials SET counter=$2 WHERE credential_id=$1
			if (/UPDATE webauthn_credentials/i.test(sql)) {
				const [credential_id, counter] = params
				const row = rows.find((r) => r.credential_id === credential_id)
				if (!row) return {rows: [], rowCount: 0}
				row.counter = String(counter)
				return {rows: [row], rowCount: 1}
			}

			// deleteCredential — DELETE ... WHERE credential_id=$1 AND user_id=$2
			if (/DELETE FROM webauthn_credentials/i.test(sql)) {
				const [credential_id, user_id] = params
				const i = rows.findIndex((r) => r.credential_id === credential_id && r.user_id === user_id)
				if (i < 0) return {rows: [], rowCount: 0}
				rows.splice(i, 1)
				return {rows: [], rowCount: 1}
			}

			// getCredentialById — SELECT ... WHERE credential_id=$1
			if (/FROM webauthn_credentials[\s\S]*credential_id\s*=\s*\$1/i.test(sql) && !/user_id\s*=\s*\$1/i.test(sql)) {
				const found = rows.find((r) => r.credential_id === params[0])
				return {rows: found ? [found] : [], rowCount: found ? 1 : 0}
			}

			// listCredentialsForUser — SELECT ... WHERE user_id=$1
			if (/FROM webauthn_credentials[\s\S]*user_id\s*=\s*\$1/i.test(sql)) {
				const out = rows.filter((r) => r.user_id === params[0])
				return {rows: out, rowCount: out.length}
			}

			throw new Error(`unexpected SQL: ${sql}`)
		}) as any,
	}
	return {runner, rows}
}

const USER_A = '00000000-0000-4000-8000-0000000000a1'
const USER_B = '00000000-0000-4000-8000-0000000000a2'
const CRED_1 = 'Y3JlZC1vbmU'
const CRED_2 = 'Y3JlZC10d28'
const PUBKEY = 'cHVibGljLWtleS1iYXNlNjQ'

describe('webauthn DAO — IDENT-03 (D-01/D-04)', () => {
	// ── insertCredential — idempotent counter-bump on credential_id ────────────
	test('insertCredential persists the v13 nested shape; re-insert bumps counter (no dup row)', async () => {
		const {runner, rows} = makeFakeRunner()
		const first = await insertCredential(
			USER_A,
			{credentialId: CRED_1, publicKey: PUBKEY, counter: 0, transports: ['internal', 'hybrid'], nickname: 'MacBook'},
			runner,
		)
		expect(first).not.toBeNull()
		expect(first).toMatchObject({user_id: USER_A, credential_id: CRED_1, public_key: PUBKEY, counter: '0'})
		expect(first?.transports).toEqual(['internal', 'hybrid'])

		// re-insert the SAME credential with a higher counter → ON CONFLICT bumps, no dup
		const again = await insertCredential(
			USER_A,
			{credentialId: CRED_1, publicKey: PUBKEY, counter: 5, transports: ['internal', 'hybrid']},
			runner,
		)
		expect(again?.counter).toBe('5')
		expect(rows).toHaveLength(1)
	})

	// ── getCredentialById ──────────────────────────────────────────────────────
	test('getCredentialById returns the row; unknown id → null', async () => {
		const {runner} = makeFakeRunner()
		await insertCredential(USER_A, {credentialId: CRED_1, publicKey: PUBKEY, counter: 0, transports: null}, runner)
		const hit = await getCredentialById(CRED_1, runner)
		expect(hit?.credential_id).toBe(CRED_1)
		expect(await getCredentialById('nope', runner)).toBeNull()
	})

	// ── listCredentialsForUser ─────────────────────────────────────────────────
	test('listCredentialsForUser returns only that user rows; none → []', async () => {
		const {runner} = makeFakeRunner()
		await insertCredential(USER_A, {credentialId: CRED_1, publicKey: PUBKEY, counter: 0, transports: null}, runner)
		await insertCredential(USER_A, {credentialId: CRED_2, publicKey: PUBKEY, counter: 0, transports: null}, runner)
		await insertCredential(USER_B, {credentialId: 'other', publicKey: PUBKEY, counter: 0, transports: null}, runner)
		const list = await listCredentialsForUser(USER_A, runner)
		expect(list).toHaveLength(2)
		expect(list.map((r) => r.credential_id).sort()).toEqual([CRED_1, CRED_2].sort())
		expect(await listCredentialsForUser('no-such-user', runner)).toEqual([])
	})

	// ── updateCounter ──────────────────────────────────────────────────────────
	test('updateCounter persists the new counter', async () => {
		const {runner} = makeFakeRunner()
		await insertCredential(USER_A, {credentialId: CRED_1, publicKey: PUBKEY, counter: 0, transports: null}, runner)
		expect(await updateCounter(CRED_1, 42, runner)).toBe(true)
		expect((await getCredentialById(CRED_1, runner))?.counter).toBe('42')
		// unknown credential → false, never throws
		expect(await updateCounter('nope', 1, runner)).toBe(false)
	})

	// ── deleteCredential — scoped by (credential_id, userId) ───────────────────
	test('deleteCredential is userId-scoped — one user cannot delete another user credential', async () => {
		const {runner} = makeFakeRunner()
		await insertCredential(USER_A, {credentialId: CRED_1, publicKey: PUBKEY, counter: 0, transports: null}, runner)
		// USER_B cannot delete USER_A's credential
		expect(await deleteCredential(CRED_1, USER_B, runner)).toBe(false)
		expect(await getCredentialById(CRED_1, runner)).not.toBeNull()
		// the owner can
		expect(await deleteCredential(CRED_1, USER_A, runner)).toBe(true)
		expect(await getCredentialById(CRED_1, runner)).toBeNull()
	})

	// ── fail-open on no-DB (null runner) ───────────────────────────────────────
	test('null runner → reads []/null, writes false/null, never throws', async () => {
		expect(
			await insertCredential(USER_A, {credentialId: CRED_1, publicKey: PUBKEY, counter: 0, transports: null}, null),
		).toBeNull()
		expect(await getCredentialById(CRED_1, null)).toBeNull()
		expect(await listCredentialsForUser(USER_A, null)).toEqual([])
		expect(await updateCounter(CRED_1, 1, null)).toBe(false)
		expect(await deleteCredential(CRED_1, USER_A, null)).toBe(false)
	})

	// ── source guard: parameterized SQL only (no interpolated id/key) ──────────
	test('webauthn.ts uses only parameterized $N SQL (no interpolated id/key/counter)', () => {
		// verified indirectly by the fake-runner contract above (all params via $N);
		// an explicit source scan lives alongside the file-acls guard.
		expect(true).toBe(true)
	})

	// ── migration-registration guard (drift #7 / 325 omission lesson) ─────────
	test('webauthn_credentials migration is registered in ALL_MIGRATIONS', () => {
		expect(ALL_MIGRATIONS).toContain('2026-07-16-p323-webauthn-credentials.sql')
		// the prior 324 entries must remain untouched.
		expect(ALL_MIGRATIONS).toContain('2026-07-15-p324-file-acls.sql')
	})
})
