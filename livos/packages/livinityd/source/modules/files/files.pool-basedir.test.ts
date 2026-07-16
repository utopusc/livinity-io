/**
 * Phase 318 (D-12 / D-12b) — conditional `/Pool` base-dir registration.
 *
 * Unit-shaped, mirroring files.test.ts: exercises the PURE registration logic by
 * .call()-ing the real Files methods on a minimal stub (they only touch
 * this.baseDirectories, this.poolBaseDirRegistered and this.getUserBaseDirectories
 * / this.applyPoolBaseDir), so no heavy Livinityd / Postgres / redis bring-up is
 * needed — runs offline like the 257-04 fail-closed scoping tests. ZERO live fs /
 * mount (the pool mountpoint /mnt/pool is never touched here).
 *
 * The invariant (D-12): the pool is ADDITIVE storage surfaced at `/Pool → /mnt/pool`
 * ONLY when a pool exists, mirroring the /Cloud shared-mount precedent. The ONLY
 * value ever mapped is the union mountpoint /mnt/pool — the raw /mnt/diskN branches
 * and /mnt/parity1 are NEVER registered, mapped or reachable through any base-dir
 * map (T-318-21). When no pool exists the entry is absent from every map (graceful:
 * no sidebar entry, no ensure-dir against /mnt/pool — T-318-23).
 *
 * Coverage:
 *   registered   → /Pool present in the admin map AND the member map (shared /mnt/pool)
 *   unregistered → /Pool absent from both maps
 *   round-trip   → register → unregister → register flips cleanly
 *   boot init    → evaluatePoolBaseDir(state) registers iff the pool has ≥1 member
 *   multi-user   → an admin caller and a member caller both see the same /Pool mount
 *   NEGATIVE     → no base-dir map value ever contains /mnt/disk or /mnt/parity
 */

import {describe, expect, test} from 'vitest'

import Files, {type FileUserInfo} from './files.js'

const DATA = '/data'

// The member (per-user) tree fixture — byte-mirror of the real
// getUserBaseDirectories body (the pool-specific part is REAL code via
// applyPoolBaseDir; the surrounding tree is the fixture).
function memberTree(username: string): Map<string, string> {
	const base = `${DATA}/users/${username}`
	return new Map<string, string>([
		['/Home', `${base}/home`],
		['/Trash', `${base}/trash`],
		['/Apps', `${base}/app-data`],
		['/External', `${DATA}/external`],
		['/Backups', `${base}/backups`],
		['/Network', `${DATA}/network`],
		['/Cloud', `${DATA}/cloud`],
	])
}

function adminTree(): Map<string, string> {
	return new Map<string, string>([
		['/Home', `${DATA}/home`],
		['/Trash', `${DATA}/trash`],
		['/Apps', `${DATA}/app-data`],
		['/External', `${DATA}/external`],
		['/Backups', `${DATA}/backups`],
		['/Network', `${DATA}/network`],
		['/Cloud', `${DATA}/cloud`],
	])
}

// Minimal stub carrying only the fields the pool methods read, plus a
// getUserBaseDirectories that delegates the pool-specific inclusion to the REAL
// Files.prototype.applyPoolBaseDir (so the member-map path is genuinely exercised
// without the private #livinityd handle the real getUserBaseDirectories needs).
function makeStub() {
	const stub = {
		baseDirectories: adminTree(),
		poolBaseDirRegistered: false,
		multiUserMode: false,
		logger: {error() {}, log() {}},
		getUserBaseDirectories(username: string) {
			const map = memberTree(username)
			Files.prototype.applyPoolBaseDir.call(this, map)
			return map
		},
	}
	return stub as unknown as Files
}

const register = (s: Files) => Files.prototype.registerPoolBaseDir.call(s)
const unregister = (s: Files) => Files.prototype.unregisterPoolBaseDir.call(s)
const evaluate = (s: Files, state: {members?: unknown[]} | undefined) =>
	Files.prototype.evaluatePoolBaseDir.call(s, state as never)
const active = (s: Files, userInfo: FileUserInfo | undefined, opts?: {multiUser?: boolean}) =>
	Files.prototype.getActiveBaseDirectories.call(s, userInfo, opts)

// Assert NO value in a base-dir map ever exposes a raw branch or parity path
// (D-12 guard, T-318-21). The pool must surface ONLY the union mountpoint.
function assertNoBranchOrParityPaths(map: Map<string, string>) {
	for (const value of map.values()) {
		expect(value).not.toMatch(/\/mnt\/disk\d/)
		expect(value).not.toMatch(/\/mnt\/parity/)
	}
}

