import Anthropic from '@anthropic-ai/sdk'
import type {Response} from 'express'
import {UpstreamHttpError} from './agent-runner-factory.js'
import {readSubscriptionToken, type SubscriptionToken} from './credential-extractor.js'
import type {AnthropicMessagesRequest} from './types.js'
import type Livinityd from '../../index.js'
import {getProvider} from './providers/registry.js'
import type {ProviderResponse, ProviderStreamResult} from './providers/interface.js'
import {forwardAnthropicHeaders, translateAnthropicToOpenAIHeaders} from './rate-limit-headers.js'
import {ensureUserClaudeDir} from '../ai/per-user-claude.js'

/**
 * Phase 57 (FR-BROKER-A1-01..03): Anthropic Messages passthrough handler.
 *
 * Forwards the client's request directly to api.anthropic.com via the
 * @anthropic-ai/sdk client with the per-user subscription accessToken.
 * Preserves system prompt + tools[] verbatim. Does NOT inject Nexus
 * identity. Does NOT inject any Nexus MCP tools.
 *
 * Boundary note (Pitfall 1): this module imports ONLY from broker-local
 * files and the public Anthropic SDK. It does NOT import from any
 * upstream nexus runner module — the passthrough path is broker-local
 * and bypasses the agent runner entirely.
 *
 * Streaming behavior:
 *   - Phase 58 Wave 2 (FR-BROKER-C1-01): true token streaming. The
 *     streaming branch of passthroughAnthropicMessages iterates
 *     client.messages.create({stream:true})'s async iterable and writes
 *     each event as `event: <type>\ndata: <json>\n\n` — verbatim
 *     pass-through of the upstream Anthropic SSE event sequence at the
 *     same temporal cadence as upstream emits.
 *   - Phase 58 Wave 3 (FR-BROKER-C2-01..02): true 1:1 delta translation
 *     for the OpenAI Chat Completions surface. The streaming branch of
 *     passthroughOpenAIChatCompletions iterates the same SDK async
 *     iterable and feeds each event through Wave 1's
 *     createAnthropicToOpenAIStreamTranslator, which writes
 *     chat.completion.chunk SSE lines per delta and a terminal chunk +
 *     `data: [DONE]\n\n` on stream end. Sync (stream:false) chatcmpl id
 *     uses Wave 1's crypto.randomBytes-backed randomChatCmplId
 *     (FR-BROKER-C2-03; Phase 57 Pitfall 4 closed).
 *
 * Phase 61 Plan 01 Wave 1 (FR-BROKER-D2-02): SDK calls dispatch through
 * BrokerProvider. Inline `client.messages.create(...)` is replaced with
 * `getProvider('anthropic').request(...)` / `streamRequest(...)`. Both
 * provider methods invoke `.withResponse()` so upstream Web Fetch Headers
 * are reachable in `result.upstreamHeaders` for Plan 04 (Wave 4) rate-limit
 * forwarding. The `result.upstreamHeaders` value is captured but NOT
 * written to `res` in Plan 01 — Wave 4 inserts `forwardAnthropicHeaders(...)`
 * at the marked placeholders below. Behavior-preserving refactor only.
 *
 * The Phase 58 Wave 0 `clientFactory` test seam is preserved by passing the
 * factory-built client through `ProviderRequestOpts.clientOverride`. The
 * `tryRefreshAndRetry` path now invokes the provider with a refreshed-token
 * `clientOverride` instead of constructing a separate `Anthropic` instance.
 */

export interface PassthroughOpts {
	livinityd: Livinityd
	userId: string
	body: AnthropicMessagesRequest
	res: Response
	/**
	 * Phase 63 R3 — when set, dispatch via Agent SDK subscription path
	 * with `env.HOME = passthroughCwd`. When omitted, falls back to legacy
	 * HTTP path with token extraction (test suites + API key tier path).
	 * Production callers (router.ts) compute this via
	 * `await ensureUserClaudeDir(livinityd, userId)` and forward.
	 */
	passthroughCwd?: string
	/**
	 * Phase 58 Wave 0 (test seam): override default Anthropic client construction.
	 * Used by Wave 4 integration tests to wire the SDK to a fake-Anthropic SSE
	 * server via baseURL. Production code paths leave this undefined; behavior
	 * unchanged from Phase 57 when undefined.
	 *
	 * Phase 61 Plan 01 Wave 1: factory-built client is forwarded to the provider
	 * via `ProviderRequestOpts.clientOverride`. The provider uses it verbatim
	 * (skipping its own Anthropic constructor) so wire behavior remains
	 * byte-identical with pre-Phase-61.
	 */
	clientFactory?: (token: SubscriptionToken) => Anthropic
}

