import {randomUUID} from 'node:crypto'
import type {Response} from 'express'
import type {AgentEvent, AgentResult} from '@nexus/core'
import type {OpenAIFinishReason} from './openai-types.js'
import {SLICE_BYTES, SLICE_DELAY_MS, sliceUtf8, sleep} from './sse-slice.js'

/**
 * Phase 74 Plan 01 (F2 token-cadence streaming).
 *
 * The `chunk` branch of `onAgentEvent` slices each text payload via
 * `sliceUtf8` and emits one OpenAI SSE chunk per slice with an inter-slice
 * `sleep(SLICE_DELAY_MS)` pause. Slicing is in the BROKER adapter only — the
 * sacred `nexus/packages/core/src/sdk-agent-runner.ts`
 * (SHA `4f868d318abff71f8c8bfbcf443b2393a553018b`) is untouched.
 *
 * Slice size + delay are env-configurable:
 *   - `LIV_BROKER_SLICE_BYTES`    default 24, range [8, 256]
 *   - `LIV_BROKER_SLICE_DELAY_MS` default 15, range [0, 200]
 *
 * Slicing applies ONLY to `chunk` text deltas. `final_answer`, `error`, and
 * the terminal-chunk + `[DONE]` emission are unchanged.
 */

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
	/** v29.4 Phase 45 Plan 04 (FR-CF-04): present ONLY on the terminal chunk
	 * (with finish_reason: 'stop'/'length'/etc.). Absent on content chunks.
	 * Order invariant: terminal chunk emitted BEFORE `data: [DONE]\n\n`
	 * (pitfall B-13). */
	usage?: {prompt_tokens: number; completion_tokens: number; total_tokens: number}
}

/** v29.4 Phase 45 Plan 04 (FR-CF-04) — usage shape attached to the terminal chunk. */
type StreamingUsage = {prompt_tokens: number; completion_tokens: number; total_tokens: number}

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
 *   - 'final_answer'       → captures stoppedReasonHint='complete' + ensures role chunk sent.
 *                             Terminal chunk + [DONE] DEFERRED to finalize() so caller can
 *                             supply usage tokens (FR-CF-04, Phase 45 Plan 04).
 *   - 'error'              → captures stoppedReasonHint='error' + ensures role chunk sent.
 *                             Terminal chunk + [DONE] DEFERRED to finalize() (same reason).
 *
 * Other event types ('tool_call', 'observation', 'done') NOT surfaced — broker
 * runs LivOS MCP tools internally; client gets text + finish only.
 *
 * `finalize(stoppedReason?, usage?)` is idempotent — call from `finally` block to
 * guarantee [DONE] terminator even if the upstream stream aborts mid-flight.
 * Without [DONE], the official `openai` Python SDK throws.
 *
 * v29.4 Phase 45 Plan 04 (FR-CF-04) — finalize() is now the SOLE canonical
 * terminal emitter. The 'final_answer' / 'error' AgentEvent branches no longer
 * write the terminal chunk + [DONE] inline; they capture a stoppedReasonHint
 * and ensure the role chunk is sent. The router's finally-block calls
 * finalize(stoppedReason, usage) with real upstream token counts so the
 * terminal chunk carries `usage{prompt,completion,total}` BEFORE [DONE]
 * (pitfall B-13 wire-order invariant).
 */
