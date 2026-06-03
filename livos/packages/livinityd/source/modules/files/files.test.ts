/**
 * Phase 257-04 WS-A (LIVOS-006) — fail-closed per-user file scoping.
 *
 * Unit-shaped: exercises the PURE resolution logic of getActiveBaseDirectories
 * by .call()-ing it on a minimal stub (the method only touches
 * this.baseDirectories, this.getUserBaseDirectories, this.multiUserMode), so no
 * heavy Livinityd / Postgres / redis bring-up is needed — runs offline like the
 * 256-04 auth tests.
 *
 * The vulnerability (LIVOS-006): in multi-user mode a legacy/proxy token with no
 * resolved per-user identity (userInfo === undefined) used to fall back to the
 * GLOBAL admin base directories — a member could omit LIVINITY_SESSION and reach
 * the admin/shared file tree. After the fix that case returns an EMPTY scope.
 *
 * Coverage:
 *   T1 — multi-user + no userInfo            → EMPTY scope (NOT the admin tree).
 *   T2 — multi-user + admin userInfo         → admin/global tree.
 *   T3 — multi-user + member userInfo        → users/<username> subtree only.
 *   T4 — single-user (legacy) + no userInfo  → global tree (no regression).
 */

import {describe, expect, test} from 'vitest'

import Files, {type FileUserInfo} from './files.js'

const ADMIN_TREE = new Map<string, string>([
	['/Home', '/data/home'],
	['/Trash', '/data/trash'],
	['/Apps', '/data/app-data'],
	['/External', '/data/external'],
	['/Backups', '/data/backups'],
	['/Network', '/data/network'],
])

function userTree(username: string): Map<string, string> {
	const base = `/data/users/${username}`
	return new Map<string, string>([
		['/Home', `${base}/home`],
		['/Trash', `${base}/trash`],
		['/Apps', `${base}/app-data`],
		['/External', '/data/external'],
		['/Backups', `${base}/backups`],
		['/Network', '/data/network'],
	])
}

// Minimal stub carrying only the fields getActiveBaseDirectories reads, plus a
// stubbed getUserBaseDirectories (the real one touches a private #livinityd).
function makeStub(multiUserMode: boolean) {
	return {
		baseDirectories: ADMIN_TREE,
		multiUserMode,
		getUserBaseDirectories: (username: string) => userTree(username),
	} as unknown as Files
}

// Bind the real method onto the stub.
function resolve(
	stub: Files,
	userInfo: FileUserInfo | undefined,
	opts?: {multiUser?: boolean},
): Map<string, string> {
	return Files.prototype.getActiveBaseDirectories.call(stub, userInfo, opts)
}

describe('getActiveBaseDirectories — LIVOS-006 fail-closed file scoping', () => {
	test('T1 — multi-user + no userInfo → EMPTY scope (not the admin tree)', () => {
		const stub = makeStub(true)
		const dirs = resolve(stub, undefined, {multiUser: true})
		expect(dirs.size).toBe(0)
		// Explicitly NOT the admin tree.
		expect(dirs).not.toBe(ADMIN_TREE)
		expect(dirs.get('/Home')).toBeUndefined()
	})

	test('T2 — multi-user + admin userInfo → admin/global tree', () => {
		const stub = makeStub(true)
		const dirs = resolve(stub, {username: 'admin', role: 'admin'}, {multiUser: true})
		expect(dirs).toBe(ADMIN_TREE)
		expect(dirs.get('/Home')).toBe('/data/home')
	})

	test('T3 — multi-user + member userInfo → own users/<username> subtree only', () => {
		const stub = makeStub(true)
		const dirs = resolve(stub, {username: 'mary', role: 'member'}, {multiUser: true})
		expect(dirs.get('/Home')).toBe('/data/users/mary/home')
		// Never the admin Home.
		expect(dirs.get('/Home')).not.toBe('/data/home')
	})

	test('T4 — single-user (legacy) + no userInfo → global tree (no regression)', () => {
		const stub = makeStub(false)
		const dirs = resolve(stub, undefined, {multiUser: false})
		expect(dirs).toBe(ADMIN_TREE)
		expect(dirs.get('/Home')).toBe('/data/home')
	})

	test('T4b — falls back to instance multiUserMode flag when opts omitted', () => {
		// multi-user instance flag, no opts → still fails closed.
		const mu = makeStub(true)
		expect(resolve(mu, undefined).size).toBe(0)
		// single-user instance flag, no opts → global tree.
		const su = makeStub(false)
		expect(resolve(su, undefined)).toBe(ADMIN_TREE)
	})
})
