/**
 * AnthropicProvider — subscription passthrough via @anthropic-ai/claude-agent-sdk
 *
 * Phase 63 R3.9 — DYNAMIC CLIENT-TOOLS MCP BRIDGE
 * --------------------------------------------------
 * External clients (Bolt.diy, Cursor, Cline, etc.) send Anthropic Messages
 * API requests with `tools: [...]` array — their own client-supplied tools
 * (file writers, shell runners, web fetchers). For full agentic operation,
 * Claude needs to know about these tools so it can emit `tool_use` content
 * blocks in its response.
 *
 * The challenge: Agent SDK's `query()` only accepts tools via the
 * `mcpServers` option (MCP-server-style registration), not as raw Anthropic
 * tools[]. So we DYNAMICALLY register each client tool as an in-process
 * SDK MCP server tool at request time.
 *
 * Strategy:
 *   1. Convert each client tool's JSON Schema to a Zod schema (minimal subset)
 *   2. Wrap as `tool(name, description, schema, handler)` from claude-agent-sdk
 *   3. Register all under one in-process MCP server (`client-tools`)
 *   4. allowedTools whitelists `mcp__client-tools__<name>` for each
 *   5. Stream events to client; rewrite tool name in stream to strip MCP prefix
 *   6. ABORT SDK iteration after first `message_stop` event so claude doesn't
 *      execute fake handler results in a continuation loop
 *
 * Why abort: when Claude calls a client tool, our handler returns a placeholder
 * (we can't actually execute it server-side — only the client knows how).
 * Without abort, SDK feeds the placeholder back to Claude, which would respond
 * based on fake info. We want Claude to emit ONE clean assistant turn with
 * tool_use blocks, then stop. Client (Bolt) executes locally + sends new
 * request with `tool_result` for the next turn.
 *
 * D-30-07 sacred file untouched — this provider does NOT import from
 * `nexus/packages/core/src/sdk-agent-runner.ts`. Uses Agent SDK's public
 * `query()` API directly with passthrough-specific options.
 */
import Anthropic from '@anthropic-ai/sdk'
import path from 'node:path'
import {z, type ZodTypeAny, type ZodRawShape} from 'zod'
import {
	query as agentQuery,
	createSdkMcpServer,
	tool,
	type Options as AgentSdkOptions,
	type SDKMessage,
} from '@anthropic-ai/claude-agent-sdk'
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
const CLIENT_MCP_SERVER_NAME = 'client-tools'
const CLIENT_MCP_TOOL_PREFIX = `mcp__${CLIENT_MCP_SERVER_NAME}__`

/**
 * Empty Headers stub used as `upstreamHeaders` for Agent SDK responses.
 * The Agent SDK does not surface upstream `anthropic-ratelimit-*` headers
 * (subprocess hides them).
 */
function emptyHeaders(): Headers {
	return new Headers()
}

/**
 * Minimal JSON Schema → Zod converter for client tool input_schema.
 * Supports the common subset: object/string/number/integer/boolean/array
 * with optional `description`, `enum`, and `required[]`. Unknown types
 * fall back to `z.any()` so we don't fail-closed on edge cases.
 */
function jsonSchemaToZodShape(schema: unknown): ZodRawShape {
	if (!schema || typeof schema !== 'object') return {}
	const s = schema as Record<string, unknown>
	if (s.type !== 'object' || typeof s.properties !== 'object' || s.properties === null) return {}

	const properties = s.properties as Record<string, unknown>
	const required = Array.isArray(s.required) ? new Set(s.required as string[]) : new Set<string>()
	const shape: ZodRawShape = {}

	for (const [propName, propSchemaRaw] of Object.entries(properties)) {
		let zodType: ZodTypeAny = jsonSchemaPropertyToZod(propSchemaRaw)
		if (!required.has(propName)) zodType = zodType.optional()
		shape[propName] = zodType
	}
	return shape
}

function jsonSchemaPropertyToZod(propSchema: unknown): ZodTypeAny {
	if (!propSchema || typeof propSchema !== 'object') return z.any()
	const p = propSchema as Record<string, unknown>
	const desc = typeof p.description === 'string' ? p.description : undefined

	let base: ZodTypeAny
	if (Array.isArray(p.enum)) {
		const values = p.enum as Array<string | number>
		if (values.length === 0) base = z.any()
		else if (values.every((v) => typeof v === 'string'))
			base = z.enum(values as [string, ...string[]])
		else base = z.union(values.map((v) => z.literal(v)) as any)
	} else {
		switch (p.type) {
			case 'string':
				base = z.string()
				break
			case 'number':
				base = z.number()
				break
			case 'integer':
				base = z.number().int()
				break
			case 'boolean':
				base = z.boolean()
				break
			case 'array':
				base = z.array(jsonSchemaPropertyToZod(p.items))
				break
			case 'object':
				base = z.object(jsonSchemaToZodShape(p))
				break
			default:
				base = z.any()
		}
	}
	return desc ? base.describe(desc) : base
}

