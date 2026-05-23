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

import {convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse} from 'ai'
import {toAISdkStream} from '@mastra/ai-sdk'
import {RequestContext} from '@mastra/core/request-context'
import {z} from 'zod'

import type {LivOSMastra} from './index.js'

export interface ChatRouteHandlerDeps {
	livOSMastra: LivOSMastra
}

// T-198-02 — zod schema for the request body. Validates {messages:[…]} shape
// BEFORE the body reaches agent.stream(). Malformed shapes (e.g. {foo:1})
// surface as a 400 with the zod issues array.
//
// AI-SDK v6 UIMessage shape uses `parts: UIMessagePart[]` (not `content`).
// Legacy ModelMessage shape uses `content`. We accept either via `.passthrough()`
// so downstream `convertToModelMessages()` can normalize. Stripping `parts`
// (default zod behavior) caused Mastra MessageList.addOne to reject every
// incoming user message with "must have either content or parts" (P198 UAT).
// Phase 199-03 extension — D-199-09 backend gate + D-199-15 RequestContext
// build + E12 memory.thread wire-up.
//
//   - config.modelName: optional string; soft-validated per D-199-24. UI
//     controls the values (Plan 199-04 ModelPicker); stale UI clients that
//     send an unknown model id MUST still get a 200 + default-model stream
//     (the agent factory in liv-ai.ts reads modelName off requestContext and
//     hands it to providerRouter.resolveAgentModel which coerces via
//     coerceModel — soft validation). Numbers / arrays / non-string shapes
//     are rejected here at the zod boundary (400 — Test 6).
//   - threadId: optional string; threaded into agent.stream's memory option
//     as `{thread, resource: 'admin'}` (single-user LivOS — Plan 200+ will
//     promote `resource` to ctx.userId once multi-user lands; see T-199-03-03).
//     Closes the P197-03 wire gap noted in RESEARCH E12.
export const ChatRequestSchema = z.object({
	messages: z.array(
		z
			.object({
				role: z.enum(['user', 'assistant', 'system', 'tool']),
			})
			.passthrough(),
	),
	config: z.object({modelName: z.string().optional()}).optional(),
	threadId: z.string().optional(),
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
			// Convert AI-SDK v6 UIMessage[] (with `parts`) to ModelMessage[]
			// (with `content`) before handing to Mastra. Mastra's MessageList
			// rejects messages that have neither `content` nor `parts` after
			// internal normalization. The convertToModelMessages helper
			// produces the canonical {role, content: string|array} shape that
			// Mastra accepts unchanged.
			//
			// IMPORTANT: convertToModelMessages is async in ai@6 (was sync in
			// ai@4/5). Forgetting `await` returns a Promise that serialises as
			// `{}` and crashes prepare-memory-step with "role: undefined"
			// (P198 UAT hot-fix #2).
			const modelMessages = await convertToModelMessages(
				parsed.data.messages as never,
			)

			// Phase 199-03 — per-request Mastra RequestContext. Built FRESH
			// per request so two parallel POSTs cannot cross-talk modelName
			// values (T-199-03-02 / T-199-05 regression-lock). modelName is
			// the only key populated today; future per-request resourceId,
			// thread-version overrides, etc. should be added here in the
			// same idiomatic Map-like `.set(key, value)` shape.
			const ctx = new RequestContext()
			if (parsed.data.config?.modelName) {
				ctx.set('modelName', parsed.data.config.modelName)
			}

			// Mastra agent stream — adapter shape uses an `unknown` cast because
			// the concrete Agent<…> generics from Mastra v1.36 carry a large
			// number of phantom-type parameters we don't need to enumerate at
			// the HTTP layer. The contract we care about is:
			//   .stream(messages, opts): MastraModelOutput
			// which is exactly what toAISdkStream({from:'agent'}) consumes.
			//
			// Phase 199-03 — widened to accept the second arg carrying
			// requestContext (D-199-14: liv-ai.ts agent factory's model:
			// resolver reads requestContext.get('modelName')) AND memory
			// thread/resource (E12 wire-up: closes the P197-03 gap where
			// req.body.threadId never reached Mastra Memory).
			const stream = await (agent as unknown as {
				stream(
					messages: unknown[],
					opts: {
						requestContext: RequestContext
						memory?: {thread?: string; resource?: string}
					},
				): Promise<unknown>
			}).stream(modelMessages as unknown as unknown[], {
				requestContext: ctx,
				memory: parsed.data.threadId
					? {thread: parsed.data.threadId, resource: 'admin'}
					: undefined,
			})

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
