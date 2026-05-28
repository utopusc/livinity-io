/**
 * Phase 246-03 — ws-handler.test.ts (extended)
 *
 * 21-case spec for the /livos/terminal/ws WebSocket handler:
 *   - 13 PRESERVED Phase 243-02 cases (refactored to inject SessionManager
 *     mock instead of the legacy `sessionFactory`)
 *   - 8 NEW Phase 246-03 cases:
 *       14. attach with known id → {type:'reattached',sessionId,scrollback}
 *       15. attach with unknown id → ws.close(4404,'session not found')
 *       16. attach branch calls touchLastAttachAt(redis, id, iso)
 *       17. attach branch calls sessionManager.touch(id)
 *       18. create branch calls sessionManager.create(opts) (NOT sessionFactory)
 *       19. every pty 'data' event triggers appendScrollback(redis, id, chunk)
 *       20. ws.on('close') does NOT call sessionManager.kill — PTY survives reload
 *       21. inbound {type:'close'} calls sessionManager.kill(id), not pty.kill()
 *
 * All deps are DI-injected so the handler runs fully synchronously without
 * touching node-pty / ws / Redis / SessionManager.
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

function makeFakeRequest(cookieHeader: string | undefined, url?: string) {
	return {
		headers: cookieHeader ? {cookie: cookieHeader} : {},
		url: url ?? '/livos/terminal/ws',
	}
}

function makeFakePty() {
	const handlers: Record<string, Array<(...args: unknown[]) => void>> = {}
	const pty = {
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
	return pty
}

function makeLogger() {
	return {
		log: vi.fn(),
		info: vi.fn(),
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
	url?: string
	/** Pre-existing session to return from sessionManager.get(attachId). */
	existingSession?: ReturnType<typeof makeFakeSessionRecord> | null
	/** Scrollback array returned by readScrollbackFn mock. */
	scrollback?: string[]
}

function makeFakeSessionRecord(opts: {
	id?: string
	name?: string
	pty?: ReturnType<typeof makeFakePty>
} = {}) {
	const pty = opts.pty ?? makeFakePty()
	return {
		id: opts.id ?? 'sess-uuid-7',
		name: opts.name ?? 'terminal-1',
		pty,
		createdAt: '2026-05-28T00:00:00.000Z',
		lastAttachAt: '2026-05-28T00:00:00.000Z',
	}
}

function build(opts: BuildOpts = {}) {
	const ws = makeFakeWs()
	const request = makeFakeRequest(opts.cookie, opts.url)

	// In CREATE branch, sessionManager.create returns this record (with this pty).
	const pty = makeFakePty()
	if (opts.sessionStartThrows) {
		pty.start.mockImplementation(() => {
			throw new Error('spawn failed')
		})
	}
	const createdRecord = makeFakeSessionRecord({pty})

	const sessionManager = {
		create: vi.fn().mockImplementation((spawnOpts: unknown) => {
			if (opts.sessionStartThrows) throw new Error('spawn failed')
			return createdRecord
		}),
		get: vi.fn().mockReturnValue(opts.existingSession ?? null),
		touch: vi.fn().mockReturnValue(true),
		kill: vi.fn().mockReturnValue(true),
		list: vi.fn().mockReturnValue([]),
	}

	const flagChecker = vi.fn().mockResolvedValue(opts.flag ?? true)
	const livinityd = makeLivinityd({
		verifyProxyTokenResult: opts.verifyResult,
		verifyThrows: opts.verifyThrows,
	})
	const writeMetadataFn = vi.fn().mockResolvedValue(undefined)
	const deleteMetadataFn = vi.fn().mockResolvedValue(undefined)
	const deleteScrollbackFn = vi.fn().mockResolvedValue(undefined)
	const appendScrollbackFn = vi.fn().mockResolvedValue(undefined)
	const readScrollbackFn = vi
		.fn()
		.mockResolvedValue(opts.scrollback ?? [])
	const touchLastAttachAtFn = vi.fn().mockResolvedValue(undefined)
	const getAdminUserFn = vi.fn().mockResolvedValue({id: 'admin-id', role: 'admin'})
	const redis = {
		get: vi.fn(),
		hset: vi.fn(),
		hgetall: vi.fn(),
		del: vi.fn(),
		rpush: vi.fn(),
		ltrim: vi.fn(),
		lrange: vi.fn(),
	}
	const logger = makeLogger()
	const handler = createPtyTerminalWsHandler({
		livinityd: livinityd as never,
		logger,
		redis: redis as never,
		sessionManager: sessionManager as never,
		flagChecker,
		getAdminUserFn,
		writeMetadataFn,
		deleteMetadataFn,
		deleteScrollbackFn,
		appendScrollbackFn,
		readScrollbackFn,
		touchLastAttachAtFn,
	})
	return {
		ws,
		request,
		pty,
		createdRecord,
		sessionManager,
		flagChecker,
		livinityd,
		writeMetadataFn,
		deleteMetadataFn,
		deleteScrollbackFn,
		appendScrollbackFn,
		readScrollbackFn,
		touchLastAttachAtFn,
		getAdminUserFn,
		logger,
		handler,
	}
}

