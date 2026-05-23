/**
 * Phase 203-07 — OpenclawClient HTTP/SSE tests.
 *
 * Covers ≥5 cases per Plan Task 2 done-criteria:
 *   1. health() returns true on {ok:true} 200 / false on 5xx / false on
 *      network error (NEVER throws)
 *   2. listProviders() parses {providers:[…]} and degrades to [] on 4xx
 *   3. invoke() POSTs to /v1/agents/invoke + parses {text} from JSON
 *   4. 401 → OpenclawClientAuthError (no retry)
 *   5. 500 → retry once → success path returns
 *   6. parseSseEvent handles `data:` (no space) AND `data: ` variants
 *      (MEMORY.md SSE quirk)
 *   7. streamInvoke yields parsed chunks across an SSE stream
 *   8. getToken resolver attaches X-Openclaw-Token when present
 */

import {describe, expect, test, vi} from 'vitest'

import {
	OpenclawClient,
	OpenclawClientAuthError,
	parseSseEvent,
	type InvokeStreamChunk,
} from './openclaw-client.js'

interface FetchInit {
	method?: string
	headers?: Record<string, string>
	body?: string
	signal?: unknown
}

function makeFetch(
	handler: (url: string, init?: FetchInit) => Promise<unknown> | unknown,
): typeof fetch {
	return (async (input: unknown, init?: unknown) => {
		const url =
			typeof input === 'string'
				? input
				: (input as {toString: () => string}).toString()
		return handler(url, init as FetchInit | undefined)
	}) as unknown as typeof fetch
}

function makeJsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {'content-type': 'application/json'},
	}) as unknown as Response
}

describe('OpenclawClient.health', () => {
	test('returns true on {ok:true}', async () => {
		const client = new OpenclawClient({
			fetchImpl: makeFetch(() =>
				makeJsonResponse(200, {ok: true, status: 'live'}),
			),
		})
		expect(await client.health()).toBe(true)
	})

	test('returns false on 5xx without throwing', async () => {
		const client = new OpenclawClient({
			fetchImpl: makeFetch(() => makeJsonResponse(503, {})),
		})
		expect(await client.health()).toBe(false)
	})

	test('returns false on network error without throwing', async () => {
		const client = new OpenclawClient({
			fetchImpl: makeFetch(() => {
				throw new Error('ECONNREFUSED')
			}),
		})
		expect(await client.health()).toBe(false)
	})
})

describe('OpenclawClient.listProviders', () => {
	test('parses {providers:[…]} from 200 body', async () => {
		const client = new OpenclawClient({
			fetchImpl: makeFetch(() =>
				makeJsonResponse(200, {providers: ['anthropic', 'openai']}),
			),
		})
		expect(await client.listProviders()).toEqual(['anthropic', 'openai'])
	})

	test('degrades to [] on 4xx (gateway has no providers endpoint)', async () => {
		const client = new OpenclawClient({
			fetchImpl: makeFetch(() => makeJsonResponse(404, {})),
		})
		await expect(client.listProviders()).rejects.toThrow()
	})
})

describe('OpenclawClient.invoke', () => {
	test('POSTs to /v1/agents/invoke with body + parses text', async () => {
		let observedUrl = ''
		let observedBody = ''
		const client = new OpenclawClient({
			fetchImpl: makeFetch((url, init) => {
				observedUrl = url
				observedBody = (init?.body as string) ?? ''
				return makeJsonResponse(200, {text: 'hello', raw: 'extra'})
			}),
		})
		const out = await client.invoke({
			agentId: 'a-1',
			message: 'hi',
		})
		expect(observedUrl).toContain('/v1/agents/invoke')
		expect(observedBody).toContain('"agentId":"a-1"')
		expect(out.text).toBe('hello')
		expect(out.raw.raw).toBe('extra')
	})

	test('401 → OpenclawClientAuthError (no retry)', async () => {
		let calls = 0
		const client = new OpenclawClient({
			fetchImpl: makeFetch(() => {
				calls++
				return new Response('Unauthorized', {status: 401})
			}),
		})
		await expect(
			client.invoke({agentId: 'a-1', message: 'hi'}),
		).rejects.toBeInstanceOf(OpenclawClientAuthError)
		expect(calls).toBe(1)
	})

	test('500 → retries once → succeeds on retry', async () => {
		let calls = 0
		const client = new OpenclawClient({
			fetchImpl: makeFetch(() => {
				calls++
				if (calls === 1) {
					return new Response('boom', {status: 503})
				}
				return makeJsonResponse(200, {text: 'recovered'})
			}),
		})
		const out = await client.invoke({agentId: 'a-1', message: 'hi'})
		expect(calls).toBe(2)
		expect(out.text).toBe('recovered')
	})
})

