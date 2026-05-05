/**
 * Phase 85 — UI Slice — agents tRPC router (v32 milestone Wave 2).
 *
 * Consumes the Wave 1 `agents-repo.ts` API surface (locked) via the
 * database/index.ts barrel re-export. Eight procedures, all `privateProcedure`-
 * based: list/get/create/update/delete/publish/unpublish/clone.
 *
 *   - agents.list      query    — paginated grid for /agents page
 *   - agents.get       query    — single agent for /agents/:id editor
 *   - agents.create    mutation — "+ New Agent" CTA
 *   - agents.update    mutation — debounced autosave from editor
 *   - agents.delete    mutation — delete-button confirm
 *   - agents.publish   mutation — Marketplace publish toggle (publish path)
 *   - agents.unpublish mutation — Marketplace publish toggle (unpublish path)
 *   - agents.clone     mutation — Clone-source-into-library (used by P86 marketplace)
 *
 * Multi-user privacy:
 *   - Per-user list returns own rows + system seeds (user_id IS NULL) when
 *     `includePublic: true` is supplied (default true on the UI list call so
 *     the 5 v32 system seeds always appear).
 *   - Update / delete / publish / unpublish enforce ownership at the SQL
 *     layer (user_id = $userId filter inside the repo). System seeds (NULL
 *     user_id) are intentionally immutable from this API surface — the repo
 *     returns null and we surface NOT_FOUND.
 *   - get() is permissive: returns the row when user owns it OR when it is
 *     a system seed OR when it is marketplace-published. The UI uses
 *     `agent.userId === currentUser.id` to gate edit affordances.
 *   - clone source must satisfy is_public=TRUE OR user_id IS NULL (enforced
 *     in the repo via the source-select WHERE clause).
 *
 * httpOnlyPaths discipline (memory pitfall B-12 / X-04):
 *   All 8 procedure paths are added to `server/trpc/common.ts` httpOnlyPaths.
 *   This routes them through Express HTTP instead of WebSocket so:
 *     - Mutations don't silently hang on a half-broken WS after deploy
 *       restart (autosave is timing-sensitive)
 *     - List is the page-render dependency; HTTP avoids handshake-delay
 *       flicker
 *   Precedent: apiKeys.{create,list,revoke,listAll} (Phase 59 Plan 04),
 *   computerUse.{getStatus,startStandaloneSession,stopSession} (Phase 71-05).
 *
 * Defensive guards (T-V32-AGENT-UI mitigation):
 *   - Every mutation explicitly re-checks `ctx.currentUser` and throws
 *     UNAUTHORIZED if missing, mirroring api-keys/routes.ts:97-99.
 *   - All UUID inputs are zod-validated (.uuid()) at the procedure boundary
 *     so the underlying parameterized query never sees a malformed string.
 *   - getPool() may return null when DB is not yet initialized (boot edge
 *     case); list defaults to an empty page, get/mutations throw
 *     INTERNAL_SERVER_ERROR with a clear message.
 */

import {z} from 'zod'
import {TRPCError} from '@trpc/server'

import {privateProcedure, router} from './trpc.js'
import {
	getPool,
	listAgents,
	getAgent,
	createAgent,
	updateAgent,
	deleteAgent,
	cloneAgentToLibrary,
	setMarketplacePublished,
} from '../../database/index.js'

// ─── Input schemas ──────────────────────────────────────────────────────────

const modelTierSchema = z.enum(['haiku', 'sonnet', 'opus'])

const configuredMcpSchema = z.object({
	name: z.string().min(1).max(128),
	enabledTools: z.array(z.string()),
})

const agentpressToolsSchema = z.record(z.string(), z.boolean())

// Reasonable bounds on free-text fields. Schema column types are TEXT so
// the only hard limit is Postgres TEXT max (1 GB) which we don't want to
// expose. Match the values used by `agent_templates` (Phase 76) for
// consistency: name 100, description 1000.
const MAX_NAME_LEN = 100
const MAX_DESC_LEN = 1000
const MAX_PROMPT_LEN = 32_000 // ~8k tokens worth — generous for system prompts
const MAX_TAGS = 20

