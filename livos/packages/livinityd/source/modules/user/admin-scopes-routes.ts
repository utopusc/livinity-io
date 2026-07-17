// Phase 335 (ROLE-01, D-335-6/7) — adminScopes.* grant-management namespace.
//
// Grant/revoke/list are hard adminProcedure (delegation is itself a box-admin
// power, D-335-7 — auto-audited like every admin mutation); `my` is
// privateProcedure so ANY session can ask "which scopes do I hold" to drive
// UI capability hints (leaks only the caller's OWN grants).

import {TRPCError} from '@trpc/server'
import {z} from 'zod'

import {router, adminProcedure, privateProcedure} from '../server/trpc/trpc.js'
import {findUserById, getPool} from '../database/index.js'
import {
	ADMIN_SCOPES,
	grantAdminScope,
	revokeAdminScope,
	listAllAdminScopes,
	listAdminScopesForUser,
} from '../database/admin-grants.js'

const scopeEnum = z.enum(ADMIN_SCOPES)

export default router({
	// Every scope grant on the box (username JOINed) — drives the Users UI chips.
	list: adminProcedure.query(async () => {
		const rows = await listAllAdminScopes()
		return rows.map((r) => ({
			userId: r.user_id,
			username: r.username,
			scope: r.scope,
			grantedAt: r.granted_at,
		}))
	}),

	// Grant a scope to a user. Idempotent at the DAO. Granting to an admin is
	// rejected as pointless (admin already ⊇ every scope) to keep the grants
	// table an honest picture of DELEGATED privilege.
	grant: adminProcedure
		.input(z.object({userId: z.string().uuid(), scope: scopeEnum}))
		.mutation(async ({ctx, input}) => {
			if (!getPool()) {
				throw new TRPCError({code: 'PRECONDITION_FAILED', message: 'Scoped roles require a configured database'})
			}
			const target = await findUserById(input.userId)
			if (!target) throw new TRPCError({code: 'NOT_FOUND', message: 'User not found'})
			if (target.role === 'admin') {
				throw new TRPCError({code: 'BAD_REQUEST', message: 'Admins already hold every scope'})
			}
			await grantAdminScope({userId: input.userId, scope: input.scope, grantedBy: ctx.currentUser?.id ?? null})
			return {success: true}
		}),

	// Revoke a scope. Takes effect on the holder's NEXT request (grants are
	// PG-read per request — no session/token invalidation needed).
	revoke: adminProcedure
		.input(z.object({userId: z.string().uuid(), scope: scopeEnum}))
		.mutation(async ({input}) => {
			const removed = await revokeAdminScope(input.userId, input.scope)
			if (!removed) throw new TRPCError({code: 'NOT_FOUND', message: 'Grant not found'})
			return {success: true}
		}),

	// The CALLER's own scopes — UI capability hints ([] for admins too: the UI
	// derives admin power from role, not from scopes).
	my: privateProcedure.query(async ({ctx}) => {
		if (!ctx.currentUser) return []
		return listAdminScopesForUser(ctx.currentUser.id)
	}),
})
