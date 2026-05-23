/**
 * Phase 198-01 Plan 01 Task 2 — chat-route.test.ts.
 *
 * Coverage (≥5 PASS):
 *   1. handler with valid {messages:[…]} body calls agent.stream once with
 *      the messages array (happy path)
 *   2. handler with garbage body returns 400 + zod issues (T-198-02 gate)
 *   3. handler with livOSMastra.agents.livAi === undefined returns 503
 *   4. handler with unknown agentId (e.g. 'nonExistent') returns 404
 *      (T-198-08 / forward-compat agentId allow-list)
 *   5. SSE response Content-Type header is 'text/event-stream'
 *      (assertion via captured res.setHeader calls)
 *
 * Mocking strategy:
 *   - vi.mock('@mastra/ai-sdk') → toAISdkStream returns a no-op ReadableStream
 *   - vi.mock('ai')             → createUIMessageStream + createUIMessageStreamResponse
 *                                  return a stub Response with the SSE Content-Type
 *                                  header and an empty body so the Express
 *                                  forwarding loop short-circuits cleanly
 *   - Express Request/Response: lightweight stub objects (matches xai-credentials /
 *     setup-router test pattern — no @testing-library import, D-NO-NEW-DEPS).
 */

import {beforeEach, describe, expect, test, vi} from 'vitest'

// vi.mock must be at module top — hoisted by Vitest BEFORE imports below.
vi.mock('@mastra/ai-sdk', () => ({
	toAISdkStream: vi.fn(() => {
		// Return an empty ReadableStream so the createUIMessageStream
		// execute() writer.merge() call is a no-op.
		return new ReadableStream({
			start(controller) {
				controller.close()
			},
		})
	}),
}))

vi.mock('ai', () => ({
	// P198 UAT hot-fix: identity-passthrough so streamSpy assertions still
	// see the original messages array. Real `convertToModelMessages` normalizes
	// UIMessage (parts) → ModelMessage (content); the handler now invokes it
	// before agent.stream(). In tests we pass already-ModelMessage shape, so
	// returning input verbatim preserves the prior assertion contract.
	convertToModelMessages: vi.fn((messages: unknown) => messages),
	createUIMessageStream: vi.fn((opts: {execute: (a: {writer: {merge: (s: unknown) => void}}) => unknown}) => {
		// Invoke execute() synchronously so the mocked toAISdkStream is hit
		// (and the spy registers a call) before we return the stub stream.
		const writer = {merge: vi.fn()}
		void opts.execute({writer})
		return new ReadableStream({
			start(controller) {
				controller.close()
			},
		})
	}),
	createUIMessageStreamResponse: vi.fn(() => {
		// Lightweight Response-shape stub. Real `ai` builds a Response with
		// SSE Content-Type; we set the canonical header so Test 5 can assert
		// the Express forward path copied it.
		const headers = new Map<string, string>([
			['content-type', 'text/event-stream'],
		])
		return {
			status: 200,
			headers: {
				forEach: (cb: (value: string, key: string) => void) => {
					for (const [k, v] of headers) cb(v, k)
				},
			},
			body: null, // skip the Express body-forwarding loop
		}
	}),
}))

import {createChatRouteHandler, ChatRequestSchema} from './chat-route.js'

// --- Express Request/Response stubs ------------------------------------

function makeReq(opts: {agentId?: string; body?: unknown}) {
	return {
		params: {agentId: opts.agentId ?? 'livAi'},
		body: opts.body,
	} as unknown as Parameters<ReturnType<typeof createChatRouteHandler>>[0]
}

interface CapturedRes {
	statusCode: number
	headers: Record<string, string>
	jsonBody: unknown
	writeChunks: unknown[]
	ended: boolean
}

function makeRes(): {res: Parameters<ReturnType<typeof createChatRouteHandler>>[1]; captured: CapturedRes} {
	const captured: CapturedRes = {
		statusCode: 0,
		headers: {},
		jsonBody: undefined,
		writeChunks: [],
		ended: false,
	}
	const res = {
		status(code: number) {
			captured.statusCode = code
			return res
		},
		json(body: unknown) {
			captured.jsonBody = body
			return res
		},
		setHeader(key: string, value: string) {
			captured.headers[key.toLowerCase()] = value
			return res
		},
		write(chunk: unknown) {
			captured.writeChunks.push(chunk)
			return true
		},
		end() {
			captured.ended = true
			return res
		},
	} as unknown as Parameters<ReturnType<typeof createChatRouteHandler>>[1]
	return {res, captured}
}

// --- LivOSMastra stub --------------------------------------------------

