import assert from 'node:assert/strict'
import express from 'express'
import http from 'node:http'
import pg from 'pg'

// Phase 57: every request below sets `X-Livinity-Mode: agent` to opt into the
// existing Strategy B HTTP-proxy → nexus → sacred sdk-agent-runner.ts path.
// Default (header absent) = passthrough mode (covered by passthrough-handler.test.ts).
// Agent mode preserves v29.5 behavior byte-identical (FR-BROKER-A2-02 — agent
// mode is the OPT-IN existing path; these v29.5 integration tests prove that
// every assertion still holds when the agent path is selected explicitly).

interface FakeUser {
	id: string
	username?: string
	role?: string
}

let mockUserStore: Map<string, FakeUser> = new Map()
let mockAdminUser: FakeUser | null = null

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
;(pg.Pool.prototype as any).end = async function () {}

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
	if (/CREATE TABLE|CREATE INDEX|CREATE EXTENSION|ALTER TABLE|^\s*--/.test(sql)) {
		return {rows: []}
	}
	if (/FROM users WHERE id = \$1/.test(sql)) {
		const id = (params?.[0] as string) || ''
		const user = mockUserStore.get(id)
		return {rows: user ? [rowToUser(user)] : []}
	}
	if (/FROM users WHERE role = 'admin'/.test(sql)) {
		return {rows: mockAdminUser ? [rowToUser(mockAdminUser)] : []}
	}
	return {rows: []}
}

function setMockUsers(users: FakeUser[]) {
	mockUserStore = new Map(users.map((u) => [u.id, u]))
	mockAdminUser = users.find((u) => u.role === 'admin') || null
}

const loggedMessages: string[] = []
function makeFakeLivinityd(opts: {multiUser: boolean}) {
	return {
		dataDirectory: '/tmp/livos-test',
		logger: {
			log: (msg: string) => {
				loggedMessages.push(msg)
			},
			verbose: () => {},
			error: () => {},
		},
		ai: {
			redis: {
				get: async (k: string) =>
					k === 'livos:system:multi_user' ? (opts.multiUser ? 'true' : 'false') : null,
			},
		},
	} as any
}

