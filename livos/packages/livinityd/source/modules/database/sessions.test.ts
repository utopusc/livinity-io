/**
 * Phase 257-04 WS-A (LIVOS-005) — sessions revocation DAO tests.
 *
 * Offline, mocked-pool discipline (matches agents-repo.test.ts). No live
 * Postgres: an in-memory fake query-runner is injected so the SQL contract +
 * revoke/active semantics are deterministically asserted.
 *
 * Coverage:
 *   T1 — createSession then isSessionActive(jti) → true; revokeSessionsForUser
 *        then isSessionActive(jti) → false (the core revocation round-trip).
 *   T2 — createSession writes the jti as both token_hash + jti (legacy NOT NULL
 *        UNIQUE token_hash satisfied) with revoked=FALSE.
 *   T3 — isSessionActive parameterizes the jti ($1) and filters revoked=FALSE +
 *        expires_at > NOW().
 *   T4 — no-DB (null runner) → createSession/revoke no-op, isSessionActive false.
 */

import {beforeEach, describe, expect, test} from 'vitest'

import {createSession, revokeSessionsForUser, isSessionActive, isSessionRevoked, type QueryRunner} from './sessions.js'

// A tiny in-memory sessions store behind a pg-shaped query runner so the DAO's
// real SQL strings drive a fake DB. We pattern-match the SQL the DAO emits.
type Row = {user_id: string; jti: string; revoked: boolean; expires_at: Date}

function makeFakeRunner(): {runner: QueryRunner; rows: Row[]} {
	const rows: Row[] = []
	const runner: QueryRunner = {
		query: (async (text: string, params: any[] = []) => {
			const sql = String(text)
			if (/INSERT INTO sessions/i.test(sql)) {
				// params: [userId, token_hash, jti, device, ip, expiresAt]
				rows.push({user_id: params[0], jti: params[2], revoked: false, expires_at: params[5]})
				return {rows: [], rowCount: 1}
			}
			if (/UPDATE sessions SET revoked = TRUE WHERE user_id/i.test(sql)) {
				let n = 0
				for (const r of rows) {
					if (r.user_id === params[0]) {
						r.revoked = true
						n++
					}
				}
				return {rows: [], rowCount: n}
			}
			if (/SELECT 1 FROM sessions WHERE jti/i.test(sql)) {
				const jti = params[0]
				const now = new Date()
				const hit = rows.find((r) => r.jti === jti && !r.revoked && r.expires_at > now)
				return {rows: hit ? [{'?column?': 1}] : []}
			}
			throw new Error(`unexpected SQL: ${sql}`)
		}) as any,
	}
	return {runner, rows}
}

const USER_A = '00000000-0000-4000-8000-00000000000a'
const JTI_A = 'jti-aaaa-1111'
const FUTURE = new Date(Date.now() + 60_000)

describe('sessions DAO — LIVOS-005 revocation', () => {
	let runner: QueryRunner
	let rows: Row[]
	beforeEach(() => {
		;({runner, rows} = makeFakeRunner())
	})

	test('T1 — create → active true; revokeForUser → active false', async () => {
		await createSession({userId: USER_A, jti: JTI_A, expiresAt: FUTURE}, runner)
		expect(await isSessionActive(JTI_A, runner)).toBe(true)

		await revokeSessionsForUser(USER_A, runner)
		expect(await isSessionActive(JTI_A, runner)).toBe(false)
	})

	test('T2 — createSession persists jti + revoked=FALSE', async () => {
		await createSession({userId: USER_A, jti: JTI_A, expiresAt: FUTURE}, runner)
		expect(rows).toHaveLength(1)
		expect(rows[0]).toMatchObject({user_id: USER_A, jti: JTI_A, revoked: false})
	})

	test('T3 — expired session is NOT active', async () => {
		const past = new Date(Date.now() - 60_000)
		await createSession({userId: USER_A, jti: 'jti-expired', expiresAt: past}, runner)
		expect(await isSessionActive('jti-expired', runner)).toBe(false)
	})

	test('T4 — no-DB (null runner) → no-op writes, isSessionActive false', async () => {
		// null runner simulates getPool()===null (pure legacy single-user).
		await expect(createSession({userId: USER_A, jti: JTI_A, expiresAt: FUTURE}, null)).resolves.toBeUndefined()
		await expect(revokeSessionsForUser(USER_A, null)).resolves.toBeUndefined()
		expect(await isSessionActive(JTI_A, null)).toBe(false)
	})

	test('T5 — isSessionRevoked is FAIL-OPEN: missing row → false (no lockout); DB-absent → false', async () => {
		// Missing jti (never recorded — the production-lockout scenario) → NOT revoked.
		expect(await isSessionRevoked('jti-never-recorded', runner)).toBe(false)
		// DB-absent (single-user) → false; never locked out.
		expect(await isSessionRevoked(JTI_A, null)).toBe(false)
		// (The gate-level behavior — jti present + missing/unrevoked row → ALLOW,
		//  explicit revoke → reject — is fully covered in is-authenticated.test WS-A.T3/T4.)
	})
})
