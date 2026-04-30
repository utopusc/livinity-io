import assert from 'node:assert/strict'
import express from 'express'
import http from 'node:http'
import pg from 'pg'

/**
 * Integration test for the broker router.
 *
 * Mounts the real broker router on a fresh Express app, mocks the upstream
 * /api/agent/stream call (broker proxies to it), and asserts end-to-end
 * behavior for sync + SSE + error paths.
 *
 * Mocking strategy (no Vitest, no test framework — matches Phase 40's bare-tsx
 * + node:assert/strict pattern):
 *
 *   1. Patch `pg.Pool.prototype.connect` + `pg.Pool.prototype.query` BEFORE
 *      importing the broker module. The broker's auth.ts imports findUserById
 *      / getAdminUser from database/index.ts, which dispatch to the
 *      module-level pg.Pool. Patching the prototype + installing a pool via
 *      initDatabase() lets us return canned user rows without a real
 *      Postgres connection.
 *
 *   2. Monkey-patch global `fetch` per test to return a controlled SSE stream
 *      simulating nexus's /api/agent/stream upstream.
 *
 *   3. Spin up a fresh Express app on an ephemeral port (127.0.0.1) per test
 *      so the IP guard naturally allows requests.
 */

interface FakeUser {
	id: string
	username?: string
	role?: string
}

let mockUserStore: Map<string, FakeUser> = new Map()
let mockAdminUser: FakeUser | null = null

// Patch pg.Pool BEFORE the database module is loaded so initDatabase succeeds.
const originalConnect = pg.Pool.prototype.connect
const originalQuery = pg.Pool.prototype.query
const originalEnd = pg.Pool.prototype.end

;(pg.Pool.prototype as any).connect = async function () {
	return {
		query: async (sql: string, params?: unknown[]) => mockPoolQuery(sql, params),
		release: () => {},
	}
}
;(pg.Pool.prototype as any).query = async function (sql: string, params?: unknown[]) {
	return mockPoolQuery(sql, params)
}
;(pg.Pool.prototype as any).end = async function () {
	/* no-op */
}

function rowToUser(u: FakeUser) {
	return {
		id: u.id,
		username: u.username || 'mock',
		display_name: u.username || 'Mock',
		hashed_password: 'mock-hash',
		role: u.role || 'member',
		avatar_color: '#000',
		is_active: true,
		created_at: new Date(),
		updated_at: new Date(),
	}
}

function mockPoolQuery(sql: string, params?: unknown[]): {rows: unknown[]} {
	// Schema/migration queries → return empty rows
	if (/CREATE TABLE|CREATE INDEX|CREATE EXTENSION|ALTER TABLE|^\s*--/.test(sql)) {
		return {rows: []}
	}
	// findUserById: SELECT ... FROM users WHERE id = $1
	if (/FROM users WHERE id = \$1/.test(sql)) {
		const id = (params?.[0] as string) || ''
		const user = mockUserStore.get(id)
		return {rows: user ? [rowToUser(user)] : []}
	}
	// getAdminUser: SELECT ... FROM users WHERE role = 'admin' AND is_active = TRUE
	if (/FROM users WHERE role = 'admin'/.test(sql)) {
		return {rows: mockAdminUser ? [rowToUser(mockAdminUser)] : []}
	}
	// Pool.connect's test-query (selects 1) + initDatabase schema-application
	return {rows: []}
}

function setMockUsers(users: FakeUser[]) {
	mockUserStore = new Map(users.map((u) => [u.id, u]))
	mockAdminUser = users.find((u) => u.role === 'admin') || null
}

function makeFakeLivinityd(opts: {multiUser: boolean}) {
	return {
		dataDirectory: '/tmp/livos-test',
		logger: {log: () => {}, verbose: () => {}, error: () => {}},
		ai: {
			redis: {
				get: async (k: string) =>
					k === 'livos:system:multi_user' ? (opts.multiUser ? 'true' : 'false') : null,
			},
		},
	} as any
}

function mockUpstreamSse(events: Array<{type: string; data?: unknown; turn?: number}>): () => void {
	const original = globalThis.fetch
	globalThis.fetch = (async (input: any, init?: any) => {
		// Forward test's own fetch (to broker on 127.0.0.1:<port>) to the original implementation.
		// Only intercept calls to the broker's upstream (/api/agent/stream).
		const urlStr = typeof input === 'string' ? input : input?.url || ''
		if (!urlStr.includes('/api/agent/stream')) {
			return original(input, init)
		}
		const lines = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode(lines))
				controller.close()
			},
		})
		return new Response(stream, {status: 200, headers: {'Content-Type': 'text/event-stream'}})
	}) as any
	return () => {
		globalThis.fetch = original
	}
}

function startBrokerApp(
	livinityd: any,
	createBrokerRouter: any,
): Promise<{url: string; close: () => Promise<void>}> {
	return new Promise((resolve) => {
		const app = express()
		app.use('/u', createBrokerRouter({livinityd}))
		const server = http.createServer(app)
		server.listen(0, '127.0.0.1', () => {
			const addr = server.address() as any
			resolve({
				url: `http://127.0.0.1:${addr.port}`,
				close: () =>
					new Promise<void>((r) =>
						server.close(() => {
							r()
						}),
					),
			})
		})
	})
}

