import type express from 'express'
import type {Request, Response} from 'express'
import type {AgentResult} from '@nexus/core'
import {resolveAndAuthorizeUserId} from './auth.js'
import {createSdkAgentRunnerForUser, UpstreamHttpError} from './agent-runner-factory.js'
import {aggregateChunkText} from './sync-response.js'
import {
	translateOpenAIChatToSdkArgs,
	buildSyncOpenAIResponse,
	resolveModelAlias,
} from './openai-translator.js'
import type {OpenAIChatCompletionsRequest} from './openai-types.js'
import type {BrokerDeps} from './types.js'
import {createOpenAISseAdapter} from './openai-sse-adapter.js'
import {resolveMode} from './mode-dispatch.js'
import {passthroughOpenAIChatCompletions} from './passthrough-handler.js'

/**
 * Register POST /:userId/v1/chat/completions on the existing broker router.
 *
 * Mounted INSIDE createBrokerRouter() (router.ts) so it inherits the
 * router-level express.json middleware. (Phase 60 removed the prior
 * containerSourceIpGuard in favor of Caddy perimeter rate-limit + Phase 59
 * Bearer auth as the new identity surface — FR-BROKER-B2-01.)
 *
 * Sync path complete in Plan 42-02; SSE streaming added in Plan 42-03
 * (this handler currently returns 501 when body.stream === true).
 */
/**
 * Phase 42.1 hotfix: GET /:userId/v1/models — OpenAI ListModels endpoint.
 *
 * Open WebUI (and most OpenAI-compat marketplace clients) call this on startup
 * to populate the model picker. Without it, the dropdown is empty and the user
 * cannot start a chat. We return a hardcoded list — broker maps every model
 * name through resolveModelAlias() to the actual Anthropic backend at request
 * time, so the list here is purely a UX hint for the client picker.
 *
 * Same auth as /chat/completions: user_id URL path validates against users
 * table; multi-user-OFF + non-admin → 403; container source IP must be in
 * 127.0.0.1 / ::1 / 172.16.0.0/12 (Phase 41.1).
 */
function listModels(userId: string) {
	const created = Math.floor(Date.now() / 1000)
	const owned_by = `livinity-broker:${userId.slice(0, 8)}`
	// Phase 42.2: current Claude 4.X family + friendly aliases + OpenAI compat
	// Order matters — first 3 are friendly aliases (most common picks), then explicit
	// Claude IDs, then gpt-* aliases for OpenAI-compat marketplace clients.
	const ids = [
		// Friendly short aliases — broker resolves to latest version of each tier
		'opus',
		'sonnet',
		'haiku',
		// Explicit Claude 4.X model IDs (knowledge cutoff Jan 2026)
		'claude-opus-4-7',
		'claude-sonnet-4-6',
		'claude-haiku-4-5',
		// OpenAI compat — broker maps these to claude-sonnet-4-6 default
		'gpt-4',
		'gpt-4o',
	]
	return {
		object: 'list',
		data: ids.map((id) => ({id, object: 'model', created, owned_by})),
	}
}

