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

vi.mock('@anthropic-ai/sdk', () => {
	return {
		default: vi.fn().mockImplementation((opts: any) => ({
			_ctorOpts: opts,
			messages: {
				create: messagesCreate,
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
	return {logger: {log: vi.fn()}}
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
