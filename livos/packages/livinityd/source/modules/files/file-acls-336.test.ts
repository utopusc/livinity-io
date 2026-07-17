/**
 * Phase 336 (ACLUI-01) — the web-enforcement DAO additions:
 *   - nearestAncestorAclLevel: the enforcement-layer ancestor walk (NEAREST
 *     grant governs; folder shares reach children; explicit child override wins).
 *   - listGrantedPathsForUser: the /Shared root's granted-path set (union per
 *     path, sole-`none` excluded, fail-safe empty on no-DB).
 * Offline — a fake `getLevel` fn / pg-shaped runner (file-acls.test.ts style).
 */
import {describe, expect, test} from 'vitest'

import {
	nearestAncestorAclLevel,
	listGrantedPathsForUser,
	type AclLevel,
	type QueryRunner,
} from './file-acls.js'

describe('nearestAncestorAclLevel — web enforcement ancestor walk (D-336-2)', () => {
	const walk = (grants: Record<string, AclLevel>, path: string) =>
		nearestAncestorAclLevel(path, async (p) => grants[p] ?? null)

	test('an EXACT-path grant governs', async () => {
		expect(await walk({'/Home/Shared': 'read'}, '/Home/Shared')).toBe('read')
	})

	test('a PARENT-folder grant reaches a child (inheritance the DAO alone lacks)', async () => {
		expect(await walk({'/Home/Shared': 'write'}, '/Home/Shared/sub/file.txt')).toBe('write')
	})

	test('the NEAREST ancestor wins — an explicit child grant overrides the parent', async () => {
		// parent write, child read → the deeper (nearer) read governs the child.
		expect(await walk({'/Home/Shared': 'write', '/Home/Shared/sub': 'read'}, '/Home/Shared/sub/x')).toBe('read')
	})

	test("a child's explicit 'none' overrides an inherited parent write (deny)", async () => {
		expect(await walk({'/Home/Shared': 'write', '/Home/Shared/secret': 'none'}, '/Home/Shared/secret/x')).toBe(
			'none',
		)
	})

	test('no grant on the path or ANY ancestor → null (fail-safe deny at the caller)', async () => {
		expect(await walk({'/Other/thing': 'read'}, '/Home/Shared/file.txt')).toBeNull()
	})

	test('a single base segment IS a valid grant target; the empty root is not walked', async () => {
		expect(await walk({'/Home': 'read'}, '/Home')).toBe('read')
		expect(await walk({}, '/')).toBeNull()
	})
})

// ── listGrantedPathsForUser — fake pg runner over the union query ──────────────
type Rec = {virtual_path: string; principal_type: 'user' | 'group'; principal_id: string; level: AclLevel}

function makeRunner(acls: Rec[], groupsOfUser: Record<string, string[]> = {}): QueryRunner {
	return {
		query: (async (_text: string, params: unknown[] = []) => {
			const userId = params[0] as string
			const groups = new Set(groupsOfUser[userId] ?? [])
			const rows = acls
				.filter(
					(a) =>
						(a.principal_type === 'user' && a.principal_id === userId) ||
						(a.principal_type === 'group' && groups.has(a.principal_id)),
				)
				.map((a) => ({virtual_path: a.virtual_path, level: a.level}))
			return {rows, rowCount: rows.length}
		}) as never,
	}
}

describe('listGrantedPathsForUser — /Shared root set (D-336-4)', () => {
	const U = 'user-1'

	test('direct + group grants both surface; union to most-permissive per path', async () => {
		const runner = makeRunner(
			[
				{virtual_path: '/Home/A', principal_type: 'user', principal_id: U, level: 'read'},
				{virtual_path: '/Home/A', principal_type: 'group', principal_id: 'g1', level: 'write'},
				{virtual_path: '/Apps/B', principal_type: 'group', principal_id: 'g1', level: 'read'},
			],
			{[U]: ['g1']},
		)
		const out = await listGrantedPathsForUser(U, runner)
		expect(out).toEqual([
			{virtualPath: '/Apps/B', level: 'read'},
			{virtualPath: '/Home/A', level: 'write'}, // read ∪ write → write
		])
	})

	test('a sole-`none` path is EXCLUDED (surfaces nothing under /Shared)', async () => {
		const runner = makeRunner([{virtual_path: '/Home/S', principal_type: 'user', principal_id: U, level: 'none'}])
		expect(await listGrantedPathsForUser(U, runner)).toEqual([])
	})

	test("another user's grants do NOT leak", async () => {
		const runner = makeRunner([{virtual_path: '/Home/X', principal_type: 'user', principal_id: 'someone-else', level: 'write'}])
		expect(await listGrantedPathsForUser(U, runner)).toEqual([])
	})

	test('no DB (null runner) → [] (fail-safe empty root)', async () => {
		expect(await listGrantedPathsForUser(U, null)).toEqual([])
	})
})