const ANTHROPIC_VERSION = '2023-06-01'
const TOKEN_REFRESH_URL = 'https://platform.claude.com/v1/oauth/token'

/**
 * Construct an Anthropic SDK client bound to the given subscription token.
 * Per Wave 1 Risk-A1 smoke gate: SDK produces `Authorization: Bearer <token>`
 * headers automatically when `authToken` (NOT `apiKey`) is supplied.
 *
 * Phase 61 Plan 01 Wave 1: still exported so Phase 58 integration tests'
 * `makeFakeClientFactory` (which builds an Anthropic instance pointing at
 * the loopback fake-server) continues to work unchanged. Production calls
 * now flow through the BrokerProvider which constructs its own client when
 * `clientOverride` is absent (matching this construction).
 */
export function makeClient(token: SubscriptionToken): Anthropic {
	return new Anthropic({
		authToken: token.accessToken,
		defaultHeaders: {'anthropic-version': ANTHROPIC_VERSION},
	})
}

/**
 * Map @anthropic-ai/sdk APIError → UpstreamHttpError so the existing
 * router.ts catch block (lines 158-185) can forward 429 + Retry-After
 * uniformly with the agent-mode error path.
 *
 * Pitfall (T-57-09): never echo `err.headers` into the surfaced error
 * — headers may carry the Authorization Bearer token. Only `err.message`
 * + status + retry-after value are propagated.
 */
function mapApiError(err: unknown): UpstreamHttpError {
	const e = err as {status?: number; message?: string; headers?: Record<string, string>}
	if (typeof e?.status === 'number') {
		const retryAfter = e.headers?.['retry-after'] ?? null
		return new UpstreamHttpError(
			`upstream Anthropic returned ${e.status}: ${e.message ?? 'unknown'}`,
			e.status,
			retryAfter,
		)
	}
	return new UpstreamHttpError(`upstream Anthropic error: ${e?.message ?? 'unknown'}`, 502, null)
}

/**
 * Single token-refresh attempt (Open Question 1 recommendation: retry-on-401).
 * Returns refreshed accessToken on success; null if refresh failed.
 *
 * Live verification deferred to Phase 63. The refresh path is unit-test
 * unobservable (depends on platform.claude.com behavior); it is wired here
 * so the production code path exists when a real expired token surfaces.
 */
async function refreshAccessToken(refreshToken: string | undefined): Promise<string | null> {
	if (!refreshToken) return null
	try {
		const res = await fetch(TOKEN_REFRESH_URL, {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify({grant_type: 'refresh_token', refresh_token: refreshToken}),
		})
		if (!res.ok) return null
		const json = (await res.json()) as {access_token?: string}
		return json.access_token ?? null
	} catch {
		return null
	}
}

function emitAuthErrorResponse(res: Response, userId: string): void {
	res.status(401).json({
		type: 'error',
		error: {
			type: 'authentication_error',
			message: `User ${userId} has no Claude subscription configured. Visit Settings > AI Configuration.`,
		},
	})
}

/**
 * If err is a 401, attempt single refresh + retry. Returns retried result on
 * success; null on refresh failure (caller surfaces original 401 to client).
 */
async function tryRefreshAndRetry<T>(
	err: unknown,
	token: SubscriptionToken,
	makeClientFn: (t: SubscriptionToken) => Anthropic,
	retryFn: (c: Anthropic) => Promise<T>,
): Promise<T | null> {
	const e = err as {status?: number}
	if (e?.status !== 401) return null
	const newAccessToken = await refreshAccessToken(token.refreshToken)
	if (!newAccessToken) return null
	const refreshedClient = makeClientFn({...token, accessToken: newAccessToken})
	try {
		return await retryFn(refreshedClient)
	} catch {
		return null
	}
}

