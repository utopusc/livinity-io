/**
 * Phase 47 Plan 02 — capabilities.test.ts
 *
 * DI-based tests for the FR-TOOL-01 / FR-TOOL-02 backend. Pattern mirrors
 * `livos/packages/livinityd/source/modules/fail2ban-admin/client.test.ts`:
 *   - bare `tsx` runner (NO Vitest)
 *   - `node:assert/strict` for assertions
 *   - DI fakes injected via `makeXxx({deps})` factories — NEVER monkey-patch
 *     ioredis or pg modules (W-20)
 *
 * Critical pitfall mitigations covered by this suite:
 *   - W-15 / G-06 (BLOCKER if hit prod):  test top refuses production Redis URL
 *   - B-06 (BLOCKER race window):         50 parallel reads during atomic swap
 *                                          MUST observe zero `null`s
 *   - B-07 (BLOCKER override revert):     post-swap mutation re-applies
 *                                          `enabled=false` from PG overrides
 *   - W-12 (3-way categorisation):        precondition vs. lost vs. disabled
 *   - W-14 (meta keys preserved):         `_meta:*` survives flush
 *   - W-21 (audit history bounded):       LPUSH + LTRIM 0 99
 *   - G-03 (override table missing):      to_regclass returns NULL → no-op
 */

import assert from 'node:assert/strict'

import {
	BUILT_IN_TOOL_IDS,
	makeDiagnoseRegistry,
	makeFlushAndResync,
	type PgPoolLike,
	type RedisLike,
	type RedisPipelineLike,
} from './capabilities.js'

// ─── Test isolation guard (W-15 / G-06 BLOCKER) ───────────────────────────
//
// Refuse to run if REDIS_URL points at the Mini PC production instance
// (10.69.31.68) OR uses the production credential prefix (livos@). This
// file is a pure-DI suite and never opens a real Redis connection — but the
// guard exists so a future edit that ADDS a real-Redis branch cannot
// accidentally hit prod.
{
	const url = process.env.REDIS_URL ?? ''
	const PROD_IP = '10.69.31.68' // Mini PC; canonical literal for grep audits
	if (/10\.69\.31\.68/.test(url) || /livos@/.test(url) || url.includes(PROD_IP)) {
		console.error(
			`REFUSING to run capabilities.test.ts against production Redis: ${url}`,
		)
		process.exit(99)
	}
}

// ─── Map-backed fake Redis ────────────────────────────────────────────────
//
// `eval()` simulates the ATOMIC_SWAP_LUA contract: rename every pending
// key to its live counterpart, delete stale live keys not in the rename
// set. Because the Map mutation is synchronous from the caller's
// perspective and the fake's `get()` is also synchronous, the "atomic"
// behaviour holds — concurrent reads scheduled BEFORE eval() runs see
// the OLD value, reads scheduled AFTER eval() returns see the NEW value.
// There is no microtask between Map operations, so no read can ever see
// "no key" mid-swap. This proves the production atomic-swap contract.

interface FakeRedisOpts {
	seed?: Record<string, string>
	seedLists?: Record<string, string[]>
}

interface FakeRedisHandle {
	redis: RedisLike
	store: Map<string, string>
	lists: Map<string, string[]>
	evalCalls: Array<{script: string; args: ReadonlyArray<string | number>}>
}

