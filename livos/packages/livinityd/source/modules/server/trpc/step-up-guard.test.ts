/**
 * Phase 334 (STEPUP-01, D-334-2) — requireStepUpGrant / assertStepUpGrant tests.
 *
 * Uses the REAL jwt sign/verify primitives (no mocks) so audience, expiry and
 * userId binding are exercised end-to-end against a test secret:
 *   - valid grant for the current user → next() runs
 *   - missing cookie / no currentUser / no server → STEP_UP_REQUIRED
 *   - ANOTHER user's grant → STEP_UP_REQUIRED (cross-user replay)
 *   - an EXPIRED grant → STEP_UP_REQUIRED
 *   - a SESSION-class token in the cookie slot → STEP_UP_REQUIRED (audience)
 */
import {describe, expect, test, vi} from 'vitest'
import jsonwebtoken from 'jsonwebtoken'

import {signStepUpGrant, verifyStepUpGrant} from '../../jwt.js'
import {assertStepUpGrant, requireStepUpGrant, STEP_UP_REQUIRED, STEP_UP_2FA_REQUIRED} from './step-up-guard.js'
import {STEPUP_COOKIE_NAME} from '../../stepup/constants.js'

// validateSecret (jwt.ts) requires a 256-bit hex string.
const SECRET = 'ab'.repeat(32)
const USER_ID = 'user-A'

// Minimal ctx satisfying what the guard reads. server.verifyStepUpGrant wraps
// the REAL verifier with the test secret.
function makeCtx(opts: {cookie?: string; user?: null | string; server?: null} = {}) {
	return {
		currentUser: opts.user === null ? undefined : {id: opts.user ?? USER_ID, username: 'alice', role: 'admin'},
		request: opts.cookie === undefined ? {cookies: {}} : {cookies: {[STEPUP_COOKIE_NAME]: opts.cookie}},
		server:
			opts.server === null
				? undefined
				: {verifyStepUpGrant: (token: string) => verifyStepUpGrant(token, SECRET)},
	} as never
}

const expectStepUpRequired = (p: Promise<unknown>) =>
	expect(p).rejects.toMatchObject({code: 'UNAUTHORIZED', message: STEP_UP_REQUIRED})

describe('assertStepUpGrant', () => {
	test('a valid grant bound to the current user passes', async () => {
		const {token} = await signStepUpGrant(SECRET, USER_ID)
		await expect(assertStepUpGrant(makeCtx({cookie: token}))).resolves.toBeUndefined()
	})

	test('missing cookie fails closed', async () => {
		await expectStepUpRequired(assertStepUpGrant(makeCtx()))
	})

	test('no resolved currentUser fails closed (nothing to bind to)', async () => {
		const {token} = await signStepUpGrant(SECRET, USER_ID)
		await expectStepUpRequired(assertStepUpGrant(makeCtx({cookie: token, user: null})))
	})

	test('no server on ctx fails closed', async () => {
		const {token} = await signStepUpGrant(SECRET, USER_ID)
		await expectStepUpRequired(assertStepUpGrant(makeCtx({cookie: token, server: null})))
	})

	test("ANOTHER user's grant is rejected (cross-user replay)", async () => {
		const {token} = await signStepUpGrant(SECRET, 'user-B')
		await expectStepUpRequired(assertStepUpGrant(makeCtx({cookie: token})))
	})

	test('an EXPIRED grant is rejected', async () => {
		const expired = jsonwebtoken.sign({stepup: true, userId: USER_ID, jti: 'j'}, SECRET, {
			expiresIn: -10,
			algorithm: 'HS256',
			audience: 'livinityd-stepup',
			issuer: 'livinityd',
		})
		await expectStepUpRequired(assertStepUpGrant(makeCtx({cookie: expired})))
	})

	test('a SESSION-class token in the cookie slot is rejected (audience)', async () => {
		const session = jsonwebtoken.sign({loggedIn: true, userId: USER_ID, jti: 'j'}, SECRET, {
			expiresIn: 60,
			algorithm: 'HS256',
			issuer: 'livinityd',
		})
		await expectStepUpRequired(assertStepUpGrant(makeCtx({cookie: session})))
	})

	test('garbage in the cookie slot is rejected', async () => {
		await expectStepUpRequired(assertStepUpGrant(makeCtx({cookie: 'not-a-jwt'})))
	})

	// Review WARN-1 — {secondFactor: true} demands a TOTP/passkey-minted grant.
	test('secondFactor: a PASSWORD-minted grant is refused with STEP_UP_2FA_REQUIRED', async () => {
		const {token} = await signStepUpGrant(SECRET, USER_ID, 'password')
		await expect(assertStepUpGrant(makeCtx({cookie: token}), {secondFactor: true})).rejects.toMatchObject({
			code: 'UNAUTHORIZED',
			message: STEP_UP_2FA_REQUIRED,
		})
	})

	test('secondFactor: a TOTP-minted grant passes', async () => {
		const {token} = await signStepUpGrant(SECRET, USER_ID, 'totp')
		await expect(assertStepUpGrant(makeCtx({cookie: token}), {secondFactor: true})).resolves.toBeUndefined()
	})

	test('secondFactor: a PASSKEY-minted grant passes', async () => {
		const {token} = await signStepUpGrant(SECRET, USER_ID, 'passkey')
		await expect(assertStepUpGrant(makeCtx({cookie: token}), {secondFactor: true})).resolves.toBeUndefined()
	})

	test('secondFactor: a legacy grant WITHOUT a method claim is treated as password (fail-safe)', async () => {
		const legacy = jsonwebtoken.sign({stepup: true, userId: USER_ID, jti: 'j'}, SECRET, {
			expiresIn: 60,
			algorithm: 'HS256',
			audience: 'livinityd-stepup',
			issuer: 'livinityd',
		})
		await expect(assertStepUpGrant(makeCtx({cookie: legacy}), {secondFactor: true})).rejects.toMatchObject({
			message: STEP_UP_2FA_REQUIRED,
		})
		// …but still satisfies the plain (any-factor) gate.
		await expect(assertStepUpGrant(makeCtx({cookie: legacy}))).resolves.toBeUndefined()
	})
})

describe('requireStepUpGrant middleware', () => {
	test('valid grant → next() runs and its result is returned', async () => {
		const {token} = await signStepUpGrant(SECRET, USER_ID)
		const next = vi.fn().mockResolvedValue('route-result')
		await expect(requireStepUpGrant({ctx: makeCtx({cookie: token}), next})).resolves.toBe('route-result')
		expect(next).toHaveBeenCalledTimes(1)
	})

	test('missing grant → STEP_UP_REQUIRED and next() NEVER runs (fail closed)', async () => {
		const next = vi.fn()
		await expectStepUpRequired(requireStepUpGrant({ctx: makeCtx(), next}))
		expect(next).not.toHaveBeenCalled()
	})
})
