// Phase 324-02 (FILES-02) — file ACL DAO (per-path user/group grants).
//
// Clones database/groups.ts VERBATIM in discipline: a pure, stateless DAO that
// resolves getPool() per call but accepts an injectable query-runner so the unit
// test runs OFFLINE (no live Postgres). This is the SINGLE file-ACL source
// consumed by files.ts getEffectivePermission (the cross-user visibility layer)
// and, later, the Samba `valid users` render-time rework (324-04).
//
// CRITICAL back-compat invariant (mirrors groups.ts / sessions.ts): every
// function FAILS OPEN when getPool() is null (pure legacy single-user / no-DB
// box) — writes no-op (return null/false), reads return [] / null — so legacy
// boxes never throw and the ACL layer simply grants nothing extra.
//
// All queries use parameterized $1..$N placeholders (pg driver escapes); no
// string interpolation of paths / principal ids / levels ever reaches the SQL
// (T-324-07). Group membership resolves via a group_members subquery (the same
// JOIN shape groups.ts:172-183 uses for listGroupNamesForUser) so a single
// round-trip returns every applicable {user-direct + group} grant at the path.
//
// Evaluation (D-08): most-permissive UNION of {user-direct grant, every group
// grant at the EXACT path}; `none` is an explicit override ONLY when it is the
// SOLE applicable rule; NON-inheriting, explicit-path-only v1 (NO tree-walk,
// NO POSIX ACLs / setfacl — every file is one OS uid).

import type pg from 'pg'

import {getPool} from '../database/index.js'

// A minimal query-runner shape so the unit test can inject a fake.
export type QueryRunner = Pick<pg.Pool, 'query'>

export type AclPrincipalType = 'user' | 'group'
export type AclLevel = 'none' | 'read' | 'write'

