// Phase 177-03 — vault.inbox tRPC router.
//
// 4 adminProcedure-gated procedures:
//   listByAgent (query)  — per-agent inbox entries, newest-first
//   listGlobal  (query)  — cross-agent merged inbox, newest-first
//   markRead    (mutation) — sets frontmatter read:true in inbox file
//   get         (query)  — full body + metadata for one entry
//
// All 4 paths added to httpOnlyPaths in common.ts (Phase 177-03).
//
// Security:
//   - agentId validated with ID_RE (T-177-03-03: rejects shell metachar injection)
//   - filePath validated by InboxReader assertUnderItemsDir (T-177-03-01/02)
//   - All 4 procedures use adminProcedure (T-177-03-04)
//
// ctx.livinityd.inboxReader is populated by Plan 177-03 boot wire-up in
// livinityd/source/index.ts alongside ctx.livinityd.itemStore.

import {z} from 'zod'
import {TRPCError} from '@trpc/server'
import {adminProcedure, router} from './trpc.js'
import type {InboxReader} from '../../vault-items/inbox-reader.js'

// Item id shape — same as vault-items-router.ts (D-V38-B)
const ID_RE = /^[0-9A-Za-z_-]{20,}$/

// ── Helper ────────────────────────────────────────────────────────────────────

function requireInboxReader(ctx: any): InboxReader {
	const reader = ctx.livinityd?.inboxReader
	if (!reader) {
		throw new TRPCError({
			code: 'INTERNAL_SERVER_ERROR',
			message: 'inboxReader not initialized',
		})
	}
	return reader as InboxReader
}

// ── Router ────────────────────────────────────────────────────────────────────

const inboxRouter = router({
	listByAgent: adminProcedure
		.input(
			z
				.object({
					agentId: z.string().regex(ID_RE),
					unread: z.boolean().optional(),
				})
				.strict(),
		)
		.query(async ({ctx, input}) => {
			const reader = requireInboxReader(ctx)
			const entries = await reader.listByAgent(input.agentId, {unread: input.unread})
			return {entries}
		}),

	listGlobal: adminProcedure
		.input(
			z
				.object({
					unread: z.boolean().optional(),
					limit: z.number().int().positive().optional(),
				})
				.strict()
				.optional(),
		)
		.query(async ({ctx, input}) => {
			const reader = requireInboxReader(ctx)
			const entries = await reader.listGlobal(input ?? undefined)
			return {entries}
		}),

	markRead: adminProcedure
		.input(
			z
				.object({
					filePath: z.string().min(1),
				})
				.strict(),
		)
		.mutation(async ({ctx, input}) => {
			const reader = requireInboxReader(ctx)
			try {
				await reader.markRead(input.filePath)
				return {ok: true}
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : String(err)
				throw new TRPCError({code: 'BAD_REQUEST', message: msg})
			}
		}),

	get: adminProcedure
		.input(
			z
				.object({
					filePath: z.string().min(1),
				})
				.strict(),
		)
		.query(async ({ctx, input}) => {
			const reader = requireInboxReader(ctx)
			try {
				return await reader.getEntry(input.filePath)
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : String(err)
				throw new TRPCError({code: 'BAD_REQUEST', message: msg})
			}
		}),
})

export default inboxRouter
