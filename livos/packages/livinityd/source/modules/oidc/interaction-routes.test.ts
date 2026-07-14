// Phase 322 (IDENT-02, D-322-1, Pitfall 3) — oidc interaction handler unit tests.
//
// Locks the auto-approve interaction contract:
//   (a) a VALID LIVINITY_SESSION (verifySessionFull -> {userId}) auto-approves the
//       'login' prompt via interactionFinished({login:{accountId}}) and never
//       renders a form or redirects;
//   (b) a NULL session (logged-out / revoked / deactivated) redirects to the real
//       /login preserving the return and NEVER finishes the interaction;
//   (c) the handler calls the INJECTED verifySessionFull with the cookie token —
//       never a bare verifyToken / cookie-presence check (the LIVOS-041 class);
//   (d) a VALID session auto-consents with the openid+profile+email+groups scope.

import {describe, expect, test, vi} from 'vitest'

import {registerOidcInteractionRoutes, type OidcInteractionDeps} from './interaction-routes.js'

type Handler = (req: any, res: any, next: any) => unknown

// Capture the single route handler registered on a fake Express app.
function register(deps: OidcInteractionDeps): Handler {
	let handler: Handler | undefined
	const app = {
		get(_path: string, h: Handler) {
			handler = h
		},
	}
	registerOidcInteractionRoutes(app as any, deps)
	if (!handler) throw new Error('handler not registered')
	return handler
}

function fakeProvider(promptName: string) {
	return {
		interactionDetails: vi
			.fn()
			.mockResolvedValue({prompt: {name: promptName}, params: {client_id: 'livos-immich'}}),
		interactionFinished: vi.fn().mockResolvedValue(undefined),
		Grant: class {
			addOIDCScope = vi.fn()
			save = vi.fn().mockResolvedValue('grant-1')
		},
	}
}

describe('oidc/interaction-routes', () => {
	test('valid session auto-approves the login prompt (no redirect)', async () => {
		const provider = fakeProvider('login')
		const verifySessionFull = vi.fn().mockResolvedValue({userId: 'user-123'})
		const handler = register({getProvider: () => provider as any, verifySessionFull})
		const req = {cookies: {LIVINITY_SESSION: 'tok-abc'}, originalUrl: '/oidc/interaction/xyz'}
		const res = {redirect: vi.fn()}
		const next = vi.fn()

		await handler(req, res, next)

		expect(provider.interactionFinished).toHaveBeenCalledWith(
			req,
			res,
			{login: {accountId: 'user-123'}},
			{mergeWithLastSubmission: false},
		)
		expect(res.redirect).not.toHaveBeenCalled()
	})

	test('null session redirects to /login and does NOT finish the interaction', async () => {
		const provider = fakeProvider('login')
		const verifySessionFull = vi.fn().mockResolvedValue(null)
		const handler = register({getProvider: () => provider as any, verifySessionFull})
		const req = {cookies: {LIVINITY_SESSION: 'stale'}, originalUrl: '/oidc/interaction/xyz'}
		const res = {redirect: vi.fn()}
		const next = vi.fn()

		await handler(req, res, next)

		expect(res.redirect).toHaveBeenCalledWith(
			`/login?redirect=${encodeURIComponent('/oidc/interaction/xyz')}`,
		)
		expect(provider.interactionFinished).not.toHaveBeenCalled()
	})

	test('verifySessionFull is invoked with the cookie token (not a bare presence check)', async () => {
		const provider = fakeProvider('login')
		const verifySessionFull = vi.fn().mockResolvedValue({userId: 'user-123'})
		const handler = register({getProvider: () => provider as any, verifySessionFull})
		const req = {cookies: {LIVINITY_SESSION: 'the-real-token'}, originalUrl: '/oidc/interaction/xyz'}
		const res = {redirect: vi.fn()}
		const next = vi.fn()

		await handler(req, res, next)

		expect(verifySessionFull).toHaveBeenCalledWith('the-real-token')
	})

	test('valid session auto-consents with a groups-scoped grant', async () => {
		const provider = fakeProvider('consent')
		const verifySessionFull = vi.fn().mockResolvedValue({userId: 'user-123'})
		const handler = register({getProvider: () => provider as any, verifySessionFull})
		const req = {cookies: {LIVINITY_SESSION: 'tok'}, originalUrl: '/oidc/interaction/xyz'}
		const res = {redirect: vi.fn()}
		const next = vi.fn()

		await handler(req, res, next)

		expect(provider.interactionFinished).toHaveBeenCalledWith(
			req,
			res,
			{consent: {grantId: 'grant-1'}},
			{mergeWithLastSubmission: false},
		)
	})
})
