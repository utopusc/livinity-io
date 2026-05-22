/**
 * Phase 195 Plan 05 Task 2 — xai-client.test.ts.
 *
 * Vitest suite for createXaiClient().
 *
 * Coverage (≥4 behaviors):
 *   1. chatCompletions() — 200 happy path:
 *        - returns parsed JSON verbatim
 *        - Authorization: Bearer <token>
 *        - Content-Type: application/json
 *   2. function calling pass-through — tools[] preserved unchanged in body
 *   3. 401 → refresh+retry cycle:
 *        - first fetch 401, second fetch 200 → client returns 200 result
 *        - credsService.getToken called TWICE (refresh single-flight on creds side)
 *        - both 401 → throws XaiUnauthorizedError(attempts=2)
 *   4. voice methods reject:
 *        - audioSpeech() throws XaiVoiceNotSupportedError(endpoint='audio.speech')
 *        - audioTranscriptions() throws XaiVoiceNotSupportedError(endpoint='audio.transcriptions')
 *
 * T-195-05-01 (header-only auth) — covered by assertion #1 below.
 * T-195-05-03 (single retry, no recursion) — covered by 3-fetch sanity check in
 * the double-401 case (we assert fetchFn called exactly 2 times, never 3+).
 */

import {describe, expect, test, vi} from 'vitest'

import {createXaiClient} from './xai-client.js'
import {
	XaiNotConnectedError,
	XaiUnauthorizedError,
	XaiVoiceNotSupportedError,
} from './errors.js'
import type {XaiCredentialsService} from '../xai-credentials/index.js'

// ─── Test helpers ────────────────────────────────────────────────────────────

interface MockResponse {
	status: number
	ok?: boolean
	body?: unknown
	bodyText?: string
	headers?: Record<string, string>
}

function makeResponse(opts: MockResponse): Response {
	const headers = new Map(Object.entries(opts.headers ?? {}))
	return {
		status: opts.status,
		ok: opts.ok ?? (opts.status >= 200 && opts.status < 300),
		headers: {
			get: (k: string) => headers.get(k) ?? null,
		} as unknown as Headers,
		json: async () => opts.body ?? {},
		text: async () => opts.bodyText ?? JSON.stringify(opts.body ?? {}),
	} as unknown as Response
}

