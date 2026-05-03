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
 *   - Phase 57 (this wave): aggregate-then-restream. Awaits the upstream
 *     final message via SDK's messages.stream().finalMessage(), then
 *     synthesizes a single fat content_block_delta SSE sequence to the
 *     client. This keeps Wave 2 minimal while shipping a working stream.
 *   - Phase 58: swap to true SDK event-iterator pass-through (token
 *     streaming).
 */

export interface PassthroughOpts {
	livinityd: Livinityd
	userId: string
	body: AnthropicMessagesRequest
	res: Response
}

const ANTHROPIC_VERSION = '2023-06-01'
const TOKEN_REFRESH_URL = 'https://platform.claude.com/v1/oauth/token'

/**
 * Construct an Anthropic SDK client bound to the given subscription token.
 * Per Wave 1 Risk-A1 smoke gate: SDK produces `Authorization: Bearer <token>`
 * headers automatically when `authToken` (NOT `apiKey`) is supplied.
 */
function makeClient(token: SubscriptionToken): Anthropic {
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

	const client = makeClient(token)

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
			// Phase 57 TRANSITIONAL: aggregate then synthesize a single fat
			// content_block_delta. Phase 58 swaps to true SDK event-iterator
			// pass-through.
			let finalMessage: any
			try {
				finalMessage = await client.messages.stream(upstreamBody as any).finalMessage()
			} catch (err) {
				const refreshed = await tryRefreshAndRetry(err, token, makeClient, async (c) => {
					return c.messages.stream(upstreamBody as any).finalMessage()
				})
				if (refreshed === null) throw mapApiError(err)
				finalMessage = refreshed
			}

			res.setHeader('Content-Type', 'text/event-stream')
			res.setHeader('Cache-Control', 'no-cache')
			res.setHeader('Connection', 'keep-alive')

			const text = (finalMessage.content ?? [])
				.filter((b: any) => b.type === 'text')
				.map((b: any) => b.text)
				.join('')

			const writeEvent = (event: string, data: any) => {
				res.write(`event: ${event}\n`)
				res.write(`data: ${JSON.stringify(data)}\n\n`)
			}

			writeEvent('message_start', {
				type: 'message_start',
				message: {...finalMessage, content: [], stop_reason: null, stop_sequence: null},
			})
			writeEvent('content_block_start', {
				type: 'content_block_start',
				index: 0,
				content_block: {type: 'text', text: ''},
			})
			writeEvent('content_block_delta', {
				type: 'content_block_delta',
				index: 0,
				delta: {type: 'text_delta', text},
			})
			writeEvent('content_block_stop', {type: 'content_block_stop', index: 0})
			writeEvent('message_delta', {
				type: 'message_delta',
				delta: {
					stop_reason: finalMessage.stop_reason,
					stop_sequence: finalMessage.stop_sequence,
				},
				usage: finalMessage.usage,
			})
			writeEvent('message_stop', {type: 'message_stop'})
			res.end()
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
