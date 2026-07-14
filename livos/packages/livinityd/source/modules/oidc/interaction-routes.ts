// Phase 322 (IDENT-02, D-322-1, Pitfall 3) — the auto-approve OIDC interaction.
//
// SAME shape as the Phase 259 /__livos_sso bounce: read the LIVINITY_SESSION
// cookie, and if it passes the EXISTING verifySessionFull (signature+exp, then
// active-user re-check, then jti revocation) finish the interaction invisibly;
// if not, bounce to the real login preserving the return. It reuses the injected
// verifySessionFull — the ONE identity choke point — NEVER a bare verifyToken or
// a cookie-presence check (that is the LIVOS-041 class of bug this guards).
//
// Auto-consent is safe because the clients are first-party, admin-toggled STATIC
// clients (clients.ts) and features.registration is never enabled (Pitfall 5):
// panva enforces exact redirect_uri allowlisting against that fixed array, and
// this handler never derives a redirect from request input — it only reads the
// cookie and calls the provider's own finish primitive.

import type {Express, NextFunction, Request, Response} from 'express'

import type Provider from 'oidc-provider'

export interface OidcInteractionDeps {
	getProvider: () => Provider | null
	verifySessionFull: (token: string) => Promise<{userId?: string} | null>
}

/**
 * Register GET /oidc/interaction/:uid. Mounted BEFORE provider.callback() so it
 * intercepts the interaction URL the provider redirects to. No-ops (next()) when
 * the provider is not yet initialised (no-domain box / pre-init).
 */
export function registerOidcInteractionRoutes(app: Express, deps: OidcInteractionDeps): void {
	app.get('/oidc/interaction/:uid', async (req: Request, res: Response, next: NextFunction) => {
		try {
			const provider = deps.getProvider()
			if (!provider) return next()

			const {prompt, params} = await provider.interactionDetails(req, res)
			const token = req.cookies?.LIVINITY_SESSION
			const session = token ? await deps.verifySessionFull(token) : null

			if (!session || !session.userId) {
				// No valid LivOS session (logged-out / revoked / deactivated) — bounce
				// to the real login, preserving the return so the browser lands back on
				// this same interaction URL after signing in. Never finish the interaction.
				return res.redirect(`/login?redirect=${encodeURIComponent(req.originalUrl)}`)
			}

			if (prompt.name === 'login') {
				// The LivOS cookie IS the login — auto-approve, no form ever renders.
				return provider.interactionFinished(
					req,
					res,
					{login: {accountId: session.userId}},
					{mergeWithLastSubmission: false},
				)
			}

			if (prompt.name === 'consent') {
				// First-party admin-enabled client — auto-consent invisibly (mirrors the
				// Phase 259 bounce UX). The scope is bounded to what the provider declares.
				const grant = new provider.Grant({
					accountId: session.userId,
					clientId: params.client_id as string,
				})
				// IN-03 (322-review): grant ONLY the scopes the RP actually requested
				// (params.scope) rather than hardcoding the full set — panva has already
				// validated params.scope against the client's registered scopes before this
				// interaction fires, so this is a least-privilege bound, not a widening. Fall
				// back to 'openid' if somehow absent (a valid OIDC request always carries it).
				const requestedScope =
					typeof params.scope === 'string' && params.scope.trim() ? params.scope : 'openid'
				grant.addOIDCScope(requestedScope)
				const grantId = await grant.save()
				return provider.interactionFinished(
					req,
					res,
					{consent: {grantId}},
					{mergeWithLastSubmission: false},
				)
			}

			return next(new Error(`unsupported prompt: ${prompt.name}`))
		} catch (err) {
			next(err)
		}
	})
}