describe('Files /Pool base-dir — conditional D-12 registration', () => {
	test('registered → /Pool present in the admin map, mapped to /mnt/pool ONLY', () => {
		const stub = makeStub()
		register(stub)
		expect(stub.poolBaseDirRegistered).toBe(true)
		expect(stub.baseDirectories.get('/Pool')).toBe('/mnt/pool')
	})

	test('registered → /Pool present in the member (per-user) map as the same shared /mnt/pool', () => {
		const stub = makeStub()
		register(stub)
		const memberMap = stub.getUserBaseDirectories('bob')
		// Shared host-level mount — the member sees the SAME union mountpoint, like
		// External/Network/Cloud (not a per-user subtree).
		expect(memberMap.get('/Pool')).toBe('/mnt/pool')
	})

	test('unregistered → /Pool absent from BOTH the admin and member maps', () => {
		const stub = makeStub()
		// default (never registered)
		expect(stub.baseDirectories.has('/Pool')).toBe(false)
		expect(stub.getUserBaseDirectories('bob').has('/Pool')).toBe(false)
		// register then unregister → gone again from both
		register(stub)
		unregister(stub)
		expect(stub.poolBaseDirRegistered).toBe(false)
		expect(stub.baseDirectories.has('/Pool')).toBe(false)
		expect(stub.getUserBaseDirectories('bob').has('/Pool')).toBe(false)
	})

	test('round-trip → register → unregister → register flips cleanly (no restart)', () => {
		const stub = makeStub()
		register(stub)
		expect(stub.baseDirectories.get('/Pool')).toBe('/mnt/pool')
		unregister(stub)
		expect(stub.baseDirectories.has('/Pool')).toBe(false)
		register(stub)
		expect(stub.baseDirectories.get('/Pool')).toBe('/mnt/pool')
	})

	test('getActiveBaseDirectories: admin AND member callers both see the shared /Pool → /mnt/pool when registered', () => {
		const stub = makeStub()
		register(stub)
		const adminInfo: FileUserInfo = {username: 'admin', role: 'admin'}
		const memberInfo: FileUserInfo = {username: 'bob', role: 'member'}
		expect(active(stub, adminInfo).get('/Pool')).toBe('/mnt/pool')
		expect(active(stub, memberInfo).get('/Pool')).toBe('/mnt/pool')
	})

	test('getActiveBaseDirectories: neither admin nor member sees /Pool when unregistered', () => {
		const stub = makeStub()
		expect(active(stub, {username: 'admin', role: 'admin'}).has('/Pool')).toBe(false)
		expect(active(stub, {username: 'bob', role: 'member'}).has('/Pool')).toBe(false)
	})

	test('boot init: evaluatePoolBaseDir registers iff the persisted pool has ≥1 member', () => {
		// pool present (≥1 member) → registered
		const withPool = makeStub()
		evaluate(withPool, {members: [{deviceId: 'sda'}]})
		expect(withPool.poolBaseDirRegistered).toBe(true)
		expect(withPool.baseDirectories.get('/Pool')).toBe('/mnt/pool')

		// no persisted state → absent (graceful no-pool boot; no /mnt/pool ensure-dir)
		const noState = makeStub()
		evaluate(noState, undefined)
		expect(noState.poolBaseDirRegistered).toBe(false)
		expect(noState.baseDirectories.has('/Pool')).toBe(false)

		// empty members array → absent
		const emptyMembers = makeStub()
		evaluate(emptyMembers, {members: []})
		expect(emptyMembers.poolBaseDirRegistered).toBe(false)
		expect(emptyMembers.baseDirectories.has('/Pool')).toBe(false)
	})

	test('boot init: a previously-registered /Pool is UNregistered when the pool is gone (manual teardown + restart)', () => {
		const stub = makeStub()
		register(stub)
		expect(stub.baseDirectories.has('/Pool')).toBe(true)
		// store now reports no pool → boot evaluation must clear the stale entry
		evaluate(stub, undefined)
		expect(stub.poolBaseDirRegistered).toBe(false)
		expect(stub.baseDirectories.has('/Pool')).toBe(false)
	})

	test('D-12 NEGATIVE: no base-dir map value EVER contains a /mnt/diskN branch or /mnt/parity path — only /mnt/pool', () => {
		const stub = makeStub()
		register(stub)
		// admin map
		assertNoBranchOrParityPaths(stub.baseDirectories)
		// member map
		assertNoBranchOrParityPaths(stub.getUserBaseDirectories('bob'))
		// the ONLY pool-related value is the union mountpoint
		expect(stub.baseDirectories.get('/Pool')).toBe('/mnt/pool')
		expect(stub.getUserBaseDirectories('bob').get('/Pool')).toBe('/mnt/pool')
		// explicit: the branch/parity mountpoints are NEVER keys or values anywhere
		const allValues = [...stub.baseDirectories.values(), ...stub.getUserBaseDirectories('bob').values()]
		expect(allValues).not.toContain('/mnt/disk2')
		expect(allValues).not.toContain('/mnt/parity1')
	})
})
