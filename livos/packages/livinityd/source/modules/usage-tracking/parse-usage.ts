/**
 * Phase 44 Plan 44-02 — pure parser for broker_usage row extraction.
 *
 * Imports ZERO from livinity-broker/* (sacred boundary). The parser only knows
 * about wire-format JSON (Anthropic Messages + OpenAI Chat Completions).
 *
 * Behaviour:
 *  - sync responses: parse JSON body for `usage` object
 *  - SSE responses: scan accumulated buffer for terminal usage chunk
 *  - status 429: short-circuit to throttled row (regardless of body shape)
 *  - malformed bodies / missing usage: return null (no crash, no log spam)
 *  - unknown URL paths: return null (defense-in-depth)
 */

export type ParsedUsage = {
	prompt_tokens: number
	completion_tokens: number
	model: string | null
	request_id: string | null
	endpoint: 'messages' | 'chat-completions' | '429-throttled'
}

type Body = string | Buffer | object | null | undefined

function detectEndpoint(urlPath: string): 'messages' | 'chat-completions' | null {
	if (urlPath.includes('/v1/chat/completions')) return 'chat-completions'
	if (urlPath.includes('/v1/messages')) return 'messages'
	return null
}

function coerceJson(body: Body): Record<string, unknown> | null {
	if (body === null || body === undefined) return null
	if (typeof body === 'object' && !Buffer.isBuffer(body)) return body as Record<string, unknown>
	let text: string
	if (Buffer.isBuffer(body)) text = body.toString('utf8')
	else if (typeof body === 'string') text = body
	else return null
	try {
		const parsed = JSON.parse(text)
		if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
		return null
	} catch {
		return null
	}
}

/**
 * Parse a sync (non-SSE) response body into a ParsedUsage row, or null if no
 * usage is present.
 */
export function parseUsageFromResponse(opts: {
	body: Body
	statusCode: number
	urlPath: string
}): ParsedUsage | null {
	const endpoint = detectEndpoint(opts.urlPath)
	if (opts.statusCode === 429 && endpoint !== null) {
		return {
			prompt_tokens: 0,
			completion_tokens: 0,
			model: null,
			request_id: null,
			endpoint: '429-throttled',
		}
	}
	if (endpoint === null) return null

	const json = coerceJson(opts.body)
	if (json === null) return null

	const usage = json.usage as Record<string, unknown> | undefined
	if (!usage || typeof usage !== 'object') return null

	if (endpoint === 'messages') {
		const inputTokens = typeof usage.input_tokens === 'number' ? usage.input_tokens : null
		const outputTokens = typeof usage.output_tokens === 'number' ? usage.output_tokens : null
		if (inputTokens === null && outputTokens === null) return null
		return {
			prompt_tokens: inputTokens ?? 0,
			completion_tokens: outputTokens ?? 0,
			model: typeof json.model === 'string' ? json.model : null,
			request_id: typeof json.id === 'string' ? json.id : null,
			endpoint: 'messages',
		}
	}

	// chat-completions
	const promptTokens = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : null
	const completionTokens = typeof usage.completion_tokens === 'number' ? usage.completion_tokens : null
	if (promptTokens === null && completionTokens === null) return null
	return {
		prompt_tokens: promptTokens ?? 0,
		completion_tokens: completionTokens ?? 0,
		model: typeof json.model === 'string' ? json.model : null,
		request_id: typeof json.id === 'string' ? json.id : null,
		endpoint: 'chat-completions',
	}
}

/**
 * Parse an accumulated SSE buffer for terminal usage data.
 *
 * For Anthropic streams: aggregate input_tokens from `message_start` and
 * output_tokens from `message_delta`. Both events optional (defensive).
 *
 * For OpenAI streams: scan for any chunk that has a `usage` key. Current
 * broker (Phase 42) does NOT emit this — function returns null in that case
 * (no row written, no log spam). Future stream_options.include_usage support
 * would slot in here without parser changes.
 */
export function parseUsageFromSseBuffer(opts: {
	sseBuffer: string
	urlPath: string
}): ParsedUsage | null {
	const endpoint = detectEndpoint(opts.urlPath)
	if (endpoint === null) return null

	const lines = opts.sseBuffer.split('\n')
	let inputTokens: number | null = null
	let outputTokens: number | null = null
	let model: string | null = null
	let requestId: string | null = null

	for (const rawLine of lines) {
		const line = rawLine.trimEnd()
		// Tolerate both "data: ..." and "data:..." (no space)
		let payload: string | null = null
		if (line.startsWith('data: ')) payload = line.slice(6)
		else if (line.startsWith('data:')) payload = line.slice(5)
		if (payload === null) continue
		if (payload === '[DONE]') continue

		let chunk: Record<string, unknown>
		try {
			const parsed = JSON.parse(payload)
			if (!parsed || typeof parsed !== 'object') continue
			chunk = parsed as Record<string, unknown>
		} catch {
			continue
		}

		if (endpoint === 'messages') {
			// Anthropic: message_start carries message.id + message.model + message.usage.input_tokens
			if (chunk.type === 'message_start') {
				const message = chunk.message as Record<string, unknown> | undefined
				if (message && typeof message === 'object') {
					if (typeof message.id === 'string') requestId = message.id
					if (typeof message.model === 'string') model = message.model
					const usage = message.usage as Record<string, unknown> | undefined
					if (usage && typeof usage.input_tokens === 'number') {
						inputTokens = usage.input_tokens
					}
				}
			} else if (chunk.type === 'message_delta') {
				// Terminal chunk with usage.output_tokens
				const usage = chunk.usage as Record<string, unknown> | undefined
				if (usage && typeof usage.output_tokens === 'number') {
					outputTokens = usage.output_tokens
				}
			}
		} else {
			// chat-completions: scan for a chunk that has usage at top level
			const usage = chunk.usage as Record<string, unknown> | undefined
			if (usage && typeof usage === 'object') {
				const pt = usage.prompt_tokens
				const ct = usage.completion_tokens
				if (typeof pt === 'number') inputTokens = pt
				if (typeof ct === 'number') outputTokens = ct
				if (typeof chunk.id === 'string') requestId = chunk.id
				if (typeof chunk.model === 'string') model = chunk.model
			}
		}
	}

	if (inputTokens === null && outputTokens === null) return null
	return {
		prompt_tokens: inputTokens ?? 0,
		completion_tokens: outputTokens ?? 0,
		model,
		request_id: requestId,
		endpoint,
	}
}
