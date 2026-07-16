// Phase 323-05 (IDENT-04) — app access DAO (per-app user/group grants).
//
// A DIRECT port of files/file-acls.ts: a pure, stateless DAO that resolves
// getPool() per call but accepts an injectable query-runner so the unit test
// runs OFFLINE (no live Postgres). This is the effective-access source consumed
// by the app route enforcement (323-06) and the share dialog (323-07).
//
// CRITICAL back-compat invariant (mirrors file-acls.ts / groups.ts): every
// function FAILS OPEN when getPool() is null (legacy single-user / no-DB box) —
// writes no-op (return void/false), reads return [] / 'none' — so legacy boxes
// never throw and the access layer grants nothing extra.
//
// All queries use parameterized $1..$N placeholders (pg driver escapes); no
// string interpolation of app ids / principal ids / access types ever reaches
// the SQL. Group membership resolves via a group_members subquery (the same
// JOIN shape file-acls.ts:150-171 uses) so a single round-trip returns every
// applicable {user-direct + group} grant for the app.
//
// D-07 (b-i): getEffectiveAppAccess UNIONs BOTH tables — user_app_access is the
// DIRECT-user source (untouched, existing), app_access carries GROUP grants
// (new here). Evaluation (D-08) is most-permissive over none < readonly < full.
// getEffectiveAppAccess fails CLOSED to 'none' on no-DB (least access), while
// the boolean launch gate hasAppAccess (database/index.ts) stays permissive so
// readonly still launches.

import type pg from 'pg'

import {getPool} from '../database/index.js'

// A minimal query-runner shape so the unit test can inject a fake.
export type QueryRunner = Pick<pg.Pool, 'query'>

export type AppPrincipalType = 'user' | 'group'
export type AppAccessLevel = 'none' | 'readonly' | 'full'

// An app_access row as stored (snake_case matches the SQL columns).
export interface AppAccessRow {
	app_id: string
	principal_type: AppPrincipalType
	principal_id: string
	access_type: AppAccessLevel
	granted_by: string | null
	granted_at: string
}

/**
 * Resolve the active query runner. Prefer an injected runner (tests / explicit
 * pool); otherwise fall back to the process-wide pool. Returns null when no DB
 * is available (pure legacy single-user) — every function below fails open on it.
 */
function resolveRunner(injected?: QueryRunner | null): QueryRunner | null {
	if (injected) return injected
	return getPool()
}

/**
 * Pure evaluation of the most-permissive union over none < readonly < full
 * (D-08). A direct port of file-acls.ts evaluateAclLevel (write→full, read→
 * readonly, add none). Exported so the truth table is unit-testable without a
 * runner.
 *
 *   - any `full` present     → 'full'     (most-permissive wins)
 *   - else any `readonly`    → 'readonly'
 *   - else (only none / [])  → 'none'     (fails closed to least access — T-323-14)
 */
export function evaluateAppAccessLevel(levels: readonly AppAccessLevel[]): AppAccessLevel {
	if (levels.includes('full')) return 'full'
	if (levels.includes('readonly')) return 'readonly'
	return 'none'
}

/**
 * The effective app-access level for a user — the most-permissive UNION of the
 * user's DIRECT user_app_access grant + every GROUP grant (app_access) on a
 * group the user belongs to (D-07 b-i). Group membership resolves via a
 * group_members subquery so one round-trip returns every applicable level.
 * Returns 'none' when there is no applicable grant OR no DB is available
 * (fail-closed to least access — the route enforcement in 323-06 denies).
 */
export async function getEffectiveAppAccess(
	appId: string,
	userId: string,
	runner?: QueryRunner | null,
): Promise<AppAccessLevel> {
	const db = resolveRunner(runner)
	if (!db) return 'none'
	const {rows} = await db.query(
		`SELECT access_type FROM user_app_access WHERE app_id = $1 AND user_id = $2
		 UNION ALL
		 SELECT access_type FROM app_access
		 WHERE app_id = $1 AND principal_type = 'group'
		   AND principal_id IN (SELECT group_id FROM group_members WHERE user_id = $2)`,
		[appId, userId],
	)
	const levels = (rows as Array<{access_type: AppAccessLevel}>).map((r) => r.access_type)
	return evaluateAppAccessLevel(levels)
}

/**
 * Grant (or update) a GROUP's access to an app (app_access, principal_type
 * 'group'). Idempotent upsert on the (app_id, principal_type, principal_id)
 * primary key — a re-grant overwrites the access_type (and re-stamps
 * granted_by). No-op when no DB is available. accessType defaults to 'full'.
 */
export async function grantAppAccessToGroup(
	appId: string,
	groupId: string,
	grantedBy: string | null,
	accessType: AppAccessLevel = 'full',
	runner?: QueryRunner | null,
): Promise<void> {
	const db = resolveRunner(runner)
	if (!db) return
	await db.query(
		`INSERT INTO app_access (app_id, principal_type, principal_id, granted_by, access_type)
		 VALUES ($1, 'group', $2, $3, $4)
		 ON CONFLICT (app_id, principal_type, principal_id)
		 DO UPDATE SET access_type = EXCLUDED.access_type, granted_by = EXCLUDED.granted_by, granted_at = NOW()`,
		[appId, groupId, grantedBy ?? null, accessType],
	)
}

/**
 * Revoke a GROUP's grant on an app. Returns true when a row was removed, false
 * on miss / no DB.
 */
export async function revokeAppAccessFromGroup(
	appId: string,
	groupId: string,
	runner?: QueryRunner | null,
): Promise<boolean> {
	const db = resolveRunner(runner)
	if (!db) return false
	const {rowCount} = await db.query(
		`DELETE FROM app_access WHERE app_id = $1 AND principal_type = 'group' AND principal_id = $2`,
		[appId, groupId],
	)
	return (rowCount ?? 0) > 0
}

/**
 * List every app_access grant for an app (both user- and group-principals), for
 * the share dialog (323-07). Returns [] when no DB is available.
 */
export async function listAppAccessPrincipals(appId: string, runner?: QueryRunner | null): Promise<AppAccessRow[]> {
	const db = resolveRunner(runner)
	if (!db) return []
	const {rows} = await db.query(
		`SELECT app_id, principal_type, principal_id, access_type, granted_by, granted_at
		 FROM app_access
		 WHERE app_id = $1
		 ORDER BY principal_type ASC, principal_id ASC`,
		[appId],
	)
	return rows as AppAccessRow[]
}
