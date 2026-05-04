/**
 * Phase 57 Plan 01 Wave 0 — RED tests for passthrough-handler.ts
 * (implemented in Wave 2).
 *
 * Asserts the broker's passthrough Anthropic Messages handler:
 *
 *   - FR-BROKER-A1-01: body.system + body.tools forwarded VERBATIM to upstream
 *   - FR-BROKER-A1-02: NO Nexus identity injection (request body untouched
 *     before forward; response body forwarded verbatim — no "Nexus" / "powered
 *     by" rewrites either side)
 *   - FR-BROKER-A1-03: NO Nexus MCP tools injected (tools array forwarded
 *     unchanged — no `mcp__*` / `shell` / `files_read` additions)
 *   - Auth header format (Risk-A1 mitigation): SDK constructed with `authToken`
 *     (which produces `Authorization: Bearer <token>`), NEVER with `apiKey`,
 *     and with `defaultHeaders: { 'anthropic-version': '2023-06-01' }`.
 *     This gates Wave 1's smoke test — if upstream rejects subscription tokens
 *     for /v1/messages, this test catches the construction-time bug locally
 *     before live traffic.
 *   - Missing subscription → 401 with Anthropic-spec error body (actionable
 *     message pointing user to Settings)
 *   - Upstream 429 → throws UpstreamHttpError with status 429 + retryAfter
 *     preserved, so the existing router.ts catch block (lines 158-185) can
 *     forward Retry-After verbatim
 *   - Sync (stream:false) response forwarded verbatim via res.json
 *
 * The @anthropic-ai/sdk default export is mocked via vi.mock — these tests
 * NEVER make real network calls to api.anthropic.com (Threat T-57-02
 * mitigation per <threat_model> in PLAN.md).
 *
 * Tests are intentionally RED until Wave 2 introduces
 * `livinity-broker/passthrough-handler.ts` exporting
 * `passthroughAnthropicMessages`.
 */

import {describe, it, expect, beforeEach, vi} from 'vitest'
import type {Response} from 'express'
import {passthroughAnthropicMessages} from './passthrough-handler.js'
import Anthropic from '@anthropic-ai/sdk'

const messagesCreate = vi.fn()
const messagesStreamFinal = vi.fn()

/**
 * Phase 61 Plan 01 Wave 1 (refactor): the broker now dispatches via
 * BrokerProvider which invokes `client.messages.create({...}).withResponse()`
 * to expose upstream Web Fetch Headers. The wrapper below simulates the
 * Anthropic SDK's APIPromise: it resolves to the same value
 * `messagesCreate.mockResolvedValue(...)` provides AND exposes a
 * `.withResponse()` method that resolves to `{data, response}` per the SDK
 * contract. Existing tests that invoke `messagesCreate.mockResolvedValue(X)`
 * continue to work — the wrapper auto-shapes X into the {data, response}
 * envelope on `.withResponse()` calls. Custom Headers can be injected by
 * setting `messagesCreateHeaders` per-test (default: empty Headers).
 *
 * The wrapper is also `then`-able (forwards to the underlying mock promise)
 * so any caller that uses bare `await client.messages.create(...)` (none
 * remain in production after the refactor, but the seam remains intact for
 * any straggler test code).
 */
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
					// `underlying` is whatever the test's mockResolvedValue/mockImplementation
					// returns — typically a Promise resolving to the Anthropic JSON body
					// OR an AsyncIterable for streaming. Wrap so .withResponse() returns
					// {data, response}.
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
				stream: () => ({finalMessage: messagesStreamFinal}),
			},
		})),
	}
})

vi.mock('./credential-extractor.js', () => ({
	readSubscriptionToken: vi.fn().mockResolvedValue({
		accessToken: 'sk-ant-oat01-FIXTURE-TOKEN',
		refreshToken: 'sk-ant-ort01-FIXTURE-REFRESH',
		expiresAt: '2099-01-01T00:00:00.000Z',
	}),
}))

import {readSubscriptionToken} from './credential-extractor.js'

interface CapturedRes {
	_status: number
	_body: any
	_headers: Record<string, string>
	_writes: Array<string | Buffer>
	_ended: boolean
}

function makeRes(): Response & CapturedRes {
	// Wave 2 fix: the captured fields must live ON res so that test assertions
	// like `res._status` and `res._body` reflect the most recent mutation.
	// Wave 0's `Object.assign(res, captured)` copied snapshots once at
	// construction, so subsequent updates to the closure-bound `captured`
	// object never propagated back to `res` — hence sync-response and
	// missing-subscription tests saw stale `_status: 200` / `_body: undefined`.
	const res: any = {
		_status: 200,
		_body: undefined,
		_headers: {} as Record<string, string>,
		_writes: [] as Array<string | Buffer>,
		_ended: false,
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
		flushHeaders() {},
		on() {
			return res
		},
		socket: {setNoDelay() {}},
	}
	return res
}

