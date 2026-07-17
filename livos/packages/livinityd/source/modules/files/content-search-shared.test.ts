/**
 * Phase 337-02 (FTS-01) — the /Shared content-search ACL post-filter DECISION plus the
 * granted-root enumeration + inner→/Shared mapping that feed the cross-user scan. OFFLINE
 * unit — a fake `getLevel` fn / a pg-shaped QueryRunner (file-acls-336.test.ts style), NO
 * live Postgres. The GRANTED cross-user happy path (actually seeing another user's file
 * CONTENT via a real grant) needs a live multi-user Postgres fixture and is deferred to
 * 337-HUMAN-UAT, exactly as 336 deferred its granted happy path. Here we pin the pure
 * DECISION logic (the D-337-3 none-override leak gate is the slice's security gate).
 */
import nodePath from 'node:path'

import {describe, expect, test} from 'vitest'

import {sharedHitAllowed} from './files.js'
import {listGrantedPathsForUser, type AclLevel, type QueryRunner} from './file-acls.js'

// ── sharedHitAllowed — the per-hit post-filter (keep iff nearest-ancestor read|write) ──
// Drives `getLevel` from a fake grant map, exactly like file-acls-336.test.ts's `walk`.
describe('sharedHitAllowed — per-hit /Shared content post-filter (D-337-3)', () => {
	const gate = (grants: Record<string, AclLevel>, hit: string) => sharedHitAllowed(hit, async (p) => grants[p] ?? null)

	test('granted folder → child kept', async () => {
		expect(await gate({'/Home/Shared': 'read'}, '/Home/Shared/sub/a.txt')).toBe(true)
	})

	test('none-child override → dropped (leak test: content never surfaces)', async () => {
		// grant write on the folder, explicit `none` on a subfolder → a hit inside that
		// subfolder MUST be dropped (the D-337-3 deny-override; no bytes returned).
		expect(await gate({'/Home/Shared': 'write', '/Home/Shared/secret': 'none'}, '/Home/Shared/secret/x.txt')).toBe(false)
	})

	test('an explicit `none` ON the hit file itself → dropped', async () => {
		expect(await gate({'/Home/Shared': 'write', '/Home/Shared/a.txt': 'none'}, '/Home/Shared/a.txt')).toBe(false)
	})

	test('nearer read under a write parent → kept (level read is still ≥read)', async () => {
		expect(await gate({'/Home/Shared': 'write', '/Home/Shared/sub': 'read'}, '/Home/Shared/sub/x')).toBe(true)
	})

	test('ungranted sibling → dropped', async () => {
		expect(await gate({'/Home/A': 'read'}, '/Home/B/x')).toBe(false)
	})

	test('no grant on the path or ANY ancestor (empty map) → dropped (fail-safe)', async () => {
		expect(await gate({}, '/Home/Shared/x')).toBe(false)
	})

	test('a write grant keeps the hit (write is ≥read)', async () => {
		expect(await gate({'/Home/Shared': 'write'}, '/Home/Shared/deep/nested/file.txt')).toBe(true)
	})
})

// ── listGrantedPathsForUser — the granted-root SET that feeds the /Shared scan ──
// Mirrors the 336 suite (union to most-permissive, sole-`none` excluded, no cross-user
// leak, null runner → []) so the enumeration is pinned for FTS-01's scan roots too.
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

describe('listGrantedPathsForUser — granted scan-root enumeration (feeds #searchSharedContent)', () => {
	const U = 'user-1'

	test('direct + group grants surface; union to most-permissive per path', async () => {
		const runner = makeRunner(
			[
				{virtual_path: '/Home/A', principal_type: 'user', principal_id: U, level: 'read'},
				{virtual_path: '/Home/A', principal_type: 'group', principal_id: 'g1', level: 'write'},
				{virtual_path: '/Apps/B', principal_type: 'group', principal_id: 'g1', level: 'read'},
			],
			{[U]: ['g1']},
		)
		expect(await listGrantedPathsForUser(U, runner)).toEqual([
			{virtualPath: '/Apps/B', level: 'read'},
			{virtualPath: '/Home/A', level: 'write'}, // read ∪ write → write
		])
	})

	test('a sole-`none` path is EXCLUDED (never becomes a scan root)', async () => {
		const runner = makeRunner([{virtual_path: '/Home/S', principal_type: 'user', principal_id: U, level: 'none'}])
		expect(await listGrantedPathsForUser(U, runner)).toEqual([])
	})

	test("another user's grants do NOT leak into this user's scan roots", async () => {
		const runner = makeRunner([{virtual_path: '/Home/X', principal_type: 'user', principal_id: 'someone-else', level: 'write'}])
		expect(await listGrantedPathsForUser(U, runner)).toEqual([])
	})

	test('no DB (null runner) → [] (fail-safe: /Shared contributes nothing)', async () => {
		expect(await listGrantedPathsForUser(U, null)).toEqual([])
	})
})

// ── inner → /Shared virtual-path mapping (T1 slice math) ──
// The exact three lines #searchSharedContent uses to map a SYSTEM hit path back to its
// grant-namespace inner path and its /Shared virtual path. Replicated here (normalizePath
// is a files.ts-local fn; SHARED_ROOT is a const) to assert the prefix-based slice math.
describe('inner → /Shared virtual-path mapping (T1 slice math)', () => {
	const SHARED_ROOT = '/Shared'
	const normalizePath = (p: string) => {
		const n = nodePath.posix.normalize(p)
		if (n === '/') return n
		return n.endsWith('/') ? n.slice(0, -1) : n
	}
	const mapHit = (grantVirtual: string, rootSystemPath: string, systemPath: string) => {
		const suffix = systemPath.slice(rootSystemPath.length) // '' or '/sub/file.txt'
		const innerPath = normalizePath(`${grantVirtual}${suffix}`)
		return {suffix, innerPath, sharedVirtual: `${SHARED_ROOT}${innerPath}`}
	}

	test('a nested hit maps to a prefix-based /Shared path', () => {
		const r = mapHit('/Home/foo', '/data/home/foo', '/data/home/foo/sub/file.txt')
		expect(r.suffix).toBe('/sub/file.txt')
		expect(r.innerPath).toBe('/Home/foo/sub/file.txt')
		expect(r.sharedVirtual).toBe('/Shared/Home/foo/sub/file.txt')
	})

	test('the granted root file itself (empty suffix) maps to the grant path', () => {
		const r = mapHit('/Home/foo', '/data/home/foo', '/data/home/foo')
		expect(r.suffix).toBe('')
		expect(r.innerPath).toBe('/Home/foo')
		expect(r.sharedVirtual).toBe('/Shared/Home/foo')
	})

	test('sharedVirtual === /Shared + normalizePath(grant + suffix) (prefix-based invariant)', () => {
		const grant = '/Home/foo'
		const suffix = '/a/b/c.txt'
		const r = mapHit(grant, '/data/home/foo', `/data/home/foo${suffix}`)
		expect(r.sharedVirtual).toBe(`${SHARED_ROOT}${normalizePath(`${grant}${suffix}`)}`)
	})
})
