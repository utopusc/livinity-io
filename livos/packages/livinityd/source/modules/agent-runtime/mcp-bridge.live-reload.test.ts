/**
 * Phase 205-03 — McpBridge live-reload test.
 *
 * Coverage (≥5 cases, per acceptance criteria):
 *   1. On construction with non-empty `liv:mcp:config`, all enabled stdio
 *      entries spawn through the injected mcpClientFactory (Map size matches).
 *   2. Publishing `liv:mcp:updated` with op:set for a brand-new enabled entry
 *      causes reconcileServers() to spawn a new client (Map size + 1) within
 *      1s of fake-timer advance.
 *   3. Publishing `liv:mcp:updated` with op:delete (or removing the hash entry
 *      then publishing) causes reconcileServers() to disconnect the previously
 *      spawned client (Map size - 1) and call disconnect() on it.
 *   4. Two rapid publishes (set then delete) are serialised — no double-spawn,
 *      no extra disconnect calls.
 *   5. destroy() closes BOTH external clients AND the duplicated subscribe
 *      connection (no socket leak — subConnection.quit was invoked).
 *
 * Threat-model: the live-reload pub/sub channel is internal trust boundary;
 * publishes only come from mcp-config-router.ts which is admin-gated.
 */

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {createMcpBridge} from './mcp-bridge.js'

/**
 * Fake Redis that satisfies both McpBridgeRedis (main connection) and
 * McpBridgeSubRedis (duplicated subscribe connection). `publish()` synchronously
 * invokes registered listeners on the duplicate so vitest fake-timers can drive
 * the reconcile loop deterministically.
 */
interface FakeRedis {
	hash: Map<string, string>
	luseEnabled: string | null
	get: ReturnType<typeof vi.fn>
	hgetall: ReturnType<typeof vi.fn>
	publish: (channel: string, message: string) => Promise<number>
	duplicate: () => FakeSubRedis
	quit: () => Promise<void>
	setHash(name: string, payload: object): void
	deleteHash(name: string): void
	listeners: Array<(channel: string, message: string) => void>
}

interface FakeSubRedis {
	subscribe: ReturnType<typeof vi.fn>
	on: ReturnType<typeof vi.fn>
	quit: ReturnType<typeof vi.fn>
}

function makeFakeRedis(initial: Record<string, object> = {}, luseEnabled: string | null = 'false'): FakeRedis {
	const hash = new Map<string, string>()
	for (const [k, v] of Object.entries(initial)) hash.set(k, JSON.stringify(v))
	const listeners: Array<(channel: string, message: string) => void> = []
	const redis: FakeRedis = {
		hash,
		luseEnabled,
		listeners,
		get: vi.fn(async (k: string) => {
			if (k === 'liv:mcp:luse:enabled') return luseEnabled
			return null
		}),
		hgetall: vi.fn(async (_k: string) => Object.fromEntries(hash)),
		publish: async (channel: string, message: string) => {
			for (const l of listeners) l(channel, message)
			return listeners.length
		},
		duplicate: () => {
			const sub: FakeSubRedis = {
				subscribe: vi.fn(async (_channel: string) => undefined),
				on: vi.fn((event: 'message', listener: (c: string, m: string) => void) => {
					if (event === 'message') listeners.push(listener)
					return sub
				}),
				quit: vi.fn(async () => undefined),
			}
			return sub
		},
		quit: async () => undefined,
		setHash(name: string, payload: object) {
			hash.set(name, JSON.stringify(payload))
		},
		deleteHash(name: string) {
			hash.delete(name)
		},
	}
	return redis
}

interface FakeMcpClient {
	getTools: ReturnType<typeof vi.fn>
	disconnect: ReturnType<typeof vi.fn>
	__spawnArgs: unknown
}

function makeFactoryRecorder() {
	const spawned: FakeMcpClient[] = []
	const factory = vi.fn((opts: unknown) => {
		const client: FakeMcpClient = {
			__spawnArgs: opts,
			getTools: vi.fn(async () => ({})),
			disconnect: vi.fn(async () => undefined),
		}
		spawned.push(client)
		return client
	})
	return {factory, spawned}
}

function makeLogger() {
	return {
		warn: vi.fn(),
		info: vi.fn(),
	}
}

const ENABLED_STDIO_FOO = {
	transport: 'stdio',
	command: '/usr/bin/foo',
	args: ['--mcp'],
	enabled: true,
}

const ENABLED_STDIO_BAR = {
	transport: 'stdio',
	command: '/usr/bin/bar',
	enabled: true,
}

beforeEach(() => {
	// Each test uses fake timers; advance via advanceTimersByTimeAsync.
	vi.useFakeTimers()
})

afterEach(() => {
	vi.useRealTimers()
})