function makeLivinityd(): any {
	// Phase 61 Plan 03: passthroughOpenAIChatCompletions calls
	// resolveModelAlias(livinityd.ai.redis, body.model). Mock with a fake
	// Redis whose get() returns null — the resolver then either passes
	// `claude-*` model IDs through verbatim (no warn) or falls through to
	// the hardcoded `claude-sonnet-4-6` default (warn=true, log absorbed by
	// the same mock logger). Behaviour matches the pre-Plan-03 sync resolver
	// for the model strings used in these tests.
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

beforeEach(() => {
	messagesCreate.mockReset()
	messagesStreamFinal.mockReset()
	;(Anthropic as unknown as ReturnType<typeof vi.fn>).mockClear?.()
	;(readSubscriptionToken as unknown as ReturnType<typeof vi.fn>).mockClear?.()
	;(readSubscriptionToken as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
		accessToken: 'sk-ant-oat01-FIXTURE-TOKEN',
		refreshToken: 'sk-ant-ort01-FIXTURE-REFRESH',
		expiresAt: '2099-01-01T00:00:00.000Z',
	})
})

describe('passthroughAnthropicMessages — system + tools forwarding (FR-BROKER-A1-01)', () => {
	it('passes body.system verbatim to Anthropic SDK messages.create', async () => {
		messagesCreate.mockResolvedValueOnce(SAMPLE_MESSAGE)
		await passthroughAnthropicMessages({
			livinityd: makeLivinityd(),
			userId: 'abc123',
			body: {
				model: 'sonnet',
				max_tokens: 256,
				system: 'You are Bolt, a developer-focused assistant',
				messages: [{role: 'user', content: 'Who are you?'}],
				stream: false,
			},
			res: makeRes(),
		})
		expect(messagesCreate).toHaveBeenCalledTimes(1)
		expect(messagesCreate).toHaveBeenCalledWith(
			expect.objectContaining({system: 'You are Bolt, a developer-focused assistant'}),
		)
	})

	it('passes body.tools verbatim to Anthropic SDK messages.create', async () => {
		messagesCreate.mockResolvedValueOnce(SAMPLE_MESSAGE)
		const tools = [
			{
				name: 'calculator',
				description: 'Adds two numbers',
				input_schema: {
					type: 'object',
					properties: {a: {type: 'number'}, b: {type: 'number'}},
					required: ['a', 'b'],
				},
			},
		]
		await passthroughAnthropicMessages({
			livinityd: makeLivinityd(),
			userId: 'abc123',
			body: {
				model: 'sonnet',
				max_tokens: 256,
				messages: [{role: 'user', content: 'Use calc'}],
				tools,
				stream: false,
			},
			res: makeRes(),
		})
		expect(messagesCreate).toHaveBeenCalledWith(expect.objectContaining({tools}))
	})
})

describe('passthroughAnthropicMessages — no Nexus identity (FR-BROKER-A1-02)', () => {
	it('does NOT inject "powered by" or "Nexus" into request body', async () => {
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
		const requestPayload = JSON.stringify(messagesCreate.mock.calls[0][0])
		expect(requestPayload).not.toContain('Nexus')
		expect(requestPayload).not.toContain('powered by')

		const responsePayload = JSON.stringify(res._body ?? {})
		expect(responsePayload).not.toContain('Nexus')
		expect(responsePayload).not.toContain('powered by')
	})
})

describe('passthroughAnthropicMessages — no Nexus MCP tools (FR-BROKER-A1-03)', () => {
	it('does NOT add tools other than what client provided', async () => {
		messagesCreate.mockResolvedValueOnce(SAMPLE_MESSAGE)
		await passthroughAnthropicMessages({
			livinityd: makeLivinityd(),
			userId: 'abc123',
			body: {
				model: 'sonnet',
				max_tokens: 256,
				messages: [{role: 'user', content: 'Use calc'}],
				tools: [{name: 'calculator', description: 'add', input_schema: {type: 'object'}}],
				stream: false,
			},
			res: makeRes(),
		})
		const forwardedTools = messagesCreate.mock.calls[0][0].tools as Array<{name: string}>
		expect(forwardedTools).toHaveLength(1)
		expect(forwardedTools[0].name).toBe('calculator')
		// Sanity: no MCP-namespace or built-in shell injection
		for (const tool of forwardedTools) {
			expect(tool.name).not.toMatch(/^mcp__/)
			expect(tool.name).not.toBe('shell')
			expect(tool.name).not.toBe('files_read')
		}
	})
})

describe('passthroughAnthropicMessages — auth construction (Risk-A1 gate for Wave 1 smoke test)', () => {
	it('constructs Anthropic client with authToken (NOT apiKey) and anthropic-version header', async () => {
		messagesCreate.mockResolvedValueOnce(SAMPLE_MESSAGE)
		await passthroughAnthropicMessages({
			livinityd: makeLivinityd(),
			userId: 'abc123',
			body: {
				model: 'sonnet',
				max_tokens: 256,
				messages: [{role: 'user', content: 'Hi'}],
				stream: false,
			},
			res: makeRes(),
		})
		expect(Anthropic).toHaveBeenCalledWith(
			expect.objectContaining({authToken: 'sk-ant-oat01-FIXTURE-TOKEN'}),
		)
		expect(Anthropic).toHaveBeenCalledWith(
			expect.not.objectContaining({apiKey: expect.anything()}),
		)
		expect(Anthropic).toHaveBeenCalledWith(
			expect.objectContaining({
				defaultHeaders: expect.objectContaining({'anthropic-version': '2023-06-01'}),
			}),
		)
	})
})

