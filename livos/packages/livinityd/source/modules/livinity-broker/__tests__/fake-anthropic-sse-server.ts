import express from 'express'
import type {Server} from 'node:http'

/**
 * Phase 58 Wave 0 (FR-BROKER-C1-02): Deterministic-timing fake-Anthropic SSE server.
 *
 * Used by Wave 4 integration tests to prove the broker emits ≥3 distinct
 * content_block_delta events at ≥50ms apart timestamps WITHOUT depending on
 * real api.anthropic.com timing. Server-side setTimeout per event — only
 * source of timing variance is Node.js event loop jitter (<5ms typical).
 *
 * Reference: RESEARCH.md "Test Fixture Pattern — Deterministic-Timing Fake-Anthropic SSE Server"
 *
 * Loopback bind enforced: app.listen(0, '127.0.0.1') — no LAN exposure
 * (T-58-00-02 mitigation).
 */

export interface ScriptedEvent {
	type: string
	data: Record<string, unknown>
	delayMs: number
}

export interface FakeAnthropicServerOpts {
	script: ScriptedEvent[]
	/** Simulate upstream HTTP error before script runs (for 429/Retry-After tests). */
	preErrorStatus?: number
	preErrorRetryAfter?: string
}

export interface FakeAnthropicServerHandle {
	baseURL: string
	close: () => Promise<void>
}

export function createFakeAnthropicServer(
	opts: FakeAnthropicServerOpts,
): Promise<FakeAnthropicServerHandle> {
	const app = express()
	app.use(express.json({limit: '1mb'}))

	app.post('/v1/messages', async (req, res) => {
		if (opts.preErrorStatus) {
			if (opts.preErrorRetryAfter) res.setHeader('Retry-After', opts.preErrorRetryAfter)
			res.status(opts.preErrorStatus).json({
				type: 'error',
				error: {type: 'rate_limit_error', message: 'fake upstream error'},
			})
			return
		}

		// Phase 58 Wave 4 (FR-BROKER-C2-03): when caller omits stream:true (sync
		// mode), serve a JSON Message reconstructed from the script — the
		// Anthropic SDK's messages.create() without stream:true expects a JSON
		// body, not SSE. We aggregate the script's text deltas + final usage
		// into a single Message shape so sync-mode integration tests can assert
		// non-zero usage end-to-end.
		const wantsStream = req.body?.stream === true
		if (!wantsStream) {
			let model = 'claude-sonnet-4-6'
			let inputTokens = 0
			let outputTokens = 0
			let stopReason: string | null = null
			let messageId = 'msg_test'
			const contentBlocks: Array<Record<string, unknown>> = []
			const blockState = new Map<number, {type: string; text: string; toolJson: string; id?: string; name?: string}>()

			for (const event of opts.script) {
				const data = event.data as any
				if (event.type === 'message_start') {
					if (data?.message?.id) messageId = data.message.id
					if (data?.message?.model) model = data.message.model
					if (typeof data?.message?.usage?.input_tokens === 'number') {
						inputTokens = data.message.usage.input_tokens
					}
					continue
				}
				if (event.type === 'content_block_start') {
					const idx = data?.index ?? 0
					const cb = data?.content_block ?? {}
					blockState.set(idx, {
						type: cb.type ?? 'text',
						text: cb.type === 'text' ? (cb.text ?? '') : '',
						toolJson: '',
						id: cb.id,
						name: cb.name,
					})
					continue
				}
				if (event.type === 'content_block_delta') {
					const idx = data?.index ?? 0
					const state = blockState.get(idx)
					const delta = data?.delta ?? {}
					if (!state) continue
					if (delta.type === 'text_delta' && typeof delta.text === 'string') {
						state.text += delta.text
					} else if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
						state.toolJson += delta.partial_json
					}
					continue
				}
				if (event.type === 'content_block_stop') {
					const idx = data?.index ?? 0
					const state = blockState.get(idx)
					if (!state) continue
					if (state.type === 'text') {
						contentBlocks.push({type: 'text', text: state.text})
					} else if (state.type === 'tool_use') {
						let parsedInput: unknown = {}
						try {
							parsedInput = state.toolJson ? JSON.parse(state.toolJson) : {}
						} catch {
							parsedInput = {}
						}
						contentBlocks.push({
							type: 'tool_use',
							id: state.id ?? 'toolu_test',
							name: state.name ?? 'unknown',
							input: parsedInput,
						})
					}
					continue
				}
				if (event.type === 'message_delta') {
					if (typeof data?.usage?.output_tokens === 'number') {
						outputTokens = data.usage.output_tokens
					}
					if (typeof data?.delta?.stop_reason === 'string') {
						stopReason = data.delta.stop_reason
					}
					continue
				}
			}

			res.status(200).json({
				id: messageId,
				type: 'message',
				role: 'assistant',
				content: contentBlocks,
				model,
				stop_reason: stopReason,
				stop_sequence: null,
				usage: {input_tokens: inputTokens, output_tokens: outputTokens},
			})
			return
		}

		res.setHeader('Content-Type', 'text/event-stream')
		res.setHeader('Cache-Control', 'no-cache')
		res.setHeader('Connection', 'keep-alive')
		res.flushHeaders()
		for (const event of opts.script) {
			await new Promise((resolve) => setTimeout(resolve, event.delayMs))
			if (res.writableEnded) return
			res.write(`event: ${event.type}\n`)
			res.write(`data: ${JSON.stringify(event.data)}\n\n`)
		}
		res.end()
	})

	return new Promise((resolve) => {
		const server: Server = app.listen(0, '127.0.0.1', () => {
			const addr = server.address()
			if (!addr || typeof addr === 'string') {
				throw new Error('fake-anthropic-sse-server: listen returned no address')
			}
			resolve({
				baseURL: `http://127.0.0.1:${addr.port}`,
				close: () =>
					new Promise<void>((r) => {
						server.close(() => r())
					}),
			})
		})
	})
}

