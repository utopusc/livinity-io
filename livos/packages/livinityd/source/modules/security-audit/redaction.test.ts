// Phase 328 SEC-01 — provable-redaction unit test.
//
// This is the SEC-01 correctness gate: it feeds fake secrets as mutation-input
// keys and asserts they are scrubbed to '[REDACTED]' BEFORE the object could
// ever reach an audit sink. If this test passes, no secret-shaped field can
// land in the PG params_digest hash or the JSON forensics file (RESEARCH
// Pitfall 3). Recursion (arrays + nested objects) and case-insensitivity are
// covered because real mutation inputs nest and vary casing.

import {describe, expect, test} from 'vitest'

import {redact, redactErrorString} from './redaction.js'

describe('security-audit/redaction — redact()', () => {
	test('scrubs a top-level secret key, leaves non-secret keys intact', () => {
		expect(redact({password: 'hunter2', name: 'ada'})).toEqual({
			password: '[REDACTED]',
			name: 'ada',
		})
	})

	test('recurses into nested objects', () => {
		expect(redact({user: {apiSecret: 'liv_sk_x', id: '7'}})).toEqual({
			user: {apiSecret: '[REDACTED]', id: '7'},
		})
	})

	test('recurses into arrays of objects', () => {
		expect(redact([{token: 't'}, {ok: 1}])).toEqual([{token: '[REDACTED]'}, {ok: 1}])
	})

	test('key matching is case-insensitive across all denylist shapes', () => {
		expect(
			redact({
				TotpToken: '123456',
				API_KEY: 'liv_k_abc',
				hashedPassword: '$2a$10$abc',
				plain: 'keep',
			}),
		).toEqual({
			TotpToken: '[REDACTED]',
			API_KEY: '[REDACTED]',
			hashedPassword: '[REDACTED]',
			plain: 'keep',
		})
	})

	test('scrubs recovery-code-shaped keys (WR-03 — IDENT-05 secret vocabulary)', () => {
		expect(redact({recoveryCode: 'abc123', recoveryCodes: ['a', 'b']})).toEqual({
			recoveryCode: '[REDACTED]',
			recoveryCodes: '[REDACTED]',
		})
	})

	test('a fake secret is NEVER present in the redacted output (provable-redaction gate)', () => {
		const FAKE_SECRET = 'liv_sk_super_secret_value_do_not_leak'
		const redacted = redact({
			apiKey: FAKE_SECRET,
			nested: {password: FAKE_SECRET, totpToken: FAKE_SECRET},
			list: [{secret: FAKE_SECRET}],
		})
		// Serialize the WHOLE redacted object (this is exactly what the JSON sink
		// and computeParamsDigest see) and assert the plaintext is gone.
		expect(JSON.stringify(redacted)).not.toContain(FAKE_SECRET)
		expect(JSON.stringify(redacted)).toContain('[REDACTED]')
	})

	test('primitives pass through unchanged', () => {
		expect(redact('x')).toBe('x')
		expect(redact(5)).toBe(5)
		expect(redact(null)).toBe(null)
		expect(redact(undefined)).toBe(undefined)
		expect(redact(true)).toBe(true)
	})
})

describe('security-audit/redaction — redactErrorString() (WR-01)', () => {
	// SEC-01 completeness gate for the SECOND leak surface: free-form error text
	// that lands verbatim in device_audit_log.error AND the JSON forensics file.
	test('scrubs a secret-shaped echo out of error text — the stored row is clean', () => {
		const FAKE_SECRET = 'liv_sk_super_secret_value_do_not_leak'
		const out = redactErrorString(`Enrol failed: token=${FAKE_SECRET} was rejected`)
		expect(out).not.toContain(FAKE_SECRET)
		expect(out).toContain('[REDACTED]')
	})

	test('scrubs every secret-shaped key including recovery codes (key: value AND key=value)', () => {
		expect(redactErrorString('password: hunter2')).toBe('password=[REDACTED]')
		expect(redactErrorString('apiKey=liv_k_abc')).toBe('apiKey=[REDACTED]')
		expect(redactErrorString('recoveryCode: abc123')).toBe('recoveryCode=[REDACTED]')
	})

	test('leaves non-secret error text intact', () => {
		expect(redactErrorString('invalid_credentials')).toBe('invalid_credentials')
		expect(redactErrorString("Group named 'ops' already exists")).toBe("Group named 'ops' already exists")
	})

	test('caps length at 500 chars so pathological error text cannot bloat the audit trail', () => {
		expect(redactErrorString('x'.repeat(2000))).toHaveLength(500)
	})
})
