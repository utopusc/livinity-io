import assert from 'node:assert/strict'
import type {Response} from 'express'
import {createSseAdapter} from './sse-adapter.js'

class FakeResponse {
	writes: string[] = []
	writableEnded = false
	socket = {setNoDelay: () => {}}
	write(s: string) {
		this.writes.push(s)
		return true
	}
	flush() {}
	end() {
		this.writableEnded = true
	}
	setHeader() {}
	flushHeaders() {}

	asResponse(): Response {
		return this as unknown as Response
	}

	joined(): string {
		return this.writes.join('')
	}
}

async function runTests() {
	// Test 1: thinking + chunk + final_answer produces correct event order
	{
		const fake = new FakeResponse()
		const adapter = createSseAdapter({model: 'claude-sonnet-4-6', res: fake.asResponse()})
		adapter.onAgentEvent({type: 'thinking', turn: 1})
		adapter.onAgentEvent({type: 'chunk', turn: 1, data: 'Hello world.'})
		adapter.onAgentEvent({type: 'final_answer', turn: 1, data: 'Hello world.'})

		const out = fake.joined()
		// Expected order: message_start → content_block_start → ping → content_block_delta → content_block_stop → message_delta → message_stop
		const startMs = out.indexOf('event: message_start')
		const startCbs = out.indexOf('event: content_block_start')
		const startPing = out.indexOf('event: ping')
		const startDelta = out.indexOf('event: content_block_delta')
		const startCbStop = out.indexOf('event: content_block_stop')
		const startMsgDelta = out.indexOf('event: message_delta')
		const startMsStop = out.indexOf('event: message_stop')

		assert.ok(startMs >= 0, 'message_start emitted')
		assert.ok(startCbs > startMs, 'content_block_start after message_start')
		assert.ok(startPing > startCbs, 'ping after content_block_start')
		assert.ok(startDelta > startPing, 'content_block_delta after ping')
		assert.ok(startCbStop > startDelta, 'content_block_stop after content_block_delta')
		assert.ok(startMsgDelta > startCbStop, 'message_delta after content_block_stop')
		assert.ok(startMsStop > startMsgDelta, 'message_stop after message_delta')
		console.log('  PASS Test 1: event order matches Anthropic spec')
	}

	// Test 2: wire format `event: <name>\ndata: <json>\n\n` (NOT just data:-only)
	{
		const fake = new FakeResponse()
		const adapter = createSseAdapter({model: 'm', res: fake.asResponse()})
		adapter.onAgentEvent({type: 'thinking', turn: 1})
		const out = fake.joined()
		// Each chunk should have form `event: <name>\ndata: <json>\n\n`
		assert.match(out, /event: message_start\ndata: \{/)
		assert.match(out, /event: content_block_start\ndata: \{/)
		assert.match(out, /event: ping\ndata: \{/)
		// Should NOT contain data:-only chunks (no `\ndata:` without preceding `event:`)
		// Verify all data: lines have a preceding event: line
		const lines = out.split('\n')
		for (let i = 0; i < lines.length; i++) {
			if (lines[i].startsWith('data: ')) {
				assert.ok(
					i > 0 && lines[i - 1].startsWith('event: '),
					`data: line at index ${i} not preceded by event: line`,
				)
			}
		}
		console.log('  PASS Test 2: wire format event:\\ndata:\\n\\n')
	}

	// Test 3: error event produces SSE error chunk + message_stop
	{
		const fake = new FakeResponse()
		const adapter = createSseAdapter({model: 'm', res: fake.asResponse()})
		adapter.onAgentEvent({type: 'error', turn: 1, data: 'something broke'})
		const out = fake.joined()
		assert.match(out, /event: error\ndata: \{.*"something broke".*\}/)
		assert.match(out, /event: message_stop\ndata: /)
		console.log('  PASS Test 3: error event produces error chunk + message_stop')
	}

	// Test 4: output token estimation accumulates from chunks
	{
		const fake = new FakeResponse()
		let observedOutputTokens = 0
		const adapter = createSseAdapter({
			model: 'm',
			res: fake.asResponse(),
			onComplete: (n) => {
				observedOutputTokens = n
			},
		})
		adapter.onAgentEvent({type: 'thinking', turn: 1})
		// Send chunks: 4 chars and 8 chars = ceil(4/4) + ceil(8/4) = 1 + 2 = 3 tokens
		adapter.onAgentEvent({type: 'chunk', turn: 1, data: 'abcd'})
		adapter.onAgentEvent({type: 'chunk', turn: 1, data: 'efghijkl'})
		adapter.onAgentEvent({type: 'final_answer', turn: 1, data: 'final'})
		assert.equal(observedOutputTokens, 3, `expected 3 output tokens, got ${observedOutputTokens}`)
		// Verify message_delta carries the same count
		const out = fake.joined()
		assert.match(out, /"output_tokens":3/)
		console.log('  PASS Test 4: output token estimation correct')
	}

	console.log('\nAll sse-adapter.test.ts tests passed (4/4)')
}

runTests().catch((err) => {
	console.error('FAILED:', err)
	process.exit(1)
})
