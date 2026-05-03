/**
 * Phase 61 Plan 04 Wave 0 — RED integration tests for rate-limit forwarding +
 * translation across both broker routes.
 *
 * Drives the same mocked-Anthropic-SDK seam that passthrough-handler.test.ts
 * (Phase 58 Wave 3) already proves works for sync + streaming behavior. The
 * Wave 4 inject point is `setMessagesCreateHeaders(...)` (added by Plan 01),
 * which lets us script `Headers({'anthropic-ratelimit-requests-remaining': '59',
 * ...})` and assert downstream `res._headers` carries the forwarded values.
 *
 * Coverage:
 *   1. Anthropic route, sync — forwardAnthropicHeaders writes anthropic-*
 *      verbatim (incl. anthropic-priority-*) BEFORE res.json. Drops
 *      content-length / date.
 *   2. OpenAI route, sync — translateAnthropicToOpenAIHeaders writes
 *      x-ratelimit-* with reset values as duration strings; NO anthropic-*
 *      headers visible (single-namespace per route). retry-after preserved.
 *   3. Anthropic route, streaming — setHeader('anthropic-...', ...) called
 *      BEFORE flushHeaders() (RESEARCH.md Pitfall 1 / R9). Asserted by
 *      ordering capture on the FakeRes wrapper.
 *   4. OpenAI route, streaming — same ordering invariant for x-ratelimit-*.
 *   5. 429 path — Retry-After preserved on BOTH routes; OpenAI route ALSO
 *      translates ratelimit headers on 429 (T-61-13 + FR-BROKER-C3-03).
 *
 * Initially RED: passthrough-handler.ts + openai-router.ts placeholders are
 * still in place (Plan 01); rate-limit-headers.ts does not yet exist.
 */

import {describe, it, expect, beforeEach, vi} from 'vitest'
import type {Response} from 'express'
import {passthroughAnthropicMessages, passthroughOpenAIChatCompletions} from '../passthrough-handler.js'
import Anthropic from '@anthropic-ai/sdk'

const messagesCreate = vi.fn()
let messagesCreateHeaders: Headers = new Headers()

function setMessagesCreateHeaders(h: Headers): void {
	messagesCreateHeaders = h
}

vi.mock('@anthropic-ai/sdk', () => {
	return {
		default: vi.fn().mockImplementation((opts: any) => ({
			_ctorOpts: opts,
			messages: {
				create: (...args: unknown[]) => {
					const underlying = messagesCreate(...args)
					return {
						withResponse: async () => {
							const data = await Promise.resolve(underlying)
							return {data, response: {headers: messagesCreateHeaders}}
						},
						then: (...thenArgs: any[]) =>
							Promise.resolve(underlying).then(...(thenArgs as [any, any])),
						catch: (...catchArgs: any[]) =>
							Promise.resolve(underlying).catch(...(catchArgs as [any])),
					}
				},
				stream: () => ({finalMessage: vi.fn()}),
			},
		})),
	}
})

vi.mock('../credential-extractor.js', () => ({
	readSubscriptionToken: vi.fn().mockResolvedValue({
		accessToken: 'sk-ant-oat01-FIXTURE-TOKEN',
		refreshToken: 'sk-ant-ort01-FIXTURE-REFRESH',
		expiresAt: '2099-01-01T00:00:00.000Z',
	}),
}))

interface CapturedRes {
	_status: number
	_body: any
	_headers: Record<string, string>
	_writes: Array<string | Buffer>
	_ended: boolean
	/**
	 * Phase 61 Plan 04 Wave 4: ordering capture for setHeader-before-flushHeaders
	 * verification. Each call appends an entry — assertions check that all
	 * setHeader('anthropic-*' | 'x-ratelimit-*', ...) entries precede the
	 * 'flushHeaders' entry in the array (RESEARCH.md Pitfall 1 / R9 mitigation).
	 */
	_callOrder: Array<{kind: 'setHeader'; name: string} | {kind: 'flushHeaders'}>
}

