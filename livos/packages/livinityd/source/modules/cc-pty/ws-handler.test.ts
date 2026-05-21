/**
 * Phase 166-04 — ws-handler vitest spec.
 *
 * 10 assertions covering:
 *  - JWT auth gate (resolveUser → null → close 1008)
 *  - ownership check (cross-user attach → 1008)
 *  - envelope plumbing (stdin, resize, detach)
 *  - oversize stdin → close 1009 + no pty write
 *  - clean close on ws disconnect
 *  - stdout base64 forwarding
 *  - malformed JSON → error envelope, no socket close
 *
 * Uses stub WebSocket (EventEmitter-driven) + mocked CcPtyManager / SessionStore.
 */

import {describe, it, expect, vi, beforeEach} from 'vitest'
import {EventEmitter} from 'node:events'
import type {IncomingMessage} from 'http'

import {createCcPtyWsHandler} from './ws-handler.js'
import type {CcPtySession} from './types.js'

// ─── Test doubles ────────────────────────────────────────────────────────

class StubWs extends EventEmitter {
	send = vi.fn()
	close = vi.fn()
	terminate = vi.fn()
	readyState = 1
	OPEN = 1
}

function stubReq(): IncomingMessage {
	return {url: '/', headers: {}} as unknown as IncomingMessage
}

function makeFakeSession(overrides: Partial<CcPtySession> = {}): CcPtySession {
	return {
		id: overrides.id ?? 'sess-1',
		userId: overrides.userId ?? 'admin',
		tmuxName: 'livos-cc-admin-abc12345',
		cwd: '/home/bruce/livinity-vault',
		createdAt: 0,
		lastAttachedAt: 0,
		lastMessageAt: 0,
		title: 'test',
		...overrides,
	}
}

function makeFakeAttachHandle() {
	return {
		stdin: vi.fn(),
		resize: vi.fn(),
		detach: vi.fn(),
	}
}

function makeLogger() {
	return {
		log: vi.fn(),
		error: vi.fn(),
	}
}

interface Setup {
	ws: StubWs
	manager: {
		attachSession: ReturnType<typeof vi.fn>
		_lastAttachHandle: ReturnType<typeof makeFakeAttachHandle>
		_lastOnStdout: ((chunk: Buffer) => void) | undefined
	}
	store: {getById: ReturnType<typeof vi.fn>}
	logger: ReturnType<typeof makeLogger>
	resolveUser: ReturnType<typeof vi.fn>
	handler: (ws: any, req: IncomingMessage) => Promise<void> | void
}

function setupHarness(opts: {user?: {id: string} | null; session?: CcPtySession | null} = {}): Setup {
	const ws = new StubWs()
	const fakeHandle = makeFakeAttachHandle()
	const manager: any = {
		_lastAttachHandle: fakeHandle,
		_lastOnStdout: undefined as ((chunk: Buffer) => void) | undefined,
		attachSession: vi.fn(async (_id: string, onStdout: (chunk: Buffer) => void) => {
			manager._lastOnStdout = onStdout
			return fakeHandle
		}),
	}
	const store: any = {
		getById: vi.fn(async (_id: string) => opts.session ?? null),
	}
	const logger = makeLogger()
	const resolveUser = vi.fn(async (_req: IncomingMessage) =>
		opts.user === undefined ? {id: 'admin'} : opts.user,
	)
	const handler = createCcPtyWsHandler({
		manager: manager as any,
		store: store as any,
		logger,
		resolveUser,
	})
	return {ws, manager, store, logger, resolveUser, handler}
}

