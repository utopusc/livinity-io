// Phase 322 (IDENT-02, D-322-3, Pitfall 5) — STATIC clients only. Client secrets
// derived deterministically from the box seed (distinct suffix from
// deriveDeterministicPassword). NEVER enable features.registration.

import crypto from 'node:crypto'

import type {ClientMetadata} from 'oidc-provider'

/**
 * Derive a per-app OIDC client secret as a pure HMAC over the box seed, mirroring
 * apps/app.ts deriveDeterministicPassword but with a DISTINCT identifier suffix so
 * the OIDC secret can never collide with (or leak) the app's own password. Zero
 * storage — reproducible on every boot / "Enable SSO" toggle from (seed, appId).
 */
export function deriveOidcClientSecret(appId: string, seed: Buffer): string {
	const identifier = `app-${appId}-seed-OIDC_CLIENT_SECRET`
	return crypto.createHmac('sha256', seed).update(identifier).digest('hex')
}

/** An app the admin has enabled SSO for, plus its exact registered redirect URIs. */
export interface OidcEnabledApp {
	appId: string
	redirectUris: string[]
}

/**
 * Build the STATIC oidc-provider clients array from the currently SSO-enabled
 * apps. First-party catalog apps only (admin-provisioned) — the auto-approve
 * interaction (322-04) is safe precisely because this array is fixed and
 * features.registration is never enabled. An empty apps array (the wave-2 boot
 * state before any app enables SSO) yields [].
 */
export function buildStaticClients(apps: OidcEnabledApp[], seed: Buffer): ClientMetadata[] {
	return apps.map(
		(a): ClientMetadata => ({
			client_id: `livos-${a.appId}`,
			client_secret: deriveOidcClientSecret(a.appId, seed),
			redirect_uris: a.redirectUris,
			grant_types: ['authorization_code', 'refresh_token'],
			response_types: ['code'],
			token_endpoint_auth_method: 'client_secret_basic',
		}),
	)
}
