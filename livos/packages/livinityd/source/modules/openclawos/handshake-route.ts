/**
 * Phase 203-05 — POST /openclawos/handshake Express route.
 *
 * D-203-12 / INV-203-10 / T-203-02 — Outer auth is the LIVINITY_SESSION JWT
 * cookie (or Bearer header). This route verifies the JWT, mints a 5-minute
 * Ed25519 openclaw device token (modules/openclawos/device-token.ts), and
 * returns it to the caller for forwarding to the openclaw gateway.
 *
 * Mirrors the inline `chatAuthGate` pattern used by /chat/:agentId
 * (index.ts ~line 1279) — Bearer header OR LIVINITY_SESSION cookie accepted,
 * mirroring the tRPC is-authenticated middleware's two-source token resolution.
 *
 * Response shape (200):
 *   {
 *     token: "<base64url-payload>.<base64url-signature>",
 *     expiresAt: 1700000300000,  // unix-ms
 *     sessionId: "abc123…"        // jti, opaque to the caller
 *   }
 *
 * Error shapes:
 *   401 {error: "unauthorized"}  — missing or invalid JWT
 *   500 {error: "mint_failed"}   — Ed25519 keypair unavailable (extreme edge)
 *
 * Sacred SHA preserved (INV-203-01 — this file is NEW, not on the 20-file list).
 */

import type {RequestHandler} from 'express'
import type {Redis} from 'ioredis'
import {mintToken} from './device-token.js'

type VerifyTokenFn = (token: string) => Promise<unknown>

export interface HandshakeRouteOptions {
	verifyToken: VerifyTokenFn
	redis?: Redis
	logger?: {
		info: (msg: string) => void
		warn?: (msg: string, err?: unknown) => void
		error?: (msg: string, err?: unknown) => void
	}
	/**
	 * Optional override for tests. When omitted, mintToken reads the userId
	 * from the verified JWT payload's `userId` field (or `'admin'` for legacy
	 * single-user tokens).
	 */
	resolveUserId?: (verifiedPayload: unknown) => string
}

/**
 * Default userId resolver: prefer the multi-user `userId` claim; fall back to
 * the legacy single-user shape (just `{loggedIn: true}` from jwt.ts) by
 * pinning to `'admin'`. This matches the rest of livinityd's downstream
 * behaviour where legacy tokens act as the admin user.
 */
function defaultResolveUserId(payload: unknown): string {
	if (payload && typeof payload === 'object') {
		const p = payload as Record<string, unknown>
		if (typeof p['userId'] === 'string' && p['userId'].length > 0) {
			return p['userId']
		}
	}
	return 'admin'
}

/**
 * Build the Express RequestHandler for POST /openclawos/handshake.
 */
export function createHandshakeRouteHandler(opts: HandshakeRouteOptions): RequestHandler {
	const resolveUserId = opts.resolveUserId ?? defaultResolveUserId

	const handler: RequestHandler = async (req, res) => {
		try {
			// Two-source token resolution (Bearer header OR LIVINITY_SESSION cookie),
			// mirroring chatAuthGate in source/index.ts.
			let token = req.headers.authorization?.split(' ')[1]
			if (!token) {
				const cookies = (req as unknown as {cookies?: {LIVINITY_SESSION?: string}}).cookies
				token = cookies?.LIVINITY_SESSION
			}
			if (!token) {
				res.status(401).json({error: 'unauthorized'})
				return
			}

			let verifiedPayload: unknown
			try {
				verifiedPayload = await opts.verifyToken(token)
			} catch {
				res.status(401).json({error: 'unauthorized'})
				return
			}

			const userId = resolveUserId(verifiedPayload)
			if (!userId) {
				res.status(401).json({error: 'unauthorized'})
				return
			}

			let minted: Awaited<ReturnType<typeof mintToken>>
			try {
				const mintOpts = opts.redis ? {redis: opts.redis} : {}
				minted = await mintToken(userId, mintOpts)
			} catch (mintErr) {
				opts.logger?.error?.('[openclawos-handshake] mint failed', mintErr)
				res.status(500).json({error: 'mint_failed'})
				return
			}

			opts.logger?.info(
				`[openclawos-handshake] userId=${userId} jti=${minted.jti.slice(0, 8)}… expiresAt=${new Date(minted.expiresAt).toISOString()}`,
			)

			res.status(200).json({
				token: minted.token,
				expiresAt: minted.expiresAt,
				sessionId: minted.jti,
			})
		} catch (unexpectedErr) {
			opts.logger?.error?.('[openclawos-handshake] unexpected error', unexpectedErr)
			res.status(500).json({error: 'internal'})
		}
	}

	return handler
}
