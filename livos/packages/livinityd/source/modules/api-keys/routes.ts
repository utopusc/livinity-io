/**
 * Phase 59 Plan 04 — tRPC `apiKeys` router.
 *
 * Four procedures (FR-BROKER-B1-04):
 *   - create   (privateProcedure mutation) — mints a new `liv_sk_*` token,
 *               returns plaintext ONCE (Stripe parity per D-30-05). Subsequent
 *               `list` responses NEVER include plaintext or key_hash.
 *   - list     (privateProcedure query)    — returns the caller's own keys
 *               (INCLUDING revoked ones for history visibility). No plaintext,
 *               no key_hash — only id/key_prefix/name/created_at/last_used_at/
 *               revoked_at.
 *   - revoke   (privateProcedure mutation) — user-scoped (T-59-16); idempotent
 *               (revoked_at IS NULL guard). On success calls
 *               `apiKeyCache.invalidate(keyHash)` so the bearer middleware
 *               sees the revocation IMMEDIATELY (not 60s later — closes
 *               RESEARCH.md Pitfall 1 / Open Question 3 / T-59-21).
 *   - listAll  (adminProcedure query)      — cross-user view with
 *               `users.username` JOIN. Mirrors usage.getAll (Phase 44) — the
 *               admin twin pattern. T-59-17 mitigation: requireRole('admin')
 *               throws FORBIDDEN for non-admins.
 *
 * IMPORTANT — defense-in-depth source-string convention (routes.test.ts T6 +
 * common.test.ts Test 10 precedent for `apps.healthProbe`): each procedure
 * is bound to its `adminProcedure` / `privateProcedure` literal AT THE
 * ROUTER DEFINITION SITE so a future refactor that "demotes" `listAll` from
 * admin to private is caught by the regex `/listAll:\s*adminProcedure/`
 * against this file at unit-test time. DO NOT extract a procedure into a
 * `const xProc = ...` and bind only `xProc` to the router — the regex
 * would no longer see the gate literal and the test would silently pass
 * after a security regression.
 *
 * Audit (T-59-19 mitigation): every successful create/revoke fire-and-forgets
 * a `recordApiKeyEvent` call. The audit module REUSES `device_audit_log` with
 * sentinel `device_id='api-keys-system'` per Phase 46 precedent — no new
 * table, no migration. Failures are logged but never re-thrown so a PG
 * outage on the audit table never blocks a key mutation.
 *
 * Cache invalidation: routes call `getSharedApiKeyCache()` lazily at request
 * time. The Livinityd constructor calls `setSharedApiKeyCache(this.apiKeyCache)`
 * exactly once at boot so the routes see the SAME instance the bearer
 * middleware mounted onto `/u/:userId/v1` (otherwise revocation would only
 * clear a stale per-route cache and the middleware would still HIT positive
 * for up to 60s).
 *
 * httpOnlyPaths: all four entries are added to `server/trpc/common.ts` so
 * the React client routes mutations through HTTP (cookie/header semantics
 * survive WS reconnect after `systemctl restart livos` — pitfall B-12 / X-04
 * / RESEARCH.md Pitfall 5).
 */

import {z} from 'zod'
import {TRPCError} from '@trpc/server'

import {privateProcedure, adminProcedure, router} from '../server/trpc/trpc.js'
import {
	createApiKey,
	listApiKeysForUser,
	listAllApiKeys,
	revokeApiKey,
} from './database.js'
import {getSharedApiKeyCache} from './cache.js'
import {recordApiKeyEvent} from './events.js'

// ─── Input schemas ──────────────────────────────────────────────────────────

// CONTEXT.md schema: name min(1) max(64). Trim whitespace before length check
// so "   " (all-spaces) is rejected too.
const createInput = z.object({
	name: z.string().trim().min(1).max(64),
})

const revokeInput = z.object({
	id: z.string().uuid(),
})

const listAllInput = z
	.object({
		user_id: z.string().uuid().optional(),
	})
	.optional()

// ─── Router definition ──────────────────────────────────────────────────────
//
// Procedures are inlined into the router(...) literal so the source-string
// regex `/listAll:\s*adminProcedure/` (routes.test.ts T6) sees the actual
// gate at the router-definition site. Extracting to `const fooProc = ...`
// would defeat the defense-in-depth check.

