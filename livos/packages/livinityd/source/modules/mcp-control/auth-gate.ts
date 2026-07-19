/**
 * Phase 346-02 (MCP-01, D-346-4 / T-346-05 / T-346-07 / T-346-08) — the
 * dedicated Express auth gate for the MCP control transport.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ZERO imports from the broker/subscription path (D-346-2). This gate
 * authenticates the liv_mcp_* transport ONLY. It NEVER touches is-authenticated.ts,
 * NEVER calls getAdminUser, and NEVER resolves against the full-admin LIV_API_KEY
 * env compare — a liv_mcp_ key is a bounded credential, not full admin
 * (T-346-07). The constant-time hash compare is a self-contained VERBATIM copy of
 * bearer-auth.ts's helper — it is deliberately NOT imported (api-keys/ is a
 * broker-fenced tree per the broker-zero-import guard).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Behavior contract (mirrors bearer-auth.ts T1-T8, but this is a DEDICATED gate,
 * so T1/T2 REJECT rather than fall through — there is no legacy path behind it):
 *   T1 — no Authorization AND no x-api-key header → 401
 *   T2 — header present but NOT a `liv_mcp_` prefix → 401
 *   T5 — PG lookup returns null (unknown key) → 401
 *   T7 — revoked key (findMcpControlKeyByHash returns null via revoked_at IS NULL
 *        filter) → 401, indistinguishable from unknown
 *   T8 — defense-in-depth crypto.timingSafeEqual hash compare; a length mismatch
 *        short-circuits to false WITHOUT throwing
 *   PG throw → fail-closed 401 (never a 500 stack to the caller)
 *   valid active key → req.mcpKeyId = row.id, req.mcpKeyPrefix = row.keyPrefix, next()
 *
 * Accepts BOTH `Authorization: Bearer liv_mcp_...` and `x-api-key: liv_mcp_...`
 * (MCP clients vary), mirroring bearer-auth's dual-scheme read; x-api-key wins
 * when both are present.
 *
 * Logging contract: NEVER log the plaintext token. Only keyPrefix (first 8 chars,
 * == 'liv_mcp_') is safe at debug level.
 *
 * Cache: OUT OF SCOPE for v1 (loopback-only, low RPS). Extension seam: a positive/
 * negative ApiKeyCache-style layer would slot in front of the PG lookup exactly
 * as bearer-auth.ts does; not needed until network exposure (deferred).
 */

import {Buffer} from 'node:buffer'
// NB: namespace import so auth-gate.test.ts can spy timingSafeEqual (T8),
// matching bearer-auth.ts's shape under the vi.mock('node:crypto', ...) rewrite.
import * as crypto from 'node:crypto'

import type {NextFunction, Request, Response} from 'express'

import {
	MCP_KEY_PLAINTEXT_PREFIX,
	findMcpControlKeyByHash,
	hashMcpControlKey,
} from './keys-database.js'

// ─── Express Request augmentation ────────────────────────────────────────────
// The gate attaches the resolved MCP key identity so downstream handlers (Plan
// 03) can surface it as the x-mcp-key-id attribution header on the loopback
// /trpc call. Distinct from api-keys' userId/apiKeyId (broker path).
declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace Express {
		interface Request {
			mcpKeyId?: string
			mcpKeyPrefix?: string
		}
	}
}

const BEARER_PREFIX = 'Bearer ' // RFC 7235 scheme word — matched case-insensitively.

interface MinimalLogger {
	debug?: (...args: unknown[]) => void
	error?: (...args: unknown[]) => void
}

const UNAUTHORIZED_BODY = {
	error: 'unauthorized',
	message: 'MCP control key invalid',
} as const

/**
 * Constant-time SHA-256-hex comparison. VERBATIM copy of bearer-auth.ts's helper
 * (T-346-08) — deliberately self-contained, NOT imported from the broker-fenced
 * api-keys/ tree. Length-mismatched inputs return false WITHOUT calling
 * timingSafeEqual (which throws on length mismatch), preserving constant-time
 * semantics by short-circuiting before any byte comparison.
 */
