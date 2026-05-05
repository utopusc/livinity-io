/**
 * Phase 86 V32-MKT — public agent marketplace tRPC router.
 *
 * Three procedures:
 *   - marketplace.list (publicProcedure query) — paginated, sortable,
 *       tag-filterable browse over agents WHERE is_public = TRUE.
 *       LEFT JOINs users to surface a creator label
 *       (display_name, falling back to "Liv Team" for system seeds where
 *       user_id IS NULL). Returns {rows, total, hasMore}.
 *   - marketplace.tags (publicProcedure query) — DISTINCT, sorted tag
 *       strings drawn from public agents. Drives the chip-strip filter.
 *   - marketplace.cloneToLibrary (privateProcedure mutation) — wraps
 *       agents-repo.cloneAgentToLibrary; returns the cloned Agent. The
 *       repo handles INCR of download_count atomically.
 *
 * D-PUBLIC-BROWSE: list + tags MUST NOT require auth — the marketplace is
 *   a discovery surface intended to be visible pre-login.
 * D-PROCEDURE-HTTP: all three procedure paths added to httpOnlyPaths in
 *   server/trpc/common.ts (cookie/header semantics survive WS reconnect
 *   after `systemctl restart livos` — pitfall B-12 / X-04).
 *
 * Wave 1 lock: this router CONSUMES agents-repo.ts via the database/index.ts
 *   barrel re-export — it does NOT modify the repo, which is owned by
 *   85-schema (shipped). It also does NOT touch agents-router.ts, which is
 *   owned by P85-UI (paralel sibling in Wave 2).
 *
 * Sort whitelist (D-MK-03):
 *   'newest'         → marketplace_published_at DESC NULLS LAST, created_at DESC
 *   'most_downloaded'→ download_count DESC, marketplace_published_at DESC NULLS LAST
 *   'popular'        → same as most_downloaded for v32 simplicity (the
 *                      "download_count*0.7 + recency*0.3" hybrid spec is
 *                      deferred to v33 when telemetry justifies tuning)
 *   default          → 'newest'
 */

import {z} from 'zod'
import {TRPCError} from '@trpc/server'

import {publicProcedure, privateProcedure, router} from './trpc.js'
import {cloneAgentToLibrary, getPool} from '../../database/index.js'
import type {Agent} from '../../database/index.js'

// ─── Input schemas ──────────────────────────────────────────────────────────

const SORT_VALUES = ['newest', 'popular', 'most_downloaded'] as const

const listInput = z
	.object({
		search: z.string().trim().max(200).optional(),
		sort: z.enum(SORT_VALUES).optional(),
		tag: z.string().trim().min(1).max(64).optional(),
		limit: z.number().int().min(1).max(50).optional(),
		offset: z.number().int().min(0).optional(),
	})
	.optional()

const cloneInput = z.object({
	sourceAgentId: z.string().uuid(),
})

// ─── Row → response shape ──────────────────────────────────────────────────

type MarketplaceRow = Agent & {creatorLabel: string}

type ListAgentRow = {
	id: string
	user_id: string | null
	name: string
	description: string
	system_prompt: string
	model_tier: 'haiku' | 'sonnet' | 'opus'
	configured_mcps: unknown
	agentpress_tools: unknown
	avatar: string | null
	avatar_color: string | null
	is_default: boolean
	is_public: boolean
	marketplace_published_at: Date | null
	download_count: number
	tags: string[]
	created_at: Date
	updated_at: Date
	creator_display_name: string | null
}

function rowToMarketplaceRow(row: ListAgentRow): MarketplaceRow {
	return {
		id: row.id,
		userId: row.user_id,
		name: row.name,
		description: row.description,
		systemPrompt: row.system_prompt,
		modelTier: row.model_tier,
		configuredMcps: Array.isArray(row.configured_mcps) ? (row.configured_mcps as never) : [],
		agentpressTools:
			row.agentpress_tools && typeof row.agentpress_tools === 'object'
				? (row.agentpress_tools as never)
				: {},
		avatar: row.avatar,
		avatarColor: row.avatar_color,
		isDefault: row.is_default,
		isPublic: row.is_public,
		marketplacePublishedAt: row.marketplace_published_at,
		downloadCount: row.download_count,
		tags: Array.isArray(row.tags) ? row.tags : [],
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		creatorLabel: row.creator_display_name ?? 'Liv Team',
	}
}

// ─── Sort whitelist (D-MK-03) ──────────────────────────────────────────────

function sortClause(sort: (typeof SORT_VALUES)[number] | undefined): string {
	switch (sort) {
		case 'most_downloaded':
		case 'popular':
			return 'a.download_count DESC, a.marketplace_published_at DESC NULLS LAST'
		case 'newest':
		default:
			return 'a.marketplace_published_at DESC NULLS LAST, a.created_at DESC'
	}
}

// ─── Router definition ──────────────────────────────────────────────────────

