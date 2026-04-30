import {randomUUID} from 'node:crypto'
import type {AgentResult} from '@nexus/core'
import type {SdkRunArgs} from './translate-request.js'
import type {
	OpenAIChatCompletionsRequest,
	OpenAIChatCompletionResponse,
	OpenAIFinishReason,
	OpenAIMessage,
	OpenAITextContentBlock,
} from './openai-types.js'

/**
 * Hardcoded model alias table per D-42-11 (updated Phase 42.2 — current Claude 4.X family).
 *
 * Latest model IDs (knowledge cutoff Jan 2026):
 *   - claude-opus-4-7    (latest Opus, replaces opus-4-6)
 *   - claude-sonnet-4-6  (current Sonnet)
 *   - claude-haiku-4-5   (current Haiku)
 *
 * Friendly aliases:
 *   - opus    → claude-opus-4-7
 *   - sonnet  → claude-sonnet-4-6
 *   - haiku   → claude-haiku-4-5
 *
 * OpenAI compat:
 *   - gpt-4 / gpt-4o / gpt-4-turbo / gpt-* → claude-sonnet-4-6 (default Claude)
 *
 * Returns {actualModel: <claude-model>, warn: <true if unknown fallback>}.
 * The OpenAI response's `model` field echoes the CALLER'S requested model
 * (preserves caller expectation), NOT the resolved Claude model.
 */
export function resolveModelAlias(requested: string): {actualModel: string; warn: boolean} {
	const r = (requested || '').toLowerCase().trim()
	// Friendly short aliases (Phase 42.2)
	if (r === 'opus') return {actualModel: 'claude-opus-4-7', warn: false}
	if (r === 'sonnet') return {actualModel: 'claude-sonnet-4-6', warn: false}
	if (r === 'haiku') return {actualModel: 'claude-haiku-4-5', warn: false}
	// Explicit Claude model IDs — opus family resolves to latest 4-7
	if (r.startsWith('claude-opus')) {
		return {actualModel: 'claude-opus-4-7', warn: false}
	}
	if (r.startsWith('claude-sonnet')) {
		return {actualModel: 'claude-sonnet-4-6', warn: false}
	}
	if (r.startsWith('claude-haiku')) {
		return {actualModel: 'claude-haiku-4-5', warn: false}
	}
	// Legacy claude-3-* → modern equivalent
	if (r.startsWith('claude-3-5-sonnet') || r.startsWith('claude-3-sonnet')) {
		return {actualModel: 'claude-sonnet-4-6', warn: false}
	}
	if (r.startsWith('claude-3-opus')) {
		return {actualModel: 'claude-opus-4-7', warn: false}
	}
	if (r.startsWith('claude-3-haiku') || r.startsWith('claude-3-5-haiku')) {
		return {actualModel: 'claude-haiku-4-5', warn: false}
	}
	// OpenAI model names → default Claude (Sonnet)
	if (
		r === 'gpt-4' ||
		r === 'gpt-4o' ||
		r === 'gpt-4-turbo' ||
		r === 'gpt-3.5-turbo' ||
		r.startsWith('gpt-')
	) {
		return {actualModel: 'claude-sonnet-4-6', warn: false}
	}
	// Unknown → default + warn
	return {actualModel: 'claude-sonnet-4-6', warn: true}
}

/** Extract concatenated text from string OR text-block-array content. */
function extractText(msg: OpenAIMessage): string {
	if (typeof msg.content === 'string') return msg.content
	if (Array.isArray(msg.content)) {
		const blocks = msg.content.filter(
			(b): b is OpenAITextContentBlock =>
				!!b &&
				(b as OpenAITextContentBlock).type === 'text' &&
				typeof (b as OpenAITextContentBlock).text === 'string',
		)
		return blocks.map((b) => b.text).join('\n')
	}
	throw new Error('message content must be string or text-block array')
}