async function send(ws: StubWs, env: object) {
	ws.emit('message', Buffer.from(JSON.stringify(env), 'utf-8'))
	// allow microtasks for async handler bodies
	await new Promise((resolve) => setImmediate(resolve))
	await new Promise((resolve) => setImmediate(resolve))
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe('createCcPtyWsHandler', () => {
	let setup: Setup

	beforeEach(() => {
		setup = setupHarness({session: makeFakeSession({userId: 'admin'})})
	})

	it('Assertion 1: unauthenticated connection closes with code 1008', async () => {
		const s = setupHarness({user: null})
		await s.handler(s.ws as any, stubReq())
		await new Promise((resolve) => setImmediate(resolve))
		expect(s.ws.close).toHaveBeenCalledWith(1008, expect.any(String))
	})

	it('Assertion 2: matching user CAN attach — emits {type:"attached", session:{...}}', async () => {
		const s = setupHarness({session: makeFakeSession({userId: 'admin'})})
		await s.handler(s.ws as any, stubReq())
		await send(s.ws, {type: 'attach', sessionId: 'sess-1'})
		const attachedFrame = s.ws.send.mock.calls
			.map(([raw]) => JSON.parse(raw as string))
			.find((f) => f.type === 'attached')
		expect(attachedFrame).toBeDefined()
		expect(attachedFrame.session.id).toBe('sess-1')
		expect(attachedFrame.session.tmuxName).toBe('livos-cc-admin-abc12345')
	})

	it('Assertion 3: cross-user attach rejected — emits {type:"error",message:"forbidden"} AND close 1008', async () => {
		const s = setupHarness({
			user: {id: 'attacker'},
			session: makeFakeSession({userId: 'admin'}),
		})
		await s.handler(s.ws as any, stubReq())
		await send(s.ws, {type: 'attach', sessionId: 'sess-1'})
		const errFrame = s.ws.send.mock.calls
			.map(([raw]) => JSON.parse(raw as string))
			.find((f) => f.type === 'error')
		expect(errFrame?.message).toBe('forbidden')
		expect(s.ws.close).toHaveBeenCalledWith(1008, expect.stringContaining('cross-user'))
	})

	it('Assertion 4: stdin envelope calls attachHandle.stdin exactly once', async () => {
		const s = setupHarness({session: makeFakeSession({userId: 'admin'})})
		await s.handler(s.ws as any, stubReq())
		await send(s.ws, {type: 'attach', sessionId: 'sess-1'})
		await send(s.ws, {type: 'stdin', data: 'hello'})
		expect(s.manager._lastAttachHandle.stdin).toHaveBeenCalledTimes(1)
		expect(s.manager._lastAttachHandle.stdin).toHaveBeenCalledWith('hello')
	})

	it('Assertion 5: resize envelope calls attachHandle.resize(cols, rows)', async () => {
		const s = setupHarness({session: makeFakeSession({userId: 'admin'})})
		await s.handler(s.ws as any, stubReq())
		await send(s.ws, {type: 'attach', sessionId: 'sess-1'})
		await send(s.ws, {type: 'resize', cols: 80, rows: 24})
		expect(s.manager._lastAttachHandle.resize).toHaveBeenCalledWith(80, 24)
	})

	it('Assertion 6: oversize stdin → error frame + close 1009 + no pty write', async () => {
		const s = setupHarness({session: makeFakeSession({userId: 'admin'})})
		await s.handler(s.ws as any, stubReq())
		await send(s.ws, {type: 'attach', sessionId: 'sess-1'})
		const huge = 'a'.repeat(1024 * 1024 + 100) // > 1MB
		await send(s.ws, {type: 'stdin', data: huge})
		const errFrame = s.ws.send.mock.calls
			.map(([raw]) => JSON.parse(raw as string))
			.find((f) => f.type === 'error' && /stdin frame too large/.test(f.message))
		expect(errFrame).toBeDefined()
		expect(s.ws.close).toHaveBeenCalledWith(1009, expect.any(String))
		expect(s.manager._lastAttachHandle.stdin).not.toHaveBeenCalled()
	})

	it('Assertion 7: detach calls handle.detach; subsequent stdin returns "not attached"', async () => {
		const s = setupHarness({session: makeFakeSession({userId: 'admin'})})
		await s.handler(s.ws as any, stubReq())
		await send(s.ws, {type: 'attach', sessionId: 'sess-1'})
		await send(s.ws, {type: 'detach'})
		expect(s.manager._lastAttachHandle.detach).toHaveBeenCalled()
		s.ws.send.mockClear()
		await send(s.ws, {type: 'stdin', data: 'x'})
		const errFrame = s.ws.send.mock.calls
			.map(([raw]) => JSON.parse(raw as string))
			.find((f) => f.type === 'error' && f.message === 'not attached')
		expect(errFrame).toBeDefined()
	})

	it('Assertion 8: ws.close fires attachHandle.detach automatically', async () => {
		const s = setupHarness({session: makeFakeSession({userId: 'admin'})})
		await s.handler(s.ws as any, stubReq())
		await send(s.ws, {type: 'attach', sessionId: 'sess-1'})
		s.ws.emit('close')
		expect(s.manager._lastAttachHandle.detach).toHaveBeenCalled()
	})

	it('Assertion 9: pty stdout forwarded as {type:"stdout", data:base64}', async () => {
		const s = setupHarness({session: makeFakeSession({userId: 'admin'})})
		await s.handler(s.ws as any, stubReq())
		await send(s.ws, {type: 'attach', sessionId: 'sess-1'})
		// Simulate pty emitting stdout
		expect(s.manager._lastOnStdout).toBeDefined()
		s.manager._lastOnStdout!(Buffer.from('hello'))
		const stdoutFrame = s.ws.send.mock.calls
			.map(([raw]) => JSON.parse(raw as string))
			.find((f) => f.type === 'stdout')
		expect(stdoutFrame).toBeDefined()
		expect(stdoutFrame.data).toBe('aGVsbG8=') // base64 of "hello"
	})

	it('Assertion 10: malformed JSON emits {type:"error",message:"malformed JSON"} without close', async () => {
		const s = setupHarness({session: makeFakeSession({userId: 'admin'})})
		await s.handler(s.ws as any, stubReq())
		s.ws.emit('message', Buffer.from('not-valid-json{', 'utf-8'))
		await new Promise((resolve) => setImmediate(resolve))
		const errFrame = s.ws.send.mock.calls
			.map(([raw]) => JSON.parse(raw as string))
			.find((f) => f.type === 'error' && f.message === 'malformed JSON')
		expect(errFrame).toBeDefined()
		expect(s.ws.close).not.toHaveBeenCalled()
	})

	// ── Phase 181-04 — Ping/pong heartbeat handler ────────────────────────

	it('Assertion 11 (Phase 181-04): ping message → immediate pong response (no attach required)', async () => {
		const s = setupHarness({session: makeFakeSession({userId: 'admin'})})
		await s.handler(s.ws as any, stubReq())
		// Send ping BEFORE any 'attach' message
		await send(s.ws, {type: 'ping'})
		const pongFrame = s.ws.send.mock.calls
			.map(([raw]) => JSON.parse(raw as string))
			.find((f) => f.type === 'pong')
		expect(pongFrame).toBeDefined()
		expect(pongFrame.type).toBe('pong')
	})

	it('Assertion 12 (Phase 181-04): ping handler works after attach too', async () => {
		const s = setupHarness({session: makeFakeSession({userId: 'admin'})})
		await s.handler(s.ws as any, stubReq())
		// Attach first
		await send(s.ws, {type: 'attach', sessionId: 'sess-1'})
		s.ws.send.mockClear()
		// Then ping
		await send(s.ws, {type: 'ping'})
		const pongFrame = s.ws.send.mock.calls
			.map(([raw]) => JSON.parse(raw as string))
			.find((f) => f.type === 'pong')
		expect(pongFrame).toBeDefined()
	})

	// ── Phase 190-01 — sessionType:'bare' inline session creation ─────────────

	it('T-190-01-G: attach envelope with sessionType:"bare" + unknown sessionId → createSession called with sessionType:"bare"', async () => {
		// Setup: store returns null (session not found), manager.createSession creates on-the-fly
		const ws = new StubWs()
		const fakeSession = makeFakeSession({id: 'live-bare-newid', userId: 'admin', tmuxName: 'livos-cc-admin-newid123'})
		const fakeHandle = makeFakeAttachHandle()
		const manager: any = {
			_lastAttachHandle: fakeHandle,
			_lastOnStdout: undefined as ((chunk: Buffer) => void) | undefined,
			createSession: vi.fn(async () => fakeSession),
			attachSession: vi.fn(async (_id: string, onStdout: (chunk: Buffer) => void) => {
				manager._lastOnStdout = onStdout
				return fakeHandle
			}),
		}
		const store: any = {
			// Returns null for first call (session not found → inline create)
			getById: vi.fn(async () => null),
		}
		const logger = makeLogger()
		const resolveUser = vi.fn(async () => ({id: 'admin'}))
		const handler = createCcPtyWsHandler({
			manager: manager as any,
			store: store as any,
			logger,
			resolveUser,
		})
		await handler(ws as any, stubReq())
		await send(ws, {type: 'attach', sessionId: 'liv-bare-unknown-abc12345', sessionType: 'bare'})
		expect(manager.createSession).toHaveBeenCalledWith(
			expect.objectContaining({sessionType: 'bare'}),
		)
	})

	it('T-190-01-H: attach envelope with sessionType:"bare" for existing bare session → attaches normally (createSession NOT called)', async () => {
		// Setup: store returns the existing session (already created)
		const existingSession = makeFakeSession({id: 'live-bare-exist', userId: 'admin', tmuxName: 'livos-cc-admin-exist1234'})
		const s = setupHarness({session: existingSession})
		// Add createSession spy to manager so we can verify it's NOT called
		;(s.manager as any).createSession = vi.fn()
		await s.handler(s.ws as any, stubReq())
		await send(s.ws, {type: 'attach', sessionId: 'live-bare-exist', sessionType: 'bare'})
		// createSession should NOT be called when session already exists
		expect((s.manager as any).createSession).not.toHaveBeenCalled()
		// Should have attached normally
		const attachedFrame = s.ws.send.mock.calls
			.map(([raw]) => JSON.parse(raw as string))
			.find((f) => f.type === 'attached')
		expect(attachedFrame).toBeDefined()
	})
})
