import {randomUUID} from 'node:crypto'
import type {Response} from 'express'
import type {AgentEvent, AgentResult} from '@nexus/core'
import type {OpenAIFinishReason} from './openai-types.js'

/**
 * OpenAI Chat Completions streaming chunk shape.
 *
 * Reference: https://platform.openai.com/docs/api-reference/chat/streaming
 *
 * Per OpenAI spec:
 *   - First chunk: delta = {role: 'assistant', content?: '...'}
 *   - Mid chunks: delta = {content: '...'}
 *   - Final chunk: delta = {} + finish_reason ('stop' / 'length' / etc.)
 *   - Terminal sentinel: literal `data: [DONE]\n\n` line (NOT a JSON object)
 *
 * SSE wire format requires `data:`-only lines (NO `event:` prefix —
 * different from Phase 41's Anthropic adapter which uses `event:` + `data:`).
 */
export interface OpenAIChatCompletionChunk {
	id: string
	object: 'chat.completion.chunk'
	created: number
	model: string
	choices: Array<{
		index: 0
		delta: {role?: 'assistant'; content?: string}
		finish_reason: OpenAIFinishReason | null
	}>
}

/** Literal terminator the OpenAI SDK looks for. MUST be byte-identical. */
export const OPENAI_SSE_DONE = 'data: [DONE]\n\n'

/**
 * Write a single OpenAI SSE chunk to the response.
 * Format: `data: <json>\n\n` (NO event: prefix — OpenAI spec).
 * Force-flush after every write so chunks reach the client immediately.
 */
export function writeOpenAISseChunk(res: Response, chunk: OpenAIChatCompletionChunk): void {
	if (res.writableEnded) return
	res.write(`data: ${JSON.stringify(chunk)}\n\n`)
	const flushable = res as unknown as {flush?: () => void}
	if (typeof flushable.flush === 'function') flushable.flush()
}

/** Map AgentResult.stoppedReason → OpenAI finish_reason (mirrors openai-translator mapping). */
function mapFinishReason(stoppedReason?: AgentResult['stoppedReason']): OpenAIFinishReason {
	if (stoppedReason === 'max_turns' || stoppedReason === 'max_tokens') return 'length'
	return 'stop'
}

/**
 * Stateful adapter from SdkAgentRunner AgentEvents → OpenAI Chat Completions
 * streaming chunks (per D-42-09).
 *
 * Mapping:
 *   - 'thinking' (turn 1)  → no chunk emitted (header role on first chunk handles intro)
 *   - 'chunk' (text delta) → emits chunk with delta.content (and delta.role on FIRST emission)
 *   - 'final_answer'       → emits terminal chunk with empty delta + finish_reason + writes [DONE]
 *   - 'error'              → emits chunk with delta:{}, finish_reason:'stop' + [DONE] (best-effort)
 *
 * Other event types ('tool_call', 'observation', 'done') NOT surfaced — broker
 * runs LivOS MCP tools internally; client gets text + finish only.
 *
 * `finalize(stoppedReason?)` is idempotent — call from `finally` block to
 * guarantee [DONE] terminator even if the upstream stream aborts mid-flight.
 * Without [DONE], the official `openai` Python SDK throws.
 */
export function createOpenAISseAdapter(opts: {requestedModel: string; res: Response}) {
	const {requestedModel, res} = opts
	const id = `chatcmpl-${randomUUID().replace(/-/g, '').slice(0, 24)}`
	const created = Math.floor(Date.now() / 1000)
	let firstChunkSent = false
	let finalized = false

	function makeChunk(
		delta: {role?: 'assistant'; content?: string},
		finishReason: OpenAIFinishReason | null,
	): OpenAIChatCompletionChunk {
		return {
			id,
			object: 'chat.completion.chunk',
			created,
			model: requestedModel,
			choices: [{index: 0, delta, finish_reason: finishReason}],
		}
	}

	return {
		onAgentEvent(event: AgentEvent) {
			if (finalized) return
			if (event.type === 'chunk' && typeof event.data === 'string') {
				const text = event.data
				if (!firstChunkSent) {
					firstChunkSent = true
					// First chunk: role + content (or just role if text is empty)
					writeOpenAISseChunk(res, makeChunk({role: 'assistant', content: text}, null))
				} else {
					writeOpenAISseChunk(res, makeChunk({content: text}, null))
				}
			} else if (event.type === 'final_answer') {
				// If we never sent a chunk (no text streamed), emit role chunk first so OpenAI SDK is happy
				if (!firstChunkSent) {
					firstChunkSent = true
					writeOpenAISseChunk(res, makeChunk({role: 'assistant', content: ''}, null))
				}
				// Terminal chunk
				writeOpenAISseChunk(res, makeChunk({}, 'stop'))
				if (!res.writableEnded) res.write(OPENAI_SSE_DONE)
				finalized = true
			} else if (event.type === 'error') {
				// Best-effort: emit terminal chunk + [DONE] so client SDK doesn't hang
				if (!firstChunkSent) {
					firstChunkSent = true
					writeOpenAISseChunk(res, makeChunk({role: 'assistant', content: ''}, null))
				}
				writeOpenAISseChunk(res, makeChunk({}, 'stop'))
				if (!res.writableEnded) res.write(OPENAI_SSE_DONE)
				finalized = true
			}
			// 'thinking', 'tool_call', 'observation', 'done' → not surfaced
		},

		/**
		 * Idempotent finalizer. Call from `finally` block to ensure [DONE]
		 * terminator is written even if the upstream stream aborts.
		 */
		finalize(stoppedReason?: AgentResult['stoppedReason']) {
			if (finalized) return
			if (!firstChunkSent) {
				firstChunkSent = true
				writeOpenAISseChunk(res, makeChunk({role: 'assistant', content: ''}, null))
			}
			writeOpenAISseChunk(res, makeChunk({}, mapFinishReason(stoppedReason)))
			if (!res.writableEnded) res.write(OPENAI_SSE_DONE)
			finalized = true
		},
	}
}
