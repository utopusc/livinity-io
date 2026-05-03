import {afterEach, describe, expect, it} from 'vitest'
import {
	CANONICAL_SCRIPT,
	createFakeAnthropicServer,
	type FakeAnthropicServerHandle,
} from './fake-anthropic-sse-server.js'

describe('fake-anthropic-sse-server (Phase 58 Wave 0 self-test)', () => {
	let handle: FakeAnthropicServerHandle | null = null

	afterEach(async () => {
		if (handle) {
			await handle.close()
			handle = null
		}
	})

	it('listens on ephemeral 127.0.0.1 port', async () => {
		handle = await createFakeAnthropicServer({script: []})
		expect(handle.baseURL).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
	})

	it('emits ≥5 content_block_delta events at distinct timestamps', async () => {
		handle = await createFakeAnthropicServer({script: CANONICAL_SCRIPT})
		const response = await fetch(`${handle.baseURL}/v1/messages`, {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify({
				model: 'claude-sonnet-4-6',
				messages: [{role: 'user', content: 'hi'}],
			}),
		})
		expect(response.status).toBe(200)
		expect(response.headers.get('content-type')).toMatch(/text\/event-stream/)

		const reader = response.body!.getReader()
		const decoder = new TextDecoder()
		const deltaTimestamps: number[] = []
		let buffer = ''
		while (true) {
			const {done, value} = await reader.read()
			if (done) break
			buffer += decoder.decode(value, {stream: true})
			// Each event ends with \n\n. Count content_block_delta arrivals.
			const events = buffer.split('\n\n')
			buffer = events.pop() ?? ''
			for (const evt of events) {
				if (evt.includes('event: content_block_delta')) {
					deltaTimestamps.push(Date.now())
				}
			}
		}

		expect(deltaTimestamps.length).toBeGreaterThanOrEqual(5)
		for (let i = 1; i < deltaTimestamps.length; i++) {
			expect(deltaTimestamps[i] - deltaTimestamps[i - 1]).toBeGreaterThanOrEqual(250)
		}
	})

	it('honors preErrorStatus and Retry-After header', async () => {
		handle = await createFakeAnthropicServer({
			script: [],
			preErrorStatus: 429,
			preErrorRetryAfter: '30',
		})
		const response = await fetch(`${handle.baseURL}/v1/messages`, {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify({model: 'claude-sonnet-4-6', messages: []}),
		})
		expect(response.status).toBe(429)
		expect(response.headers.get('retry-after')).toBe('30')
		const body = (await response.json()) as {error?: {type?: string}}
		expect(body.error?.type).toBe('rate_limit_error')
	})

	it('close() resolves cleanly', async () => {
		const h = await createFakeAnthropicServer({script: []})
		await expect(h.close()).resolves.toBeUndefined()
	})

	it('CANONICAL_SCRIPT contains ≥5 content_block_delta events', () => {
		const deltas = CANONICAL_SCRIPT.filter((e) => e.type === 'content_block_delta')
		expect(deltas.length).toBeGreaterThanOrEqual(5)
	})

	it('CANONICAL_SCRIPT total runtime under 2s', () => {
		const total = CANONICAL_SCRIPT.reduce((sum, e) => sum + e.delayMs, 0)
		expect(total).toBeLessThan(2000)
	})
})
