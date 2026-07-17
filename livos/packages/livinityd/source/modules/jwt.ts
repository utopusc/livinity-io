import crypto from 'node:crypto'

import jwt from 'jsonwebtoken'

const ONE_MINUTE = 60
const ONE_HOUR = 60 * ONE_MINUTE
const ONE_DAY = 24 * ONE_HOUR
const ONE_WEEK = 7 * ONE_DAY

const JWT_ALGORITHM = 'HS256'

// Phase 257-04 WS-A (LIVOS-028): aud/iss binding. Session + proxy tokens carry
// a distinct audience + issuer so a token minted for one consumer is not
// structurally interchangeable with another. The issuer is shared (this single
// service mints both) but the audience discriminates purpose.
const TOKEN_ISSUER = 'livinityd'
const SESSION_AUDIENCE = 'livinityd'
const PROXY_AUDIENCE = 'livinityd-proxy'
// Phase 259 (cross-subdomain SSO handshake) — the short-lived bounce token that
// lets a logged-in operator reach a GATED app subdomain without the host-only
// LIVINITY_SESSION cookie (which never crosses to the hyphen-sibling app host).
// Distinct audience so it is NOT interchangeable with a session/proxy token; it
// carries the target host it was minted for (replay to a different app host is
// rejected) and a jti for single-use consumption via Redis.
const SSO_AUDIENCE = 'livinityd-sso'
const SSO_TTL_SECONDS = 30
// Phase 324-01 (FILES-01, D-03) — the short-lived "unlocked" grant a password-
// protected public share mints AFTER a correct bcryptjs compare, so the browser
// does not resubmit the password on every sub-route (/download, /thumbnail).
// Distinct audience so it is NOT interchangeable with a session / proxy / SSO
// token; it carries the ONE shareId it was minted for (replay to a different
// share is rejected by the route comparing the claim to the resolved row.id —
// mirrors the SSO targetHost binding) and a jti. Scoped to that share's token
// cookie path so it never rides another share's request.
const SHARE_AUDIENCE = 'livinityd-share'
const SHARE_GRANT_TTL_SECONDS = 30 * 60 // ~30 min (D-03)
// Phase 334 (STEPUP-01, D-334-1) — sudo-mode step-up grant. A fresh re-auth
// (password / TOTP / passkey) mints this SHORT-lived grant, bound to the ONE
// userId it is issued for, so a sensitive action can require a recent factor
// independent of the week-long session. The distinct audience makes it
// non-interchangeable with a session/proxy/SSO/share token. The 5-min TTL IS
// the revocation (no server-side store — the grant simply expires).
const STEPUP_AUDIENCE = 'livinityd-stepup'
const STEPUP_GRANT_TTL_SECONDS = 5 * 60 // 5 min (D-334-1)

/**
 * Phase 257-04 WS-A (LIVOS-028): derive a SEPARATE proxy signing secret from the
 * session secret so the two token classes are non-interchangeable WITHOUT adding
 * a new on-disk secret file (keeps this change file-isolated from the installer /
 * server.getJwtSecret() — one-writer-per-file with WS-C). The derivation is a
 * one-way SHA-256 over the session secret + a domain-separation tag, sliced to a
 * valid 64-hex (256-bit) secret. Independent in value from the session secret;
 * an attacker holding a proxy token cannot recover the session secret.
 */
function deriveProxySecret(sessionSecret: string): string {
	return crypto.createHash('sha256').update(`${sessionSecret}:livinity-proxy-v1`).digest('hex')
}

// Legacy payload (single-user)
type LegacyJwtPayload = {
	loggedIn: boolean
}

// New multi-user payload
type UserJwtPayload = {
	loggedIn: boolean
	userId: string
	role: string
	// Phase 257-04 (LIVOS-005): per-session token id so a credential/state
	// change can revoke this token via the sessions table.
	jti: string
}

// Combined type for verification results
export type VerifiedJwtPayload = {
	loggedIn: boolean
	userId?: string
	role?: string
	jti?: string
}

const validateSecret = (secret: string) => {
	const hexRegex = /^[0-9a-fA-F]+$/
	if (secret.length !== 64 || !hexRegex.test(secret)) {
		throw new Error('Invalid JWT secret, expected 256bit hex string')
	}

	return true
}