const VALID_COOKIE = 'LIVINITY_PROXY_TOKEN=abc.def.ghi'

// ─── Tests ──────────────────────────────────────────────────────────────

describe('createPtyTerminalWsHandler — auth + feature-flag gates', () => {
	test('1. missing cookie → close(4403, "unauthorized") + NO session create', async () => {
		const ctx = build({cookie: undefined})
		await ctx.handler(ctx.ws as never, ctx.request as never)
		expect(ctx.ws.close).toHaveBeenCalledWith(4403, 'unauthorized')
		expect(ctx.sessionManager.create).not.toHaveBeenCalled()
	})

	test('2. invalid cookie (verifyProxyToken throws) → close(4403, "unauthorized")', async () => {
		const ctx = build({cookie: VALID_COOKIE, verifyThrows: true})
		await ctx.handler(ctx.ws as never, ctx.request as never)
		expect(ctx.ws.close).toHaveBeenCalledWith(4403, 'unauthorized')
		expect(ctx.sessionManager.create).not.toHaveBeenCalled()
	})

	test('3. valid cookie but flag false → close(4403, "feature disabled")', async () => {
		const ctx = build({cookie: VALID_COOKIE, flag: false})
		await ctx.handler(ctx.ws as never, ctx.request as never)
		expect(ctx.ws.close).toHaveBeenCalledWith(4403, 'feature disabled')
		expect(ctx.sessionManager.create).not.toHaveBeenCalled()
	})
})

