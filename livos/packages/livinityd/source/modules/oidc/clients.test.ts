// Phase 322 (IDENT-02, D-322-3, Pitfall 5) — oidc/clients unit tests.
//
// Locks the deterministic client-secret derivation + the static-clients builder:
//   1. deriveOidcClientSecret is a PURE, deterministic sha256 HMAC over the box
//      seed — same (appId, seed) always yields the same hex secret.
//   2. It is DISTINCT from apps/app.ts deriveDeterministicPassword because the
//      suffix is `-OIDC_CLIENT_SECRET`, not `-APP_PASSWORD` (no credential reuse).
//   3. buildStaticClients emits the exact oidc-provider ClientMetadata shape
//      (client_secret_basic, auth-code + refresh, code response) and returns []
//      for the wave-2 boot state before any app enables SSO.

import crypto from 'node:crypto'

import {describe, expect, test} from 'vitest'

const mod = await import('./clients.js')

const SEED = Buffer.from('test-box-seed-0123456789abcdef')

describe('oidc/clients', () => {
	test('deriveOidcClientSecret is a pure, deterministic hex HMAC', () => {
		const a = mod.deriveOidcClientSecret('nextcloud', SEED)
		const b = mod.deriveOidcClientSecret('nextcloud', SEED)
		expect(a).toBe(b)
		expect(a).toMatch(/^[0-9a-f]{64}$/) // sha256 hex digest
	})

	test('different appIds derive different secrets', () => {
		expect(mod.deriveOidcClientSecret('nextcloud', SEED)).not.toBe(
			mod.deriveOidcClientSecret('gitea', SEED),
		)
	})

	test('the OIDC secret is DISTINCT from the APP_PASSWORD derivation (different suffix)', () => {
		const oidc = mod.deriveOidcClientSecret('vaultwarden', SEED)
		// The deriveDeterministicPassword shape (apps/app.ts) with the -APP_PASSWORD
		// suffix — a same-seed collision here would mean OIDC reuses the app password.
		const appPassword = crypto
			.createHmac('sha256', SEED)
			.update('app-vaultwarden-seed-APP_PASSWORD')
			.digest('hex')
		expect(oidc).not.toBe(appPassword)
	})

	test('buildStaticClients returns [] for an empty apps array', () => {
		expect(mod.buildStaticClients([], SEED)).toEqual([])
	})

	test('buildStaticClients emits the exact static ClientMetadata shape', () => {
		const clients = mod.buildStaticClients(
			[{appId: 'immich', redirectUris: ['https://immich-bruce.example.com/auth/login']}],
			SEED,
		)
		expect(clients).toHaveLength(1)
		const c = clients[0]
		expect(c.client_id).toBe('livos-immich')
		expect(c.client_secret).toBe(mod.deriveOidcClientSecret('immich', SEED))
		expect(c.redirect_uris).toEqual(['https://immich-bruce.example.com/auth/login'])
		expect(c.grant_types).toEqual(['authorization_code', 'refresh_token'])
		expect(c.response_types).toEqual(['code'])
		expect(c.token_endpoint_auth_method).toBe('client_secret_basic')
	})
})
