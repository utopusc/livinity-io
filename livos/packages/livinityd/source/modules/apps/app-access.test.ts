/**
 * Phase 323-05 IDENT-04 — apps/app-access.ts DAO tests.
 *
 * Offline, mocked-pool discipline (mirrors file-acls.test.ts / webauthn.test.ts).
 * No live Postgres: an in-memory fake query-runner is injected so the
 * most-permissive eval + the two-table UNION + fail-open semantics are
 * deterministically asserted.
 *
 * Contract pinned here (D-06/D-07/D-08):
 *   - evaluateAppAccessLevel is most-permissive over none < readonly < full;
 *     [] → 'none' (fails CLOSED to least access — T-323-14).
 *   - getEffectiveAppAccess UNIONs BOTH tables: a direct user_app_access grant
 *     AND a group grant via group_members. A member of a group with a 'full'
 *     app_access row gets 'full' even with NO direct grant.
 *   - grant/revoke/list write & read the app_access table (group grants).
 *   - every DAO fn FAILS CLOSED/OPEN when getPool() is null (reads 'none'/[],
 *     writes void) so a legacy no-DB single-user box never throws.
 */

import {describe, expect, test} from 'vitest'

import {
	evaluateAppAccessLevel,
	getEffectiveAppAccess,
	grantAppAccessToGroup,
	revokeAppAccessFromGroup,
	listAppAccessPrincipals,
	type QueryRunner,
} from './app-access.js'
import {ALL_MIGRATIONS} from '../database/migrations/index.js'

// A row in the fake app_access store.
interface AppAccessRow {
	app_id: string
	principal_type: 'user' | 'group'
	principal_id: string
	access_type: 'none' | 'readonly' | 'full'
	granted_by: string | null
	granted_at: string
}

// A row in the fake user_app_access store (direct-user grants).
interface UserAppAccessRow {
	app_id: string
	user_id: string
	access_type: 'none' | 'readonly' | 'full'
}

// A row in the fake group_members store.
interface MemberRow {
	group_id: string
	user_id: string
}

function makeFakeRunner(seed?: {
	appAccess?: AppAccessRow[]
	userAppAccess?: UserAppAccessRow[]
	members?: MemberRow[]
}): {runner: QueryRunner; appAccess: AppAccessRow[]} {
	const appAccess: AppAccessRow[] = [...(seed?.appAccess ?? [])]
	const userAppAccess: UserAppAccessRow[] = [...(seed?.userAppAccess ?? [])]
	const members: MemberRow[] = [...(seed?.members ?? [])]
	const NOW = new Date('2026-07-16T00:00:00Z').toISOString()

	const runner: QueryRunner = {
		query: (async (text: string, params: any[] = []) => {
			const sql = String(text)

			// getEffectiveAppAccess — UNION user_app_access (direct) + app_access (group)
			if (/UNION ALL/i.test(sql) && /user_app_access/i.test(sql) && /app_access/i.test(sql)) {
				const [appId, userId] = params
				const groupIds = members.filter((m) => m.user_id === userId).map((m) => m.group_id)
				const direct = userAppAccess
					.filter((r) => r.app_id === appId && r.user_id === userId)
					.map((r) => ({access_type: r.access_type}))
				const group = appAccess
					.filter((r) => r.app_id === appId && r.principal_type === 'group' && groupIds.includes(r.principal_id))
					.map((r) => ({access_type: r.access_type}))
				return {rows: [...direct, ...group], rowCount: direct.length + group.length}
			}

			// grantAppAccessToGroup — INSERT ... principal_type='group' ON CONFLICT DO UPDATE
			if (/INSERT INTO app_access/i.test(sql)) {
				const [app_id, principal_id, granted_by, access_type] = params
				const existing = appAccess.find(
					(r) => r.app_id === app_id && r.principal_type === 'group' && r.principal_id === principal_id,
				)
				if (existing) {
					existing.access_type = access_type
					existing.granted_by = granted_by ?? null
					return {rows: [existing], rowCount: 1}
				}
				const row: AppAccessRow = {
					app_id,
					principal_type: 'group',
					principal_id,
					access_type,
					granted_by: granted_by ?? null,
					granted_at: NOW,
				}
				appAccess.push(row)
				return {rows: [row], rowCount: 1}
			}

			// revokeAppAccessFromGroup — DELETE ... principal_type='group'
			if (/DELETE FROM app_access/i.test(sql)) {
				const [app_id, principal_id] = params
				const i = appAccess.findIndex(
					(r) => r.app_id === app_id && r.principal_type === 'group' && r.principal_id === principal_id,
				)
				if (i < 0) return {rows: [], rowCount: 0}
				appAccess.splice(i, 1)
				return {rows: [], rowCount: 1}
			}

			// listAppAccessPrincipals — SELECT ... WHERE app_id=$1
			if (/SELECT[\s\S]*FROM app_access[\s\S]*app_id\s*=\s*\$1/i.test(sql)) {
				const out = appAccess.filter((r) => r.app_id === params[0])
				return {rows: out, rowCount: out.length}
			}

			throw new Error(`unexpected SQL: ${sql}`)
		}) as any,
	}
	return {runner, appAccess}
}

const APP = 'nextcloud'
const USER_A = '00000000-0000-4000-8000-0000000000a1'
const GROUP_X = '00000000-0000-4000-8000-0000000000b1'

