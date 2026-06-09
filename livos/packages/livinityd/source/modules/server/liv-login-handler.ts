/**
 * Phase 234-04 — Liv AI auto-login HTTP handler.
 *
 * Same-origin endpoint that performs the AionUi qr-token + qr-login flow
 * server-side (loopback to 127.0.0.1:3020), forwards the resulting
 * `Set-Cookie: aionui-session=<JWT>; Path=/; HttpOnly; SameSite=Lax` header
 * to the browser response unchanged, and 302-redirects to /liv/. The
 * browser stores the cookie scoped to the bruce.livinity.io origin; the
 * iframe's subsequent /liv/* requests automatically include it. The
 * AionUi SPA then sees is_authenticated:true and renders the chat surface
 * directly -- no login form ever appears.
 *
 * Feature flag: Redis `liv:config:liv_ai_autologin_enabled` (default ON).
 * When 'false', the handler 302-redirects to /liv/ WITHOUT the qr-login flow
 * so the operator can manually authenticate via AionUi's qr-login UI as
 * a fallback. D-LIVAI-AUTOLOGIN-ROLLBACK pattern matching D-V42-ROLLBACK.
 *
 * Phase 262-01 (LIVOS-041, Critical): the handler is now SESSION-GATED. The
 * factory takes a `verifySession` function (wired to Server.verifySessionFull
 * at the mount in source/index.ts — full validation incl. jti revocation +
 * active-user re-check) and 401s BEFORE the feature-flag read when the
 * request carries no LIVINITY_SESSION cookie or the verifier rejects it.
 * Previously ANY unauthenticated caller could mint an `aionui-session`
 * cookie and reach the operator-credentialed Claude Code agent behind /liv.
 * The Caddy @liv_login forward_auth handle (domain/caddy.ts) is the sibling
 * gate — both are required (the qr-mint endpoints are otherwise reachable
 * through @liv).
 *
 * Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED -- this
 * file lives in livinityd, NOT in liv/packages/core/.
 */
import type {Request, Response} from 'express'
import type {Redis} from 'ioredis'

const AIONUI_LOOPBACK = 'http://127.0.0.1:3020'

export function makeLivLoginHandler(
	redis: Redis,
	verifySession: (token: string) => Promise<unknown | null>,
) {
	return async function livLoginHandler(req: Request, res: Response): Promise<void> {
		// Phase 262-01 (LIVOS-041) — auth gate FIRST, outside the try below:
		// the catch-all failure redirect to /liv/ must never fire for an
		// unauthenticated caller (it would hand them AionUi's login surface).
		const token = req.cookies?.LIVINITY_SESSION
		const session = token ? await verifySession(token).catch(() => null) : null
		if (!session) {
			res.status(401).json({error: 'unauthorized'})
			return
		}

		try {
			// Honor feature flag (default ON when missing or non-'false')
			const flagValue = await redis.get('liv:config:liv_ai_autologin_enabled')
			const enabled = flagValue !== 'false'

			if (!enabled) {
				res.redirect(302, '/liv/')
				return
			}

			// Step 1: Mint qr-token
			const qrMintRes = await fetch(`${AIONUI_LOOPBACK}/api/webui/generate-qr-token`, {method: 'POST'})
			if (!qrMintRes.ok) throw new Error(`qr-token mint failed: HTTP ${qrMintRes.status}`)
			const qrMintJson = (await qrMintRes.json()) as {success: boolean; data?: {token: string; expires_at_ms: number}}
			const qrToken = qrMintJson?.data?.token
			if (!qrToken) throw new Error(`qr-token mint returned no token: ${JSON.stringify(qrMintJson)}`)

			// Step 2: Exchange for session JWT (capture Set-Cookie)
			const loginRes = await fetch(`${AIONUI_LOOPBACK}/api/auth/qr-login`, {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({qr_token: qrToken}),
			})
			if (!loginRes.ok) throw new Error(`qr-login failed: HTTP ${loginRes.status}`)
			const setCookie = loginRes.headers.get('set-cookie')
			if (!setCookie) throw new Error('qr-login returned no Set-Cookie header')

			// Forward the AionUi Set-Cookie to the browser unchanged
			res.setHeader('Set-Cookie', setCookie)
			res.redirect(302, '/liv/')
		} catch (e) {
			// On failure, still redirect to /liv/ so the operator sees the
			// AionUi login UI rather than a 500. Log for diagnosis.
			// eslint-disable-next-line no-console
			console.warn('[liv-login] auto-login failed:', e instanceof Error ? e.message : e)
			res.redirect(302, '/liv/')
		}
	}
}
