// Phase 322 (IDENT-01) — groups CRUD. adminProcedure throughout: group membership is a host-wide identity surface consumed by OIDC claims/file-ACLs/app-sharing — same admin-only class as user role management.
// Phase 335 (ROLE-01, D-335-3) — bounded delegation: the READ pair
// (list/listMembers) admits scoped viewers; MEMBERSHIP mutations
// (addMember/removeMember) admit share-admin. Group CREATE/RENAME/DELETE stay
// hard adminProcedure (a share-admin manages membership of existing groups,
// never the group topology). Admin behavior on every swapped route is
// byte-identical (the scope gates admit role==='admin' first).

import {TRPCError} from '@trpc/server'
import {z} from 'zod'

import {router, adminProcedure, shareAdminProcedure, scopedAdminReadProcedure} from '../server/trpc/trpc.js'
import {getPool} from '../database/index.js'
import {
	createGroup,
	renameGroup,
	deleteGroup,
	listGroups,
	addGroupMember,
	removeGroupMember,
	listGroupMembers,
} from '../database/groups.js'
// Phase 335 review (CRITICAL-1/Finding-2) — a full-app-access group is an
// uninstall-/lifecycle-capable superset; a share-admin delegate must not manage
// its membership (self OR accomplice escalation).
import {groupHoldsFullAppAccess} from '../apps/app-access.js'
import type {Context} from '../server/trpc/context.js'

// Phase 335 — bound a share-admin DELEGATE's membership mutation. Admins and the
// legacy single-user admin-equivalent (no currentUser) bypass entirely
// (byte-identical to pre-335). A delegate (role==='member' holding share-admin)
// may NOT: (a) add/remove THEMSELVES (self-escalation into a privileged group),
// or (b) touch membership of a group that carries a `full` app_access grant
// (that would transitively hand uninstall/lifecycle to whoever they add).
// groupHoldsFullAppAccess fails closed (true) on a DB error → deny.
async function assertDelegateMayManageMembership(ctx: Context, groupId: string, targetUserId: string): Promise<void> {
	if (!ctx.currentUser || ctx.currentUser.role === 'admin') return
	if (targetUserId === ctx.currentUser.id) {
		throw new TRPCError({code: 'FORBIDDEN', message: 'Cannot change your own group membership'})
	}
	if (await groupHoldsFullAppAccess(groupId)) {
		throw new TRPCError({code: 'FORBIDDEN', message: 'This group grants full app access and is admin-managed'})
	}
}

// IN-02 (322-review): the groups DAO fails OPEN — it returns false/null both when a
// row genuinely does not exist AND when there is no DB configured at all (legacy
// single-user box). Probe getPool() so a DAO miss on a no-DB box surfaces the honest
// "groups require a database" (PRECONDITION_FAILED) instead of a misleading NOT_FOUND.
function noDbConfigured(): boolean {
	return !getPool()
}

// IN-02 (322-review): map the Postgres unique-violation on groups.name to a friendly
// CONFLICT instead of a generic INTERNAL_SERVER_ERROR. pg surfaces SQLSTATE on `.code`.
function isUniqueViolation(err: unknown): boolean {
	return (err as {code?: string} | null)?.code === '23505'
}

export default router({
	// List all groups (name-ordered). Wires GroupRow snake_case → camelCase.
	list: scopedAdminReadProcedure.query(async () => {
		const rows = await listGroups()
		return rows.map((g) => ({
			id: g.id,
			name: g.name,
			description: g.description,
			createdAt: g.created_at,
			updatedAt: g.updated_at,
		}))
	}),

	// Create a group. PRECONDITION_FAILED when no DB is configured (the DAO fails open
	// with null on a pure legacy single-user box); CONFLICT on a duplicate name.
	create: adminProcedure
		.input(
			z.object({
				name: z.string().trim().min(1).max(64),
				description: z.string().max(256).optional(),
			}),
		)
		.mutation(async ({input, ctx}) => {
			const g = await createGroup({
				name: input.name,
				description: input.description ?? null,
				createdBy: ctx.currentUser?.id ?? null,
			}).catch((err) => {
				if (isUniqueViolation(err)) {
					throw new TRPCError({code: 'CONFLICT', message: `A group named "${input.name}" already exists`})
				}
				throw err
			})
			if (!g) {
				throw new TRPCError({code: 'PRECONDITION_FAILED', message: 'Groups require a configured database'})
			}
			return {id: g.id}
		}),

	// Rename a group (+ optional description update). DAO-miss → NOT_FOUND (or
	// PRECONDITION_FAILED with no DB at all); duplicate name → CONFLICT.
	rename: adminProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				name: z.string().trim().min(1).max(64),
				description: z.string().max(256).optional(),
			}),
		)
		.mutation(async ({input}) => {
			const ok = await renameGroup(input.id, input.name, input.description ?? undefined).catch((err) => {
				if (isUniqueViolation(err)) {
					throw new TRPCError({code: 'CONFLICT', message: `A group named "${input.name}" already exists`})
				}
				throw err
			})
			if (!ok) {
				if (noDbConfigured()) {
					throw new TRPCError({code: 'PRECONDITION_FAILED', message: 'Groups require a configured database'})
				}
				throw new TRPCError({code: 'NOT_FOUND', message: 'Group not found'})
			}
			return {success: true}
		}),

	// Delete a group (members cascade via FK). DAO-miss → NOT_FOUND (or
	// PRECONDITION_FAILED with no DB at all).
	delete: adminProcedure
		.input(z.object({id: z.string().uuid()}))
		.mutation(async ({input}) => {
			const ok = await deleteGroup(input.id)
			if (!ok) {
				if (noDbConfigured()) {
					throw new TRPCError({code: 'PRECONDITION_FAILED', message: 'Groups require a configured database'})
				}
				throw new TRPCError({code: 'NOT_FOUND', message: 'Group not found'})
			}
			return {success: true}
		}),

	// List a group's members (username JOINed). Wires GroupMemberRow → camelCase.
	listMembers: scopedAdminReadProcedure
		.input(z.object({groupId: z.string().uuid()}))
		.query(async ({input}) => {
			const rows = await listGroupMembers(input.groupId)
			return rows.map((m) => ({
				userId: m.user_id,
				username: m.username,
				addedAt: m.added_at,
			}))
		}),

	// Add a user to a group (idempotent at the DAO). Records the acting admin.
	// Phase 335: share-admin scope may manage membership (bounded surface).
	addMember: shareAdminProcedure
		.input(z.object({groupId: z.string().uuid(), userId: z.string().uuid()}))
		.mutation(async ({input, ctx}) => {
			await assertDelegateMayManageMembership(ctx as Context, input.groupId, input.userId)
			await addGroupMember({
				groupId: input.groupId,
				userId: input.userId,
				addedBy: ctx.currentUser?.id ?? null,
			})
			return {success: true}
		}),

	// Remove a user from a group. DAO-miss (no such membership) → NOT_FOUND (or
	// PRECONDITION_FAILED with no DB at all).
	removeMember: shareAdminProcedure
		.input(z.object({groupId: z.string().uuid(), userId: z.string().uuid()}))
		.mutation(async ({input, ctx}) => {
			await assertDelegateMayManageMembership(ctx as Context, input.groupId, input.userId)
			const ok = await removeGroupMember(input.groupId, input.userId)
			if (!ok) {
				if (noDbConfigured()) {
					throw new TRPCError({code: 'PRECONDITION_FAILED', message: 'Groups require a configured database'})
				}
				throw new TRPCError({code: 'NOT_FOUND', message: 'Membership not found'})
			}
			return {success: true}
		}),
})
