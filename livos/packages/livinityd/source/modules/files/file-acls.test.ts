/**
 * Phase 324-02 FILES-02 — file-acls.ts DAO + getEffectivePermission tests.
 *
 * Offline, mocked-pool discipline (mirrors database/groups.test.ts). No live
 * Postgres: an in-memory fake query-runner is injected so the SQL contract +
 * most-permissive-union evaluation + fail-open semantics are deterministically
 * asserted.
 *
 * Security contract pinned here (D-07 / D-08):
 *   - getEffectiveLevel = most-permissive UNION of {user-direct grant, every
 *     group grant at the EXACT path}; `none` is an explicit override ONLY when
 *     it is the SOLE applicable rule; NON-inheriting, explicit-path-only v1.
 *   - every DAO fn FAILS OPEN when getPool() is null (reads []/null, writes
 *     false/null) so a legacy no-DB box never throws.
 *   - parameterized $1..$N only — no string interpolation of path/principal.
 *   - getEffectivePermission (files.ts) is consulted ONLY for paths OUTSIDE the
 *     caller's own per-user tree; own-Home paths stay ownership-governed; a
 *     grant only ADDS visibility and never escapes virtualToSystemPath.
 */

import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import nodePath from 'node:path'

import {beforeEach, describe, expect, test, vi} from 'vitest'

import {
	listAclsForPath,
	grantAcl,
	revokeAcl,
	getEffectiveLevel,
	evaluateAclLevel,
	type QueryRunner,
	type AclLevel,
} from './file-acls.js'
import {ALL_MIGRATIONS} from '../database/migrations/index.js'

// ── in-memory file_acls + group_members store behind a pg-shaped runner ───────
type AclRec = {
	virtual_path: string
	principal_type: 'user' | 'group'
	principal_id: string
	level: AclLevel
	granted_by: string | null
	created_at: string
}
type MemberRec = {group_id: string; user_id: string}

function makeFakeRunner(seed?: {acls?: AclRec[]; members?: MemberRec[]}): {
	runner: QueryRunner
	acls: AclRec[]
	members: MemberRec[]
} {
	const acls: AclRec[] = [...(seed?.acls ?? [])]
	const members: MemberRec[] = [...(seed?.members ?? [])]
	const NOW = new Date('2026-07-15T00:00:00Z').toISOString()

	const runner: QueryRunner = {
		query: (async (text: string, params: any[] = []) => {
			const sql = String(text)

			// getEffectiveLevel — SELECT level FROM file_acls WHERE ... group_members subquery
			if (/FROM file_acls/i.test(sql) && /group_members/i.test(sql)) {
				const [path, userId] = params
				const userGroups = new Set(members.filter((m) => m.user_id === userId).map((m) => m.group_id))
				const rows = acls
					.filter(
						(a) =>
							a.virtual_path === path &&
							((a.principal_type === 'user' && a.principal_id === userId) ||
								(a.principal_type === 'group' && userGroups.has(a.principal_id))),
					)
					.map((a) => ({level: a.level}))
				return {rows, rowCount: rows.length}
			}

			// listAclsForPath — SELECT ... FROM file_acls WHERE virtual_path=$1 (no subquery)
			if (/FROM file_acls/i.test(sql)) {
				const rows = acls
					.filter((a) => a.virtual_path === params[0])
					.sort((x, y) =>
						`${x.principal_type}:${x.principal_id}`.localeCompare(`${y.principal_type}:${y.principal_id}`),
					)
				return {rows, rowCount: rows.length}
			}

			// grantAcl — INSERT INTO file_acls (...) ON CONFLICT ... DO UPDATE ... RETURNING ...
			if (/INSERT INTO file_acls/i.test(sql)) {
				const [virtual_path, principal_type, principal_id, level, granted_by] = params
				const existing = acls.find(
					(a) =>
						a.virtual_path === virtual_path &&
						a.principal_type === principal_type &&
						a.principal_id === principal_id,
				)
				const row: AclRec = existing ?? {
					virtual_path,
					principal_type,
					principal_id,
					level,
					granted_by: granted_by ?? null,
					created_at: NOW,
				}
				row.level = level
				row.granted_by = granted_by ?? null
				if (!existing) acls.push(row)
				return {rows: [row], rowCount: 1}
			}

			// revokeAcl — DELETE FROM file_acls WHERE virtual_path=$1 AND principal_type=$2 AND principal_id=$3
			if (/DELETE FROM file_acls/i.test(sql)) {
				const i = acls.findIndex(
					(a) =>
						a.virtual_path === params[0] &&
						a.principal_type === params[1] &&
						a.principal_id === params[2],
				)
				if (i < 0) return {rows: [], rowCount: 0}
				acls.splice(i, 1)
				return {rows: [], rowCount: 1}
			}

			throw new Error(`unexpected SQL: ${sql}`)
		}) as any,
	}
	return {runner, acls, members}
}

const PATH = '/shared/reports'
const USER = '00000000-0000-4000-8000-0000000000a1'
const GROUP_STAFF = '00000000-0000-4000-8000-0000000000f1'
const GROUP_ADMINS = '00000000-0000-4000-8000-0000000000f2'