export async function passthroughAnthropicMessages(opts: PassthroughOpts): Promise<void> {
	const {livinityd, userId, body, res} = opts

	// Phase 63 R3: subscription auth via Agent SDK. When clientFactory is
	// provided (test-only seam from Phase 58 Wave 0) OR ensureUserClaudeDir
	// fails, fall back to legacy HTTP path with token extraction (preserves
	// 96 broker test expectations + lets API key tier deployments still work).
	let userClaudeDir: string | undefined
	let token: SubscriptionToken | null = null

	if (opts.passthroughCwd) {
		// Production subscription path — caller (router.ts) computed cwd.
		userClaudeDir = opts.passthroughCwd
	} else {
		// Legacy / test path — extract OAuth token, use HTTP-mode provider.
		// (Production callers always pass passthroughCwd; this branch is a
		// safety net + the surface that vi.mock'd test suites exercise.)
		token = await readSubscriptionToken({livinityd, userId})
		if (!token) {
			emitAuthErrorResponse(res, userId)
			return
		}
	}

	livinityd.logger.log(
		`[livinity-broker:passthrough] mode=passthrough user=${userId} model=${body.model} stream=${body.stream === true} ${userClaudeDir ? `cwd=${userClaudeDir}` : 'http-mode'}`,
	)

	const provider = getProvider('anthropic')
	const initialClient = opts.clientFactory && token ? opts.clientFactory(token) : undefined
	const authTokenForOpts = token?.accessToken ?? 'subscription-managed-by-agent-sdk'

	// Pitfall (T-57-08): construct upstream body as a NEW object — do NOT
	// mutate `body` in place. Tools + system pass through verbatim.
	const upstreamBody = {
		model: body.model,
		max_tokens: body.max_tokens ?? 4096,
		system: body.system,
		messages: body.messages,
		tools: body.tools,
	}

	try {
		if (body.stream === true) {
			// Phase 58 Wave 2 (FR-BROKER-C1-01): true token streaming — raw async
			// iterator forwarding. Replaces Phase 57's transitional aggregate-then-
			// restream block.
			//
			// SDK method choice: provider.streamRequest dispatches to
			// client.messages.create({stream:true}).withResponse() — returns both
			// the Stream<RawMessageStreamEvent> AsyncIterable AND the upstream
			// Web Fetch Headers instance (for Wave 4 rate-limit forwarding).
			// Each event forwarded as `event: <type>\ndata: <json>\n\n` — byte-
			// for-byte pass-through of the upstream Anthropic SSE sequence.
			//
			// Headers include Cache-Control: no-transform (defense-in-depth against
			// any future compression middleware mounting — Wave 0 audit confirmed
			// none currently mounted) and X-Accel-Buffering: no (nginx hint for
			// Phase 60 reverse-proxy chain).

			// Phase 61 Plan 04 (FR-BROKER-C3-01): provider.streamRequest is
			// invoked BEFORE flushHeaders so result.upstreamHeaders are reachable
			// in time for forwardAnthropicHeaders. After flushHeaders, setHeader
			// silently no-ops (RESEARCH.md Pitfall 1 / R9). The SDK's
			// .withResponse() resolves once HTTP response headers arrive but
			// BEFORE the SSE iterator is consumed, so this re-ordering does not
			// stall the response — it just shifts the await onto the headers
			// arrival rather than the first SSE chunk arrival.
			let result: ProviderStreamResult
			try {
				result = await provider.streamRequest(upstreamBody as any, {
					authToken: authTokenForOpts,
					clientOverride: initialClient,
					cwd: userClaudeDir, // Phase 63 R3 — subscription auth scope
				})
			} catch (err) {
				// Legacy HTTP path: try refresh + retry. Subscription path:
				// Agent SDK handles refresh internally; tryRefreshAndRetry is
				// a no-op (no refreshable token).
				if (token) {
					const refreshed = await tryRefreshAndRetry<ProviderStreamResult>(
						err,
						token,
						(opts.clientFactory ?? makeClient),
						async (refreshedClient) =>
							provider.streamRequest(upstreamBody as any, {
								authToken: token!.accessToken,
								clientOverride: refreshedClient,
							}),
					)
					if (refreshed === null) throw mapApiError(err)
					result = refreshed
				} else {
					throw mapApiError(err)
				}
			}

			res.setHeader('Content-Type', 'text/event-stream')
			res.setHeader('Cache-Control', 'no-cache, no-transform')
			res.setHeader('Connection', 'keep-alive')
			res.setHeader('X-Accel-Buffering', 'no')
			// Phase 61 Plan 04 (FR-BROKER-C3-01): forward upstream anthropic-*
			// + retry-after headers verbatim BEFORE flushHeaders.
			forwardAnthropicHeaders(result.upstreamHeaders, res)
			res.flushHeaders()

			try {
				for await (const event of result.stream) {
					if (res.writableEnded) break
					const evtType = (event as {type: string}).type
					res.write(`event: ${evtType}\n`)
					res.write(`data: ${JSON.stringify(event)}\n\n`)
					const flushable = res as unknown as {flush?: () => void}
					if (typeof flushable.flush === 'function') flushable.flush()
				}
			} catch (err) {
				// Mid-stream error from SDK iterator (network drop, parse failure,
				// upstream HTTP 529 mid-flight). Best effort: emit an Anthropic-shape
				// `event: error` chunk then close. The downstream client SDK will
				// surface this to its caller. Anthropic SSE has no [DONE] terminator
				// so closing the socket is correct stream termination per spec.
				if (!res.writableEnded) {
					try {
						res.write('event: error\n')
						res.write(
							`data: ${JSON.stringify({
								type: 'error',
								error: {
									type: 'api_error',
									message: (err as Error)?.message ?? 'mid-stream error',
								},
							})}\n\n`,
						)
					} catch {
						// socket already gone — nothing more we can do
					}
				}
			}
			if (!res.writableEnded) res.end()
		} else {
			let result: ProviderResponse
			try {
				result = await provider.request(upstreamBody as any, {
					authToken: authTokenForOpts,
					clientOverride: initialClient,
					cwd: userClaudeDir,
				})
			} catch (err) {
				if (token) {
					const refreshed = await tryRefreshAndRetry<ProviderResponse>(
						err,
						token,
						(opts.clientFactory ?? makeClient),
						async (refreshedClient) =>
							provider.request(upstreamBody as any, {
								authToken: token!.accessToken,
								clientOverride: refreshedClient,
							}),
					)
					if (refreshed === null) throw mapApiError(err)
					result = refreshed
				} else {
					throw mapApiError(err)
				}
			}
			forwardAnthropicHeaders(result.upstreamHeaders, res)
			res.status(200).json(result.raw)
		}
	} catch (err) {
		if (err instanceof UpstreamHttpError) throw err
		throw mapApiError(err)
	}
}