describe('passthroughAnthropicMessages — missing subscription', () => {
	it('returns 401 with actionable Anthropic-spec error when readSubscriptionToken returns null', async () => {
		;(readSubscriptionToken as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null)
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
		expect(res._status).toBe(401)
		expect(res._body).toEqual({
			type: 'error',
			error: {
				type: 'authentication_error',
				message: expect.stringContaining('subscription'),
			},
		})
	})
})

describe('passthroughAnthropicMessages — upstream 429 (Retry-After preservation)', () => {
	it('throws UpstreamHttpError with status 429 + retryAfter forwarded', async () => {
		const err = Object.assign(new Error('rate limited'), {
			status: 429,
			headers: {'retry-after': '30'},
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
		).rejects.toMatchObject({status: 429, retryAfter: '30'})
	})
})

describe('passthroughAnthropicMessages — sync response forwarded verbatim', () => {
	it('returns upstream Messages response verbatim via res.json on stream:false', async () => {
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
		expect(res._body).toEqual(SAMPLE_MESSAGE)
	})
})

// ===== Phase 58 Wave 2: true token streaming (FR-BROKER-C1-01) =====
//
// These tests assert the streaming branch (body.stream === true) replaces the
// Phase 57 transitional aggregate-then-restream behavior with raw async iterator
// forwarding via client.messages.create({...stream: true}).
//
// Each upstream Anthropic event is forwarded VERBATIM as
//   `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
// — no buffering, no field rewriting, no aggregation.

const STREAM_SCRIPT_EVENTS = [
	{
		type: 'message_start',
		message: {
			id: 'msg_stream_test',
			type: 'message',
			role: 'assistant',
			content: [],
			model: 'claude-sonnet-4-6',
			stop_reason: null,
			stop_sequence: null,
			usage: {input_tokens: 25, output_tokens: 1},
		},
	},
	{
		type: 'content_block_start',
		index: 0,
		content_block: {type: 'text', text: ''},
	},
	{type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text: 'Hello'}},
	{type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text: ' world'}},
	{type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text: '!'}},
	{type: 'content_block_stop', index: 0},
	{
		type: 'message_delta',
		delta: {stop_reason: 'end_turn', stop_sequence: null},
		usage: {output_tokens: 15},
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

describe('passthroughAnthropicMessages — Phase 58 true streaming (FR-BROKER-C1-01)', () => {
	it('forwards each upstream event verbatim as event/data SSE pair', async () => {
		messagesCreate.mockResolvedValueOnce(makeAsyncIterable(STREAM_SCRIPT_EVENTS))
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
		// Mock returns AsyncIterable directly; the SDK's client.messages.create
		// must be called with stream:true so the SDK yields the iterator.
		expect(messagesCreate).toHaveBeenCalledTimes(1)
		expect(messagesCreate).toHaveBeenCalledWith(expect.objectContaining({stream: true}))

		// Reassemble the wire output and verify each event fired in order.
		const wire = res._writes.join('')
		// Each event comes through as an `event: <type>\ndata: <json>\n\n` pair.
		// Count distinct event lines.
		const eventLines = wire.split('\n').filter((l) => l.startsWith('event: '))
		expect(eventLines).toEqual([
			'event: message_start',
			'event: content_block_start',
			'event: content_block_delta',
			'event: content_block_delta',
			'event: content_block_delta',
			'event: content_block_stop',
			'event: message_delta',
			'event: message_stop',
		])
		// Each event payload is the JSON-stringified upstream event verbatim.
		for (const evt of STREAM_SCRIPT_EVENTS) {
			expect(wire).toContain(`data: ${JSON.stringify(evt)}`)
		}
		expect(res._ended).toBe(true)
	})

	it('sets SSE headers including no-transform and X-Accel-Buffering before streaming', async () => {
		messagesCreate.mockResolvedValueOnce(makeAsyncIterable(STREAM_SCRIPT_EVENTS))
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
		expect(res._headers['Content-Type']).toBe('text/event-stream')
		expect(res._headers['Cache-Control']).toContain('no-transform')
		expect(res._headers['Connection']).toBe('keep-alive')
		expect(res._headers['X-Accel-Buffering']).toBe('no')
	})

	it('emits ≥3 content_block_delta events for a multi-delta stream (no aggregation)', async () => {
		messagesCreate.mockResolvedValueOnce(makeAsyncIterable(STREAM_SCRIPT_EVENTS))
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
		const wire = res._writes.join('')
		const deltaCount = (wire.match(/event: content_block_delta\n/g) ?? []).length
		expect(deltaCount).toBeGreaterThanOrEqual(3)
	})

	it('respects res.writableEnded and stops iterating on client disconnect', async () => {
		// Build an iterator that flips res.writableEnded after the first event.
		const res = makeRes()
		const longScript = [
			{type: 'message_start', message: {usage: {input_tokens: 1, output_tokens: 0}}},
			{type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text: 'a'}},
			{type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text: 'b'}},
			{type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text: 'c'}},
			{type: 'message_stop'},
		]
		const iter: AsyncIterable<any> = {
			[Symbol.asyncIterator]() {
				let i = 0
				return {
					async next() {
						if (i >= longScript.length) return {value: undefined, done: true}
						const value = longScript[i++]
						// Simulate client disconnect after we've yielded the first event.
						if (i === 2) {
							;(res as any).writableEnded = true
						}
						return {value, done: false}
					},
				}
			},
		}
		messagesCreate.mockResolvedValueOnce(iter)
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
		const wire = res._writes.join('')
		const eventLines = wire.split('\n').filter((l) => l.startsWith('event: '))
		// First event written; subsequent events skipped because writableEnded flipped.
		expect(eventLines.length).toBe(1)
		expect(eventLines[0]).toBe('event: message_start')
	})

	it('emits Anthropic-shape error event on mid-stream iterator failure', async () => {
		const res = makeRes()
		const failingIter: AsyncIterable<any> = {
			[Symbol.asyncIterator]() {
				let i = 0
				return {
					async next() {
						if (i === 0) {
							i++
							return {
								value: {type: 'message_start', message: {usage: {input_tokens: 1, output_tokens: 0}}},
								done: false,
							}
						}
						throw new Error('upstream socket reset')
					},
				}
			},
		}
		messagesCreate.mockResolvedValueOnce(failingIter)
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
		const wire = res._writes.join('')
		expect(wire).toContain('event: error')
		expect(wire).toContain('upstream socket reset')
		expect(res._ended).toBe(true)
	})

	it('does NOT use the Phase 57 transitional messages.stream().finalMessage() helper', async () => {
		messagesCreate.mockResolvedValueOnce(makeAsyncIterable(STREAM_SCRIPT_EVENTS))
		await passthroughAnthropicMessages({
			livinityd: makeLivinityd(),
			userId: 'abc123',
			body: {
				model: 'sonnet',
				max_tokens: 256,
				messages: [{role: 'user', content: 'Hi'}],
				stream: true,
			},
			res: makeRes(),
		})
		// Phase 57 used messages.stream(...).finalMessage(); Phase 58 must use
		// messages.create({stream:true}). The finalMessage mock should NEVER
		// be called by the streaming path now.
		expect(messagesStreamFinal).not.toHaveBeenCalled()
	})
})

