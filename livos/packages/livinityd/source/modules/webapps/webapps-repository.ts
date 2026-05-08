// Phase 94-01 — webapps repository CRUD helpers.
//
// P92 shipped the table schema + a stub for this module. P94 adds the four
// CRUD operations that back the `webapp.{create,list,delete,update}` tRPC
// procedures alongside the desktop "Add WebApp" dialog UI.
//
// Design notes:
//
// 1. Row shape mirrors columns declared in 92-02's migration (camelCase JS
//    surface, snake_case SQL).
//
// 2. `create` is idempotent on the (user_id, url) pair — if the URL already
//    exists for the user, return the existing row instead of throwing. Per
//    plan task 94-01 / CONTEXT gray-area #adding-a-duplicate-URL.
//
// 3. `update` accepts a partial patch of {title, faviconUrl}. The plan
//    surface includes `description` for forward-compatibility but the
//    current schema has no description column — that field is accepted at
//    the tRPC layer and silently ignored here. Add a column + migration
//    when v34 introduces a real description-display path.
//
// 4. `delete` cascades to nothing in this phase. Future skill/session
//    tables (P96/P97) will add their own ON DELETE CASCADE constraints.
//
// 5. All queries are scoped by user_id at the SQL level — tRPC layer is
//    responsible for sourcing user_id from `ctx.currentUser.id`.

import type pg from 'pg'

// Row shape mirrors the columns declared in 92-02's migration. Names are
// camelCased here for the JS surface; SQL columns stay snake_case.
export type WebAppRow = {
	id: string
	userId: string
	url: string
	title: string | null
	faviconUrl: string | null
	position: number
	createdAt: Date
}

// Map a raw pg row (snake_case) to the camelCase JS surface.
function rowToWebApp(row: any): WebAppRow {
	return {
		id: row.id,
		userId: row.user_id,
		url: row.url,
		title: row.title,
		faviconUrl: row.favicon_url,
		position: row.position,
		createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
	}
}

// Idempotent helper used by `create` — returns the existing row if one
// already exists for (userId, url), else null. Exported so other call
// sites (e.g. P95 launch dispatcher) can de-dupe before inserting.
export async function findWebAppByUrl(
	pool: pg.Pool,
	userId: string,
	url: string,
): Promise<WebAppRow | null> {
	const {rows} = await pool.query(
		`SELECT id, user_id, url, title, favicon_url, position, created_at
		 FROM webapps
		 WHERE user_id = $1 AND url = $2
		 LIMIT 1`,
		[userId, url],
	)
	if (rows.length === 0) return null
	return rowToWebApp(rows[0])
}

export async function findWebAppById(
	pool: pg.Pool,
	userId: string,
	id: string,
): Promise<WebAppRow | null> {
	const {rows} = await pool.query(
		`SELECT id, user_id, url, title, favicon_url, position, created_at
		 FROM webapps
		 WHERE id = $1 AND user_id = $2
		 LIMIT 1`,
		[id, userId],
	)
	if (rows.length === 0) return null
	return rowToWebApp(rows[0])
}

export type CreateWebAppInput = {
	userId: string
	url: string
	title?: string | null
	faviconUrl?: string | null
}

// Idempotent insert — if (user_id, url) already exists, return the
// existing row unchanged. Otherwise insert at position = MAX(position)+1
// for the user (append-after-last per CONTEXT gray-area #order).
export async function createWebApp(
	pool: pg.Pool,
	input: CreateWebAppInput,
): Promise<WebAppRow> {
	const existing = await findWebAppByUrl(pool, input.userId, input.url)
	if (existing) return existing

	const {rows: maxRows} = await pool.query(
		`SELECT COALESCE(MAX(position), -1) AS max_pos FROM webapps WHERE user_id = $1`,
		[input.userId],
	)
	const nextPos = (maxRows[0]?.max_pos ?? -1) + 1

	const {rows} = await pool.query(
		`INSERT INTO webapps (user_id, url, title, favicon_url, position)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, user_id, url, title, favicon_url, position, created_at`,
		[input.userId, input.url, input.title ?? null, input.faviconUrl ?? null, nextPos],
	)
	return rowToWebApp(rows[0])
}

export async function listWebApps(pool: pg.Pool, userId: string): Promise<WebAppRow[]> {
	const {rows} = await pool.query(
		`SELECT id, user_id, url, title, favicon_url, position, created_at
		 FROM webapps
		 WHERE user_id = $1
		 ORDER BY position ASC, created_at ASC`,
		[userId],
	)
	return rows.map(rowToWebApp)
}

// Returns true if a row was deleted, false if no row matched (id+userId).
export async function deleteWebApp(
	pool: pg.Pool,
	userId: string,
	id: string,
): Promise<boolean> {
	const result = await pool.query(
		`DELETE FROM webapps WHERE id = $1 AND user_id = $2`,
		[id, userId],
	)
	return (result.rowCount ?? 0) > 0
}

export type UpdateWebAppPatch = {
	title?: string | null
	faviconUrl?: string | null
}

// Partial update — only the fields explicitly present in the patch are
// written. Returns the updated row, or null if no row matched.
export async function updateWebApp(
	pool: pg.Pool,
	userId: string,
	id: string,
	patch: UpdateWebAppPatch,
): Promise<WebAppRow | null> {
	const sets: string[] = []
	const values: any[] = []
	let i = 1

	if ('title' in patch) {
		sets.push(`title = $${i++}`)
		values.push(patch.title ?? null)
	}
	if ('faviconUrl' in patch) {
		sets.push(`favicon_url = $${i++}`)
		values.push(patch.faviconUrl ?? null)
	}

	if (sets.length === 0) {
		// No-op patch — return current row.
		return findWebAppById(pool, userId, id)
	}

	values.push(id, userId)
	const {rows} = await pool.query(
		`UPDATE webapps SET ${sets.join(', ')}
		 WHERE id = $${i++} AND user_id = $${i++}
		 RETURNING id, user_id, url, title, favicon_url, position, created_at`,
		values,
	)
	if (rows.length === 0) return null
	return rowToWebApp(rows[0])
}
