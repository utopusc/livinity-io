import {randomBytes} from 'node:crypto'
import type {Response} from 'express'
import type {OpenAIFinishReason} from './openai-types.js'

/**
 * Phase 58 Wave 1 — NEW translator.
 *
 * Consumes raw Anthropic SDK SSE events (RawMessageStreamEvent shape) and
 * emits OpenAI chat.completion.chunk SSE lines 1:1 as deltas arrive.
 *
 * Two-adapters-coexist constraint: this file is NEW. The existing
 * openai-sse-adapter.ts is the AGENT-MODE adapter consuming AgentEvent
 * (Strategy B aggregation from the sacred runner file). It is
 * byte-identical at end of Phase 58 — DO NOT MODIFY THAT FILE.
 *
 * References:
 *   - RESEARCH.md "Translator State Machine — Anthropic→OpenAI"
 *   - RESEARCH.md "Anthropic SSE Event Reference"
 *   - RESEARCH.md "OpenAI Chunk Shape Reference"
 *   - 58-01-PLAN.md acceptance criteria
 */

// ===== chatcmpl id generation =====

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

/**
 * Generate a chatcmpl id matching ^chatcmpl-[A-Za-z0-9]{29}$.
 *
 * Phase 58 hardening (FR-BROKER-C2-03): uses crypto.randomBytes for
 * collision-resistant uniqueness. Phase 57's transitional implementation
 * used a non-cryptographic PRNG (Pitfall 4 deferred); this replaces it for the
 * passthrough OpenAI streaming path.
 *
 * Charset: base62 = [0-9A-Za-z]. 29 chars × 62 entropy ≈ 10^51 possible ids.
 */
export function randomChatCmplId(): string {
	const bytes = randomBytes(22)
	let out = 'chatcmpl-'
	for (let i = 0; i < 29; i++) {
		out += BASE62[bytes[i % bytes.length] % 62]
	}
	return out
}

// ===== stop_reason mapping =====

/**
 * Map Anthropic stop_reason → OpenAI finish_reason.
 *
 * Verified mappings (RESEARCH.md "Stop Reason Mapping Table"):
 *   end_turn, stop_sequence, pause_turn, null, unknown → stop
 *   max_tokens, model_context_window_exceeded → length
 *   tool_use → tool_calls
 *   refusal → content_filter
 */
export function mapStopReason(reason: string | null | undefined): OpenAIFinishReason {
	if (reason === 'tool_use') return 'tool_calls'
	if (reason === 'max_tokens' || reason === 'model_context_window_exceeded') return 'length'
	if (reason === 'refusal') return 'content_filter'
	return 'stop' // end_turn, stop_sequence, pause_turn, null, unknown_future_value
}

// ===== Translator =====

/** Anthropic raw stream event (subset Phase 58 handles). */
type AnthropicRawEvent = {type: string; [k: string]: any}

/** OpenAI chat.completion.chunk shape (mirrors openai-types.ts spec, plus tool_calls). */
interface OutChunk {
	id: string
	object: 'chat.completion.chunk'
	created: number
	model: string
	choices: Array<{
		index: 0
		delta: {role?: 'assistant'; content?: string; tool_calls?: any[]}
		finish_reason: OpenAIFinishReason | null
	}>
	usage?: {prompt_tokens: number; completion_tokens: number; total_tokens: number}
}

export interface AnthropicToOpenAIStreamTranslator {
	onAnthropicEvent(event: AnthropicRawEvent): void
	finalize(): void
}

export interface CreateTranslatorOpts {
	requestedModel: string
	res: Response
}

/** Per-content-block state for tool_use index tracking. */
interface BlockState {
	type: 'text' | 'tool_use' | 'thinking' | 'unknown'
	toolUseId?: string
	toolName?: string
	openaiToolCallIndex?: number
}

