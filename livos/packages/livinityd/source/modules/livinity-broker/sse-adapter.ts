import {randomUUID} from 'node:crypto'
import type {Response} from 'express'
import type {AgentEvent} from '@nexus/core'

/**
 * Discriminated union of Anthropic SSE event shapes the broker emits.
 * Reference: https://docs.anthropic.com/en/api/messages-streaming
 */
export type AnthropicSseChunk =
	| {
			event: 'message_start'
			data: {
				type: 'message_start'
				message: {
					id: string
					type: 'message'
					role: 'assistant'
					content: []
					model: string
					stop_reason: null
					usage: {input_tokens: number; output_tokens: number}
				}
			}
	  }
	| {
			event: 'content_block_start'
			data: {
				type: 'content_block_start'
				index: 0
				content_block: {type: 'text'; text: ''}
			}
	  }
	| {event: 'ping'; data: {type: 'ping'}}
	| {
			event: 'content_block_delta'
			data: {
				type: 'content_block_delta'
				index: 0
				delta: {type: 'text_delta'; text: string}
			}
	  }
	| {event: 'content_block_stop'; data: {type: 'content_block_stop'; index: 0}}
	| {
			event: 'message_delta'
			data: {
				type: 'message_delta'
				delta: {
					stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence'
					stop_sequence: null
				}
				usage: {output_tokens: number}
			}
	  }
	| {event: 'message_stop'; data: {type: 'message_stop'}}
	| {event: 'error'; data: {type: 'error'; error: {type: string; message: string}}}

/**
 * Write an SSE chunk to the response stream.
 * Format: `event: <name>\ndata: <json>\n\n` (Anthropic spec — the `event:`
 * line is REQUIRED, not just `data:`-only).
 */
export function writeSseChunk(res: Response, chunk: AnthropicSseChunk): void {
	if (res.writableEnded) return
	res.write(`event: ${chunk.event}\n`)
	res.write(`data: ${JSON.stringify(chunk.data)}\n\n`)
	// Force flush — needed for SSE through proxies + Node http defaults
	const flushable = res as unknown as {flush?: () => void}
	if (typeof flushable.flush === 'function') flushable.flush()
}

/**
 * Stateful adapter from SdkAgentRunner AgentEvents → ordered Anthropic SSE chunks.
 *
 * Mapping (per D-41-11):
 *   - 'thinking' (turn 1)  → emits message_start + content_block_start + ping (header chunks)
 *   - 'chunk'              → emits content_block_delta with text_delta (per text piece)
 *   - 'final_answer'       → emits content_block_stop + message_delta + message_stop (terminal trio)
 *   - 'error'              → emits SSE error chunk + message_stop (best-effort)
 *
 * Stop reason mapping (set on message_delta):
 *   - 'complete'             → 'end_turn'
 *   - 'max_turns'/'max_tokens' → 'max_tokens'
 *   - everything else         → 'stop_sequence'
 *
 * Other event types ('tool_call', 'observation', 'done') are not surfaced in
 * Anthropic's text-only spec — broker runs LivOS MCP tools internally;
 * client gets the final text result only.
 */
export function createSseAdapter(opts: {
	model: string
	res: Response
	onComplete?: (outputTokens: number) => void
}) {
	const {model, res, onComplete} = opts
	const messageId = `msg_${randomUUID().replace(/-/g, '').slice(0, 24)}`
	let headerSent = false
	let outputTokens = 0
	let closed = false

	function ensureHeader() {
		if (headerSent) return
		headerSent = true
		writeSseChunk(res, {
			event: 'message_start',
			data: {
				type: 'message_start',
				message: {
					id: messageId,
					type: 'message',
					role: 'assistant',
					content: [],
					model,
					stop_reason: null,
					usage: {input_tokens: 0, output_tokens: 0},
				},
			},
		})
		writeSseChunk(res, {
			event: 'content_block_start',
			data: {type: 'content_block_start', index: 0, content_block: {type: 'text', text: ''}},
		})
		writeSseChunk(res, {event: 'ping', data: {type: 'ping'}})
	}

	return {
		onAgentEvent(event: AgentEvent) {
			if (closed) return
			if (event.type === 'thinking' && (event.turn ?? 1) === 1) {
				ensureHeader()
			} else if (event.type === 'chunk' && typeof event.data === 'string') {
				ensureHeader()
				const text = event.data
				// Estimate output tokens: ~4 chars per token (matches sdk-agent-runner.ts:361 estimate)
				outputTokens += Math.max(1, Math.ceil(text.length / 4))
				writeSseChunk(res, {
					event: 'content_block_delta',
					data: {
						type: 'content_block_delta',
						index: 0,
						delta: {type: 'text_delta', text},
					},
				})
			} else if (event.type === 'final_answer') {
				ensureHeader()
				writeSseChunk(res, {
					event: 'content_block_stop',
					data: {type: 'content_block_stop', index: 0},
				})
				writeSseChunk(res, {
					event: 'message_delta',
					data: {
						type: 'message_delta',
						delta: {stop_reason: 'end_turn', stop_sequence: null},
						usage: {output_tokens: outputTokens},
					},
				})
				writeSseChunk(res, {event: 'message_stop', data: {type: 'message_stop'}})
				closed = true
				if (onComplete) onComplete(outputTokens)
			} else if (event.type === 'error') {
				const message = typeof event.data === 'string' ? event.data : 'agent error'
				writeSseChunk(res, {
					event: 'error',
					data: {type: 'error', error: {type: 'api_error', message}},
				})
				// Best-effort termination
				writeSseChunk(res, {event: 'message_stop', data: {type: 'message_stop'}})
				closed = true
			}
			// 'tool_call', 'observation', 'done' events are not surfaced.
		},
	}
}
