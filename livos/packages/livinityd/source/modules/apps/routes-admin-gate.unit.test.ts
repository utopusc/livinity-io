// Phase 326-review (CR-01) — `apps.list` must NOT leak plaintext app admin
// passwords / secrets (`environmentOverrides`, incl. type:'password' fields) to
// non-admin members. `apps.list` is a privateProcedure any authenticated user
// can call, so the secret-bearing field is gated behind `gateAdminOnlyField`.
//
// These tests pin the gate: admins (and legacy single-user, no currentUser) get
// the value; non-admin members get `undefined` — no secret values in the output.
import {describe, it, expect} from 'vitest'

import {gateAdminOnlyField} from './routes.js'

const secrets = {
	GF_SECURITY_ADMIN_PASSWORD: 'hunter2',
	N8N_BASIC_AUTH_PASSWORD: 's3cr3t',
}

describe('apps.list environmentOverrides admin gate (326-review CR-01)', () => {
	it('returns the value verbatim for an admin caller', () => {
		expect(gateAdminOnlyField(secrets, {role: 'admin'})).toBe(secrets)
	})

	it('returns undefined for a non-admin member caller (no secret values leak)', () => {
		const out = gateAdminOnlyField(secrets, {role: 'member'})
		expect(out).toBeUndefined()
		// Defensive: the serialized non-admin output carries no secret substring.
		expect(JSON.stringify(out ?? null)).not.toContain('hunter2')
		expect(JSON.stringify(out ?? null)).not.toContain('s3cr3t')
	})

	it('returns undefined for a role-less / unknown-role caller', () => {
		expect(gateAdminOnlyField(secrets, {})).toBeUndefined()
		expect(gateAdminOnlyField(secrets, {role: undefined})).toBeUndefined()
	})

	it('stays admin-equivalent for legacy single-user (no currentUser)', () => {
		expect(gateAdminOnlyField(secrets, undefined)).toBe(secrets)
		expect(gateAdminOnlyField(secrets, null)).toBe(secrets)
	})

	it('passes through undefined store values without inventing a leak', () => {
		expect(gateAdminOnlyField(undefined, {role: 'admin'})).toBeUndefined()
		expect(gateAdminOnlyField(undefined, {role: 'member'})).toBeUndefined()
	})
})
