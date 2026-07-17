/**
 * Phase 334 (STEPUP-01, D-334-2) — sudo-mode step-up grant middleware.
 *
 * A plain-async tRPC middleware (mirrors auditAdminAction in
 * security-audit/audit-middleware.ts; NOT t.middleware(), so there is no import
 * cycle with trpc.ts). Composed AFTER requireRole('admin') + auditAdminAction
 * on stepUpAdminProcedure, so a non-admin fails on the role gate first and the
 * audit trail still records the (denied) attempt.
 *
 * FAIL-CLOSED (D-334-5): a missing / expired / cross-user / malformed grant
 * REFUSES the sensitive action with UNAUTHORIZED + the machine-readable
 * STEP_UP_REQUIRED message the UI's useStepUp() hook keys on (334-03: catch →
 * open the re-auth modal → mint the grant → retry). The grant NEVER substitutes
 * for the session: this guard runs strictly on top of isAuthenticated /
 * requireRole and touches neither.
 *
 * Transport note: the grant rides the LIVINITY_STEPUP cookie, which only
 * exists on an HTTP request (ctx.request). A WS call has no request object →
 * fails closed here — every gated route path MUST therefore be registered in
 * httpOnlyPaths (common.ts) so the typed client sends it over HTTP with fresh
 * cookies.
 */

import {TRPCError} from '@trpc/server'

import {type Context} from './context.js' // type-only → no runtime cycle with trpc.ts
import {STEPUP_COOKIE_NAME} from '../../stepup/constants.js'

/** Machine-readable denial the UI keys on to open the step-up modal (334-03). */
export const STEP_UP_REQUIRED = 'STEP_UP_REQUIRED'

const stepUpRequired = () => new TRPCError({code: 'UNAUTHORIZED', message: STEP_UP_REQUIRED})

/**
 * Inline fail-closed grant assertion for mixed-path routes (apps.uninstall's
 * admin/global branch) where only ONE branch of a procedure is sensitive.
 * Throws UNAUTHORIZED/STEP_UP_REQUIRED unless the request carries a valid,
 * unexpired LIVINITY_STEPUP grant bound to THIS user (aud livinityd-stepup +
 * userId match — a grant minted for user A never authorizes user B).
 */
export async function assertStepUpGrant(ctx: Context): Promise<void> {
	// No resolved DB user → nothing to bind a grant to (legacy single-user boxes
	// keep their route-local legacy gates; this guard is for DB-backed sessions).
	if (!ctx.currentUser) throw stepUpRequired()
	const cookie = ctx.request?.cookies?.[STEPUP_COOKIE_NAME]
	if (typeof cookie !== 'string' || cookie.length === 0) throw stepUpRequired()
	const server = ctx.server
	if (!server) throw stepUpRequired()
	let claims: {userId: string}
	try {
		claims = await server.verifyStepUpGrant(cookie)
	} catch {
		// Signature / expiry / audience / shape failure — one opaque denial.
		throw stepUpRequired()
	}
	if (claims.userId !== ctx.currentUser.id) throw stepUpRequired()
}

/**
 * Middleware form for whole-procedure gating (stepUpAdminProcedure in trpc.ts).
 */
export const requireStepUpGrant = async (opts: {ctx: Context; next: () => Promise<any>}) => {
	await assertStepUpGrant(opts.ctx)
	return opts.next()
}
