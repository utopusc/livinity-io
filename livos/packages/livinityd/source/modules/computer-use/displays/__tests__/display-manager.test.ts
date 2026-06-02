/**
 * Phase 248-01 Task 1 — display-manager vitest suite (RED → GREEN).
 *
 * 14 drift-locked cases covering the public surface enumerated in
 * 248-01-PLAN.md `must_haves.truths`:
 *
 *   Drift-locks (1-3): DISPLAY_REDIS_PREFIX + key helpers.
 *   Allocator (4, 5, 14): :10 start, monotonic, seeded from SCAN max.
 *   Mode (6, 7): D-V44-DISPLAY-XEPHYR-DEFAULT — defaults to xephyr.
 *   Geometry (8): default 1920x1080 when omitted.
 *   Redis-write (9): HSET shape pinned (owner_session, mode, created_at, etc.).
 *   List (10): SCAN-driven aggregation with running_apps from per-display LIST.
 *   Owner-scope (11, 12): D-V44-DISPLAY-OWNER-SCOPED — kill refuses if
 *                          callerSession != owner_session; allows if match.
 *   Attach (13): RPUSH pid into apps LIST.
 *
 * All time + spawn functions are DI'd. spawnFn is a vi.fn returning a stub
 * ChildProcess-shape ({pid, kill}) — vitest never spawns a real Xephyr/Xvfb.
 * Redis is a tiny Map-backed fake exposing the 6 methods listed in
 * 248-01-PLAN.md `key_links` pattern.
 *
 * NOTE: imports below intentionally point at sibling modules that do not yet
 * exist — Task 1 RED is module-not-found. Task 2 (GREEN) creates the modules
 * and the imports resolve.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createDisplayManager} from '../display-manager.js'
import {
	DISPLAY_REDIS_PREFIX,
	redisKeyForDisplay,
	redisKeyForDisplayApps,
} from '../redis-keys.js'
import type {DisplayManager, DisplayMode, DisplayRecord} from '../types.js'

// ----------------------------------------------------------------------------
// Fake ioredis client — Map-backed in-memory; covers the 6-method surface.
// hash field types are string per Redis native; lists are string[].
// ----------------------------------------------------------------------------

interface FakeRedis {
	hashes: Map<string, Record<string, string>>
	lists: Map<string, string[]>
	hset(key: string, fields: Record<string, string>): Promise<number>
	hgetall(key: string): Promise<Record<string, string>>
	rpush(key: string, value: string): Promise<number>
	lrange(key: string, start: number, stop: number): Promise<string[]>
	del(...keys: string[]): Promise<number>
	// ioredis scan signature: scan(cursor, 'MATCH', pattern, 'COUNT', n)
	scan(
		cursor: string,
		matchKw: 'MATCH',
		pattern: string,
		countKw: 'COUNT',
		count: number,
	): Promise<[string, string[]]>
}

function makeFakeRedis(): FakeRedis {
	const hashes = new Map<string, Record<string, string>>()
	const lists = new Map<string, string[]>()
	return {
		hashes,
		lists,
		async hset(key, fields) {
			const cur = hashes.get(key) ?? {}
			Object.assign(cur, fields)
			hashes.set(key, cur)
			return Object.keys(fields).length
		},
		async hgetall(key) {
			return {...(hashes.get(key) ?? {})}
		},
		async rpush(key, value) {
			const cur = lists.get(key) ?? []
			cur.push(value)
			lists.set(key, cur)
			return cur.length
		},
		async lrange(key, _start, _stop) {
			return [...(lists.get(key) ?? [])]
		},
		async del(...keys: string[]) {
			let n = 0
			for (const k of keys) {
				if (hashes.delete(k)) n++
				if (lists.delete(k)) n++
			}
			return n
		},
		async scan(_cursor, _m, pattern, _c, _n) {
			// Glob → regex: only support trailing '*'.
			const prefix = pattern.endsWith('*')
				? pattern.slice(0, -1)
				: pattern
			const all = new Set<string>()
			for (const k of hashes.keys()) if (k.startsWith(prefix)) all.add(k)
			for (const k of lists.keys()) if (k.startsWith(prefix)) all.add(k)
			return ['0', Array.from(all)] as [string, string[]]
		},
	}
}

// ----------------------------------------------------------------------------
// Fake spawnFn — returns a child-handle-shape stub. Each call yields a unique
// pid so tests can drift-lock per-display.
// ----------------------------------------------------------------------------

function makeSpawnFn() {
	let nextPid = 1000
	const calls: Array<{cmd: string; args: string[]; pid: number}> = []
	const handles: Array<{pid: number; kill: ReturnType<typeof vi.fn>}> = []
	const spawnFn = vi.fn(
		(cmd: string, args: string[], _opts?: unknown) => {
			const pid = nextPid++
			const handle = {
				pid,
				kill: vi.fn().mockReturnValue(true),
			}
			calls.push({cmd, args, pid})
			handles.push(handle)
			return handle as any
		},
	)
	return {spawnFn, calls, handles}
}

// ----------------------------------------------------------------------------
// Per-test fresh fakes.
// ----------------------------------------------------------------------------

let redis: FakeRedis
let spawnHarness: ReturnType<typeof makeSpawnFn>
const FIXED_NOW = Date.parse('2026-05-29T01:00:00.000Z')
const nowFn = () => FIXED_NOW

async function makeMgr(opts?: {
	allocatorStart?: number
	processKillFn?: (pid: number, signal?: NodeJS.Signals | number) => boolean
}): Promise<DisplayManager> {
	const mgr = createDisplayManager({
		redis: redis as any,
		spawnFn: spawnHarness.spawnFn as any,
		nowFn,
		allocatorStart: opts?.allocatorStart ?? 10,
		processKillFn: opts?.processKillFn as any,
	} as any)
	// Allow the factory to seed its allocator from Redis SCAN before tests act.
	if (typeof (mgr as any).initialized === 'object') {
		await (mgr as any).initialized
	}
	return mgr
}

beforeEach(() => {
	redis = makeFakeRedis()
	spawnHarness = makeSpawnFn()
})

// ----------------------------------------------------------------------------
// Drift-locks (1-3): redis-keys shape.
// ----------------------------------------------------------------------------

describe('redis-keys drift-lock', () => {
	it('Case 1: DISPLAY_REDIS_PREFIX === "luse:display:"', () => {
		expect(DISPLAY_REDIS_PREFIX).toBe('luse:display:')
	})

	it('Case 2: redisKeyForDisplay(":12") === "luse:display::12"', () => {
		expect(redisKeyForDisplay(':12')).toBe('luse:display::12')
	})

	it('Case 3: redisKeyForDisplayApps(":12") === "luse:display::12:apps"', () => {
		expect(redisKeyForDisplayApps(':12')).toBe('luse:display::12:apps')
	})
})

// ----------------------------------------------------------------------------
// Allocator (4, 5, 14): :10 start, monotonic, SCAN-seeded.
// ----------------------------------------------------------------------------

describe('display-manager — allocator', () => {
	it('Case 4: empty Redis → first create returns :10', async () => {
		const mgr = await makeMgr()
		const out = await mgr.create({mode: 'xephyr', ownerSession: 's1'})
		expect(out.display).toBe(':10')
	})

	it('Case 5: second create returns :11 (monotonic, no reuse)', async () => {
		const mgr = await makeMgr()
		await mgr.create({mode: 'xephyr', ownerSession: 's1'})
		const second = await mgr.create({mode: 'xephyr', ownerSession: 's1'})
		expect(second.display).toBe(':11')
	})

	it('Case 14: pre-existing luse:display::15 → next create returns :16', async () => {
		// Seed Redis with an existing display BEFORE manager is created so the
		// SCAN-seed phase picks up :15 as the high-water mark.
		await redis.hset(redisKeyForDisplay(':15'), {
			owner_session: 's-prior',
			mode: 'xephyr',
			created_at: '2026-05-28T10:00:00.000Z',
			name: 'old',
			width: '1920',
			height: '1080',
		})
		const mgr = await makeMgr()
		const out = await mgr.create({mode: 'xephyr', ownerSession: 's1'})
		expect(out.display).toBe(':16')
	})
})

// ----------------------------------------------------------------------------
// Mode (6, 7) + Geometry (8): D-V44-DISPLAY-XEPHYR-DEFAULT + default WxH.
// ----------------------------------------------------------------------------

describe('display-manager — mode + geometry defaults', () => {
	it('Case 6: D-V44-DISPLAY-XEPHYR-DEFAULT — default mode is xephyr', async () => {
		const mgr = await makeMgr()
		await mgr.create({ownerSession: 's1'} as any)
		expect(spawnHarness.calls.length).toBe(1)
		expect(spawnHarness.calls[0].cmd).toBe('Xephyr')
	})

	it('Case 7: mode="xvfb" → spawnFn called with "Xvfb"', async () => {
		const mgr = await makeMgr()
		await mgr.create({mode: 'xvfb', ownerSession: 's1'})
		expect(spawnHarness.calls[0].cmd).toBe('Xvfb')
	})

	it('Case 8: default geometry 1920x1080 in spawn args', async () => {
		const mgr = await makeMgr()
		await mgr.create({mode: 'xephyr', ownerSession: 's1'})
		const args = spawnHarness.calls[0].args
		expect(args.some((a) => a.includes('1920x1080'))).toBe(true)
	})
})

// ----------------------------------------------------------------------------
// Redis-write (9): HSET shape pinned.
// ----------------------------------------------------------------------------

describe('display-manager — Redis HSET shape', () => {
	it('Case 9: HSET writes owner_session, mode, created_at, name, width, height', async () => {
		const mgr = await makeMgr()
		await mgr.create({mode: 'xephyr', ownerSession: 's1'})
		const hash = await redis.hgetall(redisKeyForDisplay(':10'))
		expect(hash.owner_session).toBe('s1')
		expect(hash.mode).toBe('xephyr')
		expect(hash.created_at).toBe(new Date(FIXED_NOW).toISOString())
		expect(hash.width).toBe('1920')
		expect(hash.height).toBe('1080')
		// Auto-name when omitted: "display-10" (the :N tail).
		expect(hash.name).toBe('display-10')
	})
})

// ----------------------------------------------------------------------------
// list() (10): SCAN-driven aggregation with apps LIST.
// ----------------------------------------------------------------------------

describe('display-manager — list()', () => {
	it('Case 10: list() returns DisplayRecord[] with running_apps from LIST', async () => {
		const mgr = await makeMgr()
		const a = await mgr.create({mode: 'xephyr', ownerSession: 's1', name: 'A'})
		const b = await mgr.create({mode: 'xvfb', ownerSession: 's2', name: 'B'})
		await mgr.attachApp({display: a.display, pid: 1234, app_name: 'firefox'})
		await mgr.attachApp({display: a.display, pid: 1235, app_name: 'gedit'})
		await mgr.attachApp({display: b.display, pid: 9999, app_name: 'xterm'})

		const list = await mgr.list()
		expect(list.length).toBe(2)
		const byDisplay = new Map<string, DisplayRecord>(
			list.map((r: DisplayRecord) => [r.display, r]),
		)
		const recA = byDisplay.get(a.display)!
		const recB = byDisplay.get(b.display)!
		expect(recA.name).toBe('A')
		expect(recA.owner_session).toBe('s1')
		expect(recA.mode).toBe('xephyr')
		expect(recA.running_apps).toEqual([1234, 1235])
		expect(recB.mode).toBe('xvfb')
		expect(recB.running_apps).toEqual([9999])
	})
})

// ----------------------------------------------------------------------------
// Owner-scope (11, 12): D-V44-DISPLAY-OWNER-SCOPED on kill().
// ----------------------------------------------------------------------------

describe('display-manager — owner-scoped kill', () => {
	it('Case 11: caller != owner → {ok:false, error:"not-owner"}, no process kill', async () => {
		const mgr = await makeMgr()
		await mgr.create({mode: 'xephyr', ownerSession: 's1'})
		const xHandle = spawnHarness.handles[0]
		const result = await mgr.kill({display: ':10', callerSession: 's2'})
		expect(result).toEqual({ok: false, error: 'not-owner'})
		expect(xHandle.kill).not.toHaveBeenCalled()
		// Redis state must remain — denial is non-destructive.
		const hash = await redis.hgetall(redisKeyForDisplay(':10'))
		expect(hash.owner_session).toBe('s1')
	})

	it('Case 12: caller === owner → SIGTERM X + every app pid, DEL both keys', async () => {
		// processKillFn is DI'd into the SAME manager that spawned the X
		// server — the in-memory spawn-handle map lives per-instance, so
		// kill() must run on the manager that holds it.
		const processKillFn = vi.fn().mockReturnValue(true)
		const mgr = await makeMgr({processKillFn})
		await mgr.create({mode: 'xephyr', ownerSession: 's1'})
		const xHandle = spawnHarness.handles[0]
		await mgr.attachApp({display: ':10', pid: 4001, app_name: 'firefox'})
		await mgr.attachApp({display: ':10', pid: 4002, app_name: 'gedit'})

		const result = await mgr.kill({display: ':10', callerSession: 's1'})
		expect(result.ok).toBe(true)
		if (result.ok) {
			expect(result.killed_apps_count).toBe(2)
		}
		// X server SIGTERM via in-memory spawn-handle.
		expect(xHandle.kill).toHaveBeenCalledWith('SIGTERM')
		// App pids SIGTERM'd via process.kill.
		const pidsKilled = processKillFn.mock.calls.map((c) => c[0])
		expect(pidsKilled.sort()).toEqual([4001, 4002])
		// Both Redis keys deleted.
		const hash = await redis.hgetall(redisKeyForDisplay(':10'))
		expect(Object.keys(hash).length).toBe(0)
		const apps = await redis.lrange(redisKeyForDisplayApps(':10'), 0, -1)
		expect(apps.length).toBe(0)
	})
})

// ----------------------------------------------------------------------------
// attachApp (13): RPUSH into apps LIST.
// ----------------------------------------------------------------------------

describe('display-manager — attachApp', () => {
	it('Case 13: attachApp RPUSHes pid into luse:display:<d>:apps', async () => {
		const mgr = await makeMgr()
		await mgr.create({mode: 'xephyr', ownerSession: 's1'})
		await mgr.attachApp({display: ':10', pid: 1234, app_name: 'firefox'})
		const list = await redis.lrange(redisKeyForDisplayApps(':10'), 0, -1)
		expect(list).toEqual(['1234'])
		// last_app_at field updated on the display hash.
		const hash = await redis.hgetall(redisKeyForDisplay(':10'))
		expect(hash.last_app_at).toBe(new Date(FIXED_NOW).toISOString())
	})
})

// ----------------------------------------------------------------------------
// R3 (Phase 252-01) — fail-closed on spawn ENOENT (missing X binary).
// A spawn handle whose on('error', cb) fires synchronously simulates the
// node child_process ENOENT path when Xephyr/Xvfb is absent.
// ----------------------------------------------------------------------------

function makeErrorSpawnFn(errMessage = "spawn Xephyr ENOENT") {
	const calls: Array<{cmd: string; args: string[]}> = []
	const spawnFn = vi.fn((cmd: string, args: string[], _opts?: unknown) => {
		calls.push({cmd, args})
		const handle = {
			pid: undefined as number | undefined,
			kill: vi.fn().mockReturnValue(true),
			on(event: 'error', listener: (err: Error) => void) {
				if (event === 'error') {
					// Fire synchronously — node emits ENOENT on next tick, but a
					// synchronous emit is the strictest test of the latch.
					listener(new Error(errMessage))
				}
			},
		}
		return handle as any
	})
	return {spawnFn, calls}
}

describe('display-manager — fail-closed on spawn error (R3)', () => {
	it('Test 1: spawn ENOENT → isError:true and NO luse:display key written', async () => {
		const errHarness = makeErrorSpawnFn()
		const mgr = createDisplayManager({
			redis: redis as any,
			spawnFn: errHarness.spawnFn as any,
			nowFn,
			allocatorStart: 10,
		} as any)
		if (typeof (mgr as any).initialized === 'object') {
			await (mgr as any).initialized
		}
		const out = await mgr.create({mode: 'xephyr', ownerSession: 's1'})
		expect(out.isError).toBe(true)
		expect(out.error).toBeTruthy()
		// No Redis display key written — fail closed.
		const scanned = await redis.scan('0', 'MATCH', 'luse:display:*', 'COUNT', 100)
		expect(scanned[1].length).toBe(0)
	})

	it('Test 2: happy path → isError:false and Redis key IS written', async () => {
		const mgr = await makeMgr()
		const out = await mgr.create({mode: 'xephyr', ownerSession: 's1'})
		expect(out.isError).toBe(false)
		expect(out.display).toBe(':10')
		expect(typeof out.pid).toBe('number')
		const hash = await redis.hgetall(redisKeyForDisplay(':10'))
		expect(hash.owner_session).toBe('s1')
	})
})

// Confirm DisplayMode union is exported and includes both modes.
describe('types', () => {
	it('exposes DisplayMode union with xephyr and xvfb', () => {
		const a: DisplayMode = 'xephyr'
		const b: DisplayMode = 'xvfb'
		expect([a, b]).toEqual(['xephyr', 'xvfb'])
	})
})

// ----------------------------------------------------------------------------
// Phase 254-05 (Gap 1) — registerExisting(): RECORD an already-running display
// into Redis WITHOUT spawning a new X server. The boot `:1` Xvfb is launched by
// startXvfb OUTSIDE the manager, so it has no luse:display::1 record and never
// appears in list(). registerExisting adopts it: same HSET shape as create(),
// EMPTY owner_session (host/shared so getVncUrl passes), idempotent (no clobber
// of a user-renamed record), and it must NEVER spawn (no second Xvfb on :1) nor
// perturb the :N allocator.
// ----------------------------------------------------------------------------

describe('display-manager — registerExisting() (Phase 254-05 Gap 1)', () => {
	it('Case 15: registerExisting(:1) writes the create()-shaped hash with empty owner_session, no spawn', async () => {
		const mgr = await makeMgr()
		await mgr.registerExisting({
			display: ':1',
			width: 1920,
			height: 1080,
			mode: 'xvfb',
			name: 'Host Display',
			ownerSession: '',
		})
		const hash = await redis.hgetall(redisKeyForDisplay(':1'))
		expect(hash.owner_session).toBe('')
		expect(hash.mode).toBe('xvfb')
		expect(hash.name).toBe('Host Display')
		expect(hash.width).toBe('1920')
		expect(hash.height).toBe('1080')
		expect(hash.created_at).toBe(new Date(FIXED_NOW).toISOString())
		// register-only: it must NOT spawn an X server (boot startXvfb owns :1).
		expect(spawnHarness.spawnFn).toHaveBeenCalledTimes(0)
	})

	it('Case 16: after registerExisting(:1), list() returns a :1 DisplayRecord (empty owner, WxH numeric, no apps)', async () => {
		const mgr = await makeMgr()
		await mgr.registerExisting({
			display: ':1',
			width: 1920,
			height: 1080,
			mode: 'xvfb',
			name: 'Host Display',
			ownerSession: '',
		})
		const list = await mgr.list()
		const rec = list.find((r: DisplayRecord) => r.display === ':1')!
		expect(rec).toBeTruthy()
		expect(rec.display).toBe(':1')
		expect(rec.owner_session).toBe('')
		expect(rec.width).toBe(1920)
		expect(rec.height).toBe(1080)
		expect(rec.running_apps).toEqual([])
	})

	it('Case 17: registerExisting is idempotent — never clobbers an existing record', async () => {
		// Pre-seed Redis with a user-renamed / owner-changed :1 record.
		await redis.hset(redisKeyForDisplay(':1'), {
			owner_session: 'someoneelse',
			mode: 'xvfb',
			created_at: '2026-05-28T10:00:00.000Z',
			name: 'Renamed By User',
			width: '1920',
			height: '1080',
		})
		const mgr = await makeMgr()
		await mgr.registerExisting({
			display: ':1',
			width: 1920,
			height: 1080,
			mode: 'xvfb',
			name: 'Host Display',
			ownerSession: '',
		})
		const hash = await redis.hgetall(redisKeyForDisplay(':1'))
		// Existing record untouched — no clobber.
		expect(hash.name).toBe('Renamed By User')
		expect(hash.owner_session).toBe('someoneelse')
	})

	it('Case 18: registerExisting(:1) does NOT advance the :N allocator — next create() still :10', async () => {
		const mgr = await makeMgr()
		await mgr.registerExisting({
			display: ':1',
			width: 1920,
			height: 1080,
			mode: 'xvfb',
			name: 'Host Display',
			ownerSession: '',
		})
		const out = await mgr.create({mode: 'xephyr', ownerSession: 's1'})
		expect(out.display).toBe(':10')
	})
})
