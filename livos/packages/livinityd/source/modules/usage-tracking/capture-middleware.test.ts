/**
 * Phase 44 Plan 44-02 — capture-middleware tests.
 *
 * Strategy: stub Express req/res/next without a real HTTP server (supertest
 * is not a livinityd dep). The middleware patches res.json / res.write /
 * res.end; tests invoke the middleware then drive the patched res to simulate
 * downstream broker handler behaviour.
 *
 * Database insertUsage is mocked via vi.mock — assertions check that the
 * captured input shape matches expected (model, prompt/completion tokens,
 * endpoint, requestId).
 */

import {beforeEach, describe, expect, test, vi} from 'vitest'
import type {Request, Response, NextFunction} from 'express'

const insertUsageMock = vi.fn().mockResolvedValue(undefined)
const resolveAppIdMock = vi.fn().mockResolvedValue(null)

vi.mock('./database.js', () => ({
	insertUsage: (...args: unknown[]) => insertUsageMock(...args),
}))
vi.mock('./container-resolver.js', () => ({
	resolveAppIdFromIp: (...args: unknown[]) => resolveAppIdMock(...args),
	_clearContainerResolverCache: () => {},
}))

import {createCaptureMiddleware} from './capture-middleware.js'

type MockRes = {
	statusCode: number
	_endCalled: boolean
	_writes: string[]
	_jsonBody: unknown
	getHeader(key: string): string | undefined
	setHeader(key: string, value: string): MockRes
	status(code: number): MockRes
	json(body: unknown): MockRes
	write(chunk: unknown): boolean
	end(chunk?: unknown): MockRes
}

function makeReq(userId = 'USERID', urlPath = '/u/USERID/v1/messages'): Request {
	return {
		params: {userId},
		originalUrl: urlPath,
		url: urlPath,
		socket: {remoteAddress: '172.17.0.5'},
	} as unknown as Request
}

function makeRes(): MockRes {
	const headers: Record<string, string> = {}
	const res: MockRes = {
		statusCode: 200,
		_endCalled: false,
		_writes: [],
		_jsonBody: undefined,
		getHeader(key: string) {
			return headers[key.toLowerCase()]
		},
		setHeader(key: string, value: string) {
			headers[key.toLowerCase()] = value
			return res
		},
		status(code: number) {
			res.statusCode = code
			return res
		},
		json(body: unknown) {
			res._jsonBody = body
			return res
		},
		write(chunk: unknown) {
			const text =
				typeof chunk === 'string'
					? chunk
					: Buffer.isBuffer(chunk)
						? (chunk as Buffer).toString('utf8')
						: ''
			res._writes.push(text)
			return true
		},
		end(chunk?: unknown) {
			if (chunk !== undefined) {
				const text =
					typeof chunk === 'string'
						? chunk
						: Buffer.isBuffer(chunk)
							? (chunk as Buffer).toString('utf8')
							: ''
				if (text) res._writes.push(text)
			}
			res._endCalled = true
			return res
		},
	}
	return res
}

function asResponse(mock: MockRes): Response {
	return mock as unknown as Response
}

const fakeLivinityd = {
	logger: {
		log: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
	},
} as never

async function flushPromises() {
	for (let i = 0; i < 5; i++) {
		await new Promise((r) => setImmediate(r))
	}
}

