import assert from 'node:assert/strict'
import {createOpenAISseAdapter, writeOpenAISseChunk, OPENAI_SSE_DONE} from './openai-sse-adapter.js'
import type {AgentEvent} from '@nexus/core'

function ok(label: string) {
	console.log(`  PASS ${label}`)
}

/** Fake express Response that captures writes into a buffer. */
function makeFakeRes() {
	let buf = ''
	const res: any = {
		writableEnded: false,
		write(chunk: string) {
			buf += chunk
			return true
		},
		flush() {},
	}
	return {res, getBuffer: () => buf}
}

function parseDataChunks(buffer: string): Array<{raw: string; json: any | null}> {
	// Each SSE chunk is `data: <payload>\n\n`. Split on \n\n, ignore empty trailing.
	const parts = buffer.split('\n\n').filter((p) => p.trim().length > 0)
	return parts.map((p) => {
		const stripped = p.startsWith('data: ') ? p.slice(6) : p
		if (stripped === '[DONE]') return {raw: p, json: null}
		try {
			return {raw: p, json: JSON.parse(stripped)}
		} catch {
			return {raw: p, json: null}
		}
	})
}

async function runTests() {
	// --- writeOpenAISseChunk format ---
	{
		const {res, getBuffer} = makeFakeRes()
		writeOpenAISseChunk(res, {
			id: 'chatcmpl-x',
			object: 'chat.completion.chunk',
			created: 1234567890,
			model: 'gpt-4',
			choices: [{index: 0, delta: {content: 'hi'}, finish_reason: null}],
		})
		const out = getBuffer()
		assert.match(out, /^data: \{/, 'starts with "data: {"')
		assert.match(out, /\n\n$/, 'ends with double-newline')
		assert.ok(!out.includes('event:'), 'NO event: prefix (OpenAI spec)')
		ok('Test 7: writeOpenAISseChunk format = data: <json>\\n\\n (no event:)')
	}
	{
		assert.equal(OPENAI_SSE_DONE, 'data: [DONE]\n\n', 'OPENAI_SSE_DONE byte-identical to spec')
		ok('Test 4 (constant): OPENAI_SSE_DONE = "data: [DONE]\\n\\n"')
	}

	// --- adapter behavior ---
	{
		const {res, getBuffer} = makeFakeRes()
		const adapter = createOpenAISseAdapter({requestedModel: 'gpt-4', res})
		adapter.onAgentEvent({type: 'chunk', data: 'Hello'} as AgentEvent)
		const chunks = parseDataChunks(getBuffer())
		assert.equal(chunks.length, 1)
		assert.equal(chunks[0]!.json.choices[0].delta.role, 'assistant', 'first chunk has delta.role')
		assert.equal(chunks[0]!.json.choices[0].delta.content, 'Hello')
		ok('Test 1: first chunk has delta.role="assistant"')
	}
	{
		const {res, getBuffer} = makeFakeRes()
		const adapter = createOpenAISseAdapter({requestedModel: 'gpt-4', res})
		adapter.onAgentEvent({type: 'chunk', data: 'A'} as AgentEvent)
		adapter.onAgentEvent({type: 'chunk', data: 'B'} as AgentEvent)
		const chunks = parseDataChunks(getBuffer())
		assert.equal(chunks.length, 2)
		assert.equal(chunks[1]!.json.choices[0].delta.role, undefined, 'subsequent chunk has NO role')
		assert.equal(chunks[1]!.json.choices[0].delta.content, 'B')
		ok('Test 2: subsequent chunks have only delta.content (no role)')
	}
	{
		const {res, getBuffer} = makeFakeRes()
		const adapter = createOpenAISseAdapter({requestedModel: 'gpt-4', res})
		adapter.onAgentEvent({type: 'chunk', data: 'X'} as AgentEvent)
		adapter.onAgentEvent({type: 'final_answer', data: 'X'} as AgentEvent)
		// v29.4 Phase 45 Plan 04: [DONE] now emitted by finalize() (deferred from final_answer).
		adapter.finalize()
		const chunks = parseDataChunks(getBuffer())
		// Expect: 1 content chunk + 1 terminal chunk + DONE sentinel = 3 entries
		assert.equal(chunks.length, 3)
		const terminal = chunks[1]!
		assert.deepEqual(terminal.json.choices[0].delta, {}, 'terminal delta is empty')
		assert.equal(terminal.json.choices[0].finish_reason, 'stop')
		assert.equal(chunks[2]!.json, null, 'last entry is [DONE]')
		assert.equal(chunks[2]!.raw, 'data: [DONE]')
		ok('Test 3 + 4: terminal chunk + [DONE] terminator')
	}
	{
		const {res, getBuffer} = makeFakeRes()
		const adapter = createOpenAISseAdapter({requestedModel: 'gpt-4', res})
		adapter.onAgentEvent({type: 'chunk', data: 'A'} as AgentEvent)
		adapter.onAgentEvent({type: 'chunk', data: 'B'} as AgentEvent)
		adapter.onAgentEvent({type: 'final_answer', data: 'AB'} as AgentEvent)
		const chunks = parseDataChunks(getBuffer())
		const ids = chunks.filter((c) => c.json).map((c) => c.json.id)
		const createds = chunks.filter((c) => c.json).map((c) => c.json.created)
		const objects = chunks.filter((c) => c.json).map((c) => c.json.object)
		assert.equal(new Set(ids).size, 1, 'all chunks share same id')
		assert.equal(new Set(createds).size, 1, 'all chunks share same created')
		assert.ok(objects.every((o) => o === 'chat.completion.chunk'), 'all object="chat.completion.chunk"')
		ok('Test 5: all chunks share id+created, object="chat.completion.chunk"')
	}
	{
		const {res, getBuffer} = makeFakeRes()
		const adapter = createOpenAISseAdapter({requestedModel: 'gpt-4', res})
		adapter.onAgentEvent({type: 'final_answer', data: 'X'} as AgentEvent)
		const buf = getBuffer()
		assert.ok(!buf.includes('event:'), 'NO event: prefix anywhere')
		ok('Test 6: NO event: prefix in any output')
	}
	{
		const {res, getBuffer} = makeFakeRes()
		const adapter = createOpenAISseAdapter({requestedModel: 'gpt-4', res})
		// Degenerate case: never received any chunks, finalize from finally block
		adapter.finalize()
		const chunks = parseDataChunks(getBuffer())
		// Expect: empty role chunk + terminal chunk + DONE = 3 entries
		assert.equal(chunks.length, 3)
		assert.equal(chunks[0]!.json.choices[0].delta.role, 'assistant')
		assert.equal(chunks[1]!.json.choices[0].finish_reason, 'stop')
		assert.equal(chunks[2]!.raw, 'data: [DONE]')
		ok('Test 8: finalize() with no prior events writes role+terminal+[DONE]')
	}
	{
		const {res, getBuffer} = makeFakeRes()
		const adapter = createOpenAISseAdapter({requestedModel: 'gpt-4', res})
		adapter.onAgentEvent({type: 'chunk', data: 'X'} as AgentEvent)
		adapter.finalize('max_turns')
		const chunks = parseDataChunks(getBuffer())
		const terminal = chunks.find((c) => c.json && c.json.choices[0].finish_reason !== null)
		assert.equal(terminal?.json.choices[0].finish_reason, 'length', 'max_turns → length')
		ok('Test 9: finalize(max_turns) → finish_reason=length')
	}
	{
		const {res, getBuffer} = makeFakeRes()
		const adapter = createOpenAISseAdapter({requestedModel: 'gpt-4', res})
		adapter.onAgentEvent({type: 'error', data: 'boom'} as AgentEvent)
		// v29.4 Phase 45 Plan 04: [DONE] now emitted by finalize() (deferred from error).
		adapter.finalize()
		const buf = getBuffer()
		assert.ok(buf.includes('data: [DONE]'), 'error path writes [DONE] terminator')
		ok('Test 10: error event still writes [DONE] (no SDK hang)')
	}

	// Test 11 — FR-CF-04: terminal chunk carries usage{prompt,completion,total} BEFORE [DONE]
	// (verifies wire-format compliance per OpenAI streaming spec + pitfall B-13 wire-order).
	{
		const {res, getBuffer} = makeFakeRes()
		const adapter = createOpenAISseAdapter({requestedModel: 'gpt-4', res})
		adapter.onAgentEvent({type: 'chunk', data: 'hello'} as AgentEvent)
		adapter.finalize('complete', {prompt_tokens: 7, completion_tokens: 3, total_tokens: 10})
		const buf = getBuffer()
		const chunks = parseDataChunks(buf)
		// Find the terminal chunk (the one with non-null finish_reason)
		const terminal = chunks.find((c) => c.json && c.json.choices[0].finish_reason !== null)
		assert.ok(terminal, 'terminal chunk present')
		assert.deepEqual(
			terminal!.json.usage,
			{prompt_tokens: 7, completion_tokens: 3, total_tokens: 10},
			'usage{prompt,completion,total} on terminal chunk',
		)
		// Wire-order check (B-13 mitigation): usage chunk MUST come BEFORE [DONE]
		const usageIdx = buf.indexOf('"usage"')
		const doneIdx = buf.indexOf('[DONE]')
		assert.ok(usageIdx !== -1, 'usage substring present in wire output')
		assert.ok(doneIdx !== -1, '[DONE] substring present in wire output')
		assert.ok(usageIdx < doneIdx, 'usage chunk emitted strictly BEFORE [DONE]')
		ok('Test 11: terminal chunk carries usage{prompt,completion,total} BEFORE [DONE]')
	}

	// Test 12 — FR-CF-04: degenerate zero-token usage is still PRESENT (spec compliance)
	{
		const {res, getBuffer} = makeFakeRes()
		const adapter = createOpenAISseAdapter({requestedModel: 'gpt-4', res})
		adapter.onAgentEvent({type: 'chunk', data: 'X'} as AgentEvent)
		adapter.finalize('complete', {prompt_tokens: 0, completion_tokens: 0, total_tokens: 0})
		const chunks = parseDataChunks(getBuffer())
		const terminal = chunks.find((c) => c.json && c.json.choices[0].finish_reason !== null)
		assert.ok(terminal, 'terminal chunk present')
		assert.deepEqual(
			terminal!.json.usage,
			{prompt_tokens: 0, completion_tokens: 0, total_tokens: 0},
			'usage object PRESENT with zero values (spec-compliant degenerate)',
		)
		ok('Test 12: degenerate zero-token usage still attached to terminal chunk')
	}

	console.log('\nAll openai-sse-adapter.test.ts tests passed (12/12)')
}

runTests().catch((err) => {
	console.error('FAILED:', err)
	process.exit(1)
})