// ===== Phase 57 Wave 3: OpenAI Chat Completions passthrough =====
// Mirrors passthroughAnthropicMessages above but for the /v1/chat/completions
// surface. Translates OpenAI request shape → Anthropic Messages, forwards via
// the same SDK client, then translates Anthropic response back to OpenAI shape.
//
// Sibling handler — does NOT replace passthroughAnthropicMessages; lives in the
// same file because the auth flow, SDK construction, error mapping, and token
// refresh helper are all reused (single source of truth per Pitfall 6 for
// passthrough infra).

import {
	translateToolsToAnthropic,
	translateToolUseToOpenAI,
	resolveModelAlias,
	type OpenAITranslatedMessage,
} from './openai-translator.js'
import {createAnthropicToOpenAIStreamTranslator, randomChatCmplId} from './openai-stream-translator.js'
import type {OpenAIChatCompletionsRequest} from './openai-types.js'

export interface OpenAIPassthroughOpts {
	livinityd: Livinityd
	userId: string
	body: OpenAIChatCompletionsRequest
	res: Response
	/**
	 * Phase 58 Wave 0 (test seam): override default Anthropic client construction.
	 * Used by Wave 4 integration tests to wire the SDK to a fake-Anthropic SSE
	 * server via baseURL. Production code paths leave this undefined; behavior
	 * unchanged from Phase 57 when undefined.
	 */
	clientFactory?: (token: SubscriptionToken) => Anthropic
	/**
	 * Phase 63 R3 — when set, dispatch via Agent SDK subscription path with
	 * `env.HOME = passthroughCwd`. Mirrors PassthroughOpts.passthroughCwd.
	 */
	passthroughCwd?: string
}

/** Anthropic content block — minimal shape for translation output. */
type AnthropicContentBlock =
	| {type: 'text'; text: string}
	| {type: 'tool_use'; id: string; name: string; input: unknown}
	| {type: 'tool_result'; tool_use_id: string; content: string}

type AnthropicMessageOut = {
	role: 'user' | 'assistant'
	content: string | AnthropicContentBlock[]
}

/** Anthropic upstream body assembled from an OpenAI request. */
interface UpstreamAnthropicBody {
	model: string
	max_tokens: number
	system?: string
	messages: AnthropicMessageOut[]
	tools?: ReturnType<typeof translateToolsToAnthropic>
}

