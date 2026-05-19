/**
 * Phase 164-02 Task 1 — budget-gate.test.ts
 *
 * Vitest suite locking the atomic concurrent-cap + daily-spend-cap helpers
 * that scheduler.ts (Task 2) calls before every autonomous spawn.
 *
 * The contract — every behaviour in the plan's <behavior> block:
 *
 *   1. Concurrent cap ALLOW       (active=2, cap=3 → allowed; active_count=3)
 *   2. Concurrent cap REJECT      (active=3, cap=3 → blocked; active_count rolled back to 3, NOT 4)
 *   3. Concurrent cap DEFAULT     (cap key unset → defaults to 3)
 *   4. decrementConcurrent        (atomic DECR by 1)
 *   5. decrementConcurrent FLOOR  (active=0 → stays 0, never goes negative)
 *   6. incrementDailySpend INCRBY (first call sets to amount; second adds)
 *   7. incrementDailySpend TTL    (key TTL within 48h ± 1s slop)
 *   8. checkDailyBudget GATE      (allowed below cap; rejected at/above cap)
 *   9. Daily budget DEFAULT       (cap key unset → 5000 cents per ROADMAP defaults)
 *
 * Test infrastructure: in-memory fake Redis (Map-backed) implementing only
 * the surface budget-gate.ts touches: `get`, `set`, `incr`, `decr`, `incrby`,
 * `expire`, `ttl`, `del`, `multi()`, and `eval()` (single-key Lua scripts —
 * we interpret the two specific scripts budget-gate.ts uses directly so we
 * don't pull in a real Lua VM).
 *
 * Mirrors the lightweight fake-redis pattern from
 * computer-use/legacy-bytebot-cleanup.test.ts so we don't add the
 * `ioredis-mock` dependency (D-NO-NEW-DEPS).
 */

import {describe, it, expect, beforeEach} from 'vitest'

import {
	checkAndIncrementConcurrent,
	decrementConcurrent,
	checkDailyBudget,
	incrementDailySpend,
	dateKeyForUtc,
} from './budget-gate.js'

// ─── Fake Redis (Map-backed; surface limited to what budget-gate touches) ──

interface MultiOp {
	op: 'incr' | 'get' | 'incrby' | 'expire'
	args: any[]
}

interface FakeMulti {
	incr(key: string): FakeMulti
	get(key: string): FakeMulti
	incrby(key: string, amount: number): FakeMulti
	expire(key: string, seconds: number): FakeMulti
	exec(): Promise<Array<[Error | null, any]>>
}

