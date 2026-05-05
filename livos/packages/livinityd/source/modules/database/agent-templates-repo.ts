// Phase 76 MARKET-01 — agent_templates repository (D-01, D-02). Read-mostly +
// atomic clone-count UPDATE. Used by ai/routes.ts (76-05) + database/seeds/
// agent-templates.ts (76-02). All queries use parameterized $1 placeholders
// (T-76-01-01 mitigation — pg driver escapes; never concatenate slug strings
// into SQL). Schema lives in ./schema.sql (CREATE TABLE IF NOT EXISTS
// agent_templates appended at end). Per CONTEXT D-03 this is a global
// catalog — no user_id column, no per-user filtering.

import type pg from 'pg'

export type AgentTemplate = {
	slug: string
	name: string
	description: string
	systemPrompt: string
	toolsEnabled: string[]
	tags: string[]
	mascotEmoji: string
	cloneCount: number
	createdAt: Date
}

type Row = {
	slug: string
	name: string
	description: string
	system_prompt: string
	tools_enabled: unknown // jsonb returns parsed JS value via pg's default jsonb parser
	tags: string[]
	mascot_emoji: string
	clone_count: number
	created_at: Date
}

function rowToTemplate(row: Row): AgentTemplate {
	return {
		slug: row.slug,
		name: row.name,
		description: row.description,
		systemPrompt: row.system_prompt,
		toolsEnabled: Array.isArray(row.tools_enabled) ? (row.tools_enabled as string[]) : [],
		tags: row.tags,
		mascotEmoji: row.mascot_emoji,
		cloneCount: row.clone_count,
		createdAt: row.created_at,
	}
}

/**
 * List agent templates ordered by created_at ASC (stable display order).
 * Optional `opts.tags` (non-empty) filters to rows whose tags array contains
 * ALL specified tags (PG `@>` containment operator on text[]).
 *
 * Empty tags array is treated as no filter (matches T3b spec).
 */
export async function listAgentTemplates(
	pool: pg.Pool,
	opts?: {tags?: string[]},
): Promise<AgentTemplate[]> {
	if (opts?.tags && opts.tags.length > 0) {
		const result = await pool.query<Row>(
			'SELECT * FROM agent_templates WHERE tags @> $1::text[] ORDER BY created_at ASC',
			[opts.tags],
		)
		return result.rows.map(rowToTemplate)
	}
	const result = await pool.query<Row>(
		'SELECT * FROM agent_templates ORDER BY created_at ASC',
	)
	return result.rows.map(rowToTemplate)
}

/**
 * Fetch a single template by slug. Returns null if no row matches —
 * NEVER throws (callers depend on the null contract).
 */
export async function getAgentTemplate(
	pool: pg.Pool,
	slug: string,
): Promise<AgentTemplate | null> {
	const result = await pool.query<Row>(
		'SELECT * FROM agent_templates WHERE slug = $1',
		[slug],
	)
	if (result.rows.length === 0) return null
	return rowToTemplate(result.rows[0])
}

/**
 * Atomic clone-count increment (T-76-01-04 mitigation — single-statement
 * UPDATE, no SELECT-then-UPDATE race). Returns true iff a row matched.
 * Returns false on missing slug — NEVER throws.
 */
export async function incrementCloneCount(
	pool: pg.Pool,
	slug: string,
): Promise<boolean> {
	const result = await pool.query(
		'UPDATE agent_templates SET clone_count = clone_count + 1 WHERE slug = $1',
		[slug],
	)
	return (result.rowCount ?? 0) > 0
}
