// Phase 96-02 — webapp_skills repository.
//
// CRUD on the webapp_skills table (P96-01 schema).
//
// All queries scoped by user_id at the SQL layer. The router is responsible
// for sourcing user_id from `ctx.currentUser.id`; this module never trusts
// caller-supplied user identifiers in isolation — but a `user_id` column
// constraint on every WHERE makes the cross-user read/write impossible by
// construction.

import type pg from 'pg'

export type WebAppSkillRow = {
	id: string
	userId: string
	webappId: string
	skillName: string
	actionLog: unknown // JSONB blob; canonical shape lives in 96-CONTEXT
	createdAt: Date
}

function toDate(v: unknown): Date {
	return v instanceof Date ? v : new Date(v as string | number)
}

function rowToSkill(row: any): WebAppSkillRow {
	return {
		id: row.id,
		userId: row.user_id,
		webappId: row.webapp_id,
		skillName: row.skill_name,
		actionLog: row.action_log,
		createdAt: toDate(row.created_at),
	}
}

export type CreateWebAppSkillInput = {
	userId: string
	webappId: string
	skillName: string
	actionLog: unknown
}

export async function createWebAppSkill(
	pool: pg.Pool,
	input: CreateWebAppSkillInput,
): Promise<WebAppSkillRow> {
	const {rows} = await pool.query(
		`INSERT INTO webapp_skills (user_id, webapp_id, skill_name, action_log)
		 VALUES ($1, $2, $3, $4::jsonb)
		 RETURNING id, user_id, webapp_id, skill_name, action_log, created_at`,
		[input.userId, input.webappId, input.skillName, JSON.stringify(input.actionLog)],
	)
	return rowToSkill(rows[0])
}

export type WebAppSkillListItem = {
	id: string
	skillName: string
	createdAt: Date
	actionCount: number
}

/**
 * Sidebar query — returns one row per skill with the count of events in
 * the action log (read off the JSONB `events` array length). A
 * jsonb_array_length call is sub-ms even with hundreds of skills.
 */
export async function listWebAppSkills(
	pool: pg.Pool,
	userId: string,
	webappId: string,
): Promise<WebAppSkillListItem[]> {
	const {rows} = await pool.query(
		`SELECT id,
		        skill_name,
		        created_at,
		        COALESCE(jsonb_array_length(action_log->'events'), 0) AS action_count
		 FROM webapp_skills
		 WHERE user_id = $1 AND webapp_id = $2
		 ORDER BY created_at DESC`,
		[userId, webappId],
	)
	return rows.map(r => ({
		id: r.id,
		skillName: r.skill_name,
		createdAt: toDate(r.created_at),
		actionCount: typeof r.action_count === 'number' ? r.action_count : Number(r.action_count),
	}))
}

export async function getWebAppSkill(
	pool: pg.Pool,
	userId: string,
	skillId: string,
): Promise<WebAppSkillRow | null> {
	const {rows} = await pool.query(
		`SELECT id, user_id, webapp_id, skill_name, action_log, created_at
		 FROM webapp_skills
		 WHERE id = $1 AND user_id = $2
		 LIMIT 1`,
		[skillId, userId],
	)
	if (rows.length === 0) return null
	return rowToSkill(rows[0])
}

export async function deleteWebAppSkill(
	pool: pg.Pool,
	userId: string,
	skillId: string,
): Promise<WebAppSkillRow | null> {
	const {rows} = await pool.query(
		`DELETE FROM webapp_skills
		 WHERE id = $1 AND user_id = $2
		 RETURNING id, user_id, webapp_id, skill_name, action_log, created_at`,
		[skillId, userId],
	)
	if (rows.length === 0) return null
	return rowToSkill(rows[0])
}
