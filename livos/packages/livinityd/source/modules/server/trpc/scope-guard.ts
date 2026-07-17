/**
 * Phase 335 (ROLE-01/02, D-335-2/D-335-4) — scoped-admin + app-operator guards.
 *
 * Plain-async tRPC middlewares (audit-middleware / step-up-guard discipline;
 * NOT t.middleware(), so no import cycle with trpc.ts).
 *
 * Semantics (D-335-2), all FAIL-CLOSED:
 *   - full admin (role === 'admin')      → passes every scope (admin ⊇ scopes)
 *   - legacySingleUser (explicit flag)   → passes (admin-equivalent, mirrors
 *     requireRole's Phase 256-04 contract — a no-DB box has nobody to delegate to)
 *   - member holding the admin_scopes row → passes
 *   - anyone else / no currentUser / DB error → FORBIDDEN
 *
 * Grants are read from PG per request (never JWT-embedded), so a revoked scope
 * dies on the holder's very next request — no stale-privilege window.
 */

import {TRPCError} from '@trpc/server'

import {type Context} from './context.js' // type-only → no runtime cycle with trpc.ts
import {hasAdminScope, isAppOperator, type AdminScope} from '../../database/admin-grants.js'

const scopeDenied = (scope: string) =>
	new TRPCError({code: 'FORBIDDEN', message: `This action requires the ${scope} scope`})

/**
 * Inline assertion form — for routes that need the check mid-branch.
 * Throws FORBIDDEN unless the caller is admin / legacy / holds the scope.
 */
export async function assertAdminScope(ctx: Context, scope: AdminScope): Promise<void> {
	if (!ctx.currentUser) {
		if (ctx.legacySingleUser === true) return
		throw new TRPCError({code: 'FORBIDDEN', message: 'Authentication required'})
	}
	if (ctx.currentUser.role === 'admin') return
	let held = false
	try {
		held = await hasAdminScope(ctx.currentUser.id, scope)
	} catch {
		// DB error → fail closed (no privilege can be proven).
		throw scopeDenied(scope)
	}
	if (!held) throw scopeDenied(scope)
}

/**
 * Middleware factory for whole-procedure gating — composed in trpc.ts as
 * `privateProcedure.use(requireScope(s)).use(auditAdminAction)` so scope-holder
 * MUTATIONS are audited exactly like admin actions.
 */
export const requireScope = (scope: AdminScope) => {
	return async (opts: {ctx: Context; next: () => Promise<any>}) => {
		await assertAdminScope(opts.ctx, scope)
		return opts.next()
	}
}

/**
 * Boolean form for routes with FALL-THROUGH alternatives (e.g. shareApp also
 * honors effective-full access): true for admin / legacy / scope-holder,
 * false on anything else INCLUDING a DB error — never throws.
 */
export async function holdsScopeOrAdmin(ctx: Context, scope: AdminScope): Promise<boolean> {
	if (!ctx.currentUser) return ctx.legacySingleUser === true
	if (ctx.currentUser.role === 'admin') return true
	try {
		return await hasAdminScope(ctx.currentUser.id, scope)
	} catch {
		return false
	}
}

/**
 * Middleware admitting ANY of the listed scopes (admin/legacy always pass).
 * Used for the shared READ surface (user/group lists) that both the
 * read-only-admin viewer and the share-admin manager need to render their UI.
 */
export const requireAnyScope = (scopes: readonly AdminScope[]) => {
	return async (opts: {ctx: Context; next: () => Promise<any>}) => {
		for (const scope of scopes) {
			if (await holdsScopeOrAdmin(opts.ctx, scope)) return opts.next()
		}
		// currentUser may exist without any scope, or be absent entirely —
		// one denial for both (no scope-membership oracle beyond FORBIDDEN).
		throw scopeDenied(scopes.join(' or '))
	}
}

/**
 * Per-app operator assertion (D-335-4): admin / legacy pass; otherwise the
 * caller must hold an app_operators row FOR THIS appId (an operator of app A
 * holds nothing for app B). Routes may compose this with their own
 * getEffectiveAppAccess checks (e.g. full-access grantees) — this helper only
 * answers the operator question, fail-closed.
 */
export async function assertAppOperatorAccess(ctx: Context, appId: string): Promise<void> {
	if (!ctx.currentUser) {
		if (ctx.legacySingleUser === true) return
		throw new TRPCError({code: 'FORBIDDEN', message: 'Authentication required'})
	}
	if (ctx.currentUser.role === 'admin') return
	let operator = false
	try {
		operator = await isAppOperator(appId, ctx.currentUser.id)
	} catch {
		throw new TRPCError({code: 'FORBIDDEN', message: 'Operator access required'})
	}
	if (!operator) throw new TRPCError({code: 'FORBIDDEN', message: 'Operator access required'})
}

/**
 * Boolean form for mixed-path routes that fall through to OTHER grants
 * (effective-full access, per-user-instance ownership) instead of denying
 * outright. False on any failure — never throws.
 */
export async function isOperatorOrAdmin(ctx: Context, appId: string): Promise<boolean> {
	if (!ctx.currentUser) return ctx.legacySingleUser === true
	if (ctx.currentUser.role === 'admin') return true
	try {
		return await isAppOperator(appId, ctx.currentUser.id)
	} catch {
		return false
	}
}