describe('OpenclawClient auth header', () => {
	test('getToken resolver attaches X-Openclaw-Token when present', async () => {
		let headers: Record<string, string> = {}
		const client = new OpenclawClient({
			getToken: () => 'tok-abc',
			fetchImpl: makeFetch((_url, init) => {
				headers = (init?.headers as Record<string, string>) ?? {}
				return makeJsonResponse(200, {text: 'ok'})
			}),
		})
		await client.invoke({agentId: 'a-1', message: 'hi'})
		expect(headers['X-Openclaw-Token']).toBe('tok-abc')
	})

	test('getToken returning null omits the header', async () => {
		let headers: Record<string, string> = {}
		const client = new OpenclawClient({
			getToken: () => null,
			fetchImpl: makeFetch((_url, init) => {
				headers = (init?.headers as Record<string, string>) ?? {}
				return makeJsonResponse(200, {text: 'ok'})
			}),
		})
		await client.invoke({agentId: 'a-1', message: 'hi'})
		expect(headers['X-Openclaw-Token']).toBeUndefined()
	})
})

describe('parseSseEvent', () => {
	test('parses standard `data: ` (with space) JSON payload', () => {
		const chunk = parseSseEvent('data: {"text":"hi"}')
		expect(chunk).toEqual({type: 'text', data: {text: 'hi'}})
	})

	test('parses non-spaced `data:` JSON payload (MEMORY.md quirk)', () => {
		const chunk = parseSseEvent('data:{"text":"hi"}')
		expect(chunk).toEqual({type: 'text', data: {text: 'hi'}})
	})

	test('recognises done / error / tool_call / tool_result types', () => {
		expect(parseSseEvent('event: done\ndata: {}')?.type).toBe('done')
		expect(
			parseSseEvent('data: {"error":"bad"}')?.type,
		).toBe('error')
		expect(
			parseSseEvent('data: {"tool_call":{"name":"x"}}')?.type,
		).toBe('tool_call')
		expect(
			parseSseEvent('data: {"tool_result":{"out":"y"}}')?.type,
		).toBe('tool_result')
	})

	test('non-JSON payload falls through to text chunk', () => {
		const chunk = parseSseEvent('data: just-a-string')
		expect(chunk).toEqual({type: 'text', data: {text: 'just-a-string'}})
	})

	test('heartbeat / comment lines yield null', () => {
		expect(parseSseEvent(': keepalive')).toBeNull()
		expect(parseSseEvent('event: ping')).toBeNull()
	})
})

describe('OpenclawClient.streamInvoke', () => {
	test('yields parsed chunks across an SSE stream', async () => {
		const sseBody =
			'data: {"text":"hel"}\n\n' +
			'data: {"text":"lo"}\n\n' +
			'event: done\ndata: {}\n\n'
		const encoder = new TextEncoder()
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(encoder.encode(sseBody))
				controller.close()
			},
		})
		const client = new OpenclawClient({
			fetchImpl: makeFetch(
				() =>
					new Response(stream, {
						status: 200,
						headers: {'content-type': 'text/event-stream'},
					}) as unknown as Response,
			),
		})
		const chunks: InvokeStreamChunk[] = []
		for await (const c of client.streamInvoke({
			agentId: 'a-1',
			message: 'hi',
		})) {
			chunks.push(c)
		}
		expect(chunks.length).toBeGreaterThanOrEqual(3)
		expect(chunks[0].type).toBe('text')
		expect(chunks[chunks.length - 1].type).toBe('done')
	})
})
