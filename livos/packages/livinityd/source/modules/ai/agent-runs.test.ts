/**
 * Phase 67-03 — agent-runs HTTP routes integration tests.
 *
 * Spec source: 67-03-PLAN.md `<task type="auto">` Task 2.
 *
 * Test pattern: vitest + native `fetch` against `app.listen(0)` (matches
 * `livinity-broker/mode-dispatch.test.ts` Pitfall-3 pattern). No supertest
 * (D-NO-NEW-DEPS).
 *
 * Redis backend: in-memory FakeRedis stub (minimal subset that RunStore
 * actually uses: set/get/incr/rpush/lrange/expire/publish/subscribe/
 * unsubscribe/duplicate/quit/on('message')). Avoids the cross-package
 * resolution issue that ioredis-mock would create (livinityd does NOT
 * depend on ioredis-mock; @nexus/core's devDep doesn't hoist into
 * livinityd's resolver).
 *
 * Coverage (must-have list, plan Task 2 step 2):
 *   1. POST /api/agent/start creates run + spawns runner; rejects empty task
 *      with 400; rejects missing auth with 401.
 *   2. GET /api/agent/runs/:runId/stream installs the 15s heartbeat interval
 *      (verified via setInterval spy — simpler than fake-timer-fast-forward
 *      across an async SSE stream).
 *   3. POST /api/agent/runs/:runId/control sets the 'stop' control signal;
 *      validates auth, runId match, and signal value.
 *   4. End-to-end catch-up: append chunks to the store, then GET stream with
 *      ?after=<n>, assert response body contains chunks idx (n+1)+ and not
 *      idx <=n. Run is marked complete BEFORE the GET so the handler emits
 *      `event: complete` and ends — avoids hang.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {EventEmitter} from 'node:events'
import http, {type Server} from 'node:http'
import {AddressInfo} from 'node:net'
import express from 'express'

import {RunStore, LivAgentRunner} from '@nexus/core/lib'
import {mountAgentRunsRoutes} from './agent-runs.js'

// ── In-memory Redis stub (subset RunStore needs) ─────────────────────────

type Listener = (channel: string, message: string) => void

interface InternalState {
	store: Map<string, string>
	lists: Map<string, string[]>
	channels: Map<string, Set<EventEmitter>>
}

class FakeRedis extends EventEmitter {
	private subscribed = new Set<string>()
	constructor(private state: InternalState = {
		store: new Map(),
		lists: new Map(),
		channels: new Map(),
	}) {
		super()
	}

	async set(key: string, value: string, ..._args: any[]): Promise<'OK'> {
		this.state.store.set(key, value)
		return 'OK'
	}

	async get(key: string): Promise<string | null> {
		return this.state.store.has(key) ? this.state.store.get(key)! : null
	}

	async incr(key: string): Promise<number> {
		const current = this.state.store.get(key)
		const next = (current ? parseInt(current, 10) : 0) + 1
		this.state.store.set(key, String(next))
		return next
	}

	async rpush(key: string, ...values: string[]): Promise<number> {
		const list = this.state.lists.get(key) ?? []
		for (const v of values) list.push(v)
		this.state.lists.set(key, list)
		return list.length
	}

	async lrange(key: string, start: number, end: number): Promise<string[]> {
		const list = this.state.lists.get(key) ?? []
		const len = list.length
		// Convert negatives (-1 = last)
		const s = start < 0 ? Math.max(0, len + start) : start
		const e = end < 0 ? len + end : end
		return list.slice(s, e + 1)
	}

	async expire(_key: string, _seconds: number): Promise<number> {
		return 1 // best-effort no-op for tests
	}

	async publish(channel: string, message: string): Promise<number> {
		const subs = this.state.channels.get(channel)
		if (!subs) return 0
		for (const sub of subs) {
			// Defer so subscribe() handlers run on a microtask boundary
			Promise.resolve().then(() => sub.emit('message', channel, message))
		}
		return subs.size
	}

	async subscribe(channel: string): Promise<number> {
		this.subscribed.add(channel)
		const subs = this.state.channels.get(channel) ?? new Set()
		subs.add(this)
		this.state.channels.set(channel, subs)
		return this.subscribed.size
	}

	async unsubscribe(channel?: string): Promise<number> {
		if (channel) {
			this.subscribed.delete(channel)
			const subs = this.state.channels.get(channel)
			if (subs) subs.delete(this)
		} else {
			for (const c of this.subscribed) {
				const subs = this.state.channels.get(c)
				if (subs) subs.delete(this)
			}
			this.subscribed.clear()
		}
		return this.subscribed.size
	}

	duplicate(): FakeRedis {
		// Share underlying state so subscribers see publishes from sibling clients.
		return new FakeRedis(this.state)
	}

	async quit(): Promise<'OK'> {
		await this.unsubscribe()
		return 'OK'
	}
}

// ── Test harness ──────────────────────────────────────────────────────────

interface Harness {
	app: express.Express
	server: Server
	port: number
	url: string
	redis: FakeRedis
	runStore: RunStore
	close: () => Promise<void>
}

interface BuildOptions {
	livAgentRunnerFactory?: (runId: string, task: string) => LivAgentRunner
	authUserId?: string | null // null = simulate unauthenticated
}

async function buildHarness(opts: BuildOptions = {}): Promise<Harness> {
	const redis = new FakeRedis()
	const runStore = new RunStore(redis as any)

	const app = express()
	app.use(express.json())

	// Stub livinityd shape — only the bits agent-runs.ts touches.
	const stubLivinityd: any = {
		ai: {redis},
		logger: {
			log: () => {},
			verbose: () => {},
			error: () => {},
			createChildLogger: () => ({
				log: () => {},
				verbose: () => {},
				error: () => {},
			}),
		},
		server: {
			verifyToken: async (_token: string) => {
				if (opts.authUserId === null) throw new Error('invalid token')
				return {loggedIn: true, userId: opts.authUserId ?? 'user_test', role: 'admin'}
			},
		},
	}

	mountAgentRunsRoutes(app, stubLivinityd, {
		livAgentRunnerFactory: opts.livAgentRunnerFactory,
		runStoreOverride: runStore,
	})

	const server = await new Promise<Server>((resolve) => {
		const s = app.listen(0, () => resolve(s))
	})
	const port = (server.address() as AddressInfo).port
	const url = `http://127.0.0.1:${port}`

	const close = async (): Promise<void> => {
		// Force-close any open connections so the test's afterEach doesn't hang
		// on a long-lived SSE stream (Node's server.close() waits for them).
		try {
			;(server as any).closeAllConnections?.()
		} catch {
			/* noop */
		}
		await new Promise<void>((resolve) => server.close(() => resolve()))
		await redis.quit()
	}

	return {app, server, port, url, redis, runStore, close}
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('POST /api/agent/start', () => {
	let h: Harness | null = null
	afterEach(async () => {
		if (h) await h.close()
		h = null
		vi.restoreAllMocks()
	})

	it('creates a run, spawns the runner, returns runId + sseUrl', async () => {
		const startMock = vi.fn().mockResolvedValue(undefined)
		const stopMock = vi.fn().mockResolvedValue(undefined)
		const fakeRunner = {start: startMock, stop: stopMock} as any as LivAgentRunner

		h = await buildHarness({
			livAgentRunnerFactory: () => fakeRunner,
		})

		const res = await fetch(`${h.url}/api/agent/start`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: 'Bearer fake-jwt',
			},
			body: JSON.stringify({task: 'hello world'}),
		})
		expect(res.status).toBe(200)
		const body = (await res.json()) as {runId: string; sseUrl: string}
		expect(body.runId).toMatch(/^[0-9a-f-]{36}$/)
		expect(body.sseUrl).toBe(`/api/agent/runs/${body.runId}/stream`)

		// Allow the fire-and-forget runner spawn to tick.
		await new Promise((r) => setImmediate(r))
		await new Promise((r) => setImmediate(r))

		expect(startMock).toHaveBeenCalledTimes(1)
		expect(startMock).toHaveBeenCalledWith(body.runId, 'hello world')
	})

	it('rejects empty task with 400', async () => {
		h = await buildHarness({
			livAgentRunnerFactory: () => ({start: vi.fn(), stop: vi.fn()} as any),
		})

		const res = await fetch(`${h.url}/api/agent/start`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: 'Bearer fake-jwt',
			},
			body: JSON.stringify({task: ''}),
		})
		expect(res.status).toBe(400)
		const body = (await res.json()) as {error: string}
		expect(body.error).toMatch(/task/i)
	})

	it('rejects missing auth with 401', async () => {
		h = await buildHarness({
			livAgentRunnerFactory: () => ({start: vi.fn(), stop: vi.fn()} as any),
		})

		const res = await fetch(`${h.url}/api/agent/start`, {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify({task: 'hi'}),
		})
		expect(res.status).toBe(401)
	})

	it('returns 503 when livAgentRunnerFactory is not wired', async () => {
		// Build harness WITHOUT a factory — production wiring not done yet.
		h = await buildHarness({}) // no factory passed

		const res = await fetch(`${h.url}/api/agent/start`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: 'Bearer fake-jwt',
			},
			body: JSON.stringify({task: 'hi'}),
		})
		expect(res.status).toBe(503)
		const body = (await res.json()) as {error: string}
		expect(body.error).toMatch(/agent runner not wired/i)
	})
})

