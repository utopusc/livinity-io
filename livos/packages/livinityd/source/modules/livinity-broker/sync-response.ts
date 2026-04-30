import {randomUUID} from 'node:crypto'
import type {AgentEvent, AgentResult} from '@nexus/core'

/** Anthropic Messages API non-streaming response shape. */
export interface AnthropicMessagesResponse {
	id: string
	type: 'message'
	role: 'assistant'
	content: Array<{type: 'text'; text: string}>
	model: string
	stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence'
	stop_sequence: null
	usage: {input_tokens: number; output_tokens: number}
}

/**
 * Build the single-shot Anthropic Messages JSON response from buffered
 * SdkAgentRunner output.
 *
 * Reference: https://docs.anthropic.com/en/api/messages
 */
export function buildSyncAnthropicResponse(opts: {
	model: string
	bufferedText: string
	result: AgentResult
}): AnthropicMessagesResponse {
	const {model, bufferedText, result} = opts
	const id = `msg_${randomUUID().replace(/-/g, '').slice(0, 24)}`
	const stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' =
		result.stoppedReason === 'complete'
			? 'end_turn'
			: result.stoppedReason === 'max_turns' || result.stoppedReason === 'max_tokens'
				? 'max_tokens'
				: 'stop_sequence'
	return {
		id,
		type: 'message',
		role: 'assistant',
		content: [{type: 'text', text: bufferedText || result.answer || ''}],
		model,
		stop_reason,
		stop_sequence: null,
		usage: {
			input_tokens: result.totalInputTokens || 0,
			output_tokens: result.totalOutputTokens || 0,
		},
	}
}

/** Helper: aggregate SdkAgentRunner 'chunk' events into a single buffered string. */
export function aggregateChunkText(): {push: (event: AgentEvent) => void; get: () => string} {
	const parts: string[] = []
	return {
		push(event) {
			if (event.type === 'chunk' && typeof event.data === 'string') parts.push(event.data)
		},
		get: () => parts.join(''),
	}
}
