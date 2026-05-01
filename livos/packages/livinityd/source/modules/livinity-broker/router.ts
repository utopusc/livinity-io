import express, {type Request, type Response} from 'express'
import type {AgentResult} from '@nexus/core'
import {containerSourceIpGuard, resolveAndAuthorizeUserId} from './auth.js'
import {translateAnthropicMessagesToSdkArgs} from './translate-request.js'
import {createSseAdapter} from './sse-adapter.js'
import {buildSyncAnthropicResponse, aggregateChunkText} from './sync-response.js'
import {createSdkAgentRunnerForUser, UpstreamHttpError} from './agent-runner-factory.js'
import type {AnthropicMessagesRequest, BrokerDeps} from './types.js'
import {registerOpenAIRoutes} from './openai-router.js'

/**
 * Create the broker Express router.
 *
 * Route surface:
 *   POST /:userId/v1/messages — accepts Anthropic Messages API body, returns
 *                                Anthropic Messages JSON (sync) or
 *                                Anthropic Messages SSE chunks (when stream:true).
 *
 * Middleware chain (in order):
 *   1. containerSourceIpGuard      — reject non-loopback / non-Docker-bridge IPs (401)
 *   2. express.json({limit:'10mb'}) — parse JSON body (10mb headroom for future image blocks)
 *   3. resolveAndAuthorizeUserId   — 400 invalid id / 404 unknown / 403 single-user-mode
 *   4. body validation              — 400 for invalid Anthropic Messages shape
 *   5. handler                      — sync or SSE response per body.stream flag
 */
export function createBrokerRouter(deps: BrokerDeps): express.Router {
	const router = express.Router()

	// 1. IP guard — first thing, before body parsing
	router.use(containerSourceIpGuard)

	// 2. JSON body parsing (10MB limit — leaves room for future image content blocks)
	router.use(express.json({limit: '10mb'}))

	// 3 + 4 + 5. POST /:userId/v1/messages
	router.post('/:userId/v1/messages', async (req: Request, res: Response) => {
		// 3. user_id resolution + authorization
		const auth = await resolveAndAuthorizeUserId(req, res, deps.livinityd)
		if (!auth) return // response already written

		// 4. body validation
		const body = req.body as AnthropicMessagesRequest
		if (!body || typeof body !== 'object') {
			res.status(400).json({
				type: 'error',
				error: {type: 'invalid_request_error', message: 'request body must be JSON'},
			})
			return
		}
		if (typeof body.model !== 'string' || body.model.length === 0) {
			res.status(400).json({
				type: 'error',
				error: {type: 'invalid_request_error', message: 'model must be a non-empty string'},
			})
			return
		}
		if (!Array.isArray(body.messages) || body.messages.length === 0) {
			res.status(400).json({
				type: 'error',
				error: {type: 'invalid_request_error', message: 'messages must be a non-empty array'},
			})
			return
		}

		// Per D-41-14: client-provided tools are ignored with warn log
		if (Array.isArray(body.tools) && body.tools.length > 0) {
			deps.livinityd.logger.log(
				`[livinity-broker] WARN client provided ${body.tools.length} tools — ignoring per D-41-14 (broker only exposes LivOS MCP tools)`,
			)
		}

		// Translate (validates message shape; throws on invalid content)
		let sdkArgs
		try {
			sdkArgs = translateAnthropicMessagesToSdkArgs(body)
		} catch (err: any) {
			res.status(400).json({
				type: 'error',
				error: {type: 'invalid_request_error', message: err?.message || 'translation failed'},
			})
			return
		}

		// 5. Real handler — proxy to /api/agent/stream + adapt response per stream flag
		const wantsStream = body.stream === true
		const model = body.model

		if (wantsStream) {
			// SSE response (per D-41-12)
			res.setHeader('Content-Type', 'text/event-stream')
			res.setHeader('Cache-Control', 'no-cache')
			res.setHeader('Connection', 'keep-alive')
			res.setHeader('X-Accel-Buffering', 'no')
			res.flushHeaders()
			res.socket?.setNoDelay(true)

			const adapter = createSseAdapter({model, res})
			const abortController = new AbortController()
			res.on('close', () => abortController.abort())

			try {
				const generator = createSdkAgentRunnerForUser({
					livinityd: deps.livinityd,
					userId: auth.userId,
					task: sdkArgs.task,
					contextPrefix: sdkArgs.contextPrefix,
					systemPromptOverride: sdkArgs.systemPromptOverride,
					signal: abortController.signal,
				})
				for await (const event of generator) {
					adapter.onAgentEvent(event)
				}
			} catch (err: any) {
				adapter.onAgentEvent({type: 'error', data: err?.message || 'broker error'})
			} finally {
				res.end()
			}
		} else {
			// Sync (non-streaming) response (per D-41-13)
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
				// Iterate to drain events (capture final result via generator return)
				const iter = generator[Symbol.asyncIterator]()
				while (true) {
					const step = await iter.next()
					if (step.done) {
						finalResult = step.value
						break
					}
					buffer.push(step.value)
				}
				const response = buildSyncAnthropicResponse({
					model,
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
				// verbatim forwarding (pitfall B-09 / B-10). All other upstream statuses
				// forward at their actual code; non-UpstreamHttpError throws stay 500.
				if (err instanceof UpstreamHttpError) {
					if (err.status === 429) {
						if (err.retryAfter !== null) {
							res.setHeader('Retry-After', err.retryAfter)
						}
						res.status(429).json({
							type: 'error',
							error: {type: 'rate_limit_error', message: err.message},
						})
						return
					}
					// Non-429 upstream error: forward upstream status verbatim
					// (502/503/504 stay 502/503/504 — NOT remapped to 429, NOT collapsed to 500).
					res.status(err.status).json({
						type: 'error',
						error: {type: 'api_error', message: err.message},
					})
					return
				}
				// Genuinely-internal error (no upstream Response in scope): preserve 500.
				res.status(500).json({
					type: 'error',
					error: {type: 'api_error', message: err?.message || 'broker error'},
				})
			}
		}
	})

	// Phase 42: register OpenAI Chat Completions endpoint on the same router
	// (inherits containerSourceIpGuard + express.json middleware applied above).
	registerOpenAIRoutes(router, deps)

	return router
}