function makeLivOSMastra(opts: {hasAgent: boolean; streamSpy?: ReturnType<typeof vi.fn>}) {
	if (!opts.hasAgent) {
		return {agents: {}} as never
	}
	const streamFn =
		opts.streamSpy ??
		vi.fn(async () => {
			// Mastra's MastraModelOutput shape — we return a structurally
			// minimal object since toAISdkStream is mocked above.
			return {dummy: true}
		})
	return {
		agents: {
			livAi: {
				stream: streamFn,
			},
		},
	} as never
}

// --- Tests --------------------------------------------------------------

describe('createChatRouteHandler', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	test('Test 1: valid body invokes agent.stream once with the messages array', async () => {
		const streamSpy = vi.fn(async () => ({dummy: true}))
		const livOSMastra = makeLivOSMastra({hasAgent: true, streamSpy})
		const handler = createChatRouteHandler({livOSMastra})

		const messages = [{role: 'user' as const, content: 'hi'}]
		const req = makeReq({body: {messages}})
		const {res, captured} = makeRes()

		await handler(req as never, res as never, () => {})

		expect(streamSpy).toHaveBeenCalledTimes(1)
		expect(streamSpy).toHaveBeenCalledWith(messages)
		expect(captured.statusCode).toBe(200)
		expect(captured.ended).toBe(true)
	})

	test('Test 2: garbage body returns 400 with zod issues (T-198-02 gate)', async () => {
		const streamSpy = vi.fn()
		const livOSMastra = makeLivOSMastra({hasAgent: true, streamSpy})
		const handler = createChatRouteHandler({livOSMastra})

		const req = makeReq({body: {foo: 1}})
		const {res, captured} = makeRes()

		await handler(req as never, res as never, () => {})

		expect(captured.statusCode).toBe(400)
		const body = captured.jsonBody as {error: string; issues: unknown[]}
		expect(body.error).toBe('Invalid request body')
		expect(Array.isArray(body.issues)).toBe(true)
		expect(body.issues.length).toBeGreaterThan(0)
		expect(streamSpy).not.toHaveBeenCalled()
	})

	test('Test 3: livAi agent undefined returns 503', async () => {
		const livOSMastra = makeLivOSMastra({hasAgent: false})
		const handler = createChatRouteHandler({livOSMastra})

		const req = makeReq({body: {messages: [{role: 'user', content: 'hi'}]}})
		const {res, captured} = makeRes()

		await handler(req as never, res as never, () => {})

		expect(captured.statusCode).toBe(503)
		const body = captured.jsonBody as {error: string}
		expect(body.error).toBe('Liv AI agent not initialized')
	})

	test('Test 4: unknown agentId returns 404 (T-198-08 allow-list gate)', async () => {
		const streamSpy = vi.fn()
		const livOSMastra = makeLivOSMastra({hasAgent: true, streamSpy})
		const handler = createChatRouteHandler({livOSMastra})

		const req = makeReq({
			agentId: 'nonExistent',
			body: {messages: [{role: 'user', content: 'hi'}]},
		})
		const {res, captured} = makeRes()

		await handler(req as never, res as never, () => {})

		expect(captured.statusCode).toBe(404)
		const body = captured.jsonBody as {error: string}
		expect(body.error).toContain('Unknown agentId')
		expect(body.error).toContain('nonExistent')
		expect(streamSpy).not.toHaveBeenCalled()
	})

	test('Test 5: SSE Content-Type header forwarded to Express response', async () => {
		const livOSMastra = makeLivOSMastra({hasAgent: true})
		const handler = createChatRouteHandler({livOSMastra})

		const req = makeReq({body: {messages: [{role: 'user', content: 'hi'}]}})
		const {res, captured} = makeRes()

		await handler(req as never, res as never, () => {})

		// The stubbed createUIMessageStreamResponse sets content-type:
		// text/event-stream; createChatRouteHandler forwards it via setHeader.
		expect(captured.headers['content-type']).toBe('text/event-stream')
		expect(captured.statusCode).toBe(200)
		expect(captured.ended).toBe(true)
	})

	// --- Bonus: ChatRequestSchema unit checks ---------------------------

	test('ChatRequestSchema: accepts well-formed messages array', () => {
		const parsed = ChatRequestSchema.safeParse({
			messages: [
				{role: 'user', content: 'hi'},
				{role: 'assistant', content: 'hello'},
				{role: 'system', content: 'sys'},
				{role: 'tool', content: {ok: true}},
			],
		})
		expect(parsed.success).toBe(true)
	})

	test('ChatRequestSchema: rejects role="bot" (out of enum)', () => {
		const parsed = ChatRequestSchema.safeParse({
			messages: [{role: 'bot', content: 'hi'}],
		})
		expect(parsed.success).toBe(false)
	})
})
