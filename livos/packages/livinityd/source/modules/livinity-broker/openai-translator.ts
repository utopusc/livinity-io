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

// Phase 61 Plan 03 D1 — model alias resolution moved to standalone
// alias-resolver.ts (Redis-backed, 5s in-memory cache). Re-exported from
// here for backward compat with existing imports (openai-router.ts,
// passthrough-handler.ts, openai-translator.test.ts).
//
// New signature is async — every caller is already inside an async handler
// context, so `await resolveModelAlias(deps.livinityd.ai.redis, requested)`
// is safe at every call site. See alias-resolver.ts for resolution rules
// (Redis hit → claude-* prefix passthrough → default fallback + warn).
//
// Default alias table now lives in seed-default-aliases.ts and is seeded to
// Redis at livinityd boot via SETNX (so admin runtime edits survive reboot).
export {resolveModelAlias, type AliasRedisLike} from './alias-resolver.js'

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

	// Phase 43.8 (broker passthrough identity fix): default to empty string
	// when the OpenAI request had no `system` message. Mirrors the Anthropic
	// translate-request fix — see translate-request.ts for full rationale.
	let systemPromptOverride: string = ''
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

// ===== Phase 57 Wave 3: OpenAI ↔ Anthropic translation helpers (passthrough only) =====
// These NEW exports are used by passthrough mode only. The existing exports
// (translateOpenAIChatToSdkArgs, buildSyncOpenAIResponse, resolveModelAlias)
// are UNCHANGED to avoid agent-mode regression (Pitfall 6).
//
// Why these helpers exist as siblings rather than replacements:
//   - translateOpenAIChatToSdkArgs is for AGENT mode (collapses messages into
//     task + contextPrefix + systemPromptOverride for the SdkAgentRunner shim)
//   - The new translateToolsToAnthropic + translateToolUseToOpenAI are for
//     PASSTHROUGH mode (preserves messages[] structure, forwards tools[]
//     verbatim with a shape conversion, and translates upstream Anthropic
//     content[] back to OpenAI tool_calls[] format).

/** OpenAI tool shape (input). Only `type: 'function'` is supported in v30. */
export interface OpenAIToolFunctionShape {
	type: 'function'
	function: {
		name: string
		description?: string
		parameters?: Record<string, unknown>
	}
}

/** Anthropic tool shape — minimal type for passthrough translation. */
export interface AnthropicToolShape {
	name: string
	description?: string
	input_schema: Record<string, unknown>
}

/**
 * Translate OpenAI tool array to Anthropic tool array.
 *   OpenAI:    {type:'function', function:{name, description?, parameters}}
 *   Anthropic: {name, description?, input_schema}
 *
 * Throws on unsupported tool.type (only 'function' supported in v30).
 * Throws on missing function.name (every tool must have a name).
 * Defaults parameters to {type:'object',properties:{}} when omitted (Anthropic
 * requires an input_schema even for no-arg tools).
 */
export function translateToolsToAnthropic(openaiTools: unknown[]): AnthropicToolShape[] {
	return openaiTools.map((rawTool) => {
		const tool = rawTool as Partial<OpenAIToolFunctionShape>
		if (tool.type !== 'function') {
			throw new Error(
				`unsupported tool type: ${String(tool.type)} (passthrough supports only 'function')`,
			)
		}
		const fn = tool.function
		if (!fn || typeof fn.name !== 'string') {
			throw new Error('tool.function.name is required')
		}
		return {
			name: fn.name,
			description: fn.description,
			input_schema:
				(fn.parameters as Record<string, unknown>) ?? {type: 'object', properties: {}},
		}
	})
}

/** OpenAI tool_call shape (in response message.tool_calls[]). */
export interface OpenAIToolCall {
	id: string
	type: 'function'
	function: {name: string; arguments: string}
}

/** OpenAI assistant message shape returned to client. */
export interface OpenAITranslatedMessage {
	role: 'assistant'
	content: string | null
	tool_calls?: OpenAIToolCall[]
}

/**
 * Translate Anthropic response content[] (mix of text + tool_use blocks) into
 * an OpenAI assistant message: { role:'assistant', content, tool_calls? }.
 *
 *   - All text blocks concatenated into `content`.
 *   - Each tool_use block becomes a `tool_calls` entry with arguments JSON-stringified.
 *   - If only tool_use blocks (no text), content is null and tool_calls populated.
 *   - Unknown block types are silently skipped (forward-compatible with future
 *     Anthropic block kinds; passthrough should not crash on novel content).
 */
export function translateToolUseToOpenAI(
	anthropicContent: Array<{type: string; text?: string; id?: string; name?: string; input?: unknown}>,
): OpenAITranslatedMessage {
	const textParts: string[] = []
	const toolCalls: OpenAIToolCall[] = []
	for (const block of anthropicContent) {
		if (block.type === 'text' && typeof block.text === 'string') {
			textParts.push(block.text)
		} else if (block.type === 'tool_use' && block.id && block.name) {
			toolCalls.push({
				id: block.id,
				type: 'function',
				function: {
					name: block.name,
					arguments: JSON.stringify(block.input ?? {}),
				},
			})
		}
	}
	const content = textParts.length > 0 ? textParts.join('') : null
	const out: OpenAITranslatedMessage = {role: 'assistant', content}
	if (toolCalls.length > 0) out.tool_calls = toolCalls
	return out
}