// A file_acls row as stored (snake_case matches the SQL columns).
export interface FileAclRow {
	virtual_path: string
	principal_type: AclPrincipalType
	principal_id: string
	level: AclLevel
	granted_by: string | null
	created_at: string
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
 * Pure evaluation of the most-permissive union with the `none`-sole-override
 * rule (D-08). Exported so the truth table is unit-testable without a runner.
 *
 *   - any `write` present            → 'write'  (most-permissive wins)
 *   - else any `read` present        → 'read'
 *   - else (only `none` rules apply) → 'none'   (explicit deny override)
 *   - no applicable rule at all      → null     (fall through to ownership)
 *
 * So `none` denies ONLY when it is the sole applicable rule; the moment any
 * read/write grant coexists, most-permissive-wins and the deny is superseded.
 */
export function evaluateAclLevel(levels: readonly AclLevel[]): AclLevel | null {
	if (levels.length === 0) return null
	if (levels.includes('write')) return 'write'
	if (levels.includes('read')) return 'read'
	return 'none'
}

/**
 * List every grant at an EXACT virtual path (both user- and group-principals),
 * for the admin ACL editor (324-08). Returns [] when no DB is available.
 */
export async function listAclsForPath(virtualPath: string, runner?: QueryRunner | null): Promise<FileAclRow[]> {
	const db = resolveRunner(runner)
	if (!db) return []
	const {rows} = await db.query(
		`SELECT virtual_path, principal_type, principal_id, level, granted_by, created_at
		 FROM file_acls
		 WHERE virtual_path = $1
		 ORDER BY principal_type ASC, principal_id ASC`,
		[virtualPath],
	)
	return rows as FileAclRow[]
}

/**
 * Grant (or update) a single principal's level at an exact path. Idempotent
 * upsert on the (virtual_path, principal_type, principal_id) primary key — a
 * re-grant overwrites the level (and re-stamps granted_by/created_at). Returns
 * the row when a pool exists; returns null (no throw) when no DB is available.
 */
export async function grantAcl(
	args: {
		virtualPath: string
		principalType: AclPrincipalType
		principalId: string
		level: AclLevel
		grantedBy?: string | null
	},
	runner?: QueryRunner | null,
): Promise<FileAclRow | null> {
	const db = resolveRunner(runner)
	if (!db) return null
	const {rows} = await db.query(
		`INSERT INTO file_acls (virtual_path, principal_type, principal_id, level, granted_by)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (virtual_path, principal_type, principal_id)
		 DO UPDATE SET level = EXCLUDED.level, granted_by = EXCLUDED.granted_by, created_at = NOW()
		 RETURNING virtual_path, principal_type, principal_id, level, granted_by, created_at`,
		[args.virtualPath, args.principalType, args.principalId, args.level, args.grantedBy ?? null],
	)
	return (rows[0] as FileAclRow) ?? null
}

/**
 * Revoke a single principal's grant at an exact path. Returns true when a row
 * was removed, false on miss / no DB.
 */
export async function revokeAcl(
	virtualPath: string,
	principalType: AclPrincipalType,
	principalId: string,
	runner?: QueryRunner | null,
): Promise<boolean> {
	const db = resolveRunner(runner)
	if (!db) return false
	const {rowCount} = await db.query(
		`DELETE FROM file_acls WHERE virtual_path = $1 AND principal_type = $2 AND principal_id = $3`,
		[virtualPath, principalType, principalId],
	)
	return (rowCount ?? 0) > 0
}

/**
 * The effective ACL level for a user at an EXACT path — the most-permissive
 * union of the user's direct grant + every grant on a group the user belongs
 * to, with the `none`-sole-override rule (D-08). Returns null when there is no
 * applicable grant (the caller then falls through to ownership-governed access)
 * or when no DB is available (fail-open: the ACL layer grants nothing extra).
 *
 * Group membership resolves via a group_members subquery (the groups.ts JOIN
 * shape) so one round-trip returns every applicable level. NON-inheriting: only
 * grants at this EXACT virtual_path apply (no parent/subtree tree-walk).
 */
export async function getEffectiveLevel(
	virtualPath: string,
	userId: string,
	runner?: QueryRunner | null,
): Promise<AclLevel | null> {
	const db = resolveRunner(runner)
	if (!db) return null
	const {rows} = await db.query(
		`SELECT level
		 FROM file_acls
		 WHERE virtual_path = $1
		   AND (
		     (principal_type = 'user' AND principal_id = $2)
		     OR (principal_type = 'group' AND principal_id IN (
		       SELECT group_id FROM group_members WHERE user_id = $2
		     ))
		   )`,
		[virtualPath, userId],
	)
	const levels = (rows as Array<{level: AclLevel}>).map((r) => r.level)
	return evaluateAclLevel(levels)
}

/**
 * Phase 336 (ACLUI-01) — every DISTINCT virtual_path a user can actually reach
 * (direct grant OR via a group), with its most-permissive effective level, for
 * the web `/Shared` root listing. Excludes paths whose ONLY applicable rule is
 * `none` (a sole-override deny surfaces nothing). Returns [] on no-DB (fail-safe
 * → the `/Shared` root is simply empty). Ordered by path for a stable listing.
 *
 * NOTE: this is the SET of granted paths (the roots the user may enter); the
 * per-op level for a DEEPER path inside a granted folder is resolved separately
 * by the enforcement layer's nearest-ancestor walk (nearestAncestorAclLevel).
 */
export async function listGrantedPathsForUser(
	userId: string,
	runner?: QueryRunner | null,
): Promise<Array<{virtualPath: string; level: AclLevel}>> {
	const db = resolveRunner(runner)
	if (!db) return []
	const {rows} = await db.query(
		`SELECT virtual_path, level
		 FROM file_acls
		 WHERE (principal_type = 'user' AND principal_id = $1)
		    OR (principal_type = 'group' AND principal_id IN (
		         SELECT group_id FROM group_members WHERE user_id = $1
		       ))`,
		[userId],
	)
	// Collapse multiple principal rules per path via the same most-permissive
	// union used at read time, then drop sole-`none` (and the impossible null).
	const byPath = new Map<string, AclLevel[]>()
	for (const r of rows as Array<{virtual_path: string; level: AclLevel}>) {
		const list = byPath.get(r.virtual_path) ?? []
		list.push(r.level)
		byPath.set(r.virtual_path, list)
	}
	const out: Array<{virtualPath: string; level: AclLevel}> = []
	for (const [virtualPath, levels] of byPath) {
		const level = evaluateAclLevel(levels)
		if (level === 'read' || level === 'write') out.push({virtualPath, level})
	}
	out.sort((a, b) => a.virtualPath.localeCompare(b.virtualPath))
	return out
}

/**
 * Phase 336 (ACLUI-01) — nearest-ancestor effective level for the web
 * enforcement layer. The DAO stores/serves grants EXACT-path (non-inheriting,
 * Samba-consistent), but a web folder share must reach its children — so the
 * enforcement layer walks the requested path and each ancestor, NEAREST first,
 * and the FIRST path with an applicable rule GOVERNS (most-specific wins: an
 * explicit `none` on a child overrides an inherited `write` from the parent).
 * Returns null when no ancestor has any rule (→ fail-safe deny at the caller).
 *
 * Pure w.r.t. the injected `getLevel` so it is unit-testable offline. `innerPath`
 * is the grant-namespace path (the `/Shared` prefix already stripped), POSIX
 * absolute, already normalized by the caller.
 */
export async function nearestAncestorAclLevel(
	innerPath: string,
	getLevel: (path: string) => Promise<AclLevel | null>,
): Promise<AclLevel | null> {
	const segments = innerPath.split('/').filter(Boolean)
	// Walk from the deepest path up to the first segment (a single base segment
	// like `/Home` is a valid grant target; the empty root is not).
	for (let i = segments.length; i >= 1; i--) {
		const candidate = '/' + segments.slice(0, i).join('/')
		const level = await getLevel(candidate)
		if (level !== null) return level // nearest applicable rule governs
	}
	return null
}
