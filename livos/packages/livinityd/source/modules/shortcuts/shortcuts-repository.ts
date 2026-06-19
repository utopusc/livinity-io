// Phase 290 — shortcuts repository CRUD helpers.
//
// Mirrors webapps-repository.ts (camelCase JS surface / snake_case SQL,
// idempotent create, user_id-scoped queries). Backs the `shortcut.{list,
// create,update,delete}` tRPC procedures + the desktop "Add Shortcut" dialog.
//
// Design notes:
//   1. Row shape mirrors the `shortcuts` columns in schema.sql.
//   2. `create` is idempotent on (user_id, dedup_key) — the UNIQUE constraint
//      backs an ON CONFLICT DO NOTHING + SELECT-existing fallback so re-adding
//      the same shortcut returns the existing row instead of throwing.
//   3. `update` accepts a partial patch of {title, iconUrl}.
//   4. `delete` cascades to nothing in this phase.
//   5. All queries are scoped by user_id at the SQL level — the tRPC layer
//      sources user_id from ctx.currentUser.id.

import type pg from 'pg'

import type {ShortcutKind, ShortcutOpenMode, ShortcutSource, ShortcutPayload} from './shortcut-schema.js'

// Row shape mirrors the `shortcuts` columns (schema.sql). camelCase JS surface.
export type ShortcutRow = {
	id: string
	userId: string
	kind: ShortcutKind
	title: string
	iconUrl: string
	openMode: ShortcutOpenMode
	payload: ShortcutPayload
	dedupKey: string
	position: number
	source: ShortcutSource
	createdAt: Date
}

function rowToShortcut(row: any): ShortcutRow {
	return {
		id: row.id,
		userId: row.user_id,
		kind: row.kind,
		title: row.title,
		iconUrl: row.icon_url,
		openMode: row.open_mode,
		// JSONB comes back already parsed from node-pg.
		payload: row.payload,
		dedupKey: row.dedup_key,
		position: row.position,
		source: row.source,
		createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
	}
}

const SELECT_COLS = `id, user_id, kind, title, icon_url, open_mode, payload, dedup_key, position, source, created_at`

export async function findShortcutByDedupKey(
	pool: pg.Pool,
	userId: string,
	dedupKey: string,
): Promise<ShortcutRow | null> {
	const {rows} = await pool.query(
		`SELECT ${SELECT_COLS} FROM shortcuts WHERE user_id = $1 AND dedup_key = $2 LIMIT 1`,
		[userId, dedupKey],
	)
	if (rows.length === 0) return null
	return rowToShortcut(rows[0])
}

export async function findShortcutById(
	pool: pg.Pool,
	userId: string,
	id: string,
): Promise<ShortcutRow | null> {
	const {rows} = await pool.query(
		`SELECT ${SELECT_COLS} FROM shortcuts WHERE id = $1 AND user_id = $2 LIMIT 1`,
		[id, userId],
	)
	if (rows.length === 0) return null
	return rowToShortcut(rows[0])
}

export type CreateShortcutRow = {
	userId: string
	kind: ShortcutKind
	title: string
	iconUrl: string
	openMode: ShortcutOpenMode
	payload: ShortcutPayload
	dedupKey: string
	source?: ShortcutSource
}

// Idempotent insert keyed on (user_id, dedup_key). If a row already exists,
// return it unchanged. Otherwise insert at position = MAX(position)+1 for the
// user (append-after-last). ON CONFLICT DO NOTHING + a SELECT fallback avoids a
// race where a concurrent insert lands between the existence check and INSERT.
export async function createShortcut(
	pool: pg.Pool,
	input: CreateShortcutRow,
): Promise<ShortcutRow> {
	const existing = await findShortcutByDedupKey(pool, input.userId, input.dedupKey)
	if (existing) return existing

	const {rows: maxRows} = await pool.query(
		`SELECT COALESCE(MAX(position), -1) AS max_pos FROM shortcuts WHERE user_id = $1`,
		[input.userId],
	)
	const nextPos = (maxRows[0]?.max_pos ?? -1) + 1

	const {rows} = await pool.query(
		`INSERT INTO shortcuts (user_id, kind, title, icon_url, open_mode, payload, dedup_key, position, source)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		 ON CONFLICT (user_id, dedup_key) DO NOTHING
		 RETURNING ${SELECT_COLS}`,
		[
			input.userId,
			input.kind,
			input.title,
			input.iconUrl,
			input.openMode,
			JSON.stringify(input.payload),
			input.dedupKey,
			nextPos,
			input.source ?? 'user',
		],
	)
	if (rows.length > 0) return rowToShortcut(rows[0])

	// Lost the race — a concurrent insert won the (user_id, dedup_key) slot.
	// Return the now-existing row.
	const raced = await findShortcutByDedupKey(pool, input.userId, input.dedupKey)
	if (raced) return raced
	throw new Error('createShortcut: insert returned no row and no existing row found')
}

export async function listShortcuts(pool: pg.Pool, userId: string): Promise<ShortcutRow[]> {
	const {rows} = await pool.query(
		`SELECT ${SELECT_COLS} FROM shortcuts WHERE user_id = $1 ORDER BY position ASC, created_at ASC`,
		[userId],
	)
	return rows.map(rowToShortcut)
}

// Returns true if a row was deleted, false if no row matched (id + userId).
export async function deleteShortcut(
	pool: pg.Pool,
	userId: string,
	id: string,
): Promise<boolean> {
	const result = await pool.query(
		`DELETE FROM shortcuts WHERE id = $1 AND user_id = $2`,
		[id, userId],
	)
	return (result.rowCount ?? 0) > 0
}

export type UpdateShortcutPatch = {
	title?: string
	iconUrl?: string
}

// Partial update — only fields present in the patch are written. Returns the
// updated row, or null if no row matched.
export async function updateShortcut(
	pool: pg.Pool,
	userId: string,
	id: string,
	patch: UpdateShortcutPatch,
): Promise<ShortcutRow | null> {
	const sets: string[] = []
	const values: any[] = []
	let i = 1

	if ('title' in patch && patch.title !== undefined) {
		sets.push(`title = $${i++}`)
		values.push(patch.title)
	}
	if ('iconUrl' in patch && patch.iconUrl !== undefined) {
		sets.push(`icon_url = $${i++}`)
		values.push(patch.iconUrl)
	}

	if (sets.length === 0) {
		return findShortcutById(pool, userId, id)
	}

	values.push(id, userId)
	const {rows} = await pool.query(
		`UPDATE shortcuts SET ${sets.join(', ')}
		 WHERE id = $${i++} AND user_id = $${i++}
		 RETURNING ${SELECT_COLS}`,
		values,
	)
	if (rows.length === 0) return null
	return rowToShortcut(rows[0])
}
