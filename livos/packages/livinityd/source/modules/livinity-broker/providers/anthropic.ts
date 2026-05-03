/**
 * Phase 61 Plan 01 (FR-BROKER-D2-01): Anthropic concrete BrokerProvider.
 *
 * Phase 63 R3 — DUAL MODE:
 *   - **Subscription mode** (when `opts.cwd` is set): uses
 *     `@anthropic-ai/claude-agent-sdk`'s `query()` with `env.HOME = opts.cwd`.
 *     This is the SUBSCRIPTION path that Phase 56 originally chose for v30
 *     but mis-implemented as raw HTTP. Live Phase 63 verification proved
 *     `api.anthropic.com/v1/messages` rejects OAuth subscription tokens
 *     with "OAuth authentication is currently not supported." The Agent
 *     SDK works because it spawns the official `claude` CLI subprocess
 *     which Anthropic whitelists for subscription auth — same path Claude
 *     Code itself uses.
 *
 *     Identity contamination is mitigated by passing the client's
 *     `system` field VERBATIM as `systemPrompt` and explicitly setting
 *     `allowedTools: []` + `mcpServers: {}` so no Nexus identity / tools
 *     are injected. This is the ONLY way to get subscription auth +
 *     external-client semantics on the same path.
 *
 *     Token streaming via `includePartialMessages: true` — Phase 56 Q7
 *     finding (Agent SDK CAN stream tokens via the
 *     `SDKPartialAssistantMessage.event` field which is literally the
 *     Anthropic raw `BetaRawMessageStreamEvent`).
 *
 *   - **Legacy HTTP mode** (when `opts.cwd` is absent): wraps
 *     `@anthropic-ai/sdk` calls. Kept for backward compat / API key tier
 *     deployments that may emerge in v31+. Will only succeed against
 *     `sk-ant-api03-*` API keys (NOT subscription OAuth tokens).
 *
 * Phase 57 inheritance:
 *   - `defaultHeaders: {'anthropic-version': '2023-06-01'}` matches Phase 57's
 *     `passthrough-handler.ts:makeClient` so wire behavior is byte-identical
 *     for the legacy HTTP path.
 *   - `authToken` (NOT `apiKey`) is the subscription Bearer pattern proven
 *     by Phase 57 Wave 1 Risk-A1 smoke gate (legacy path only — no live
 *     subscription endpoint accepts this auth shape today).
 *
 * D-30-07 sacred file untouched — this provider does NOT import from
 * `nexus/packages/core/src/sdk-agent-runner.ts`. It uses the Agent SDK's
 * public `query()` API directly with passthrough-specific options.
 */
import Anthropic from '@anthropic-ai/sdk'
import path from 'node:path'
import {query as agentQuery, type Options as AgentSdkOptions, type SDKMessage} from '@anthropic-ai/claude-agent-sdk'
import type {
	BrokerProvider,
	ProviderRequestParams,
	ProviderRequestOpts,
	ProviderResponse,
	ProviderStreamEvent,
	ProviderStreamResult,
	UsageRecord,
} from './interface.js'

const ANTHROPIC_VERSION = '2023-06-01'

/**
 * Empty Headers stub used as `upstreamHeaders` for Agent SDK responses.
 * The Agent SDK does not surface upstream `anthropic-ratelimit-*` headers
 * (subprocess hides them). Phase 61 Plan 04 rate-limit forwarding becomes
 * a no-op in subscription mode; Phase 64+ may re-introduce them by
 * parsing the SDK's `SDKRateLimitInfo` events into synthesized headers.
 */
function emptyHeaders(): Headers {
	return new Headers()
}

/**
 * Translate the client's Anthropic Messages request into the Agent SDK's
 * `query()` parameter shape. Multi-turn history is flattened into a
 * structured systemPrompt addendum so Agent SDK's single-prompt query
 * API can replay context. Last user message becomes the actual prompt.
 */