/**
 * F3 multi-turn tool_result translator (Phase 74 Plan 02).
 *
 * OpenAI clients (Continue.dev, Open WebUI, Cline-via-OpenAI) send `tool` role
 * messages with `tool_call_id` referencing prior `assistant.tool_calls[].id`.
 * Pre-F3 (Phase 57) the broker FILTERED these messages out at the request
 * boundary — the upstream Claude never saw the tool's output, breaking
 * multi-turn agentic loops. F3 folds them into Anthropic `user` messages
 * carrying `tool_result` content blocks, preserving the ID round-trip.
 *
 * Anthropic-protocol passthrough (`/v1/messages`) preserves these IDs
 * natively via the verbatim `messages` forward — F3 is OpenAI-direction-only
 * (CONTEXT D-08 / `reference_broker_protocols_verified.md` 2026-05-03).
 *
 * Algorithm (per CONTEXT D-09..D-11 + reference_test_cases pseudocode):
 *   - Walks the input message list in order.
 *   - `user` / `assistant` (no tool_calls) → emit verbatim with single-string content.
 *   - `assistant` with `tool_calls[]` → emit Anthropic assistant message whose
 *     content is an array of `[{type:'text',...}?, ...{type:'tool_use', id, name, input}]`.
 *     Text block is emitted only when `assistant.content` is a non-empty string.
 *     `arguments` JSON-parses; on failure, falls back to the raw string + console.warn.
 *   - Contiguous run of `tool` / `function` role messages → ONE Anthropic
 *     user message whose content is an array of `tool_result` blocks
 *     (one per source message), preserving declaration order.
 *   - `tool` role uses `tool_call_id` verbatim as `tool_use_id` (D-10).
 *   - `function` role without `tool_call_id` falls back to
 *     `${function.name}:${index-within-run}` (D-11).
 *   - `tool_result.content` is the source string verbatim, OR JSON-stringified
 *     when the source content is a non-string (defensive — modern clients
 *     send strings).
 *   - Unknown roles trigger `console.warn` once and are dropped (defensive —
 *     spec-compliant clients should never trigger this branch).
 *
 * Pure-functional: takes a non-system message list (`system` is hoisted to
 * top-level by the caller) and returns the Anthropic `messages[]` array.
 */
function translateMessagesPreservingToolResults(
	messages: readonly OpenAIChatCompletionsRequest['messages'][number][],
): AnthropicMessageOut[] {
	const out: AnthropicMessageOut[] = []
	let i = 0
	while (i < messages.length) {
		const m = messages[i] as any
		const role = m?.role
		if (role === 'user') {
			out.push({role: 'user', content: m.content as string | unknown as string})
			i++
		} else if (role === 'assistant') {
			out.push(translateAssistantMessage(m))
			i++
		} else if (role === 'tool' || role === 'function') {
			// Greedy-collect contiguous tool/function run.
			const blocks: AnthropicContentBlock[] = []
			let funcIdx = 0
			while (
				i < messages.length &&
				((messages[i] as any)?.role === 'tool' || (messages[i] as any)?.role === 'function')
			) {
				const tm = messages[i] as any
				const tool_use_id: string =
					typeof tm.tool_call_id === 'string' && tm.tool_call_id.length > 0
						? tm.tool_call_id
						: tm.role === 'function' && typeof tm.name === 'string' && tm.name.length > 0
							? `${tm.name}:${funcIdx}`
							: `unknown:${funcIdx}`
				const content: string =
					typeof tm.content === 'string' ? tm.content : JSON.stringify(tm.content)
				blocks.push({type: 'tool_result', tool_use_id, content})
				funcIdx++
				i++
			}
			out.push({role: 'user', content: blocks})
		} else {
			// Defensive: drop unknown roles with a single warn log. (T-74-02-03
			// mitigation: warn carries the role name only — never logs content.)
			console.warn(
				`[liv-broker] dropping message with unknown role: ${String(role)}`,
			)
			i++
		}
	}
	return out
}

/**
 * Translate a single OpenAI `assistant` role message into an Anthropic
 * `assistant` message. Handles the inverse direction of
 * `translateToolUseToOpenAI` (response-side) — emits `tool_use` content
 * blocks from `tool_calls[]`.
 *
 * Emits a single-string content if there are no `tool_calls` (preserves
 * pre-F3 byte-identical shape for tool-free conversations).
 */
