import type {AnthropicMessagesRequest, AnthropicContentBlock} from './types.js'

/** Args passed to the underlying SdkAgentRunner-equivalent run() invocation. */
export interface SdkRunArgs {
	task: string
	contextPrefix?: string
	systemPromptOverride?: string
}

/**
 * Translate an Anthropic Messages request into SdkAgentRunner.run() arguments.
 *
 * Strategy (per D-41-15):
 *   - The LATEST user message becomes `task`
 *   - All PRIOR messages (any role) are formatted as
 *       Previous conversation:
 *       User: <text>
 *
 *       Assistant: <text>
 *       ...
 *     and become `contextPrefix` (matches existing AI Chat pattern at
 *     livinityd ai/index.ts:433)
 *   - The `system` field (string or content-block array) becomes
 *     `systemPromptOverride`
 *   - Client-provided `tools` array is IGNORED per D-41-14 (caller MUST log
 *     a warning when present — handled in router.ts, not here)
 *
 * Throws Error with descriptive message on invalid input shape.
 *
 * Pure function — no I/O, no Express deps; easy to unit-test.
 */
export function translateAnthropicMessagesToSdkArgs(req: AnthropicMessagesRequest): SdkRunArgs {
	if (!req || typeof req !== 'object') {
		throw new Error('request must be an object')
	}
	if (!Array.isArray(req.messages) || req.messages.length === 0) {
		throw new Error('messages must be a non-empty array')
	}

	// Find latest user message (search from the end)
	let lastUserIdx = -1
	for (let i = req.messages.length - 1; i >= 0; i--) {
		if (req.messages[i]?.role === 'user') {
			lastUserIdx = i
			break
		}
	}
	if (lastUserIdx === -1) {
		throw new Error('no user message found in messages array')
	}

	const lastUserMsg = req.messages[lastUserIdx]
	const task = extractText(lastUserMsg)

	// Prior turns (everything before the latest user message)
	const priorTurns = req.messages.slice(0, lastUserIdx)
	let contextPrefix: string | undefined
	if (priorTurns.length > 0) {
		const formatted = priorTurns
			.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${extractText(m)}`)
			.join('\n\n')
		contextPrefix = `Previous conversation:\n${formatted}`
	}

	// System prompt.
	//
	// Phase 43.8 (broker passthrough identity fix): default to empty string
	// when the caller didn't set a system prompt. Combined with the sacred
	// file's `??` fix, this routes broker requests through the Agent SDK
	// with NO system prompt — matching raw Anthropic API semantics. Without
	// this, every broker-routed request (Open WebUI, marketplace AI apps)
	// inherited the Nexus agent default ("You are Nexus, an autonomous AI
	// assistant...") and the model identified as Nexus regardless of caller.
	//
	// Note: Anthropic models still hallucinate their own version label
	// (often saying "Claude 3.5 Sonnet" even on 4.x); this is an upstream
	// API artifact, not something the broker can correct without injecting
	// a system prompt — which would defeat the passthrough goal.
	let systemPromptOverride: string = ''
	if (typeof req.system === 'string') {
		systemPromptOverride = req.system
	} else if (Array.isArray(req.system)) {
		const textBlocks = req.system.filter(
			(b): b is AnthropicContentBlock => !!b && (b as AnthropicContentBlock).type === 'text',
		)
		if (textBlocks.length > 0) {
			systemPromptOverride = textBlocks.map((b) => b.text).join('\n')
		}
	}

	return {task, contextPrefix, systemPromptOverride}
}

function extractText(msg: {content: string | AnthropicContentBlock[] | unknown}): string {
	if (typeof msg.content === 'string') return msg.content
	if (Array.isArray(msg.content)) {
		const textBlocks = msg.content.filter(
			(b): b is AnthropicContentBlock =>
				!!b &&
				typeof (b as AnthropicContentBlock).type === 'string' &&
				(b as AnthropicContentBlock).type === 'text' &&
				typeof (b as AnthropicContentBlock).text === 'string',
		)
		return textBlocks.map((b) => b.text).join('\n')
	}
	throw new Error('message content must be string or text-block array')
}
