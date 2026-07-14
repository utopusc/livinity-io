// Phase 322 (IDENT-02) — the embedded OIDC provider factory + in-process service.
//
// Design decisions this file encodes (do NOT weaken without re-opening them):
//   D-322-1 (apex-only issuer): the issuer is fixed to `https://{mainDomain}/oidc`
//     — the ONE host that already carries LIVINITY_SESSION from login. There is no
//     per-app-subdomain provider. The interaction handler (interaction-routes.ts)
//     reuses the EXISTING verifySessionFull, so a logged-in browser auto-approves
//     invisibly (the same UX as the Phase 259 /__livos_sso bounce). Boots no-op on
//     a no-domain box exactly like every other domain feature (caller guards on
//     getActiveMainDomain() === null).
//   D-322-2 (MemoryAdapter for v1): the default in-memory adapter is used for the
//     EPHEMERAL protocol models only (authorization codes / access+refresh tokens /
//     Session / Interaction / Grant). These are lost on a livinityd restart, which
//     is an ACCEPTED, DOCUMENTED trade-off: the auto-approve interaction makes the
//     next re-authorization invisible for a logged-in user, so a restart costs the
//     same as any cookie-backed session surviving a backend restart. A Redis-backed
//     adapter is the natural v2 upgrade. The STATIC clients array is NOT
//     adapter-backed — it is held in the constructor config and rebuilt identically
//     on every boot from (seed, enabledApps), so it always survives.
//   D-322-8 (in-process rebuild): OidcService.rebuild() re-instantiates the Provider
//     with a new static-clients array on a per-app "Enable SSO" toggle — no
//     container restart. 322-05 calls getOidcService()?.rebuild(...) cross-module.
//
// Pitfall 5 (STANDING): features.registration / registrationManagement are NEVER
// enabled. Clients are first-party, admin-provisioned, STATIC only — that is what
// makes the auto-consent interaction safe (panva enforces exact redirect_uri
// allowlisting against this fixed array).

import type {RequestHandler} from 'express'

// Type-only import — erased at compile time so this module (statically imported by
// server/index.ts) NEVER triggers runtime resolution of oidc-provider at load. The
// heavy value import happens lazily inside createOidcProvider(), so a missing or
// broken oidc-provider dependency degrades to "OIDC does not mount" (caught by the
// initOidc try/catch) instead of crash-looping the whole daemon — including the
// login path. This is the defense-in-depth backstop for "OIDC boot failure must
// never take down /auth/verify".
import type Provider from 'oidc-provider'
import type {Account, AccountClaims, FindAccount, JWKS} from 'oidc-provider'

import {findUserById} from '../database/index.js'
import {listGroupNamesForUser} from '../database/groups.js'
import {buildStaticClients, type OidcEnabledApp} from './clients.js'
import {getOrCreateSigningJwks} from './signing-keys.js'

export interface CreateOidcOptions {
	mainDomain: string
	enabledApps: OidcEnabledApp[]
	seed: Buffer
}

/**
 * findAccount for an ALREADY-decided accountId (the interaction handler decides
 * WHO via verifySessionFull; this only resolves claims). Mirrors the exact
 * lookup verifySessionFull uses (findUserById) so a deactivated user resolving
 * here returns undefined — the same fail-closed posture. The groups claim is the
 * single IDENT-01 groups source (listGroupNamesForUser).
 */
function makeFindAccount(): FindAccount {
	return async (_ctx, sub) => {
		const user = await findUserById(sub)
		if (!user || !user.isActive) return undefined
		const account: Account = {
			accountId: user.id,
			async claims(_use, scope) {
				const claims: AccountClaims = {sub: user.id}
				if (scope.includes('profile')) {
					claims.name = user.displayName
					claims.preferred_username = user.username
				}
				if (scope.includes('email')) {
					// DatabaseUser carries no email column today — access defensively so
					// the claim is simply omitted until a users.email field exists. The
					// email scope stays declared so apps CAN request it (harmless when
					// unavailable, standard OIDC behaviour).
					const email = (user as {email?: string}).email
					if (email) claims.email = email
				}
				if (scope.includes('groups')) {
					claims.groups = await listGroupNamesForUser(user.id)
				}
				return claims
			},
		}
		return account
	}
}

/**
 * Build the panva oidc-provider v9 instance at the apex issuer. `proxy = true`
 * because Caddy sits in front (trust X-Forwarded-Proto so issuer/redirect URLs
 * are https, not http). devInteractions off — we render/handle the interaction
 * ourselves off LIVINITY_SESSION (interaction-routes.ts). No registration.
 */
export async function createOidcProvider(opts: CreateOidcOptions): Promise<Provider> {
	// Lazy value import (see the type-only import note at the top): resolving
	// oidc-provider here — inside the initOidc try/catch — means a dependency fault
	// degrades gracefully instead of crashing module load.
	const {default: Provider} = await import('oidc-provider')
	const jwks = await getOrCreateSigningJwks()
	const provider = new Provider(`https://${opts.mainDomain}/oidc`, {
		jwks: jwks as unknown as JWKS,
		clients: buildStaticClients(opts.enabledApps, opts.seed),
		claims: {
			openid: ['sub'],
			profile: ['name', 'preferred_username'],
			email: ['email'],
			groups: ['groups'],
		},
		scopes: ['openid', 'profile', 'email', 'groups'],
		features: {
			devInteractions: {enabled: false},
		},
		interactions: {
			url(_ctx, interaction) {
				return `/oidc/interaction/${interaction.uid}`
			},
		},
		findAccount: makeFindAccount(),
	})
	provider.proxy = true
	return provider
}

/**
 * In-process holder for the single Provider. init() builds it once at boot;
 * rebuild() re-instantiates it with a fresh static-clients array on an "Enable
 * SSO" toggle (D-322-8) without a container restart. callback() delegates to the
 * live provider (or next() before init / on a no-domain box).
 */
export class OidcService {
	#provider: Provider | null = null
	#opts: CreateOidcOptions | null = null

	async init(opts: CreateOidcOptions): Promise<void> {
		this.#opts = opts
		this.#provider = await createOidcProvider(opts)
	}

	async rebuild(enabledApps: OidcEnabledApp[]): Promise<void> {
		if (!this.#opts) return
		this.#opts = {...this.#opts, enabledApps}
		this.#provider = await createOidcProvider(this.#opts)
	}

	callback(): RequestHandler {
		return (req, res, next) => {
			const provider = this.#provider
			if (!provider) return next()
			return provider.callback()(req, res)
		}
	}

	get provider(): Provider | null {
		return this.#provider
	}
}

// Module singleton — 322-05's setOidcEnabled toggle calls getOidcService()?.rebuild(...)
// from a different module, so the live instance is reachable process-wide.
let _service: OidcService | null = null

export function setOidcService(service: OidcService): void {
	_service = service
}

export function getOidcService(): OidcService | null {
	return _service
}
