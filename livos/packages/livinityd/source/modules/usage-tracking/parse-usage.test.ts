/**
 * Phase 44 Plan 44-02 RED → GREEN tests for parse-usage.ts.
 *
 * Behaviour contract (from 44-02-PLAN.md <behavior>):
 *  - T1: Anthropic sync JSON → ParsedUsage with endpoint='messages'
 *  - T2: OpenAI sync JSON → ParsedUsage with endpoint='chat-completions'
 *  - T3: Anthropic SSE buffer (message_start + message_delta) → aggregate usage
 *  - T4: OpenAI SSE buffer with terminal usage chunk → ParsedUsage
 *  - T5: status 429 → throttled row regardless of body shape
 *  - T6: Malformed JSON / no usage object → null (no crash, no log spam)
 *  - T7: SSE buffer with no usage anywhere → null
 *  - T8: Anthropic SSE without message_start (only message_delta) → defensive partial
 */

import {describe, expect, test} from 'vitest'

import {parseUsageFromResponse, parseUsageFromSseBuffer} from './parse-usage.js'

describe('parse-usage Plan 44-02', () => {
	test('T1 — Anthropic sync response → endpoint=messages with both token counts', () => {
		const body = {
			id: 'msg_abc',
			type: 'message',
			role: 'assistant',
			content: [{type: 'text', text: 'hi'}],
			model: 'claude-sonnet-4-6',
			stop_reason: 'end_turn',
			stop_sequence: null,
			usage: {input_tokens: 42, output_tokens: 13},
		}
		const result = parseUsageFromResponse({
			body,
			statusCode: 200,
			urlPath: '/u/USERID/v1/messages',
		})
		expect(result).not.toBeNull()
		expect(result!.prompt_tokens).toBe(42)
		expect(result!.completion_tokens).toBe(13)
		expect(result!.model).toBe('claude-sonnet-4-6')
		expect(result!.request_id).toBe('msg_abc')
		expect(result!.endpoint).toBe('messages')
	})

	test('T2 — OpenAI sync response → endpoint=chat-completions with prompt/completion tokens', () => {
		const body = {
			id: 'chatcmpl-xyz',
			object: 'chat.completion',
			created: 1700000000,
			model: 'gpt-4',
			choices: [
				{index: 0, message: {role: 'assistant', content: 'hi'}, finish_reason: 'stop'},
			],
			usage: {prompt_tokens: 7, completion_tokens: 5, total_tokens: 12},
		}
		const result = parseUsageFromResponse({
			body,
			statusCode: 200,
			urlPath: '/u/USERID/v1/chat/completions',
		})
		expect(result).not.toBeNull()
		expect(result!.prompt_tokens).toBe(7)
		expect(result!.completion_tokens).toBe(5)
		expect(result!.model).toBe('gpt-4')
		expect(result!.request_id).toBe('chatcmpl-xyz')
		expect(result!.endpoint).toBe('chat-completions')
	})

	test('T3 — Anthropic SSE buffer (message_start + message_delta) → aggregated usage', () => {
		const sseBuffer = [
			'event: message_start',
			'data: {"type":"message_start","message":{"id":"msg_sse","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-6","stop_reason":null,"usage":{"input_tokens":20,"output_tokens":0}}}',
			'',
			'event: content_block_start',
			'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
			'',
			'event: content_block_delta',
			'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi"}}',
			'',
			'event: message_delta',
			'data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":8}}',
			'',
			'event: message_stop',
			'data: {"type":"message_stop"}',
			'',
		].join('\n')
		const result = parseUsageFromSseBuffer({sseBuffer, urlPath: '/u/USERID/v1/messages'})
		expect(result).not.toBeNull()
		expect(result!.prompt_tokens).toBe(20)
		expect(result!.completion_tokens).toBe(8)
		expect(result!.endpoint).toBe('messages')
		expect(result!.request_id).toBe('msg_sse')
		expect(result!.model).toBe('claude-sonnet-4-6')
	})

	test('T4 — OpenAI SSE buffer with terminal usage chunk → ParsedUsage', () => {
		// OpenAI SSE with stream_options.include_usage: true emits a final
		// `usage` object on the terminal chunk before [DONE]. Even though the
		// current broker doesn't emit this, the parser must handle it if a
		// future broker version does.
		const sseBuffer = [
			'data: {"id":"chatcmpl-z","object":"chat.completion.chunk","created":1700,"model":"gpt-4","choices":[{"index":0,"delta":{"role":"assistant","content":"hi"},"finish_reason":null}]}',
			'',
			'data: {"id":"chatcmpl-z","object":"chat.completion.chunk","created":1700,"model":"gpt-4","choices":[],"usage":{"prompt_tokens":3,"completion_tokens":4,"total_tokens":7}}',
			'',
			'data: [DONE]',
			'',
		].join('\n')
		const result = parseUsageFromSseBuffer({sseBuffer, urlPath: '/u/USERID/v1/chat/completions'})
		expect(result).not.toBeNull()
		expect(result!.prompt_tokens).toBe(3)
		expect(result!.completion_tokens).toBe(4)
		expect(result!.endpoint).toBe('chat-completions')
	})

	test('T5 — status 429 → throttled row regardless of body shape', () => {
		const body = {error: {type: 'rate_limit_error', message: 'cap reached'}}
		const result = parseUsageFromResponse({
			body,
			statusCode: 429,
			urlPath: '/u/USERID/v1/messages',
		})
		expect(result).not.toBeNull()
		expect(result!.prompt_tokens).toBe(0)
		expect(result!.completion_tokens).toBe(0)
		expect(result!.endpoint).toBe('429-throttled')
		expect(result!.request_id).toBeNull()
	})

	test('T6 — malformed body / no usage object → null (no crash)', () => {
		// Body is not parseable JSON
		const result1 = parseUsageFromResponse({
			body: 'not json' as unknown as object,
			statusCode: 200,
			urlPath: '/u/USERID/v1/messages',
		})
		expect(result1).toBeNull()

		// Body is JSON but has no usage key
		const result2 = parseUsageFromResponse({
			body: {whatever: 'no usage here'},
			statusCode: 200,
			urlPath: '/u/USERID/v1/messages',
		})
		expect(result2).toBeNull()

		// Body has usage but null/missing token fields
		const result3 = parseUsageFromResponse({
			body: {usage: {}, model: 'claude-sonnet-4-6'},
			statusCode: 200,
			urlPath: '/u/USERID/v1/messages',
		})
		expect(result3).toBeNull()
	})

	test('T7 — SSE buffer with no usage anywhere → null', () => {
		const sseBuffer = [
			'event: ping',
			'data: {"type":"ping"}',
			'',
			'event: content_block_delta',
			'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi"}}',
			'',
		].join('\n')
		const result = parseUsageFromSseBuffer({sseBuffer, urlPath: '/u/USERID/v1/messages'})
		expect(result).toBeNull()
	})

	test('T8 — Anthropic SSE without message_start, only message_delta with output_tokens', () => {
		// Defensive: broker may emit only the terminal chunk in some scenarios
		const sseBuffer = [
			'event: message_delta',
			'data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":15}}',
			'',
			'event: message_stop',
			'data: {"type":"message_stop"}',
			'',
		].join('\n')
		const result = parseUsageFromSseBuffer({sseBuffer, urlPath: '/u/USERID/v1/messages'})
		expect(result).not.toBeNull()
		expect(result!.prompt_tokens).toBe(0)
		expect(result!.completion_tokens).toBe(15)
		expect(result!.endpoint).toBe('messages')
	})

	test('T9 — endpoint detection: unknown URL path returns null', () => {
		// Defense-in-depth: middleware routes by /u/:userId/v1 but parser
		// should still gate on URL pattern recognition.
		const body = {
			id: 'msg_abc',
			usage: {input_tokens: 5, output_tokens: 3},
			model: 'claude-sonnet-4-6',
		}
		const result = parseUsageFromResponse({
			body,
			statusCode: 200,
			urlPath: '/some/other/path',
		})
		expect(result).toBeNull()
	})
})
