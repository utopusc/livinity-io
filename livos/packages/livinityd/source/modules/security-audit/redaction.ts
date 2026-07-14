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

// WR-01 (SEC-01 completeness): free-form error strings are the SECOND leak
// surface — they land verbatim in `device_audit_log.error` (PG) AND the JSON
// forensics file, neither of which `redact()` (key-based, object-only) can
// reach. Several existing adminProcedure mutations interpolate raw `input.*`
// values into TRPCError messages (e.g. "Credential '<name>' already exists"),
// so a secret-shaped value can ride into the error text. This scrubs any
// `key: value` / `key=value` echo whose key is secret-shaped and caps length so
// pathological error text can never bloat the audit trail.
// Matches a full secret-shaped KEY (a token from the denylist, possibly embedded
// in a longer identifier like `recoveryCode` / `hashedPassword` / `apiKey`)
// followed by a `:` or `=` separator and its value. Capture group 1 preserves
// the key so the value alone is neutralized to `<key>=[REDACTED]`.
const SECRET_ECHO_RE = /([\w.-]*(?:password|token|secret|totp|apikey|api_key|hash|recover)[\w.-]*)\s*[:=]\s*\S+/gi
const MAX_ERROR_LEN = 500

export function redactErrorString(msg: string): string {
	return msg.replace(SECRET_ECHO_RE, '$1=[REDACTED]').slice(0, MAX_ERROR_LEN)
}