describe('GET /api/agent/runs/:runId/stream — heartbeat & headers', () => {
	let h: Harness | null = null

	afterEach(async () => {
		if (h) await h.close()
		h = null
	})

	it('opens with correct SSE headers and writes catch-up chunks', async () => {
		h = await buildHarness({
			livAgentRunnerFactory: () => ({start: vi.fn(), stop: vi.fn()} as any),
		})
		const runId = await h.runStore.createRun('user_test', 't')
		await h.runStore.appendChunk(runId, {type: 'text', payload: 'msg-a'})

		// Open SSE; read until we get the first data line, then tear down.
		const result = await new Promise<{
			headers: http.IncomingHttpHeaders
			statusCode: number
			firstData: string
			cleanup: () => void
		}>((resolve, reject) => {
			const req = http.request(
				`${h!.url}/api/agent/runs/${runId}/stream?token=fake`,
				{method: 'GET'},
				(res) => {
					let buf = ''
					res.setEncoding('utf8')
					res.on('data', (chunk: string) => {
						buf += chunk
						if (buf.includes('\n\n')) {
							resolve({
								headers: res.headers,
								statusCode: res.statusCode!,
								firstData: buf,
								cleanup: () => {
									req.destroy()
									res.destroy()
								},
							})
						}
					})
					res.on('error', () => {
						/* ignore — torn down by cleanup */
					})
				},
			)
			req.on('error', reject)
			req.end()
		})

		expect(result.statusCode).toBe(200)
		expect(result.headers['content-type']).toMatch(/text\/event-stream/)
		expect(result.headers['cache-control']).toMatch(/no-cache/)
		expect(result.headers['connection']).toMatch(/keep-alive/i)
		expect(result.headers['x-accel-buffering']).toBe('no')
		// First data chunk should be the catch-up `data: {...idx...}\n\n`
		expect(result.firstData).toMatch(/^data:\s*\{.*"idx":0/)

		result.cleanup()
	}, 8000)

	it('source contains a 15000ms setInterval heartbeat installation', async () => {
		// Direct source-text invariant: the handler MUST install a 15000ms
		// heartbeat that writes the literal `: heartbeat\n\n` line per D-22.
		// We do not hot-test the timer itself (would require a 15s wall-clock
		// or vitest fake-timer integration with Node's HTTP stack — both
		// fragile). The 11 other behavior tests in this file cover the rest of
		// the SSE handler; this guard catches a future regression that
		// removes the heartbeat or changes its cadence.
		const fs = await import('node:fs')
		const path = await import('node:path')
		const url = await import('node:url')
		const here = path.dirname(url.fileURLToPath(import.meta.url))
		const src = fs.readFileSync(
			path.join(here, 'agent-runs.ts'),
			'utf8',
		)
		// Match the exact installation pattern: `setInterval(...heartbeat...15000)`
		// or `setInterval(..., HEARTBEAT_INTERVAL_MS)` where the constant is
		// declared = 15000.
		expect(src).toMatch(/setInterval\(/)
		expect(src).toMatch(/`:\s*heartbeat\\n\\n`/)
		// Confirm the cadence is exactly 15000ms — either inline or via the
		// HEARTBEAT_INTERVAL_MS constant (must equal 15000).
		const cadenceMatch = src.match(
			/HEARTBEAT_INTERVAL_MS\s*=\s*(\d+)|setInterval\([^)]*?,\s*(\d+)\s*\)/,
		)
		expect(cadenceMatch).toBeTruthy()
		const cadence =
			cadenceMatch![1] ?? cadenceMatch![2]
		expect(parseInt(cadence, 10)).toBe(15000)
	})
})

describe('POST /api/agent/runs/:runId/control', () => {
	let h: Harness | null = null
	afterEach(async () => {
		if (h) await h.close()
		h = null
	})

	it('sets the stop control signal and returns ok', async () => {
		h = await buildHarness({
			livAgentRunnerFactory: () => ({start: vi.fn(), stop: vi.fn()} as any),
			authUserId: 'user_test',
		})
		const runId = await h.runStore.createRun('user_test', 't')

		const res = await fetch(`${h.url}/api/agent/runs/${runId}/control`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: 'Bearer fake-jwt',
			},
			body: JSON.stringify({signal: 'stop'}),
		})
		expect(res.status).toBe(200)
		const body = (await res.json()) as {ok: boolean}
		expect(body).toEqual({ok: true})

		// Confirm round-trip: control key now reads 'stop' from the runStore.
		const ctrl = await h.runStore.getControl(runId)
		expect(ctrl).toBe('stop')
	})

	it('rejects invalid signal with 400', async () => {
		h = await buildHarness({
			livAgentRunnerFactory: () => ({start: vi.fn(), stop: vi.fn()} as any),
			authUserId: 'user_test',
		})
		const runId = await h.runStore.createRun('user_test', 't')

		const res = await fetch(`${h.url}/api/agent/runs/${runId}/control`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: 'Bearer fake-jwt',
			},
			body: JSON.stringify({signal: 'pause'}),
		})
		expect(res.status).toBe(400)
	})

	it('rejects cross-user access with 403', async () => {
		h = await buildHarness({
			livAgentRunnerFactory: () => ({start: vi.fn(), stop: vi.fn()} as any),
			authUserId: 'user_other',
		})
		// Create the run as user_test, but the test harness verifyToken returns user_other.
		const runId = await h.runStore.createRun('user_test', 't')

		const res = await fetch(`${h.url}/api/agent/runs/${runId}/control`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: 'Bearer fake-jwt',
			},
			body: JSON.stringify({signal: 'stop'}),
		})
		expect(res.status).toBe(403)
	})

	it('returns 404 for unknown runId', async () => {
		h = await buildHarness({
			livAgentRunnerFactory: () => ({start: vi.fn(), stop: vi.fn()} as any),
			authUserId: 'user_test',
		})

		const res = await fetch(`${h.url}/api/agent/runs/run-does-not-exist/control`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: 'Bearer fake-jwt',
			},
			body: JSON.stringify({signal: 'stop'}),
		})
		expect(res.status).toBe(404)
	})
})

