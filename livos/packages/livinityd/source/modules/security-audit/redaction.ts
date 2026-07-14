/**
 * Phase 328 SEC-01 — denylist redaction of mutation input.
 *
 * Applied BEFORE the input reaches EITHER audit sink (the PG `params_digest`
 * SHA-256 hash AND the /opt/livos/data/security-events JSON forensics file —
 * RESEARCH Pitfall 3: the JSON file stores the object verbatim, so it is the
 * real leak surface). Any key whose name matches a secret-shaped token is
 * scrubbed to '[REDACTED]'; matching is case-insensitive and recurses through
 * both arrays and nested objects.
 *
 * REUSE invariant: this module NEVER redefines `computeParamsDigest`
 * (devices/audit-pg.ts) — it only shapes the object that is later hashed. The
 * caller (audit-middleware.ts) applies redact() once, then hands the already
 * safe object to events.ts.
 */

// Case-insensitive: any input key containing one of these tokens is redacted.
// Covers password, token, secret, totp, apikey, api_key, hash (which also
// matches hashedPassword). Deliberately broad — a false-positive redaction is
// harmless; a leaked secret is not.
const SECRET_KEY_RE = /password|token|secret|totp|apikey|api_key|hash/i

export function redact(input: unknown): unknown {
	if (input === null || typeof input !== 'object') return input
	if (Array.isArray(input)) return input.map(redact)
	const out: Record<string, unknown> = {}
	for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
		out[k] = SECRET_KEY_RE.test(k) ? '[REDACTED]' : redact(v)
	}
	return out
}