describe('capture-middleware Plan 44-02', () => {
	beforeEach(() => {
		insertUsageMock.mockClear()
		resolveAppIdMock.mockClear()
		resolveAppIdMock.mockResolvedValue(null)
	})

	test('T1 — sync Anthropic res.json triggers insertUsage with prompt/completion tokens', async () => {
		const middleware = createCaptureMiddleware(fakeLivinityd)
		const req = makeReq()
		const res = makeRes()
		const next = vi.fn() as unknown as NextFunction

		await middleware(req, asResponse(res), next)
		expect(next).toHaveBeenCalledTimes(1)

		// Simulate the broker calling res.json with the Anthropic body
		res.json({
			id: 'msg_abc',
			type: 'message',
			role: 'assistant',
			content: [{type: 'text', text: 'hi'}],
			model: 'claude-sonnet-4-6',
			stop_reason: 'end_turn',
			stop_sequence: null,
			usage: {input_tokens: 5, output_tokens: 3},
		})

		await flushPromises()

		expect(insertUsageMock).toHaveBeenCalledTimes(1)
		const call = insertUsageMock.mock.calls[0][0]
		expect(call.userId).toBe('USERID')
		expect(call.promptTokens).toBe(5)
		expect(call.completionTokens).toBe(3)
		expect(call.endpoint).toBe('messages')
		expect(call.requestId).toBe('msg_abc')
		expect(call.model).toBe('claude-sonnet-4-6')
	})

	test('T2 — SSE Anthropic stream calls insertUsage at res.end with accumulated tokens', async () => {
		const middleware = createCaptureMiddleware(fakeLivinityd)
		const req = makeReq()
		const res = makeRes()
		const next = vi.fn() as unknown as NextFunction

		await middleware(req, asResponse(res), next)

		// Mark response as SSE BEFORE writing chunks (broker sets Content-Type early)
		res.setHeader('content-type', 'text/event-stream')
		res.write(
			'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_sse","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-6","stop_reason":null,"usage":{"input_tokens":7,"output_tokens":0}}}\n\n',
		)
		res.write('event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi"}}\n\n')
		res.write(
			'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":4}}\n\n',
		)
		res.end()

		await flushPromises()

		expect(insertUsageMock).toHaveBeenCalledTimes(1)
		const call = insertUsageMock.mock.calls[0][0]
		expect(call.endpoint).toBe('messages')
		expect(call.promptTokens).toBe(7)
		expect(call.completionTokens).toBe(4)
		expect(call.requestId).toBe('msg_sse')
		expect(call.model).toBe('claude-sonnet-4-6')
	})

	test('T3 — status 429 res.json triggers throttled row insert', async () => {
		const middleware = createCaptureMiddleware(fakeLivinityd)
		const req = makeReq()
		const res = makeRes()
		const next = vi.fn() as unknown as NextFunction

		await middleware(req, asResponse(res), next)
		res.status(429)
		res.json({error: {type: 'rate_limit_error', message: 'cap reached'}})

		await flushPromises()

		expect(insertUsageMock).toHaveBeenCalledTimes(1)
		const call = insertUsageMock.mock.calls[0][0]
		expect(call.endpoint).toBe('429-throttled')
		expect(call.promptTokens).toBe(0)
		expect(call.completionTokens).toBe(0)
		expect(call.userId).toBe('USERID')
	})

	test('T4 — malformed body (no usage) does NOT call insertUsage', async () => {
		const middleware = createCaptureMiddleware(fakeLivinityd)
		const req = makeReq()
		const res = makeRes()
		const next = vi.fn() as unknown as NextFunction

		await middleware(req, asResponse(res), next)
		res.json({whatever: 'no usage here'})

		await flushPromises()

		expect(insertUsageMock).not.toHaveBeenCalled()
	})

	test('T5 — middleware skips when req.params.userId is missing', async () => {
		const middleware = createCaptureMiddleware(fakeLivinityd)
		const req = {
			params: {},
			originalUrl: '/u',
			url: '/u',
			socket: {remoteAddress: '127.0.0.1'},
		} as unknown as Request
		const res = makeRes()
		const next = vi.fn() as unknown as NextFunction

		await middleware(req, asResponse(res), next)
		expect(next).toHaveBeenCalledTimes(1)

		// Even if a body comes through, no insert should happen because the
		// middleware bailed out before patching res.json.
		res.json({usage: {input_tokens: 5, output_tokens: 3}, model: 'x', id: 'y'})
		await flushPromises()
		expect(insertUsageMock).not.toHaveBeenCalled()
	})

	test('T6 — sync OpenAI chat-completions response triggers insertUsage', async () => {
		const middleware = createCaptureMiddleware(fakeLivinityd)
		const req = makeReq('USERID', '/u/USERID/v1/chat/completions')
		const res = makeRes()
		const next = vi.fn() as unknown as NextFunction

		await middleware(req, asResponse(res), next)
		res.json({
			id: 'chatcmpl-xyz',
			object: 'chat.completion',
			created: 1700,
			model: 'gpt-4',
			choices: [{index: 0, message: {role: 'assistant', content: 'hi'}, finish_reason: 'stop'}],
			usage: {prompt_tokens: 9, completion_tokens: 6, total_tokens: 15},
		})

		await flushPromises()

		expect(insertUsageMock).toHaveBeenCalledTimes(1)
		const call = insertUsageMock.mock.calls[0][0]
		expect(call.endpoint).toBe('chat-completions')
		expect(call.promptTokens).toBe(9)
		expect(call.completionTokens).toBe(6)
	})
})
