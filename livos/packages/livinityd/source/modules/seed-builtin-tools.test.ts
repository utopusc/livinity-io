/**
 * Phase 50 Plan 01 — seed-builtin-tools.test.ts
 *
 * Integration test for the v29.5 A1 defensive eager seed module. DI-based
 * (Map-backed fake Redis), bare tsx runner (NO vitest), node:assert/strict.
 * Mirrors capabilities.test.ts pattern.
 */

import assert from 'node:assert/strict'

import {BUILT_IN_TOOL_IDS} from './diagnostics/capabilities.js'
import {seedBuiltinTools, type RedisLike} from './seed-builtin-tools.js'

// ─── Test isolation guard (W-15 / G-06 BLOCKER) ─────────────────────────────
{
	const url = process.env.REDIS_URL ?? ''
	const PROD_IP = '10.69.31.68'
	if (/10\.69\.31\.68/.test(url) || /livos@/.test(url) || url.includes(PROD_IP)) {
		console.error(
			`REFUSING to run seed-builtin-tools.test.ts against production Redis: ${url}`,
		)
		process.exit(99)
	}
}

// ─── Map-backed fake Redis ──────────────────────────────────────────────────
function makeFakeRedis(): {redis: RedisLike; store: Map<string, string>} {
	const store = new Map<string, string>()
	const redis: RedisLike = {
		async set(key: string, value: string) {
			store.set(key, value)
			return 'OK'
		},
	}
	return {redis, store}
}

// ─── Tests ──────────────────────────────────────────────────────────────────

async function test_seed_writes_nine_tool_keys() {
	const {redis, store} = makeFakeRedis()
	await seedBuiltinTools(redis)

	const toolKeys = [...store.keys()].filter((k) => k.startsWith('liv:cap:tool:'))
	assert.equal(toolKeys.length, 9, `expected 9 tool keys, got ${toolKeys.length}`)
	assert.equal(toolKeys.length, BUILT_IN_TOOL_IDS.length)

	for (const id of BUILT_IN_TOOL_IDS) {
		const name = id.replace(/^tool:/, '')
		assert.ok(
			store.has(`liv:cap:tool:${name}`),
			`missing key for ${id}: nexus:cap:tool:${name}`,
		)
	}
}

async function test_each_manifest_has_required_fields() {
	const {redis, store} = makeFakeRedis()
	await seedBuiltinTools(redis)

	for (const id of BUILT_IN_TOOL_IDS) {
		const name = id.replace(/^tool:/, '')
		const raw = store.get(`liv:cap:tool:${name}`)
		assert.ok(raw, `no value for nexus:cap:tool:${name}`)
		const m = JSON.parse(raw)
		assert.equal(m.id, id, `id mismatch for ${id}`)
		assert.equal(m.type, 'tool')
		assert.equal(m.name, name)
		assert.ok(typeof m.description === 'string' && m.description.length > 0, `empty description for ${id}`)
		assert.deepEqual(m.provides_tools, [name])
		assert.equal(m.tier, 'any')
		assert.equal(m.source, 'system')
		assert.equal(m.status, 'active')
		assert.ok(typeof m.registered_at === 'number' && m.registered_at > 0)
	}
}

async function test_sentinel_key_is_set() {
	const {redis, store} = makeFakeRedis()
	const before = Date.now()
	await seedBuiltinTools(redis)
	const after = Date.now()

	const sentinel = store.get('liv:cap:_meta:lastSeedAt')
	assert.ok(sentinel, 'sentinel nexus:cap:_meta:lastSeedAt not set')
	const ts = Date.parse(sentinel)
	assert.ok(!Number.isNaN(ts), `sentinel is not a valid ISO date: ${sentinel}`)
	assert.ok(ts >= before && ts <= after + 1, `sentinel timestamp ${ts} not within [${before}, ${after}]`)
}

async function test_idempotent_reseed() {
	const {redis, store} = makeFakeRedis()
	await seedBuiltinTools(redis)

	await new Promise((r) => setTimeout(r, 2))
	await seedBuiltinTools(redis)

	const toolKeys = [...store.keys()].filter((k) => k.startsWith('liv:cap:tool:'))
	assert.equal(toolKeys.length, 9, `re-seed grew/shrunk key count: ${toolKeys.length}`)

	for (const id of BUILT_IN_TOOL_IDS) {
		const name = id.replace(/^tool:/, '')
		const raw = store.get(`liv:cap:tool:${name}`)
		assert.ok(raw, `key ${name} disappeared after re-seed`)
		const m = JSON.parse(raw)
		assert.equal(m.id, id)
		assert.equal(m.name, name)
	}

	const sentinel = store.get('liv:cap:_meta:lastSeedAt')
	assert.ok(sentinel)
}

// ─── Runner ─────────────────────────────────────────────────────────────────
async function run() {
	const tests = [
		['seed writes 9 tool keys', test_seed_writes_nine_tool_keys],
		['each manifest has required fields', test_each_manifest_has_required_fields],
		['sentinel key is set', test_sentinel_key_is_set],
		['idempotent re-seed', test_idempotent_reseed],
	] as const

	let passed = 0
	let failed = 0
	for (const [name, fn] of tests) {
		try {
			await fn()
			console.log(`  PASS  ${name}`)
			passed++
		} catch (err) {
			console.error(`  FAIL  ${name}`)
			console.error(err)
			failed++
		}
	}
	console.log(`\n${passed} passed, ${failed} failed`)
	process.exit(failed === 0 ? 0 : 1)
}

run().catch((err) => {
	console.error(err)
	process.exit(2)
})
