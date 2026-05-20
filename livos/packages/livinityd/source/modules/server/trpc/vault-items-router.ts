// Phase 171-04 — Vault Items lifecycle tRPC router (v38 D-V38-A/B/C/E).
//
// 7 procedures (list / get / create / update / move / archive / delete)
// wrap the Phase 171-02 ItemStore + Phase 171-03 tree-resolver via the
// `ctx.livinityd.itemStore` context field (populated by Plan 171-05 boot
// wire-up). All adminProcedure-gated (RBAC enforced by trpc.ts:35
// `requireRole('admin')`). All 7 paths registered in
// `httpOnlyPaths` (common.ts) so autosave-adjacent mutations survive
// `systemctl restart livos` mid-flight (memory pitfall B-12 / X-04 —
// same cluster as ccPty.* lines 530-534, agents.* line 291,
// chromeMaster.* line 481).
//
// Every input schema uses Zod `.strict()` — extra fields are rejected at
// the wire (T-171-04-02 mitigation). The `create` procedure additionally
// enforces type-discriminated field gating: `cwd` is project-only,
// `schedule` is agent-only, `ccSessionId` is chat-only — cross-type
// smuggling is rejected with BAD_REQUEST. The `update` procedure refuses
// `parentId` changes — those MUST flow through `move`, which threads
// through `validateMove()` (cycle / self / depth-hard-cap rejection
// with BAD_REQUEST; soft-cap returns ok + warn side-channel).
//
// `id`, `createdAt`, `updatedAt`, `archivedAt`, `schemaVersion`, `userId`
// are server-authoritative — none appear in any input schema (defense
// against caller-tampered immutable fields, T-171-04-02).
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f
// + D-09 luse-system-prompt.ts
// + Phase 162-01 vault-scaffolder.ts
// + Phase 162-02 agent-session.ts
// + Phase 166 cc-pty backend (READ-ONLY analog — cc-pty-router.ts shape
//   mirrored verbatim, but no Phase 166/168 file is modified by this plan)
// + Phase 168 cc-pty-router.ts (READ-ONLY analog)
// + Phase 169 vault-graph backend
// + Phase 171-01 types
// + Phase 171-02 ItemStore
// + Phase 171-03 tree-resolver
// all UNCHANGED. This NEW file owns the v38 vault.items.* tRPC surface only.

import {z} from 'zod'
import {TRPCError} from '@trpc/server'
import {adminProcedure, router} from './trpc.js'
import {validateMove} from '../../vault-items/index.js'
import type {Item, MoveValidation} from '../../vault-items/index.js'

// Item id shape — nanoid v7 alphabet plus underscore/dash. Same defensive
// posture as ItemStore.assertSafeId (item-store.ts:66). Length ≥ 20 to
// give the cheap regex enough entropy to reject obviously-bogus payloads
// (real UUID v7 ids are 36 chars; nanoid ids are ≥ 20).
const ID_RE = /^[0-9A-Za-z_-]{20,}$/

// Item type discriminator — matches types.ts `ItemType` literal union.
const TYPE_ENUM = z.enum(['project', 'agent', 'chat'])

// ── Zod input schemas ────────────────────────────────────────────────────

// `create` input — server-authoritative id/timestamps/userId are NOT
// accepted. Per-type extras (cwd / schedule / ccSessionId) are optional
// and additionally gated by an explicit cross-type check inside the
// procedure body (Zod can't easily express discriminated optionality
// without a union, but `.strict()` + the runtime gate gets us there).
const createInput = z
	.object({
		type: TYPE_ENUM,
		name: z.string().min(1).max(200),
		parentId: z.string().regex(ID_RE).nullable().optional(),
		cwd: z.string().optional(), // project only — router runtime-gates
		schedule: z.string().optional(), // agent only — router runtime-gates
		ccSessionId: z.string().optional(), // chat only — router runtime-gates
	})
	.strict()

// Shared single-id input for `get` / `archive` / `delete`.
const idOnly = z.object({id: z.string().regex(ID_RE)}).strict()

// `update` input — accepts a strict patch of mutable fields. Notably
// excludes id/type/createdAt/updatedAt/archivedAt/schemaVersion
// (server-authoritative). parentId IS technically valid in the patch
// schema (to keep the wire shape forgiving), but the procedure body
// rejects any parentId in the patch and forces the caller through
// `move` — see T-171-04-04 mitigation.
const updateInput = z
	.object({
		id: z.string().regex(ID_RE),
		patch: z
			.object({
				name: z.string().min(1).max(200).optional(),
				parentId: z.string().regex(ID_RE).nullable().optional(),
				pinned: z.boolean().optional(),
				cwd: z.string().optional(),
				schedule: z.string().optional(),
				ccSessionId: z.string().optional(),
			})
			.strict(),
	})
	.strict()

