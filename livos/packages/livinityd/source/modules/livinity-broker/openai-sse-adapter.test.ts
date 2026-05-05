import assert from 'node:assert/strict'
import {createOpenAISseAdapter, writeOpenAISseChunk, OPENAI_SSE_DONE} from './openai-sse-adapter.js'
import type {AgentEvent} from '@liv/core'

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
		await adapter.onAgentEvent({type: 'chunk', data: 'Hello'} as AgentEvent)
		const chunks = parseDataChunks(getBuffer())
		assert.equal(chunks.length, 1)
		assert.equal(chunks[0]!.json.choices[0].delta.role, 'assistant', 'first chunk has delta.role')
		assert.equal(chunks[0]!.json.choices[0].delta.content, 'Hello')
		ok('Test 1: first chunk has delta.role="assistant"')
	}
	{
		const {res, getBuffer} = makeFakeRes()
		const adapter = createOpenAISseAdapter({requestedModel: 'gpt-4', res})
		await adapter.onAgentEvent({type: 'chunk', data: 'A'} as AgentEvent)
		await adapter.onAgentEvent({type: 'chunk', data: 'B'} as AgentEvent)
		const chunks = parseDataChunks(getBuffer())
		assert.equal(chunks.length, 2)
		assert.equal(chunks[1]!.json.choices[0].delta.role, undefined, 'subsequent chunk has NO role')
		assert.equal(chunks[1]!.json.choices[0].delta.content, 'B')
		ok('Test 2: subsequent chunks have only delta.content (no role)')
	}
	{
		const {res, getBuffer} = makeFakeRes()
		const adapter = createOpenAISseAdapter({requestedModel: 'gpt-4', res})
		await adapter.onAgentEvent({type: 'chunk', data: 'X'} as AgentEvent)
		await adapter.onAgentEvent({type: 'final_answer', data: 'X'} as AgentEvent)
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
		await adapter.onAgentEvent({type: 'chunk', data: 'A'} as AgentEvent)
		await adapter.onAgentEvent({type: 'chunk', data: 'B'} as AgentEvent)
		await adapter.onAgentEvent({type: 'final_answer', data: 'AB'} as AgentEvent)
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
		await adapter.onAgentEvent({type: 'final_answer', data: 'X'} as AgentEvent)
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
		await adapter.onAgentEvent({type: 'chunk', data: 'X'} as AgentEvent)
		adapter.finalize('max_turns')
		const chunks = parseDataChunks(getBuffer())
		const terminal = chunks.find((c) => c.json && c.json.choices[0].finish_reason !== null)
		assert.equal(terminal?.json.choices[0].finish_reason, 'length', 'max_turns → length')
		ok('Test 9: finalize(max_turns) → finish_reason=length')
	}
	{
		const {res, getBuffer} = makeFakeRes()
		const adapter = createOpenAISseAdapter({requestedModel: 'gpt-4', res})
		await adapter.onAgentEvent({type: 'error', data: 'boom'} as AgentEvent)
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
		await adapter.onAgentEvent({type: 'chunk', data: 'hello'} as AgentEvent)
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
		await adapter.onAgentEvent({type: 'chunk', data: 'X'} as AgentEvent)
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

	// =====================================================================
	// Phase 74 Plan 01 (F2 token-cadence) — slicing tests
	// LIV_BROKER_SLICE_BYTES default 24, LIV_BROKER_SLICE_DELAY_MS default 15
	// =====================================================================

	// Test F2-1: text shorter than SLICE_BYTES emits exactly 1 SSE frame
	{
		const {res, getBuffer} = makeFakeRes()
		const adapter = createOpenAISseAdapter({requestedModel: 'gpt-4', res})
		await adapter.onAgentEvent({type: 'chunk', data: 'hi'} as AgentEvent) // 2 bytes < 24
		const chunks = parseDataChunks(getBuffer())
		assert.equal(chunks.length, 1, `short text should emit 1 frame, got ${chunks.length}`)
		assert.equal(chunks[0]!.json.choices[0].delta.content, 'hi')
		ok('Test F2-1: text shorter than SLICE_BYTES emits 1 SSE frame')
	}

	// Test F2-2: long text slices into multiple frames (≥ ceil(textLen/sliceBytes))
	{
		const {res, getBuffer} = makeFakeRes()
		const adapter = createOpenAISseAdapter({requestedModel: 'gpt-4', res})
		const text = 'a'.repeat(200) // 200 bytes / 24 = 9 frames (ceil)
		await adapter.onAgentEvent({type: 'chunk', data: text} as AgentEvent)
		const chunks = parseDataChunks(getBuffer())
		const expected = Math.ceil(200 / 24)
		assert.ok(
			chunks.length >= expected,
			`200-byte text should emit >=${expected} frames, got ${chunks.length}`,
		)
		// Concatenation invariant: joining all delta.content equals original text
		const joined = chunks
			.filter((c) => c.json)
			.map((c) => c.json.choices[0].delta.content ?? '')
			.join('')
		assert.equal(joined, text, 'concatenated deltas equal original text')
		ok('Test F2-2: long text sliced into multiple frames; concat invariant holds')
	}

	// Test F2-3: respects inter-slice delay (~15ms × (N-1) frames)
	{
		const {res, getBuffer} = makeFakeRes()
		const adapter = createOpenAISseAdapter({requestedModel: 'gpt-4', res})
		const text = 'a'.repeat(200)
		const t0 = Date.now()
		await adapter.onAgentEvent({type: 'chunk', data: text} as AgentEvent)
		const elapsed = Date.now() - t0
		const chunks = parseDataChunks(getBuffer())
		const sliceCount = chunks.length
		// Lower bound: (sliceCount - 1) × 15ms - 5ms tolerance for scheduler jitter
		const minExpected = Math.max(0, (sliceCount - 1) * 15 - 5)
		assert.ok(
			elapsed >= minExpected,
			`elapsed ${elapsed}ms should be >= ${minExpected}ms for ${sliceCount} slices`,
		)
		// Upper bound NOT asserted — slow CI runners overshoot scheduling.
		ok(`Test F2-3: cadence delay respected (${elapsed}ms for ${sliceCount} slices)`)
	}

	// Test F2-4: UTF-8 emoji never split mid-codepoint
	{
		const {res, getBuffer} = makeFakeRes()
		const adapter = createOpenAISseAdapter({requestedModel: 'gpt-4', res})
		// 10 emoji × 4 UTF-8 bytes each = 40 bytes total.
		// '\u{1F600}' = 😀 = 4-byte UTF-8 codepoint
		const emoji = '\u{1F600}'
		const text = emoji.repeat(10) // 40 UTF-8 bytes
		await adapter.onAgentEvent({type: 'chunk', data: text} as AgentEvent)
		const chunks = parseDataChunks(getBuffer())
		assert.ok(chunks.length >= 2, `emoji text should produce >= 2 frames, got ${chunks.length}`)
		// Round-trip: each frame's content must decode cleanly (no replacement char U+FFFD)
		for (const c of chunks) {
			if (!c.json) continue
			const content = c.json.choices[0].delta.content as string | undefined
			if (typeof content !== 'string') continue
			assert.ok(
				!content.includes('�'),
				`frame content has replacement char (mid-codepoint split): ${JSON.stringify(content)}`,
			)
			// Confirm round-trip stability
			const reEncoded = Buffer.from(content, 'utf8').toString('utf8')
			assert.equal(reEncoded, content, 'utf8 round-trip stable')
		}
		// Concatenation invariant
		const joined = chunks
			.filter((c) => c.json)
			.map((c) => c.json.choices[0].delta.content ?? '')
			.join('')
		assert.equal(joined, text, 'concatenated emoji-deltas equal original text')
		ok('Test F2-4: emoji text never split mid-codepoint; concat == original')
	}

	// Test F2-5: final_answer event passes through unsliced (terminal chunk + [DONE])
	{
		const {res, getBuffer} = makeFakeRes()
		const adapter = createOpenAISseAdapter({requestedModel: 'gpt-4', res})
		// Send a small chunk first, then final_answer, then finalize.
		await adapter.onAgentEvent({type: 'chunk', data: 'x'} as AgentEvent)
		await adapter.onAgentEvent({type: 'final_answer', data: 'unused'} as AgentEvent)
		adapter.finalize()
		const chunks = parseDataChunks(getBuffer())
		// Expect: 1 content chunk (from 'x') + 1 terminal chunk + 1 [DONE] = 3 entries
		assert.equal(
			chunks.length,
			3,
			`final_answer must NOT slice; expected 3 chunks total, got ${chunks.length}`,
		)
		const terminals = chunks.filter((c) => c.json && c.json.choices[0].finish_reason !== null)
		assert.equal(terminals.length, 1, 'exactly 1 terminal chunk')
		assert.equal(chunks[chunks.length - 1]!.raw, 'data: [DONE]')
		ok('Test F2-5: final_answer event passes through unsliced')
	}

	// Test F2-6: env override LIV_BROKER_SLICE_DELAY_MS=0 → no enforced delay.
	// Env is read at module load (per plan recommendation D-06), so this test
	// uses a sibling tsx fixture script run as a child process with the env
	// var set. The child prints `ELAPSED=<ms>`; we assert <100ms.
	{
		const {spawnSync} = await import('node:child_process')
		const path = await import('node:path')
		const url = await import('node:url')
		const here = path.dirname(url.fileURLToPath(import.meta.url))
		const fixture = path.join(here, '__sse-slice-env-fixture-openai.ts')
		const child = spawnSync(
			'pnpm',
			['exec', 'tsx', fixture],
			{
				cwd: path.resolve(here, '../../..'), // livinityd package root
				env: {...process.env, LIV_BROKER_SLICE_DELAY_MS: '0'},
				encoding: 'utf8',
				shell: true,
			},
		)
		const stdout = child.stdout ?? ''
		const stderr = child.stderr ?? ''
		const m = /ELAPSED=(\d+)/.exec(stdout)
		assert.ok(
			m,
			`child stdout missing ELAPSED= line; stdout=${JSON.stringify(stdout)}; stderr=${JSON.stringify(stderr)}`,
		)
		const elapsed = Number.parseInt(m![1]!, 10)
		assert.ok(
			elapsed < 100,
			`with LIV_BROKER_SLICE_DELAY_MS=0, child elapsed should be <100ms, got ${elapsed}ms`,
		)
		ok(`Test F2-6: env override LIV_BROKER_SLICE_DELAY_MS=0 emits with no delay (${elapsed}ms)`)
	}

	console.log('\nAll openai-sse-adapter.test.ts tests passed (18/18)')
}

runTests().catch((err) => {
	console.error('FAILED:', err)
	process.exit(1)
})