export function createAnthropicToOpenAIStreamTranslator(
	opts: CreateTranslatorOpts,
): AnthropicToOpenAIStreamTranslator {
	const {requestedModel, res} = opts
	const id = randomChatCmplId()
	const created = Math.floor(Date.now() / 1000)
	let roleEmitted = false
	let inputTokens = 0
	let outputTokens = 0
	let stopReason: string | null = null
	let finalized = false
	const blocks = new Map<number, BlockState>()
	let nextToolCallIndex = 0

	function flush() {
		const flushable = res as unknown as {flush?: () => void}
		if (typeof flushable.flush === 'function') flushable.flush()
	}

	function writeChunk(chunk: OutChunk): void {
		if (res.writableEnded) return
		res.write(`data: ${JSON.stringify(chunk)}\n\n`)
		flush()
	}

	function makeChunk(
		delta: OutChunk['choices'][0]['delta'],
		finishReason: OpenAIFinishReason | null,
		usage?: OutChunk['usage'],
	): OutChunk {
		const c: OutChunk = {
			id,
			object: 'chat.completion.chunk',
			created,
			model: requestedModel,
			choices: [{index: 0, delta, finish_reason: finishReason}],
		}
		if (usage) c.usage = usage
		return c
	}

	function ensureRole() {
		if (roleEmitted) return
		roleEmitted = true
		writeChunk(makeChunk({role: 'assistant'}, null))
	}

	function emitContent(text: string) {
		writeChunk(makeChunk({content: text}, null))
	}

	function emitToolCallOpening(state: BlockState) {
		writeChunk(
			makeChunk(
				{
					tool_calls: [
						{
							index: state.openaiToolCallIndex,
							id: state.toolUseId,
							type: 'function',
							function: {name: state.toolName, arguments: ''},
						},
					],
				},
				null,
			),
		)
	}

	function emitToolCallArgsDelta(state: BlockState, partialJson: string) {
		writeChunk(
			makeChunk(
				{
					tool_calls: [
						{
							index: state.openaiToolCallIndex,
							function: {arguments: partialJson},
						},
					],
				},
				null,
			),
		)
	}

	function finalize(): void {
		if (finalized) return
		finalized = true
		ensureRole()
		const finishReason = mapStopReason(stopReason)
		const usage = {
			prompt_tokens: inputTokens,
			completion_tokens: outputTokens,
			total_tokens: inputTokens + outputTokens,
		}
		writeChunk(makeChunk({}, finishReason, usage))
		if (!res.writableEnded) {
			res.write('data: [DONE]\n\n')
			flush()
		}
		// Caller (passthrough handler) is responsible for res.end() — translator
		// keeps the response open so outer code can append metrics/timing if needed.
	}

	function onAnthropicEvent(event: AnthropicRawEvent): void {
		if (finalized) return
		switch (event.type) {
			case 'message_start': {
				const usage = event.message?.usage ?? {}
				if (typeof usage.input_tokens === 'number') inputTokens = usage.input_tokens
				return
			}
			case 'content_block_start': {
				const idx = event.index as number
				const block = event.content_block ?? {}
				const blockType: BlockState['type'] =
					block.type === 'text'
						? 'text'
						: block.type === 'tool_use'
							? 'tool_use'
							: block.type === 'thinking'
								? 'thinking'
								: 'unknown'
				const state: BlockState = {type: blockType}
				if (blockType === 'tool_use') {
					state.toolUseId = block.id
					state.toolName = block.name
					state.openaiToolCallIndex = nextToolCallIndex++
				}
				blocks.set(idx, state)
				ensureRole()
				if (blockType === 'tool_use' && state.openaiToolCallIndex !== undefined) {
					emitToolCallOpening(state)
				}
				// text + thinking blocks: no opening emission
				return
			}
			case 'ping':
				return
			case 'content_block_delta': {
				const idx = event.index as number
				const delta = event.delta ?? {}
				const state = blocks.get(idx)
				if (delta.type === 'text_delta' && typeof delta.text === 'string') {
					ensureRole()
					emitContent(delta.text)
					return
				}
				if (
					delta.type === 'input_json_delta' &&
					state?.type === 'tool_use' &&
					state.openaiToolCallIndex !== undefined
				) {
					emitToolCallArgsDelta(state, typeof delta.partial_json === 'string' ? delta.partial_json : '')
					return
				}
				// thinking_delta + signature_delta dropped (deferred per CONTEXT.md)
				return
			}
			case 'content_block_stop':
				return
			case 'message_delta': {
				const usage = event.usage ?? {}
				// CUMULATIVE — overwrite, never sum (Anthropic Warning)
				if (typeof usage.output_tokens === 'number') outputTokens = usage.output_tokens
				const newStop = event.delta?.stop_reason
				if (typeof newStop === 'string') stopReason = newStop
				return
			}
			case 'message_stop':
				finalize()
				return
			case 'error': {
				stopReason = 'error'
				finalize()
				return
			}
			default:
				// Unknown event — log nothing, return without crashing
				return
		}
	}

	return {onAnthropicEvent, finalize}
}
