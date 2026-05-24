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
import {readFileSync, existsSync} from 'node:fs'
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
	/**
	 * Phase 203 Hot-fix F2 2026-05-24 — path to openclaw.json. When set AND
	 * the file contains `gateway.auth.token`, the handshake returns that
	 * master token instead of minting a custom Ed25519 device token. This
	 * exists because openclaw upstream verifies device tokens against its
	 * OWN identity keypair (data/openclaw/identity/device.json), so the
	 * livinityd-minted Ed25519 token (device-token.ts) always fails as
	 * `device_token_mismatch` over WS. The master-token path uses
	 * openclaw's documented `gateway.auth.token` mechanism which IS verified
	 * upstream.
	 *
	 * Default: '/opt/livos/data/openclaw/openclaw.json' on Mini PC; tests
	 * override via this option.
	 */
	openclawConfigPath?: string
}

const DEFAULT_OPENCLAW_CONFIG_PATH = '/opt/livos/data/openclaw/openclaw.json'

/**
 * Phase 203 Hot-fix F2 — best-effort read of `gateway.auth.token` from
 * openclaw.json. Returns undefined on any failure (file missing, parse
 * error, key absent). Caller falls back to the legacy Ed25519 mint path.
 */
function readOpenclawMasterToken(configPath: string): string | undefined {
	try {
		if (!existsSync(configPath)) return undefined
		const raw = readFileSync(configPath, 'utf8')
		const parsed = JSON.parse(raw) as {gateway?: {auth?: {token?: unknown}}}
		const t = parsed?.gateway?.auth?.token
		return typeof t === 'string' && t.length > 0 ? t : undefined
	} catch {
		return undefined
	}
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

			// Phase 203 Hot-fix F2 2026-05-24 — prefer openclaw master token when
			// configured. The custom Ed25519 mint path was never accepted by
			// openclaw upstream (device_token_mismatch loop in operator UAT
			// 2026-05-24). The master token from openclaw.json bypasses the
			// device-pairing dance entirely — it's openclaw's documented "I am
			// the gateway operator" credential.
			const cfgPath = opts.openclawConfigPath ?? DEFAULT_OPENCLAW_CONFIG_PATH
			const masterToken = readOpenclawMasterToken(cfgPath)
			if (masterToken) {
				const oneHourMs = 60 * 60 * 1000
				const expiresAt = Date.now() + oneHourMs
				opts.logger?.info(
					`[openclawos-handshake] userId=${userId} mode=master-token expiresAt=${new Date(expiresAt).toISOString()}`,
				)
				// Hot-fix J 2026-05-24 — explicitly mark authMode=master so the
				// claw-client knows to ride this token in `auth: {token}`, NOT
				// `auth: {deviceToken}` (which openclaw `mode: token` rejects with
				// `device_token_mismatch` — operator UAT 2026-05-23/24).
				res.status(200).json({
					token: masterToken,
					expiresAt,
					sessionId: `master:${userId}`,
					authMode: 'master',
				})
				return
			}

			// Legacy Ed25519 mint path — kept for tests and any future flow that
			// re-introduces livinityd-side token verification (not currently used
			// by openclaw upstream — see Hot-fix F2 commentary above).
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
