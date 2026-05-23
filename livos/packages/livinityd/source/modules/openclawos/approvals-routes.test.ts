/**
 * Phase 203-10 — approvals-routes tests.
 *
 * Exercises the SSE handler + respond handler via an in-memory request
 * scaffold (mirrors the handshake-route test pattern — does not boot a
 * full Express app). Verifies:
 *
 *   - Stream handler 401s without a token, 200s with one.
 *   - Stream handler emits a `bootstrap` frame on connect that includes
 *     any currently-pending approvals.
 *   - Stream handler emits `pending` + `resolved` events as the
 *     ApprovalManager fires them.
 *   - Respond handler 401s without auth, 400s on bad body, 200s on valid
 *     payload and calls ApprovalManager.resolve.
 */

import {describe, expect, test, vi} from 'vitest'

import {ApprovalManager} from '../agent-runtime/approval-manager.js'
import {
	createApprovalsRespondHandler,
	createApprovalsStreamHandler,
} from './approvals-routes.js'

function fakeReq(opts: {token?: string; body?: unknown} = {}): any {
	const handlers: Record<string, Array<() => void>> = {}
	return {
		headers: opts.token
			? {authorization: `Bearer ${opts.token}`}
			: {},
		body: opts.body,
		on(event: string, fn: () => void) {
			handlers[event] = handlers[event] ?? []
			handlers[event].push(fn)
		},
		_fire(event: string) {
			for (const h of handlers[event] ?? []) h()
		},
	}
}

function fakeRes(): any {
	const writes: string[] = []
	let status = 200
	let headersFlushed = false
	const headers: Record<string, string> = {}
	const responseHandlers: Record<string, Array<() => void>> = {}
	return {
		statusCode: 200,
		writes,
		headers,
		jsonBody: undefined as unknown,
		setHeader(k: string, v: string) {
			headers[k] = v
		},
		flushHeaders() {
			headersFlushed = true
		},
		write(s: string) {
			writes.push(s)
			return true
		},
		status(c: number) {
			status = c
			this.statusCode = c
			return this
		},
		json(body: unknown) {
			this.jsonBody = body
		},
		end() {},
		on(event: string, fn: () => void) {
			responseHandlers[event] = responseHandlers[event] ?? []
			responseHandlers[event].push(fn)
		},
		_status: () => status,
		_headersFlushed: () => headersFlushed,
		_fire(event: string) {
			for (const h of responseHandlers[event] ?? []) h()
		},
	}
}

describe('createApprovalsStreamHandler', () => {
	test('401 without a token', async () => {
		const am = new ApprovalManager()
		const handler = createApprovalsStreamHandler({
			approvalManager: am,
			verifyToken: async () => ({}),
		})
		const req = fakeReq()
		const res = fakeRes()
		await handler(req, res, () => undefined)
		expect(res._status()).toBe(401)
		expect(res.jsonBody).toEqual({error: 'unauthorized'})
	})

	test('401 when verifyToken throws', async () => {
		const am = new ApprovalManager()
		const handler = createApprovalsStreamHandler({
			approvalManager: am,
			verifyToken: async () => {
				throw new Error('bad token')
			},
		})
		const req = fakeReq({token: 'whatever'})
		const res = fakeRes()
		await handler(req, res, () => undefined)
		expect(res._status()).toBe(401)
	})

	test('emits bootstrap frame on connect', async () => {
		const am = new ApprovalManager()
		// Seed a pending approval BEFORE the stream connects.
		const pendingPromise = am.requestSync({
			toolName: 'luse_screenshot',
			args: {x: 1},
			agentId: 'a1',
		})

		const handler = createApprovalsStreamHandler({
			approvalManager: am,
			verifyToken: async () => ({userId: 'admin'}),
		})
		const req = fakeReq({token: 'good'})
		const res = fakeRes()
		void handler(req, res, () => undefined)
		// Tick the microtask queue
		await new Promise((r) => setImmediate(r))

		const joined = res.writes.join('')
		expect(joined).toContain('event: bootstrap')
		expect(joined).toContain('luse_screenshot')

		// Drain — resolve the pending so the test does not leak.
		const tcid = am.listPending()[0]?.toolCallId ?? ''
		am.resolve(tcid, true)
		await pendingPromise
		req._fire('close')
	})

	test('emits pending then resolved events', async () => {
		const am = new ApprovalManager()
		const handler = createApprovalsStreamHandler({
			approvalManager: am,
			verifyToken: async () => ({userId: 'admin'}),
		})
		const req = fakeReq({token: 'good'})
		const res = fakeRes()
		void handler(req, res, () => undefined)
		await new Promise((r) => setImmediate(r))

		const pendingPromise = am.requestSync({
			toolName: 'rm_rf',
			args: {path: '/tmp/x'},
		})
		await new Promise((r) => setImmediate(r))

		const tcid = am.listPending()[0]?.toolCallId ?? ''
		am.resolve(tcid, true)
		await pendingPromise

		const joined = res.writes.join('')
		expect(joined).toContain('event: pending')
		expect(joined).toContain('rm_rf')
		expect(joined).toContain('event: resolved')
		expect(joined).toContain('approved')
		req._fire('close')
	})
})