function translateAssistantMessage(m: any): AnthropicMessageOut {
	const toolCalls: Array<{id: string; type: string; function: {name: string; arguments: string}}> =
		Array.isArray(m?.tool_calls) ? m.tool_calls : []
	if (toolCalls.length === 0) {
		// Pre-F3 byte-identical shape: single-string content (or unknown forwarded as-is).
		return {role: 'assistant', content: m.content as string | unknown as string}
	}
	const blocks: AnthropicContentBlock[] = []
	if (typeof m.content === 'string' && m.content.length > 0) {
		blocks.push({type: 'text', text: m.content})
	}
	for (const tc of toolCalls) {
		const name = tc?.function?.name
		const id = tc?.id
		const rawArgs = tc?.function?.arguments
		let input: unknown
		if (typeof rawArgs === 'string') {
			try {
				input = rawArgs.length > 0 ? JSON.parse(rawArgs) : {}
			} catch {
				console.warn(
					`[liv-broker] failed to JSON.parse tool_calls[].function.arguments for tool_call id=${String(
						id,
					)}; falling back to raw string`,
				)
				input = rawArgs
			}
		} else {
			input = rawArgs ?? {}
		}
		blocks.push({type: 'tool_use', id: String(id ?? ''), name: String(name ?? ''), input})
	}
	return {role: 'assistant', content: blocks}
}

/**
 * Build an Anthropic Messages body from an OpenAI Chat Completions body.
 *
 *   - OpenAI puts the system prompt as messages[0] with role='system';
 *     Anthropic uses a top-level `system` field. Multiple system messages
 *     are concatenated with `\n\n`.
 *   - Tool / function role messages → translated to Anthropic `tool_result`
 *     content blocks (Phase 74 F3, see translateMessagesPreservingToolResults).
 *     Pre-F3 (Phase 57) these were filtered out, breaking multi-turn loops.
 *   - Tools are shape-translated via translateToolsToAnthropic (verbatim
 *     forward — D-30-02 reverses D-42-12 warn-and-ignore for passthrough).
 *   - Phase 61 Plan 03: model alias resolution is now async (Redis-backed)
 *     and lives in the caller passthroughOpenAIChatCompletions; the resolved
 *     `actualModel` is passed in here so this builder stays pure-sync.
 */
function buildAnthropicBodyFromOpenAI(
	body: OpenAIChatCompletionsRequest,
	actualModel: string,
): UpstreamAnthropicBody {
	const systemMessages = body.messages.filter((m) => m.role === 'system')
	// Phase 74 Plan 02 (F3): non-system messages flow through the walker
	// (translateMessagesPreservingToolResults) which folds tool/function role
	// messages into tool_result content blocks. Pre-F3 the filter dropped
	// tool/function — see CONTEXT D-08..D-11 for rationale.
	const conversationMessages = body.messages.filter((m) => m.role !== 'system')

	const system =
		systemMessages.length > 0
			? systemMessages
					.map((m) =>
						typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
					)
					.join('\n\n')
			: undefined

	const upstream: UpstreamAnthropicBody = {
		model: actualModel,
		max_tokens: body.max_tokens ?? 4096,
		system,
		messages: translateMessagesPreservingToolResults(conversationMessages),
	}
	if (body.tools && Array.isArray(body.tools) && body.tools.length > 0) {
		upstream.tools = translateToolsToAnthropic(body.tools)
	}
	return upstream
}

/** Map Anthropic stop_reason → OpenAI finish_reason. */
function mapStopReasonToFinishReason(stopReason: string | undefined): string {
	if (stopReason === 'tool_use') return 'tool_calls'
	if (stopReason === 'end_turn') return 'stop'
	if (stopReason === 'max_tokens') return 'length'
	return 'stop'
}

/** OpenAI Chat Completion sync response shape (subset broker emits). */
interface OpenAIChatCompletionResponseSync {
	id: string
	object: 'chat.completion'
	created: number
	model: string
	choices: Array<{
		index: number
		message: OpenAITranslatedMessage
		finish_reason: string
	}>
	usage: {prompt_tokens: number; completion_tokens: number; total_tokens: number}
}

/**
 * Build an OpenAI ChatCompletion JSON response from an Anthropic Messages
 * upstream response. The response.model echoes the CALLER'S requested model
 * (preserves caller expectation), NOT the resolved Claude model — matches
 * existing buildSyncOpenAIResponse() behavior.
 */