const listInput = z
	.object({
		search: z.string().trim().max(200).optional(),
		sort: z.enum(['name', 'created_at', 'updated_at', 'download_count']).optional(),
		order: z.enum(['asc', 'desc']).optional(),
		limit: z.number().int().min(1).max(200).optional(),
		offset: z.number().int().min(0).optional(),
		// Default true so the UI grid always sees the 5 v32 system seeds.
		includePublic: z.boolean().optional().default(true),
	})
	.optional()

const getInput = z.object({
	agentId: z.string().uuid(),
})

const createInput = z.object({
	name: z.string().trim().min(1).max(MAX_NAME_LEN),
	description: z.string().max(MAX_DESC_LEN).optional(),
	systemPrompt: z.string().max(MAX_PROMPT_LEN).optional(),
	modelTier: modelTierSchema.optional(),
	configuredMcps: z.array(configuredMcpSchema).optional(),
	agentpressTools: agentpressToolsSchema.optional(),
	avatar: z.string().max(8).nullable().optional(), // emoji is 1-4 codepoints typically
	avatarColor: z.string().max(32).nullable().optional(), // hex like #aabbcc or oklch(...)
	isDefault: z.boolean().optional(),
	tags: z.array(z.string().max(64)).max(MAX_TAGS).optional(),
})

const updatePartialSchema = z
	.object({
		name: z.string().trim().min(1).max(MAX_NAME_LEN).optional(),
		description: z.string().max(MAX_DESC_LEN).optional(),
		systemPrompt: z.string().max(MAX_PROMPT_LEN).optional(),
		modelTier: modelTierSchema.optional(),
		configuredMcps: z.array(configuredMcpSchema).optional(),
		agentpressTools: agentpressToolsSchema.optional(),
		avatar: z.string().max(8).nullable().optional(),
		avatarColor: z.string().max(32).nullable().optional(),
		isDefault: z.boolean().optional(),
		isPublic: z.boolean().optional(),
		tags: z.array(z.string().max(64)).max(MAX_TAGS).optional(),
	})
	// Reject empty patches at the boundary so we don't waste a round trip.
	.refine((obj) => Object.keys(obj).length > 0, {
		message: 'partial must contain at least one field',
	})

const updateInput = z.object({
	agentId: z.string().uuid(),
	partial: updatePartialSchema,
})

const deleteInput = z.object({
	agentId: z.string().uuid(),
})

const publishInput = z.object({
	agentId: z.string().uuid(),
})

const cloneInput = z.object({
	sourceAgentId: z.string().uuid(),
})

// ─── Helpers ────────────────────────────────────────────────────────────────

function requirePool() {
	const pool = getPool()
	if (!pool) {
		throw new TRPCError({
			code: 'INTERNAL_SERVER_ERROR',
			message: 'Database not initialized',
		})
	}
	return pool
}

function requireUser(ctx: {currentUser?: {id: string; username: string; role: string}}) {
	if (!ctx.currentUser) {
		throw new TRPCError({code: 'UNAUTHORIZED', message: 'No authenticated user'})
	}
	return ctx.currentUser
}

// ─── Router definition ──────────────────────────────────────────────────────

