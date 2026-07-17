/**
 * Phase 334 (STEPUP-01, D-334-3) — sudo-mode step-up verify router.
 *
 * A fresh re-auth (password / TOTP / passkey) performed by an ALREADY
 * authenticated session mints a 5-min `LIVINITY_STEPUP` grant cookie
 * (signStepUpGrant, aud `livinityd-stepup`, userId-bound). Sensitive routes
 * then require the grant via requireStepUpGrant (334-02). Step-up is ADDITIVE
 * on top of the session — every procedure here is privateProcedure and D-334-5
 * says this surface never weakens is-authenticated / forward_auth / requireRole.
 *
 * Verifier reuse (334-CONTEXT):
 *   - password → bcrypt.compare vs findUserById().hashedPassword (mirrors
 *     user.login:196 — NOT the legacy-YAML ctx.user.validatePassword)
 *   - TOTP     → validateUserTotpToken / consumeUserRecoveryCode (DB IDENT-05)
 *   - passkey  → NEW authenticated assertion for the CURRENT user
 *     (generateAuthenticationOptions + allowCredentials; the 323-02 login
 *     ceremony is discoverable/unauthenticated and stays untouched)
 *
 * Failure messages are OPAQUE ('Verification failed') — no wrong-password vs
 * rate-limited vs unknown-credential oracle. All four paths are registered in
 * httpOnlyPaths (common.ts): the grant cookie can only be set on an HTTP
 * response, never over the WS transport.
 */

import {TRPCError} from '@trpc/server'
import {z} from 'zod'
import bcrypt from 'bcryptjs'
import {
	generateAuthenticationOptions,
	verifyAuthenticationResponse,
} from '@simplewebauthn/server'

import {router, privateProcedure} from '../server/trpc/trpc.js'
import {
	findUserById,
	isUserTotpEnabled,
	validateUserTotpToken,
	consumeUserRecoveryCode,
} from '../database/index.js'
import {listCredentialsForUser, getCredentialById, updateCounter} from '../database/webauthn.js'
import {resolveRpId} from '../user/webauthn-rp.js'
import {assertVerificationPassed, assertCounterOk} from '../user/webauthn-guards.js'
import {recordStepUpEvent} from '../security-audit/events.js'
import {STEPUP_COOKIE_NAME, STEPUP_GRANT_MAX_AGE_MS} from './constants.js'

// WR-02 discipline (mirrors user/routes.ts:72-73): step-up challenges live in
// their OWN fixed namespace segment so a step-up key can never address (and
// DELETE) an in-flight registration or login challenge slot.
const WEBAUTHN_STEPUP_CHALLENGE_PREFIX = 'webauthn:chal:stepup:'
const WEBAUTHN_CHALLENGE_TTL_SECONDS = 60

// Per-user failure throttle for the guessable factors (password + TOTP). A
// step-up attacker already holds a live session and is trying to escalate it
// to sudo — cap the online guessing rate. Same INCR/EXPIRE idiom as the
// share-password limiter (files/api.ts:368) and the same fail-OPEN posture
// (bcrypt/TOTP verification is the primary control; a Redis outage must not
// lock the owner out of sensitive actions). The passkey branch needs no
// throttle: it is challenge-response, nothing guessable.
const STEPUP_RL_WINDOW_SECONDS = 15 * 60
const STEPUP_RL_MAX_ATTEMPTS = 10

type MinimalRedis = {
	incr: (key: string) => Promise<number>
	expire: (key: string, seconds: number) => Promise<unknown>
	get: (key: string) => Promise<string | null>
	del: (key: string) => Promise<unknown>
	set: (key: string, value: string, mode: 'EX', seconds: number) => Promise<unknown>
}

const stepUpRateLimited = async (
	redis: MinimalRedis,
	logger: {error: (message: string, error?: unknown) => void},
	userId: string,
): Promise<boolean> => {
	try {
		const key = `stepup:rl:${userId}`
		const count = await redis.incr(key)
		if (count === 1) await redis.expire(key, STEPUP_RL_WINDOW_SECONDS)
		return count > STEPUP_RL_MAX_ATTEMPTS
	} catch (error) {
		logger.error('[stepup] rate-limit check failed — failing open', error)
		return false
	}
}

// Review INFO-3 — a SUCCESSFUL verification clears the failure counter so a
// user legitimately re-authing many times in one window (e.g. sequential
// uninstalls across expired grants) is never locked out by their own
// successes. Best-effort (fail-open like the limiter itself).
const stepUpRateLimitReset = async (redis: MinimalRedis, userId: string): Promise<void> => {
	try {
		await redis.del(`stepup:rl:${userId}`)
	} catch {
		// non-fatal
	}
}

