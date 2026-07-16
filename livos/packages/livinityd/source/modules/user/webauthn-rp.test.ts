/**
 * Phase 323-01 IDENT-03 — resolveRpId host-only pure fn (D-02 / LIVOS-023).
 *
 * The #1 human-UAT ratify item. Truth table asserts the LOCKED host-only default:
 *   - null (bare-LAN-IP box) → null (WebAuthn UNAVAILABLE — RP-ID can never be an
 *     IP, and there is no secure context on a LAN IP).
 *   - any host → itself (host-only): a box can only assert its OWN host, never a
 *     shared '.livinity.io' parent that would let one tenant harvest another's
 *     passkey. This EXPLICITLY asserts the '.livinity.io'-family does NOT collapse
 *     to 'livinity.io' — that is the rejected Option A (flippable one-liner).
 */

import {describe, expect, test} from 'vitest'

import {resolveRpId} from './webauthn-rp.js'

describe('resolveRpId — host-only RP-ID (D-02 / LIVOS-023)', () => {
	test('null (bare-LAN-IP box) → null (WebAuthn unavailable)', () => {
		expect(resolveRpId(null)).toBeNull()
	})

	test('a *.livinity.io host resolves to ITSELF — NOT collapsed to livinity.io (rejected Option A)', () => {
		expect(resolveRpId('bruce.livinity.io')).toBe('bruce.livinity.io')
		expect(resolveRpId('bruce.livinity.io')).not.toBe('livinity.io')
		expect(resolveRpId('ab12cd34.home.livinity.io')).toBe('ab12cd34.home.livinity.io')
		expect(resolveRpId('ab12cd34.home.livinity.io')).not.toBe('livinity.io')
	})

	test('a custom domain resolves to ITSELF (host-only)', () => {
		expect(resolveRpId('files.acme.example')).toBe('files.acme.example')
		expect(resolveRpId('cloud.example.org')).toBe('cloud.example.org')
	})

	test('the bare apex livinity.io resolves to itself (no rewrite)', () => {
		expect(resolveRpId('livinity.io')).toBe('livinity.io')
	})
})