const agentsRouter = router({
	// ── list ──────────────────────────────────────────────────────────────
	// Returns rows owned by current user PLUS system seeds (user_id IS NULL)
	// PLUS marketplace-published rows (is_public = TRUE) when includePublic
	// is true (default). UI grid relies on this so the 5 v32 seeds are
	// visible to every user out-of-the-box.
	list: privateProcedure.input(listInput).query(async ({ctx, input}) => {
		const user = requireUser(ctx)
		const pool = getPool()
		// Defensive: empty page when DB not ready, lets the UI render its
		// loading-state-then-empty-state path cleanly.
		if (!pool) return {rows: [], total: 0}

		return listAgents(pool, user.id, {
			search: input?.search,
			sort: input?.sort,
			order: input?.order,
			limit: input?.limit ?? 50,
			offset: input?.offset ?? 0,
			includePublic: input?.includePublic ?? true,
		})
	}),

	// ── get ───────────────────────────────────────────────────────────────
	// Returns the agent when user owns it OR it is a system seed OR it is
	// marketplace-published. UI uses `agent.userId === currentUser.id` to
	// gate edit affordances downstream.
	get: privateProcedure.input(getInput).query(async ({ctx, input}) => {
		const user = requireUser(ctx)
		const pool = requirePool()
		const agent = await getAgent(pool, input.agentId, user.id)
		if (!agent) {
			throw new TRPCError({code: 'NOT_FOUND', message: 'Agent not found'})
		}
		return agent
	}),

	// ── create ────────────────────────────────────────────────────────────
	create: privateProcedure.input(createInput).mutation(async ({ctx, input}) => {
		const user = requireUser(ctx)
		const pool = requirePool()
		return createAgent(pool, user.id, {
			name: input.name,
			description: input.description,
			systemPrompt: input.systemPrompt,
			modelTier: input.modelTier,
			configuredMcps: input.configuredMcps,
			agentpressTools: input.agentpressTools,
			avatar: input.avatar,
			avatarColor: input.avatarColor,
			isDefault: input.isDefault,
			tags: input.tags,
		})
	}),

	// ── update ────────────────────────────────────────────────────────────
	// Powers the 500 ms debounced autosave from the editor. Repo enforces
	// `user_id = $userId` filter so a malicious client cannot patch another
	// user's row OR a system seed (user_id IS NULL) — both return null which
	// we surface as NOT_FOUND.
	update: privateProcedure.input(updateInput).mutation(async ({ctx, input}) => {
		const user = requireUser(ctx)
		const pool = requirePool()
		const updated = await updateAgent(pool, input.agentId, user.id, input.partial)
		if (!updated) {
			throw new TRPCError({
				code: 'NOT_FOUND',
				message: 'Agent not found or you do not have permission to edit it',
			})
		}
		return updated
	}),

	// ── delete ────────────────────────────────────────────────────────────
	// Idempotent — repo returns false when nothing matched. We surface that
	// as `{deleted: false}` instead of throwing so a double-click on the
	// confirm doesn't error the second invocation.
	delete: privateProcedure.input(deleteInput).mutation(async ({ctx, input}) => {
		const user = requireUser(ctx)
		const pool = requirePool()
		const deleted = await deleteAgent(pool, input.agentId, user.id)
		return {deleted}
	}),

	// ── publish ───────────────────────────────────────────────────────────
	// Sets is_public = TRUE and stamps marketplace_published_at = NOW() via
	// the repo's setMarketplacePublished helper. Ownership-scoped (returns
	// null for non-owner / system seed → NOT_FOUND).
	publish: privateProcedure.input(publishInput).mutation(async ({ctx, input}) => {
		const user = requireUser(ctx)
		const pool = requirePool()
		const agent = await setMarketplacePublished(pool, input.agentId, user.id, true)
		if (!agent) {
			throw new TRPCError({
				code: 'NOT_FOUND',
				message: 'Agent not found or you do not have permission to publish it',
			})
		}
		return agent
	}),

	// ── unpublish ─────────────────────────────────────────────────────────
	// Inverse of publish: clears marketplace_published_at + sets
	// is_public = FALSE. Same ownership semantics.
	unpublish: privateProcedure.input(publishInput).mutation(async ({ctx, input}) => {
		const user = requireUser(ctx)
		const pool = requirePool()
		const agent = await setMarketplacePublished(pool, input.agentId, user.id, false)
		if (!agent) {
			throw new TRPCError({
				code: 'NOT_FOUND',
				message: 'Agent not found or you do not have permission to unpublish it',
			})
		}
		return agent
	}),

	// ── clone ─────────────────────────────────────────────────────────────
	// Clone-source-into-library. Source must be public (is_public=TRUE) OR a
	// system seed (user_id IS NULL) — the repo enforces this. Bumps
	// download_count on the source as a side effect. Used by P86 marketplace
	// "Add to Library" CTA and (optionally) by /agents grid as a "duplicate"
	// affordance.
	clone: privateProcedure.input(cloneInput).mutation(async ({ctx, input}) => {
		const user = requireUser(ctx)
		const pool = requirePool()
		const cloned = await cloneAgentToLibrary(pool, input.sourceAgentId, user.id)
		if (!cloned) {
			throw new TRPCError({
				code: 'NOT_FOUND',
				message: 'Source agent not found or is not publicly cloneable',
			})
		}
		return cloned
	}),
})

export default agentsRouter