export function registerOpenAIRoutes(router: express.Router, deps: BrokerDeps): void {
	// Phase 42.1: GET /v1/models — OpenAI ListModels (Open WebUI populates picker)
	router.get('/:userId/v1/models', async (req: Request, res: Response) => {
		const auth = await resolveAndAuthorizeUserId(req, res, deps.livinityd)
		if (!auth) return
		res.status(200).json(listModels(auth.userId))
	})

	router.post('/:userId/v1/chat/completions', async (req: Request, res: Response) => {
		// 1. user_id resolution + authorization (reused from Phase 41)
		const auth = await resolveAndAuthorizeUserId(req, res, deps.livinityd)
		if (!auth) return // response already written

		// 2. body validation (OpenAI error shape, NOT Anthropic)
		const body = req.body as OpenAIChatCompletionsRequest
		if (!body || typeof body !== 'object') {
			res.status(400).json({
				error: {
					message: 'request body must be JSON',
					type: 'invalid_request_error',
					code: 'invalid_body',
				},
			})
			return
		}
		if (typeof body.model !== 'string' || body.model.length === 0) {
			res.status(400).json({
				error: {
					message: 'model must be a non-empty string',
					type: 'invalid_request_error',
					code: 'invalid_model',
				},
			})
			return
		}
		if (!Array.isArray(body.messages) || body.messages.length === 0) {
			res.status(400).json({
				error: {
					message: 'messages must be a non-empty array',
					type: 'invalid_request_error',
					code: 'invalid_messages',
				},
			})
			return
		}

		// Phase 57 (FR-BROKER-A2-01): mode dispatch — passthrough is DEFAULT, agent is opt-in via X-Livinity-Mode: agent.
		// Passthrough bypasses sacred sdk-agent-runner.ts entirely; agent path below is byte-identical to v29.5.
		const mode = resolveMode(req)
		if (mode === 'passthrough') {
			try {
				await passthroughOpenAIChatCompletions({
					livinityd: deps.livinityd,
					userId: auth.userId,
					body,
					res,
				})
				return
			} catch (err: any) {
				if (err && typeof err.status === 'number') {
					const headers: Record<string, string> = {}
					if (err.retryAfter) headers['retry-after'] = String(err.retryAfter)
					const errorType =
						err.status === 429
							? 'rate_limit_exceeded'
							: err.status === 401
								? 'invalid_request_error'
								: 'api_error'
					res.status(err.status).set(headers).json({
						error: {
							message: err.message ?? 'upstream error',
							type: errorType,
							code: err.status === 429 ? 'rate_limit_exceeded' : 'upstream_error',
						},
					})
					return
				}
				deps.livinityd.logger.log(
					`[livinity-broker:passthrough:openai] unexpected error user=${auth.userId}: ${err?.message ?? err}`,
				)
				res.status(502).json({
					error: {message: 'upstream Anthropic error', type: 'api_error', code: 'upstream_error'},
				})
				return
			}
		}
		// mode === 'agent' — existing code below unchanged

		// 3. Per D-42-12: client-provided tools / tool_choice / function_call IGNORED with warn log
		if (Array.isArray(body.tools) && body.tools.length > 0) {
			deps.livinityd.logger.log(
				`[livinity-broker:openai] WARN client provided ${body.tools.length} tools — ignoring per D-42-12 (broker only exposes LivOS MCP tools)`,
			)
		}
		if (body.tool_choice !== undefined) {
			deps.livinityd.logger.log(
				`[livinity-broker:openai] WARN client provided tool_choice — ignoring per D-42-12`,
			)
		}
		if (body.function_call !== undefined || (Array.isArray(body.functions) && body.functions.length > 0)) {
			deps.livinityd.logger.log(
				`[livinity-broker:openai] WARN client provided legacy function_call/functions — ignoring per D-42-12`,
			)
		}

		// 4. Translate (validates message shape; throws on invalid content)
		let sdkArgs
		try {
			sdkArgs = translateOpenAIChatToSdkArgs(body)
		} catch (err: any) {
			res.status(400).json({
				error: {
					message: err?.message || 'translation failed',
					type: 'invalid_request_error',
					code: 'translation_failed',
				},
			})
			return
		}

		// 5. Model alias resolution (D-42-11 → Phase 61 Plan 03 D1: now Redis-backed via alias-resolver.ts)
		const requestedModel = body.model
		const {actualModel, warn} = await resolveModelAlias(deps.livinityd.ai.redis, requestedModel)
		if (warn) {
			deps.livinityd.logger.log(
				`[livinity-broker:openai] WARN unknown model '${requestedModel}' — defaulting to ${actualModel}`,
			)
		}
		deps.livinityd.logger.log(
			`[livinity-broker:openai] request user=${auth.userId} requestedModel=${requestedModel} actualModel=${actualModel} stream=${body.stream === true}`,
		)

		// 6. Stream branching
		const wantsStream = body.stream === true
		if (wantsStream) {
			// SSE response (per D-42-09)
			res.setHeader('Content-Type', 'text/event-stream')
			res.setHeader('Cache-Control', 'no-cache')
			res.setHeader('Connection', 'keep-alive')
			res.setHeader('X-Accel-Buffering', 'no')
			res.flushHeaders()
			res.socket?.setNoDelay(true)

			const adapter = createOpenAISseAdapter({requestedModel, res})
			const abortController = new AbortController()
			res.on('close', () => abortController.abort())

			let streamFinalResult: AgentResult | undefined
			try {
				const generator = createSdkAgentRunnerForUser({
					livinityd: deps.livinityd,
					userId: auth.userId,
					task: sdkArgs.task,
					contextPrefix: sdkArgs.contextPrefix,
					systemPromptOverride: sdkArgs.systemPromptOverride,
					signal: abortController.signal,
				})
				const iter = generator[Symbol.asyncIterator]()
				while (true) {
					const step = await iter.next()
					if (step.done) {
						streamFinalResult = step.value
						break
					}
					adapter.onAgentEvent(step.value)
				}
			} catch (err: any) {
				adapter.onAgentEvent({type: 'error', data: err?.message || 'broker error'} as any)
			} finally {
				// Idempotent — guarantees [DONE] terminator even if upstream stream aborted.
				// FR-CF-04 (Phase 45 Plan 04): pass real upstream tokens to terminal chunk
				// so the OpenAI SSE wire format includes `usage` before `data: [DONE]`,
				// and the parse-usage.ts capture middleware writes a non-zero broker_usage row.
				if (streamFinalResult) {
					const promptTokens = streamFinalResult.totalInputTokens || 0
					const completionTokens = streamFinalResult.totalOutputTokens || 0
					adapter.finalize(streamFinalResult.stoppedReason, {
						prompt_tokens: promptTokens,
						completion_tokens: completionTokens,
						total_tokens: promptTokens + completionTokens,
					})
				} else {
					adapter.finalize()
				}
				if (!res.writableEnded) res.end()
			}
			return
		}

		// 7. Sync response: buffer all chunks, return single OpenAI ChatCompletion JSON
		const buffer = aggregateChunkText()
		const abortController = new AbortController()
		let finalResult: AgentResult | undefined
		try {
			const generator = createSdkAgentRunnerForUser({
				livinityd: deps.livinityd,
				userId: auth.userId,
				task: sdkArgs.task,
				contextPrefix: sdkArgs.contextPrefix,
				systemPromptOverride: sdkArgs.systemPromptOverride,
				signal: abortController.signal,
			})
			const iter = generator[Symbol.asyncIterator]()
			while (true) {
				const step = await iter.next()
				if (step.done) {
					finalResult = step.value
					break
				}
				buffer.push(step.value)
			}
			const response = buildSyncOpenAIResponse({
				requestedModel,
				bufferedText: buffer.get(),
				result:
					finalResult ?? {
						success: false,
						answer: '',
						turns: 0,
						totalInputTokens: 0,
						totalOutputTokens: 0,
						toolCalls: [],
						stoppedReason: 'error',
					},
			})
			res.status(200).json(response)
		} catch (err: any) {
			// FR-CF-01 (Phase 45 Plan 02) — strict 429-only allowlist with Retry-After
			// verbatim forwarding (pitfall B-09 / B-10). Mirrors router.ts:157 catch.
			if (err instanceof UpstreamHttpError) {
				if (err.status === 429) {
					if (err.retryAfter !== null) {
						res.setHeader('Retry-After', err.retryAfter)
					}
					res.status(429).json({
						error: {
							message: err.message,
							type: 'rate_limit_exceeded_error',
							code: 'rate_limit_exceeded',
						},
					})
					return
				}
				// Non-429 upstream error: forward upstream status verbatim.
				res.status(err.status).json({
					error: {
						message: err.message,
						type: 'api_error',
						code: 'upstream_failure',
					},
				})
				return
			}
			// Genuinely-internal error (no upstream Response): preserve 500.
			res.status(500).json({
				error: {
					message: err?.message || 'broker error',
					type: 'api_error',
					code: 'upstream_failure',
				},
			})
		}
	})
}
