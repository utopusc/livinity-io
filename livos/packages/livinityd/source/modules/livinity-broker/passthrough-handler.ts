import Anthropic from '@anthropic-ai/sdk'
import type {Response} from 'express'
import {UpstreamHttpError} from './agent-runner-factory.js'
import {readSubscriptionToken, type SubscriptionToken} from './credential-extractor.js'
import type {AnthropicMessagesRequest} from './types.js'
import type Livinityd from '../../index.js'

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
 */

export interface PassthroughOpts {
	livinityd: Livinityd
	userId: string
	body: AnthropicMessagesRequest
	res: Response
	/**
	 * Phase 58 Wave 0 (test seam): override default Anthropic client construction.
	 * Used by Wave 4 integration tests to wire the SDK to a fake-Anthropic SSE
	 * server via baseURL. Production code paths leave this undefined; behavior
	 * unchanged from Phase 57 when undefined.
	 */
	clientFactory?: (token: SubscriptionToken) => Anthropic
}

const ANTHROPIC_VERSION = '2023-06-01'
const TOKEN_REFRESH_URL = 'https://platform.claude.com/v1/oauth/token'

/**
 * Construct an Anthropic SDK client bound to the given subscription token.
 * Per Wave 1 Risk-A1 smoke gate: SDK produces `Authorization: Bearer <token>`
 * headers automatically when `authToken` (NOT `apiKey`) is supplied.
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

	const token = await readSubscriptionToken({livinityd, userId})
	if (!token) {
		emitAuthErrorResponse(res, userId)
		return
	}

	livinityd.logger.log(
		`[livinity-broker:passthrough] mode=passthrough user=${userId} model=${body.model} stream=${body.stream === true}`,
	)

	const client = (opts.clientFactory ?? makeClient)(token)

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
			// SDK method choice: client.messages.create({stream:true}) returns
			// Stream<RawMessageStreamEvent> — an async iterable whose `type` field
			// matches Anthropic's SSE event names verbatim (message_start,
			// content_block_delta, ...). We forward each event as
			//   `event: <type>\ndata: <json>\n\n`
			// — byte-for-byte pass-through of the upstream Anthropic SSE sequence.
			//
			// Headers include Cache-Control: no-transform (defense-in-depth against
			// any future compression middleware mounting — Wave 0 audit confirmed
			// none currently mounted) and X-Accel-Buffering: no (nginx hint for
			// Phase 60 reverse-proxy chain).

			res.setHeader('Content-Type', 'text/event-stream')
			res.setHeader('Cache-Control', 'no-cache, no-transform')
			res.setHeader('Connection', 'keep-alive')
			res.setHeader('X-Accel-Buffering', 'no')
			res.flushHeaders()

			const makeClientFn = opts.clientFactory ?? makeClient

			let stream: AsyncIterable<{type: string}>
			try {
				stream = (await client.messages.create({
					...upstreamBody,
					stream: true,
				} as any)) as unknown as AsyncIterable<{type: string}>
			} catch (err) {
				const refreshed = await tryRefreshAndRetry<AsyncIterable<{type: string}>>(
					err,
					token,
					makeClientFn,
					async (c) =>
						(await c.messages.create({
							...upstreamBody,
							stream: true,
						} as any)) as unknown as AsyncIterable<{type: string}>,
				)
				if (refreshed === null) throw mapApiError(err)
				stream = refreshed
			}

			try {
				for await (const event of stream) {
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
			let response: any
			try {
				response = await client.messages.create(upstreamBody as any)
			} catch (err) {
				const refreshed = await tryRefreshAndRetry(err, token, makeClient, async (c) => {
					return c.messages.create(upstreamBody as any)
				})
				if (refreshed === null) throw mapApiError(err)
				response = refreshed
			}
			res.status(200).json(response)
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
}

/** Anthropic upstream body assembled from an OpenAI request. */
interface UpstreamAnthropicBody {
	model: string
	max_tokens: number
	system?: string
	messages: Array<{role: 'user' | 'assistant'; content: string | unknown}>
	tools?: ReturnType<typeof translateToolsToAnthropic>
}

