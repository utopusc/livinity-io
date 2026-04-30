/**
 * OpenAI Chat Completions API wire types — broker request + sync response shape.
 *
 * Reference: https://platform.openai.com/docs/api-reference/chat/create
 *
 * Phase 42 only handles `text` content (string or text-block array). `image_url`
 * multimodal content is deferred (CONTEXT.md "Vision / multimodal pass-through deferred").
 *
 * Tool fields (tools, tool_choice, function_call, functions) are typed for input
 * validation but IGNORED at runtime per D-42-12 (carry-forward of Phase 41 D-41-14).
 */

export type OpenAIRole = 'system' | 'user' | 'assistant' | 'tool' | 'function'

export interface OpenAITextContentBlock {
	type: 'text'
	text: string
}

export interface OpenAIMessage {
	role: OpenAIRole
	content: string | OpenAITextContentBlock[]
	name?: string
}

export interface OpenAIChatCompletionsRequest {
	model: string
	messages: OpenAIMessage[]
	stream?: boolean
	temperature?: number
	max_tokens?: number
	top_p?: number
	/** IGNORED per D-42-12 — typed for validation only. */
	tools?: unknown[]
	/** IGNORED per D-42-12. */
	tool_choice?: unknown
	/** IGNORED per D-42-12 (legacy OpenAI function-calling). */
	function_call?: unknown
	/** IGNORED per D-42-12 (legacy OpenAI function-calling). */
	functions?: unknown[]
	// Other OpenAI fields not consumed (n, presence_penalty, frequency_penalty, ...) pass-through ignored
	[extra: string]: unknown
}

export type OpenAIFinishReason = 'stop' | 'length' | 'content_filter' | 'tool_calls'

export interface OpenAIChatCompletionResponse {
	id: string
	object: 'chat.completion'
	created: number
	model: string
	choices: Array<{
		index: number
		message: {role: 'assistant'; content: string}
		finish_reason: OpenAIFinishReason
	}>
	usage: {
		prompt_tokens: number
		completion_tokens: number
		total_tokens: number
	}
}
