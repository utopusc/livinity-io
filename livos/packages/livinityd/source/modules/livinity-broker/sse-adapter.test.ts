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

/**
 * Parse Anthropic SSE wire bytes into discrete events.
 * Each event has form: `event: <name>\ndata: <json>\n\n`.
 */
function parseAnthropicEvents(out: string): Array<{event: string; data: any}> {
	const parts = out.split('\n\n').filter((p) => p.trim().length > 0)
	const events: Array<{event: string; data: any}> = []
	for (const part of parts) {
		const lines = part.split('\n')
		let evName: string | null = null
		let dataStr: string | null = null
		for (const line of lines) {
			if (line.startsWith('event: ')) evName = line.slice(7)
			else if (line.startsWith('data: ')) dataStr = line.slice(6)
		}
		if (evName !== null && dataStr !== null) {
			let data: any = null
			try {
				data = JSON.parse(dataStr)
			} catch {
				/* leave null */
			}
			events.push({event: evName, data})
		}
	}
	return events
}

async function runTests() {
	// Test 1: thinking + chunk + final_answer produces correct event order
	{
		const fake = new FakeResponse()
		const adapter = createSseAdapter({model: 'claude-sonnet-4-6', res: fake.asResponse()})
		await adapter.onAgentEvent({type: 'thinking', turn: 1})
		await adapter.onAgentEvent({type: 'chunk', turn: 1, data: 'Hello world.'})
		await adapter.onAgentEvent({type: 'final_answer', turn: 1, data: 'Hello world.'})

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
		await adapter.onAgentEvent({type: 'thinking', turn: 1})
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
		await adapter.onAgentEvent({type: 'error', turn: 1, data: 'something broke'})
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
		await adapter.onAgentEvent({type: 'thinking', turn: 1})
		// Send chunks: 4 chars and 8 chars = ceil(4/4) + ceil(8/4) = 1 + 2 = 3 tokens
		await adapter.onAgentEvent({type: 'chunk', turn: 1, data: 'abcd'})
		await adapter.onAgentEvent({type: 'chunk', turn: 1, data: 'efghijkl'})
		await adapter.onAgentEvent({type: 'final_answer', turn: 1, data: 'final'})
		assert.equal(observedOutputTokens, 3, `expected 3 output tokens, got ${observedOutputTokens}`)
		// Verify message_delta carries the same count
		const out = fake.joined()
		assert.match(out, /"output_tokens":3/)
		console.log('  PASS Test 4: output token estimation correct')
	}

	// =====================================================================
	// Phase 74 Plan 01 (F2 token-cadence) — slicing tests for Anthropic adapter
	// =====================================================================

	// Test F2-1: text shorter than SLICE_BYTES emits exactly 1 content_block_delta
	{
		const fake = new FakeResponse()
		const adapter = createSseAdapter({model: 'm', res: fake.asResponse()})
		await adapter.onAgentEvent({type: 'thinking', turn: 1})
		await adapter.onAgentEvent({type: 'chunk', turn: 1, data: 'hi'}) // 2 bytes < 24
		const events = parseAnthropicEvents(fake.joined())
		const deltas = events.filter((e) => e.event === 'content_block_delta')
		assert.equal(deltas.length, 1, `short text should emit 1 delta, got ${deltas.length}`)
		assert.equal(deltas[0]!.data.delta.text, 'hi')
		console.log('  PASS Test F2-1: text shorter than SLICE_BYTES emits 1 content_block_delta')
	}

	// Test F2-2: long text slices into multiple content_block_delta frames
	{
		const fake = new FakeResponse()
		const adapter = createSseAdapter({model: 'm', res: fake.asResponse()})
		await adapter.onAgentEvent({type: 'thinking', turn: 1})
		const text = 'a'.repeat(200) // 200 bytes / 24 = 9 frames (ceil)
		await adapter.onAgentEvent({type: 'chunk', turn: 1, data: text})
		const events = parseAnthropicEvents(fake.joined())
		const deltas = events.filter((e) => e.event === 'content_block_delta')
		const expected = Math.ceil(200 / 24)
		assert.ok(
			deltas.length >= expected,
			`200-byte text should emit >=${expected} deltas, got ${deltas.length}`,
		)
		// Concatenation invariant: joining all delta.text equals original text
		const joined = deltas.map((d) => d.data.delta.text as string).join('')
		assert.equal(joined, text, 'concatenated delta texts equal original text')
		console.log('  PASS Test F2-2: long text sliced into multiple deltas; concat invariant holds')
	}

	// Test F2-3: respects inter-slice delay (~15ms × (N-1) frames)
	{
		const fake = new FakeResponse()
		const adapter = createSseAdapter({model: 'm', res: fake.asResponse()})
		await adapter.onAgentEvent({type: 'thinking', turn: 1})
		const text = 'a'.repeat(200)
		const t0 = Date.now()
		await adapter.onAgentEvent({type: 'chunk', turn: 1, data: text})
		const elapsed = Date.now() - t0
		const events = parseAnthropicEvents(fake.joined())
		const deltas = events.filter((e) => e.event === 'content_block_delta')
		const sliceCount = deltas.length
		const minExpected = Math.max(0, (sliceCount - 1) * 15 - 5)
		assert.ok(
			elapsed >= minExpected,
			`elapsed ${elapsed}ms should be >= ${minExpected}ms for ${sliceCount} slices`,
		)
		console.log(`  PASS Test F2-3: cadence delay respected (${elapsed}ms for ${sliceCount} slices)`)
	}

	// Test F2-4: UTF-8 emoji never split mid-codepoint
	{
		const fake = new FakeResponse()
		const adapter = createSseAdapter({model: 'm', res: fake.asResponse()})
		await adapter.onAgentEvent({type: 'thinking', turn: 1})
		const emoji = '\u{1F600}' // 😀 = 4-byte UTF-8 codepoint
		const text = emoji.repeat(10) // 40 bytes
		await adapter.onAgentEvent({type: 'chunk', turn: 1, data: text})
		const events = parseAnthropicEvents(fake.joined())
		const deltas = events.filter((e) => e.event === 'content_block_delta')
		assert.ok(deltas.length >= 2, `emoji text should produce >= 2 deltas, got ${deltas.length}`)
		// Each delta text must round-trip cleanly (no replacement char)
		for (const d of deltas) {
			const t = d.data.delta.text as string
			assert.ok(
				!t.includes('�'),
				`delta text has replacement char (mid-codepoint split): ${JSON.stringify(t)}`,
			)
			const reEncoded = Buffer.from(t, 'utf8').toString('utf8')
			assert.equal(reEncoded, t, 'utf8 round-trip stable')
		}
		const joined = deltas.map((d) => d.data.delta.text as string).join('')
		assert.equal(joined, text, 'concatenated emoji deltas equal original text')
		console.log('  PASS Test F2-4: emoji text never split mid-codepoint; concat == original')
	}

	// Test F2-5: final_answer event passes through unsliced (terminal trio)
	{
		const fake = new FakeResponse()
		const adapter = createSseAdapter({model: 'm', res: fake.asResponse()})
		await adapter.onAgentEvent({type: 'thinking', turn: 1})
		await adapter.onAgentEvent({type: 'chunk', turn: 1, data: 'x'})
		await adapter.onAgentEvent({type: 'final_answer', turn: 1, data: 'unused'})
		const events = parseAnthropicEvents(fake.joined())
		// Terminal trio: content_block_stop, message_delta, message_stop (each exactly once)
		const stops = events.filter((e) => e.event === 'content_block_stop')
		const msgDeltas = events.filter((e) => e.event === 'message_delta')
		const msgStops = events.filter((e) => e.event === 'message_stop')
		assert.equal(stops.length, 1, 'exactly 1 content_block_stop')
		assert.equal(msgDeltas.length, 1, 'exactly 1 message_delta')
		assert.equal(msgStops.length, 1, 'exactly 1 message_stop')
		console.log('  PASS Test F2-5: final_answer terminal trio not sliced')
	}

	// Test F2-6: env override LIV_BROKER_SLICE_DELAY_MS=0 → no enforced delay
	{
		const prev = process.env.LIV_BROKER_SLICE_DELAY_MS
		process.env.LIV_BROKER_SLICE_DELAY_MS = '0'
		try {
			const mod = await import('./sse-adapter.js?bustcache_delay0=' + Date.now())
			const fake = new FakeResponse()
			const adapter = (mod as any).createSseAdapter({model: 'm', res: fake.asResponse()})
			await adapter.onAgentEvent({type: 'thinking', turn: 1})
			const text = 'a'.repeat(200)
			const t0 = Date.now()
			await adapter.onAgentEvent({type: 'chunk', turn: 1, data: text})
			const elapsed = Date.now() - t0
			assert.ok(
				elapsed < 100,
				`with LIV_BROKER_SLICE_DELAY_MS=0, elapsed should be <100ms, got ${elapsed}ms`,
			)
			console.log(
				`  PASS Test F2-6: env override LIV_BROKER_SLICE_DELAY_MS=0 emits with no delay (${elapsed}ms)`,
			)
		} finally {
			if (prev === undefined) delete process.env.LIV_BROKER_SLICE_DELAY_MS
			else process.env.LIV_BROKER_SLICE_DELAY_MS = prev
		}
	}

	console.log('\nAll sse-adapter.test.ts tests passed (10/10)')
}

runTests().catch((err) => {
	console.error('FAILED:', err)
	process.exit(1)
})