async function runTests() {
	// Initialize database (patched to use mock pool) so findUserById/getAdminUser have a non-null pool
	const dbMod = await import('../database/index.js')
	const initOk = await dbMod.initDatabase({
		log: () => {},
		verbose: () => {},
		error: () => {},
	} as any)
	assert.equal(initOk, true, 'initDatabase with mocked pg.Pool should succeed')

	const {createBrokerRouter} = await import('./router.js')

	const users: FakeUser[] = [
		{id: 'admin-1', username: 'admin', role: 'admin'},
		{id: 'user-2', username: 'user2', role: 'member'},
	]

	const livinityd = makeFakeLivinityd({multiUser: true})

	// Test 1: sync POST → Anthropic Messages JSON shape
	{
		setMockUsers(users)
		const restoreFetch = mockUpstreamSse([
			{type: 'thinking', turn: 1},
			{type: 'chunk', turn: 1, data: 'Hello '},
			{type: 'chunk', turn: 1, data: 'world.'},
			{type: 'final_answer', turn: 1, data: 'Hello world.'},
			{
				type: 'done',
				data: {success: true, answer: 'Hello world.', turns: 1, stoppedReason: 'complete'},
			},
		])
		const {url, close} = await startBrokerApp(livinityd, createBrokerRouter)
		const res = await fetch(`${url}/u/admin-1/v1/messages`, {
			method: 'POST',
			headers: {'content-type': 'application/json'},
			body: JSON.stringify({
				model: 'claude-sonnet-4-6',
				messages: [{role: 'user', content: 'hi'}],
			}),
		})
		assert.equal(res.status, 200, `expected 200, got ${res.status}`)
		const body = (await res.json()) as any
		assert.equal(body.type, 'message')
		assert.equal(body.role, 'assistant')
		assert.ok(Array.isArray(body.content) && body.content[0]?.type === 'text', 'content[0].type === text')
		assert.match(body.content[0].text, /Hello world\./)
		assert.equal(body.stop_reason, 'end_turn')
		await close()
		restoreFetch()
		console.log('  PASS Test 1: sync POST → Anthropic Messages JSON shape')
	}

	// Test 2: SSE POST → spec-compliant chunks ending in message_stop
	{
		setMockUsers(users)
		const restoreFetch = mockUpstreamSse([
			{type: 'thinking', turn: 1},
			{type: 'chunk', turn: 1, data: 'streamed!'},
			{type: 'final_answer', turn: 1, data: 'streamed!'},
			{
				type: 'done',
				data: {success: true, answer: 'streamed!', turns: 1, stoppedReason: 'complete'},
			},
		])
		const {url, close} = await startBrokerApp(livinityd, createBrokerRouter)
		const res = await fetch(`${url}/u/admin-1/v1/messages`, {
			method: 'POST',
			headers: {'content-type': 'application/json'},
			body: JSON.stringify({
				model: 'claude-sonnet-4-6',
				messages: [{role: 'user', content: 'hi'}],
				stream: true,
			}),
		})
		assert.equal(res.status, 200)
		assert.equal(res.headers.get('content-type'), 'text/event-stream')
		const text = await res.text()
		assert.match(text, /event: message_start\ndata: /)
		assert.match(text, /event: content_block_start\ndata: /)
		assert.match(text, /event: content_block_delta\ndata: .*streamed!/)
		assert.match(text, /event: message_stop\ndata: /)
		await close()
		restoreFetch()
		console.log('  PASS Test 2: SSE POST → Anthropic spec-compliant chunks')
	}

	// Test 3: unknown userId → 404
	{
		setMockUsers(users)
		const {url, close} = await startBrokerApp(livinityd, createBrokerRouter)
		const res = await fetch(`${url}/u/nonexistent-user/v1/messages`, {
			method: 'POST',
			headers: {'content-type': 'application/json'},
			body: JSON.stringify({
				model: 'x',
				messages: [{role: 'user', content: 'hi'}],
			}),
		})
		assert.equal(res.status, 404, `expected 404, got ${res.status}`)
		await close()
		console.log('  PASS Test 3: unknown userId → 404')
	}

	// Test 4: single-user mode + non-admin userId → 403
	{
		setMockUsers(users)
		const singleUserLivinityd = makeFakeLivinityd({multiUser: false})
		const {url, close} = await startBrokerApp(singleUserLivinityd, createBrokerRouter)
		const res = await fetch(`${url}/u/user-2/v1/messages`, {
			method: 'POST',
			headers: {'content-type': 'application/json'},
			body: JSON.stringify({
				model: 'x',
				messages: [{role: 'user', content: 'hi'}],
			}),
		})
		assert.equal(res.status, 403, `expected 403, got ${res.status}`)
		await close()
		console.log('  PASS Test 4: single-user mode + non-admin → 403')
	}

	// Test 5: invalid body shape (empty messages array) → 400
	{
		setMockUsers(users)
		const {url, close} = await startBrokerApp(livinityd, createBrokerRouter)
		const res = await fetch(`${url}/u/admin-1/v1/messages`, {
			method: 'POST',
			headers: {'content-type': 'application/json'},
			body: JSON.stringify({model: 'x', messages: []}),
		})
		assert.equal(res.status, 400, `expected 400, got ${res.status}`)
		await close()
		console.log('  PASS Test 5: invalid body shape → 400')
	}

	console.log('\nAll integration.test.ts tests passed (5/5)')

	// Restore prototypes (good citizenship for any subsequent test in same process)
	pg.Pool.prototype.connect = originalConnect
	pg.Pool.prototype.query = originalQuery
	pg.Pool.prototype.end = originalEnd
}

runTests().catch((err) => {
	console.error('FAILED:', err)
	process.exit(1)
})
