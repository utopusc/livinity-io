// Phase 335 (ROLE-01/02) — delegated/scoped admin grants DAO (D-335-1/D-335-4).
//
// Wires the additive `admin_scopes` + `app_operators` tables (schema.sql) as a
// pure DAO, mirroring groups.ts exactly: stateless, resolves `getPool()` per
// call, but accepts an injectable query-runner so the unit test runs OFFLINE.
//
// FAIL-CLOSED invariant (the inverse framing of groups.ts's "fail open"): on a
// no-DB box every predicate returns false and every list returns [] — i.e. NO
// privilege. Absence of a row is absence of privilege; a legacy single-user
// box has no members to delegate to, so this is both safe and correct.
//
// All queries use parameterized $1..$N placeholders; no string interpolation of
// ids/scopes ever reaches the SQL. The scope enum is CLOSED here AND in the
// table CHECK — an unknown scope string can neither be granted nor honored.

import type pg from 'pg'

import {getPool} from './index.js'

export type QueryRunner = Pick<pg.Pool, 'query'>

function resolveRunner(injected?: QueryRunner | null): QueryRunner | null {
	if (injected) return injected
	return getPool()
}

/** The closed v1 scope enum — MUST mirror the admin_scopes.scope CHECK. */
export const ADMIN_SCOPES = ['read-only-admin', 'share-admin'] as const
export type AdminScope = (typeof ADMIN_SCOPES)[number]

export function isAdminScope(value: string): value is AdminScope {
	return (ADMIN_SCOPES as readonly string[]).includes(value)
}

// A scope grant row as returned to the admin UI (username JOINed from users).
export interface AdminScopeRow {
	user_id: string
	username: string
	scope: AdminScope
	granted_at: string
}

// An operator grant row as returned to the share dialog (username JOINed).
export interface AppOperatorRow {
	app_id: string
	user_id: string
	username: string
	granted_at: string
}

/**
 * Grant a scope to a user. Idempotent (ON CONFLICT DO NOTHING). Rejects an
 * unknown scope BEFORE any SQL (defense-in-depth with the table CHECK).
 * No-op on a no-DB box.
 */
export async function grantAdminScope(
	args: {userId: string; scope: AdminScope; grantedBy?: string | null},
	runner?: QueryRunner | null,
): Promise<void> {
	if (!isAdminScope(args.scope)) throw new Error(`Unknown admin scope: ${args.scope}`)
	const db = resolveRunner(runner)
	if (!db) return
	await db.query(
		`INSERT INTO admin_scopes (user_id, scope, granted_by)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (user_id, scope) DO NOTHING`,
		[args.userId, args.scope, args.grantedBy ?? null],
	)
}

/** Revoke a scope. True when a row was removed, false on miss / no DB. */
export async function revokeAdminScope(
	userId: string,
	scope: AdminScope,
	runner?: QueryRunner | null,
): Promise<boolean> {
	const db = resolveRunner(runner)
	if (!db) return false
	const {rowCount} = await db.query(`DELETE FROM admin_scopes WHERE user_id = $1 AND scope = $2`, [userId, scope])
	return (rowCount ?? 0) > 0
}

/**
 * Does the user hold the scope? FAIL-CLOSED: false on no-DB. Callers (the
 * requireScope middleware) additionally fail closed on a thrown query error.
 */
export async function hasAdminScope(
	userId: string,
	scope: AdminScope,
	runner?: QueryRunner | null,
): Promise<boolean> {
	const db = resolveRunner(runner)
	if (!db) return false
	const {rows} = await db.query(`SELECT 1 FROM admin_scopes WHERE user_id = $1 AND scope = $2 LIMIT 1`, [
		userId,
		scope,
	])
	return rows.length > 0
}

/** The scopes ONE user holds (drives user.myScopes + the users-row chips). */
export async function listAdminScopesForUser(userId: string, runner?: QueryRunner | null): Promise<AdminScope[]> {
	const db = resolveRunner(runner)
	if (!db) return []
	const {rows} = await db.query(`SELECT scope FROM admin_scopes WHERE user_id = $1 ORDER BY scope ASC`, [userId])
	return (rows as Array<{scope: string}>).map((r) => r.scope).filter(isAdminScope)
}

/** Every scope grant (username JOINed), for the admin Users UI. */
export async function listAllAdminScopes(runner?: QueryRunner | null): Promise<AdminScopeRow[]> {
	const db = resolveRunner(runner)
	if (!db) return []
	const {rows} = await db.query(
		`SELECT s.user_id, u.username, s.scope, s.granted_at
		 FROM admin_scopes s JOIN users u ON u.id = s.user_id
		 ORDER BY u.username ASC, s.scope ASC`,
	)
	return rows as AdminScopeRow[]
}

/**
 * Grant per-app operator capability. Idempotent (ON CONFLICT DO NOTHING).
 * No-op on a no-DB box.
 */
export async function grantAppOperator(
	args: {appId: string; userId: string; grantedBy?: string | null},
	runner?: QueryRunner | null,
): Promise<void> {
	const db = resolveRunner(runner)
	if (!db) return
	await db.query(
		`INSERT INTO app_operators (app_id, user_id, granted_by)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (app_id, user_id) DO NOTHING`,
		[args.appId, args.userId, args.grantedBy ?? null],
	)
}

/** Revoke an operator grant. True when a row was removed, false on miss / no DB. */
export async function revokeAppOperator(
	appId: string,
	userId: string,
	runner?: QueryRunner | null,
): Promise<boolean> {
	const db = resolveRunner(runner)
	if (!db) return false
	const {rowCount} = await db.query(`DELETE FROM app_operators WHERE app_id = $1 AND user_id = $2`, [appId, userId])
	return (rowCount ?? 0) > 0
}

/**
 * Is the user an operator of THIS app? FAIL-CLOSED: false on no-DB. The grant
 * is app-scoped — an operator of app A holds nothing for app B.
 */
export async function isAppOperator(appId: string, userId: string, runner?: QueryRunner | null): Promise<boolean> {
	const db = resolveRunner(runner)
	if (!db) return false
	const {rows} = await db.query(`SELECT 1 FROM app_operators WHERE app_id = $1 AND user_id = $2 LIMIT 1`, [
		appId,
		userId,
	])
	return rows.length > 0
}

/** Every operator of ONE app (username JOINed), for the share/manage dialog. */
export async function listAppOperators(appId: string, runner?: QueryRunner | null): Promise<AppOperatorRow[]> {
	const db = resolveRunner(runner)
	if (!db) return []
	const {rows} = await db.query(
		`SELECT o.app_id, o.user_id, u.username, o.granted_at
		 FROM app_operators o JOIN users u ON u.id = o.user_id
		 WHERE o.app_id = $1
		 ORDER BY u.username ASC`,
		[appId],
	)
	return rows as AppOperatorRow[]
}

/** Every app the user operates (drives the UI's capability hints). */
export async function listOperatedAppsForUser(userId: string, runner?: QueryRunner | null): Promise<string[]> {
	const db = resolveRunner(runner)
	if (!db) return []
	const {rows} = await db.query(`SELECT app_id FROM app_operators WHERE user_id = $1 ORDER BY app_id ASC`, [userId])
	return (rows as Array<{app_id: string}>).map((r) => r.app_id)
}