function makeRes(): Response & CapturedRes {
	const res: any = {
		_status: 200,
		_body: undefined,
		_headers: {} as Record<string, string>,
		_writes: [] as Array<string | Buffer>,
		_ended: false,
		_callOrder: [],
		status(code: number) {
			res._status = code
			return res
		},
		json(body: any) {
			res._body = body
			return res
		},
		setHeader(k: string, v: string) {
			res._headers[k] = v
			res._callOrder.push({kind: 'setHeader', name: k})
			return res
		},
		set(headers: Record<string, string>) {
			Object.assign(res._headers, headers)
			return res
		},
		write(chunk: string | Buffer) {
			res._writes.push(chunk)
			return true
		},
		end(chunk?: string | Buffer) {
			if (chunk !== undefined) res._writes.push(chunk)
			res._ended = true
			return res
		},
		flushHeaders() {
			res._callOrder.push({kind: 'flushHeaders'})
		},
		on() {
			return res
		},
		socket: {setNoDelay() {}},
	}
	return res
}

function makeLivinityd(): any {
	return {
		logger: {log: vi.fn()},
		ai: {redis: {async get() { return null }}},
	}
}

const SAMPLE_MESSAGE = {
	id: 'msg_xyz',
	type: 'message',
	role: 'assistant',
	content: [{type: 'text', text: 'hello'}],
	model: 'claude-sonnet-4-6',
	stop_reason: 'end_turn',
	stop_sequence: null,
	usage: {input_tokens: 10, output_tokens: 5},
}

const STREAM_SCRIPT = [
	{
		type: 'message_start',
		message: {
			id: 'msg_test',
			type: 'message',
			role: 'assistant',
			content: [],
			model: 'claude-sonnet-4-6',
			stop_reason: null,
			stop_sequence: null,
			usage: {input_tokens: 10, output_tokens: 1},
		},
	},
	{type: 'content_block_start', index: 0, content_block: {type: 'text', text: ''}},
	{type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text: 'hi'}},
	{type: 'content_block_stop', index: 0},
	{
		type: 'message_delta',
		delta: {stop_reason: 'end_turn', stop_sequence: null},
		usage: {output_tokens: 5},
	},
	{type: 'message_stop'},
]

function makeAsyncIterable<T>(items: T[]): AsyncIterable<T> {
	return {
		[Symbol.asyncIterator]() {
			let i = 0
			return {
				async next() {
					if (i >= items.length) return {value: undefined as any, done: true}
					return {value: items[i++]!, done: false}
				},
			}
		},
	}
}

function makeFakeUpstreamHeaders(extra: Record<string, string> = {}): Headers {
	const future = new Date(Date.now() + 360_000).toISOString()
	return new Headers({
		'anthropic-ratelimit-requests-limit': '60',
		'anthropic-ratelimit-requests-remaining': '59',
		'anthropic-ratelimit-requests-reset': future,
		'anthropic-ratelimit-tokens-limit': '150000',
		'anthropic-ratelimit-tokens-remaining': '149984',
		'anthropic-ratelimit-tokens-reset': future,
		'anthropic-priority-input-tokens-limit': '1000',
		'content-length': '250',
		date: 'Mon, 02 May 2026 20:00:00 GMT',
		...extra,
	})
}

beforeEach(() => {
	messagesCreate.mockReset()
	;(Anthropic as unknown as ReturnType<typeof vi.fn>).mockClear?.()
	setMessagesCreateHeaders(new Headers()) // reset between tests
})