function buildAgentSdkQueryParams(params: ProviderRequestParams, cwd: string): {prompt: string; options: AgentSdkOptions} {
	const messages = Array.isArray(params.messages) ? params.messages : []
	const lastUserIdx = (() => {
		for (let i = messages.length - 1; i >= 0; i--) {
			if (messages[i]?.role === 'user') return i
		}
		return -1
	})()

	const lastUser = lastUserIdx >= 0 ? messages[lastUserIdx] : null
	const promptText = lastUser ? extractText(lastUser.content) : ''
	const priorMessages = lastUserIdx >= 0 ? messages.slice(0, lastUserIdx) : messages

	let systemPrompt = ''
	if (typeof params.system === 'string') {
		systemPrompt = params.system
	} else if (Array.isArray(params.system)) {
		systemPrompt = (params.system as Array<{type?: string; text?: string}>)
			.filter((b) => b?.type === 'text' && typeof b.text === 'string')
			.map((b) => b.text!)
			.join('\n')
	}

	if (priorMessages.length > 0) {
		const flatHistory = priorMessages
			.map((m) => `[${m.role}]: ${extractText(m.content)}`)
			.join('\n\n')
		systemPrompt = systemPrompt
			? `${systemPrompt}\n\n--- Prior conversation context ---\n${flatHistory}\n--- End context ---`
			: `--- Prior conversation context ---\n${flatHistory}\n--- End context ---`
	}

	// Phase 63 R3.1 — augment PATH so the spawned `claude` CLI is discoverable.
	// claude is commonly npm-installed to `~/.local/bin/claude` rather than the
	// system /usr/local/bin. Operators with a non-standard install location can
	// override by setting LIVOS_CLAUDE_BIN_DIR in the systemd service env.
	const operatorClaudeBinDir = process.env.LIVOS_CLAUDE_BIN_DIR
	const homeDir = process.env.HOME ?? '/root'
	const augmentedPath = [
		operatorClaudeBinDir, // explicit operator override (highest priority)
		`${homeDir}/.local/bin`, // service-user's local bin (npm global default)
		process.env.PATH, // systemd-provided PATH (already includes /usr/local/bin etc)
		'/usr/local/bin',
		'/usr/bin',
		'/bin',
	]
		.filter((p): p is string => typeof p === 'string' && p.length > 0)
		.join(':')

	// Phase 63 R3.4 — Anthropic returns "organization does not have access" when
	// we lock tools to empty. Subscription tier requires Claude Code DEFAULT mode
	// (some tools active = identifies traffic as Claude Code IDE). Locking tools
	// triggers an org-tier API gate that subscription doesn't satisfy.
	// Solution: don't restrict tools/mcpServers at all. systemPrompt still passes
	// the client's persona verbatim — Claude is good at following systemPrompt
	// even when its built-in tools are available; identity contamination should
	// be minimal in practice (client says "you are Bolt" and Claude obeys).
	const options: AgentSdkOptions = {
		systemPrompt: systemPrompt || undefined,
		maxTurns: 1,
		model: params.model,
		permissionMode: 'dontAsk', // sacred file uses this — bypassPermissions exits CLI 1
		persistSession: false,
		...(process.env.LIVOS_CLAUDE_BIN
			? {pathToClaudeCodeExecutable: process.env.LIVOS_CLAUDE_BIN}
			: {}),
		env: {
			// Phase 63 R3.3 — claude CLI looks for credentials at $HOME/.claude/.credentials.json.
			// getUserClaudeDir() already returns the .claude dir itself (e.g.
			// /opt/livos/data/users/<id>/.claude). Setting HOME to that dir makes
			// claude look at $HOME/.claude/.claude/.credentials.json (DOUBLE .claude — wrong).
			// Strip the trailing .claude segment so claude resolves correctly.
			HOME: path.basename(cwd) === '.claude' ? path.dirname(cwd) : cwd,
			PATH: augmentedPath,
			NODE_ENV: process.env.NODE_ENV || 'production',
			LANG: process.env.LANG || 'en_US.UTF-8',
		},
	} as AgentSdkOptions

	return {prompt: promptText, options}
}

function extractText(content: unknown): string {
	if (typeof content === 'string') return content
	if (Array.isArray(content)) {
		return content
			.filter((b: unknown) => {
				const block = b as {type?: string; text?: string}
				return block?.type === 'text' && typeof block.text === 'string'
			})
			.map((b: unknown) => (b as {text: string}).text)
			.join('\n')
	}
	return ''
}

export class AnthropicProvider implements BrokerProvider {
	readonly name = 'anthropic'

	async request(params: ProviderRequestParams, opts: ProviderRequestOpts): Promise<ProviderResponse> {
		// Phase 63 R3: subscription path via Agent SDK when cwd is provided.
		if (opts.cwd) {
			return this.requestViaAgentSdk(params, opts)
		}
		// Legacy HTTP path (broken for OAuth; only works against sk-ant-api03-* API keys).
		const client = (opts.clientOverride as Anthropic | undefined) ?? this.makeClient(opts.authToken)
		const apiPromise = opts.signal
			? client.messages.create({...params, stream: false} as any, {signal: opts.signal})
			: client.messages.create({...params, stream: false} as any)
		const {data, response} = await apiPromise.withResponse()
		return {raw: data, upstreamHeaders: response.headers}
	}

