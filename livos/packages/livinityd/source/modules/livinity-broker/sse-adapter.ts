import {randomUUID} from 'node:crypto'
import type {Response} from 'express'
import type {AgentEvent} from '@liv/core'
import {SLICE_BYTES, SLICE_DELAY_MS, sliceUtf8, sleep} from './sse-slice.js'

/**
 * Phase 74 Plan 01 (F2 token-cadence streaming).
 *
 * The `chunk` branch of `onAgentEvent` slices each text payload via
 * `sliceUtf8` and emits one Anthropic `content_block_delta` SSE event per
 * slice with an inter-slice `sleep(SLICE_DELAY_MS)` pause. Slicing is in
 * the BROKER adapter only — the sacred
 * `nexus/packages/core/src/sdk-agent-runner.ts`
 * (SHA `4f868d318abff71f8c8bfbcf443b2393a553018b`) is untouched.
 *
 * Slice size + delay are env-configurable:
 *   - `LIV_BROKER_SLICE_BYTES`    default 24, range [8, 256]
 *   - `LIV_BROKER_SLICE_DELAY_MS` default 15, range [0, 200]
 *
 * Slicing applies ONLY to `chunk` text deltas. `final_answer` (terminal trio:
 * content_block_stop + message_delta + message_stop), `error`, and the header
 * trio (message_start + content_block_start + ping) are unchanged.
 */

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
		async onAgentEvent(event: AgentEvent): Promise<void> {
			if (closed) return
			if (event.type === 'thinking' && (event.turn ?? 1) === 1) {
				ensureHeader()
			} else if (event.type === 'chunk' && typeof event.data === 'string') {
				ensureHeader()
				const text = event.data
				if (text.length === 0) return
				// Estimate output tokens once for the whole event payload (NOT per slice)
				// so the per-event token-count contract is unchanged by F2 slicing.
				outputTokens += Math.max(1, Math.ceil(text.length / 4))
				// F2 (Phase 74 Plan 01): slice text into UTF-8-safe pieces, pace
				// each slice with sleep(SLICE_DELAY_MS) before emitting subsequent
				// slices. Short text (<= SLICE_BYTES) yields a 1-element array
				// (no pacing, no behaviour change vs. pre-F2).
				const slices = sliceUtf8(text, SLICE_BYTES)
				for (let i = 0; i < slices.length; i++) {
					if (i > 0) await sleep(SLICE_DELAY_MS)
					writeSseChunk(res, {
						event: 'content_block_delta',
						data: {
							type: 'content_block_delta',
							index: 0,
							delta: {type: 'text_delta', text: slices[i]!},
						},
					})
				}
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
