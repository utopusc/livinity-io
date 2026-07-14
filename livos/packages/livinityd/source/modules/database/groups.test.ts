/**
 * Phase 322-01 (IDENT-01) — groups DAO tests.
 *
 * Offline, mocked-pool discipline (mirrors sessions.test.ts). No live Postgres:
 * an in-memory fake query-runner is injected so the SQL contract + CRUD /
 * membership / fail-open semantics are deterministically asserted.
 *
 * Coverage:
 *   T1 — createGroup returns the inserted GroupRow when a pool exists; returns
 *        null when the runner is null (no-DB fail-open).
 *   T2 — addGroupMember is idempotent: inserting the same (group_id, user_id)
 *        twice does not throw (ON CONFLICT DO NOTHING).
 *   T3 — removeGroupMember / deleteGroup return false when nothing matched
 *        (rowCount 0) and true when a row was affected; renameGroup likewise.
 *   T4 — listGroupNamesForUser returns the JOINed group names for the user
 *        (the OIDC-claim consumer contract, 322-04); listGroupMembers JOINs users.
 *   T5 — every read returns [] and every write no-ops (never throws) with a null
 *        runner (proves fail-open for the legacy single-user / no-DB box).
 */

import {beforeEach, describe, expect, test} from 'vitest'

import {
	createGroup,
	renameGroup,
	deleteGroup,
	listGroups,
	addGroupMember,
	removeGroupMember,
	listGroupMembers,
	listGroupNamesForUser,
	type QueryRunner,
} from './groups.js'

// In-memory groups + group_members store behind a pg-shaped query runner so the
// DAO's real SQL strings drive a fake DB. We pattern-match the SQL the DAO emits.
type GroupRec = {id: string; name: string; description: string | null; created_by: string | null}
type MemberRec = {group_id: string; user_id: string; added_by: string | null; added_at: string}

function makeFakeRunner(): {runner: QueryRunner; groups: GroupRec[]; members: MemberRec[]} {
	const groups: GroupRec[] = []
	const members: MemberRec[] = []
	// user_id → username, so listGroupMembers can JOIN users deterministically.
	const usernames: Record<string, string> = {
		'00000000-0000-4000-8000-0000000000a1': 'alice',
		'00000000-0000-4000-8000-0000000000b2': 'bob',
	}
	const NOW = new Date('2026-07-14T00:00:00Z').toISOString()

	const runner: QueryRunner = {
		query: (async (text: string, params: any[] = []) => {
			const sql = String(text)

			// createGroup — INSERT INTO groups (...) RETURNING ...
			if (/INSERT INTO groups/i.test(sql)) {
				const row: GroupRec & {created_at: string; updated_at: string} = {
					id: `grp-${groups.length + 1}`,
					name: params[0],
					description: params[1] ?? null,
					created_by: params[2] ?? null,
					created_at: NOW,
					updated_at: NOW,
				}
				groups.push(row)
				return {rows: [row], rowCount: 1}
			}

			// renameGroup — UPDATE groups SET name=$2, description=COALESCE($3, description) WHERE id=$1
			if (/UPDATE groups SET name/i.test(sql)) {
				const g = groups.find((x) => x.id === params[0])
				if (!g) return {rows: [], rowCount: 0}
				g.name = params[1]
				if (params[2] != null) g.description = params[2]
				return {rows: [], rowCount: 1}
			}

			// deleteGroup — DELETE FROM groups WHERE id=$1 (members cascade)
			if (/DELETE FROM groups WHERE id/i.test(sql)) {
				const i = groups.findIndex((x) => x.id === params[0])
				if (i < 0) return {rows: [], rowCount: 0}
				groups.splice(i, 1)
				for (let j = members.length - 1; j >= 0; j--) {
					if (members[j].group_id === params[0]) members.splice(j, 1)
				}
				return {rows: [], rowCount: 1}
			}

			// listGroups — SELECT ... FROM groups ORDER BY name ASC
			if (/FROM groups\s+ORDER BY name/i.test(sql)) {
				const rows = [...groups].sort((a, b) => a.name.localeCompare(b.name))
				return {rows, rowCount: rows.length}
			}

			// addGroupMember — INSERT INTO group_members (...) ON CONFLICT DO NOTHING
			if (/INSERT INTO group_members/i.test(sql)) {
				const exists = members.some((m) => m.group_id === params[0] && m.user_id === params[1])
				if (!exists) members.push({group_id: params[0], user_id: params[1], added_by: params[2] ?? null, added_at: NOW})
				return {rows: [], rowCount: exists ? 0 : 1}
			}

			// removeGroupMember — DELETE FROM group_members WHERE group_id=$1 AND user_id=$2
			if (/DELETE FROM group_members WHERE group_id/i.test(sql)) {
				const i = members.findIndex((m) => m.group_id === params[0] && m.user_id === params[1])
				if (i < 0) return {rows: [], rowCount: 0}
				members.splice(i, 1)
				return {rows: [], rowCount: 1}
			}

			// listGroupMembers — SELECT m.user_id, u.username ... JOIN users u WHERE m.group_id=$1
			if (/JOIN users u/i.test(sql)) {
				const rows = members
					.filter((m) => m.group_id === params[0])
					.map((m) => ({user_id: m.user_id, username: usernames[m.user_id] ?? m.user_id, added_at: m.added_at}))
					.sort((a, b) => a.username.localeCompare(b.username))
				return {rows, rowCount: rows.length}
			}

			// listGroupNamesForUser — SELECT g.name ... JOIN groups g WHERE m.user_id=$1
			if (/JOIN groups g/i.test(sql)) {
				const names = members
					.filter((m) => m.user_id === params[0])
					.map((m) => groups.find((g) => g.id === m.group_id)?.name)
					.filter((n): n is string => Boolean(n))
					.sort((a, b) => a.localeCompare(b))
				return {rows: names.map((name) => ({name})), rowCount: names.length}
			}

			throw new Error(`unexpected SQL: ${sql}`)
		}) as any,
	}
	return {runner, groups, members}
}

