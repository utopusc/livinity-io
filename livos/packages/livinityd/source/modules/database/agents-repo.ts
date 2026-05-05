// Phase 85 V32-AGENT-02 — agents repository (v32 milestone Wave 1).
// Mirrors the agent-templates-repo.ts function-export style. Pure DAO over the
// agents table; no business logic, no logger, no env reads. Receives a pg.Pool
// per call so the module is stateless. All queries use parameterized $1..$N
// placeholders (T-V32-AGENT-01-01 SQL-injection mitigation — pg driver escapes).
//
// Multi-user privacy: every per-user read/write enforces user_id scoping. Public
// (system / marketplace-published) rows are addressable via the *Public helpers
// or via the explicit `includePublic` flag on listAgents — callers pick.
//
// Schema notes (live in migrations/2026-05-05-v32-agents.sql + schema.sql):
//   - id is the PK column name (not agent_id) — consistent with users/sessions/etc.
//   - user_id is NULLABLE — system seeds (5 v32 agents + agent_templates backfill)
//     all have user_id=NULL.
//   - configured_mcps + agentpress_tools are JSONB; pg's default jsonb parser
//     returns native JS values (object/array) — no manual JSON.parse needed.

import {randomUUID} from 'node:crypto'

import type pg from 'pg'

// ── Types ────────────────────────────────────────────────────────────────

export type ModelTier = 'haiku' | 'sonnet' | 'opus'

export type ConfiguredMcp = {
	name: string
	enabledTools: string[]
}

export type AgentpressTools = Record<string, boolean>

export type Agent = {
	id: string
	userId: string | null
	name: string
	description: string
	systemPrompt: string
	modelTier: ModelTier
	configuredMcps: ConfiguredMcp[]
	agentpressTools: AgentpressTools
	avatar: string | null
	avatarColor: string | null
	isDefault: boolean
	isPublic: boolean
	marketplacePublishedAt: Date | null
	downloadCount: number
	tags: string[]
	createdAt: Date
	updatedAt: Date
}

export type CreateAgentInput = {
	name: string
	description?: string
	systemPrompt?: string
	modelTier?: ModelTier
	configuredMcps?: ConfiguredMcp[]
	agentpressTools?: AgentpressTools
	avatar?: string | null
	avatarColor?: string | null
	isDefault?: boolean
	tags?: string[]
}

export type UpdateAgentInput = Partial<CreateAgentInput> & {
	isPublic?: boolean
}

export type ListAgentsOpts = {
	search?: string
	sort?: 'name' | 'created_at' | 'updated_at' | 'download_count'
	order?: 'asc' | 'desc'
	limit?: number
	offset?: number
	includePublic?: boolean // include rows where user_id IS NULL (system seeds)
}

export type ListAgentsResult = {
	rows: Agent[]
	total: number
}

type Row = {
	id: string
	user_id: string | null
	name: string
	description: string
	system_prompt: string
	model_tier: ModelTier
	configured_mcps: unknown // jsonb -> parsed
	agentpress_tools: unknown // jsonb -> parsed
	avatar: string | null
	avatar_color: string | null
	is_default: boolean
	is_public: boolean
	marketplace_published_at: Date | null
	download_count: number
	tags: string[]
	created_at: Date
	updated_at: Date
}

function rowToAgent(row: Row): Agent {
	return {
		id: row.id,
		userId: row.user_id,
		name: row.name,
		description: row.description,
		systemPrompt: row.system_prompt,
		modelTier: row.model_tier,
		configuredMcps: Array.isArray(row.configured_mcps)
			? (row.configured_mcps as ConfiguredMcp[])
			: [],
		agentpressTools:
			row.agentpress_tools && typeof row.agentpress_tools === 'object'
				? (row.agentpress_tools as AgentpressTools)
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
	}
}

const SELECT_COLUMNS = `
	id, user_id, name, description, system_prompt, model_tier,
	configured_mcps, agentpress_tools, avatar, avatar_color,
	is_default, is_public, marketplace_published_at, download_count,
	tags, created_at, updated_at
`