/**
 * Translate an OpenAI Chat Completions request into SdkAgentRunner.run() args.
 *
 * Strategy (per D-42-05):
 *   - All `system` messages → concatenated into systemPromptOverride
 *   - Latest `user` message → task
 *   - All prior non-system messages → contextPrefix in "Previous conversation:\n..."
 *     format (matches Phase 41 translate-request.ts pattern)
 *   - `assistant` role messages preserve as "Assistant: ..." in contextPrefix
 *   - `tool` / `function` role messages SKIPPED with no warning (we ignore tools per D-42-12)
 *   - tools / tool_choice / function_call fields NOT inspected here — caller
 *     (router) logs the warn. This translator is pure.
 *
 * Throws Error if no user message present.
 */
export function translateOpenAIChatToSdkArgs(req: OpenAIChatCompletionsRequest): SdkRunArgs {
	if (!req || typeof req !== 'object') throw new Error('request must be an object')
	if (!Array.isArray(req.messages) || req.messages.length === 0) {
		throw new Error('messages must be a non-empty array')
	}

	// Partition messages
	const systemMessages: OpenAIMessage[] = []
	const conversationMessages: OpenAIMessage[] = []
	for (const m of req.messages) {
		if (m.role === 'system') systemMessages.push(m)
		else if (m.role === 'tool' || m.role === 'function') {
			// Skip tool/function role — we don't support them
			continue
		} else {
			conversationMessages.push(m)
		}
	}

	// Find latest user message in conversation
	let lastUserIdx = -1
	for (let i = conversationMessages.length - 1; i >= 0; i--) {
		if (conversationMessages[i]?.role === 'user') {
			lastUserIdx = i
			break
		}
	}
	if (lastUserIdx === -1) {
		throw new Error('no user message found in messages array')
	}

	const task = extractText(conversationMessages[lastUserIdx]!)
	const priorTurns = conversationMessages.slice(0, lastUserIdx)

	let contextPrefix: string | undefined
	if (priorTurns.length > 0) {
		const formatted = priorTurns
			.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${extractText(m)}`)
			.join('\n\n')
		contextPrefix = `Previous conversation:\n${formatted}`
	}

	let systemPromptOverride: string | undefined
	if (systemMessages.length > 0) {
		systemPromptOverride = systemMessages.map((m) => extractText(m)).join('\n')
	}

	return {task, contextPrefix, systemPromptOverride}
}

/** Map AgentResult.stoppedReason → OpenAI finish_reason. */
function mapFinishReason(stoppedReason: AgentResult['stoppedReason']): OpenAIFinishReason {
	if (stoppedReason === 'complete') return 'stop'
	if (stoppedReason === 'max_turns' || stoppedReason === 'max_tokens') return 'length'
	return 'stop'
}

/**
 * Build the single-shot OpenAI ChatCompletion JSON response from buffered
 * SdkAgentRunner output. Per D-42-08 + D-42-10.
 *
 * `requestedModel` is echoed in the response.model field (preserves caller
 * expectation); the resolved Claude model is internal-only.
 */
export function buildSyncOpenAIResponse(opts: {
	requestedModel: string
	bufferedText: string
	result: AgentResult
}): OpenAIChatCompletionResponse {
	const {requestedModel, bufferedText, result} = opts
	const id = `chatcmpl-${randomUUID().replace(/-/g, '').slice(0, 24)}`
	const created = Math.floor(Date.now() / 1000)
	const promptTokens = result.totalInputTokens || 0
	const completionTokens = result.totalOutputTokens || 0
	return {
		id,
		object: 'chat.completion',
		created,
		model: requestedModel,
		choices: [
			{
				index: 0,
				message: {role: 'assistant', content: bufferedText || result.answer || ''},
				finish_reason: mapFinishReason(result.stoppedReason),
			},
		],
		usage: {
			prompt_tokens: promptTokens,
			completion_tokens: completionTokens,
			total_tokens: promptTokens + completionTokens,
		},
	}
}
