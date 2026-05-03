import express, {type Request, type Response} from 'express'
import type {AgentResult} from '@nexus/core'
import {resolveAndAuthorizeUserId} from './auth.js'
import {translateAnthropicMessagesToSdkArgs} from './translate-request.js'
import {createSseAdapter} from './sse-adapter.js'
import {buildSyncAnthropicResponse, aggregateChunkText} from './sync-response.js'
import {createSdkAgentRunnerForUser, UpstreamHttpError} from './agent-runner-factory.js'
import type {AnthropicMessagesRequest, BrokerDeps} from './types.js'
import {registerOpenAIRoutes} from './openai-router.js'
import {resolveMode} from './mode-dispatch.js'
import {passthroughAnthropicMessages} from './passthrough-handler.js'
import {resolveModelAlias} from './alias-resolver.js'

/**
 * Create the broker Express router.
 *
 * Route surface:
 *   POST /:userId/v1/messages — accepts Anthropic Messages API body, returns
 *                                Anthropic Messages JSON (sync) or
 *                                Anthropic Messages SSE chunks (when stream:true).
 *
 * Middleware chain (in order):
 *   1. express.json({limit:'10mb'}) — parse JSON body (10mb headroom for future image blocks)
 *   2. resolveAndAuthorizeUserId   — 400 invalid id / 404 unknown / 403 single-user-mode
 *   3. body validation              — 400 for invalid Anthropic Messages shape
 *   4. handler                      — sync or SSE response per body.stream flag
 *
 * Phase 60 — IP guard REMOVED (FR-BROKER-B2-01). Phase 59 Bearer middleware
 * (mounted at `/u/:userId/v1` in server/index.ts) is the new primary identity
 * surface for external Bearer-authed traffic via api.livinity.io. For internal
 * Mini-PC-LAN traffic without a Bearer header, the Phase 59 middleware falls
 * through (req.userId not set) and the legacy URL-path resolveAndAuthorizeUserId
 * still validates ownership. The container IP guard previously lived here as
 * defense-in-depth against external traffic reaching this route — now
 * superseded by Server5 Caddy + caddy-ratelimit perimeter (Wave 1) + Bearer
 * auth (Phase 59).
 */
export function createBrokerRouter(deps: BrokerDeps): express.Router {
	const router = express.Router()

	// 1. JSON body parsing (10MB limit — leaves room for future image content blocks)
	router.use(express.json({limit: '10mb'}))

	// 2 + 3 + 4. POST /:userId/v1/messages
	router.post('/:userId/v1/messages', async (req: Request, res: Response) => {
		// 2. user_id resolution + authorization
		const auth = await resolveAndAuthorizeUserId(req, res, deps.livinityd)
		if (!auth) return // response already written

		// 3. body validation
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

		// Phase 61 Plan 03 D1 — alias resolution on the Anthropic /v1/messages route
		// (BUG FIX per RESEARCH.md State of the Art table — Phase 57 today does NO
		// resolution, so body.model='opus' previously 404'd upstream). Mutate
		// body.model in place so passthrough-handler.ts (which forwards body
		// verbatim) and the agent path (which echoes body.model in responses)
		// both see the resolved Claude model ID.
		const requestedModel = body.model
		const {actualModel, warn: aliasWarn} = await resolveModelAlias(
			deps.livinityd.ai.redis,
			requestedModel,
		)
		if (aliasWarn) {
			deps.livinityd.logger.log(
				`[livinity-broker] WARN unknown model '${requestedModel}' → ${actualModel}`,
			)
		}
		if (actualModel !== requestedModel) {
			deps.livinityd.logger.log(
				`[livinity-broker] anthropic route requestedModel=${requestedModel} actualModel=${actualModel}`,
			)
			body.model = actualModel
		}

		// Phase 57 (FR-BROKER-A2-01): mode dispatch — passthrough is DEFAULT, agent is opt-in via X-Livinity-Mode: agent.
		// Passthrough bypasses the sacred agent runner entirely; agent path below is byte-identical to v29.5.
		const mode = resolveMode(req)
		if (mode === 'passthrough') {
			try {
				await passthroughAnthropicMessages({
					livinityd: deps.livinityd,
					userId: auth.userId,
					body,
					res,
				})
				return
			} catch (err: any) {
				// Funnel UpstreamHttpError through the same handler block used by agent mode (lines 158-185).
				if (err && typeof err.status === 'number') {
					if (err.retryAfter) res.setHeader('Retry-After', String(err.retryAfter))
					res.status(err.status).json({
						type: 'error',
						error: {
							type: err.status === 429 ? 'rate_limit_error' : 'api_error',
							message: err.message ?? 'upstream error',
						},
					})
					return
				}
				deps.livinityd.logger.log(
					`[livinity-broker:passthrough] unexpected error user=${auth.userId}: ${err?.message ?? err}`,
				)
				res.status(502).json({
					type: 'error',
					error: {type: 'api_error', message: 'upstream Anthropic error'},
				})
				return
			}
		}
		// mode === 'agent' — existing code below unchanged

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

		// 4. Real handler — proxy to /api/agent/stream + adapt response per stream flag
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
	// (inherits express.json middleware applied above; Phase 60 removed the
	// previous router-level containerSourceIpGuard — Bearer auth at Phase 59
	// + Caddy perimeter rate-limit at Wave 1 supersede it).
	registerOpenAIRoutes(router, deps)

	return router
}