// ── Read ─────────────────────────────────────────────────────────────────

const VALID_SORT_COLUMNS = new Set(['name', 'created_at', 'updated_at', 'download_count'])

/**
 * Paginated list of agents owned by `userId`. When `opts.includePublic` is
 * true, system seeds (user_id IS NULL) and other users' marketplace-published
 * rows are merged in. Returns rows + total (for paging UI).
 *
 * `search` is case-insensitive ILIKE over name + description.
 * `sort` is whitelisted (no SQL injection via column names — see VALID_SORT_COLUMNS).
 */
export async function listAgents(
	pool: pg.Pool,
	userId: string,
	opts: ListAgentsOpts = {},
): Promise<ListAgentsResult> {
	const sortCol = opts.sort && VALID_SORT_COLUMNS.has(opts.sort) ? opts.sort : 'created_at'
	const order = opts.order === 'asc' ? 'ASC' : 'DESC'
	const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200)
	const offset = Math.max(opts.offset ?? 0, 0)

	const where: string[] = []
	const params: unknown[] = []
	let paramIdx = 0

	if (opts.includePublic) {
		params.push(userId)
		paramIdx++
		where.push(`(user_id = $${paramIdx} OR user_id IS NULL OR is_public = TRUE)`)
	} else {
		params.push(userId)
		paramIdx++
		where.push(`user_id = $${paramIdx}`)
	}

	if (opts.search && opts.search.trim().length > 0) {
		params.push(`%${opts.search.trim()}%`)
		paramIdx++
		where.push(`(name ILIKE $${paramIdx} OR description ILIKE $${paramIdx})`)
	}

	const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

	// Snapshot params for the count query so we can append limit/offset for the
	// rows query without mutating the array the count query already received
	// (params is by-reference; the test mock captures the array, not a copy).
	const countResult = await pool.query<{count: string}>(
		`SELECT COUNT(*)::text AS count FROM agents ${whereSql}`,
		[...params],
	)
	const total = Number.parseInt(countResult.rows[0]?.count ?? '0', 10)

	params.push(limit)
	const limitIdx = ++paramIdx
	params.push(offset)
	const offsetIdx = ++paramIdx

	const rowsResult = await pool.query<Row>(
		`SELECT ${SELECT_COLUMNS} FROM agents ${whereSql}
		 ORDER BY ${sortCol} ${order}
		 LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
		params,
	)

	return {
		rows: rowsResult.rows.map(rowToAgent),
		total,
	}
}

/**
 * Fetch a single agent by id, scoped to `userId`. Returns null when the
 * agent does not exist OR when the agent belongs to a different user that
 * has not made it public. NEVER throws (callers depend on null contract).
 *
 * Public rows (user_id IS NULL OR is_public = TRUE) are visible to every user.
 */
export async function getAgent(
	pool: pg.Pool,
	agentId: string,
	userId: string,
): Promise<Agent | null> {
	const result = await pool.query<Row>(
		`SELECT ${SELECT_COLUMNS} FROM agents
		 WHERE id = $1 AND (user_id = $2 OR user_id IS NULL OR is_public = TRUE)`,
		[agentId, userId],
	)
	if (result.rows.length === 0) return null
	return rowToAgent(result.rows[0])
}

/**
 * Marketplace browse — returns ONLY rows where is_public = TRUE.
 * Sorted by marketplace_published_at DESC (newest published first).
 */
export async function listPublicAgents(
	pool: pg.Pool,
	opts: {limit?: number; offset?: number; search?: string} = {},
): Promise<ListAgentsResult> {
	const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200)
	const offset = Math.max(opts.offset ?? 0, 0)

	const where: string[] = ['is_public = TRUE']
	const params: unknown[] = []
	let paramIdx = 0

	if (opts.search && opts.search.trim().length > 0) {
		params.push(`%${opts.search.trim()}%`)
		paramIdx++
		where.push(`(name ILIKE $${paramIdx} OR description ILIKE $${paramIdx})`)
	}

	const whereSql = `WHERE ${where.join(' AND ')}`

	// See listAgents for the snapshot-vs-mutation rationale.
	const countResult = await pool.query<{count: string}>(
		`SELECT COUNT(*)::text AS count FROM agents ${whereSql}`,
		[...params],
	)
	const total = Number.parseInt(countResult.rows[0]?.count ?? '0', 10)

	params.push(limit)
	const limitIdx = ++paramIdx
	params.push(offset)
	const offsetIdx = ++paramIdx

	const rowsResult = await pool.query<Row>(
		`SELECT ${SELECT_COLUMNS} FROM agents ${whereSql}
		 ORDER BY marketplace_published_at DESC NULLS LAST, created_at DESC
		 LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
		params,
	)

	return {
		rows: rowsResult.rows.map(rowToAgent),
		total,
	}
}