describe('createApprovalsRespondHandler', () => {
	test('401 without token', async () => {
		const am = new ApprovalManager()
		const handler = createApprovalsRespondHandler({
			approvalManager: am,
			verifyToken: async () => ({}),
		})
		const req = fakeReq({body: {toolCallId: 'x', decision: 'approved'}})
		const res = fakeRes()
		await handler(req, res, () => undefined)
		expect(res._status()).toBe(401)
	})

	test('400 when body missing', async () => {
		const am = new ApprovalManager()
		const handler = createApprovalsRespondHandler({
			approvalManager: am,
			verifyToken: async () => ({}),
		})
		const req = fakeReq({token: 'good'})
		const res = fakeRes()
		await handler(req, res, () => undefined)
		expect(res._status()).toBe(400)
	})

	test('400 on invalid decision', async () => {
		const am = new ApprovalManager()
		const handler = createApprovalsRespondHandler({
			approvalManager: am,
			verifyToken: async () => ({}),
		})
		const req = fakeReq({
			token: 'good',
			body: {toolCallId: 'tcid', decision: 'maybe'},
		})
		const res = fakeRes()
		await handler(req, res, () => undefined)
		expect(res._status()).toBe(400)
	})

	test('resolves pending approval on valid approved body', async () => {
		const am = new ApprovalManager()
		const handler = createApprovalsRespondHandler({
			approvalManager: am,
			verifyToken: async () => ({}),
		})
		const resolveSpy = vi.spyOn(am, 'resolve')

		const pendingPromise = am.requestSync({toolName: 'tool'})
		await new Promise((r) => setImmediate(r))
		const tcid = am.listPending()[0]!.toolCallId

		const req = fakeReq({
			token: 'good',
			body: {toolCallId: tcid, decision: 'approved'},
		})
		const res = fakeRes()
		await handler(req, res, () => undefined)

		expect(res._status()).toBe(200)
		expect(resolveSpy).toHaveBeenCalledWith(tcid, true)
		await expect(pendingPromise).resolves.toMatchObject({decision: 'approved'})
	})

	test('resolves pending approval as rejected', async () => {
		const am = new ApprovalManager()
		const handler = createApprovalsRespondHandler({
			approvalManager: am,
			verifyToken: async () => ({}),
		})

		const pendingPromise = am.requestSync({toolName: 'tool'})
		await new Promise((r) => setImmediate(r))
		const tcid = am.listPending()[0]!.toolCallId

		const req = fakeReq({
			token: 'good',
			body: {toolCallId: tcid, decision: 'rejected'},
		})
		const res = fakeRes()
		await handler(req, res, () => undefined)

		expect(res._status()).toBe(200)
		await expect(pendingPromise).resolves.toMatchObject({decision: 'rejected'})
	})
})