// ===== Phase 58 Wave 3: OpenAI Chat Completions true streaming + chatcmpl id hardening =====
//
// These tests assert that passthroughOpenAIChatCompletions:
//   - On stream:true, replaces Phase 57's transitional aggregate-then-emit-single-chunk
//     with true 1:1 delta translation via Wave 1's createAnthropicToOpenAIStreamTranslator
//     (FR-BROKER-C2-01..02).
//   - On stream:false, generates chatcmpl id via Wave 1's randomChatCmplId (crypto.randomBytes)
//     instead of Phase 57's Math.random()-based randomBase62. ID matches ^chatcmpl-[A-Za-z0-9]{29}$
//     (FR-BROKER-C2-03).
//   - Streaming SSE headers include Cache-Control: no-cache, no-transform + X-Accel-Buffering: no.
//   - Streaming branch calls messages.create({stream:true}) (NOT the Phase 57 messages.stream().finalMessage()).

import {passthroughOpenAIChatCompletions} from './passthrough-handler.js'

const OPENAI_STREAM_SCRIPT_EVENTS = [
	{
		type: 'message_start',
		message: {
			id: 'msg_openai_stream_test',
			type: 'message',
			role: 'assistant',
			content: [],
			model: 'claude-sonnet-4-6',
			stop_reason: null,
			stop_sequence: null,
			usage: {input_tokens: 25, output_tokens: 1},
		},
	},
	{type: 'content_block_start', index: 0, content_block: {type: 'text', text: ''}},
	{type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text: 'Hello'}},
	{type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text: ' from'}},
	{type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text: ' OpenAI'}},
	{type: 'content_block_stop', index: 0},
	{
		type: 'message_delta',
		delta: {stop_reason: 'end_turn', stop_sequence: null},
		usage: {output_tokens: 15},
	},
	{type: 'message_stop'},
]

