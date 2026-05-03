import {describe, expect, it} from 'vitest'
import type {Response} from 'express'
import {
	createAnthropicToOpenAIStreamTranslator,
	randomChatCmplId,
	mapStopReason,
} from './openai-stream-translator.js'

/**
 * Phase 58 Wave 1 — TDD RED tests for openai-stream-translator.
 *
 * These tests describe the expected translator behavior. They are written
 * BEFORE the implementation exists (TDD RED phase). Task 2 implements
 * openai-stream-translator.ts to make every assertion below GREEN.
 *
 * Coverage:
 *   - chatcmpl id format + collision-resistance
 *   - mapStopReason — all 8 mappings + defensive default
 *   - 1:1 delta translation (FR-BROKER-C2-01)
 *   - cumulative output_tokens (FR-BROKER-C2-02 — Anthropic Warning)
 *   - usage on final chunk only (FR-BROKER-C2-02)
 *   - chatcmpl id regex on every emitted chunk (FR-BROKER-C2-03)
 *   - ping events dropped
 *   - thinking_delta + signature_delta dropped
 *   - finalize() idempotency
 *   - role chunk emission semantics
 *   - id stability across all chunks of one stream
 *   - text_delta reads from event.delta.text (NOT event.text — RESEARCH gotcha)
 */

/** Mock Express Response that captures all res.write calls into an array. */
function makeMockRes(): {
	res: Response
	writes: string[]
} {
	const writes: string[] = []
	let ended = false
	const res = {
		write(chunk: string) {
			writes.push(chunk)
			return true
		},
		end() {
			ended = true
		},
		get writableEnded() {
			return ended
		},
		setHeader() {
			return res
		},
		flushHeaders() {},
		flush() {},
		status() {
			return res
		},
	} as unknown as Response
	return {res, writes}
}

/** Parse all `data: <json>` SSE chunks (excluding `data: [DONE]`) from captured writes. */
function parseChunks(writes: string[]): any[] {
	const text = writes.join('')
	const lines = text
		.split('\n\n')
		.filter((s) => s.startsWith('data: ') && s !== 'data: [DONE]' && s.length > 'data: '.length)
	return lines.map((l) => JSON.parse(l.slice('data: '.length)))
}

function hasDoneTerminator(writes: string[]): boolean {
	return writes.join('').includes('data: [DONE]\n\n')
}

describe('randomChatCmplId', () => {
	it('returns string matching ^chatcmpl-[A-Za-z0-9]{29}$', () => {
		const id = randomChatCmplId()
		expect(id).toMatch(/^chatcmpl-[A-Za-z0-9]{29}$/)
	})

	it('produces 100 distinct ids in 100 consecutive calls', () => {
		const ids = new Set<string>()
		for (let i = 0; i < 100; i++) ids.add(randomChatCmplId())
		expect(ids.size).toBe(100)
	})

	it('id is exactly 38 characters (chatcmpl- + 29)', () => {
		expect(randomChatCmplId()).toHaveLength(38)
	})
})

describe('mapStopReason', () => {
	it('maps end_turn → stop', () => {
		expect(mapStopReason('end_turn')).toBe('stop')
	})
	it('maps max_tokens → length', () => {
		expect(mapStopReason('max_tokens')).toBe('length')
	})
	it('maps stop_sequence → stop', () => {
		expect(mapStopReason('stop_sequence')).toBe('stop')
	})
	it('maps tool_use → tool_calls', () => {
		expect(mapStopReason('tool_use')).toBe('tool_calls')
	})
	it('maps refusal → content_filter', () => {
		expect(mapStopReason('refusal')).toBe('content_filter')
	})
	it('maps model_context_window_exceeded → length', () => {
		expect(mapStopReason('model_context_window_exceeded')).toBe('length')
	})
	it('maps pause_turn → stop', () => {
		expect(mapStopReason('pause_turn')).toBe('stop')
	})
	it('maps null → stop', () => {
		expect(mapStopReason(null)).toBe('stop')
	})
	it('maps unknown values → stop (defensive default)', () => {
		expect(mapStopReason('unknown_future_value' as any)).toBe('stop')
	})
})

