/**
 * Phase 47 Plan 04 Task 2 — app-health.test.ts
 *
 * 6 tests covering FR-PROBE-01 / FR-PROBE-02:
 *   - Test 1: PG-scoping (G-04 BLOCKER) — appId not owned → no fetch fired.
 *   - Test 2: happy path 200 → reachable=true.
 *   - Test 3: 503 response → reachable=false, statusCode populated.
 *   - Test 4: timeout — fake fetch delays past timeoutMs → lastError='timeout'.
 *   - Test 5: ECONNREFUSED — fetch throws → lastError populated.
 *   - Test 6: defense-in-depth — PG row with mismatched user_id → no fetch.
 *
 * Pattern mirrors `fail2ban-admin/active-sessions.test.ts`: bare `tsx` runner
 * (no Vitest), DI fakes, `node:assert/strict`. NO `vi.mock('undici')` — DI
 * via the factory's `deps.fetch` parameter (W-20).
 */

import assert from 'node:assert/strict'

import {
	makeProbeAppHealth,
	type FetchFn,
	type GetUserAppInstanceFn,
	type UserAppInstance,
} from './app-health.js'

// ── Test helpers ────────────────────────────────────────────────────────────

function makeFakeFetch(behavior: {
	ok?: boolean
	status?: number
	throw?: Error
	delayMs?: number
}): {
	fetch: FetchFn
	callCount: () => number
} {
	let calls = 0
	const fetch: FetchFn = async (_url, init?: any) => {
		calls++
		if (behavior.delayMs) {
			await new Promise<void>((resolve, reject) => {
				const t = setTimeout(resolve, behavior.delayMs)
				init?.signal?.addEventListener('abort', () => {
					clearTimeout(t)
					const err = new Error('aborted')
					;(err as any).name = 'AbortError'
					reject(err)
				})
			})
		}
		if (behavior.throw) throw behavior.throw
		return {
			ok: behavior.ok ?? true,
			status: behavior.status ?? 200,
		} as unknown as Response
	}
	return {fetch, callCount: () => calls}
}

function makeFakeGetUserAppInstance(seeds: UserAppInstance[]): GetUserAppInstanceFn {
	return async (userId, appId) => {
		return seeds.find((s) => s.user_id === userId && s.app_id === appId) ?? null
	}
}

// ── Test runner ─────────────────────────────────────────────────────────────

async function runTests() {
	let passed = 0
	let failed = 0
	const test = async (name: string, fn: () => Promise<void>) => {
		try {
			await fn()
			console.log('  PASS ' + name)
			passed++
		} catch (e) {
			console.error('  FAIL ' + name + ':', e)
			failed++
		}
	}

	await test(
		'Test 1: PG-scoping (G-04 BLOCKER) — appId not owned → lastError=app_not_owned, no fetch fired',
		async () => {
			const {fetch, callCount} = makeFakeFetch({})
			const getU = makeFakeGetUserAppInstance([
				{id: 'inst-1', user_id: 'user-A', app_id: 'bolt', port: 12000},
			])
			const p = makeProbeAppHealth({fetch, getUserAppInstance: getU})
			const r = await p.probe({userId: 'user-B', appId: 'bolt'}) // user-B does not own
			assert.equal(r.reachable, false)
			assert.equal(r.lastError, 'app_not_owned')
			assert.equal(r.statusCode, null)
			assert.equal(callCount(), 0, 'fetch must NOT be called when app not owned')
		},
	)

	await test('Test 2: happy path — owned app + 200 OK → reachable=true', async () => {
		const {fetch, callCount} = makeFakeFetch({ok: true, status: 200})
		const getU = makeFakeGetUserAppInstance([
			{id: 'inst-1', user_id: 'user-A', app_id: 'bolt', port: 12000},
		])
		const p = makeProbeAppHealth({fetch, getUserAppInstance: getU})
		const r = await p.probe({userId: 'user-A', appId: 'bolt'})
		assert.equal(r.reachable, true)
		assert.equal(r.statusCode, 200)
		assert.equal(r.lastError, null)
		assert.ok(r.ms !== null && r.ms >= 0)
		assert.equal(callCount(), 1)
	})

	await test('Test 3: 503 response → reachable=false, statusCode=503', async () => {
		const {fetch} = makeFakeFetch({ok: false, status: 503})
		const getU = makeFakeGetUserAppInstance([
			{id: 'inst-1', user_id: 'user-A', app_id: 'bolt', port: 12000},
		])
		const p = makeProbeAppHealth({fetch, getUserAppInstance: getU})
		const r = await p.probe({userId: 'user-A', appId: 'bolt'})
		assert.equal(r.reachable, false)
		assert.equal(r.statusCode, 503)
		assert.equal(r.lastError, null)
	})

	await test('Test 4: timeout — fake fetch delays > timeout → lastError=timeout', async () => {
		const {fetch} = makeFakeFetch({delayMs: 500})
		const getU = makeFakeGetUserAppInstance([
			{id: 'inst-1', user_id: 'user-A', app_id: 'bolt', port: 12000},
		])
		const p = makeProbeAppHealth({fetch, getUserAppInstance: getU, timeoutMs: 100}) // tight timeout
		const r = await p.probe({userId: 'user-A', appId: 'bolt'})
		assert.equal(r.reachable, false)
		assert.equal(r.lastError, 'timeout')
		assert.equal(r.statusCode, null)
	})

	await test(
		'Test 5: ECONNREFUSED — fetch throws → lastError populated, reachable=false',
		async () => {
			const {fetch} = makeFakeFetch({
				throw: Object.assign(new Error('connect ECONNREFUSED'), {code: 'ECONNREFUSED'}),
			})
			const getU = makeFakeGetUserAppInstance([
				{id: 'inst-1', user_id: 'user-A', app_id: 'bolt', port: 12000},
			])
			const p = makeProbeAppHealth({fetch, getUserAppInstance: getU})
			const r = await p.probe({userId: 'user-A', appId: 'bolt'})
			assert.equal(r.reachable, false)
			assert.equal(r.statusCode, null)
			assert.ok(r.lastError && /ECONNREFUSED/.test(r.lastError))
		},
	)

	await test(
		'Test 6: defense-in-depth — getUserAppInstance returns row with mismatched user_id → app_not_owned',
		async () => {
			const {fetch, callCount} = makeFakeFetch({})
			// Adversarial: fake DB function returns a row whose user_id disagrees with the requesting userId.
			const getU: GetUserAppInstanceFn = async () => ({
				id: 'inst-x',
				user_id: 'user-DIFFERENT',
				app_id: 'bolt',
				port: 12000,
			})
			const p = makeProbeAppHealth({fetch, getUserAppInstance: getU})
			const r = await p.probe({userId: 'user-A', appId: 'bolt'})
			assert.equal(r.reachable, false)
			assert.equal(r.lastError, 'app_not_owned')
			assert.equal(callCount(), 0, 'fetch must NOT be called when defense-in-depth check fails')
		},
	)

	console.log(`\n${passed} passed, ${failed} failed`)
	if (failed > 0) process.exit(1)
}

runTests().catch((err) => {
	console.error(err)
	process.exit(1)
})
