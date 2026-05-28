/**
 * Phase 243-02 Task 2 — ws-handler.test.ts (RED→GREEN)
 *
 * 13-case spec for the /livos/terminal/ws WebSocket handler:
 *   - 3 auth/flag rejection paths (close 4403)
 *   - 1 init/spawn happy path (sessionFactory call shape)
 *   - 1 ready-frame emit + 1 metadata-write
 *   - 3 inbound message routing tests (data/resize/close)
 *   - 2 PtySession event forwarding tests (data + exit)
 *   - 1 spawn-failure handling (close 1011)
 *   - 1 bad-message-shape tolerance (no close)
 *   - 1 ws.on('close') cleanup test
 *
 * All deps are DI-injected (sessionFactory, flagChecker, verifyProxyTokenFn,
 * getAdminUserFn, deleteMetadataFn, writeMetadataFn) so the handler runs
 * fully synchronously without touching node-pty / ws / Redis.
 */

import {beforeEach, describe, expect, test, vi} from 'vitest'

import {createPtyTerminalWsHandler} from '../ws-handler.js'

// ─── Fakes ──────────────────────────────────────────────────────────────

function makeFakeWs() {
	const listeners: Record<string, Array<(...args: unknown[]) => void>> = {}
	const ws = {
		readyState: 1, // OPEN
		send: vi.fn(),
		close: vi.fn(),
		on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
			if (!listeners[event]) listeners[event] = []
			listeners[event].push(cb)
		}),
		// Test-helper: invoke a registered listener.
		_emit(event: string, ...args: unknown[]) {
			for (const cb of listeners[event] ?? []) cb(...args)
		},
	}
	return ws
}

function makeFakeRequest(cookieHeader: string | undefined) {
	return {
		headers: cookieHeader ? {cookie: cookieHeader} : {},
		url: '/livos/terminal/ws',
	}
}

function makeFakeSession() {
	const handlers: Record<string, Array<(...args: unknown[]) => void>> = {}
	const session = {
		sessionId: 'sess-uuid-7',
		start: vi.fn(),
		on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
			if (!handlers[event]) handlers[event] = []
			handlers[event].push(cb)
		}),
		write: vi.fn(),
		resize: vi.fn(),
		kill: vi.fn(),
		_emit(event: string, ...args: unknown[]) {
			for (const cb of handlers[event] ?? []) cb(...args)
		},
	}
	return session
}

function makeLogger() {
	return {
		log: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		verbose: vi.fn(),
	}
}

function makeLivinityd(opts: {
	verifyProxyTokenResult?: unknown
	verifyThrows?: boolean
}) {
	return {
		server: {
			verifyProxyToken: vi.fn().mockImplementation(async () => {
				if (opts.verifyThrows) throw new Error('bad token')
				return opts.verifyProxyTokenResult ?? {userId: 'u1', loggedIn: true}
			}),
		},
	}
}

interface BuildOpts {
	cookie?: string
	verifyResult?: unknown
	verifyThrows?: boolean
	flag?: boolean
	sessionStartThrows?: boolean
}

function build(opts: BuildOpts = {}) {
	const ws = makeFakeWs()
	const request = makeFakeRequest(opts.cookie)
	const session = makeFakeSession()
	if (opts.sessionStartThrows) {
		session.start.mockImplementation(() => {
			throw new Error('spawn failed')
		})
	}
	const sessionFactory = vi.fn().mockReturnValue(session)
	const flagChecker = vi.fn().mockResolvedValue(opts.flag ?? true)
	const livinityd = makeLivinityd({
		verifyProxyTokenResult: opts.verifyResult,
		verifyThrows: opts.verifyThrows,
	})
	const writeMetadataFn = vi.fn().mockResolvedValue(undefined)
	const deleteMetadataFn = vi.fn().mockResolvedValue(undefined)
	const getAdminUserFn = vi.fn().mockResolvedValue({id: 'admin-id', role: 'admin'})
	const redis = {get: vi.fn(), hset: vi.fn(), hgetall: vi.fn(), del: vi.fn()}
	const logger = makeLogger()
	const handler = createPtyTerminalWsHandler({
		livinityd: livinityd as never,
		logger,
		redis: redis as never,
		sessionFactory: sessionFactory as never,
		flagChecker,
		getAdminUserFn,
		writeMetadataFn,
		deleteMetadataFn,
	})
	return {
		ws,
		request,
		session,
		sessionFactory,
		flagChecker,
		livinityd,
		writeMetadataFn,
		deleteMetadataFn,
		getAdminUserFn,
		logger,
		handler,
	}
}