// `move` input — newParentId may be null (move to root) or a valid id.
const moveInput = z
	.object({
		id: z.string().regex(ID_RE),
		newParentId: z.string().regex(ID_RE).nullable(),
	})
	.strict()

// `list` input — optional filter; both fields optional, .strict() at the
// outer object so unknown filters are rejected. The whole input is
// optional (a bare `list()` call with no input is allowed).
const listInput = z
	.object({
		archived: z.boolean().optional(),
		parentId: z.string().regex(ID_RE).nullable().optional(),
	})
	.strict()
	.optional()

// ── Helper ────────────────────────────────────────────────────────────────

/**
 * Resolve the ItemStore from the tRPC context. Plan 171-05's boot
 * wire-up populates `ctx.livinityd.itemStore`; this plan ships the
 * router ahead of that wire-up and tolerates `undefined` by throwing
 * an internal-error so the UI surface fails loudly rather than
 * silently returning malformed results.
 */
function requireStore(ctx: any) {
	const store = ctx.livinityd?.itemStore
	if (!store) {
		throw new TRPCError({
			code: 'INTERNAL_SERVER_ERROR',
			message: 'itemStore not initialized',
		})
	}
	return store
}

// ── Router ────────────────────────────────────────────────────────────────

const vaultItemsRouter = router({
	list: adminProcedure.input(listInput).query(async ({ctx, input}) => {
		const store = requireStore(ctx)
		const items = await store.list(input ?? {})
		return {items}
	}),

	get: adminProcedure.input(idOnly).query(async ({ctx, input}) => {
		const store = requireStore(ctx)
		const item = await store.read(input.id)
		return {item}
	}),

	create: adminProcedure.input(createInput).mutation(async ({ctx, input}) => {
		const store = requireStore(ctx)
		// Type-discriminated field gating — cross-type smuggling rejected.
		// T-171-04-03 mitigation.
		if (input.type !== 'project' && input.cwd !== undefined) {
			throw new TRPCError({code: 'BAD_REQUEST', message: 'cwd is project-only'})
		}
		if (input.type !== 'agent' && input.schedule !== undefined) {
			throw new TRPCError({
				code: 'BAD_REQUEST',
				message: 'schedule is agent-only',
			})
		}
		if (input.type !== 'chat' && input.ccSessionId !== undefined) {
			throw new TRPCError({
				code: 'BAD_REQUEST',
				message: 'ccSessionId is chat-only',
			})
		}
		const item = await store.create(input)
		return {item}
	}),

	update: adminProcedure.input(updateInput).mutation(async ({ctx, input}) => {
		const store = requireStore(ctx)
		// parentId changes go through `move`, NOT `update` — guard. The Zod
		// schema accepts the field for shape forgiveness; the runtime gate
		// rejects it to force callers through the validated move path
		// (T-171-04-04 mitigation).
		if (input.patch.parentId !== undefined) {
			throw new TRPCError({
				code: 'BAD_REQUEST',
				message: 'parentId changes must use vault.items.move',
			})
		}
		const item = await store.update(input.id, input.patch)
		return {item}
	}),

	move: adminProcedure.input(moveInput).mutation(async ({ctx, input}) => {
		const store = requireStore(ctx)
		const items: Item[] = await store.list({})
		const validation: MoveValidation = validateMove(
			items,
			input.id,
			input.newParentId,
		)
		if (!validation.ok) {
			throw new TRPCError({
				code: 'BAD_REQUEST',
				message: 'move rejected: ' + validation.reason,
			})
		}
		const item = await store.update(input.id, {parentId: input.newParentId})
		return {item, warn: validation.warn ?? null}
	}),

	archive: adminProcedure.input(idOnly).mutation(async ({ctx, input}) => {
		const store = requireStore(ctx)
		const item = await store.archive(input.id)
		return {item}
	}),

	delete: adminProcedure.input(idOnly).mutation(async ({ctx, input}) => {
		const store = requireStore(ctx)
		const ok = await store.delete(input.id)
		return {ok}
	}),
})

export default vaultItemsRouter