function makeFakeRedis() {
	const store = new Map<string, string>()
	const ttls = new Map<string, number>() // key → expiry (epoch seconds)

	function applyOp(op: MultiOp): [Error | null, any] {
		switch (op.op) {
			case 'incr': {
				const k = op.args[0]
				const cur = Number(store.get(k) ?? 0)
				const next = cur + 1
				store.set(k, String(next))
				return [null, next]
			}
			case 'get': {
				const k = op.args[0]
				return [null, store.get(k) ?? null]
			}
			case 'incrby': {
				const k = op.args[0]
				const amt = Math.round(Number(op.args[1]))
				const cur = Number(store.get(k) ?? 0)
				const next = cur + amt
				store.set(k, String(next))
				return [null, next]
			}
			case 'expire': {
				const k = op.args[0]
				const seconds = Number(op.args[1])
				ttls.set(k, Math.floor(Date.now() / 1000) + seconds)
				return [null, 1]
			}
		}
	}

	const redis = {
		get: async (k: string): Promise<string | null> => store.get(k) ?? null,
		set: async (k: string, v: string): Promise<'OK'> => {
			store.set(k, String(v))
			return 'OK'
		},
		del: async (k: string): Promise<number> => (store.delete(k) ? 1 : 0),
		incr: async (k: string): Promise<number> => {
			const cur = Number(store.get(k) ?? 0)
			const next = cur + 1
			store.set(k, String(next))
			return next
		},
		decr: async (k: string): Promise<number> => {
			const cur = Number(store.get(k) ?? 0)
			const next = cur - 1
			store.set(k, String(next))
			return next
		},
		incrby: async (k: string, amount: number): Promise<number> => {
			const cur = Number(store.get(k) ?? 0)
			const next = cur + Math.round(amount)
			store.set(k, String(next))
			return next
		},
		expire: async (k: string, seconds: number): Promise<number> => {
			ttls.set(k, Math.floor(Date.now() / 1000) + Number(seconds))
			return 1
		},
		ttl: async (k: string): Promise<number> => {
			const t = ttls.get(k)
			if (t === undefined) return -1
			const remain = t - Math.floor(Date.now() / 1000)
			return remain
		},
		multi: (): FakeMulti => {
			const ops: MultiOp[] = []
			const m: FakeMulti = {
				incr(key) {
					ops.push({op: 'incr', args: [key]})
					return m
				},
				get(key) {
					ops.push({op: 'get', args: [key]})
					return m
				},
				incrby(key, amount) {
					ops.push({op: 'incrby', args: [key, amount]})
					return m
				},
				expire(key, seconds) {
					ops.push({op: 'expire', args: [key, seconds]})
					return m
				},
				exec: async () => ops.map(applyOp),
			}
			return m
		},
		// budget-gate.ts uses redis.eval(script, 1, KEY) for the floor-at-zero
		// DECR. We pattern-match the script text and execute the equivalent
		// JS directly — no Lua VM needed for tests.
		eval: async (script: string, numKeys: number, ...keys: string[]): Promise<number> => {
			void numKeys
			const key = keys[0]
			if (script.includes("if v <= 0")) {
				// Floor-at-zero DECR.
				const cur = Number(store.get(key) ?? 0)
				if (cur <= 0) {
					store.set(key, '0')
					return 0
				}
				const next = cur - 1
				store.set(key, String(next))
				return next
			}
			throw new Error(`fake-redis eval: unrecognized script: ${script.slice(0, 60)}`)
		},
		// Test introspection helper — NOT on the real Redis surface.
		__store: store,
		__ttls: ttls,
	}
	return redis
}

type FakeRedis = ReturnType<typeof makeFakeRedis>

// ─── Tests ────────────────────────────────────────────────────────────────

