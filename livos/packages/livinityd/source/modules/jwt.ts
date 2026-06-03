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