/**
 * Build an Anthropic Messages body from an OpenAI Chat Completions body.
 *
 *   - OpenAI puts the system prompt as messages[0] with role='system';
 *     Anthropic uses a top-level `system` field. Multiple system messages
 *     are concatenated with `\n\n`.
 *   - Tool / function role messages are skipped (they have no Anthropic
 *     equivalent on the request side; tool_result blocks would require
 *     content-block translation which is out of scope for Phase 57).
 *   - Tools are shape-translated via translateToolsToAnthropic (verbatim
 *     forward — D-30-02 reverses D-42-12 warn-and-ignore for passthrough).
 *   - Model is resolved via resolveModelAlias (gpt-* → claude-sonnet-4-6 etc.)
 *     so OpenAI clients can target the broker by their familiar names.
 */
function buildAnthropicBodyFromOpenAI(body: OpenAIChatCompletionsRequest): UpstreamAnthropicBody {
	const systemMessages = body.messages.filter((m) => m.role === 'system')
	const conversationMessages = body.messages.filter(
		(m) => m.role !== 'system' && m.role !== 'tool' && m.role !== 'function',
	)

	const system =
		systemMessages.length > 0
			? systemMessages
					.map((m) =>
						typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
					)
					.join('\n\n')
			: undefined

	const {actualModel} = resolveModelAlias(body.model)

	const upstream: UpstreamAnthropicBody = {
		model: actualModel,
		max_tokens: body.max_tokens ?? 4096,
		system,
		messages: conversationMessages.map((m) => ({
			role: m.role as 'user' | 'assistant',
			content: m.content as string | unknown,
		})),
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

	const token = await readSubscriptionToken({livinityd, userId})
	if (!token) {
		emitOpenAIAuthErrorResponse(res, userId)
		return
	}

	livinityd.logger.log(
		`[livinity-broker:passthrough:openai] mode=passthrough user=${userId} model=${body.model} stream=${body.stream === true}`,
	)

	const client = (opts.clientFactory ?? makeClient)(token)

	let anthropicBody: UpstreamAnthropicBody
	try {
		anthropicBody = buildAnthropicBodyFromOpenAI(body)
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
			// Iterate raw Anthropic SSE events via the SDK async iterator and feed
			// each into the Wave 1 translator. Translator writes OpenAI
			// chat.completion.chunk SSE lines per delta. translator.finalize()
			// emits the final chunk (with usage object derived from cumulative
			// output_tokens) followed by `data: [DONE]\n\n`.
			//
			// Headers mirror Wave 2's Anthropic streaming branch (Cache-Control:
			// no-transform + X-Accel-Buffering: no) — same buffering hazard
			// mitigation for Phase 60's reverse-proxy chain.

			res.setHeader('Content-Type', 'text/event-stream')
			res.setHeader('Cache-Control', 'no-cache, no-transform')
			res.setHeader('Connection', 'keep-alive')
			res.setHeader('X-Accel-Buffering', 'no')
			res.flushHeaders()

			const translator = createAnthropicToOpenAIStreamTranslator({
				requestedModel: body.model, // echo caller's requested model (e.g. "gpt-4o")
				res,
			})

			const makeClientFn = opts.clientFactory ?? makeClient

			let stream: AsyncIterable<{type: string}>
			try {
				stream = (await client.messages.create({
					...anthropicBody,
					stream: true,
				} as any)) as unknown as AsyncIterable<{type: string}>
			} catch (err) {
				const refreshed = await tryRefreshAndRetry<AsyncIterable<{type: string}>>(
					err,
					token,
					makeClientFn,
					async (c) =>
						(await c.messages.create({
							...anthropicBody,
							stream: true,
						} as any)) as unknown as AsyncIterable<{type: string}>,
				)
				if (refreshed === null) throw mapApiError(err)
				stream = refreshed
			}

			try {
				for await (const event of stream) {
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
			let response: any
			try {
				response = await client.messages.create(anthropicBody as any)
			} catch (err) {
				const refreshed = await tryRefreshAndRetry(err, token, makeClient, async (c) => {
					return c.messages.create(anthropicBody as any)
				})
				if (refreshed === null) throw mapApiError(err)
				response = refreshed
			}
			const openaiResp = buildOpenAIChatCompletionResponse(response, body.model)
			res.status(200).json(openaiResp)
		}
	} catch (err) {
		if (err instanceof UpstreamHttpError) throw err
		throw mapApiError(err)
	}
}