function buildOpenAIChatCompletionResponse(
	anthropicResponse: any,
	requestedModel: string,
): OpenAIChatCompletionResponseSync {
	const message = translateToolUseToOpenAI(anthropicResponse?.content ?? [])
	const finishReason = mapStopReasonToFinishReason(anthropicResponse?.stop_reason)
	// Phase 58 Wave 3 (FR-BROKER-C2-03): crypto.randomBytes-based id (Phase 57 Pitfall 4 closed)
	const id = randomChatCmplId()
	const usage = anthropicResponse?.usage ?? {input_tokens: 0, output_tokens: 0}
	return {
		id,
		object: 'chat.completion',
		created: Math.floor(Date.now() / 1000),
		model: requestedModel,
		choices: [{index: 0, message, finish_reason: finishReason}],
		usage: {
			prompt_tokens: usage.input_tokens ?? 0,
			completion_tokens: usage.output_tokens ?? 0,
			total_tokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
		},
	}
}

/** Emit OpenAI-shaped 401 (invalid_request_error) — clients expect OpenAI envelope on this route. */
function emitOpenAIAuthErrorResponse(res: Response, userId: string): void {
	res.status(401).json({
		error: {
			message: `User ${userId} has no Claude subscription configured. Visit Settings > AI Configuration.`,
			type: 'invalid_request_error',
			code: 'subscription_not_configured',
		},
	})
}

