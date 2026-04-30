/**
 * Phase 44 Plan 44-05 — End-to-end integration test.
 *
 * Validates D-44-22: capture middleware + a stub broker handler write the
 * correct broker_usage row shape via insertUsage. Mocks insertUsage with vi.mock
 * so no real PG pool is needed.
 *
 * Approach: instead of bringing in supertest as a new dep, we mount the real
 * capture middleware on a manual req/res stub pair (same pattern as Plan
 * 44-02 capture-middleware.test.ts) and drive the stub broker handler to
 * simulate the four canonical scenarios:
 *   1. Anthropic sync 200 → insertUsage with prompt_tokens / completion_tokens
 *   2. OpenAI sync 200 → insertUsage with endpoint='chat-completions'
 *   3. 429 → insertUsage with endpoint='429-throttled' + tokens=0
 *   4. Malformed body → insertUsage NOT called
 *   5. Anthropic SSE → insertUsage at stream end with accumulated tokens
 */

import {beforeEach, describe, expect, test, vi} from 'vitest'
import type {Request, Response, NextFunction, RequestHandler} from 'express'

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

type StubRes = {
	statusCode: number
	_endCalled: boolean
	_writes: string[]
	_jsonBody: unknown
	_headersSent: boolean
	getHeader(key: string): string | undefined
	setHeader(key: string, value: string): StubRes
	status(code: number): StubRes
	json(body: unknown): StubRes
	write(chunk: unknown): boolean
	end(chunk?: unknown): StubRes
}

function makeReq(opts: {userId?: string; urlPath?: string; ip?: string} = {}): Request {
	return {
		params: {userId: opts.userId ?? 'USERID'},
		originalUrl: opts.urlPath ?? '/u/USERID/v1/messages',
		url: opts.urlPath ?? '/u/USERID/v1/messages',
		socket: {remoteAddress: opts.ip ?? '172.17.0.5'},
	} as unknown as Request
}

function makeRes(): StubRes {
	const headers: Record<string, string> = {}
	const res: StubRes = {
		statusCode: 200,
		_endCalled: false,
		_writes: [],
		_jsonBody: undefined,
		_headersSent: false,
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
			res._headersSent = true
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

function asResponse(stub: StubRes): Response {
	return stub as unknown as Response
}

const fakeLivinityd = {
	logger: {
		log: vi.fn(),
		verbose: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
	},
} as never

async function flushPromises() {
	for (let i = 0; i < 5; i++) {
		await new Promise((r) => setImmediate(r))
	}
}

/**
 * Drive the middleware → stub-broker-handler chain end-to-end. The handler
 * receives the patched Response and produces output exactly the way the real
 * livinity-broker would.
 */
async function runScenario(
	urlPath: string,
	stubBrokerHandler: RequestHandler,
): Promise<{stub: StubRes}> {
	const middleware = createCaptureMiddleware(fakeLivinityd)
	const req = makeReq({urlPath})
	const stub = makeRes()
	const next = vi.fn() as unknown as NextFunction

	await middleware(req, asResponse(stub), next)
	expect(next).toHaveBeenCalledTimes(1)

	// Now invoke the stub broker handler — it sees the patched res.
	const noopNext = vi.fn() as unknown as NextFunction
	await Promise.resolve(stubBrokerHandler(req, asResponse(stub), noopNext))
	await flushPromises()

	return {stub}
}

describe('Phase 44 integration — middleware + stub broker handler -> insertUsage', () => {
	beforeEach(() => {
		insertUsageMock.mockClear()
		resolveAppIdMock.mockClear()
		resolveAppIdMock.mockResolvedValue(null)
	})

	test('T1 — Anthropic sync 200 produces insertUsage call with FR-DASH-01 row shape', async () => {
		await runScenario('/u/USERID/v1/messages', (req, res) => {
			res.json({
				id: 'msg_abc',
				type: 'message',
				role: 'assistant',
				content: [{type: 'text', text: 'hi'}],
				model: 'claude-sonnet-4-6',
				stop_reason: 'end_turn',
				stop_sequence: null,
				usage: {input_tokens: 42, output_tokens: 13},
			})
		})

		expect(insertUsageMock).toHaveBeenCalledTimes(1)
		const call = insertUsageMock.mock.calls[0][0]
		expect(call).toMatchObject({
			userId: 'USERID',
			appId: null,
			model: 'claude-sonnet-4-6',
			promptTokens: 42,
			completionTokens: 13,
			requestId: 'msg_abc',
			endpoint: 'messages',
		})
	})

	test('T2 — OpenAI sync 200 produces insertUsage call with endpoint=chat-completions', async () => {
		await runScenario('/u/USERID/v1/chat/completions', (req, res) => {
			res.json({
				id: 'chatcmpl-xyz',
				object: 'chat.completion',
				created: 1700,
				model: 'gpt-4',
				choices: [{index: 0, message: {role: 'assistant', content: 'hi'}, finish_reason: 'stop'}],
				usage: {prompt_tokens: 7, completion_tokens: 5, total_tokens: 12},
			})
		})

		expect(insertUsageMock).toHaveBeenCalledTimes(1)
		const call = insertUsageMock.mock.calls[0][0]
		expect(call.endpoint).toBe('chat-completions')
		expect(call.promptTokens).toBe(7)
		expect(call.completionTokens).toBe(5)
		expect(call.requestId).toBe('chatcmpl-xyz')
	})

	test('T3 — 429 status produces throttled row (FR-DASH-03)', async () => {
		const {stub} = await runScenario('/u/USERID/v1/messages', (req, res) => {
			res.status(429).setHeader('Retry-After', '60')
			res.json({error: {type: 'rate_limit_error', message: 'cap reached'}})
		})

		expect(stub.statusCode).toBe(429)
		expect(insertUsageMock).toHaveBeenCalledTimes(1)
		const call = insertUsageMock.mock.calls[0][0]
		expect(call.endpoint).toBe('429-throttled')
		expect(call.promptTokens).toBe(0)
		expect(call.completionTokens).toBe(0)
		expect(call.userId).toBe('USERID')
	})

	test('T4 — malformed body (no usage) does NOT call insertUsage', async () => {
		await runScenario('/u/USERID/v1/messages', (req, res) => {
			res.json({whatever: 'no usage here'})
		})
		expect(insertUsageMock).not.toHaveBeenCalled()
	})

	test('T5 — Anthropic SSE response triggers insertUsage at stream end', async () => {
		await runScenario('/u/USERID/v1/messages', (req, res) => {
			res.setHeader('content-type', 'text/event-stream')
			res.write(
				'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_sse","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-6","stop_reason":null,"usage":{"input_tokens":20,"output_tokens":0}}}\n\n',
			)
			res.write(
				'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hello"}}\n\n',
			)
			res.write(
				'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":8}}\n\n',
			)
			res.end()
		})

		expect(insertUsageMock).toHaveBeenCalledTimes(1)
		const call = insertUsageMock.mock.calls[0][0]
		expect(call.endpoint).toBe('messages')
		expect(call.promptTokens).toBe(20)
		expect(call.completionTokens).toBe(8)
		expect(call.requestId).toBe('msg_sse')
		expect(call.model).toBe('claude-sonnet-4-6')
	})
})
