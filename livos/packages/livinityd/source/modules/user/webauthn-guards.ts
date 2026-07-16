// Phase 323-02 (IDENT-03) — pure fail-closed WebAuthn ceremony guards (D-05).
//
// Two tiny EXPORTED pure fns (files/file-acls.ts pure-fn discipline) so the
// security-critical invariants are vitest-covered OFFLINE — no live
// authenticator, no Postgres, no Redis. The ceremony routes (loginWithPasskey /
// webauthnRegisterVerify) wrap the @simplewebauthn `verify*` call in try/catch
// (an EXCEPTION -> UNAUTHORIZED) AND then call these guards, so BOTH a thrown
// verify AND a `verified:false` result deterministically land on the identical
// hard UNAUTHORIZED — NEVER a silent verified=true.
//
// The opaque message is byte-identical between the two guards so a caller cannot
// distinguish a cloned-authenticator rejection from any other verify failure (no
// oracle). It mirrors the TOTP UNAUTHORIZED throw at user/routes.ts:174 in shape.

import {TRPCError} from '@trpc/server'

// One opaque denial reused by both guards — no oracle distinguishing the cause.
const PASSKEY_DENIED = 'Passkey verification failed'

/**
 * NEVER fail open (CVE-2026-11883). Throws a hard UNAUTHORIZED unless the
 * verification result is an EXPLICIT `verified === true`. A false / undefined /
 * missing `verified`, or a nullish verification object, all throw — the routes
 * additionally try/catch the `verify*` call so an exception lands here too.
 */
export function assertVerificationPassed(verification: {verified?: boolean}): void {
	if (verification?.verified !== true) {
		throw new TRPCError({code: 'UNAUTHORIZED', message: PASSKEY_DENIED})
	}
}

/**
 * Cloned-authenticator counter-regression guard (D-05). When BOTH counters are
 * non-zero, a returned counter <= the stored counter is a clone signal and is
 * rejected. A 0 on EITHER side is tolerated: many platform authenticators
 * (Touch ID / Windows Hello) always report a 0 signature counter, so a strict
 * check would brick legitimate logins.
 */
export function assertCounterOk(storedCounter: number, returnedCounter: number): void {
	// Tolerate 0-counter authenticators (no monotonic counter exposed).
	if (storedCounter === 0 || returnedCounter === 0) return
	if (returnedCounter <= storedCounter) {
		throw new TRPCError({code: 'UNAUTHORIZED', message: PASSKEY_DENIED})
	}
}
