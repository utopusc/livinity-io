// Phase 322-01 (IDENT-01) — groups DAO.
//
// Wires the additive `groups` + `group_members` tables (schema.sql) as a pure
// DAO, mirroring sessions.ts exactly: stateless, resolves `getPool()` per call,
// but accepts an injectable query-runner so the unit test runs OFFLINE (no live
// Postgres). This is the SINGLE groups source later consumed by the OIDC
// `groups` claim (322-04, via listGroupNamesForUser), file ACLs (Phase
// 324/FILES-02), and app sharing (Phase 323/IDENT-04).
//
// CRITICAL back-compat invariant: every function FAILS OPEN when `getPool()` is
// null (pure legacy single-user / no-DB box) — writes no-op, reads return [] /
// null — so legacy boxes never throw. Same discipline as sessions.ts +
// database/index.ts grantAppAccess.
//
// All queries use parameterized $1..$N placeholders (pg driver escapes); no
// string interpolation of ids/names ever reaches the SQL (T-322-01).

import type pg from 'pg'

import {getPool} from './index.js'

// A minimal query-runner shape so the unit test can inject a fake.
export type QueryRunner = Pick<pg.Pool, 'query'>

/**
 * Resolve the active query runner. Prefer an injected runner (tests / explicit
 * pool); otherwise fall back to the process-wide pool. Returns null when no DB
 * is available (pure legacy single-user) — every function below fails open on it.
 */
function resolveRunner(injected?: QueryRunner | null): QueryRunner | null {
	if (injected) return injected
	return getPool()
}

// A group row as stored (snake_case matches the SQL columns).
export interface GroupRow {
	id: string
	name: string
	description: string | null
	created_by: string | null
	created_at: string
	updated_at: string
}

// A member row as returned to the group-detail UI (username JOINed from users).
export interface GroupMemberRow {
	user_id: string
	username: string
	added_at: string
}

/**
 * Create a group. Returns the inserted GroupRow when a pool exists; returns null
 * (no throw) when no DB is available (legacy single-user).
 */
export async function createGroup(
	args: {name: string; description?: string | null; createdBy?: string | null},
	runner?: QueryRunner | null,
): Promise<GroupRow | null> {
	const db = resolveRunner(runner)
	if (!db) return null
	const {rows} = await db.query(
		`INSERT INTO groups (name, description, created_by)
		 VALUES ($1, $2, $3)
		 RETURNING id, name, description, created_by, created_at, updated_at`,
		[args.name, args.description ?? null, args.createdBy ?? null],
	)
	return (rows[0] as GroupRow) ?? null
}

/**
 * Rename a group (and optionally update its description; COALESCE keeps the
 * existing description when null is passed). Returns true when a row was
 * updated, false on miss / no DB.
 */
export async function renameGroup(
	id: string,
	name: string,
	description: string | null | undefined,
	runner?: QueryRunner | null,
): Promise<boolean> {
	const db = resolveRunner(runner)
	if (!db) return false
	const {rowCount} = await db.query(
		`UPDATE groups SET name = $2, description = COALESCE($3, description), updated_at = NOW() WHERE id = $1`,
		[id, name, description ?? null],
	)
	return (rowCount ?? 0) > 0
}

/**
 * Delete a group (group_members cascade via the FK ON DELETE CASCADE). Returns
 * true when a row was deleted, false on miss / no DB.
 */
export async function deleteGroup(id: string, runner?: QueryRunner | null): Promise<boolean> {
	const db = resolveRunner(runner)
	if (!db) return false
	const {rowCount} = await db.query(`DELETE FROM groups WHERE id = $1`, [id])
	return (rowCount ?? 0) > 0
}

/**
 * List all groups, name-ordered. Returns [] when no DB is available.
 */
export async function listGroups(runner?: QueryRunner | null): Promise<GroupRow[]> {
	const db = resolveRunner(runner)
	if (!db) return []
	const {rows} = await db.query(
		`SELECT id, name, description, created_by, created_at, updated_at FROM groups ORDER BY name ASC`,
	)
	return rows as GroupRow[]
}

/**
 * Add a user to a group. Idempotent: inserting the same (group_id, user_id)
 * twice is a no-op (ON CONFLICT DO NOTHING). No-op when no DB is available.
 */
export async function addGroupMember(
	args: {groupId: string; userId: string; addedBy?: string | null},
	runner?: QueryRunner | null,
): Promise<void> {
	const db = resolveRunner(runner)
	if (!db) return
	await db.query(
		`INSERT INTO group_members (group_id, user_id, added_by)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (group_id, user_id) DO NOTHING`,
		[args.groupId, args.userId, args.addedBy ?? null],
	)
}

/**
 * Remove a user from a group. Returns true when a membership row was removed,
 * false on miss / no DB.
 */
export async function removeGroupMember(
	groupId: string,
	userId: string,
	runner?: QueryRunner | null,
): Promise<boolean> {
	const db = resolveRunner(runner)
	if (!db) return false
	const {rowCount} = await db.query(
		`DELETE FROM group_members WHERE group_id = $1 AND user_id = $2`,
		[groupId, userId],
	)
	return (rowCount ?? 0) > 0
}

/**
 * List a group's members (username JOINed from users), username-ordered.
 * Returns [] when no DB is available.
 */
export async function listGroupMembers(groupId: string, runner?: QueryRunner | null): Promise<GroupMemberRow[]> {
	const db = resolveRunner(runner)
	if (!db) return []
	const {rows} = await db.query(
		`SELECT m.user_id, u.username, m.added_at
		 FROM group_members m JOIN users u ON u.id = m.user_id
		 WHERE m.group_id = $1
		 ORDER BY u.username ASC`,
		[groupId],
	)
	return rows as GroupMemberRow[]
}

/**
 * The group NAMES a user belongs to, name-ordered — the exact function the OIDC
 * `groups` claim (322-04) consumes. Returns [] when no DB is available or the
 * user has no memberships.
 */
export async function listGroupNamesForUser(userId: string, runner?: QueryRunner | null): Promise<string[]> {
	const db = resolveRunner(runner)
	if (!db) return []
	const {rows} = await db.query(
		`SELECT g.name
		 FROM group_members m JOIN groups g ON g.id = m.group_id
		 WHERE m.user_id = $1
		 ORDER BY g.name ASC`,
		[userId],
	)
	return (rows as Array<{name: string}>).map((r) => r.name)
}