export async function passthroughOpenAIChatCompletions(opts: OpenAIPassthroughOpts): Promise<void> {
	const {livinityd, userId, body, res} = opts

	// Phase 63 R3: dual mode (subscription via Agent SDK in production, HTTP
	// path with mocked SDK when clientFactory test seam is provided).
	let userClaudeDir: string | undefined
	let token: SubscriptionToken | null = null

	if (opts.passthroughCwd) {
		userClaudeDir = opts.passthroughCwd
	} else {
		token = await readSubscriptionToken({livinityd, userId})
		if (!token) {
			emitOpenAIAuthErrorResponse(res, userId)
			return
		}
	}
	const authTokenForOpenAI = token?.accessToken ?? 'subscription-managed-by-agent-sdk'

	// Phase 61 Plan 03 D1 — async Redis-backed alias resolution. Caller logs
	// the requested→resolved mapping (and any warn for unknown aliases). The
	// hardcoded fallback inside resolveModelAlias keeps this resilient if
	// Redis is down — we never 5xx purely because of a Redis blip.
	const {actualModel, warn: aliasWarn} = await resolveModelAlias(livinityd.ai.redis, body.model)
	if (aliasWarn) {
		livinityd.logger.log(
			`[livinity-broker:passthrough:openai] WARN unknown model '${body.model}' → ${actualModel}`,
		)
	}

	livinityd.logger.log(
		`[livinity-broker:passthrough:openai] mode=passthrough user=${userId} requestedModel=${body.model} actualModel=${actualModel} stream=${body.stream === true}`,
	)

	// Phase 61 Plan 01 Wave 1: dispatch via BrokerProvider (same pattern as
	// passthroughAnthropicMessages above — the OpenAI handler still uses
	// the Anthropic provider; it only translates request/response shape).
	const provider = getProvider('anthropic')
	const initialClient = opts.clientFactory && token ? opts.clientFactory(token) : undefined

	let anthropicBody: UpstreamAnthropicBody
	try {
		anthropicBody = buildAnthropicBodyFromOpenAI(body, actualModel)
	} catch (err: any) {
		// Translation failure (e.g. unsupported tool type, missing function.name)
		// — surface as an OpenAI invalid_request_error 400 so the client knows
		// it's a request-shape problem, not an upstream problem.
		res.status(400).json({
			error: {
				message: err?.message ?? 'translation failed',
				type: 'invalid_request_error',
				code: 'invalid_tools',
			},
		})
		return
	}

	try {
		if (body.stream === true) {
			// Phase 58 Wave 3 (FR-BROKER-C2-01..02): true 1:1 delta translation.
			// Replaces Phase 57's transitional aggregate-then-emit-single-chunk.
			//
			// Iterate raw Anthropic SSE events from provider.streamRequest and feed
			// each into the Wave 1 translator. Translator writes OpenAI
			// chat.completion.chunk SSE lines per delta. translator.finalize()
			// emits the final chunk (with usage object derived from cumulative
			// output_tokens) followed by `data: [DONE]\n\n`.
			//
			// Headers mirror Wave 2's Anthropic streaming branch (Cache-Control:
			// no-transform + X-Accel-Buffering: no) — same buffering hazard
			// mitigation for Phase 60's reverse-proxy chain.

			// Phase 61 Plan 04 (FR-BROKER-C3-02): provider.streamRequest is
			// invoked BEFORE flushHeaders so result.upstreamHeaders are reachable
			// in time for translateAnthropicToOpenAIHeaders. After flushHeaders,
			// setHeader silently no-ops (RESEARCH.md Pitfall 1 / R9). The SDK's
			// .withResponse() resolves once HTTP response headers arrive but
			// BEFORE the SSE iterator is consumed, so this re-ordering does not
			// stall the response — it just shifts the await onto headers arrival
			// rather than first SSE chunk arrival.
			let result: ProviderStreamResult
			try {
				result = await provider.streamRequest(anthropicBody as any, {
					authToken: authTokenForOpenAI,
					clientOverride: initialClient,
					cwd: userClaudeDir,
				})
			} catch (err) {
				if (token) {
					const refreshed = await tryRefreshAndRetry<ProviderStreamResult>(
						err,
						token,
						(opts.clientFactory ?? makeClient),
						async (refreshedClient) =>
							provider.streamRequest(anthropicBody as any, {
								authToken: token!.accessToken,
								clientOverride: refreshedClient,
							}),
					)
					if (refreshed === null) throw mapApiError(err)
					result = refreshed
				} else {
					throw mapApiError(err)
				}
			}

			res.setHeader('Content-Type', 'text/event-stream')
			res.setHeader('Cache-Control', 'no-cache, no-transform')
			res.setHeader('Connection', 'keep-alive')
			res.setHeader('X-Accel-Buffering', 'no')
			// Phase 61 Plan 04 (FR-BROKER-C3-02): translate upstream Anthropic
			// ratelimit headers to OpenAI x-ratelimit-* namespace BEFORE
			// flushHeaders. T-61-16 mitigation: anthropic-* NOT also forwarded
			// on this route (single-namespace per route).
			translateAnthropicToOpenAIHeaders(result.upstreamHeaders, res)
			res.flushHeaders()

			const translator = createAnthropicToOpenAIStreamTranslator({
				requestedModel: body.model, // echo caller's requested model (e.g. "gpt-4o")
				res,
			})

			try {
				for await (const event of result.stream) {
					if (res.writableEnded) break
					translator.onAnthropicEvent(event as {type: string})
				}
			} catch (err) {
				// Mid-stream SDK iterator error — translator.finalize() in finally
				// still runs. Best-effort log via livinityd logger to match the
				// existing Phase 57 logging pattern in this handler.
				livinityd.logger.log(
					`[livinity-broker:passthrough:openai] mid-stream error user=${userId}: ${(err as Error)?.message ?? err}`,
				)
			} finally {
				translator.finalize() // idempotent — emits final chunk + [DONE] even on early termination
				if (!res.writableEnded) res.end()
			}
		} else {
			let result: ProviderResponse
			try {
				result = await provider.request(anthropicBody as any, {
					authToken: authTokenForOpenAI,
					clientOverride: initialClient,
					cwd: userClaudeDir,
				})
			} catch (err) {
				if (token) {
					const refreshed = await tryRefreshAndRetry<ProviderResponse>(
						err,
						token,
						(opts.clientFactory ?? makeClient),
						async (refreshedClient) =>
							provider.request(anthropicBody as any, {
								authToken: token!.accessToken,
								clientOverride: refreshedClient,
							}),
					)
					if (refreshed === null) throw mapApiError(err)
					result = refreshed
				} else {
					throw mapApiError(err)
				}
			}
			// Phase 61 Plan 04 (FR-BROKER-C3-02): translate upstream Anthropic
			// ratelimit headers to OpenAI x-ratelimit-* namespace BEFORE
			// res.json. T-61-16 mitigation: anthropic-* NOT also forwarded.
			translateAnthropicToOpenAIHeaders(result.upstreamHeaders, res)
			const openaiResp = buildOpenAIChatCompletionResponse(result.raw, body.model)
			res.status(200).json(openaiResp)
		}
	} catch (err) {
		if (err instanceof UpstreamHttpError) throw err
		throw mapApiError(err)
	}
}