/**
 * Sign a legacy token (backward compatible, no userId).
 */
export async function sign(secret: string) {
	validateSecret(secret)
	const payload: LegacyJwtPayload = {loggedIn: true}
	const token = jwt.sign(payload, secret, {
		expiresIn: ONE_WEEK,
		algorithm: JWT_ALGORITHM,
		audience: SESSION_AUDIENCE,
		issuer: TOKEN_ISSUER,
	})

	return token
}

/**
 * Sign a new multi-user token with userId and role.
 *
 * Phase 257-04 (LIVOS-005): every user token carries a `jti` so a credential or
 * account-state change can revoke it via the sessions table. The token signature
 * is unchanged (returns the token string) so the server wrapper + renewToken
 * caller are untouched — the login caller recovers the jti via `verify()` (or
 * `decode()`), which now returns `payload.jti`.
 */
export async function signUserToken(secret: string, userId: string, role: string): Promise<string> {
	validateSecret(secret)
	const payload: UserJwtPayload = {loggedIn: true, userId, role, jti: crypto.randomUUID()}
	const token = jwt.sign(payload, secret, {
		expiresIn: ONE_WEEK,
		algorithm: JWT_ALGORITHM,
		audience: SESSION_AUDIENCE,
		issuer: TOKEN_ISSUER,
	})

	return token
}

/**
 * Phase 259 — sign a short-lived cross-subdomain SSO bounce token. Carries the
 * exact target host it is minted for (replay to another app host is rejected at
 * verify) plus the caller identity (userId/role for multi-user, or the legacy
 * flag) so the consuming `/__livos_auth` endpoint can mint a real host-scoped
 * session cookie for that user WITHOUT the session JWT ever riding the URL. The
 * returned `jti` is recorded in Redis by the caller for single-use consumption.
 */
export async function signSsoToken(
	secret: string,
	opts: {targetHost: string; userId?: string; role?: string; legacy?: boolean},
): Promise<{token: string; jti: string}> {
	validateSecret(secret)
	const jti = crypto.randomUUID()
	const payload = {
		sso: true,
		targetHost: opts.targetHost,
		...(opts.userId ? {userId: opts.userId, role: opts.role ?? 'member'} : {legacy: true}),
		jti,
	}
	const token = jwt.sign(payload, secret, {
		expiresIn: SSO_TTL_SECONDS,
		algorithm: JWT_ALGORITHM,
		audience: SSO_AUDIENCE,
		issuer: TOKEN_ISSUER,
	})
	return {token, jti}
}

export type VerifiedSsoToken = {
	targetHost: string
	userId?: string
	role?: string
	legacy?: boolean
	jti: string
}

/**
 * Phase 259 — verify an SSO bounce token. Enforces the SSO audience + issuer
 * (a session/proxy token can NOT be presented here, and vice-versa) and returns
 * the bound target host + identity. Throws on any failure (signature, expiry,
 * wrong audience, missing targetHost) — the caller fails closed to a 401.
 */
export async function verifySsoToken(token: string, secret: string): Promise<VerifiedSsoToken> {
	validateSecret(secret)
	const payload = jwt.verify(token, secret, {
		algorithms: [JWT_ALGORITHM],
		audience: SSO_AUDIENCE,
		issuer: TOKEN_ISSUER,
	}) as any
	if (payload.sso !== true) throw new Error('Invalid SSO token')
	if (typeof payload.targetHost !== 'string' || payload.targetHost.length === 0) {
		throw new Error('Invalid SSO token (no targetHost)')
	}
	if (typeof payload.jti !== 'string' || payload.jti.length === 0) {
		throw new Error('Invalid SSO token (no jti)')
	}
	return {
		targetHost: payload.targetHost,
		userId: payload.userId,
		role: payload.role,
		legacy: payload.legacy === true,
		jti: payload.jti,
	}
}

/**
 * Phase 324-01 (FILES-01, D-03) — mint a short-lived share unlock grant, bound
 * to the ONE shareId it is issued for (replay to another share is rejected at
 * the route by comparing the returned claim to the resolved row.id — mirrors
 * signSsoToken's targetHost binding). The `jti` is returned for optional
 * single-use bookkeeping. Signed with the same session secret + the distinct
 * SHARE_AUDIENCE so it is never interchangeable with a session/proxy/SSO token.
 */
