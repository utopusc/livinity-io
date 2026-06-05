/**
 * Phase 260-02 (SC2) — merged displays.list: native + luse displays.
 *
 * `displays.list` (trpc-router.ts) is a thin wrapper over
 * `displayManager.list()` — it returns `{displays, count}` straight from the
 * Redis-backed registry. So the SC2 contract ("open native apps surface in the
 * Displays popover; closing removes them; native does not clobber luse") is
 * provable at the displayManager.list() seam with a Map-backed fake Redis,
 * mirroring the existing display-manager.test.ts harness (no full tRPC caller
 * harness needed — same pure-seam approach as trpc-router-authz.test.ts).
 *
 * native spawn  → displayManager.registerExisting(:N)  (native-routes.ts SC2)
 * native close  → displayManager.kill(:N, callerSession:'')  (native-routes.ts SC2)
 * displays.list → displayManager.list()  (trpc-router.ts:76-87, unchanged)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createDisplayManager} from './displays/display-manager.js'
import {redisKeyForDisplay} from './displays/redis-keys.js'
import type {DisplayManager} from './displays/types.js'

// ---------------------------------------------------------------------------
// Map-backed fake ioredis — same 6-method surface as display-manager.test.ts.
// ---------------------------------------------------------------------------

function makeFakeRedis() {
	const hashes = new Map<string, Record<string, string>>()
	const lists = new Map<string, string[]>()
	return {
		hashes,
		lists,
		async hset(key: string, fields: Record<string, string>) {
			const cur = hashes.get(key) ?? {}
			Object.assign(cur, fields)
			hashes.set(key, cur)
			return Object.keys(fields).length
		},
		async hgetall(key: string) {
			return {...(hashes.get(key) ?? {})}
		},
		async rpush(key: string, value: string) {
			const cur = lists.get(key) ?? []
			cur.push(value)
			lists.set(key, cur)
			return cur.length
		},
		async lrange(key: string, _s: number, _e: number) {
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
		async scan(_c: string, _m: string, pattern: string, _ck: string, _n: number) {
			const prefix = pattern.endsWith('*') ? pattern.slice(0, -1) : pattern
			const all = new Set<string>()
			for (const k of hashes.keys()) if (k.startsWith(prefix)) all.add(k)
			for (const k of lists.keys()) if (k.startsWith(prefix)) all.add(k)
			return ['0', Array.from(all)] as [string, string[]]
		},
	}
}

function makeSpawnFn() {
	let nextPid = 2000
	return vi.fn((_cmd: string, _args: string[], _opts?: unknown) => {
		const pid = nextPid++
		return {pid, kill: vi.fn().mockReturnValue(true)} as any
	})
}

let redis: ReturnType<typeof makeFakeRedis>
const FIXED_NOW = Date.parse('2026-06-05T01:00:00.000Z')

async function makeMgr(): Promise<DisplayManager> {
	const mgr = createDisplayManager({
		redis: redis as any,
		spawnFn: makeSpawnFn() as any,
		nowFn: () => FIXED_NOW,
		allocatorStart: 10,
	} as any)
	if (typeof (mgr as any).initialized === 'object') {
		await (mgr as any).initialized
	}
	return mgr
}

beforeEach(() => {
	redis = makeFakeRedis()
})

describe('displays.list — Phase 260-02 SC2 merged native + luse displays', () => {
	it('lists a native display registered via registerExisting (spawn path)', async () => {
		const dm = await makeMgr()
		// Native spawn registers :12 (registry-only, no spawn) — native-routes.ts SC2.
		await dm.registerExisting({
			display: ':12',
			mode: 'xvfb',
			width: 1280,
			height: 720,
			ownerSession: '',
			name: 'Native App',
		})

		const displays = await dm.list()
		// displays.list returns {displays, count} = dm.list() result (trpc-router.ts).
		const result = {displays, count: displays.length}

		expect(result.count).toBe(1)
		expect(result.displays.map((d) => d.display)).toContain(':12')
	})

	it('merges a luse display and a native display without clobbering each other', async () => {
		const dm = await makeMgr()
		// A luse/computer-use display via create() (spawns + allocates :10).
		const luse = await dm.create({mode: 'xephyr', ownerSession: 'bruce'})
		// A native display via registerExisting() (registry-only adopt).
		await dm.registerExisting({
			display: ':20',
			mode: 'xvfb',
			width: 1280,
			height: 720,
			ownerSession: '',
			name: 'Native App',
		})

		const displays = await dm.list()
		const result = {displays, count: displays.length}

		expect(result.count).toBe(2)
		const ids = result.displays.map((d) => d.display).sort()
		expect(ids).toEqual([luse.display, ':20'].sort())
	})

	it('removes the native display record on close (kill with host/shared owner)', async () => {
		const dm = await makeMgr()
		await dm.create({mode: 'xephyr', ownerSession: 'bruce'}) // luse :10
		await dm.registerExisting({
			display: ':21',
			mode: 'xvfb',
			width: 1280,
			height: 720,
			ownerSession: '',
			name: 'Native App',
		})

		// Sanity: both present before close.
		expect((await dm.list()).length).toBe(2)

		// native close → explicit removal (native-routes.ts SC2). ownerSession:''
		// → callerSession:'' passes the owner gate; only the Redis record is DEL'd
		// (no displayManager-owned X handle, no attached apps).
		const killed = await dm.kill({display: ':21', callerSession: ''})
		expect(killed.ok).toBe(true)

		const after = await dm.list()
		expect(after.length).toBe(1)
		expect(after.map((d) => d.display)).not.toContain(':21')
		// The luse display is untouched by the native close.
		expect(after.map((d) => d.display)).toContain(':10')
		// And the native Redis record is gone.
		expect(await redis.hgetall(redisKeyForDisplay(':21'))).toEqual({})
	})

	it('registerExisting is idempotent — double-spawn does not duplicate the record', async () => {
		const dm = await makeMgr()
		await dm.registerExisting({
			display: ':30',
			mode: 'xvfb',
			width: 1280,
			height: 720,
			ownerSession: '',
			name: 'Native App',
		})
		await dm.registerExisting({
			display: ':30',
			mode: 'xvfb',
			width: 1280,
			height: 720,
			ownerSession: '',
			name: 'Native App',
		})
		const displays = await dm.list()
		expect(displays.filter((d) => d.display === ':30').length).toBe(1)
	})
})