describe('createAnthropicToOpenAIStreamTranslator — 1:1 delta translation (FR-BROKER-C2-01)', () => {
	it('emits role chunk + 2 content chunks + 1 final chunk + [DONE] for a 2-delta stream', () => {
		const m = makeMockRes()
		const t = createAnthropicToOpenAIStreamTranslator({requestedModel: 'sonnet', res: m.res})

		t.onAnthropicEvent({
			type: 'message_start',
			message: {
				id: 'msg',
				type: 'message',
				role: 'assistant',
				content: [],
				model: 'claude-sonnet-4-6',
				stop_reason: null,
				stop_sequence: null,
				usage: {input_tokens: 25, output_tokens: 1},
			},
		} as any)
		t.onAnthropicEvent({type: 'content_block_start', index: 0, content_block: {type: 'text', text: ''}} as any)
		t.onAnthropicEvent({
			type: 'content_block_delta',
			index: 0,
			delta: {type: 'text_delta', text: 'Hello'},
		} as any)
		t.onAnthropicEvent({
			type: 'content_block_delta',
			index: 0,
			delta: {type: 'text_delta', text: ' world'},
		} as any)
		t.onAnthropicEvent({type: 'content_block_stop', index: 0} as any)
		t.onAnthropicEvent({
			type: 'message_delta',
			delta: {stop_reason: 'end_turn', stop_sequence: null},
			usage: {output_tokens: 2},
		} as any)
		t.onAnthropicEvent({type: 'message_stop'} as any)

		const chunks = parseChunks(m.writes)
		expect(chunks.length).toBe(4) // role + 2 content + final

		// Chunk 0: role only
		expect(chunks[0].choices[0].delta.role).toBe('assistant')
		expect(chunks[0].choices[0].finish_reason).toBeNull()

		// Chunks 1 & 2: content
		expect(chunks[1].choices[0].delta.content).toBe('Hello')
		expect(chunks[2].choices[0].delta.content).toBe(' world')
		expect(chunks[1].choices[0].finish_reason).toBeNull()

		// Chunk 3: final
		expect(chunks[3].choices[0].delta).toEqual({})
		expect(chunks[3].choices[0].finish_reason).toBe('stop')
		expect(chunks[3].usage).toEqual({prompt_tokens: 25, completion_tokens: 2, total_tokens: 27})

		// Terminator
		expect(hasDoneTerminator(m.writes)).toBe(true)

		// Wire order: usage chunk BEFORE [DONE]
		const lastDataIdx = m.writes.findIndex((w) => w.includes('data: [DONE]'))
		const usageChunkIdx = m.writes.findIndex((w) => w.includes('"usage"'))
		expect(usageChunkIdx).toBeGreaterThan(-1)
		expect(usageChunkIdx).toBeLessThan(lastDataIdx)
	})

	it('all chunks share the same id, same created, same model', () => {
		const m = makeMockRes()
		const t = createAnthropicToOpenAIStreamTranslator({requestedModel: 'opus', res: m.res})
		t.onAnthropicEvent({
			type: 'message_start',
			message: {id: 'msg', usage: {input_tokens: 1, output_tokens: 0}} as any,
		} as any)
		t.onAnthropicEvent({
			type: 'content_block_delta',
			index: 0,
			delta: {type: 'text_delta', text: 'A'},
		} as any)
		t.onAnthropicEvent({
			type: 'content_block_delta',
			index: 0,
			delta: {type: 'text_delta', text: 'B'},
		} as any)
		t.onAnthropicEvent({
			type: 'message_delta',
			delta: {stop_reason: 'end_turn', stop_sequence: null},
			usage: {output_tokens: 1},
		} as any)
		t.onAnthropicEvent({type: 'message_stop'} as any)

		const chunks = parseChunks(m.writes)
		const ids = new Set(chunks.map((c) => c.id))
		const createds = new Set(chunks.map((c) => c.created))
		const models = new Set(chunks.map((c) => c.model))
		expect(ids.size).toBe(1)
		expect(createds.size).toBe(1)
		expect(models.size).toBe(1)
		expect(Array.from(ids)[0]).toMatch(/^chatcmpl-[A-Za-z0-9]{29}$/)
		expect(Array.from(models)[0]).toBe('opus') // echoes caller's requestedModel, NOT resolved Claude
		for (const c of chunks) expect(c.object).toBe('chat.completion.chunk')
	})

	it('text_delta reads from event.delta.text (not event.text)', () => {
		const m = makeMockRes()
		const t = createAnthropicToOpenAIStreamTranslator({requestedModel: 'x', res: m.res})
		t.onAnthropicEvent({
			type: 'message_start',
			message: {id: 'msg', usage: {input_tokens: 1, output_tokens: 0}} as any,
		} as any)
		t.onAnthropicEvent({
			type: 'content_block_delta',
			index: 0,
			delta: {type: 'text_delta', text: 'X'},
		} as any)
		t.finalize()

		const chunks = parseChunks(m.writes)
		const contentChunk = chunks.find((c) => c.choices[0].delta?.content === 'X')
		expect(contentChunk).toBeTruthy()
	})
})

