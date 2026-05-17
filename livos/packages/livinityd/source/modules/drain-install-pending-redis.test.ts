/**
 * Phase 141-01 — drain-install-pending-redis.test.ts
 *
 * DI-based unit test (Map-backed fake Redis + virtual file ops). Bare tsx runner,
 * node:assert/strict. Mirrors seed-builtin-tools.test.ts pattern.
 */

import assert from 'node:assert/strict'

import {
	drainInstallPendingRedisKeys,
	_testing,
	type RedisLike,
	type DrainLogger,
} from './drain-install-pending-redis.js'

// ─── Test isolation guard ───────────────────────────────────────────────────
{
	const url = process.env.REDIS_URL ?? ''
	const PROD_IP = '10.69.31.68'
	if (/10\.69\.31\.68/.test(url) || /livos@/.test(url) || url.includes(PROD_IP)) {
		console.error(`REFUSING to run drain-install-pending-redis.test.ts against production Redis: ${url}`)
		process.exit(99)
	}
}

// ─── Map-backed fake Redis with SETNX semantics ─────────────────────────────
function makeFakeRedis(): {redis: RedisLike; store: Map<string, string>} {
	const store = new Map<string, string>()
	const redis: RedisLike = {
		async setnx(key: string, value: string) {
			if (store.has(key)) return 0
			store.set(key, value)
			return 1
		},
	}
	return {redis, store}
}

function makeCapturingLogger(): {logger: DrainLogger; logs: string[]; errors: string[]} {
	const logs: string[] = []
	const errors: string[] = []
	const logger: DrainLogger = {
		log: (msg) => logs.push(msg),
		error: (msg) => errors.push(msg),
	}
	return {logger, logs, errors}
}

// ─── Virtual filesystem stub ────────────────────────────────────────────────
function withVirtualFile(content: string | null) {
	const removed = {wasRemoved: false}
	_testing.setFileOps({
		read: async () => {
			if (content === null) {
				const err: NodeJS.ErrnoException = new Error('ENOENT')
				err.code = 'ENOENT'
				throw err
			}
			return content
		},
		remove: async () => {
			removed.wasRemoved = true
		},
	})
	return removed
}

function withReadError(err: Error & {code?: string}) {
	_testing.setFileOps({
		read: async () => {
			throw err
		},
		remove: async () => {},
	})
}

// ─── Tests ──────────────────────────────────────────────────────────────────

async function test_no_file_returns_zero_counts() {
	const {redis, store} = makeFakeRedis()
	const {logger} = makeCapturingLogger()
	const removed = withVirtualFile(null) // ENOENT

	const r = await drainInstallPendingRedisKeys(redis, logger)
	assert.deepEqual(r, {applied: 0, skipped: 0, errored: 0})
	assert.equal(store.size, 0)
	assert.equal(removed.wasRemoved, false)
}

async function test_applies_queued_keys() {
	const {redis, store} = makeFakeRedis()
	const {logger, logs} = makeCapturingLogger()
	const removed = withVirtualFile(
		'livos:domain:local_mode=hybrid\n' +
			'livos:domain:host_ip=10.69.31.68\n' +
			'livos:domain:tunnel_domain=socinity.livinity.io\n',
	)

	const r = await drainInstallPendingRedisKeys(redis, logger)
	assert.equal(r.applied, 3, `expected 3 applied, got ${r.applied}`)
	assert.equal(r.skipped, 0)
	assert.equal(r.errored, 0)
	assert.equal(store.get('livos:domain:local_mode'), 'hybrid')
	assert.equal(store.get('livos:domain:host_ip'), '10.69.31.68')
	assert.equal(store.get('livos:domain:tunnel_domain'), 'socinity.livinity.io')
	assert.equal(removed.wasRemoved, true, 'file should be removed after successful drain')
	assert.equal(logs.length, 3, `expected 3 log lines, got ${logs.length}`)
}