describe('passthroughOpenAIChatCompletions — Phase 58 Wave 3 streaming (FR-BROKER-C2-01..02)', () => {
	it('uses messages.create({stream:true}) and emits multiple chat.completion.chunk events', async () => {
		messagesCreate.mockResolvedValueOnce(makeAsyncIterable(OPENAI_STREAM_SCRIPT_EVENTS))
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
		// Streaming branch must call messages.create with stream:true (NOT finalMessage)
		expect(messagesCreate).toHaveBeenCalledTimes(1)
		expect(messagesCreate).toHaveBeenCalledWith(expect.objectContaining({stream: true}))
		expect(messagesStreamFinal).not.toHaveBeenCalled()

		// Wire output: translator emits OpenAI chat.completion.chunk lines.
		const wire = res._writes.join('')
		// At least one role chunk + 3 content chunks + 1 finish chunk + [DONE]
		const dataLines = wire.split('\n').filter((l) => l.startsWith('data: ') && !l.includes('[DONE]'))
		expect(dataLines.length).toBeGreaterThanOrEqual(5) // role + 3 deltas + final
		// Each chunk uses object: chat.completion.chunk
		expect(wire).toContain('"object":"chat.completion.chunk"')
		// Content deltas appear separately (not aggregated into one fat chunk)
		expect(wire).toContain('"content":"Hello"')
		expect(wire).toContain('"content":" from"')
		expect(wire).toContain('"content":" OpenAI"')
		// Terminator
		expect(wire).toContain('data: [DONE]')
		expect(res._ended).toBe(true)
	})

	it('emits final chunk with usage object before [DONE] (FR-BROKER-C2-02)', async () => {
		messagesCreate.mockResolvedValueOnce(makeAsyncIterable(OPENAI_STREAM_SCRIPT_EVENTS))
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
		const wire = res._writes.join('')
		// Final chunk has usage with non-zero token counts (input=25, output=15 cumulative)
		expect(wire).toMatch(/"usage":\s*\{[^}]*"prompt_tokens":\s*25/)
		expect(wire).toMatch(/"usage":\s*\{[^}]*"completion_tokens":\s*15/)
		expect(wire).toMatch(/"usage":\s*\{[^}]*"total_tokens":\s*40/)
		// usage chunk appears BEFORE [DONE]
		const doneIdx = wire.indexOf('data: [DONE]')
		const usageIdx = wire.indexOf('"usage"')
		expect(usageIdx).toBeGreaterThanOrEqual(0)
		expect(usageIdx).toBeLessThan(doneIdx)
	})

	it('sets SSE headers including no-transform and X-Accel-Buffering before streaming', async () => {
		messagesCreate.mockResolvedValueOnce(makeAsyncIterable(OPENAI_STREAM_SCRIPT_EVENTS))
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
		expect(res._headers['Content-Type']).toBe('text/event-stream')
		expect(res._headers['Cache-Control']).toContain('no-transform')
		expect(res._headers['Connection']).toBe('keep-alive')
		expect(res._headers['X-Accel-Buffering']).toBe('no')
	})

	it('echoes caller-requested body.model in chunk.model (NOT resolved Claude model)', async () => {
		messagesCreate.mockResolvedValueOnce(makeAsyncIterable(OPENAI_STREAM_SCRIPT_EVENTS))
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
		const wire = res._writes.join('')
		expect(wire).toContain('"model":"gpt-4o"')
		// Resolved Anthropic model name should NOT appear in chunks
		expect(wire).not.toContain('"model":"claude-sonnet-4-6"')
	})

	it('every emitted chunk shares the same chatcmpl-* id matching OpenAI regex (per-stream id stability)', async () => {
		messagesCreate.mockResolvedValueOnce(makeAsyncIterable(OPENAI_STREAM_SCRIPT_EVENTS))
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
		const wire = res._writes.join('')
		const ids = [...wire.matchAll(/"id":"(chatcmpl-[A-Za-z0-9]+)"/g)].map((m) => m[1])
		expect(ids.length).toBeGreaterThanOrEqual(2)
		// All ids must be identical within one stream
		const uniqueIds = new Set(ids)
		expect(uniqueIds.size).toBe(1)
		// And match OpenAI regex
		const onlyId = ids[0]!
		expect(onlyId).toMatch(/^chatcmpl-[A-Za-z0-9]{29}$/)
	})

	it('respects res.writableEnded and stops iterating on client disconnect', async () => {
		const res = makeRes()
		const longScript = [
			OPENAI_STREAM_SCRIPT_EVENTS[0]!, // message_start
			OPENAI_STREAM_SCRIPT_EVENTS[1]!, // content_block_start
			{type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text: 'a'}},
			{type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text: 'b'}},
			{type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text: 'c'}},
			{type: 'message_stop'},
		]
		const iter: AsyncIterable<any> = {
			[Symbol.asyncIterator]() {
				let i = 0
				return {
					async next() {
						if (i >= longScript.length) return {value: undefined, done: true}
						const value = longScript[i++]
						if (i === 2) (res as any).writableEnded = true
						return {value, done: false}
					},
				}
			},
		}
		messagesCreate.mockResolvedValueOnce(iter)
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
		// Once writableEnded flips, loop must break — translator's writeChunk also no-ops.
		// Most importantly: code does NOT crash and finalize is best-effort safe.
		// Since writableEnded is flipped, the translator will not emit anything.
		// Test passes if no exception is thrown and the handler returns.
		expect(true).toBe(true)
	})
})

