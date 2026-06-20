// Phase 290 R2 — user_terminal_templates repository CRUD helpers.
//
// Backs `shortcut.userTemplates.{list,create,delete}`. Mirrors
// shortcuts-repository.ts (camelCase JS surface / snake_case SQL, user_id-scoped
// queries, idempotent create). "Save as template" in the Add Shortcut dialog's
// custom-shell builder upserts here (ON CONFLICT (user_id, label) DO UPDATE).

import type pg from 'pg'

export type UserTerminalTemplateRow = {
	id: string
	userId: string
	label: string
	command: string
	hint: string | null
	iconUrl: string | null
	cwd: string | null
	createdAt: Date
	updatedAt: Date
}

function rowToTemplate(row: any): UserTerminalTemplateRow {
	return {
		id: row.id,
		userId: row.user_id,
		label: row.label,
		command: row.command,
		hint: row.hint ?? null,
		iconUrl: row.icon_url ?? null,
		cwd: row.cwd ?? null,
		createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
		updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
	}
}

const SELECT_COLS = `id, user_id, label, command, hint, icon_url, cwd, created_at, updated_at`

export async function listUserTemplates(
	pool: pg.Pool,
	userId: string,
): Promise<UserTerminalTemplateRow[]> {
	const {rows} = await pool.query(
		`SELECT ${SELECT_COLS} FROM user_terminal_templates
		 WHERE user_id = $1 ORDER BY updated_at DESC`,
		[userId],
	)
	return rows.map(rowToTemplate)
}

export type UpsertUserTemplateInput = {
	userId: string
	label: string
	command: string
	hint?: string | null
	iconUrl?: string | null
	cwd?: string | null
}

/**
 * Upsert keyed on (user_id, label). "Save as template" with the same label
 * overwrites the previous one (idempotent re-save). Returns the saved row.
 */
export async function upsertUserTemplate(
	pool: pg.Pool,
	input: UpsertUserTemplateInput,
): Promise<UserTerminalTemplateRow> {
	const {rows} = await pool.query(
		`INSERT INTO user_terminal_templates (user_id, label, command, hint, icon_url, cwd)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 ON CONFLICT (user_id, label) DO UPDATE SET
		   command = EXCLUDED.command,
		   hint = EXCLUDED.hint,
		   icon_url = EXCLUDED.icon_url,
		   cwd = EXCLUDED.cwd,
		   updated_at = NOW()
		 RETURNING ${SELECT_COLS}`,
		[
			input.userId,
			input.label,
			input.command,
			input.hint ?? null,
			input.iconUrl ?? null,
			input.cwd ?? null,
		],
	)
	return rowToTemplate(rows[0])
}

/** Delete by id (user-scoped). Returns true if a row was removed. */
export async function deleteUserTemplate(
	pool: pg.Pool,
	userId: string,
	id: string,
): Promise<boolean> {
	const result = await pool.query(
		`DELETE FROM user_terminal_templates WHERE id = $1 AND user_id = $2`,
		[id, userId],
	)
	return (result.rowCount ?? 0) > 0
}