async function test_setnx_preserves_runtime_overrides() {
	// Operator wrote a runtime value; queued seed must NOT overwrite it.
	const {redis, store} = makeFakeRedis()
	store.set('livos:domain:local_mode', 'tunnel') // pre-existing runtime value
	const {logger} = makeCapturingLogger()
	withVirtualFile(
		'livos:domain:local_mode=hybrid\n' + 'livos:domain:host_ip=192.168.1.5\n',
	)

	const r = await drainInstallPendingRedisKeys(redis, logger)
	assert.equal(r.applied, 1, 'only the new key should be applied')
	assert.equal(r.skipped, 1, 'the runtime-overridden key should be skipped')
	assert.equal(store.get('livos:domain:local_mode'), 'tunnel', 'runtime value preserved')
	assert.equal(store.get('livos:domain:host_ip'), '192.168.1.5')
}

async function test_skips_empty_and_malformed_lines() {
	const {redis, store} = makeFakeRedis()
	const {logger} = makeCapturingLogger()
	withVirtualFile(
		'\n' +
			'   \n' +
			'no-equals-sign\n' +
			'=value-without-key\n' +
			'livos:domain:local_mode=hybrid\n' +
			'\n',
	)

	const r = await drainInstallPendingRedisKeys(redis, logger)
	assert.equal(r.applied, 1, 'only the one well-formed line should apply')
	assert.equal(store.size, 1)
	assert.equal(store.get('livos:domain:local_mode'), 'hybrid')
}

async function test_value_with_equals_sign_preserved() {
	// URLs/JSON values containing `=` (e.g. base64) — first `=` separates key.
	const {redis, store} = makeFakeRedis()
	const {logger} = makeCapturingLogger()
	withVirtualFile('livos:custom:token=abc=def=ghi\n')

	const r = await drainInstallPendingRedisKeys(redis, logger)
	assert.equal(r.applied, 1)
	assert.equal(store.get('livos:custom:token'), 'abc=def=ghi')
}

async function test_read_error_returns_errored() {
	const err = new Error('EACCES') as Error & {code?: string}
	err.code = 'EACCES'
	withReadError(err)

	const {redis} = makeFakeRedis()
	const {logger, errors} = makeCapturingLogger()
	const r = await drainInstallPendingRedisKeys(redis, logger)
	assert.equal(r.errored, 1)
	assert.equal(errors.length, 1)
}

async function test_setnx_failure_keeps_file_for_retry() {
	const store = new Map<string, string>()
	let callIdx = 0
	const redis: RedisLike = {
		async setnx(key: string, value: string) {
			callIdx++
			if (callIdx === 2) throw new Error('connection lost')
			if (store.has(key)) return 0
			store.set(key, value)
			return 1
		},
	}
	const {logger, errors} = makeCapturingLogger()
	const removed = withVirtualFile(
		'livos:domain:local_mode=hybrid\n' + 'livos:domain:host_ip=1.2.3.4\n',
	)

	const r = await drainInstallPendingRedisKeys(redis, logger)
	assert.equal(r.applied, 1, 'first line applies')
	assert.equal(r.errored, 1, 'second line errors')
	assert.equal(errors.length, 1)
	assert.equal(removed.wasRemoved, false, 'file MUST persist when any line errored')
}

// ─── Runner ─────────────────────────────────────────────────────────────────
async function run() {
	const tests = [
		['no file → zero counts, no remove', test_no_file_returns_zero_counts],
		['applies all queued keys + removes file', test_applies_queued_keys],
		['SETNX preserves runtime overrides', test_setnx_preserves_runtime_overrides],
		['skips empty and malformed lines', test_skips_empty_and_malformed_lines],
		['value with embedded = preserved', test_value_with_equals_sign_preserved],
		['read error logs + reports errored', test_read_error_returns_errored],
		['SETNX failure keeps file for retry', test_setnx_failure_keeps_file_for_retry],
	] as const

	let passed = 0
	let failed = 0
	for (const [name, fn] of tests) {
		_testing.resetFileOps()
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
	_testing.resetFileOps()
	console.log(`\n${passed} passed, ${failed} failed`)
	process.exit(failed === 0 ? 0 : 1)
}

run().catch((err) => {
	console.error(err)
	process.exit(2)
})

// Sacred SHA invariant: f3538e1d811992b782a9bb057d1b7f0a0189f95f
