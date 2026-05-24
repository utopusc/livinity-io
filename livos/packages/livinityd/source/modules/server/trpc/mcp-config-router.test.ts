/**
 * Phase 205-03 — mcp-config-router unit tests.
 *
 * Coverage:
 *   1. add  → publishes `liv:mcp:updated` with op:'set' and the new name
 *   2. delete → publishes `liv:mcp:updated` with op:'delete' and the name
 *   3. update → publishes `liv:mcp:updated` with op:'set'
 *   4. toggle → publishes `liv:mcp:updated` with op:'set'
 *   5. publish failure does NOT bubble out of the mutation (best-effort)
 *   6. Built router list/add round-trip (sanity — INV-203-09 wire contract preserved)
 */

import {describe, expect, test, vi} from 'vitest'

import {createMcpConfigRouter, mcpConfigRouter} from './mcp-config-router.js'

function makeAdminCtx() {
	return {
		livinityd: {} as never,
		logger: {
			info: () => undefined,
			warn: () => undefined,
			error: () => undefined,
			verbose: () => undefined,
			log: () => undefined,
			debug: () => undefined,
		},
		server: {} as never,
		user: {} as never,
		appStore: {} as never,
		apps: {} as never,
		dangerouslyBypassAuthentication: true,
		currentUser: {id: 'admin-uuid', username: 'admin', role: 'admin' as const},
		transport: 'express' as const,
	}
}

/**
 * In-memory fake of the `McpConfigRedisClient` surface — hgetall/hget/hset/hdel
 * backed by a Map, plus a `publish` spy. Pre-seeded entries simulate the
 * `update`/`toggle`/`delete` cases that read-then-write.
 */
function makeFakeRedis(seed: Record<string, string> = {}) {
	const hash = new Map<string, string>(Object.entries(seed))
	return {
		hash,
		hgetall: vi.fn(async (_key: string) => Object.fromEntries(hash)),
		hget: vi.fn(async (_key: string, field: string) => hash.get(field) ?? null),
		hset: vi.fn(async (_key: string, field: string, value: string) => {
			hash.set(field, value)
			return 1
		}),
		hdel: vi.fn(async (_key: string, field: string) => {
			const had = hash.delete(field)
			return had ? 1 : 0
		}),
		publish: vi.fn(async (_channel: string, _message: string) => 1),
	}
}

function makeDeps(seed: Record<string, string> = {}) {
	const redis = makeFakeRedis(seed)
	const logger = {info: vi.fn(), warn: vi.fn()}
	return {redis, logger, deps: {redis, logger}}
}

const SAMPLE_BODY = JSON.stringify({
	transport: 'stdio',
	command: '/usr/bin/echo',
	args: ['hello'],
	enabled: true,
})

describe('mcpConfigRouter — empty-injection stub', () => {
	test('1. list throws PRECONDITION_FAILED when production boot has not wired the Redis client', async () => {
		const caller = mcpConfigRouter.createCaller(makeAdminCtx() as never)
		await expect(caller.list()).rejects.toMatchObject({
			code: 'PRECONDITION_FAILED',
		})
	})
})

describe('createMcpConfigRouter — pub/sub coverage (Phase 205-03)', () => {
	test('2. add publishes liv:mcp:updated with op:set and the new server name', async () => {
		const {redis, deps} = makeDeps()
		const caller = createMcpConfigRouter(deps).createCaller(makeAdminCtx() as never)

		await caller.add({
			name: 'remote-echo',
			transport: 'stdio',
			command: '/usr/bin/echo',
			args: ['hi'],
			enabled: true,
		})

		expect(redis.publish).toHaveBeenCalledTimes(1)
		const [channel, body] = redis.publish.mock.calls[0]!
		expect(channel).toBe('liv:mcp:updated')
		const parsed = JSON.parse(body as string)
		expect(parsed.op).toBe('set')
		expect(parsed.name).toBe('remote-echo')
		expect(typeof parsed.ts).toBe('string')
		// ISO-8601 timestamp shape
		expect(parsed.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
	})

	test('3. delete publishes liv:mcp:updated with op:delete and the name', async () => {
		const {redis, deps} = makeDeps({'remote-echo': SAMPLE_BODY})
		const caller = createMcpConfigRouter(deps).createCaller(makeAdminCtx() as never)

		await caller.delete({name: 'remote-echo'})

		expect(redis.publish).toHaveBeenCalledTimes(1)
		const [channel, body] = redis.publish.mock.calls[0]!
		expect(channel).toBe('liv:mcp:updated')
		const parsed = JSON.parse(body as string)
		expect(parsed.op).toBe('delete')
		expect(parsed.name).toBe('remote-echo')
	})

	test('4. update publishes liv:mcp:updated with op:set', async () => {
		const {redis, deps} = makeDeps({'remote-echo': SAMPLE_BODY})
		const caller = createMcpConfigRouter(deps).createCaller(makeAdminCtx() as never)

		await caller.update({name: 'remote-echo', patch: {enabled: false}})

		expect(redis.publish).toHaveBeenCalledTimes(1)
		const [channel, body] = redis.publish.mock.calls[0]!
		expect(channel).toBe('liv:mcp:updated')
		const parsed = JSON.parse(body as string)
		expect(parsed.op).toBe('set')
		expect(parsed.name).toBe('remote-echo')
	})

	test('5. toggle publishes liv:mcp:updated with op:set', async () => {
		const {redis, deps} = makeDeps({'remote-echo': SAMPLE_BODY})
		const caller = createMcpConfigRouter(deps).createCaller(makeAdminCtx() as never)

		await caller.toggle({name: 'remote-echo', enabled: false})

		expect(redis.publish).toHaveBeenCalledTimes(1)
		const [channel, body] = redis.publish.mock.calls[0]!
		expect(channel).toBe('liv:mcp:updated')
		const parsed = JSON.parse(body as string)
		expect(parsed.op).toBe('set')
		expect(parsed.name).toBe('remote-echo')
	})

	test('6. publish failure is swallowed (best-effort) and mutation still returns ok', async () => {
		const {redis, deps, logger} = makeDeps()
		redis.publish.mockRejectedValueOnce(new Error('redis down'))
		const caller = createMcpConfigRouter(deps).createCaller(makeAdminCtx() as never)

		const res = await caller.add({
			name: 'remote-echo',
			transport: 'stdio',
			command: '/usr/bin/echo',
			enabled: true,
		})
		expect(res).toEqual({ok: true})
		expect(redis.hset).toHaveBeenCalledTimes(1)
		expect(logger.warn).toHaveBeenCalled()
	})

	test('7. system MCP delete (luse) rejects BEFORE any publish', async () => {
		const {redis, deps} = makeDeps()
		const caller = createMcpConfigRouter(deps).createCaller(makeAdminCtx() as never)

		await expect(caller.delete({name: 'luse'})).rejects.toMatchObject({
			code: 'FORBIDDEN',
		})
		expect(redis.publish).not.toHaveBeenCalled()
	})

	test('8. list round-trip preserves INV-203-09 wire contract — no publish, no schema change', async () => {
		const {redis, deps} = makeDeps({'remote-echo': SAMPLE_BODY})
		const caller = createMcpConfigRouter(deps).createCaller(makeAdminCtx() as never)
		const entries = await caller.list()
		expect(entries).toHaveLength(1)
		expect(entries[0]!.name).toBe('remote-echo')
		expect(entries[0]!.transport).toBe('stdio')
		expect(entries[0]!.command).toBe('/usr/bin/echo')
		expect(entries[0]!.enabled).toBe(true)
		expect(redis.publish).not.toHaveBeenCalled()
	})
})