describe('budget-gate — Phase 164-02 Task 1', () => {
	let redis: FakeRedis

	beforeEach(() => {
		redis = makeFakeRedis()
	})

	// Test 1 ────────────────────────────────────────────────────────────────
	it('Test 1 (concurrent cap allow): active=2 cap=3 → allowed; active_count=3 after', async () => {
		await redis.set('liv:autonomous:active_count', '2')
		await redis.set('liv:config:autonomous_max_concurrent', '3')
		const result = await checkAndIncrementConcurrent(redis as any)
		expect(result.allowed).toBe(true)
		expect(await redis.get('liv:autonomous:active_count')).toBe('3')
	})

	// Test 2 ────────────────────────────────────────────────────────────────
	it('Test 2 (concurrent cap reject + atomic rollback): active=3 cap=3 → blocked; active_count stays 3', async () => {
		await redis.set('liv:autonomous:active_count', '3')
		await redis.set('liv:config:autonomous_max_concurrent', '3')
		const result = await checkAndIncrementConcurrent(redis as any)
		expect(result.allowed).toBe(false)
		expect(result.reason).toMatch(/concurrent cap/)
		// Critical: INCR + DECR round-trip leaves the counter at 3, NOT 4.
		expect(await redis.get('liv:autonomous:active_count')).toBe('3')
	})

	// Test 3 ────────────────────────────────────────────────────────────────
	it('Test 3 (concurrent cap default): liv:config:autonomous_max_concurrent unset → defaults to 3', async () => {
		await redis.set('liv:autonomous:active_count', '2')
		// cap key intentionally absent
		const result = await checkAndIncrementConcurrent(redis as any)
		expect(result.allowed).toBe(true)
		expect(result.cap).toBe(3)
		expect(await redis.get('liv:autonomous:active_count')).toBe('3')
		// Now push one more — at cap, should be rejected.
		const result2 = await checkAndIncrementConcurrent(redis as any)
		expect(result2.allowed).toBe(false)
		expect(result2.cap).toBe(3)
		expect(await redis.get('liv:autonomous:active_count')).toBe('3')
	})

	// Test 4 ────────────────────────────────────────────────────────────────
	it('Test 4 (decrementConcurrent): brings active_count back down by 1', async () => {
		await redis.set('liv:autonomous:active_count', '2')
		await decrementConcurrent(redis as any)
		expect(await redis.get('liv:autonomous:active_count')).toBe('1')
	})

	// Test 5 ────────────────────────────────────────────────────────────────
	it('Test 5 (decrementConcurrent floor at 0): no underflow on double-decrement', async () => {
		await redis.set('liv:autonomous:active_count', '0')
		await decrementConcurrent(redis as any)
		expect(await redis.get('liv:autonomous:active_count')).toBe('0')
		// Second decrement still stays at 0.
		await decrementConcurrent(redis as any)
		expect(await redis.get('liv:autonomous:active_count')).toBe('0')
	})

	// Test 6 ────────────────────────────────────────────────────────────────
	it('Test 6 (incrementDailySpend INCRBY): first call sets; second call adds', async () => {
		const key = 'liv:autonomous:daily_spend_cents:2026-05-20'
		await incrementDailySpend(redis as any, '2026-05-20', 42)
		expect(await redis.get(key)).toBe('42')
		await incrementDailySpend(redis as any, '2026-05-20', 13)
		expect(await redis.get(key)).toBe('55')
	})

	// Test 7 ────────────────────────────────────────────────────────────────
	it('Test 7 (incrementDailySpend TTL): 48h window applied', async () => {
		const key = 'liv:autonomous:daily_spend_cents:2026-05-20'
		await incrementDailySpend(redis as any, '2026-05-20', 1)
		const ttl = await redis.ttl(key)
		// 48h = 172_800 seconds; allow 1s slop for clock movement during exec
		expect(ttl).toBeGreaterThan(86_400 * 2 - 2)
		expect(ttl).toBeLessThanOrEqual(86_400 * 2)
	})

	// Test 8 ────────────────────────────────────────────────────────────────
	it('Test 8 (checkDailyBudget): allowed below cap, rejected at/above cap', async () => {
		const key = 'liv:autonomous:daily_spend_cents:2026-05-20'
		await redis.set('liv:config:autonomous_daily_budget', '5000')

		// Below cap.
		await redis.set(key, '4999')
		const below = await checkDailyBudget(redis as any, '2026-05-20')
		expect(below.allowed).toBe(true)
		expect(below.currentCents).toBe(4999)
		expect(below.capCents).toBe(5000)

		// At cap.
		await redis.set(key, '5000')
		const atCap = await checkDailyBudget(redis as any, '2026-05-20')
		expect(atCap.allowed).toBe(false)
		expect(atCap.reason).toMatch(/daily budget cap/)

		// Above cap.
		await redis.set(key, '5500')
		const above = await checkDailyBudget(redis as any, '2026-05-20')
		expect(above.allowed).toBe(false)
		expect(above.currentCents).toBe(5500)
	})

	// Test 9 ────────────────────────────────────────────────────────────────
	it('Test 9 (daily budget default): liv:config:autonomous_daily_budget unset → defaults to 5000 cents', async () => {
		// No cap key set.
		const result = await checkDailyBudget(redis as any, '2026-05-20')
		expect(result.allowed).toBe(true)
		expect(result.capCents).toBe(5000)
		expect(result.currentCents).toBe(0)
	})

	// dateKeyForUtc — utility coverage (filename helper consumers depend on this)
	it('dateKeyForUtc: returns YYYY-MM-DD UTC slice', () => {
		const d = new Date('2026-05-20T03:14:15.000Z')
		expect(dateKeyForUtc(d)).toBe('2026-05-20')
	})
})