// Read the box's active mainDomain — null when unconfigured / bare-LAN-IP.
// Local copy of the user/routes.ts:80 helper (module-private there); fails
// closed to null on any parse / Redis error.
async function readMainDomain(redis: {get: (key: string) => Promise<string | null>}): Promise<string | null> {
	try {
		const raw = await redis.get('livos:domain:config')
		if (!raw) return null
		const dc = JSON.parse(raw) as {domain?: string; active?: boolean}
		return dc.active && dc.domain ? dc.domain : null
	} catch {
		return null
	}
}

// The opaque denial every failed verification maps to (no oracle, D-334-3).
const verificationFailed = () => new TRPCError({code: 'UNAUTHORIZED', message: 'Verification failed'})

export default router({
	// verifyPassword — fresh password re-entry. DB-backed only (a legacy no-DB
	// box has no ctx.currentUser → step-up unavailable, PRECONDITION_FAILED —
	// its legacy flows keep their existing per-call gates, 334-02).
	verifyPassword: privateProcedure
		.input(z.object({password: z.string().min(1)}))
		.mutation(async ({ctx, input}) => {
			if (!ctx.currentUser) {
				throw new TRPCError({code: 'PRECONDITION_FAILED', message: 'Step-up unavailable'})
			}
			const userId = ctx.currentUser.id
			if (await stepUpRateLimited(ctx.livinityd!.ai.redis, ctx.logger!, userId)) {
				void recordStepUpEvent({userId, method: 'password', success: false, error: 'rate_limited'})
				throw verificationFailed()
			}
			const dbUser = await findUserById(userId)
			if (!dbUser?.hashedPassword) {
				void recordStepUpEvent({userId, method: 'password', success: false, error: 'no_password_hash'})
				throw verificationFailed()
			}
			const ok = await bcrypt.compare(input.password, dbUser.hashedPassword)
			if (!ok) {
				void recordStepUpEvent({userId, method: 'password', success: false, error: 'invalid_password'})
				throw verificationFailed()
			}
			await mintGrantCookie(ctx.server!, ctx.response, userId, 'password')
			await stepUpRateLimitReset(ctx.livinityd!.ai.redis, userId)
			void recordStepUpEvent({userId, method: 'password', success: true})
			return {ok: true}
		}),

	// verifyTotp — fresh TOTP (or one-time recovery code, same escape hatch as
	// login/disable2fa). Requires DB TOTP enrolled — the UI hides the branch via
	// user.is2faEnabled, so PRECONDITION_FAILED here is a state error, not an oracle.
	verifyTotp: privateProcedure
		.input(z.object({token: z.string().min(1)}))
		.mutation(async ({ctx, input}) => {
			if (!ctx.currentUser) {
				throw new TRPCError({code: 'PRECONDITION_FAILED', message: 'Step-up unavailable'})
			}
			const userId = ctx.currentUser.id
			if (!(await isUserTotpEnabled(userId))) {
				throw new TRPCError({code: 'PRECONDITION_FAILED', message: '2FA is not enabled'})
			}
			if (await stepUpRateLimited(ctx.livinityd!.ai.redis, ctx.logger!, userId)) {
				void recordStepUpEvent({userId, method: 'totp', success: false, error: 'rate_limited'})
				throw verificationFailed()
			}
			const ok =
				(await validateUserTotpToken(userId, input.token)) ||
				(await consumeUserRecoveryCode(userId, input.token))
			if (!ok) {
				void recordStepUpEvent({userId, method: 'totp', success: false, error: 'invalid_totp'})
				throw verificationFailed()
			}
			await mintGrantCookie(ctx.server!, ctx.response, userId, 'totp')
			await stepUpRateLimitReset(ctx.livinityd!.ai.redis, userId)
			void recordStepUpEvent({userId, method: 'totp', success: true})
			return {ok: true}
		}),

	// passkeyOptions — start an AUTHENTICATED assertion ceremony for the current
	// user. allowCredentials pins the ceremony to THIS user's enrolled
	// authenticators (unlike the discoverable 323-02 login ceremony). Challenge
	// is single-use, keyed on the authenticated userId (no client-supplied id).
	passkeyOptions: privateProcedure.query(async ({ctx}) => {
		if (!ctx.currentUser) {
			throw new TRPCError({code: 'PRECONDITION_FAILED', message: 'Step-up unavailable'})
		}
		const redis = ctx.livinityd!.ai.redis
		const rpID = resolveRpId(await readMainDomain(redis))
		if (!rpID) {
			throw new TRPCError({code: 'PRECONDITION_FAILED', message: 'Passkey unavailable on this box'})
		}
		const creds = await listCredentialsForUser(ctx.currentUser.id)
		if (creds.length === 0) {
			throw new TRPCError({code: 'PRECONDITION_FAILED', message: 'No passkeys enrolled'})
		}
		const options = await generateAuthenticationOptions({
			rpID,
			userVerification: 'preferred',
			allowCredentials: creds.map((c) => ({id: c.credential_id})),
		})
		// SETEX single-use challenge (write fails OPEN — a Redis outage must not
		// brick the ceremony start; the verify below still fails CLOSED on a
		// missing challenge). Never log the raw challenge.
		try {
			await redis.set(
				`${WEBAUTHN_STEPUP_CHALLENGE_PREFIX}${ctx.currentUser.id}`,
				options.challenge,
				'EX',
				WEBAUTHN_CHALLENGE_TTL_SECONDS,
			)
		} catch (error) {
			ctx.logger!.error('[stepup] passkey challenge store failed — failing open', error)
		}
		return options
	}),

	// passkeyVerify — verify the assertion, guard the counter, mint the grant.
	// The credential MUST belong to the current user (a valid assertion with
	// another user's enrolled credential must never step-up THIS session).
	passkeyVerify: privateProcedure
		.input(z.object({response: z.any()}))
		.mutation(async ({ctx, input}) => {
			if (!ctx.currentUser) {
				throw new TRPCError({code: 'PRECONDITION_FAILED', message: 'Step-up unavailable'})
			}
			const userId = ctx.currentUser.id
			const redis = ctx.livinityd!.ai.redis
			const rpID = resolveRpId(await readMainDomain(redis))
			if (!rpID) {
				throw new TRPCError({code: 'PRECONDITION_FAILED', message: 'Passkey unavailable on this box'})
			}

			// Resolve + OWNERSHIP-BIND the credential before any crypto: unknown
			// credential OR one enrolled by a different user fails closed.
			const credentialId = String((input.response as {id?: unknown})?.id ?? '')
			const cred = await getCredentialById(credentialId)
			if (!cred || cred.user_id !== userId) {
				void recordStepUpEvent({userId, method: 'passkey', success: false, error: 'unknown_credential'})
				throw verificationFailed()
			}

			const key = `${WEBAUTHN_STEPUP_CHALLENGE_PREFIX}${userId}`
			let verification
			try {
				// Single-use: read + DELETE the challenge BEFORE verify (no stale retry).
				const stored = await redis.get(key)
				await redis.del(key)
				if (!stored) throw verificationFailed()
				verification = await verifyAuthenticationResponse({
					response: input.response,
					expectedChallenge: stored,
					expectedOrigin: `https://${rpID}`,
					expectedRPID: rpID,
					credential: {
						id: cred.credential_id,
						publicKey: Buffer.from(cred.public_key, 'base64url'),
						counter: Number(cred.counter),
					},
				})
			} catch (error) {
				void recordStepUpEvent({userId, method: 'passkey', success: false, error: 'assertion_failed'})
				if (error instanceof TRPCError) throw error
				// NEVER fail open (CVE-2026-11883): any verify exception → UNAUTHORIZED.
				throw verificationFailed()
			}

			// Fail closed on verified!==true; reject a cloned-authenticator counter
			// regression BEFORE the grant mints.
			assertVerificationPassed(verification)
			const newCounter = verification.authenticationInfo.newCounter
			assertCounterOk(Number(cred.counter), newCounter)
			await updateCounter(cred.credential_id, newCounter)

			await mintGrantCookie(ctx.server!, ctx.response, userId, 'passkey')
			void recordStepUpEvent({userId, method: 'passkey', success: true})
			return {ok: true}
		}),
})