describe('CUMULATIVE output_tokens behavior (FR-BROKER-C2-02 — Anthropic Warning)', () => {
	it('translator OVERWRITES output_tokens on each message_delta — never sums', () => {
		const m = makeMockRes()
		const t = createAnthropicToOpenAIStreamTranslator({requestedModel: 'sonnet', res: m.res})

		t.onAnthropicEvent({
			type: 'message_start',
			message: {id: 'msg', usage: {input_tokens: 10, output_tokens: 0}} as any,
		} as any)
		t.onAnthropicEvent({
			type: 'content_block_delta',
			index: 0,
			delta: {type: 'text_delta', text: 'a'},
		} as any)
		// Cumulative reports: 5, then 12, then 20 — final must be 20, not 5+12+20=37
		t.onAnthropicEvent({
			type: 'message_delta',
			delta: {stop_reason: null, stop_sequence: null},
			usage: {output_tokens: 5},
		} as any)
		t.onAnthropicEvent({
			type: 'message_delta',
			delta: {stop_reason: null, stop_sequence: null},
			usage: {output_tokens: 12},
		} as any)
		t.onAnthropicEvent({
			type: 'message_delta',
			delta: {stop_reason: 'end_turn', stop_sequence: null},
			usage: {output_tokens: 20},
		} as any)
		t.onAnthropicEvent({type: 'message_stop'} as any)

		const chunks = parseChunks(m.writes)
		const finalChunk = chunks[chunks.length - 1]
		expect(finalChunk.usage.completion_tokens).toBe(20)
		expect(finalChunk.usage.completion_tokens).not.toBe(37) // would be sum
		expect(finalChunk.usage.total_tokens).toBe(30) // 10 + 20
	})
})

describe('usage on final chunk only', () => {
	it('non-final chunks have no usage field', () => {
		const m = makeMockRes()
		const t = createAnthropicToOpenAIStreamTranslator({requestedModel: 'x', res: m.res})
		t.onAnthropicEvent({
			type: 'message_start',
			message: {id: 'msg', usage: {input_tokens: 5, output_tokens: 0}} as any,
		} as any)
		t.onAnthropicEvent({
			type: 'content_block_delta',
			index: 0,
			delta: {type: 'text_delta', text: 'a'},
		} as any)
		t.onAnthropicEvent({
			type: 'content_block_delta',
			index: 0,
			delta: {type: 'text_delta', text: 'b'},
		} as any)
		t.onAnthropicEvent({
			type: 'message_delta',
			delta: {stop_reason: 'end_turn', stop_sequence: null},
			usage: {output_tokens: 2},
		} as any)
		t.onAnthropicEvent({type: 'message_stop'} as any)

		const chunks = parseChunks(m.writes)
		// Only the LAST chunk has usage
		for (let i = 0; i < chunks.length - 1; i++) {
			expect(chunks[i].usage).toBeUndefined()
		}
		expect(chunks[chunks.length - 1].usage).toEqual({
			prompt_tokens: 5,
			completion_tokens: 2,
			total_tokens: 7,
		})
	})
})

describe('ping events dropped', () => {
	it('ping between deltas produces no extra chunks', () => {
		const m = makeMockRes()
		const t = createAnthropicToOpenAIStreamTranslator({requestedModel: 'x', res: m.res})
		t.onAnthropicEvent({
			type: 'message_start',
			message: {id: 'msg', usage: {input_tokens: 1, output_tokens: 0}} as any,
		} as any)
		t.onAnthropicEvent({
			type: 'content_block_delta',
			index: 0,
			delta: {type: 'text_delta', text: 'a'},
		} as any)
		t.onAnthropicEvent({type: 'ping'} as any)
		t.onAnthropicEvent({type: 'ping'} as any)
		t.onAnthropicEvent({
			type: 'content_block_delta',
			index: 0,
			delta: {type: 'text_delta', text: 'b'},
		} as any)
		t.finalize()

		const contentChunks = parseChunks(m.writes).filter(
			(c) => typeof c.choices[0].delta.content === 'string' && c.choices[0].delta.content !== '',
		)
		expect(contentChunks).toHaveLength(2)
	})
})