/**
 * Canonical 11-event script for FR-BROKER-C1-02 (≥3 deltas in 2s).
 * Total runtime ~1.6s with 5 content_block_delta events 300ms apart.
 * Wire shapes match RESEARCH.md "Anthropic SSE Event Reference" verbatim.
 *
 * IMPORTANT: message_delta.usage.output_tokens = 15 is the CUMULATIVE final value
 * (Anthropic Warning box). Translator must overwrite, not sum.
 */
export const CANONICAL_SCRIPT: ScriptedEvent[] = [
	{
		type: 'message_start',
		data: {
			type: 'message_start',
			message: {
				id: 'msg_test',
				type: 'message',
				role: 'assistant',
				content: [],
				model: 'claude-sonnet-4-6',
				stop_reason: null,
				stop_sequence: null,
				usage: {input_tokens: 25, output_tokens: 1},
			},
		},
		delayMs: 10,
	},
	{
		type: 'content_block_start',
		data: {
			type: 'content_block_start',
			index: 0,
			content_block: {type: 'text', text: ''},
		},
		delayMs: 10,
	},
	{type: 'ping', data: {type: 'ping'}, delayMs: 50},
	{
		type: 'content_block_delta',
		data: {type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text: 'Hello'}},
		delayMs: 300,
	},
	{
		type: 'content_block_delta',
		data: {type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text: ' world'}},
		delayMs: 300,
	},
	{
		type: 'content_block_delta',
		data: {type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text: '!'}},
		delayMs: 300,
	},
	{
		type: 'content_block_delta',
		data: {type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text: ' How'}},
		delayMs: 300,
	},
	{
		type: 'content_block_delta',
		data: {type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text: ' are you?'}},
		delayMs: 300,
	},
	{
		type: 'content_block_stop',
		data: {type: 'content_block_stop', index: 0},
		delayMs: 10,
	},
	{
		type: 'message_delta',
		data: {
			type: 'message_delta',
			delta: {stop_reason: 'end_turn', stop_sequence: null},
			usage: {output_tokens: 15},
		},
		delayMs: 10,
	},
	{type: 'message_stop', data: {type: 'message_stop'}, delayMs: 10},
]
