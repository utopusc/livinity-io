// Phase 322 (IDENT-01) — groups CRUD. adminProcedure throughout: group membership is a host-wide identity surface consumed by OIDC claims/file-ACLs/app-sharing — same admin-only class as user role management.

import {TRPCError} from '@trpc/server'
import {z} from 'zod'

import {router, adminProcedure} from '../server/trpc/trpc.js'
import {
	createGroup,
	renameGroup,
	deleteGroup,
	listGroups,
	addGroupMember,
	removeGroupMember,
	listGroupMembers,
} from '../database/groups.js'

export default router({
	// List all groups (name-ordered). Wires GroupRow snake_case → camelCase.
	list: adminProcedure.query(async () => {
		const rows = await listGroups()
		return rows.map((g) => ({
			id: g.id,
			name: g.name,
			description: g.description,
			createdAt: g.created_at,
			updatedAt: g.updated_at,
		}))
	}),

	// Create a group. Fails PRECONDITION_FAILED when no DB is configured (the DAO
	// fails open with null on a pure legacy single-user box).
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
			})
			if (!g) {
				throw new TRPCError({code: 'PRECONDITION_FAILED', message: 'Groups require a configured database'})
			}
			return {id: g.id}
		}),

	// Rename a group (+ optional description update). DAO-miss → NOT_FOUND.
	rename: adminProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				name: z.string().trim().min(1).max(64),
				description: z.string().max(256).optional(),
			}),
		)
		.mutation(async ({input}) => {
			const ok = await renameGroup(input.id, input.name, input.description ?? undefined)
			if (!ok) {
				throw new TRPCError({code: 'NOT_FOUND', message: 'Group not found'})
			}
			return {success: true}
		}),

	// Delete a group (members cascade via FK). DAO-miss → NOT_FOUND.
	delete: adminProcedure
		.input(z.object({id: z.string().uuid()}))
		.mutation(async ({input}) => {
			const ok = await deleteGroup(input.id)
			if (!ok) {
				throw new TRPCError({code: 'NOT_FOUND', message: 'Group not found'})
			}
			return {success: true}
		}),

	// List a group's members (username JOINed). Wires GroupMemberRow → camelCase.
	listMembers: adminProcedure
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
	addMember: adminProcedure
		.input(z.object({groupId: z.string().uuid(), userId: z.string().uuid()}))
		.mutation(async ({input, ctx}) => {
			await addGroupMember({
				groupId: input.groupId,
				userId: input.userId,
				addedBy: ctx.currentUser?.id ?? null,
			})
			return {success: true}
		}),

	// Remove a user from a group. DAO-miss (no such membership) → NOT_FOUND.
	removeMember: adminProcedure
		.input(z.object({groupId: z.string().uuid(), userId: z.string().uuid()}))
		.mutation(async ({input}) => {
			const ok = await removeGroupMember(input.groupId, input.userId)
			if (!ok) {
				throw new TRPCError({code: 'NOT_FOUND', message: 'Membership not found'})
			}
			return {success: true}
		}),
})