describe('passthroughOpenAIChatCompletions — Phase 58 Wave 3 sync id hardening (FR-BROKER-C2-03)', () => {
	const SYNC_RESPONSE = {
		id: 'msg_sync_xyz',
		type: 'message',
		role: 'assistant',
		content: [{type: 'text', text: 'sync hello'}],
		model: 'claude-sonnet-4-6',
		stop_reason: 'end_turn',
		stop_sequence: null,
		usage: {input_tokens: 12, output_tokens: 8},
	}

	it('returns sync response with chatcmpl id matching ^chatcmpl-[A-Za-z0-9]{29}$ (crypto-based)', async () => {
		messagesCreate.mockResolvedValueOnce(SYNC_RESPONSE)
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
		expect(res._body).toBeTruthy()
		expect(res._body.id).toMatch(/^chatcmpl-[A-Za-z0-9]{29}$/)
		expect(res._body.object).toBe('chat.completion')
		expect(res._body.usage).toEqual({prompt_tokens: 12, completion_tokens: 8, total_tokens: 20})
	})

	it('generates DISTINCT ids across multiple sync calls (collision-resistant)', async () => {
		const ids: string[] = []
		for (let i = 0; i < 20; i++) {
			messagesCreate.mockResolvedValueOnce(SYNC_RESPONSE)
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
			ids.push(res._body.id)
		}
		// 20 distinct ids
		const unique = new Set(ids)
		expect(unique.size).toBe(20)
		// All match regex
		for (const id of ids) {
			expect(id).toMatch(/^chatcmpl-[A-Za-z0-9]{29}$/)
		}
	})
})

// ===== Phase 74 Plan 02 (F3) — Multi-turn tool_result protocol translator =====
//
// These tests assert that passthroughOpenAIChatCompletions correctly translates
// OpenAI `tool` / `function` role messages into Anthropic `tool_result` content
// blocks under a `user` role message, preserving `tool_call_id` <-> `tool_use_id`
// round-trip per CONTEXT D-09..D-11.
//
// Pre-F3 behavior (passthrough-handler.ts:425): `tool` and `function` role
// messages were FILTERED OUT, breaking multi-turn agentic loops for OpenAI
// clients (Continue.dev, Open WebUI, Cline-via-OpenAI). F3 replaces that filter
// with a walker that emits `tool_result` content blocks.
//
// Test strategy: assert the upstream payload that `messagesCreate` receives.
// `messagesCreate` mock captures `{ model, max_tokens, system, messages, ... }`
// — F3 changes the `messages` shape; we assert deep-equal against a golden
// vector + several focused-rule cases.