const VALID_COOKIE = 'LIVINITY_PROXY_TOKEN=abc.def.ghi'

// ─── Tests ──────────────────────────────────────────────────────────────

describe('createPtyTerminalWsHandler — auth + feature-flag gates', () => {
	test('1. missing cookie → close(4403, "unauthorized") + NO sessionFactory call', async () => {
		const ctx = build({cookie: undefined})
		await ctx.handler(ctx.ws as never, ctx.request as never)
		expect(ctx.ws.close).toHaveBeenCalledWith(4403, 'unauthorized')
		expect(ctx.sessionFactory).not.toHaveBeenCalled()
	})

	test('2. invalid cookie (verifyProxyToken throws) → close(4403, "unauthorized")', async () => {
		const ctx = build({cookie: VALID_COOKIE, verifyThrows: true})
		await ctx.handler(ctx.ws as never, ctx.request as never)
		expect(ctx.ws.close).toHaveBeenCalledWith(4403, 'unauthorized')
		expect(ctx.sessionFactory).not.toHaveBeenCalled()
	})

	test('3. valid cookie but flag false → close(4403, "feature disabled")', async () => {
		const ctx = build({cookie: VALID_COOKIE, flag: false})
		await ctx.handler(ctx.ws as never, ctx.request as never)
		expect(ctx.ws.close).toHaveBeenCalledWith(4403, 'feature disabled')
		expect(ctx.sessionFactory).not.toHaveBeenCalled()
	})
})

describe('createPtyTerminalWsHandler — init + spawn happy path', () => {
	test('4. init msg → sessionFactory called with username:"bruce", cols, rows, cwd', async () => {
		const ctx = build({cookie: VALID_COOKIE, flag: true})
		await ctx.handler(ctx.ws as never, ctx.request as never)
		ctx.ws._emit(
			'message',
			Buffer.from(
				JSON.stringify({type: 'init', cols: 80, rows: 24, cwd: '/home/bruce'}),
			),
		)
		// Allow microtask for async start path.
		await new Promise((resolve) => setImmediate(resolve))
		expect(ctx.sessionFactory).toHaveBeenCalledTimes(1)
		const args = ctx.sessionFactory.mock.calls[0][0]
		expect(args.username).toBe('bruce')
		expect(args.cols).toBe(80)
		expect(args.rows).toBe(24)
		expect(args.cwd).toBe('/home/bruce')
	})

	test('5. after session.start() → ws.send was called with JSON {type:"ready",sessionId}', async () => {
		const ctx = build({cookie: VALID_COOKIE, flag: true})
		await ctx.handler(ctx.ws as never, ctx.request as never)
		ctx.ws._emit(
			'message',
			Buffer.from(JSON.stringify({type: 'init', cols: 80, rows: 24})),
		)
		await new Promise((resolve) => setImmediate(resolve))
		const readyCall = ctx.ws.send.mock.calls.find((call) => {
			try {
				const parsed = JSON.parse(call[0] as string)
				return parsed.type === 'ready'
			} catch {
				return false
			}
		})
		expect(readyCall).toBeDefined()
		const payload = JSON.parse(readyCall![0] as string)
		expect(payload.sessionId).toBe('sess-uuid-7')
	})

	test('6. after init → writeMetadataFn called with user_id, name="terminal", cwd', async () => {
		const ctx = build({cookie: VALID_COOKIE, flag: true})
		await ctx.handler(ctx.ws as never, ctx.request as never)
		ctx.ws._emit(
			'message',
			Buffer.from(
				JSON.stringify({type: 'init', cols: 80, rows: 24, cwd: '/tmp'}),
			),
		)
		await new Promise((resolve) => setImmediate(resolve))
		expect(ctx.writeMetadataFn).toHaveBeenCalledTimes(1)
		const [, sessionId, meta] = ctx.writeMetadataFn.mock.calls[0]
		expect(sessionId).toBe('sess-uuid-7')
		expect(meta.user_id).toBe('u1')
		expect(meta.name).toBe('terminal')
		expect(meta.cwd).toBe('/tmp')
	})
})