describe('createPtyTerminalWsHandler — init + spawn happy path', () => {
	test('4. init msg → sessionManager.create called with username:"bruce", cols, rows, cwd', async () => {
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
		expect(ctx.sessionManager.create).toHaveBeenCalledTimes(1)
		const args = ctx.sessionManager.create.mock.calls[0][0]
		expect(args.username).toBe('bruce')
		expect(args.cols).toBe(80)
		expect(args.rows).toBe(24)
		expect(args.cwd).toBe('/home/bruce')
	})

	test('5. after session create → ws.send was called with JSON {type:"ready",sessionId}', async () => {
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

	test('6. after init → writeMetadataFn called with user_id, name, cwd', async () => {
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
		// Phase 246-03: name comes from the SessionManager record, not the hardcoded "terminal".
		expect(meta.name).toBe('terminal-1')
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

	test('7. {type:"data",data:"ls\\n"} → pty.write("ls\\n")', async () => {
		const ctx = await setupAfterInit()
		ctx.ws._emit(
			'message',
			Buffer.from(JSON.stringify({type: 'data', data: 'ls\n'})),
		)
		expect(ctx.createdRecord.pty.write).toHaveBeenCalledWith('ls\n')
	})

	test('8. {type:"resize",cols:120,rows:30} → pty.resize(120,30)', async () => {
		const ctx = await setupAfterInit()
		ctx.ws._emit(
			'message',
			Buffer.from(JSON.stringify({type: 'resize', cols: 120, rows: 30})),
		)
		expect(ctx.createdRecord.pty.resize).toHaveBeenCalledWith(120, 30)
	})

	test('9. {type:"close"} → sessionManager.kill(sessionId), NOT pty.kill directly', async () => {
		const ctx = await setupAfterInit()
		ctx.ws._emit('message', Buffer.from(JSON.stringify({type: 'close'})))
		expect(ctx.sessionManager.kill).toHaveBeenCalledWith('sess-uuid-7')
		expect(ctx.createdRecord.pty.kill).not.toHaveBeenCalled()
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

	test('10. pty "data" event → ws.send with JSON {type:"data",data:<chunk>}', async () => {
		const ctx = await setupAfterInit()
		ctx.createdRecord.pty._emit('data', 'hello world')
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

	test('11. pty "exit" → ws.send {type:"exit",code,signal} + ws.close(1000) + deleteMetadataFn + sessionManager.kill', async () => {
		const ctx = await setupAfterInit()
		ctx.createdRecord.pty._emit('exit', {exitCode: 0, signal: null})
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
		// Phase 246-03: pty exit forwarder also removes from SessionManager map.
		expect(ctx.sessionManager.kill).toHaveBeenCalledWith('sess-uuid-7')
	})
})

describe('createPtyTerminalWsHandler — error paths', () => {
	test('12. sessionManager.create throws → ws.send {type:"error"} + ws.close(1011)', async () => {
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

// ─── Phase 246-03 NEW cases ────────────────────────────────────────────

describe('createPtyTerminalWsHandler — Phase 246-03 attach branch', () => {
	test('14. ?attach=existing-id → ws.send {type:"reattached",sessionId,scrollback}', async () => {
		const existingPty = makeFakePty()
		const existing = makeFakeSessionRecord({id: 'existing-id', pty: existingPty})
		const ctx = build({
			cookie: VALID_COOKIE,
			flag: true,
			url: '/livos/terminal/ws?attach=existing-id',
			existingSession: existing,
			scrollback: ['line1\r\n', 'line2\r\n'],
		})
		await ctx.handler(ctx.ws as never, ctx.request as never)
		// Allow microtask chain for the async attach branch.
		await new Promise((resolve) => setImmediate(resolve))
		const reattachedCall = ctx.ws.send.mock.calls.find((call) => {
			try {
				const parsed = JSON.parse(call[0] as string)
				return parsed.type === 'reattached'
			} catch {
				return false
			}
		})
		expect(reattachedCall).toBeDefined()
		const payload = JSON.parse(reattachedCall![0] as string)
		expect(payload.sessionId).toBe('existing-id')
		expect(payload.scrollback).toEqual(['line1\r\n', 'line2\r\n'])
		expect(ctx.sessionManager.get).toHaveBeenCalledWith('existing-id')
	})

	test('15. ?attach=unknown-id → ws.close(4404, "session not found")', async () => {
		const ctx = build({
			cookie: VALID_COOKIE,
			flag: true,
			url: '/livos/terminal/ws?attach=unknown-id',
			existingSession: null,
		})
		await ctx.handler(ctx.ws as never, ctx.request as never)
		await new Promise((resolve) => setImmediate(resolve))
		expect(ctx.ws.close).toHaveBeenCalledWith(4404, 'session not found')
		// No reattach frame should have been sent.
		const reattachedCall = ctx.ws.send.mock.calls.find((call) => {
			try {
				return JSON.parse(call[0] as string).type === 'reattached'
			} catch {
				return false
			}
		})
		expect(reattachedCall).toBeUndefined()
	})

	test('16. attach branch calls touchLastAttachAt(redis, attachId, isoString)', async () => {
		const existing = makeFakeSessionRecord({id: 'existing-id'})
		const ctx = build({
			cookie: VALID_COOKIE,
			flag: true,
			url: '/livos/terminal/ws?attach=existing-id',
			existingSession: existing,
		})
		await ctx.handler(ctx.ws as never, ctx.request as never)
		await new Promise((resolve) => setImmediate(resolve))
		expect(ctx.touchLastAttachAtFn).toHaveBeenCalledTimes(1)
		const [redisArg, idArg, isoArg] = ctx.touchLastAttachAtFn.mock.calls[0]
		expect(idArg).toBe('existing-id')
		// ISO-8601 UTC string shape (e.g. 2026-05-28T12:34:56.789Z).
		expect(typeof isoArg).toBe('string')
		expect(isoArg).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
		expect(redisArg).toBeDefined()
	})

	test('17. attach branch calls sessionManager.touch(attachId)', async () => {
		const existing = makeFakeSessionRecord({id: 'existing-id'})
		const ctx = build({
			cookie: VALID_COOKIE,
			flag: true,
			url: '/livos/terminal/ws?attach=existing-id',
			existingSession: existing,
		})
		await ctx.handler(ctx.ws as never, ctx.request as never)
		await new Promise((resolve) => setImmediate(resolve))
		expect(ctx.sessionManager.touch).toHaveBeenCalledWith('existing-id')
	})
})

describe('createPtyTerminalWsHandler — Phase 246-03 create branch + scrollback', () => {
	test('18. create branch calls sessionManager.create with opts (NOT raw PtySession)', async () => {
		const ctx = build({cookie: VALID_COOKIE, flag: true})
		await ctx.handler(ctx.ws as never, ctx.request as never)
		ctx.ws._emit(
			'message',
			Buffer.from(
				JSON.stringify({type: 'init', cols: 80, rows: 24, cwd: '/home/bruce'}),
			),
		)
		await new Promise((resolve) => setImmediate(resolve))
		expect(ctx.sessionManager.create).toHaveBeenCalledTimes(1)
		// First arg is the spawn opts; second is the optional nameHint.
		const firstArg = ctx.sessionManager.create.mock.calls[0][0]
		expect(firstArg).toEqual(
			expect.objectContaining({
				username: 'bruce',
				cols: 80,
				rows: 24,
				cwd: '/home/bruce',
			}),
		)
	})

	test('19. every pty "data" event triggers appendScrollback(redis, sessionId, chunk)', async () => {
		const ctx = build({cookie: VALID_COOKIE, flag: true})
		await ctx.handler(ctx.ws as never, ctx.request as never)
		ctx.ws._emit(
			'message',
			Buffer.from(JSON.stringify({type: 'init', cols: 80, rows: 24})),
		)
		await new Promise((resolve) => setImmediate(resolve))
		// Drive 2 chunks through the data callback.
		ctx.createdRecord.pty._emit('data', 'chunk-A')
		ctx.createdRecord.pty._emit('data', 'chunk-B')
		// appendScrollback is fire-and-log — invoked synchronously by the data
		// callback even though it returns a Promise.
		expect(ctx.appendScrollbackFn).toHaveBeenCalledTimes(2)
		expect(ctx.appendScrollbackFn).toHaveBeenNthCalledWith(
			1,
			expect.anything(),
			'sess-uuid-7',
			'chunk-A',
		)
		expect(ctx.appendScrollbackFn).toHaveBeenNthCalledWith(
			2,
			expect.anything(),
			'sess-uuid-7',
			'chunk-B',
		)
	})
})

describe('createPtyTerminalWsHandler — Phase 246-03 lifecycle semantics', () => {
	test('20. ws.on("close") does NOT call sessionManager.kill (PTY survives reload)', async () => {
		const ctx = build({cookie: VALID_COOKIE, flag: true})
		await ctx.handler(ctx.ws as never, ctx.request as never)
		ctx.ws._emit(
			'message',
			Buffer.from(JSON.stringify({type: 'init', cols: 80, rows: 24})),
		)
		await new Promise((resolve) => setImmediate(resolve))
		// Reset the spy before triggering close so the cleanup-call assertion
		// is unaffected by the spawn-path interactions.
		ctx.sessionManager.kill.mockClear()
		ctx.createdRecord.pty.kill.mockClear()
		// Trigger the ws-close listener.
		ctx.ws._emit('close')
		expect(ctx.sessionManager.kill).not.toHaveBeenCalled()
		expect(ctx.createdRecord.pty.kill).not.toHaveBeenCalled()
	})

	test('21. inbound {type:"close"} calls sessionManager.kill(sessionId), NOT pty.kill directly', async () => {
		const ctx = build({cookie: VALID_COOKIE, flag: true})
		await ctx.handler(ctx.ws as never, ctx.request as never)
		ctx.ws._emit(
			'message',
			Buffer.from(JSON.stringify({type: 'init', cols: 80, rows: 24})),
		)
		await new Promise((resolve) => setImmediate(resolve))
		ctx.sessionManager.kill.mockClear()
		ctx.createdRecord.pty.kill.mockClear()
		ctx.ws._emit('message', Buffer.from(JSON.stringify({type: 'close'})))
		expect(ctx.sessionManager.kill).toHaveBeenCalledWith('sess-uuid-7')
		expect(ctx.createdRecord.pty.kill).not.toHaveBeenCalled()
	})
})