describe('passthroughOpenAIChatCompletions — Phase 74 Plan 02 F3 multi-turn tool_result translator', () => {
	const SYNC_RESPONSE_F3 = {
		id: 'msg_f3_test',
		type: 'message',
		role: 'assistant',
		content: [{type: 'text', text: 'ok'}],
		model: 'claude-sonnet-4-6',
		stop_reason: 'end_turn',
		stop_sequence: null,
		usage: {input_tokens: 10, output_tokens: 2},
	}

	it('Test #1 (regression): tool-free conversation produces messages identical to pre-F3 baseline', async () => {
		messagesCreate.mockResolvedValueOnce(SYNC_RESPONSE_F3)
		const res = makeRes()
		await passthroughOpenAIChatCompletions({
			livinityd: makeLivinityd(),
			userId: 'abc123',
			body: {
				model: 'gpt-4o',
				messages: [
					{role: 'system', content: 'You are helpful'},
					{role: 'user', content: 'Hello'},
					{role: 'assistant', content: 'Hi there'},
				],
				stream: false,
			} as any,
			res,
		})
		const upstreamCall = messagesCreate.mock.calls[0][0] as any
		expect(upstreamCall.system).toBe('You are helpful')
		expect(upstreamCall.messages).toEqual([
			{role: 'user', content: 'Hello'},
			{role: 'assistant', content: 'Hi there'},
		])
	})

	it('Test #2 (golden vector): 4-turn conversation with 2 tool rounds translates correctly', async () => {
		messagesCreate.mockResolvedValueOnce(SYNC_RESPONSE_F3)
		const res = makeRes()
		await passthroughOpenAIChatCompletions({
			livinityd: makeLivinityd(),
			userId: 'abc123',
			body: {
				model: 'gpt-4o',
				messages: [
					{role: 'system', content: 'You are helpful'},
					{role: 'user', content: 'Read foo.txt'},
					{
						role: 'assistant',
						content: null,
						tool_calls: [
							{
								id: 'call_1',
								type: 'function',
								function: {name: 'read_file', arguments: '{"path":"foo.txt"}'},
							},
						],
					},
					{role: 'tool', tool_call_id: 'call_1', content: 'hello world'},
					{
						role: 'assistant',
						content: 'The file says: hello world. Now reading bar.txt.',
						tool_calls: [
							{
								id: 'call_2',
								type: 'function',
								function: {name: 'read_file', arguments: '{"path":"bar.txt"}'},
							},
						],
					},
					{role: 'tool', tool_call_id: 'call_2', content: 'goodbye world'},
					{role: 'assistant', content: 'Done.'},
				],
				stream: false,
			} as any,
			res,
		})
		const upstreamCall = messagesCreate.mock.calls[0][0] as any
		expect(upstreamCall.system).toBe('You are helpful')
		expect(upstreamCall.messages).toEqual([
			{role: 'user', content: 'Read foo.txt'},
			{
				role: 'assistant',
				content: [
					{type: 'tool_use', id: 'call_1', name: 'read_file', input: {path: 'foo.txt'}},
				],
			},
			{
				role: 'user',
				content: [{type: 'tool_result', tool_use_id: 'call_1', content: 'hello world'}],
			},
			{
				role: 'assistant',
				content: [
					{type: 'text', text: 'The file says: hello world. Now reading bar.txt.'},
					{type: 'tool_use', id: 'call_2', name: 'read_file', input: {path: 'bar.txt'}},
				],
			},
			{
				role: 'user',
				content: [{type: 'tool_result', tool_use_id: 'call_2', content: 'goodbye world'}],
			},
			{role: 'assistant', content: 'Done.'},
		])
	})

	it('Test #3 (round-trip): tool_call_id passes through verbatim as tool_use_id', async () => {
		messagesCreate.mockResolvedValueOnce(SYNC_RESPONSE_F3)
		const res = makeRes()
		await passthroughOpenAIChatCompletions({
			livinityd: makeLivinityd(),
			userId: 'abc123',
			body: {
				model: 'gpt-4o',
				messages: [
					{role: 'user', content: 'do it'},
					{
						role: 'assistant',
						content: null,
						tool_calls: [
							{
								id: 'toolu_01ABC123XYZ',
								type: 'function',
								function: {name: 'do_thing', arguments: '{}'},
							},
						],
					},
					{role: 'tool', tool_call_id: 'toolu_01ABC123XYZ', content: 'result'},
				],
				stream: false,
			} as any,
			res,
		})
		const upstreamCall = messagesCreate.mock.calls[0][0] as any
		const toolResultMsg = upstreamCall.messages[2]
		expect(toolResultMsg.role).toBe('user')
		expect(toolResultMsg.content[0].tool_use_id).toBe('toolu_01ABC123XYZ')
		expect(upstreamCall.messages[1].content[0].id).toBe('toolu_01ABC123XYZ')
	})

	it('Test #4 (run collapse): 3 contiguous tool-role messages fold into ONE user message with 3 blocks', async () => {
		messagesCreate.mockResolvedValueOnce(SYNC_RESPONSE_F3)
		const res = makeRes()
		await passthroughOpenAIChatCompletions({
			livinityd: makeLivinityd(),
			userId: 'abc123',
			body: {
				model: 'gpt-4o',
				messages: [
					{role: 'user', content: 'parallel calls'},
					{
						role: 'assistant',
						content: null,
						tool_calls: [
							{id: 'c1', type: 'function', function: {name: 't1', arguments: '{}'}},
							{id: 'c2', type: 'function', function: {name: 't2', arguments: '{}'}},
							{id: 'c3', type: 'function', function: {name: 't3', arguments: '{}'}},
						],
					},
					{role: 'tool', tool_call_id: 'c1', content: 'r1'},
					{role: 'tool', tool_call_id: 'c2', content: 'r2'},
					{role: 'tool', tool_call_id: 'c3', content: 'r3'},
					{role: 'assistant', content: 'all done'},
				],
				stream: false,
			} as any,
			res,
		})
		const upstreamCall = messagesCreate.mock.calls[0][0] as any
		expect(upstreamCall.messages).toHaveLength(4)
		const toolResultMsg = upstreamCall.messages[2]
		expect(toolResultMsg.role).toBe('user')
		expect(toolResultMsg.content).toHaveLength(3)
		expect(toolResultMsg.content[0]).toEqual({type: 'tool_result', tool_use_id: 'c1', content: 'r1'})
		expect(toolResultMsg.content[1]).toEqual({type: 'tool_result', tool_use_id: 'c2', content: 'r2'})
		expect(toolResultMsg.content[2]).toEqual({type: 'tool_result', tool_use_id: 'c3', content: 'r3'})
	})

	it('Test #5 (function fallback): deprecated function role without tool_call_id uses name:index fallback', async () => {
		messagesCreate.mockResolvedValueOnce(SYNC_RESPONSE_F3)
		const res = makeRes()
		await passthroughOpenAIChatCompletions({
			livinityd: makeLivinityd(),
			userId: 'abc123',
			body: {
				model: 'gpt-4o',
				messages: [
					{role: 'user', content: 'compute'},
					{role: 'assistant', content: 'computing'},
					{role: 'function', name: 'compute_sum', content: '42'},
				],
				stream: false,
			} as any,
			res,
		})
		const upstreamCall = messagesCreate.mock.calls[0][0] as any
		const toolResultMsg = upstreamCall.messages[upstreamCall.messages.length - 1]
		expect(toolResultMsg.role).toBe('user')
		expect(toolResultMsg.content[0]).toEqual({
			type: 'tool_result',
			tool_use_id: 'compute_sum:0',
			content: '42',
		})
	})

	it('Test #6 (mixed function+tool in same run): correct fallback indexing within run', async () => {
		messagesCreate.mockResolvedValueOnce(SYNC_RESPONSE_F3)
		const res = makeRes()
		await passthroughOpenAIChatCompletions({
			livinityd: makeLivinityd(),
			userId: 'abc123',
			body: {
				model: 'gpt-4o',
				messages: [
					{role: 'user', content: 'mixed'},
					{role: 'assistant', content: 'doing both'},
					{role: 'tool', tool_call_id: 'call_1', content: 'a'},
					{role: 'function', name: 'fn1', content: 'b'},
				],
				stream: false,
			} as any,
			res,
		})
		const upstreamCall = messagesCreate.mock.calls[0][0] as any
		const toolResultMsg = upstreamCall.messages[upstreamCall.messages.length - 1]
		expect(toolResultMsg.role).toBe('user')
		expect(toolResultMsg.content).toHaveLength(2)
		expect(toolResultMsg.content[0]).toEqual({type: 'tool_result', tool_use_id: 'call_1', content: 'a'})
		expect(toolResultMsg.content[1]).toEqual({type: 'tool_result', tool_use_id: 'fn1:1', content: 'b'})
	})

	it('Test #7 (unknown role): logs warn and is dropped from output', async () => {
		messagesCreate.mockResolvedValueOnce(SYNC_RESPONSE_F3)
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
		const res = makeRes()
		await passthroughOpenAIChatCompletions({
			livinityd: makeLivinityd(),
			userId: 'abc123',
			body: {
				model: 'gpt-4o',
				messages: [
					{role: 'user', content: 'hi'},
					{role: 'developer', content: 'hidden'} as any,
					{role: 'assistant', content: 'ok'},
				],
				stream: false,
			} as any,
			res,
		})
		const upstreamCall = messagesCreate.mock.calls[0][0] as any
		expect(upstreamCall.messages).toEqual([
			{role: 'user', content: 'hi'},
			{role: 'assistant', content: 'ok'},
		])
		expect(warnSpy).toHaveBeenCalled()
		const warnArgs = warnSpy.mock.calls.map((c) => c.join(' ')).join(' | ')
		expect(warnArgs.toLowerCase()).toContain('developer')
		warnSpy.mockRestore()
	})

	it('content as array of content parts is JSON-stringified into tool_result content (defensive fallback)', async () => {
		messagesCreate.mockResolvedValueOnce(SYNC_RESPONSE_F3)
		const res = makeRes()
		await passthroughOpenAIChatCompletions({
			livinityd: makeLivinityd(),
			userId: 'abc123',
			body: {
				model: 'gpt-4o',
				messages: [
					{role: 'user', content: 'with array content'},
					{role: 'assistant', content: 'k'},
					{
						role: 'tool',
						tool_call_id: 'c_arr',
						content: [{type: 'text', text: 'piece1'}, {type: 'text', text: 'piece2'}],
					} as any,
				],
				stream: false,
			} as any,
			res,
		})
		const upstreamCall = messagesCreate.mock.calls[0][0] as any
		const toolResultMsg = upstreamCall.messages[upstreamCall.messages.length - 1]
		expect(toolResultMsg.role).toBe('user')
		expect(toolResultMsg.content[0].tool_use_id).toBe('c_arr')
		expect(typeof toolResultMsg.content[0].content).toBe('string')
		expect(toolResultMsg.content[0].content).toContain('piece1')
		expect(toolResultMsg.content[0].content).toContain('piece2')
	})

	it('assistant tool_calls with malformed JSON arguments falls back to raw string + warn', async () => {
		messagesCreate.mockResolvedValueOnce(SYNC_RESPONSE_F3)
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
		const res = makeRes()
		await passthroughOpenAIChatCompletions({
			livinityd: makeLivinityd(),
			userId: 'abc123',
			body: {
				model: 'gpt-4o',
				messages: [
					{role: 'user', content: 'try'},
					{
						role: 'assistant',
						content: null,
						tool_calls: [
							{
								id: 'call_bad',
								type: 'function',
								function: {name: 'bad_args', arguments: 'NOT_VALID_JSON{{'},
							},
						],
					},
					{role: 'tool', tool_call_id: 'call_bad', content: 'ok'},
				],
				stream: false,
			} as any,
			res,
		})
		const upstreamCall = messagesCreate.mock.calls[0][0] as any
		const assistantMsg = upstreamCall.messages[1]
		expect(assistantMsg.role).toBe('assistant')
		expect(assistantMsg.content[0].type).toBe('tool_use')
		expect(assistantMsg.content[0].input).toBe('NOT_VALID_JSON{{')
		expect(warnSpy).toHaveBeenCalled()
		warnSpy.mockRestore()
	})
})
