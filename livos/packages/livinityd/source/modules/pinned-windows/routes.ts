// Phase 131-02 V36-PIN-02 — pinned_windows tRPC router.
//
// Three procedures wrapping the DB CRUD in database/index.ts:
//   - list   (privateProcedure query)   — fetch the user's pinned shelf.
//   - upsert (privateProcedure mutation) — pin a new window or refresh
//                                          an existing pin's snapshot.
//   - delete (privateProcedure mutation) — unpin (also fired from
//                                          shelf chip "Close" + drag-off).
//
// All three are registered in `server/trpc/index.ts` under the
// `pinnedWindows` namespace and added to `httpOnlyPaths` in
// `server/trpc/common.ts` so mutations survive a `systemctl restart
// livos` (memory pitfall B-12 / X-04 — same rationale as the
// preferences / agents / webapp clusters).
//
// Per D-131-A: Postgres is the storage backend. The hard cap (16,
// D-131-F) is enforced server-side in upsertPinnedWindow.

import {z} from 'zod'

import {router, privateProcedure} from '../server/trpc/trpc.js'
import {
	deletePinnedWindow,
	listPinnedWindows,
	upsertPinnedWindow,
} from '../database/index.js'

const positionSchema = z.object({x: z.number(), y: z.number()})
const sizeSchema = z.object({width: z.number(), height: z.number()})

const upsertInput = z.object({
	windowId: z.string().min(1),
	appId: z.string().min(1),
	route: z.string(),
	title: z.string(),
	icon: z.string(),
	position: positionSchema,
	size: sizeSchema,
	positionInShelf: z.number().int().min(0).max(255).optional(),
})

export default router({
	list: privateProcedure.query(async ({ctx}) => {
		if (!ctx.currentUser) return []
		return listPinnedWindows(ctx.currentUser.id)
	}),

	upsert: privateProcedure
		.input(upsertInput)
		.mutation(async ({ctx, input}) => {
			if (!ctx.currentUser) return {ok: false as const, reason: 'no-user'}
			await upsertPinnedWindow(ctx.currentUser.id, input)
			return {ok: true as const}
		}),

	delete: privateProcedure
		.input(z.object({windowId: z.string().min(1)}))
		.mutation(async ({ctx, input}) => {
			if (!ctx.currentUser) return {ok: false as const, reason: 'no-user'}
			await deletePinnedWindow(ctx.currentUser.id, input.windowId)
			return {ok: true as const}
		}),
})