export function createOpenAISseAdapter(opts: {requestedModel: string; res: Response}) {
	const {requestedModel, res} = opts
	const id = `chatcmpl-${randomUUID().replace(/-/g, '').slice(0, 24)}`
	const created = Math.floor(Date.now() / 1000)
	let firstChunkSent = false
	let finalized = false
	// FR-CF-04: when the upstream agent emits 'final_answer' or 'error' BEFORE
	// the router's finally-block calls finalize(), record the implied stoppedReason
	// so finalize() can emit the right finish_reason if the caller didn't supply one.
	let stoppedReasonHint: AgentResult['stoppedReason'] | null = null

	function makeChunk(
		delta: {role?: 'assistant'; content?: string},
		finishReason: OpenAIFinishReason | null,
		usage?: StreamingUsage,
	): OpenAIChatCompletionChunk {
		const chunk: OpenAIChatCompletionChunk = {
			id,
			object: 'chat.completion.chunk',
			created,
			model: requestedModel,
			choices: [{index: 0, delta, finish_reason: finishReason}],
		}
		if (usage) chunk.usage = usage
		return chunk
	}

	return {
		async onAgentEvent(event: AgentEvent): Promise<void> {
			if (finalized) return
			if (event.type === 'chunk' && typeof event.data === 'string') {
				const text = event.data
				// Empty-text chunks preserve the existing first-chunk role-only emission
				// (no slicing applies to a zero-byte payload).
				if (text.length === 0) {
					if (!firstChunkSent) {
						firstChunkSent = true
						writeOpenAISseChunk(res, makeChunk({role: 'assistant', content: ''}, null))
					}
					return
				}
				// F2 (Phase 74 Plan 01): UTF-8-safe slice into ~SLICE_BYTES pieces.
				// Short text (<= SLICE_BYTES) returns a single-element array — no pacing,
				// no behaviour change vs. pre-F2.
				const slices = sliceUtf8(text, SLICE_BYTES)
				for (let i = 0; i < slices.length; i++) {
					// Pace BEFORE emitting subsequent slices so the first byte still
					// hits the wire as fast as possible (LTC = lowest time to first byte).
					if (i > 0) await sleep(SLICE_DELAY_MS)
					const piece = slices[i]!
					if (!firstChunkSent) {
						firstChunkSent = true
						writeOpenAISseChunk(res, makeChunk({role: 'assistant', content: piece}, null))
					} else {
						writeOpenAISseChunk(res, makeChunk({content: piece}, null))
					}
				}
			} else if (event.type === 'final_answer') {
				// FR-CF-04 (Phase 45 Plan 04) — terminal chunk + [DONE] emission deferred
				// to finalize() so the caller's finally-block can supply usage tokens. The
				// 'final_answer' event itself does not carry token counts; the caller
				// has finalResult after iteration completes.
				// Capture the stoppedReason hint so finalize() emits the right finish_reason.
				// (final_answer corresponds to a 'complete' stoppedReason → finish_reason 'stop'.)
				stoppedReasonHint = 'complete'
				// Ensure the role chunk is sent for SDKs expecting it before terminal.
				if (!firstChunkSent) {
					firstChunkSent = true
					writeOpenAISseChunk(res, makeChunk({role: 'assistant', content: ''}, null))
				}
			} else if (event.type === 'error') {
				// FR-CF-04 (Phase 45 Plan 04) — defer terminal + [DONE] to finalize()
				// so caller can supply usage if any was captured before the error.
				stoppedReasonHint = 'error'
				if (!firstChunkSent) {
					firstChunkSent = true
					writeOpenAISseChunk(res, makeChunk({role: 'assistant', content: ''}, null))
				}
			}
			// 'thinking', 'tool_call', 'observation', 'done' → not surfaced
		},

		/**
		 * Idempotent finalizer. Call from `finally` block to ensure [DONE]
		 * terminator is written even if the upstream stream aborts.
		 *
		 * v29.4 Phase 45 Plan 04 (FR-CF-04): accepts optional `usage` and threads
		 * it onto the terminal chunk per OpenAI streaming spec. Wire order:
		 * terminal-chunk-with-usage FIRST, then [DONE] (pitfall B-13).
		 */
		finalize(stoppedReason?: AgentResult['stoppedReason'], usage?: StreamingUsage) {
			if (finalized) return
			if (!firstChunkSent) {
				firstChunkSent = true
				writeOpenAISseChunk(res, makeChunk({role: 'assistant', content: ''}, null))
			}
			// Use explicit stoppedReason if supplied; otherwise fall back to the
			// hint captured by onAgentEvent (final_answer → 'complete', error → 'error').
			const effectiveStop = stoppedReason ?? stoppedReasonHint ?? undefined
			// FR-CF-04: usage on terminal chunk per OpenAI streaming spec.
			// Wire order: terminal-chunk-with-usage FIRST, then [DONE] (pitfall B-13).
			writeOpenAISseChunk(res, makeChunk({}, mapFinishReason(effectiveStop), usage))
			if (!res.writableEnded) res.write(OPENAI_SSE_DONE)
			finalized = true
		},
	}
}