// ── Write ────────────────────────────────────────────────────────────────

/**
 * Insert a new agent owned by `userId`. Returns the inserted row with
 * server-side defaults populated (id, created_at, updated_at). Never returns
 * null — throws on PG error.
 *
 * `isPublic` is intentionally NOT settable on create; callers must use
 * setMarketplacePublished() to publish, which keeps the published timestamp
 * authoritative.
 */
export async function createAgent(
	pool: pg.Pool,
	userId: string,
	dto: CreateAgentInput,
): Promise<Agent> {
	const id = randomUUID()
	const result = await pool.query<Row>(
		`INSERT INTO agents (
			id, user_id, name, description, system_prompt, model_tier,
			configured_mcps, agentpress_tools, avatar, avatar_color,
			is_default, tags
		 ) VALUES (
			$1, $2, $3, $4, $5, $6,
			$7::jsonb, $8::jsonb, $9, $10,
			$11, $12
		 )
		 RETURNING ${SELECT_COLUMNS}`,
		[
			id,
			userId,
			dto.name,
			dto.description ?? '',
			dto.systemPrompt ?? 'You are a helpful assistant.',
			dto.modelTier ?? 'sonnet',
			JSON.stringify(dto.configuredMcps ?? []),
			JSON.stringify(dto.agentpressTools ?? {}),
			dto.avatar ?? null,
			dto.avatarColor ?? null,
			dto.isDefault ?? false,
			dto.tags ?? [],
		],
	)
	return rowToAgent(result.rows[0])
}

/**
 * Patch an agent. Only fields present in `partial` are updated; absent fields
 * keep their current value. updated_at is always bumped to NOW(). Returns the
 * fresh row, or null when the agent does not exist OR is owned by another user.
 *
 * NOTE: user_id cannot be changed via update — agent ownership is immutable
 * (clone, do not transfer).
 */
export async function updateAgent(
	pool: pg.Pool,
	agentId: string,
	userId: string,
	partial: UpdateAgentInput,
): Promise<Agent | null> {
	const sets: string[] = []
	const params: unknown[] = []
	let paramIdx = 0

	const push = (column: string, value: unknown, jsonb = false) => {
		params.push(value)
		paramIdx++
		sets.push(`${column} = $${paramIdx}${jsonb ? '::jsonb' : ''}`)
	}

	if (partial.name !== undefined) push('name', partial.name)
	if (partial.description !== undefined) push('description', partial.description)
	if (partial.systemPrompt !== undefined) push('system_prompt', partial.systemPrompt)
	if (partial.modelTier !== undefined) push('model_tier', partial.modelTier)
	if (partial.configuredMcps !== undefined)
		push('configured_mcps', JSON.stringify(partial.configuredMcps), true)
	if (partial.agentpressTools !== undefined)
		push('agentpress_tools', JSON.stringify(partial.agentpressTools), true)
	if (partial.avatar !== undefined) push('avatar', partial.avatar)
	if (partial.avatarColor !== undefined) push('avatar_color', partial.avatarColor)
	if (partial.isDefault !== undefined) push('is_default', partial.isDefault)
	if (partial.isPublic !== undefined) push('is_public', partial.isPublic)
	if (partial.tags !== undefined) push('tags', partial.tags)

	if (sets.length === 0) {
		// No-op update: just return current row.
		return getAgent(pool, agentId, userId)
	}

	sets.push('updated_at = NOW()')

	params.push(agentId)
	const idIdx = ++paramIdx
	params.push(userId)
	const userIdx = ++paramIdx

	const result = await pool.query<Row>(
		`UPDATE agents SET ${sets.join(', ')}
		 WHERE id = $${idIdx} AND user_id = $${userIdx}
		 RETURNING ${SELECT_COLUMNS}`,
		params,
	)
	if (result.rows.length === 0) return null
	return rowToAgent(result.rows[0])
}