// Mint the grant + set the cookie on the HTTP response. Scope (D-334-1):
// httpOnly + secure + sameSite strict + path '/' + maxAge matching the JWT
// TTL. A WS call has no response object → PRECONDITION_FAILED (fail closed;
// the four paths are in httpOnlyPaths so the typed client never hits this).
async function mintGrantCookie(
	server: {
		signStepUpGrant: (
			userId: string,
			method?: 'password' | 'totp' | 'passkey',
		) => Promise<{token: string; jti: string}>
	},
	response: {cookie: (name: string, value: string, options: Record<string, unknown>) => unknown} | undefined,
	userId: string,
	// Review WARN-1 — the minting factor is stamped into the grant so gates can
	// demand a second factor (assertStepUpGrant {secondFactor: true}).
	method: 'password' | 'totp' | 'passkey',
): Promise<void> {
	if (!response) {
		throw new TRPCError({code: 'PRECONDITION_FAILED', message: 'Step-up requires an HTTP request'})
	}
	const {token} = await server.signStepUpGrant(userId, method)
	response.cookie(STEPUP_COOKIE_NAME, token, {
		httpOnly: true,
		secure: true,
		sameSite: 'strict',
		path: '/',
		maxAge: STEPUP_GRANT_MAX_AGE_MS,
	})
}