const marketplaceRouter = router({
	// ── list (public) ──────────────────────────────────────────────────────
	list: publicProcedure.input(listInput).query(async ({input}) => {
		const pool = getPool()
		if (!pool) {
			// Defensive: when the DB pool failed to initialize, return empty
			// instead of throwing. UI renders the empty-state cleanly. This
			// matches the precedent in agent-templates-repo / database/index.ts
			// where pool-null returns an empty list.
			return {rows: [] as MarketplaceRow[], total: 0, hasMore: false}
		}

		const search = input?.search?.trim()
		const sort = input?.sort
		const tag = input?.tag?.trim()
		const limit = Math.min(Math.max(input?.limit ?? 24, 1), 50)
		const offset = Math.max(input?.offset ?? 0, 0)

		const where: string[] = ['a.is_public = TRUE']
		const params: unknown[] = []
		let paramIdx = 0

		if (search && search.length > 0) {
			params.push(`%${search}%`)
			paramIdx++
			where.push(`(a.name ILIKE $${paramIdx} OR a.description ILIKE $${paramIdx})`)
		}

		if (tag && tag.length > 0) {
			params.push(tag)
			paramIdx++
			where.push(`$${paramIdx} = ANY(a.tags)`)
		}

		const whereSql = `WHERE ${where.join(' AND ')}`

		// Snapshot params for the count query before appending limit/offset
		// (matches the rationale in agents-repo.listAgents — params is by-
		// reference; copying defends against future code that mutates it).
		const countResult = await pool.query<{count: string}>(
			`SELECT COUNT(*)::text AS count FROM agents a ${whereSql}`,
			[...params],
		)
		const total = Number.parseInt(countResult.rows[0]?.count ?? '0', 10)

		params.push(limit)
		const limitIdx = ++paramIdx
		params.push(offset)
		const offsetIdx = ++paramIdx

		// LEFT JOIN users to project the creator label. NULL user_id (system
		// seeds) flows to NULL display_name → mapped to "Liv Team" in
		// rowToMarketplaceRow. We do NOT COALESCE in SQL because separating the
		// raw value from the display fallback keeps the type inference clean.
		const rowsResult = await pool.query<ListAgentRow>(
			`SELECT
				a.id, a.user_id, a.name, a.description, a.system_prompt, a.model_tier,
				a.configured_mcps, a.agentpress_tools, a.avatar, a.avatar_color,
				a.is_default, a.is_public, a.marketplace_published_at, a.download_count,
				a.tags, a.created_at, a.updated_at,
				u.display_name AS creator_display_name
			 FROM agents a
			 LEFT JOIN users u ON a.user_id = u.id
			 ${whereSql}
			 ORDER BY ${sortClause(sort)}
			 LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
			params,
		)

		const rows = rowsResult.rows.map(rowToMarketplaceRow)
		const hasMore = offset + rows.length < total

		return {rows, total, hasMore}
	}),

	// ── tags (public) ──────────────────────────────────────────────────────
	tags: publicProcedure.query(async () => {
		const pool = getPool()
		if (!pool) return [] as string[]

		// unnest expands TEXT[] tags into one row per tag; DISTINCT collapses
		// duplicates; ORDER BY makes the chip strip stable. Filter on
		// is_public so we only surface tags actually browsable in the
		// marketplace (no leakage of private agent tags via this query).
		const result = await pool.query<{tag: string}>(
			`SELECT DISTINCT unnest(tags) AS tag
			 FROM agents
			 WHERE is_public = TRUE
			 ORDER BY tag`,
		)

		// Defensive trim+filter — should be no-ops given the seed catalog and
		// the tag input validation, but cheap insurance against future seed
		// drift introducing whitespace.
		return result.rows.map((r) => r.tag).filter((t) => typeof t === 'string' && t.length > 0)
	}),

	// ── cloneToLibrary (private) ───────────────────────────────────────────
	// privateProcedure → caller MUST be authenticated. The repo enforces
	// "source must be public" via the WHERE clause inside cloneAgentToLibrary;
	// non-public sources return null → translated to NOT_FOUND here.
	cloneToLibrary: privateProcedure.input(cloneInput).mutation(async ({ctx, input}) => {
		// Defensive — privateProcedure should guarantee currentUser, but the
		// legacy single-user / corrupted-token edge cases warrant an explicit
		// gate (mirrors usage-tracking/routes.ts:36-42 + api-keys/routes.ts:97-99).
		if (!ctx.currentUser) {
			throw new TRPCError({code: 'UNAUTHORIZED', message: 'No authenticated user'})
		}

		const pool = getPool()
		if (!pool) {
			throw new TRPCError({code: 'INTERNAL_SERVER_ERROR', message: 'Database not initialized'})
		}

		const cloned = await cloneAgentToLibrary(pool, input.sourceAgentId, ctx.currentUser.id)

		if (!cloned) {
			throw new TRPCError({
				code: 'NOT_FOUND',
				message: 'Agent not found or not available in the marketplace',
			})
		}

		return cloned
	}),
})

export default marketplaceRouter