export async function signShareGrant(
	secret: string,
	shareId: string,
): Promise<{token: string; jti: string}> {
	validateSecret(secret)
	const jti = crypto.randomUUID()
	const payload = {share: true, shareId, jti}
	const token = jwt.sign(payload, secret, {
		expiresIn: SHARE_GRANT_TTL_SECONDS,
		algorithm: JWT_ALGORITHM,
		audience: SHARE_AUDIENCE,
		issuer: TOKEN_ISSUER,
	})
	return {token, jti}
}

export type VerifiedShareGrant = {
	shareId: string
	jti: string
}

/**
 * Phase 324-01 (FILES-01, D-03) — verify a share unlock grant. Enforces the
 * SHARE audience + issuer (a session/proxy/SSO token can NOT be presented here,
 * and vice-versa) and returns the bound shareId. Throws on any failure
 * (signature, expiry, wrong audience, missing shareId) — the caller fails
 * closed (re-prompts for the password). The caller MUST additionally check the
 * returned shareId equals the share being accessed (replay-to-another-share
 * defense — the audience alone does not bind the specific share).
 */
export async function verifyShareGrant(token: string, secret: string): Promise<VerifiedShareGrant> {
	validateSecret(secret)
	const payload = jwt.verify(token, secret, {
		algorithms: [JWT_ALGORITHM],
		audience: SHARE_AUDIENCE,
		issuer: TOKEN_ISSUER,
	}) as any
	if (payload.share !== true) throw new Error('Invalid share grant')
	if (typeof payload.shareId !== 'string' || payload.shareId.length === 0) {
		throw new Error('Invalid share grant (no shareId)')
	}
	if (typeof payload.jti !== 'string' || payload.jti.length === 0) {
		throw new Error('Invalid share grant (no jti)')
	}
	return {shareId: payload.shareId, jti: payload.jti}
}

/**
 * Phase 334 (STEPUP-01, D-334-1) — mint a short-lived sudo-mode step-up grant,
 * bound to the ONE userId it is issued for (a grant minted for user A can never
 * authorize a sensitive action running as user B — the middleware compares the
 * claim to ctx.currentUser.id). Minted only AFTER a fresh factor (password /
 * TOTP / passkey) verifies. The distinct STEPUP_AUDIENCE makes it
 * non-interchangeable with a session/proxy/SSO/share token. The `jti` is
 * returned for optional bookkeeping. 5-min TTL is the revocation.
 */
export async function signStepUpGrant(
	secret: string,
	userId: string,
): Promise<{token: string; jti: string}> {
	validateSecret(secret)
	if (typeof userId !== 'string' || userId.length === 0) throw new Error('signStepUpGrant: userId required')
	const jti = crypto.randomUUID()
	const payload = {stepup: true, userId, jti}
	const token = jwt.sign(payload, secret, {
		expiresIn: STEPUP_GRANT_TTL_SECONDS,
		algorithm: JWT_ALGORITHM,
		audience: STEPUP_AUDIENCE,
		issuer: TOKEN_ISSUER,
	})
	return {token, jti}
}

export type VerifiedStepUpGrant = {
	userId: string
	jti: string
}

/**
 * Phase 334 (STEPUP-01, D-334-1) — verify a step-up grant. Enforces the STEPUP
 * audience + issuer (a session/proxy/SSO/share token can NOT be presented here,
 * and vice-versa) and returns the bound userId. Throws on any failure
 * (signature, expiry, wrong audience, missing userId) — the caller (the
 * requireStepUpGrant middleware) fails CLOSED (refuses the sensitive action and
 * signals STEP_UP_REQUIRED). The caller MUST additionally check the returned
 * userId equals the acting user (replay-across-users defense — the audience
 * alone does not bind the specific user).
 */
export async function verifyStepUpGrant(token: string, secret: string): Promise<VerifiedStepUpGrant> {
	validateSecret(secret)
	const payload = jwt.verify(token, secret, {
		algorithms: [JWT_ALGORITHM],
		audience: STEPUP_AUDIENCE,
		issuer: TOKEN_ISSUER,
	}) as any
	if (payload.stepup !== true) throw new Error('Invalid step-up grant')
	if (typeof payload.userId !== 'string' || payload.userId.length === 0) {
		throw new Error('Invalid step-up grant (no userId)')
	}
	if (typeof payload.jti !== 'string' || payload.jti.length === 0) {
		throw new Error('Invalid step-up grant (no jti)')
	}
	return {userId: payload.userId, jti: payload.jti}
}