const apiKeysRouter = router({
	// ── create ─────────────────────────────────────────────────────────────
	create: privateProcedure
		.input(createInput)
		.mutation(async ({ctx, input}) => {
			// Defensive — privateProcedure should guarantee currentUser, but
			// the legacy single-user / corrupted-token edge cases warrant an
			// explicit gate (mirrors usage-tracking/routes.ts:36-42).
			if (!ctx.currentUser) {
				throw new TRPCError({code: 'UNAUTHORIZED', message: 'No authenticated user'})
			}

			const {row, plaintext} = await createApiKey({
				userId: ctx.currentUser.id,
				name: input.name,
			})

			// Audit — fire-and-forget; failures logged inside recordApiKeyEvent
			// and never re-thrown to the caller (T-59-19 contract).
			void recordApiKeyEvent({
				action: 'create_key',
				keyId: row.id,
				userId: ctx.currentUser.id,
				username: ctx.currentUser.username,
				success: true,
			})

			// CONTEXT.md flat response shape. `oneTimePlaintextWarning` is an
			// advisory flag for the Phase 62 settings UI to render the
			// "save it now, you won't see it again" banner.
			return {
				id: row.id,
				plaintext,
				prefix: row.keyPrefix,
				name: row.name,
				created_at: row.createdAt,
				oneTimePlaintextWarning: true as const,
			}
		}),

	// ── list ───────────────────────────────────────────────────────────────
	list: privateProcedure.query(async ({ctx}) => {
		// Defensive empty result for the legacy/corrupted-token edge case
		// (mirrors usage-tracking/routes.ts:36-42). UI renders "no keys yet"
		// cleanly.
		if (!ctx.currentUser) return []

		const rows = await listApiKeysForUser(ctx.currentUser.id)
		// `database.ts SELECT_COLS` already excludes key_hash. Map to the
		// explicit public response shape so a future SELECT-cols change
		// can't silently leak new fields (T-59-18 belt-and-suspenders —
		// projection at TWO layers).
		return rows.map((r) => ({
			id: r.id,
			key_prefix: r.keyPrefix,
			name: r.name,
			created_at: r.createdAt,
			last_used_at: r.lastUsedAt,
			revoked_at: r.revokedAt,
		}))
	}),

	// ── revoke ─────────────────────────────────────────────────────────────
	revoke: privateProcedure
		.input(revokeInput)
		.mutation(async ({ctx, input}) => {
			if (!ctx.currentUser) {
				throw new TRPCError({code: 'UNAUTHORIZED', message: 'No authenticated user'})
			}

			// User-scope is enforced inside revokeApiKey via the SQL filter
			// `WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL`. T-59-16
			// mitigation: a malicious user passing another user's UUID will
			// hit rowCount=0 and get NOT_FOUND, identical to a bogus UUID.
			const result = await revokeApiKey({
				id: input.id,
				userId: ctx.currentUser.id,
			})

			if (result.rowCount === 0) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'API key not found or already revoked',
				})
			}

			// IMMEDIATE cache invalidation — closes RESEARCH.md Pitfall 1 /
			// Open Question 3 / T-59-21. Without this the bearer middleware
			// keeps HITting positive for up to 60s (positive TTL window)
			// after a revocation. Wave 4 integration test verifies the
			// round-trip (revoke → next request → 401) within 100ms.
			if (result.keyHash) {
				try {
					getSharedApiKeyCache().invalidate(result.keyHash)
				} catch (err) {
					// Cache singleton not registered (shouldn't happen in
					// production — Livinityd ctor calls setSharedApiKeyCache).
					// Log and proceed — the row is revoked in PG so the next
					// cache miss will re-fetch and see revoked_at IS NOT NULL
					// → 401.
					ctx.logger.error?.(
						'[api-keys.revoke] cache.invalidate threw — DB revocation is in effect, ' +
							'but the bearer middleware may serve cached positives for up to 60s',
						err,
					)
				}
			}

			// Audit — fire-and-forget (T-59-19 contract).
			void recordApiKeyEvent({
				action: 'revoke_key',
				keyId: input.id,
				userId: ctx.currentUser.id,
				username: ctx.currentUser.username,
				success: true,
			})

			return {
				id: input.id,
				revoked_at: new Date(),
			}
		}),

	// ── listAll (admin) ────────────────────────────────────────────────────
	// adminProcedure stack: privateProcedure → requireRole('admin'). Non-admins
	// receive TRPCError code='FORBIDDEN' from the role middleware before this
	// resolver runs (T-59-17 mitigation). The defense-in-depth source-string
	// check in routes.test.ts T6 ensures a future regression that demotes
	// this to privateProcedure is caught at unit-test time.
	listAll: adminProcedure.input(listAllInput).query(async ({input}) => {
		const rows = await listAllApiKeys({userId: input?.user_id})
		return rows.map((r) => ({
			id: r.id,
			user_id: r.userId,
			username: r.username,
			key_prefix: r.keyPrefix,
			name: r.name,
			created_at: r.createdAt,
			last_used_at: r.lastUsedAt,
			revoked_at: r.revokedAt,
		}))
	}),
})

export default apiKeysRouter
