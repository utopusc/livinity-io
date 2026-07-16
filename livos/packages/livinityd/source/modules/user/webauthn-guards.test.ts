/**
 * Phase 323-02 IDENT-03 — pure fail-closed WebAuthn guards (D-05).
 *
 * These offline unit tests pin the two security-critical invariants that make
 * the ceremony routes provably safe WITHOUT a live authenticator / Postgres:
 *
 *   - assertVerificationPassed: NEVER fail open (CVE-2026-11883). Anything other
 *     than an explicit `verified === true` — false, undefined, missing — throws a
 *     hard UNAUTHORIZED. The routes wrap `verify*` in try/catch and additionally
 *     call this guard so BOTH a thrown verify AND a `verified:false` land on the
 *     identical UNAUTHORIZED, never a silent pass.
 *   - assertCounterOk: reject a returned counter <= stored (both non-zero) as a
 *     cloned-authenticator signal; tolerate 0-counter authenticators (many
 *     platform authenticators always report 0). Opaque identical message (no
 *     oracle distinguishing a clone from any other verify failure).
 */

import {TRPCError} from '@trpc/server'
import {describe, expect, test} from 'vitest'

import {assertVerificationPassed, assertCounterOk} from './webauthn-guards.js'

describe('assertVerificationPassed — never fail open (CVE-2026-11883)', () => {
	test('verified:true does NOT throw', () => {
		expect(() => assertVerificationPassed({verified: true})).not.toThrow()
	})

	test('verified:false throws UNAUTHORIZED', () => {
		expect(() => assertVerificationPassed({verified: false})).toThrow(TRPCError)
		try {
			assertVerificationPassed({verified: false})
		} catch (error) {
			expect((error as TRPCError).code).toBe('UNAUTHORIZED')
		}
	})

	test('verified undefined / missing throws UNAUTHORIZED (fail closed)', () => {
		expect(() => assertVerificationPassed({})).toThrow(TRPCError)
		expect(() => assertVerificationPassed({verified: undefined})).toThrow(TRPCError)
	})

	test('a nullish verification object throws UNAUTHORIZED (fail closed)', () => {
		expect(() => assertVerificationPassed(null as never)).toThrow(TRPCError)
		expect(() => assertVerificationPassed(undefined as never)).toThrow(TRPCError)
	})
})

describe('assertCounterOk — cloned-authenticator counter-regression (D-05)', () => {
	test('strictly increasing counter (5 -> 6) does NOT throw', () => {
		expect(() => assertCounterOk(5, 6)).not.toThrow()
	})

	test('equal counter (5 == 5, both non-zero) throws — clone signal', () => {
		expect(() => assertCounterOk(5, 5)).toThrow(TRPCError)
		try {
			assertCounterOk(5, 5)
		} catch (error) {
			expect((error as TRPCError).code).toBe('UNAUTHORIZED')
		}
	})

	test('regressed counter (5 -> 4) throws — clone signal', () => {
		expect(() => assertCounterOk(5, 4)).toThrow(TRPCError)
	})

	test('0-counter authenticator is tolerated (stored 0)', () => {
		expect(() => assertCounterOk(0, 0)).not.toThrow()
		expect(() => assertCounterOk(0, 5)).not.toThrow()
	})

	test('0-counter authenticator is tolerated (returned 0)', () => {
		expect(() => assertCounterOk(5, 0)).not.toThrow()
	})

	test('the clone-signal message is identical to a generic verify failure (no oracle)', () => {
		let counterMsg = ''
		let verifyMsg = ''
		try {
			assertCounterOk(5, 5)
		} catch (error) {
			counterMsg = (error as TRPCError).message
		}
		try {
			assertVerificationPassed({verified: false})
		} catch (error) {
			verifyMsg = (error as TRPCError).message
		}
		expect(counterMsg).toBe(verifyMsg)
	})
})