const USER_A = '00000000-0000-4000-8000-0000000000a1'
const USER_B = '00000000-0000-4000-8000-0000000000b2'

describe('groups DAO — IDENT-01', () => {
	let runner: QueryRunner
	let members: MemberRec[]
	beforeEach(() => {
		;({runner, members} = makeFakeRunner())
	})

	test('T1 — createGroup returns the inserted GroupRow', async () => {
		const g = await createGroup({name: 'staff', description: 'Company staff', createdBy: USER_A}, runner)
		expect(g).not.toBeNull()
		expect(g).toMatchObject({name: 'staff', description: 'Company staff', created_by: USER_A})
		expect(typeof g!.id).toBe('string')
		expect(g!.created_at).toBeTruthy()
	})

	test('T2 — addGroupMember is idempotent (ON CONFLICT DO NOTHING, no throw)', async () => {
		const g = await createGroup({name: 'staff'}, runner)
		await addGroupMember({groupId: g!.id, userId: USER_A}, runner)
		await expect(addGroupMember({groupId: g!.id, userId: USER_A}, runner)).resolves.toBeUndefined()
		// Still exactly one membership row for (group, user).
		expect(members.filter((m) => m.group_id === g!.id && m.user_id === USER_A)).toHaveLength(1)
	})

	test('T3 — remove/delete/rename return false on miss, true on hit', async () => {
		const g = await createGroup({name: 'staff'}, runner)
		await addGroupMember({groupId: g!.id, userId: USER_A}, runner)

		// Miss cases → false.
		expect(await removeGroupMember(g!.id, USER_B, runner)).toBe(false)
		expect(await deleteGroup('grp-does-not-exist', runner)).toBe(false)
		expect(await renameGroup('grp-does-not-exist', 'x', null, runner)).toBe(false)

		// Hit cases → true.
		expect(await renameGroup(g!.id, 'employees', 'renamed', runner)).toBe(true)
		expect(await removeGroupMember(g!.id, USER_A, runner)).toBe(true)
		expect(await deleteGroup(g!.id, runner)).toBe(true)
	})

	test('T4 — listGroupNamesForUser JOINs names; listGroups + listGroupMembers ordered', async () => {
		const staff = await createGroup({name: 'staff'}, runner)
		const admins = await createGroup({name: 'admins'}, runner)
		await addGroupMember({groupId: staff!.id, userId: USER_A}, runner)
		await addGroupMember({groupId: admins!.id, userId: USER_A}, runner)
		await addGroupMember({groupId: staff!.id, userId: USER_B}, runner)

		// The OIDC-claim contract (322-04): the user's group names, sorted.
		expect(await listGroupNamesForUser(USER_A, runner)).toEqual(['admins', 'staff'])
		expect(await listGroupNamesForUser(USER_B, runner)).toEqual(['staff'])

		// listGroups returns all, name-ordered.
		expect((await listGroups(runner)).map((g) => g.name)).toEqual(['admins', 'staff'])

		// listGroupMembers returns the group's users, username-ordered.
		expect((await listGroupMembers(staff!.id, runner)).map((m) => m.username)).toEqual(['alice', 'bob'])
	})

	test('T5 — no-DB (null runner) → reads [], writes no-op, never throws (fail-open)', async () => {
		expect(await createGroup({name: 'staff'}, null)).toBeNull()
		expect(await renameGroup('x', 'y', null, null)).toBe(false)
		expect(await deleteGroup('x', null)).toBe(false)
		expect(await removeGroupMember('x', 'y', null)).toBe(false)
		await expect(addGroupMember({groupId: 'x', userId: 'y'}, null)).resolves.toBeUndefined()

		expect(await listGroups(null)).toEqual([])
		expect(await listGroupMembers('x', null)).toEqual([])
		expect(await listGroupNamesForUser('x', null)).toEqual([])
	})
})
