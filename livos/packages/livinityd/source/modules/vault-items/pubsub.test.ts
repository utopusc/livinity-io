/**
 * Phase 171-05 — pubsub vitest spec (8 assertions).
 *
 * Coverage map (matches plan's <behavior> block 1:1):
 *   B1 — create publishes {type:'create', itemId, timestamp} after store.create resolves
 *   B2 — update publishes {type:'update', itemId, timestamp} after store.update resolves
 *   B3 — archive publishes {type:'archive', itemId, timestamp} after archive resolves
 *   B4 — unarchive publishes {type:'unarchive', itemId, timestamp} after unarchive resolves
 *   B5 — delete=true publishes {type:'delete', itemId, timestamp}; delete=false does NOT publish
 *   B6 — read/list/itemDir are pass-throughs (no publish)
 *   B7 — redis.publish rejection is logged via logger.error and does NOT bubble (mutation succeeds)
 *   B8 — TREE_UPDATED_CHANNEL literal === 'liv:tree:updated'
 *
 * Per-test isolated tmpdir + stubbed Redis that records every publish(channel, payload)
 * call into an array. Real ItemStore (Plan 171-02) is wrapped — no mocks of the store.
 *
 * Sacred SHA f3538e1d... + D-09 + Phase 162-01/02 + Phase 166 cc-pty
 * + Phase 168 cc-pty-router + Phase 169 vault-graph + Phase 171-01/02/03
 * vault-items predecessors all UNCHANGED.
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {promises as fs} from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {randomUUID} from 'node:crypto'
import type {Redis} from 'ioredis'

import {ItemStore} from './item-store.js'
import {createItemStorePubSub, TREE_UPDATED_CHANNEL} from './pubsub.js'

// ─── Test helpers ────────────────────────────────────────────────────────

interface RecordedPublish {
	channel: string
	payload: string
}

function makeFakeRedis(opts: {failPublish?: boolean} = {}): {
	redis: Redis
	calls: RecordedPublish[]
} {
	const calls: RecordedPublish[] = []
	const redis = {
		publish: vi.fn(async (channel: string, payload: string) => {
			if (opts.failPublish) throw new Error('redis offline')
			calls.push({channel, payload})
			return calls.length // simulate subscriber count
		}),
	} as unknown as Redis
	return {redis, calls}
}

interface RecordedError {
	msg: string
	err?: unknown
}

function makeLogger() {
	const errors: RecordedError[] = []
	const logs: string[] = []
	return {
		log: vi.fn((msg: string) => {
			logs.push(msg)
		}),
		error: vi.fn((msg: string, err?: unknown) => {
			errors.push({msg, err})
		}),
		errors,
		logs,
	}
}

/**
 * Wait for any microtasks AND the next macrotask tick. The wrapper enqueues
 * `redis.publish(...).catch(...)` without awaiting it, so a single
 * `await Promise.resolve()` is not always enough — schedule a macrotask
 * via setImmediate to ensure the .catch handler ran.
 */
async function flushMicrotasks(): Promise<void> {
	await Promise.resolve()
	await new Promise((r) => setImmediate(r))
}

// ─── Spec ────────────────────────────────────────────────────────────────

