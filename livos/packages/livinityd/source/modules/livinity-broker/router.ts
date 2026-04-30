import express, {type Request, type Response} from 'express'
import {containerSourceIpGuard, resolveAndAuthorizeUserId} from './auth.js'
import {translateAnthropicMessagesToSdkArgs} from './translate-request.js'
import type {AnthropicMessagesRequest, BrokerDeps} from './types.js'

/**
 * Create the broker Express router.
 *
 * Route surface (Plan 41-02):
 *   POST /:userId/v1/messages — accepts Anthropic Messages API body, returns
 *                                stub JSON. Plan 41-03 wires the real
 *                                SdkAgentRunner-backed sync + SSE responses.
 *
 * Middleware chain (in order):
 *   1. containerSourceIpGuard      — reject non-loopback / non-Docker-bridge IPs (401)
 *   2. express.json({limit:'10mb'}) — parse JSON body (10mb headroom for future image blocks)
 *   3. resolveAndAuthorizeUserId   — 400 invalid id / 404 unknown / 403 single-user-mode
 *   4. body validation              — 400 for invalid Anthropic Messages shape
 *   5. handler                      — Plan 41-02 stub (Plan 41-03 replaces with real handler)
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

		// 5. Plan 41-02 STUB — Plan 41-03 wires SdkAgentRunner here.
		// Returning the parsed translation as JSON allows Plan 41-02 integration tests to verify
		// the pre-handler chain end-to-end without needing a real SdkAgentRunner mock.
		res.status(200).json({
			stub: true,
			phase: '41-02',
			userId: auth.userId,
			stream: body.stream === true,
			translated: sdkArgs,
			notice: 'Plan 41-03 will replace this stub with the real SdkAgentRunner-backed response.',
		})
	})

	return router
}
