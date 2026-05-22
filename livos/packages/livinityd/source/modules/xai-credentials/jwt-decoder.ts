/**
 * Phase 195 Plan 02 Task 1 — jwt-decoder.ts
 *
 * Pure decoder for xAI OAuth JWTs. We DO NOT verify the JWT signature —
 * xAI's OAuth server publishes no JWKS endpoint we depend on, and the
 * token's truthworthiness is established by the fact that it lives in
 * OpenCode's `auth.json` (operator's filesystem == trust boundary).
 *
 * We only need the payload claims for metadata:
 *   - tier (SuperGrok subscription level)
 *   - scopes (entitlements: grok-cli:access, api:access, etc.)
 *   - exp (expiry in ms epoch — normalized from possible seconds-form)
 *   - principalId / teamId (UUIDs)
 *   - iss / aud (issuer + audience = OpenCode client_id, used as refresh client_id)
 *
 * Security:
 *   - NEVER logs the token itself (T-195-02-01); callers may log decoded
 *     scalar claims only (tier, exp, scope.length, principalId.slice(0,8))
 */

export interface XaiJwtClaims {
	iss: string
	aud: string
	sub?: string
	exp: number // ms epoch (already normalized from possible seconds-form)
	scope: string[]
	tier?: number
	principal_id?: string
	team_id?: string
}

export class AuthJsonCorruptError extends Error {
	readonly code = 'XAI_AUTH_JSON_CORRUPT' as const
	constructor(message: string) {
		super(message)
		this.name = 'AuthJsonCorruptError'
	}
}

/**
 * Decode an xAI OAuth JWT payload. No signature verification.
 *
 * @throws AuthJsonCorruptError on malformed input (wrong segment count,
 *   invalid base64url, non-JSON payload, missing iss claim)
 */
export function decodeXaiJwt(token: string): XaiJwtClaims {
	if (typeof token !== 'string' || token.length === 0) {
		throw new AuthJsonCorruptError('jwt: empty or non-string input')
	}

	const segments = token.split('.')
	if (segments.length !== 3) {
		throw new AuthJsonCorruptError(
			`jwt: expected 3 segments, got ${segments.length}`,
		)
	}

	const payloadB64 = segments[1]
	if (!payloadB64) {
		throw new AuthJsonCorruptError('jwt: empty payload segment')
	}

	// base64url → base64 → utf-8 → JSON
	let payloadJson: string
	try {
		const b64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/')
		const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
		payloadJson = Buffer.from(b64 + pad, 'base64').toString('utf8')
	} catch (err) {
		throw new AuthJsonCorruptError(
			`jwt: base64url decode failed: ${(err as Error).message}`,
		)
	}

	let parsed: unknown
	try {
		parsed = JSON.parse(payloadJson)
	} catch (err) {
		throw new AuthJsonCorruptError(
			`jwt: payload not valid JSON: ${(err as Error).message}`,
		)
	}

	if (!parsed || typeof parsed !== 'object') {
		throw new AuthJsonCorruptError('jwt: payload is not an object')
	}

	const obj = parsed as Record<string, unknown>

	const iss = obj.iss
	if (typeof iss !== 'string' || !iss.startsWith('https://')) {
		throw new AuthJsonCorruptError(
			`jwt: iss claim missing or not an https URL (got: ${JSON.stringify(iss)})`,
		)
	}

	const aud = typeof obj.aud === 'string' ? obj.aud : ''

	// exp normalization: tokens may carry seconds (RFC 7519 standard) OR
	// milliseconds (some implementations). Heuristic: anything below the year
	// 2286 in seconds (10_000_000_000 s ≈ 2286-11-20) is treated as seconds.
	const expRaw = obj.exp
	let exp: number
	if (typeof expRaw !== 'number' || !Number.isFinite(expRaw)) {
		throw new AuthJsonCorruptError(
			`jwt: exp claim missing or not a finite number (got: ${JSON.stringify(expRaw)})`,
		)
	}
	exp = expRaw < 10_000_000_000 ? expRaw * 1000 : expRaw

	// scope claim is a space-separated string per OAuth 2 convention.
	let scope: string[]
	const scopeRaw = obj.scope
	if (typeof scopeRaw === 'string') {
		scope = scopeRaw.split(/\s+/).filter(Boolean)
	} else if (Array.isArray(scopeRaw)) {
		scope = scopeRaw.filter((s): s is string => typeof s === 'string')
	} else {
		scope = []
	}

	const claims: XaiJwtClaims = {iss, aud, exp, scope}

	if (typeof obj.sub === 'string') claims.sub = obj.sub
	if (typeof obj.tier === 'number') claims.tier = obj.tier
	if (typeof obj.principal_id === 'string') claims.principal_id = obj.principal_id
	if (typeof obj.team_id === 'string') claims.team_id = obj.team_id

	return claims
}
