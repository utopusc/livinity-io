/**
 * Anthropic Messages API wire types — broker request shape.
 *
 * Reference: https://docs.anthropic.com/en/api/messages
 *
 * Subset of fields the broker validates + uses; remaining fields ignored by
 * Phase 41 (and may be passed through opaquely later).
 *
 * Phase 41 only handles `text` content blocks. `image` / `tool_use` /
 * `tool_result` blocks are deferred to a later phase.
 */

export interface AnthropicContentBlock {
	type: 'text'
	text: string
}

export interface AnthropicMessage {
	role: 'user' | 'assistant'
	content: string | AnthropicContentBlock[]
}

export interface AnthropicMessagesRequest {
	model: string
	messages: AnthropicMessage[]
	system?: string | AnthropicContentBlock[]
	max_tokens?: number
	stream?: boolean
	/** IGNORED per D-41-14, but typed for input validation */
	tools?: unknown[]
	// Other Anthropic fields not consumed by broker (top_k, top_p, temperature, ...)
	[extra: string]: unknown
}

/** Module deps: livinityd instance handle the broker needs at runtime. */
export interface BrokerDeps {
	livinityd: import('../../index.js').default
}

// Phase 57: dual-mode dispatch
export type BrokerMode = 'passthrough' | 'agent'