describe('evaluateAppAccessLevel — most-permissive over none < readonly < full', () => {
	test('any full present → full', () => {
		expect(evaluateAppAccessLevel(['readonly', 'full'])).toBe('full')
		expect(evaluateAppAccessLevel(['full'])).toBe('full')
		expect(evaluateAppAccessLevel(['none', 'full'])).toBe('full')
	})
	test('else any readonly → readonly', () => {
		expect(evaluateAppAccessLevel(['none', 'readonly'])).toBe('readonly')
		expect(evaluateAppAccessLevel(['readonly'])).toBe('readonly')
	})
	test('no rows → none (fails closed to least access)', () => {
		expect(evaluateAppAccessLevel([])).toBe('none')
		expect(evaluateAppAccessLevel(['none'])).toBe('none')
	})
})

describe('getEffectiveAppAccess — UNION both tables (D-07 b-i)', () => {
	test('group-only: a member of a group with a full app_access row gets full (no direct grant)', async () => {
		const {runner} = makeFakeRunner({
			appAccess: [
				{app_id: APP, principal_type: 'group', principal_id: GROUP_X, access_type: 'full', granted_by: null, granted_at: ''},
			],
			members: [{group_id: GROUP_X, user_id: USER_A}],
		})
		expect(await getEffectiveAppAccess(APP, USER_A, runner)).toBe('full')
	})

	test('direct-only: a direct readonly user_app_access grant yields readonly', async () => {
		const {runner} = makeFakeRunner({
			userAppAccess: [{app_id: APP, user_id: USER_A, access_type: 'readonly'}],
		})
		expect(await getEffectiveAppAccess(APP, USER_A, runner)).toBe('readonly')
	})

	test('both: direct readonly + group full → full (most-permissive wins)', async () => {
		const {runner} = makeFakeRunner({
			userAppAccess: [{app_id: APP, user_id: USER_A, access_type: 'readonly'}],
			appAccess: [
				{app_id: APP, principal_type: 'group', principal_id: GROUP_X, access_type: 'full', granted_by: null, granted_at: ''},
			],
			members: [{group_id: GROUP_X, user_id: USER_A}],
		})
		expect(await getEffectiveAppAccess(APP, USER_A, runner)).toBe('full')
	})

	test('none: no direct grant + not a member of the granted group → none', async () => {
		const {runner} = makeFakeRunner({
			appAccess: [
				{app_id: APP, principal_type: 'group', principal_id: GROUP_X, access_type: 'full', granted_by: null, granted_at: ''},
			],
			members: [], // USER_A is NOT in GROUP_X
		})
		expect(await getEffectiveAppAccess(APP, USER_A, runner)).toBe('none')
	})
})

describe('group-grant writes on app_access', () => {
	test('grantAppAccessToGroup defaults to full; re-grant updates in place (no dup)', async () => {
		const {runner, appAccess} = makeFakeRunner()
		await grantAppAccessToGroup(APP, GROUP_X, 'admin', undefined, runner)
		expect(appAccess).toHaveLength(1)
		expect(appAccess[0]).toMatchObject({principal_type: 'group', access_type: 'full'})
		// re-grant as readonly overwrites, no dup
		await grantAppAccessToGroup(APP, GROUP_X, 'admin', 'readonly', runner)
		expect(appAccess).toHaveLength(1)
		expect(appAccess[0].access_type).toBe('readonly')
	})

	test('revokeAppAccessFromGroup removes the group row', async () => {
		const {runner, appAccess} = makeFakeRunner({
			appAccess: [
				{app_id: APP, principal_type: 'group', principal_id: GROUP_X, access_type: 'full', granted_by: null, granted_at: ''},
			],
		})
		expect(await revokeAppAccessFromGroup(APP, GROUP_X, runner)).toBe(true)
		expect(appAccess).toHaveLength(0)
		// second revoke → false (miss), never throws
		expect(await revokeAppAccessFromGroup(APP, GROUP_X, runner)).toBe(false)
	})

	test('listAppAccessPrincipals returns every grant for the app', async () => {
		const {runner} = makeFakeRunner({
			appAccess: [
				{app_id: APP, principal_type: 'group', principal_id: GROUP_X, access_type: 'full', granted_by: null, granted_at: ''},
			],
		})
		const list = await listAppAccessPrincipals(APP, runner)
		expect(list).toHaveLength(1)
		expect(list[0].principal_id).toBe(GROUP_X)
	})
})

describe('fail-open on no-DB (null runner)', () => {
	test('reads → none/[], writes → void/false, never throws', async () => {
		expect(await getEffectiveAppAccess(APP, USER_A, null)).toBe('none')
		expect(await listAppAccessPrincipals(APP, null)).toEqual([])
		expect(await revokeAppAccessFromGroup(APP, GROUP_X, null)).toBe(false)
		await expect(grantAppAccessToGroup(APP, GROUP_X, 'admin', 'full', null)).resolves.toBeUndefined()
	})
})

describe('migration-registration guard (drift #7 / 325 omission lesson)', () => {
	test('app_access migration is registered in ALL_MIGRATIONS', () => {
		expect(ALL_MIGRATIONS).toContain('2026-07-16-p323-app-access.sql')
		// the prior 323-01 webauthn entry must remain untouched.
		expect(ALL_MIGRATIONS).toContain('2026-07-16-p323-webauthn-credentials.sql')
	})
})