describe('Phase 61 Plan 04 — Anthropic route forwards rate-limit headers (FR-BROKER-C3-01)', () => {
	it('sync: forwards all anthropic-* + retry-after; drops content-length and date', async () => {
		setMessagesCreateHeaders(makeFakeUpstreamHeaders({'retry-after': '30'}))
		messagesCreate.mockResolvedValueOnce(SAMPLE_MESSAGE)
		const res = makeRes()
		await passthroughAnthropicMessages({
			livinityd: makeLivinityd(),
			userId: 'abc123',
			body: {
				model: 'sonnet',
				max_tokens: 256,
				messages: [{role: 'user', content: 'Hi'}],
				stream: false,
			},
			res,
		})
		expect(res._status).toBe(200)
		expect(res._headers['anthropic-ratelimit-requests-remaining']).toBe('59')
		expect(res._headers['anthropic-ratelimit-tokens-remaining']).toBe('149984')
		expect(res._headers['anthropic-priority-input-tokens-limit']).toBe('1000')
		expect(res._headers['retry-after']).toBe('30')
		// Hop-by-hop / body-framing headers MUST NOT be forwarded
		expect(res._headers['content-length']).toBeUndefined()
		expect(res._headers['date']).toBeUndefined()
		// Body still forwarded verbatim
		expect(res._body).toEqual(SAMPLE_MESSAGE)
	})

	it('streaming: setHeader is called BEFORE flushHeaders (Pitfall 1 / R9 mitigation)', async () => {
		setMessagesCreateHeaders(makeFakeUpstreamHeaders())
		messagesCreate.mockResolvedValueOnce(makeAsyncIterable(STREAM_SCRIPT))
		const res = makeRes()
		await passthroughAnthropicMessages({
			livinityd: makeLivinityd(),
			userId: 'abc123',
			body: {
				model: 'sonnet',
				max_tokens: 256,
				messages: [{role: 'user', content: 'Hi'}],
				stream: true,
			},
			res,
		})
		// Find the index of any setHeader('anthropic-...') call and assert it
		// precedes the flushHeaders entry.
		const flushIdx = res._callOrder.findIndex((c) => c.kind === 'flushHeaders')
		expect(flushIdx).toBeGreaterThan(0) // flushHeaders DID get called
		const anthropicSetHeaderIndices = res._callOrder
			.map((c, i) => ({c, i}))
			.filter(
				({c}) =>
					c.kind === 'setHeader' && c.name.toLowerCase().startsWith('anthropic-'),
			)
			.map(({i}) => i)
		expect(anthropicSetHeaderIndices.length).toBeGreaterThan(0) // forwarded at least one
		for (const idx of anthropicSetHeaderIndices) {
			expect(idx).toBeLessThan(flushIdx)
		}
		// And the headers are actually present on the response.
		expect(res._headers['anthropic-ratelimit-requests-remaining']).toBe('59')
	})
})