let lastUpstreamBody: any = null
function mockUpstreamSse(events: Array<{type: string; data?: unknown; turn?: number}>): () => void {
	const original = globalThis.fetch
	globalThis.fetch = (async (input: any, init?: any) => {
		const urlStr = typeof input === 'string' ? input : input?.url || ''
		if (!urlStr.includes('/api/agent/stream')) {
			return original(input, init)
		}
		if (init?.body) {
			try {
				lastUpstreamBody = JSON.parse(init.body)
			} catch {
				lastUpstreamBody = init.body
			}
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
	const dbMod = await import('../database/index.js')
	const initOk = await dbMod.initDatabase({log: () => {}, verbose: () => {}, error: () => {}} as any)
	assert.equal(initOk, true)

	const {createBrokerRouter} = await import('./router.js')
	const users: FakeUser[] = [
		{id: 'admin-1', username: 'admin', role: 'admin'},
		{id: 'user-2', username: 'user2', role: 'member'},
	]

	const livinityd = makeFakeLivinityd({multiUser: true})

	// Test 1: sync POST gpt-4 → 200 OpenAI ChatCompletion shape
	{
		setMockUsers(users)
		loggedMessages.length = 0
		const restoreFetch = mockUpstreamSse([
			{type: 'thinking', turn: 1},
			{type: 'chunk', turn: 1, data: 'Hello '},
			{type: 'chunk', turn: 1, data: 'world.'},
			{type: 'final_answer', turn: 1, data: 'Hello world.'},
			{type: 'done', data: {success: true, answer: 'Hello world.', turns: 1, stoppedReason: 'complete'}},
		])
		const {url, close} = await startBrokerApp(livinityd, createBrokerRouter)
		const res = await fetch(`${url}/u/admin-1/v1/chat/completions`, {
			method: 'POST',
			headers: {'content-type': 'application/json', 'x-livinity-mode': 'agent'},
			body: JSON.stringify({model: 'gpt-4', messages: [{role: 'user', content: 'hi'}]}),
		})
		assert.equal(res.status, 200, `expected 200, got ${res.status}`)
		const body = (await res.json()) as any
		assert.equal(body.object, 'chat.completion')
		assert.match(body.id, /^chatcmpl-/)
		assert.equal(body.model, 'gpt-4', 'echoes caller-requested model, not actualModel')
		assert.equal(body.choices[0]?.message.role, 'assistant')
		assert.match(body.choices[0]?.message.content, /Hello world\./)
		assert.equal(body.choices[0]?.finish_reason, 'stop')
		await close()
		restoreFetch()
		console.log('  PASS Test 1: sync POST gpt-4 → OpenAI ChatCompletion shape')
	}

	// Test 2: SSE POST → SSE chunks ending in [DONE]
	{
		setMockUsers(users)
		const restoreFetch = mockUpstreamSse([
			{type: 'thinking', turn: 1},
			{type: 'chunk', turn: 1, data: 'streamed!'},
			{type: 'final_answer', turn: 1, data: 'streamed!'},
			{type: 'done', data: {success: true, answer: 'streamed!', turns: 1, stoppedReason: 'complete'}},
		])
		const {url, close} = await startBrokerApp(livinityd, createBrokerRouter)
		const res = await fetch(`${url}/u/admin-1/v1/chat/completions`, {
			method: 'POST',
			headers: {'content-type': 'application/json', 'x-livinity-mode': 'agent'},
			body: JSON.stringify({model: 'gpt-4', messages: [{role: 'user', content: 'hi'}], stream: true}),
		})
		assert.equal(res.status, 200)
		assert.equal(res.headers.get('content-type'), 'text/event-stream')
		const text = await res.text()
		assert.ok(text.includes('"object":"chat.completion.chunk"'), 'chunks have chat.completion.chunk object')
		assert.ok(text.includes('"role":"assistant"'), 'first chunk has role')
		assert.ok(text.includes('"finish_reason":"stop"'), 'terminal chunk has finish_reason=stop')
		assert.ok(text.endsWith('data: [DONE]\n\n') || text.includes('\ndata: [DONE]\n\n'), 'ends with [DONE]')
		assert.ok(!text.includes('event:'), 'NO event: prefix (OpenAI spec)')
		await close()
		restoreFetch()
		console.log('  PASS Test 2: SSE POST → OpenAI-spec chunks + [DONE]')
	}

	// Test 3: tools array IN body → upstream NEVER receives tools, broker still 200
	{
		setMockUsers(users)
		loggedMessages.length = 0
		lastUpstreamBody = null
		const restoreFetch = mockUpstreamSse([
			{type: 'final_answer', turn: 1, data: 'ok'},
			{type: 'done', data: {success: true, answer: 'ok', turns: 1, stoppedReason: 'complete'}},
		])
		const {url, close} = await startBrokerApp(livinityd, createBrokerRouter)
		const res = await fetch(`${url}/u/admin-1/v1/chat/completions`, {
			method: 'POST',
			headers: {'content-type': 'application/json', 'x-livinity-mode': 'agent'},
			body: JSON.stringify({
				model: 'gpt-4',
				messages: [{role: 'user', content: 'hi'}],
				tools: [{type: 'function', function: {name: 'get_weather', parameters: {}}}],
				tool_choice: 'auto',
			}),
		})
		assert.equal(res.status, 200, 'broker must not crash on client tools')
		assert.ok(lastUpstreamBody, 'upstream call captured')
		assert.equal(lastUpstreamBody.tools, undefined, 'upstream body has NO tools field')
		assert.equal(lastUpstreamBody.tool_choice, undefined, 'upstream body has NO tool_choice field')
		const warnLogged = loggedMessages.some((m) => m.includes('WARN client provided') && m.includes('tools'))
		assert.ok(warnLogged, 'warn log emitted for client tools')
		await close()
		restoreFetch()
		console.log('  PASS Test 3: client tools IGNORED + warn logged + upstream clean')
	}

	// Test 4: unknown model → 200 + warn + response echoes "foobar"
	{
		setMockUsers(users)
		loggedMessages.length = 0
		const restoreFetch = mockUpstreamSse([
			{type: 'final_answer', turn: 1, data: 'ok'},
			{type: 'done', data: {success: true, answer: 'ok', turns: 1, stoppedReason: 'complete'}},
		])
		const {url, close} = await startBrokerApp(livinityd, createBrokerRouter)
		const res = await fetch(`${url}/u/admin-1/v1/chat/completions`, {
			method: 'POST',
			headers: {'content-type': 'application/json', 'x-livinity-mode': 'agent'},
			body: JSON.stringify({model: 'foobar-llm', messages: [{role: 'user', content: 'hi'}]}),
		})
		assert.equal(res.status, 200, 'unknown model still returns 200 (default fallback)')
		const body = (await res.json()) as any
		assert.equal(body.model, 'foobar-llm', 'response.model echoes caller-requested')
		const warnLogged = loggedMessages.some((m) => m.includes('unknown model') && m.includes('foobar-llm'))
		assert.ok(warnLogged, 'warn log emitted for unknown model')
		await close()
		restoreFetch()
		console.log('  PASS Test 4: unknown model → 200 + warn + echoed model name')
	}

	// Test 5: empty messages → 400 OpenAI error shape
	{
		setMockUsers(users)
		const {url, close} = await startBrokerApp(livinityd, createBrokerRouter)
		const res = await fetch(`${url}/u/admin-1/v1/chat/completions`, {
			method: 'POST',
			headers: {'content-type': 'application/json', 'x-livinity-mode': 'agent'},
			body: JSON.stringify({model: 'gpt-4', messages: []}),
		})
		assert.equal(res.status, 400)
		const body = (await res.json()) as any
		assert.equal(body.error?.type, 'invalid_request_error', 'OpenAI error shape (NOT Anthropic)')
		assert.equal(body.error?.code, 'invalid_messages')
		await close()
		console.log('  PASS Test 5: empty messages → 400 OpenAI error shape')
	}

	// Test 6: SSE stream — verify chunk content matches input text
	{
		setMockUsers(users)
		const restoreFetch = mockUpstreamSse([
			{type: 'thinking', turn: 1},
			{type: 'chunk', turn: 1, data: 'partA'},
			{type: 'chunk', turn: 1, data: 'partB'},
			{type: 'final_answer', turn: 1, data: 'partApartB'},
			{type: 'done', data: {success: true, answer: 'partApartB', turns: 1, stoppedReason: 'complete'}},
		])
		const {url, close} = await startBrokerApp(livinityd, createBrokerRouter)
		const res = await fetch(`${url}/u/admin-1/v1/chat/completions`, {
			method: 'POST',
			headers: {'content-type': 'application/json', 'x-livinity-mode': 'agent'},
			body: JSON.stringify({model: 'gpt-4', messages: [{role: 'user', content: 'go'}], stream: true}),
		})
		const text = await res.text()
		assert.ok(text.includes('"content":"partA"'), 'streams partA chunk')
		assert.ok(text.includes('"content":"partB"'), 'streams partB chunk')
		assert.ok(text.includes('data: [DONE]'), 'terminator present')
		await close()
		restoreFetch()
		console.log('  PASS Test 6: stream content chunks visible + [DONE] terminator')
	}

	// Phase 42.1 hotfix: Test 7 — GET /v1/models returns OpenAI ListModels shape
	{
		setMockUsers(users)
		const {url, close} = await startBrokerApp(livinityd, createBrokerRouter)
		const res = await fetch(`${url}/u/admin-1/v1/models`, {
			headers: {'x-livinity-mode': 'agent'},
		})
		assert.equal(res.status, 200, `expected 200, got ${res.status}`)
		const body = (await res.json()) as any
		assert.equal(body.object, 'list')
		assert.ok(Array.isArray(body.data), 'data is an array')
		assert.ok(body.data.length >= 4, 'returns at least 4 models')
		const ids = body.data.map((m: any) => m.id)
		assert.ok(ids.includes('claude-sonnet-4-6'), 'includes claude-sonnet-4-6')
		assert.ok(ids.includes('gpt-4'), 'includes gpt-4 alias')
		assert.equal(body.data[0].object, 'model')
		assert.match(body.data[0].owned_by, /^livinity-broker:/)
		await close()
		console.log('  PASS Test 7: GET /v1/models returns OpenAI ListModels (Phase 42.1)')
	}

	// Phase 42.1: Test 8 — GET /v1/models for unknown user returns 404
	{
		setMockUsers(users)
		const {url, close} = await startBrokerApp(livinityd, createBrokerRouter)
		const res = await fetch(`${url}/u/nonexistent-user/v1/models`, {
			headers: {'x-livinity-mode': 'agent'},
		})
		assert.equal(res.status, 404, `expected 404, got ${res.status}`)
		await close()
		console.log('  PASS Test 8: GET /v1/models 404 for unknown user (auth gate)')
	}

	console.log('\nAll openai-integration.test.ts tests passed (8/8)')

	pg.Pool.prototype.connect = originalConnect
	pg.Pool.prototype.query = originalQuery
	pg.Pool.prototype.end = originalEnd
}

runTests().catch((err) => {
	console.error('FAILED:', err)
	process.exit(1)
})