describe('file-acls DAO — FILES-02 (D-07/D-08)', () => {
	// ── evaluateAclLevel — pure most-permissive-union + none-sole-override ──────
	test('evaluateAclLevel: user read + group write → write (most-permissive union)', () => {
		expect(evaluateAclLevel(['read', 'write'])).toBe('write')
		expect(evaluateAclLevel(['write', 'read'])).toBe('write')
	})

	test('evaluateAclLevel: sole none → none (explicit override)', () => {
		expect(evaluateAclLevel(['none'])).toBe('none')
		expect(evaluateAclLevel(['none', 'none'])).toBe('none')
	})

	test('evaluateAclLevel: none coexisting with read → read (none overrides only when sole)', () => {
		expect(evaluateAclLevel(['none', 'read'])).toBe('read')
		expect(evaluateAclLevel(['none', 'write'])).toBe('write')
	})

	test('evaluateAclLevel: no applicable rule → null', () => {
		expect(evaluateAclLevel([])).toBeNull()
	})

	// ── getEffectiveLevel — union across user-direct + group grants ────────────
	test('getEffectiveLevel: user-direct read + group write at same path → write', async () => {
		const {runner} = makeFakeRunner({
			acls: [
				{virtual_path: PATH, principal_type: 'user', principal_id: USER, level: 'read', granted_by: null, created_at: ''},
				{virtual_path: PATH, principal_type: 'group', principal_id: GROUP_STAFF, level: 'write', granted_by: null, created_at: ''},
			],
			members: [{group_id: GROUP_STAFF, user_id: USER}],
		})
		expect(await getEffectiveLevel(PATH, USER, runner)).toBe('write')
	})

	test('getEffectiveLevel: sole applicable none → none', async () => {
		const {runner} = makeFakeRunner({
			acls: [
				{virtual_path: PATH, principal_type: 'user', principal_id: USER, level: 'none', granted_by: null, created_at: ''},
			],
		})
		expect(await getEffectiveLevel(PATH, USER, runner)).toBe('none')
	})

	test('getEffectiveLevel: none (user) + read (group) → read', async () => {
		const {runner} = makeFakeRunner({
			acls: [
				{virtual_path: PATH, principal_type: 'user', principal_id: USER, level: 'none', granted_by: null, created_at: ''},
				{virtual_path: PATH, principal_type: 'group', principal_id: GROUP_ADMINS, level: 'read', granted_by: null, created_at: ''},
			],
			members: [{group_id: GROUP_ADMINS, user_id: USER}],
		})
		expect(await getEffectiveLevel(PATH, USER, runner)).toBe('read')
	})

	test('getEffectiveLevel: no grant for the user at that path → null', async () => {
		const {runner} = makeFakeRunner({
			acls: [
				// a grant to a group the user is NOT in must not apply
				{virtual_path: PATH, principal_type: 'group', principal_id: GROUP_STAFF, level: 'write', granted_by: null, created_at: ''},
			],
			members: [],
		})
		expect(await getEffectiveLevel(PATH, USER, runner)).toBeNull()
	})

	test('getEffectiveLevel: NON-inheriting — a grant on a parent path does not apply to a child', async () => {
		const {runner} = makeFakeRunner({
			acls: [
				{virtual_path: '/shared', principal_type: 'user', principal_id: USER, level: 'write', granted_by: null, created_at: ''},
			],
		})
		// Exact-path v1: the child path has no direct grant.
		expect(await getEffectiveLevel('/shared/reports', USER, runner)).toBeNull()
	})

	// ── grant / revoke / list ─────────────────────────────────────────────────
	test('grantAcl upserts and returns the row; listAclsForPath lists path grants', async () => {
		const {runner} = makeFakeRunner()
		const row = await grantAcl(
			{virtualPath: PATH, principalType: 'user', principalId: USER, level: 'read', grantedBy: USER},
			runner,
		)
		expect(row).not.toBeNull()
		expect(row).toMatchObject({virtual_path: PATH, principal_type: 'user', principal_id: USER, level: 'read'})

		// upsert: re-grant with a higher level updates in place (still one row).
		await grantAcl({virtualPath: PATH, principalType: 'user', principalId: USER, level: 'write'}, runner)
		const list = await listAclsForPath(PATH, runner)
		expect(list).toHaveLength(1)
		expect(list[0].level).toBe('write')
	})

	test('revokeAcl removes the grant; returns false on miss', async () => {
		const {runner} = makeFakeRunner({
			acls: [
				{virtual_path: PATH, principal_type: 'user', principal_id: USER, level: 'read', granted_by: null, created_at: ''},
			],
		})
		expect(await revokeAcl(PATH, 'user', USER, runner)).toBe(true)
		expect(await revokeAcl(PATH, 'user', USER, runner)).toBe(false)
		expect(await listAclsForPath(PATH, runner)).toEqual([])
	})

	// ── fail-open on no-DB (null runner) ──────────────────────────────────────
	test('null runner → reads [], writes false/null, effective-level null, never throws', async () => {
		expect(await listAclsForPath(PATH, null)).toEqual([])
		expect(await getEffectiveLevel(PATH, USER, null)).toBeNull()
		expect(await grantAcl({virtualPath: PATH, principalType: 'user', principalId: USER, level: 'read'}, null)).toBeNull()
		expect(await revokeAcl(PATH, 'user', USER, null)).toBe(false)
	})

	// ── source guard: parameterized SQL only (no interpolated path/principal) ──
	test('file-acls.ts uses only parameterized $N SQL (no interpolated path/principal/level)', () => {
		const here = nodePath.dirname(fileURLToPath(import.meta.url))
		const src = readFileSync(nodePath.resolve(here, './file-acls.ts'), 'utf8')
		// No `${...path...}` / `${...principal...}` / `${...level...}` inside a SQL-ish string.
		expect(src).not.toMatch(/\$\{[^}]*(path|principal|level)[^}]*\}/i)
		expect(src).toContain('$1')
	})

	// ── migration-registration guard (drift #7 / 325 omission lesson) ─────────
	test('file_acls migration is registered in ALL_MIGRATIONS', () => {
		expect(ALL_MIGRATIONS).toContain('2026-07-15-p324-file-acls.sql')
		// The 324-01 file_shares registration must remain untouched.
		expect(ALL_MIGRATIONS).toContain('2026-07-15-p324-file-shares.sql')
	})
})