function makeCredsService(token: string = 'fake-jwt'): {
	credsService: XaiCredentialsService
	getToken: ReturnType<typeof vi.fn>
} {
	const getToken = vi.fn().mockResolvedValue(token)
	// Cast to the real service type — we only use getToken in xai-client.
	const credsService = {getToken} as unknown as XaiCredentialsService
	return {credsService, getToken}
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('createXaiClient', () => {
	describe('chatCompletions', () => {
		test('200 returns parsed JSON + Authorization header is Bearer <token>', async () => {
			const {credsService, getToken} = makeCredsService('test-bearer-abc123')
			const responseBody = {
				id: 'chatcmpl-xyz',
				model: 'grok-4.20-fast',
				choices: [
					{
						index: 0,
						message: {role: 'assistant', content: 'hello world'},
						finish_reason: 'stop',
					},
				],
			}
			const mockFetch = vi
				.fn()
				.mockResolvedValueOnce(makeResponse({status: 200, body: responseBody}))

			const client = createXaiClient(credsService, {
				fetchFn: mockFetch as unknown as typeof fetch,
			})
			const result = await client.chatCompletions({
				model: 'grok-4.20-fast',
				messages: [{role: 'user', content: 'hi'}],
			})

			// Returns the parsed JSON verbatim
			expect(result).toEqual(responseBody)

			// fetch called once, Authorization header is Bearer <token>, JSON content-type
			expect(mockFetch).toHaveBeenCalledTimes(1)
			const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
			expect(url).toBe('https://api.x.ai/v1/chat/completions')
			const headers = init.headers as Record<string, string>
			expect(headers.Authorization).toBe('Bearer test-bearer-abc123')
			expect(headers['Content-Type']).toBe('application/json')

			// Token NEVER in URL — header-only auth (T-195-05-01)
			expect(url).not.toContain('test-bearer-abc123')

			// Creds service was consulted at request time
			expect(getToken).toHaveBeenCalledTimes(1)
		})

		test('function calling: tools[] passes through unchanged in request body', async () => {
			const {credsService} = makeCredsService()
			const mockFetch = vi.fn().mockResolvedValueOnce(
				makeResponse({
					status: 200,
					body: {id: 'x', model: 'grok-4.20-fast', choices: []},
				}),
			)

			const client = createXaiClient(credsService, {
				fetchFn: mockFetch as unknown as typeof fetch,
			})

			const tools = [
				{
					type: 'function' as const,
					function: {
						name: 'get_weather',
						description: 'Get current weather for a city',
						parameters: {
							type: 'object',
							properties: {city: {type: 'string'}},
							required: ['city'],
						},
					},
				},
			]

			await client.chatCompletions({
				model: 'grok-4.20-fast',
				messages: [{role: 'user', content: "what's the weather?"}],
				tools,
				tool_choice: 'auto',
			})

			const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
			const parsedBody = JSON.parse(init.body as string) as {
				tools: typeof tools
				tool_choice: string
			}
			expect(parsedBody.tools).toEqual(tools)
			expect(parsedBody.tools[0].function.name).toBe('get_weather')
			expect(parsedBody.tool_choice).toBe('auto')
		})
	})

	describe('401 refresh-retry cycle', () => {
		test('401 then 200 → client returns 200 result + getToken called twice', async () => {
			const {credsService, getToken} = makeCredsService()
			const successBody = {
				id: 'recovered',
				model: 'grok-4.20-fast',
				choices: [],
			}
			const mockFetch = vi
				.fn()
				.mockResolvedValueOnce(makeResponse({status: 401, ok: false}))
				.mockResolvedValueOnce(makeResponse({status: 200, body: successBody}))

			const client = createXaiClient(credsService, {
				fetchFn: mockFetch as unknown as typeof fetch,
			})

			const result = await client.chatCompletions({
				model: 'grok-4.20-fast',
				messages: [{role: 'user', content: 'hi'}],
			})

			expect(result).toEqual(successBody)
			expect(mockFetch).toHaveBeenCalledTimes(2)
			// getToken called TWICE — once initial, once forced re-read after 401
			expect(getToken).toHaveBeenCalledTimes(2)
		})

		test('401 twice → throws XaiUnauthorizedError with attempts=2 (T-195-05-03)', async () => {
			const {credsService} = makeCredsService()
			const mockFetch = vi
				.fn()
				.mockResolvedValue(makeResponse({status: 401, ok: false}))

			const client = createXaiClient(credsService, {
				fetchFn: mockFetch as unknown as typeof fetch,
			})

			let caught: unknown = null
			try {
				await client.chatCompletions({
					model: 'grok-4.20-fast',
					messages: [{role: 'user', content: 'hi'}],
				})
			} catch (err) {
				caught = err
			}
			expect(caught).toBeInstanceOf(XaiUnauthorizedError)
			expect((caught as XaiUnauthorizedError).attempts).toBe(2)
			expect((caught as XaiUnauthorizedError).code).toBe('XAI_UNAUTHORIZED')

			// CRITICAL: T-195-05-03 — exactly 2 fetch calls, NO recursion. If we ever
			// saw 3+ this would mean the retry budget leaked.
			expect(mockFetch).toHaveBeenCalledTimes(2)
		})
	})

	describe('voice endpoints — documented absence', () => {
		test('audioSpeech() throws XaiVoiceNotSupportedError(endpoint=audio.speech)', async () => {
			const {credsService} = makeCredsService()
			const mockFetch = vi.fn() // should never be called
			const client = createXaiClient(credsService, {
				fetchFn: mockFetch as unknown as typeof fetch,
			})

			let caught: unknown = null
			try {
				await client.audioSpeech({})
			} catch (err) {
				caught = err
			}
			expect(caught).toBeInstanceOf(XaiVoiceNotSupportedError)
			expect((caught as XaiVoiceNotSupportedError).endpoint).toBe('audio.speech')
			expect((caught as XaiVoiceNotSupportedError).code).toBe(
				'XAI_VOICE_NOT_SUPPORTED',
			)
			// No network round-trip
			expect(mockFetch).not.toHaveBeenCalled()
		})

		test('audioTranscriptions() throws XaiVoiceNotSupportedError(endpoint=audio.transcriptions)', async () => {
			const {credsService} = makeCredsService()
			const mockFetch = vi.fn()
			const client = createXaiClient(credsService, {
				fetchFn: mockFetch as unknown as typeof fetch,
			})

			let caught: unknown = null
			try {
				await client.audioTranscriptions({})
			} catch (err) {
				caught = err
			}
			expect(caught).toBeInstanceOf(XaiVoiceNotSupportedError)
			expect((caught as XaiVoiceNotSupportedError).endpoint).toBe(
				'audio.transcriptions',
			)
			expect(mockFetch).not.toHaveBeenCalled()
		})
	})

	describe('credentials gating', () => {
		test('XAI_NOT_CONNECTED from credsService surfaces as XaiNotConnectedError', async () => {
			const getToken = vi.fn().mockImplementation(async () => {
				const err = new Error('No xAI credentials')
				;(err as Error & {code?: string}).code = 'XAI_NOT_CONNECTED'
				throw err
			})
			const credsService = {getToken} as unknown as XaiCredentialsService
			const mockFetch = vi.fn()

			const client = createXaiClient(credsService, {
				fetchFn: mockFetch as unknown as typeof fetch,
			})

			let caught: unknown = null
			try {
				await client.chatCompletions({
					model: 'grok-4.20-fast',
					messages: [{role: 'user', content: 'hi'}],
				})
			} catch (err) {
				caught = err
			}
			expect(caught).toBeInstanceOf(XaiNotConnectedError)
			expect(mockFetch).not.toHaveBeenCalled()
		})
	})
})