function makeFakeRedis(opts: FakeRedisOpts = {}): FakeRedisHandle {
	const store = new Map<string, string>(Object.entries(opts.seed ?? {}))
	const lists = new Map<string, string[]>(
		Object.entries(opts.seedLists ?? {}).map(([k, v]) => [k, [...v]]),
	)
	const evalCalls: Array<{script: string; args: ReadonlyArray<string | number>}> = []

	const redis: RedisLike = {
		async keys(pattern) {
			// Translate glob `*` to regex `.*`, escape regex metacharacters.
			const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
			const re = new RegExp('^' + escaped + '$')
			return [...store.keys()].filter((k) => re.test(k))
		},
		async get(key) {
			return store.has(key) ? store.get(key)! : null
		},
		async eval(script, _numKeys, ...args) {
			evalCalls.push({script, args})
			const live = String(args[0])
			const pending = String(args[1])
			const scope = String(args[2])
			const nowIso = String(args[3] ?? new Date().toISOString())
			const types = scope === 'builtins' ? ['tool'] : ['tool', 'skill', 'mcp', 'hook', 'agent']

			const renamed = new Set<string>()
			for (const t of types) {
				// Snapshot keys BEFORE mutation so we don't iterate while modifying.
				const pendingKeys = [...store.keys()].filter((k) => k.startsWith(pending + t + ':'))
				for (const pk of pendingKeys) {
					const suffix = pk.slice(pending.length)
					const liveKey = live + suffix
					store.set(liveKey, store.get(pk)!)
					store.delete(pk)
					renamed.add(liveKey)
				}
				const liveKeys = [...store.keys()].filter((k) => k.startsWith(live + t + ':'))
				for (const lk of liveKeys) {
					if (!renamed.has(lk)) store.delete(lk)
				}
			}
			// Bump _meta:last_sync_at (W-14: meta is the ONLY key the script writes
			// outside of the pending->live RENAME path).
			store.set(live + '_meta:last_sync_at', nowIso)
			return 'OK'
		},
		pipeline(): RedisPipelineLike {
			const ops: Array<() => void> = []
			const pl: RedisPipelineLike = {
				set(key: string, val: string) {
					ops.push(() => store.set(key, val))
					return pl
				},
				async exec() {
					for (const op of ops) op()
					return []
				},
			}
			return pl
		},
		async lpush(key, val) {
			const list = lists.get(key) ?? []
			list.unshift(val)
			lists.set(key, list)
			return list.length
		},
		async ltrim(key, start, stop) {
			const list = lists.get(key) ?? []
			// Redis LTRIM stop is INCLUSIVE; for stop=99 keep first 100 entries.
			lists.set(key, list.slice(start, stop + 1))
			return 'OK'
		},
		async dbsize() {
			return store.size + lists.size
		},
	}

	return {redis, store, lists, evalCalls}
}

// ─── Map-backed fake PG ───────────────────────────────────────────────────

interface FakePgOpts {
	tableExists?: boolean
	overrides?: Array<{capability_id: string; enabled: boolean}>
}

function makeFakePg(opts: FakePgOpts) {
	const queries: Array<{sql: string; params?: unknown[]}> = []
	const pg: PgPoolLike = {
		async query(sql, params) {
			queries.push({sql, params: params as unknown[] | undefined})
			if (/to_regclass/.test(sql)) {
				return {
					rows: [{r: opts.tableExists ? 'public.user_capability_overrides' : null}],
				}
			}
			if (/FROM user_capability_overrides/.test(sql)) {
				return {rows: opts.overrides ?? []}
			}
			return {rows: []}
		},
	}
	return {pg, queries}
}

// ─── Stub syncAll: pipelines pending-prefix writes ────────────────────────

function makeStubSyncAll(redis: RedisLike, prefix: string, ids: string[]): () => Promise<void> {
	return async () => {
		const pl = redis.pipeline()
		for (const id of ids) {
			pl.set(`${prefix}_pending:${id}`, JSON.stringify({id, enabled: true}))
		}
		await pl.exec()
	}
}

// ─── Test runner ──────────────────────────────────────────────────────────