describe('thinking_delta and signature_delta dropped', () => {
	it('thinking_delta produces no chunk', () => {
		const m = makeMockRes()
		const t = createAnthropicToOpenAIStreamTranslator({requestedModel: 'x', res: m.res})
		t.onAnthropicEvent({
			type: 'message_start',
			message: {id: 'msg', usage: {input_tokens: 1, output_tokens: 0}} as any,
		} as any)
		t.onAnthropicEvent({
			type: 'content_block_delta',
			index: 0,
			delta: {type: 'thinking_delta', thinking: 'reasoning...'},
		} as any)
		t.finalize()

		const chunks = parseChunks(m.writes)
		// No emitted content chunk should contain the thinking text
		for (const c of chunks) {
			if (c.choices[0].delta.content !== undefined) {
				expect(c.choices[0].delta.content).not.toContain('reasoning')
			}
		}
	})

	it('signature_delta produces no chunk', () => {
		const m = makeMockRes()
		const t = createAnthropicToOpenAIStreamTranslator({requestedModel: 'x', res: m.res})
		t.onAnthropicEvent({
			type: 'message_start',
			message: {id: 'msg', usage: {input_tokens: 1, output_tokens: 0}} as any,
		} as any)
		t.onAnthropicEvent({
			type: 'content_block_delta',
			index: 0,
			delta: {type: 'signature_delta', signature: 'abc'},
		} as any)
		t.finalize()
		const chunks = parseChunks(m.writes)
		for (const c of chunks) {
			if (c.choices[0].delta.content !== undefined) {
				expect(c.choices[0].delta.content).not.toContain('abc')
			}
		}
	})
})

describe('finalize() idempotency', () => {
	it('calling finalize() twice produces only one final chunk + one [DONE]', () => {
		const m = makeMockRes()
		const t = createAnthropicToOpenAIStreamTranslator({requestedModel: 'x', res: m.res})
		t.onAnthropicEvent({
			type: 'message_start',
			message: {id: 'msg', usage: {input_tokens: 1, output_tokens: 0}} as any,
		} as any)
		t.onAnthropicEvent({
			type: 'message_delta',
			delta: {stop_reason: 'end_turn', stop_sequence: null},
			usage: {output_tokens: 1},
		} as any)
		t.finalize()
		t.finalize()

		const doneCount = (m.writes.join('').match(/data: \[DONE\]/g) ?? []).length
		expect(doneCount).toBe(1)
	})

	it('finalize() before any events still produces valid degenerate final chunk + [DONE]', () => {
		const m = makeMockRes()
		const t = createAnthropicToOpenAIStreamTranslator({requestedModel: 'x', res: m.res})
		t.finalize()

		expect(hasDoneTerminator(m.writes)).toBe(true)
		const chunks = parseChunks(m.writes)
		expect(chunks.length).toBeGreaterThanOrEqual(1)
		const last = chunks[chunks.length - 1]
		expect(last.usage).toEqual({prompt_tokens: 0, completion_tokens: 0, total_tokens: 0})
		expect(last.choices[0].finish_reason).toBe('stop')
	})
})

describe('role chunk emission', () => {
	it('first chunk always has delta.role=assistant; subsequent chunks have content but no role', () => {
		const m = makeMockRes()
		const t = createAnthropicToOpenAIStreamTranslator({requestedModel: 'x', res: m.res})
		t.onAnthropicEvent({
			type: 'message_start',
			message: {id: 'msg', usage: {input_tokens: 1, output_tokens: 0}} as any,
		} as any)
		t.onAnthropicEvent({
			type: 'content_block_delta',
			index: 0,
			delta: {type: 'text_delta', text: 'X'},
		} as any)
		t.onAnthropicEvent({
			type: 'content_block_delta',
			index: 0,
			delta: {type: 'text_delta', text: 'Y'},
		} as any)
		t.finalize()

		const chunks = parseChunks(m.writes)
		// Exactly one chunk carries role='assistant'
		const roleChunks = chunks.filter((c) => c.choices[0].delta.role === 'assistant')
		expect(roleChunks).toHaveLength(1)

		// Content chunks for X and Y should NOT carry role (role already emitted)
		const xChunk = chunks.find((c) => c.choices[0].delta.content === 'X')
		const yChunk = chunks.find((c) => c.choices[0].delta.content === 'Y')
		expect(xChunk).toBeTruthy()
		expect(yChunk).toBeTruthy()
		expect(yChunk!.choices[0].delta.role).toBeUndefined()
	})
})