describe('McpBridge live-reload (Phase 205-03)', () => {
	test('1. construction spawns enabled entries from liv:mcp:config (Map size matches)', async () => {
		const redis = makeFakeRedis({foo: ENABLED_STDIO_FOO, bar: ENABLED_STDIO_BAR})
		const {factory, spawned} = makeFactoryRecorder()
		await createMcpBridge(
			{redis: redis as never, logger: makeLogger()},
			{mcpClientFactory: factory as never},
		)
		// Two external clients spawned (no Luse since luseEnabled=false).
		expect(spawned).toHaveLength(2)
		const ids = spawned.map((c) => (c.__spawnArgs as {id: string}).id).sort()
		expect(ids).toEqual(['livos-mcp-bar', 'livos-mcp-foo'])
	})

	test('2. publish op:set with a new enabled entry spawns a new client within 1s', async () => {
		const redis = makeFakeRedis({})
		const {factory, spawned} = makeFactoryRecorder()
		await createMcpBridge(
			{redis: redis as never, logger: makeLogger()},
			{mcpClientFactory: factory as never},
		)
		expect(spawned).toHaveLength(0)

		// Operator adds 'foo' via the tRPC mutation: hash write happens first,
		// then publish fires.
		redis.setHash('foo', ENABLED_STDIO_FOO)
		await redis.publish(
			'liv:mcp:updated',
			JSON.stringify({op: 'set', name: 'foo', ts: '2026-05-24T00:00:00Z'}),
		)
		// Drive the microtask queue + advance fake timers to bound to 1s.
		await vi.advanceTimersByTimeAsync(1000)

		expect(spawned).toHaveLength(1)
		expect((spawned[0]!.__spawnArgs as {id: string}).id).toBe('livos-mcp-foo')
	})

	test('3. publish op:delete (entry removed from hash) disconnects the client', async () => {
		const redis = makeFakeRedis({foo: ENABLED_STDIO_FOO})
		const {factory, spawned} = makeFactoryRecorder()
		await createMcpBridge(
			{redis: redis as never, logger: makeLogger()},
			{mcpClientFactory: factory as never},
		)
		expect(spawned).toHaveLength(1)
		const fooClient = spawned[0]!

		// Operator deletes 'foo' via the tRPC mutation.
		redis.deleteHash('foo')
		await redis.publish(
			'liv:mcp:updated',
			JSON.stringify({op: 'delete', name: 'foo', ts: '2026-05-24T00:00:00Z'}),
		)
		await vi.advanceTimersByTimeAsync(1000)

		expect(fooClient.disconnect).toHaveBeenCalledTimes(1)
	})

	test('4. rapid publishes (set then delete) are serialised — no double-spawn race', async () => {
		const redis = makeFakeRedis({})
		const {factory, spawned} = makeFactoryRecorder()
		await createMcpBridge(
			{redis: redis as never, logger: makeLogger()},
			{mcpClientFactory: factory as never},
		)
		// Rapid burst: set foo, then immediately delete foo. The reconciler
		// should serialise them and end up with NO foo client (delete wins).
		redis.setHash('foo', ENABLED_STDIO_FOO)
		await redis.publish(
			'liv:mcp:updated',
			JSON.stringify({op: 'set', name: 'foo', ts: '2026-05-24T00:00:00Z'}),
		)
		redis.deleteHash('foo')
		await redis.publish(
			'liv:mcp:updated',
			JSON.stringify({op: 'delete', name: 'foo', ts: '2026-05-24T00:00:01Z'}),
		)
		await vi.advanceTimersByTimeAsync(1000)

		// In the worst case, the first reconcile spawned foo, then the second
		// reconcile (queued via pendingReconcile) disconnects it. Net result:
		// zero clients left active. Spawn count <= 1 (no double-spawn).
		expect(spawned.length).toBeLessThanOrEqual(1)
		for (const c of spawned) {
			expect(c.disconnect).toHaveBeenCalledTimes(1)
		}
	})

	test('5. destroy() disconnects external clients AND quits the subscribe connection', async () => {
		const redis = makeFakeRedis({foo: ENABLED_STDIO_FOO})
		const {factory, spawned} = makeFactoryRecorder()
		// Capture the duplicate so we can assert quit was called.
		const origDuplicate = redis.duplicate
		let capturedSub: FakeSubRedis | null = null
		redis.duplicate = () => {
			const sub = origDuplicate()
			capturedSub = sub
			return sub
		}
		const bridge = await createMcpBridge(
			{redis: redis as never, logger: makeLogger()},
			{mcpClientFactory: factory as never},
		)
		expect(spawned).toHaveLength(1)
		expect(capturedSub).not.toBeNull()

		await bridge.destroy()

		expect(spawned[0]!.disconnect).toHaveBeenCalledTimes(1)
		expect((capturedSub as unknown as FakeSubRedis).quit).toHaveBeenCalledTimes(1)
	})

	test('6. subscribe loop wires up — duplicate().subscribe() is called with the channel', async () => {
		const redis = makeFakeRedis({})
		const {factory} = makeFactoryRecorder()
		let capturedSub: FakeSubRedis | null = null
		const orig = redis.duplicate
		redis.duplicate = () => {
			const sub = orig()
			capturedSub = sub
			return sub
		}
		await createMcpBridge(
			{redis: redis as never, logger: makeLogger()},
			{mcpClientFactory: factory as never},
		)
		expect(capturedSub).not.toBeNull()
		expect((capturedSub as unknown as FakeSubRedis).subscribe).toHaveBeenCalledWith('liv:mcp:updated')
		expect((capturedSub as unknown as FakeSubRedis).on).toHaveBeenCalled()
	})
})