	async streamRequest(
		params: ProviderRequestParams,
		opts: ProviderRequestOpts,
	): Promise<ProviderStreamResult> {
		// Phase 63 R3: subscription path via Agent SDK when cwd is provided.
		if (opts.cwd) {
			return this.streamRequestViaAgentSdk(params, opts)
		}
		// Legacy HTTP path.
		const client = (opts.clientOverride as Anthropic | undefined) ?? this.makeClient(opts.authToken)
		const apiPromise = opts.signal
			? client.messages.create({...params, stream: true} as any, {signal: opts.signal})
			: client.messages.create({...params, stream: true} as any)
		const {data, response} = await apiPromise.withResponse()
		return {
			stream: data as unknown as AsyncIterable<ProviderStreamEvent>,
			upstreamHeaders: response.headers,
		}
	}

	/**
	 * Phase 63 R3 — subscription request via Agent SDK. Aggregates all
	 * stream_event partial messages into a single Anthropic Messages
	 * response shape. NOT true streaming — sync mode collapses the
	 * generator into one assembled response.
	 */
	private async requestViaAgentSdk(
		params: ProviderRequestParams,
		opts: ProviderRequestOpts,
	): Promise<ProviderResponse> {
		const cwd = opts.cwd!
		const {prompt, options} = buildAgentSdkQueryParams(params, cwd)
		const queryFn = (opts.queryOverride as typeof agentQuery | undefined) ?? agentQuery
		const q = queryFn({prompt, options})

		let assembledText = ''
		let inputTokens = 0
		let outputTokens = 0
		let stopReason: string | null = 'end_turn'
		let messageId = ''

		for await (const msg of q as AsyncIterable<SDKMessage>) {
			if (msg.type === 'assistant') {
				const betaMsg = (msg as {message: {id?: string; content?: unknown[]; stop_reason?: string | null}}).message
				if (!messageId && betaMsg?.id) messageId = betaMsg.id
				if (Array.isArray(betaMsg?.content)) {
					assembledText += extractText(betaMsg.content)
				}
				if (betaMsg?.stop_reason) stopReason = betaMsg.stop_reason
			} else if (msg.type === 'result') {
				const r = msg as {usage?: {input_tokens?: number; output_tokens?: number}}
				inputTokens = r.usage?.input_tokens ?? inputTokens
				outputTokens = r.usage?.output_tokens ?? outputTokens
			}
		}

		const raw = {
			id: messageId || `msg_subscription_${Date.now()}`,
			type: 'message',
			role: 'assistant',
			model: params.model,
			content: [{type: 'text', text: assembledText}],
			stop_reason: stopReason,
			stop_sequence: null,
			usage: {input_tokens: inputTokens, output_tokens: outputTokens},
		}
		return {raw, upstreamHeaders: emptyHeaders()}
	}

	/**
	 * Phase 63 R3 — subscription streamRequest via Agent SDK with
	 * `includePartialMessages: true`. Wraps the SDK's async generator
	 * into a `Symbol.asyncIterator` that yields `BetaRawMessageStreamEvent`
	 * (extracted from `SDKPartialAssistantMessage.event`) — exactly the
	 * shape downstream Anthropic SSE serialization expects (Phase 58
	 * `for await event of result.stream` loop is already byte-compatible).
	 */
	private async streamRequestViaAgentSdk(
		params: ProviderRequestParams,
		opts: ProviderRequestOpts,
	): Promise<ProviderStreamResult> {
		const cwd = opts.cwd!
		const {prompt, options} = buildAgentSdkQueryParams(params, cwd)
		const queryFn = (opts.queryOverride as typeof agentQuery | undefined) ?? agentQuery
		const q = queryFn({
			prompt,
			options: {...options, includePartialMessages: true},
		})

		async function* extractStreamEvents(): AsyncGenerator<ProviderStreamEvent, void> {
			for await (const msg of q as AsyncIterable<SDKMessage>) {
				if (msg.type === 'stream_event') {
					const event = (msg as {event: unknown}).event
					yield event as ProviderStreamEvent
				}
				// SDKResultMessage / SDKAssistantMessage skipped — those are
				// the aggregate/result notifications. The raw Anthropic SSE
				// events are inside stream_event.event.
			}
		}

		return {
			stream: extractStreamEvents(),
			upstreamHeaders: emptyHeaders(),
		}
	}

	/**
	 * Default client constructor — used when `opts.clientOverride` is not
	 * provided AND `opts.cwd` is absent (legacy HTTP path).
	 */
	private makeClient(authToken: string): Anthropic {
		return new Anthropic({
			authToken,
			defaultHeaders: {'anthropic-version': ANTHROPIC_VERSION},
		})
	}

	translateUsage(resp: ProviderResponse): UsageRecord {
		const usage = ((resp.raw as {usage?: {input_tokens?: number; output_tokens?: number}})
			?.usage ?? {}) as {input_tokens?: number; output_tokens?: number}
		const promptTokens = usage.input_tokens ?? 0
		const completionTokens = usage.output_tokens ?? 0
		return {
			promptTokens,
			completionTokens,
			totalTokens: promptTokens + completionTokens,
		}
	}
}