describe('createPtyTerminalWsHandler — inbound message routing', () => {
	async function setupAfterInit() {
		const ctx = build({cookie: VALID_COOKIE, flag: true})
		await ctx.handler(ctx.ws as never, ctx.request as never)
		ctx.ws._emit(
			'message',
			Buffer.from(JSON.stringify({type: 'init', cols: 80, rows: 24})),
		)
		await new Promise((resolve) => setImmediate(resolve))
		return ctx
	}

	test('7. {type:"data",data:"ls\\n"} → session.write("ls\\n")', async () => {
		const ctx = await setupAfterInit()
		ctx.ws._emit(
			'message',
			Buffer.from(JSON.stringify({type: 'data', data: 'ls\n'})),
		)
		expect(ctx.session.write).toHaveBeenCalledWith('ls\n')
	})

	test('8. {type:"resize",cols:120,rows:30} → session.resize(120,30)', async () => {
		const ctx = await setupAfterInit()
		ctx.ws._emit(
			'message',
			Buffer.from(JSON.stringify({type: 'resize', cols: 120, rows: 30})),
		)
		expect(ctx.session.resize).toHaveBeenCalledWith(120, 30)
	})

	test('9. {type:"close"} → session.kill()', async () => {
		const ctx = await setupAfterInit()
		ctx.ws._emit('message', Buffer.from(JSON.stringify({type: 'close'})))
		expect(ctx.session.kill).toHaveBeenCalled()
	})
})

describe('createPtyTerminalWsHandler — PtySession event forwarding', () => {
	async function setupAfterInit() {
		const ctx = build({cookie: VALID_COOKIE, flag: true})
		await ctx.handler(ctx.ws as never, ctx.request as never)
		ctx.ws._emit(
			'message',
			Buffer.from(JSON.stringify({type: 'init', cols: 80, rows: 24})),
		)
		await new Promise((resolve) => setImmediate(resolve))
		return ctx
	}

	test('10. session "data" event → ws.send with JSON {type:"data",data:<chunk>}', async () => {
		const ctx = await setupAfterInit()
		ctx.session._emit('data', 'hello world')
		const dataCall = ctx.ws.send.mock.calls.find((call) => {
			try {
				const parsed = JSON.parse(call[0] as string)
				return parsed.type === 'data'
			} catch {
				return false
			}
		})
		expect(dataCall).toBeDefined()
		const payload = JSON.parse(dataCall![0] as string)
		expect(payload.data).toBe('hello world')
	})

	test('11. session "exit" → ws.send {type:"exit",code,signal} + ws.close(1000) + deleteMetadataFn', async () => {
		const ctx = await setupAfterInit()
		ctx.session._emit('exit', {exitCode: 0, signal: null})
		// Allow microtask for any async cleanup chain.
		await new Promise((resolve) => setImmediate(resolve))
		const exitCall = ctx.ws.send.mock.calls.find((call) => {
			try {
				const parsed = JSON.parse(call[0] as string)
				return parsed.type === 'exit'
			} catch {
				return false
			}
		})
		expect(exitCall).toBeDefined()
		const payload = JSON.parse(exitCall![0] as string)
		expect(payload.code).toBe(0)
		expect(payload.signal).toBe(null)
		expect(ctx.ws.close).toHaveBeenCalledWith(1000)
		expect(ctx.deleteMetadataFn).toHaveBeenCalled()
	})
})

describe('createPtyTerminalWsHandler — error paths', () => {
	test('12. session.start() throws → ws.send {type:"error"} + ws.close(1011)', async () => {
		const ctx = build({cookie: VALID_COOKIE, flag: true, sessionStartThrows: true})
		await ctx.handler(ctx.ws as never, ctx.request as never)
		ctx.ws._emit(
			'message',
			Buffer.from(JSON.stringify({type: 'init', cols: 80, rows: 24})),
		)
		await new Promise((resolve) => setImmediate(resolve))
		const errorCall = ctx.ws.send.mock.calls.find((call) => {
			try {
				const parsed = JSON.parse(call[0] as string)
				return parsed.type === 'error'
			} catch {
				return false
			}
		})
		expect(errorCall).toBeDefined()
		expect(ctx.ws.close).toHaveBeenCalledWith(1011, 'spawn failed')
	})

	test('13. bad message shape → ws.send {type:"error"} but NO ws.close', async () => {
		const ctx = build({cookie: VALID_COOKIE, flag: true})
		await ctx.handler(ctx.ws as never, ctx.request as never)
		// First send init so we are past the init gate.
		ctx.ws._emit(
			'message',
			Buffer.from(JSON.stringify({type: 'init', cols: 80, rows: 24})),
		)
		await new Promise((resolve) => setImmediate(resolve))
		ctx.ws.close.mockClear()
		// Now send garbage.
		ctx.ws._emit('message', Buffer.from('not-json-at-all'))
		const errorCall = ctx.ws.send.mock.calls.find((call) => {
			try {
				const parsed = JSON.parse(call[0] as string)
				return parsed.type === 'error'
			} catch {
				return false
			}
		})
		expect(errorCall).toBeDefined()
		expect(ctx.ws.close).not.toHaveBeenCalled()
	})
})