/**
 * Verify a token. Supports both legacy {loggedIn: true} and new {loggedIn: true, userId, role} payloads.
 * Returns the full payload for the caller to inspect.
 */
export async function verify(token: string, secret: string): Promise<VerifiedJwtPayload> {
	validateSecret(secret)
	// Verify signature + expiry. We DON'T pass {audience, issuer} to jwt.verify
	// because that hard-rejects a token with the claim ABSENT — and outstanding
	// session tokens minted before Phase 257-04 carry no aud/iss. Instead we
	// enforce aud/iss only when PRESENT (warm migration): a token with a WRONG
	// aud/iss is rejected; a legacy token with none is still accepted until it
	// rolls over (ONE_WEEK). New tokens always carry the correct aud/iss.
	const payload = jwt.verify(token, secret, {algorithms: [JWT_ALGORITHM]}) as any

	if (payload.loggedIn !== true) throw new Error('Invalid JWT')

	// Phase 257-04 (LIVOS-028): reject a token bound to a DIFFERENT audience
	// (e.g. a proxy token presented to the session verifier) or issuer.
	if (payload.aud !== undefined && payload.aud !== SESSION_AUDIENCE) throw new Error('Invalid JWT audience')
	if (payload.iss !== undefined && payload.iss !== TOKEN_ISSUER) throw new Error('Invalid JWT issuer')

	return {
		loggedIn: true,
		userId: payload.userId,
		role: payload.role,
		jti: payload.jti,
	}
}

/**
 * Legacy verify that just returns true/false for backward compatibility.
 * Used by code paths that only need to know if the token is valid.
 */
export async function verifyLegacy(token: string, secret: string): Promise<boolean> {
	await verify(token, secret)
	return true
}

// TODO: Only used for legacy auth server verification, we'll want to refactor this.
// We create a JWT with the same key but a different payload.
// This token will be stored in a cookie so it can travel across ports/apps.
// The main login JWT is stored in local storage so it doesn't get leaked to apps
// on different ports. Since this JWT does not include the loggedIn payload,
// if it's leaked to an app they can't use it make authenticated API requests.
// This token only lets you through the app proxy and nothing else.
export async function signProxyToken(secret: string) {
	validateSecret(secret)
	// Phase 257-04 (LIVOS-028): sign NEW proxy tokens with the SEPARATE derived
	// proxy secret + the proxy audience so they are not interchangeable with
	// session tokens.
	const proxySecret = deriveProxySecret(secret)
	const payload = {proxyToken: true}
	const token = jwt.sign(payload, proxySecret, {
		expiresIn: ONE_WEEK,
		algorithm: JWT_ALGORITHM,
		audience: PROXY_AUDIENCE,
		issuer: TOKEN_ISSUER,
	})

	return token
}

export async function verifyProxyToken(token: string, secret: string) {
	validateSecret(secret)
	const proxySecret = deriveProxySecret(secret)

	// Phase 257-04 (LIVOS-028) WARM MIGRATION (mirrors WS-E lazy-rekey):
	// 1. Try the NEW proxy secret (with the proxy audience) FIRST.
	// 2. On failure, FALL BACK to the LEGACY shape — the session secret with no
	//    proxy audience — so every outstanding ~week-long proxy cookie minted
	//    before this change keeps working until it expires (no forced re-login,
	//    no broken live PTY/terminal session). The fallback is transitional and
	//    can be removed once the ONE_WEEK grace window has fully rolled over.
	try {
		const payload = jwt.verify(token, proxySecret, {
			algorithms: [JWT_ALGORITHM],
			audience: PROXY_AUDIENCE,
			issuer: TOKEN_ISSUER,
		}) as any
		if (payload.proxyToken !== true) throw new Error('Invalid JWT')
		return true
	} catch {
		// Legacy fallback: old proxy cookie signed with the session secret, no aud.
		const payload = jwt.verify(token, secret, {algorithms: [JWT_ALGORITHM]}) as any
		if (payload.proxyToken !== true) throw new Error('Invalid JWT')
		return true
	}
}