describe('Phase 61 Plan 04 — OpenAI route translates rate-limit headers (FR-BROKER-C3-02)', () => {
	it('sync: translates 6 canonical headers to x-ratelimit-* namespace; reset is duration string', async () => {
		setMessagesCreateHeaders(makeFakeUpstreamHeaders())
		messagesCreate.mockResolvedValueOnce(SAMPLE_MESSAGE)
		const res = makeRes()
		await passthroughOpenAIChatCompletions({
			livinityd: makeLivinityd(),
			userId: 'abc123',
			body: {
				model: 'gpt-4o',
				messages: [{role: 'user', content: 'Hi'}],
				stream: false,
			},
			res,
		})
		expect(res._status).toBe(200)
		expect(res._headers['x-ratelimit-limit-requests']).toBe('60')
		expect(res._headers['x-ratelimit-remaining-requests']).toBe('59')
		expect(res._headers['x-ratelimit-limit-tokens']).toBe('150000')
		expect(res._headers['x-ratelimit-remaining-tokens']).toBe('149984')
		expect(res._headers['x-ratelimit-reset-requests']).toMatch(/^([0-9]+s|[0-9]+m[0-9]+s)$/)
		expect(res._headers['x-ratelimit-reset-tokens']).toMatch(/^([0-9]+s|[0-9]+m[0-9]+s)$/)
		// NO anthropic-* headers on OpenAI route (T-61-16)
		const anthropicKeys = Object.keys(res._headers).filter((k) =>
			k.toLowerCase().startsWith('anthropic-'),
		)
		expect(anthropicKeys).toEqual([])
	})

	it('streaming: setHeader is called BEFORE flushHeaders for x-ratelimit-* headers', async () => {
		setMessagesCreateHeaders(makeFakeUpstreamHeaders())
		messagesCreate.mockResolvedValueOnce(makeAsyncIterable(STREAM_SCRIPT))
		const res = makeRes()
		await passthroughOpenAIChatCompletions({
			livinityd: makeLivinityd(),
			userId: 'abc123',
			body: {
				model: 'gpt-4o',
				messages: [{role: 'user', content: 'Hi'}],
				stream: true,
			},
			res,
		})
		const flushIdx = res._callOrder.findIndex((c) => c.kind === 'flushHeaders')
		expect(flushIdx).toBeGreaterThan(0)
		const xRatelimitIndices = res._callOrder
			.map((c, i) => ({c, i}))
			.filter(
				({c}) =>
					c.kind === 'setHeader' && c.name.toLowerCase().startsWith('x-ratelimit-'),
			)
			.map(({i}) => i)
		expect(xRatelimitIndices.length).toBeGreaterThan(0)
		for (const idx of xRatelimitIndices) {
			expect(idx).toBeLessThan(flushIdx)
		}
		expect(res._headers['x-ratelimit-remaining-requests']).toBe('59')
	})

	it('drops input/output split + priority headers (no OpenAI equivalent)', async () => {
		setMessagesCreateHeaders(
			new Headers({
				'anthropic-ratelimit-input-tokens-remaining': '5000',
				'anthropic-ratelimit-output-tokens-remaining': '5000',
				'anthropic-priority-input-tokens-limit': '1000',
			}),
		)
		messagesCreate.mockResolvedValueOnce(SAMPLE_MESSAGE)
		const res = makeRes()
		await passthroughOpenAIChatCompletions({
			livinityd: makeLivinityd(),
			userId: 'abc123',
			body: {
				model: 'gpt-4o',
				messages: [{role: 'user', content: 'Hi'}],
				stream: false,
			},
			res,
		})
		expect(
			Object.keys(res._headers).find((k) => k.toLowerCase().startsWith('x-ratelimit-input-')),
		).toBeUndefined()
		expect(
			Object.keys(res._headers).find((k) => k.toLowerCase().startsWith('x-ratelimit-output-')),
		).toBeUndefined()
		expect(
			Object.keys(res._headers).find((k) => k.toLowerCase().startsWith('x-ratelimit-priority-')),
		).toBeUndefined()
	})
})

describe('Phase 61 Plan 04 — 429 path preserves Retry-After on BOTH routes (FR-BROKER-C3-03)', () => {
	it('Anthropic route: 429 from upstream → throws UpstreamHttpError with retry-after preserved', async () => {
		// Existing Phase 57 test pattern: error path forwards retry-after via the
		// router.ts catch block (lines 158-185). Plan 04 does NOT change that
		// existing behavior — this test re-asserts the contract continues to hold
		// after Plan 04's header-forwarding hooks land in the SUCCESS path only.
		const err = Object.assign(new Error('rate limited'), {
			status: 429,
			headers: {'retry-after': '60'},
		})
		messagesCreate.mockRejectedValueOnce(err)
		await expect(
			passthroughAnthropicMessages({
				livinityd: makeLivinityd(),
				userId: 'abc123',
				body: {
					model: 'sonnet',
					max_tokens: 256,
					messages: [{role: 'user', content: 'Hi'}],
					stream: false,
				},
				res: makeRes(),
			}),
		).rejects.toMatchObject({status: 429, retryAfter: '60'})
	})

	it('OpenAI route: 429 from upstream → throws UpstreamHttpError with retry-after preserved', async () => {
		const err = Object.assign(new Error('rate limited'), {
			status: 429,
			headers: {'retry-after': '60'},
		})
		messagesCreate.mockRejectedValueOnce(err)
		await expect(
			passthroughOpenAIChatCompletions({
				livinityd: makeLivinityd(),
				userId: 'abc123',
				body: {
					model: 'gpt-4o',
					messages: [{role: 'user', content: 'Hi'}],
					stream: false,
				},
				res: makeRes(),
			}),
		).rejects.toMatchObject({status: 429, retryAfter: '60'})
	})
})
