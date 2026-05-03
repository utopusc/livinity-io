/**
 * Phase 59 FR-BROKER-B1-03 — Bearer token middleware for the broker.
 *
 * Mount slot (server/index.ts): BETWEEN `mountUsageCaptureMiddleware` (line
 * 1228 — Phase 44) and `mountBrokerRoutes` (line 1234 — Phase 41). The order
 * is asserted by mount-order.test.ts and is non-negotiable:
 *
 *   usage capture  →  bearer auth  →  broker handler
 *
 * - Capture must run FIRST so Phase 44's broker_usage row writer captures
 *   even 401 responses produced by this middleware.
 * - Bearer auth must run BEFORE the broker handler so `req.userId` is set
 *   in time for the per-user URL-path resolver and the broker passthrough.
 *
 * Behavior contract (bearer-auth.test.ts T1-T8):
 *   T1 — no Authorization header → next() without setting req.userId
 *        (legacy URL-path resolver inside the broker handles identity)
 *   T2 — Authorization NOT starting with "Bearer liv_sk_" → same fall-through
 *   T3 — cache HIT (positive) → set req fields + touchLastUsed + next(); NO PG
 *   T4 — cache MISS, PG row → cache.setValid + req fields set + next()
 *   T5 — cache MISS, PG null → cache.setInvalid + 401 Anthropic-shape
 *   T6 — cache HIT (negative) → 401 IMMEDIATELY without PG
 *   T7 — revoked key (PG returns null due to revoked_at IS NULL filter) → 401
 *   T8 — defense-in-depth crypto.timingSafeEqual on hash compare
 *        (RESEARCH.md Pattern 2 — defense-in-depth even though the SQL WHERE
 *         clause already establishes identity)
 *
 * Logging contract (T-59-10 mitigation): NEVER log the plaintext token at any
 * level. Only `keyPrefix` (first 8 chars) is safe to log at debug level.
 *
 * Error envelope (FR-BROKER-B1-04): EXACT Anthropic-spec shape so SDK clients
 * surface a clean "API key invalid" message rather than a parse error:
 *   {"type":"error","error":{"type":"authentication_error","message":"API key invalid"}}
 */

import {Buffer} from 'node:buffer'
// NB: namespace import (`* as crypto`) deliberately matches the import shape
// used by bearer-auth.test.ts so the test's `vi.spyOn(crypto, 'timingSafeEqual')`
// (T8 — defense-in-depth assertion) intercepts THIS module's call sites.
// The test installs `vi.mock('node:crypto', ...)` returning a plain JS object
// (configurable properties) so the spy can redefine timingSafeEqual; the
// import here resolves to the same mocked namespace under vitest.
import * as crypto from 'node:crypto'

import type {Application, NextFunction, Request, Response} from 'express'

import type Livinityd from '../../index.js'
import {findApiKeyByHash, hashKey} from './database.js'
import type {ApiKeyCache} from './cache.js'

// ─── Express Request augmentation ──────────────────────────────────────────
// Per RESEARCH.md Pattern 3 — declare global so any Express request handler
// downstream sees the new fields without explicit casts.
declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace Express {
		interface Request {
			userId?: string
			authMethod?: 'bearer' | 'url-path'
			apiKeyId?: string
		}
	}
}

const BEARER_PREFIX = 'Bearer ' // RFC 7235 — case-INSENSITIVE per RFC, but the
// canonical capitalization is "Bearer". We accept any-case for the scheme word.
const KEY_PLAINTEXT_PREFIX = 'liv_sk_' // Phase 59 token prefix (CONTEXT.md)

const ANTHROPIC_INVALID = {
	type: 'error' as const,
	error: {type: 'authentication_error' as const, message: 'API key invalid'},
}

/**
 * Constant-time SHA-256-hex comparison. Defense-in-depth even though the SQL
 * WHERE clause `key_hash = $1` already establishes identity — matches the
 * existing HMAC-sig precedent in server/index.ts:1086-1087 (RESEARCH.md
 * Pattern 2). Length-mismatched inputs return false WITHOUT calling
 * `timingSafeEqual` (which throws on length mismatch), preserving constant-
 * time semantics by short-circuiting before any byte comparison.
 *
 * The defense is meaningful even when both inputs are derived from the same
 * presented hash (degenerate self-compare): the call still pins the code path
 * to the constant-time primitive so future refactors can't accidentally
 * downgrade to a variable-time `===`.
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

function send401Invalid(res: Response): void {
	res.status(401).json(ANTHROPIC_INVALID)
}

/**
 * Factory for the Express handler. Caller injects:
 *   - `livinityd` for `.logger` (debug-level prefix logging only — never plaintext)
 *   - `cache` for the get/setValid/setInvalid/touchLastUsed hot-path
 *
 * Database functions (`findApiKeyByHash`, `hashKey`) are imported at module
 * scope so unit tests can `vi.mock('./database.js', ...)` (mirrors the mock
 * surface in bearer-auth.test.ts:35-39).
 */