function constantTimeHashEqual(presentedHex: string, rowHex: string): boolean {
	if (presentedHex.length !== rowHex.length) return false
	try {
		const a = Buffer.from(presentedHex, 'hex')
		const b = Buffer.from(rowHex, 'hex')
		if (a.length !== b.length) return false
		return crypto.timingSafeEqual(a, b)
	} catch {
		return false
	}
}

function send401(res: Response): void {
	res.status(401).json(UNAUTHORIZED_BODY)
}

/**
 * Factory for the MCP control auth middleware. Caller injects a `logger`
 * (debug-level prefix logging only — NEVER plaintext). `findByHash` is injectable
 * for testing but defaults to the real DAO lookup (active-only, revoked_at IS
 * NULL), so unknown and revoked keys both collapse to null → 401 (T5/T7).
 */
export function createMcpControlAuthMiddleware(deps: {
	logger: MinimalLogger
	findByHash?: typeof findMcpControlKeyByHash
}) {
	const findByHash = deps.findByHash ?? findMcpControlKeyByHash
	const {logger} = deps

	return async function mcpControlAuthMiddleware(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		// Dual-scheme read (x-api-key wins), mirroring bearer-auth.ts.
		const apiKeyHeader = req.headers?.['x-api-key']
		const authHeader = req.headers?.authorization
		let presented: string | undefined

		if (
			typeof apiKeyHeader === 'string' &&
			apiKeyHeader.startsWith(MCP_KEY_PLAINTEXT_PREFIX)
		) {
			presented = apiKeyHeader
		} else if (typeof authHeader === 'string') {
			if (authHeader.toLowerCase().startsWith(BEARER_PREFIX.toLowerCase())) {
				const candidate = authHeader.slice(BEARER_PREFIX.length)
				if (candidate.startsWith(MCP_KEY_PLAINTEXT_PREFIX)) presented = candidate
			}
		}

		// T1 — no header at all. T2 — header present but wrong prefix (never set
		// `presented`). This is a DEDICATED gate: BOTH reject with 401, they do NOT
		// fall through (there is no legacy identity resolver behind this gate).
		if (!presented) {
			send401(res)
			return
		}

		// Hash then look up. NEVER log `presented` — only keyPrefix is safe.
		const presentedHash = hashMcpControlKey(presented)

		let row: Awaited<ReturnType<typeof findMcpControlKeyByHash>> = null
		try {
			row = await findByHash(presentedHash)
		} catch (err) {
			// PG outage MUST fail closed as a 401 — never leak a 500 stack to an
			// unauthenticated caller.
			logger.error?.(
				'[mcp-control.auth-gate] findMcpControlKeyByHash threw — failing closed',
				err,
			)
			send401(res)
			return
		}

		// T5 / T7 — unknown or revoked both map to null (active-only lookup).
		if (!row) {
			send401(res)
			return
		}

		// T8 — defense-in-depth constant-time compare. The row was found by SQL
		// WHERE key_hash = $1 so identity is already established; SELECT_COLS
		// excludes key_hash, so the row exposes no hash → self-compare pins the
		// code path to the constant-time primitive (belt-and-suspenders against a
		// future refactor that bypasses the index).
		const rowKeyHash = (row as {keyHash?: string}).keyHash ?? presentedHash
		if (!constantTimeHashEqual(presentedHash, rowKeyHash)) {
			send401(res)
			return
		}

		// Success — attach identity for downstream attribution (Plan 03).
		req.mcpKeyId = row.id
		req.mcpKeyPrefix = row.keyPrefix
		logger.debug?.(
			`[mcp-control.auth-gate] authenticated key ${row.keyPrefix} (id=${row.id})`,
		)
		next()
	}
}