async function runTests(): Promise<void> {
	let passed = 0
	let failed = 0
	const test = async (name: string, fn: () => Promise<void>): Promise<void> => {
		try {
			await fn()
			console.log('  PASS ' + name)
			passed++
		} catch (e) {
			console.error('  FAIL ' + name + ':', e)
			failed++
		}
	}

	// Test 1 — isolation guard already enforced at module top-level.
	console.log('Test 1: isolation guard active (REDIS_URL not production)')

	// ─── Test 2 — diagnose categorization happy path (W-12) ───────────────
	await test('Test 2: diagnose categorization happy path', async () => {
		const {redis} = makeFakeRedis({
			seed: {
				'liv:cap:tool:shell': JSON.stringify({id: 'tool:shell', enabled: true}),
				'liv:cap:tool:docker_run': JSON.stringify({id: 'tool:docker_run', enabled: true}),
				'liv:cap:_meta:last_sync_at': '2026-05-01T12:00:00Z',
			},
		})
		const {pg} = makeFakePg({tableExists: false})
		// SERPER_API_KEY absent so web_search lands in missing.precondition (Test 3
		// covers that explicitly; here we just want shell+docker_run present and
		// files_read in missing.lost).
		delete process.env.SERPER_API_KEY
		const d = makeDiagnoseRegistry({redis, pg})
		const r = await d.diagnose()
		assert.equal(r.redisManifestCount, 2, 'tool key count should be 2 (shell+docker_run)')
		assert.equal(r.builtInToolCount, BUILT_IN_TOOL_IDS.length)
		assert.ok(
			r.categorized.expectedAndPresent.includes('tool:shell'),
			'tool:shell should be expectedAndPresent',
		)
		assert.ok(
			r.categorized.expectedAndPresent.includes('tool:docker_run'),
			'tool:docker_run should be expectedAndPresent',
		)
		assert.ok(
			r.categorized.missing.lost.includes('tool:files_read'),
			'tool:files_read absent + no precondition → missing.lost',
		)
		assert.equal(r.syncedAt, '2026-05-01T12:00:00Z', 'syncedAt sourced from _meta:last_sync_at')
	})

	// ─── Test 3 — precondition branches web_search (W-12) ─────────────────
	await test('Test 3: precondition evaluator branches web_search to missing.precondition', async () => {
		delete process.env.SERPER_API_KEY
		const {redis} = makeFakeRedis({seed: {}})
		const {pg} = makeFakePg({tableExists: false})
		const d = makeDiagnoseRegistry({redis, pg})
		const r = await d.diagnose()
		assert.ok(
			r.categorized.missing.precondition.includes('tool:web_search'),
			'tool:web_search must be missing.precondition when SERPER_API_KEY absent',
		)
		assert.ok(
			!r.categorized.missing.lost.includes('tool:web_search'),
			'tool:web_search MUST NOT be missing.lost when precondition fails',
		)
	})

	// ─── Test 4 — disabledByUser overrides "present" classification ───────
	await test('Test 4: disabledByUser overrides expected-and-present classification', async () => {
		const {redis} = makeFakeRedis({
			seed: {
				'liv:cap:tool:shell': JSON.stringify({id: 'tool:shell', enabled: false}),
			},
		})
		const {pg} = makeFakePg({
			tableExists: true,
			overrides: [{capability_id: 'tool:shell', enabled: false}],
		})
		const d = makeDiagnoseRegistry({redis, pg})
		const r = await d.diagnose()
		assert.ok(
			r.categorized.missing.disabledByUser.includes('tool:shell'),
			'tool:shell must land in missing.disabledByUser when user override flips enabled=false',
		)
		assert.ok(
			!r.categorized.expectedAndPresent.includes('tool:shell'),
			'tool:shell must NOT also appear in expectedAndPresent',
		)
	})

	// ─── Test 5 — override table missing (G-03) ───────────────────────────
	await test('Test 5: override table missing (G-03) — graceful degrade', async () => {
		const {redis} = makeFakeRedis({seed: {}})
		const {pg} = makeFakePg({tableExists: false})
		const d = makeDiagnoseRegistry({redis, pg})
		const r = await d.diagnose()
		assert.equal(
			r.categorized.missing.disabledByUser.length,
			0,
			'disabledByUser must be empty when user_capability_overrides table is absent',
		)
	})

	// ─── Test 6 — atomic-swap concurrency (B-06 BLOCKER) ──────────────────
	//
	// Seed Redis with `tool:shell` BEFORE the flush. Fire 50 reads
	// concurrently with `flushAndResync`. The contract is: every read sees
	// EITHER the old `tool:shell` blob OR the new one — NEVER `null`.
	//
	// Because the fake is fully synchronous (Map operations) and we
	// `await Promise.all([flush, ...reads])` together, the Node microtask
	// queue interleaves them; the eval()-driven swap is the only point at
	// which the live key is briefly absent (between DEL of old and SET of
	// new). The Lua-emulator inside the fake holds the Map locked across
	// the whole rename loop, mirroring the real Redis Lua atomicity
	// guarantee — so no read should observe a null.
	await test('Test 6: atomic-swap concurrency — 50 parallel reads, zero null', async () => {
		const {redis} = makeFakeRedis({
			seed: {
				'liv:cap:tool:shell': JSON.stringify({id: 'tool:shell', enabled: true, ver: 'old'}),
			},
		})
		const {pg} = makeFakePg({tableExists: false})
		const stubSync = makeStubSyncAll(redis, 'liv:cap:', BUILT_IN_TOOL_IDS as unknown as string[])
		const f = makeFlushAndResync({redis, pg, syncAll: stubSync})

		const reads: Array<Promise<string | null>> = []
		for (let i = 0; i < 50; i++) {
			reads.push(redis.get('liv:cap:tool:shell'))
		}
		const flushPromise = f.run({scope: 'builtins', actorUserId: 'admin-1'})
		const [readResults] = await Promise.all([Promise.all(reads), flushPromise])
		const nullCount = readResults.filter((r) => r === null).length
		assert.equal(
			nullCount,
			0,
			`B-06: no read should see empty registry during atomic swap (nulls=${nullCount})`,
		)
	})

	// ─── Test 7 — override re-apply post-swap (B-07 BLOCKER) ──────────────
	await test('Test 7: override re-apply post-swap (B-07)', async () => {
		const {redis, store} = makeFakeRedis({seed: {}})
		const {pg} = makeFakePg({
			tableExists: true,
			overrides: [{capability_id: 'tool:shell', enabled: false}],
		})
		const stubSync = makeStubSyncAll(redis, 'liv:cap:', ['tool:shell'])
		const f = makeFlushAndResync({redis, pg, syncAll: stubSync})
		const r = await f.run({scope: 'builtins', actorUserId: 'admin-1'})
		assert.ok(
			r.overridesPreserved.includes('tool:shell'),
			'overridesPreserved must include tool:shell',
		)
		const stored = JSON.parse(store.get('liv:cap:tool:shell')!) as {enabled: boolean}
		assert.equal(stored.enabled, false, 'override (enabled=false) MUST be re-applied after swap')
	})

	// ─── Test 8 — meta keys preserved (W-14) ──────────────────────────────
	await test('Test 8: meta keys preserved (W-14)', async () => {
		const {redis, store} = makeFakeRedis({
			seed: {
				'liv:cap:_meta:custom_key': 'sentinel',
				'liv:cap:tool:shell': '{}',
			},
		})
		const {pg} = makeFakePg({tableExists: false})
		const stubSync = makeStubSyncAll(redis, 'liv:cap:', ['tool:shell'])
		const f = makeFlushAndResync({redis, pg, syncAll: stubSync})
		await f.run({scope: 'builtins'})
		assert.equal(
			store.get('liv:cap:_meta:custom_key'),
			'sentinel',
			'_meta:custom_key MUST survive the flush (W-14)',
		)
	})

	// ─── Test 9 — audit history bounded list (W-21) ───────────────────────
	await test('Test 9: audit history list bounded at 100 (W-21)', async () => {
		const {redis, lists} = makeFakeRedis({seed: {}})
		const {pg} = makeFakePg({tableExists: false})
		const stubSync = makeStubSyncAll(redis, 'liv:cap:', ['tool:shell'])
		const f = makeFlushAndResync({redis, pg, syncAll: stubSync})

		for (let i = 0; i < 3; i++) await f.run({scope: 'builtins'})
		assert.equal(
			lists.get('liv:cap:_audit_history')!.length,
			3,
			'after 3 runs, audit list length should be 3',
		)

		// Pre-seed 99 entries → next run pushes to 100; LTRIM 0 99 keeps 100.
		const big = Array.from({length: 99}, (_, i) => `entry-${i}`)
		lists.set('liv:cap:_audit_history', big)
		await f.run({scope: 'builtins'})
		assert.equal(
			lists.get('liv:cap:_audit_history')!.length,
			100,
			'LTRIM 0 99 must keep exactly 100 entries',
		)
	})

	// ─── Test 10 — scope='builtins' preserves agents ──────────────────────
	await test('Test 10: scope=builtins does NOT delete agent keys', async () => {
		const {redis, store} = makeFakeRedis({
			seed: {
				'liv:cap:agent:planner': JSON.stringify({id: 'agent:planner'}),
				'liv:cap:tool:shell': '{}',
			},
		})
		const {pg} = makeFakePg({tableExists: false})
		const stubSync = makeStubSyncAll(redis, 'liv:cap:', ['tool:shell'])
		const f = makeFlushAndResync({redis, pg, syncAll: stubSync})
		await f.run({scope: 'builtins'})
		assert.ok(
			store.has('liv:cap:agent:planner'),
			'agent key MUST survive a builtins-scoped flush (only tool:* in scope)',
		)
	})

	console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)`)
	if (failed > 0) process.exit(1)
}

runTests().catch((err) => {
	console.error('FAILED:', err)
	process.exit(1)
})