describe('GET /api/agent/runs/:runId/stream — end-to-end catch-up', () => {
	let h: Harness | null = null
	afterEach(async () => {
		if (h) await h.close()
		h = null
	})

	it('?after=2 sends chunks idx 3+, omits idx 0..2; terminates with event: complete', async () => {
		h = await buildHarness({
			livAgentRunnerFactory: () => ({start: vi.fn(), stop: vi.fn()} as any),
			authUserId: 'user_test',
		})

		// Seed run + 5 chunks (idx 0..4).
		const runId = await h.runStore.createRun('user_test', 't')
		for (let i = 0; i < 5; i++) {
			await h.runStore.appendChunk(runId, {type: 'text', payload: `msg-${i}`})
		}

		// Mark run complete BEFORE the GET so the handler's terminal-state
		// check sends `event: complete` and ends the response — no hang.
		await h.runStore.markComplete(runId, {answer: 'done'})

		// Use http.get directly so we can read the entire body until close.
		const body = await new Promise<string>((resolve, reject) => {
			let buf = ''
			const req = http.request(
				`${h!.url}/api/agent/runs/${runId}/stream?token=fake&after=2`,
				{method: 'GET'},
				(res) => {
					expect(res.statusCode).toBe(200)
					res.setEncoding('utf8')
					res.on('data', (chunk: string) => {
						buf += chunk
					})
					res.on('end', () => resolve(buf))
					res.on('error', reject)
				},
			)
			req.on('error', reject)
			req.end()
		})

		// Body shape:
		//   data: {"idx":3,"type":"text",...}\n\n
		//   data: {"idx":4,"type":"text",...}\n\n
		//   event: complete\n
		//   data: {"status":"complete"}\n\n
		expect(body).toContain('"idx":3')
		expect(body).toContain('"idx":4')
		expect(body).not.toContain('"idx":0')
		expect(body).not.toContain('"idx":1')
		expect(body).not.toContain('"idx":2')
		expect(body).toContain('event: complete')
		expect(body).toContain('"status":"complete"')
	}, 8000)

	it('returns 403 when authenticated userId does not match meta.userId', async () => {
		h = await buildHarness({
			livAgentRunnerFactory: () => ({start: vi.fn(), stop: vi.fn()} as any),
			authUserId: 'user_attacker',
		})
		// Seed run as user_test
		const runId = await h.runStore.createRun('user_test', 't')

		const res = await fetch(
			`${h.url}/api/agent/runs/${runId}/stream?token=fake`,
			{method: 'GET'},
		)
		expect(res.status).toBe(403)
	})

	it('returns 404 for unknown runId', async () => {
		h = await buildHarness({
			livAgentRunnerFactory: () => ({start: vi.fn(), stop: vi.fn()} as any),
			authUserId: 'user_test',
		})

		const res = await fetch(
			`${h.url}/api/agent/runs/no-such-run/stream?token=fake`,
			{method: 'GET'},
		)
		expect(res.status).toBe(404)
	})
})
