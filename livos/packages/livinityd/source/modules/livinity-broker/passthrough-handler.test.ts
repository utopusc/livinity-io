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
