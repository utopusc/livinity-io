/**
 * Phase 198-01 — Mastra chatRoute Express handler factory.
 *
 * Bridges the assistant-ui frontend (Plan 198-02) to livOSMastra.agents.livAi
 * via AI-SDK-format SSE. The handler accepts a POST {messages} body, validates
 * via zod (T-198-02 mitigation), calls agent.stream(messages), then pipes
 * the result through @mastra/ai-sdk's toAISdkStream({from:'agent'}) followed
 * by the AI SDK's createUIMessageStream + createUIMessageStreamResponse helpers.
 *
 * Mount point (Plan 198-01 Task 3):
 *   app.post('/chat/:agentId', express.json({limit:'10mb'}), chatHandler)
 *
 * Forward-compat: the :agentId param supports 'livAi' today; future multi-agent
 * (P199+) extends the allow-list. Unknown agentIds return 404.
 *
 * Threat mitigations:
 *   T-198-01 (E): mount lives behind livinityd's existing JWT/express-jwt chain.
 *                 This factory itself does not re-validate auth — the boot
 *                 wire-up in source/index.ts is responsible for placing the
 *                 mount AFTER the auth middleware (per Plan 198-01 Task 3).
 *   T-198-02 (T): ChatRequestSchema zod-validates the {messages:[…]} body shape
 *                 BEFORE handing it to agent.stream(). Malformed → 400 with
 *                 zod issues.
 *   T-198-08 (T): agentId allow-list — only 'livAi' is honoured.
 *
 * B-02 lock: this file imports types from ./index.js (LivOSMastra) but does
 * NOT modify mastra/index.ts. The agent slot is read via the typed
 * livOSMastra.agents.livAi accessor shipped from Plan 197-01.
 */

import type {Request, RequestHandler, Response} from 'express'

import {createUIMessageStream, createUIMessageStreamResponse} from 'ai'
import {toAISdkStream} from '@mastra/ai-sdk'
import {z} from 'zod'

import type {LivOSMastra} from './index.js'

export interface ChatRouteHandlerDeps {
	livOSMastra: LivOSMastra
}

// T-198-02 — zod schema for the request body. Validates {messages:[…]} shape
// BEFORE the body reaches agent.stream(). Malformed shapes (e.g. {foo:1})
// surface as a 400 with the zod issues array.
//
// The `content` field accepts z.unknown() because AI-SDK / Mastra messages
// can carry rich content (text + tool-call parts + multimodal). The agent
// itself does the deep validation; we only gate the wire shape here.
export const ChatRequestSchema = z.object({
	messages: z.array(
		z.object({
			role: z.enum(['user', 'assistant', 'system', 'tool']),
			content: z.unknown(),
		}),
	),
})

export type ChatRequestBody = z.infer<typeof ChatRequestSchema>

// Forward-compat allow-list. Plan 198-01 ships with one entry; multi-agent
// in P199+ extends the list. Detection is by string match against req.params.agentId.
const ALLOWED_AGENT_IDS = new Set<string>(['livAi'])

export function createChatRouteHandler(deps: ChatRouteHandlerDeps): RequestHandler {
	return async (req: Request, res: Response) => {
		const agentId = req.params.agentId

		// agentId allow-list — T-198-08 + forward-compat gate.
		if (!ALLOWED_AGENT_IDS.has(agentId)) {
			res.status(404).json({error: `Unknown agentId: ${agentId}`})
			return
		}

		// T-198-02 zod gate — reject malformed bodies BEFORE agent.stream().
		const parsed = ChatRequestSchema.safeParse(req.body)
		if (!parsed.success) {
			res.status(400).json({
				error: 'Invalid request body',
				issues: parsed.error.issues,
			})
			return
		}

		// LivOSMastra slot may be empty if boot wire-up failed (P197-05 wiring
		// non-fatal by design). Surface 503 so the frontend can show a banner.
		const agent = deps.livOSMastra.agents.livAi
		if (!agent) {
			res.status(503).json({error: 'Liv AI agent not initialized'})
			return
		}

		try {
			// Mastra agent stream — adapter shape uses an `unknown` cast because
			// the concrete Agent<…> generics from Mastra v1.36 carry a large
			// number of phantom-type parameters we don't need to enumerate at
			// the HTTP layer. The contract we care about is:
			//   .stream(messages): MastraModelOutput
			// which is exactly what toAISdkStream({from:'agent'}) consumes.
			const stream = await (agent as unknown as {
				stream(messages: unknown[]): Promise<unknown>
			}).stream(parsed.data.messages)

			// Wrap the Mastra stream in an AI-SDK UI message stream. toAISdkStream
			// produces a ReadableStream<UIMessageChunk>; createUIMessageStream
			// then routes those chunks through an execute() writer for any
			// per-request metadata we want to add (none in P198-01; future
			// HITL events in P198-04 may inject extra parts here).
			const uiMessageStream = createUIMessageStream({
				originalMessages: parsed.data.messages as never,
				execute: async ({writer}: {writer: {merge(s: unknown): void}}) => {
					const aisdkStream = toAISdkStream(stream as never, {
						from: 'agent',
					})
					writer.merge(aisdkStream as unknown)
				},
			} as never)

			// createUIMessageStreamResponse returns a standard Web `Response`
			// (with Content-Type: text/event-stream). We forward the status +
			// headers + body into Express's res object so existing middleware
			// (cookies, CORS, helmet) continues to work.
			const response = createUIMessageStreamResponse({
				stream: uiMessageStream,
			} as never)

			res.status(response.status)
			response.headers.forEach((value, key) => {
				res.setHeader(key, value)
			})

			if (response.body) {
				const reader = response.body.getReader()
				try {
					while (true) {
						const {done, value} = await reader.read()
						if (done) break
						res.write(value)
					}
				} finally {
					reader.releaseLock()
				}
			}
			res.end()
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			res.status(500).json({error: msg})
		}
	}
}