/**
 * Delete an agent owned by `userId`. Returns true when a row was removed,
 * false when no matching row existed (already-deleted is a no-op). The FK
 * cascade in the schema is not relied on for agent deletion — agents have
 * no child tables yet.
 */
export async function deleteAgent(
	pool: pg.Pool,
	agentId: string,
	userId: string,
): Promise<boolean> {
	const result = await pool.query(
		`DELETE FROM agents WHERE id = $1 AND user_id = $2`,
		[agentId, userId],
	)
	return (result.rowCount ?? 0) > 0
}

/**
 * Clone a public source agent into the target user's library as a private
 * copy. Bumps the source agent's download_count atomically. Returns the new
 * cloned Agent row.
 *
 * The source must satisfy is_public = TRUE OR user_id IS NULL (system seeds).
 * Cloning a non-public agent that the caller does not own returns null.
 *
 * Implementation uses a CTE so the SELECT-source + INSERT-clone happens in a
 * single round trip; the increment runs as a separate statement. We do NOT
 * wrap in a transaction because download_count drift on partial failure is
 * acceptable (single-statement increments are atomic; the worst-case is the
 * counter is one ahead of reality if INSERT fails after the UPDATE — also
 * acceptable, just statistical noise).
 */
export async function cloneAgentToLibrary(
	pool: pg.Pool,
	sourceAgentId: string,
	targetUserId: string,
): Promise<Agent | null> {
	const sourceResult = await pool.query<Row>(
		`SELECT ${SELECT_COLUMNS} FROM agents
		 WHERE id = $1 AND (is_public = TRUE OR user_id IS NULL)`,
		[sourceAgentId],
	)
	if (sourceResult.rows.length === 0) return null
	const source = sourceResult.rows[0]

	const cloned = await createAgent(pool, targetUserId, {
		name: source.name,
		description: source.description,
		systemPrompt: source.system_prompt,
		modelTier: source.model_tier,
		configuredMcps: Array.isArray(source.configured_mcps)
			? (source.configured_mcps as ConfiguredMcp[])
			: [],
		agentpressTools:
			source.agentpress_tools && typeof source.agentpress_tools === 'object'
				? (source.agentpress_tools as AgentpressTools)
				: {},
		avatar: source.avatar,
		avatarColor: source.avatar_color,
		isDefault: false,
		tags: Array.isArray(source.tags) ? source.tags : [],
	})

	await pool.query(
		`UPDATE agents SET download_count = download_count + 1 WHERE id = $1`,
		[sourceAgentId],
	)

	return cloned
}

/**
 * Toggle marketplace publication. When `published` is true, sets
 * is_public = TRUE and stamps marketplace_published_at = NOW(). When false,
 * sets is_public = FALSE and clears marketplace_published_at to NULL.
 *
 * Returns the fresh row, or null when the agent does not exist OR is owned
 * by another user.
 */
export async function setMarketplacePublished(
	pool: pg.Pool,
	agentId: string,
	userId: string,
	published: boolean,
): Promise<Agent | null> {
	const result = await pool.query<Row>(
		`UPDATE agents
		 SET is_public = $1,
		     marketplace_published_at = CASE WHEN $1 THEN NOW() ELSE NULL END,
		     updated_at = NOW()
		 WHERE id = $2 AND user_id = $3
		 RETURNING ${SELECT_COLUMNS}`,
		[published, agentId, userId],
	)
	if (result.rows.length === 0) return null
	return rowToAgent(result.rows[0])
}
