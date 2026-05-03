/**
 * Phase 61 Plan 01 Wave 0 — RED tests for AnthropicProvider (concrete BrokerProvider).
 *
 * Asserts:
 *   - request() uses .withResponse() (NOT bare .then()) so upstream Response
 *     headers are reachable for Phase 61 Wave 4 rate-limit forwarding.
 *   - streamRequest() also uses .withResponse() and returns
 *     {stream, upstreamHeaders} where the headers are populated BEFORE
 *     the stream's first iteration (Pitfall R5 / R9 mitigation).
 *   - translateUsage() maps Anthropic `usage.input_tokens` / `output_tokens`
 *     to the canonical UsageRecord shape.
 *   - translateUsage() handles missing usage gracefully (all zeros).
 *
 * The @anthropic-ai/sdk default export is mocked via vi.mock — the test
 * NEVER makes real network calls (Threat T-57-02 mitigation pattern,
 * inherited from passthrough-handler.test.ts).
 *
 * RED until Plan 01 Task 2 lands `providers/anthropic.ts`.
 */
import {describe, it, expect, vi, beforeEach} from 'vitest'

const mockCreate = vi.fn()
const mockWithResponse = vi.fn()

vi.mock('@anthropic-ai/sdk', () => {
	return {
		default: class Anthropic {
			_ctorOpts: unknown
			messages: {create: (...args: unknown[]) => {withResponse: () => unknown}}
			constructor(opts: unknown) {
				this._ctorOpts = opts
				this.messages = {
					create: (...args: unknown[]) => {
						mockCreate(...args)
						return {withResponse: () => mockWithResponse()}
					},
				}
			}
		},
	}
})

import {AnthropicProvider} from '../anthropic.js'

beforeEach(() => {
	mockCreate.mockReset()
	mockWithResponse.mockReset()
})

describe('Phase 61 Plan 01 Wave 0 — AnthropicProvider.request (FR-BROKER-D2-01)', () => {
	it('uses .withResponse() and returns {raw, upstreamHeaders} with Headers populated', async () => {
		const fakeHeaders = new Headers({
			'anthropic-ratelimit-requests-remaining': '59',
		})
		mockWithResponse.mockResolvedValue({
			data: {content: [], usage: {input_tokens: 5, output_tokens: 7}},
			response: {headers: fakeHeaders},
		})

		const p = new AnthropicProvider()
		const result = await p.request(
			{
				model: 'claude-sonnet-4-6',
				max_tokens: 100,
				messages: [{role: 'user', content: 'hi'}],
			},
			{authToken: 'sk-ant-oat01-FIXTURE-TOKEN'},
		)

		expect(result.upstreamHeaders.get('anthropic-ratelimit-requests-remaining')).toBe('59')
		// Round-trips raw body verbatim (provider does not re-shape Anthropic JSON).
		expect((result.raw as {usage: {input_tokens: number}}).usage.input_tokens).toBe(5)
		// Asserts .withResponse() seam — NOT bare messages.create().then(...).
		expect(mockWithResponse).toHaveBeenCalledTimes(1)
		expect(mockCreate).toHaveBeenCalledTimes(1)
		// Confirms stream:false dispatch (no SSE on sync path).
		expect((mockCreate.mock.calls[0]?.[0] as {stream?: boolean}).stream).toBe(false)
	})
})

describe('Phase 61 Plan 01 Wave 0 — AnthropicProvider.streamRequest (FR-BROKER-D2-01)', () => {
	it('returns {stream, upstreamHeaders} with headers populated BEFORE iteration begins (R5/R9)', async () => {
		async function* fakeStream() {
			yield {type: 'message_start'}
			yield {type: 'message_stop'}
		}
		const fakeHeaders = new Headers({
			'anthropic-ratelimit-tokens-remaining': '149984',
		})
		mockWithResponse.mockResolvedValue({
			data: fakeStream(),
			response: {headers: fakeHeaders},
		})

		const p = new AnthropicProvider()
		const result = await p.streamRequest(
			{
				model: 'claude-sonnet-4-6',
				max_tokens: 100,
				messages: [{role: 'user', content: 'hi'}],
			},
			{authToken: 'sk-ant-oat01-FIXTURE-TOKEN'},
		)

		// Headers MUST be readable before stream iteration — Wave 4 needs to
		// forward them via res.setHeader() BEFORE res.flushHeaders() (Pitfall 1).
		expect(result.upstreamHeaders.get('anthropic-ratelimit-tokens-remaining')).toBe('149984')

		const events: Array<{type: string}> = []
		for await (const e of result.stream) events.push(e as {type: string})
		expect(events).toHaveLength(2)
		expect(events[0]?.type).toBe('message_start')
		expect(events[1]?.type).toBe('message_stop')

		expect(mockWithResponse).toHaveBeenCalledTimes(1)
		expect((mockCreate.mock.calls[0]?.[0] as {stream?: boolean}).stream).toBe(true)
	})
})

describe('Phase 61 Plan 01 Wave 0 — AnthropicProvider.translateUsage (FR-BROKER-D2-01)', () => {
	it('maps input_tokens/output_tokens to canonical UsageRecord', () => {
		const p = new AnthropicProvider()
		const out = p.translateUsage({
			raw: {usage: {input_tokens: 42, output_tokens: 9}},
			upstreamHeaders: new Headers(),
		})
		expect(out).toEqual({promptTokens: 42, completionTokens: 9, totalTokens: 51})
	})

	it('handles missing usage gracefully (all zeros)', () => {
		const p = new AnthropicProvider()
		const out = p.translateUsage({
			raw: {},
			upstreamHeaders: new Headers(),
		})
		expect(out).toEqual({promptTokens: 0, completionTokens: 0, totalTokens: 0})
	})

	it('handles partial usage (only input_tokens) gracefully', () => {
		const p = new AnthropicProvider()
		const out = p.translateUsage({
			raw: {usage: {input_tokens: 10}},
			upstreamHeaders: new Headers(),
		})
		expect(out).toEqual({promptTokens: 10, completionTokens: 0, totalTokens: 10})
	})
})