describe('pubsub: createItemStorePubSub', () => {
	let vaultRoot: string
	let store: ItemStore

	beforeEach(async () => {
		vaultRoot = path.join(os.tmpdir(), `vault-items-pubsub-${randomUUID()}`)
		await fs.mkdir(vaultRoot, {recursive: true})
		store = new ItemStore({vaultRoot})
	})

	afterEach(async () => {
		vi.restoreAllMocks()
		await fs.rm(vaultRoot, {recursive: true, force: true}).catch(() => {})
	})

	it('B1: create() publishes {type:create, itemId, timestamp} after store.create resolves', async () => {
		const {redis, calls} = makeFakeRedis()
		const logger = makeLogger()
		const wrapped = createItemStorePubSub(store, redis, logger)

		const before = Date.now()
		const item = await wrapped.create({type: 'project', name: 'P1'})
		await flushMicrotasks()
		const after = Date.now()

		expect(calls).toHaveLength(1)
		expect(calls[0].channel).toBe(TREE_UPDATED_CHANNEL)
		const event = JSON.parse(calls[0].payload)
		expect(event.type).toBe('create')
		expect(event.itemId).toBe(item.id)
		expect(typeof event.timestamp).toBe('number')
		expect(event.timestamp).toBeGreaterThanOrEqual(before)
		expect(event.timestamp).toBeLessThanOrEqual(after)
	})

	it('B2: update() publishes {type:update, itemId, timestamp} after store.update resolves', async () => {
		const {redis, calls} = makeFakeRedis()
		const logger = makeLogger()
		const wrapped = createItemStorePubSub(store, redis, logger)

		const item = await wrapped.create({type: 'agent', name: 'A1'})
		await flushMicrotasks()
		calls.length = 0 // reset — only assert on the update event

		await wrapped.update(item.id, {name: 'A1-renamed'})
		await flushMicrotasks()

		expect(calls).toHaveLength(1)
		const event = JSON.parse(calls[0].payload)
		expect(event.type).toBe('update')
		expect(event.itemId).toBe(item.id)
		expect(typeof event.timestamp).toBe('number')
	})

	it('B3: archive() publishes {type:archive, itemId, timestamp} after archive resolves', async () => {
		const {redis, calls} = makeFakeRedis()
		const logger = makeLogger()
		const wrapped = createItemStorePubSub(store, redis, logger)

		const item = await wrapped.create({type: 'chat', name: 'C1'})
		await flushMicrotasks()
		calls.length = 0

		await wrapped.archive(item.id)
		await flushMicrotasks()

		// archive() internally calls update(), so the wrapper's update() path
		// would also try to publish. The contract is that the wrapper's
		// archive() emits an 'archive' event — the underlying store.archive
		// is what the wrapper calls, which itself uses store.update directly
		// (NOT wrapped). So we should see exactly one 'archive' event.
		const archiveEvents = calls.filter((c) => {
			try {
				return JSON.parse(c.payload).type === 'archive'
			} catch {
				return false
			}
		})
		expect(archiveEvents).toHaveLength(1)
		const event = JSON.parse(archiveEvents[0].payload)
		expect(event.itemId).toBe(item.id)
		expect(typeof event.timestamp).toBe('number')
	})

	it('B4: unarchive() publishes {type:unarchive, itemId, timestamp} after unarchive resolves', async () => {
		const {redis, calls} = makeFakeRedis()
		const logger = makeLogger()
		const wrapped = createItemStorePubSub(store, redis, logger)

		const item = await wrapped.create({type: 'project', name: 'P1'})
		await wrapped.archive(item.id)
		await flushMicrotasks()
		calls.length = 0

		await wrapped.unarchive(item.id)
		await flushMicrotasks()

		const unarchiveEvents = calls.filter((c) => {
			try {
				return JSON.parse(c.payload).type === 'unarchive'
			} catch {
				return false
			}
		})
		expect(unarchiveEvents).toHaveLength(1)
		const event = JSON.parse(unarchiveEvents[0].payload)
		expect(event.itemId).toBe(item.id)
		expect(typeof event.timestamp).toBe('number')
	})

	it('B5: delete=true publishes; delete=false does NOT publish', async () => {
		const {redis, calls} = makeFakeRedis()
		const logger = makeLogger()
		const wrapped = createItemStorePubSub(store, redis, logger)

		const item = await wrapped.create({type: 'project', name: 'P-to-delete'})
		await flushMicrotasks()
		calls.length = 0

		// Real delete — folder exists, store returns true
		const ok1 = await wrapped.delete(item.id)
		expect(ok1).toBe(true)
		await flushMicrotasks()

		const deleteEvents = calls.filter((c) => {
			try {
				return JSON.parse(c.payload).type === 'delete'
			} catch {
				return false
			}
		})
		expect(deleteEvents).toHaveLength(1)
		const event = JSON.parse(deleteEvents[0].payload)
		expect(event.itemId).toBe(item.id)

		// Reset and try a no-op delete (item already gone) — must NOT publish
		calls.length = 0
		const ok2 = await wrapped.delete(item.id)
		expect(ok2).toBe(false)
		await flushMicrotasks()
		expect(calls.filter((c) => c.channel === TREE_UPDATED_CHANNEL)).toHaveLength(0)
	})

	it('B6: read() / list() / itemDir() are pass-throughs (no publish)', async () => {
		const {redis, calls} = makeFakeRedis()
		const logger = makeLogger()
		const wrapped = createItemStorePubSub(store, redis, logger)

		// Seed one item so list/read have something to return
		const item = await wrapped.create({type: 'project', name: 'P-readonly'})
		await flushMicrotasks()
		calls.length = 0

		const got = await wrapped.read(item.id)
		expect(got).not.toBeNull()
		expect(got?.id).toBe(item.id)

		const all = await wrapped.list()
		expect(all.map((i) => i.id)).toContain(item.id)

		const dir = wrapped.itemDir(item.id)
		expect(dir).toBe(path.join(vaultRoot, 'items', item.id))

		await flushMicrotasks()
		// Zero publish calls from any of the three read methods. (We assert
		// against the recorded-calls array — not the spy's total call count —
		// because the seed `create` above already incremented the spy, but
		// the array was reset to length 0 just before the read methods ran.)
		expect(calls).toHaveLength(0)
	})

	it('B7: redis.publish rejection is logged via logger.error and does NOT bubble (mutation succeeds)', async () => {
		const {redis} = makeFakeRedis({failPublish: true})
		const logger = makeLogger()
		const wrapped = createItemStorePubSub(store, redis, logger)

		// Despite the Redis publish failure, create() must still return a valid Item.
		const item = await wrapped.create({type: 'project', name: 'P-redis-down'})
		expect(item).toBeTruthy()
		expect(item.id).toBeTruthy()

		// Wait for the swallowed .catch handler to run
		await flushMicrotasks()

		expect(logger.errors).toHaveLength(1)
		expect(logger.errors[0].msg).toContain('publish failed')
		// And the error object itself is the Redis rejection
		expect((logger.errors[0].err as Error).message).toBe('redis offline')
	})

	it('B8: TREE_UPDATED_CHANNEL literal === "liv:tree:updated"', () => {
		expect(TREE_UPDATED_CHANNEL).toBe('liv:tree:updated')
	})
})
