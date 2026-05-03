/**
 * Phase 61 Plan 02 Wave 0 — RED tests for stub provider invocation contract.
 *
 * Asserts that each of OpenAIProvider / GeminiProvider / MistralProvider:
 *   1. Constructs without error.
 *   2. `request(...)` rejects with a `NotImplementedError` whose message
 *      matches `/Provider '(openai|gemini|mistral)' not implemented in v30/`.
 *   3. `streamRequest(...)` rejects with the same error.
 *   4. `translateUsage(...)` THROWS synchronously (per BrokerProvider
 *      interface — translateUsage is declared as a sync return).
 *
 * Why this matters: the v30 broker should NEVER reach these stubs (router
 * dispatch is hardcoded to 'anthropic' — see router-no-stub-dispatch.test.ts).
 * If a future routing bug accidentally wires a stub into dispatch, the user
 * gets a loud, named-provider error instead of silent corruption.
 *
 * RED until Plan 02 Task 2 — stub files do not exist yet, so the import
 * resolution at module-load time fails.
 */
import {describe, expect, it} from 'vitest'
import {GeminiProvider} from '../gemini-stub.js'
import {MistralProvider} from '../mistral-stub.js'
import {OpenAIProvider} from '../openai-stub.js'
import {NotImplementedError, type ProviderResponse} from '../interface.js'

const params = {
	model: 'irrelevant',
	max_tokens: 1,
	messages: [{role: 'user', content: 'hi'}],
}
const opts = {authToken: 'irrelevant'}
const fakeResponse: ProviderResponse = {raw: {}, upstreamHeaders: new Headers()}

const cases = [
	['openai', OpenAIProvider],
	['gemini', GeminiProvider],
	['mistral', MistralProvider],
] as const

for (const [name, ProviderClass] of cases) {
	describe(`Phase 61 Plan 02 — ${name} stub provider throws NotImplementedError`, () => {
		const p = new ProviderClass()

		it(`exposes name === '${name}'`, () => {
			expect(p.name).toBe(name)
		})

		it('request() rejects with NotImplementedError', async () => {
			await expect(p.request(params, opts)).rejects.toBeInstanceOf(NotImplementedError)
			await expect(p.request(params, opts)).rejects.toThrow(
				new RegExp(`Provider '${name}' not implemented in v30`),
			)
			await expect(p.request(params, opts)).rejects.toMatchObject({name: 'NotImplementedError'})
		})

		it('streamRequest() rejects with NotImplementedError', async () => {
			await expect(p.streamRequest(params, opts)).rejects.toBeInstanceOf(NotImplementedError)
			await expect(p.streamRequest(params, opts)).rejects.toThrow(
				new RegExp(`Provider '${name}' not implemented in v30`),
			)
		})

		it('translateUsage() throws synchronously with NotImplementedError', () => {
			expect(() => p.translateUsage(fakeResponse)).toThrow(NotImplementedError)
			expect(() => p.translateUsage(fakeResponse)).toThrow(
				new RegExp(`Provider '${name}' not implemented in v30`),
			)
		})
	})
}
