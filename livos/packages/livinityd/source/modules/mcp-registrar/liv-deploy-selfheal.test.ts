// Phase 288 T3 — liv-deploy-selfheal.test.ts (node:test, no vitest).
//
// Covers the existing-box self-heal `ensureLivDeploySeeded`:
//   (1) HSETNX returns 1 (field absent)      → {seeded:true}  + info logged
//   (2) HSETNX returns 0 (already present)    → {seeded:false} (NO clobber)
//   (3) empty / undefined LIV_API_KEY         → {seeded:false} + warn, hsetnx NOT called
//   (4) hsetnx rejects (Redis error)          → caught, {seeded:false} (non-fatal)
//
// node:test (mirrors deploy-custom-sanitizer.test.ts) — a tiny vi-free stub
// redis with a call-counter so the suite runs under `npx tsx --test`.

import assert from 'node:assert/strict'
import {test} from 'node:test'

import {buildLivDeployEntry, ensureLivDeploySeeded, MCP_CONFIG_REDIS_HASH_KEY} from './liv-deploy-selfheal.js'

interface StubCall {
	key: string
	field: string
	value: string
}

function makeStubRedis(opts: {result?: number; reject?: boolean}) {
	const calls: StubCall[] = []
	return {
		calls,
		hsetnx: async (key: string, field: string, value: string): Promise<number> => {
			calls.push({key, field, value})
			if (opts.reject) throw new Error('redis down')
			return opts.result ?? 1
		},
	}
}

function makeLogger() {
	const infos: string[] = []
	const warns: string[] = []
	return {
		infos,
		warns,
		logger: {
			info: (m: string) => infos.push(m),
			warn: (m: string) => warns.push(m),
		},
	}
}

test('(1) field absent → HSETNX writes, {seeded:true} + info logged', async () => {
	const redis = makeStubRedis({result: 1})
	const {logger, infos} = makeLogger()
	const out = await ensureLivDeploySeeded(redis, 'liv_k_abc', logger)
	assert.deepEqual(out, {seeded: true})
	assert.equal(redis.calls.length, 1)
	assert.equal(redis.calls[0].key, MCP_CONFIG_REDIS_HASH_KEY)
	assert.equal(redis.calls[0].field, 'liv-deploy')
	// the runtime entry carries the resolved api key, not a placeholder
	const parsed = JSON.parse(redis.calls[0].value)
	assert.equal(parsed.name, 'liv-deploy')
	assert.equal(parsed.enabled, true)
	assert.equal(parsed.category, 'system')
	assert.equal(parsed.env.LIV_API_KEY, 'liv_k_abc')
	assert.equal(infos.length, 1)
})

test('(2) field already present (HSETNX→0) → {seeded:false}, no clobber', async () => {
	const redis = makeStubRedis({result: 0})
	const {logger} = makeLogger()
	const out = await ensureLivDeploySeeded(redis, 'liv_k_abc', logger)
	assert.deepEqual(out, {seeded: false})
	// HSETNX was attempted but wrote nothing — the operator entry is preserved.
	assert.equal(redis.calls.length, 1)
})

test('(3) empty/undefined LIV_API_KEY → {seeded:false} + warn, hsetnx NOT called', async () => {
	for (const key of [undefined, '']) {
		const redis = makeStubRedis({result: 1})
		const {logger, warns} = makeLogger()
		const out = await ensureLivDeploySeeded(redis, key, logger)
		assert.deepEqual(out, {seeded: false})
		assert.equal(redis.calls.length, 0, 'hsetnx must not run without an api key')
		assert.equal(warns.length, 1)
	}
})

test('(4) hsetnx rejects → caught, {seeded:false} (non-fatal — boot continues)', async () => {
	const redis = makeStubRedis({reject: true})
	const {logger, warns} = makeLogger()
	const out = await ensureLivDeploySeeded(redis, 'liv_k_abc', logger)
	assert.deepEqual(out, {seeded: false})
	assert.equal(warns.length, 1)
})

test('buildLivDeployEntry shape matches the seed entry (runtime path + key)', () => {
	const entry = JSON.parse(buildLivDeployEntry('liv_k_xyz'))
	assert.equal(entry.name, 'liv-deploy')
	assert.equal(entry.transport, 'stdio')
	assert.equal(entry.command, '/usr/bin/npx')
	assert.deepEqual(entry.args, ['tsx', '/opt/livos/packages/livinityd/source/modules/mcp/local/liv-deploy/index.ts'])
	assert.equal(entry.env.LIVINITYD_API_URL, 'http://127.0.0.1:8080')
	assert.equal(entry.env.LIV_API_KEY, 'liv_k_xyz')
	assert.equal(entry.category, 'system')
	assert.equal(entry.enabled, true)
})