interface ClientToolDef {
	name: string
	description?: string
	input_schema?: unknown
}

/**
 * Build an in-process SDK MCP server wrapping the client's tools[].
 * Each tool's handler is a no-op — it returns a placeholder result the SDK
 * never actually delivers to Claude (we abort the iteration before SDK
 * finishes the agent loop). Returning the placeholder synchronously is
 * defensive: if abort fails for any reason, Claude sees "pending" and stops.
 */
function buildClientToolsMcp(clientTools: ClientToolDef[] | undefined) {
	if (!Array.isArray(clientTools) || clientTools.length === 0) return null
	const sdkTools = clientTools
		.filter((t) => t && typeof t.name === 'string' && t.name.length > 0)
		.map((t) =>
			tool(
				t.name,
				t.description || `Client-supplied tool: ${t.name}`,
				jsonSchemaToZodShape(t.input_schema),
				async () => ({
					content: [
						{type: 'text' as const, text: 'pending: client will execute this tool'},
					],
				}),
			),
		)
	if (sdkTools.length === 0) return null
	return createSdkMcpServer({
		name: CLIENT_MCP_SERVER_NAME,
		version: '1.0.0',
		tools: sdkTools,
	})
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

/**
 * Build query() params + options. Includes client tools when present so
 * Claude can emit tool_use content blocks.
 */
function buildAgentSdkQueryParams(
	params: ProviderRequestParams,
	cwd: string,
): {prompt: string; options: AgentSdkOptions; clientToolNames: string[]} {
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

	// Augment PATH so the spawned `claude` CLI is discoverable.
	const operatorClaudeBinDir = process.env.LIVOS_CLAUDE_BIN_DIR
	const homeDir = process.env.HOME ?? '/root'
	const augmentedPath = [
		operatorClaudeBinDir,
		`${homeDir}/.local/bin`,
		process.env.PATH,
		'/usr/local/bin',
		'/usr/bin',
		'/bin',
	]
		.filter((p): p is string => typeof p === 'string' && p.length > 0)
		.join(':')

	// Build dynamic MCP server from client tools (Bolt's tools[] forwarded).
	const clientTools = (params as {tools?: ClientToolDef[]}).tools
	const clientMcp = buildClientToolsMcp(clientTools)
	const clientToolNames = Array.isArray(clientTools)
		? clientTools.filter((t) => t && t.name).map((t) => t.name)
		: []

	// Compose mcpServers + allowedTools. Always include the dummy noop server
	// to satisfy the subscription "MCP-mode required" gate even when client
	// sent zero tools (chat-only request).
	const mcpServers: Record<string, any> = {}
	const allowedTools: string[] = []
	if (clientMcp) {
		mcpServers[CLIENT_MCP_SERVER_NAME] = clientMcp
		for (const name of clientToolNames) {
			allowedTools.push(`${CLIENT_MCP_TOOL_PREFIX}${name}`)
		}
	} else {
		mcpServers['passthrough-noop'] = passthroughDummyMcp
		allowedTools.push('mcp__passthrough-noop__noop')
	}

	// Phase 63 R3.10 — disallow built-in Claude Code tools so Claude is forced
	// to use ONLY the client-supplied tools (Bolt's file_write etc). Without
	// this, Claude defaults to Bash/Read/Write for file ops, SDK errors with
	// "Model tried to call unavailable tool 'Bash'" because allowedTools
	// excludes built-ins.
	const builtInTools = ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Task', 'TodoWrite', 'WebFetch', 'WebSearch', 'NotebookEdit']
	const clientToolList = clientToolNames.length > 0 ? clientToolNames.join(', ') : 'none'
	const finalSystemPrompt = (systemPrompt || '') +
		`\n\nIMPORTANT: You are a passthrough proxy. The user has provided these tools: ${clientToolList}. ` +
		`You MUST use ONLY these tools by their exact names. Built-in Claude Code tools (Bash, Read, Write, Edit, Glob, Grep, etc.) are NOT AVAILABLE — never attempt to call them. ` +
		`If the user asks for something requiring file/shell ops, use the user's provided tools.`

	const options: AgentSdkOptions = {
		systemPrompt: finalSystemPrompt,
		mcpServers,
		allowedTools,
		disallowedTools: builtInTools,
		maxTurns: 1,
		model: params.model,
		permissionMode: 'dontAsk',
		persistSession: false,
		...(process.env.LIVOS_CLAUDE_BIN
			? {pathToClaudeCodeExecutable: process.env.LIVOS_CLAUDE_BIN}
			: {}),
		env: {
			HOME: path.basename(cwd) === '.claude' ? path.dirname(cwd) : cwd,
			PATH: augmentedPath,
			NODE_ENV: process.env.NODE_ENV || 'production',
			LANG: process.env.LANG || 'en_US.UTF-8',
		},
	} as AgentSdkOptions

	return {prompt: promptText, options, clientToolNames}
}

// Dummy MCP for chat-only requests (no client tools) — keeps subscription
// "MCP-mode required" gate satisfied. Never invoked because systemPrompt
// instructs Claude to answer directly.
const passthroughDummyMcp = createSdkMcpServer({
	name: 'passthrough-noop',
	version: '1.0.0',
	tools: [
		tool(
			'noop',
			'No-op placeholder. DO NOT INVOKE — answer directly to the user.',
			{},
			async () => ({content: [{type: 'text' as const, text: 'noop'}]}),
		),
	],
})

/**
 * Rewrite a stream event so that any tool_use's `name` field has the
 * `mcp__client-tools__` prefix stripped (so the client sees its original
 * tool name, not the SDK-internal MCP-prefixed form).
 */
function stripMcpPrefix(event: any): any {
	if (!event || typeof event !== 'object') return event
	if (
		event.type === 'content_block_start' &&
		event.content_block?.type === 'tool_use' &&
		typeof event.content_block.name === 'string' &&
		event.content_block.name.startsWith(CLIENT_MCP_TOOL_PREFIX)
	) {
		return {
			...event,
			content_block: {
				...event.content_block,
				name: event.content_block.name.slice(CLIENT_MCP_TOOL_PREFIX.length),
			},
		}
	}
	return event
}

export class AnthropicProvider implements BrokerProvider {
	readonly name = 'anthropic'

	async request(params: ProviderRequestParams, opts: ProviderRequestOpts): Promise<ProviderResponse> {
		if (opts.cwd) return this.requestViaAgentSdk(params, opts)
		// Legacy HTTP path (subscription OAuth not accepted, only API keys).
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
		if (opts.cwd) return this.streamRequestViaAgentSdk(params, opts)
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
	 * Subscription request via Agent SDK (sync). Aggregates all stream_event
	 * partial messages into a single Anthropic Messages response shape.
	 * Captures tool_use content blocks if Claude emitted any.
	 */
	private async requestViaAgentSdk(
		params: ProviderRequestParams,
		opts: ProviderRequestOpts,
	): Promise<ProviderResponse> {
		const cwd = opts.cwd!
		const {prompt, options} = buildAgentSdkQueryParams(params, cwd)
		const queryFn = (opts.queryOverride as typeof agentQuery | undefined) ?? agentQuery
		const q = queryFn({prompt, options: {...options, includePartialMessages: true}})

		// Aggregate stream events to construct final Messages response.
		let messageId = ''
		let inputTokens = 0
		let outputTokens = 0
		let stopReason: string | null = 'end_turn'
		const contentBlocks: any[] = []
		let currentBlock: any = null
		let currentInputJsonAcc = ''
		let sawToolUse = false

		try {
			for await (const msg of q as AsyncIterable<SDKMessage>) {
				if (msg.type !== 'stream_event') {
					if (msg.type === 'result') {
						const r = msg as {usage?: {input_tokens?: number; output_tokens?: number}}
						inputTokens = r.usage?.input_tokens ?? inputTokens
						outputTokens = r.usage?.output_tokens ?? outputTokens
					}
					continue
				}
				const ev = stripMcpPrefix((msg as any).event)
				switch (ev.type) {
					case 'message_start':
						if (ev.message?.id) messageId = ev.message.id
						if (ev.message?.usage) {
							inputTokens = ev.message.usage.input_tokens ?? inputTokens
							outputTokens = ev.message.usage.output_tokens ?? outputTokens
						}
						break
					case 'content_block_start':
						currentBlock = JSON.parse(JSON.stringify(ev.content_block))
						currentInputJsonAcc = ''
						if (currentBlock?.type === 'tool_use') sawToolUse = true
						break
					case 'content_block_delta':
						if (!currentBlock) break
						if (ev.delta?.type === 'text_delta' && currentBlock.type === 'text') {
							currentBlock.text = (currentBlock.text || '') + (ev.delta.text || '')
						} else if (ev.delta?.type === 'input_json_delta' && currentBlock.type === 'tool_use') {
							currentInputJsonAcc += ev.delta.partial_json || ''
						}
						break
					case 'content_block_stop':
						if (currentBlock) {
							if (currentBlock.type === 'tool_use' && currentInputJsonAcc) {
								try {
									currentBlock.input = JSON.parse(currentInputJsonAcc)
								} catch {
									currentBlock.input = {}
								}
							}
							contentBlocks.push(currentBlock)
							currentBlock = null
							currentInputJsonAcc = ''
						}
						// If Claude emitted a tool_use block, abort to prevent fake-result loop.
						if (sawToolUse) {
							stopReason = 'tool_use'
							// Drain & break — abort happens via natural iterator return below.
						}
						break
					case 'message_delta':
						if (ev.delta?.stop_reason) stopReason = ev.delta.stop_reason
						if (ev.usage?.output_tokens != null) outputTokens = ev.usage.output_tokens
						break
					case 'message_stop':
						// End the iteration here even if SDK would continue (tool-use loop).
						if (sawToolUse && stopReason !== 'tool_use') stopReason = 'tool_use'
						return {
							raw: {
								id: messageId || `msg_subscription_${Date.now()}`,
								type: 'message',
								role: 'assistant',
								model: params.model,
								content: contentBlocks,
								stop_reason: stopReason,
								stop_sequence: null,
								usage: {input_tokens: inputTokens, output_tokens: outputTokens},
							},
							upstreamHeaders: emptyHeaders(),
						}
				}
			}
		} catch (err) {
			// Iterator may throw when aborted — fall through to return aggregated result.
		}

		return {
			raw: {
				id: messageId || `msg_subscription_${Date.now()}`,
				type: 'message',
				role: 'assistant',
				model: params.model,
				content: contentBlocks,
				stop_reason: sawToolUse ? 'tool_use' : stopReason,
				stop_sequence: null,
				usage: {input_tokens: inputTokens, output_tokens: outputTokens},
			},
			upstreamHeaders: emptyHeaders(),
		}
	}

	/**
	 * Subscription streamRequest via Agent SDK with `includePartialMessages: true`.
	 * Forwards Anthropic raw stream events to the client. When Claude emits a
	 * tool_use block, aborts SDK iteration after message_stop so the client
	 * sees a clean assistant turn and can continue the agentic loop with real
	 * tool_results in its next request.
	 */
	private async streamRequestViaAgentSdk(
		params: ProviderRequestParams,
		opts: ProviderRequestOpts,
	): Promise<ProviderStreamResult> {
		const cwd = opts.cwd!
		const {prompt, options} = buildAgentSdkQueryParams(params, cwd)
		const queryFn = (opts.queryOverride as typeof agentQuery | undefined) ?? agentQuery
		const q = queryFn({prompt, options: {...options, includePartialMessages: true}})

		async function* extractStreamEvents(): AsyncGenerator<ProviderStreamEvent, void> {
			let sawToolUse = false
			let streamClosed = false
			try {
				for await (const msg of q as AsyncIterable<SDKMessage>) {
					if (msg.type !== 'stream_event') continue
					const event = stripMcpPrefix((msg as any).event)
					if (
						event.type === 'content_block_start' &&
						event.content_block?.type === 'tool_use'
					) {
						sawToolUse = true
					}
					// Force stop_reason to 'tool_use' if we saw tool_use (override SDK aggregate).
					if (event.type === 'message_delta' && sawToolUse) {
						event.delta = {...(event.delta || {}), stop_reason: 'tool_use'}
					}
					yield event as ProviderStreamEvent
					if (event.type === 'message_stop') {
						streamClosed = true
						break
					}
				}
			} catch {
				// Iterator aborted — natural for tool-use early-termination.
			}
			// If we saw tool_use but never got message_stop, synthesize one so
			// the client receives a complete Anthropic Messages turn.
			if (!streamClosed && sawToolUse) {
				yield {
					type: 'message_delta',
					delta: {stop_reason: 'tool_use', stop_sequence: null},
					usage: {output_tokens: 0},
				} as unknown as ProviderStreamEvent
				yield {type: 'message_stop'} as unknown as ProviderStreamEvent
			}
		}

		return {
			stream: extractStreamEvents(),
			upstreamHeaders: emptyHeaders(),
		}
	}

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