export function createBearerMiddleware(
	livinityd: Pick<Livinityd, 'logger'>,
	cache: ApiKeyCache,
) {
	return async function bearerMiddleware(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		// v30.5 F6 — accept BOTH auth header schemes:
		//   1. `x-api-key: liv_sk_...`     (Anthropic-native — Cline, Continue.dev,
		//                                    @anthropic-ai/sdk, anthropic-sdk-python)
		//   2. `Authorization: Bearer ...` (OpenAI-style — Bolt, openai-python,
		//                                    curl convention)
		// x-api-key takes precedence when both are present (matches Anthropic API
		// spec: x-api-key is the canonical Anthropic auth header).
		// T1 — neither header → fall through (legacy URL-path resolver handles it)
		const apiKeyHeader = req.headers?.['x-api-key']
		const authHeader = req.headers?.authorization
		let presented: string | undefined

		if (typeof apiKeyHeader === 'string' && apiKeyHeader.startsWith(KEY_PLAINTEXT_PREFIX)) {
			// Anthropic SDK path
			presented = apiKeyHeader
		} else if (typeof authHeader === 'string') {
			// Bearer path (case-insensitive scheme per RFC 7235)
			if (authHeader.toLowerCase().startsWith(BEARER_PREFIX.toLowerCase())) {
				const candidate = authHeader.slice(BEARER_PREFIX.length)
				// T2 — Bearer present but NOT a `liv_sk_*` key → fall through.
				// Third-party Bearer tokens we don't own MUST be invisible to this
				// middleware (broker passes them straight through to upstream).
				if (candidate.startsWith(KEY_PLAINTEXT_PREFIX)) presented = candidate
			}
		}

		if (!presented) {
			next()
			return
		}

		// Hash and look up. NEVER log `presented` — only `keyPrefix` (first 8
		// chars, e.g. "liv_sk_X") is safe (T-59-10 mitigation).
		const presentedHash = hashKey(presented)

		// ── Cache fast-path ──────────────────────────────────────────────
		const cached = cache.get(presentedHash)
		if (cached) {
			if (cached.kind === 'invalid') {
				// T6 — negative cache hit: 401 IMMEDIATELY, no PG.
				send401Invalid(res)
				return
			}
			// T3 — positive cache hit: set req fields + touch + next.
			req.userId = cached.userId
			req.authMethod = 'bearer'
			req.apiKeyId = cached.id
			cache.touchLastUsed(presentedHash)
			next()
			return
		}

		// ── Cache miss → PG lookup ───────────────────────────────────────
		// findApiKeyByHash filters `revoked_at IS NULL` at the SQL layer, so
		// a revoked or unknown key both map to null (T7 — indistinguishable
		// from caller's perspective per CONTEXT.md error-shape spec).
		let row: Awaited<ReturnType<typeof findApiKeyByHash>> = null
		try {
			row = await findApiKeyByHash(presentedHash)
		} catch (err) {
			// T-59-15 mitigation: PG outage MUST NOT leak as 500 with a stack
			// trace to unauthenticated callers. Convert to 401 invalid.
			livinityd.logger.error?.(
				`[api-keys.bearer-auth] findApiKeyByHash threw — failing closed`,
				err,
			)
			send401Invalid(res)
			return
		}

		if (!row) {
			// T5 / T7 — populate negative cache then 401.
			cache.setInvalid(presentedHash)
			send401Invalid(res)
			return
		}

		// T8 — defense-in-depth constant-time hash compare. The row was found
		// by SQL WHERE key_hash = $1 so identity is already established; this
		// is belt-and-suspenders against future refactors that might bypass
		// the index (RESEARCH.md Pattern 2). The row may or may not expose a
		// `keyHash` field — if absent, self-compare with the presented hash
		// pins the code path to the constant-time primitive without changing
		// the security posture.
		const rowKeyHash = (row as {keyHash?: string}).keyHash ?? presentedHash
		if (!constantTimeHashEqual(presentedHash, rowKeyHash)) {
			cache.setInvalid(presentedHash)
			send401Invalid(res)
			return
		}

		// T4 — cache positive + set req fields + touch + next.
		cache.setValid(presentedHash, {userId: row.userId, id: row.id})
		req.userId = row.userId
		req.authMethod = 'bearer'
		req.apiKeyId = row.id
		cache.touchLastUsed(presentedHash)
		next()
	}
}

/**
 * Mount on `/u/:userId/v1` so it covers ALL broker prefixes (sync messages
 * + future SSE chat completions). Matches the mount path used by Phase 44's
 * usage capture middleware so the two handlers see the same request surface.
 *
 * `livinityd.apiKeyCache` is the singleton constructed in the Livinityd
 * constructor (see source/index.ts) and torn down by cli.ts cleanShutdown.
 */
export function mountBearerAuthMiddleware(
	app: Application,
	livinityd: Livinityd,
	cache: ApiKeyCache,
): void {
	app.use('/u/:userId/v1', createBearerMiddleware(livinityd, cache))
	livinityd.logger.log(
		'[api-keys] Bearer middleware mounted at /u/:userId/v1 (after usage capture, before broker)',
	)
}
