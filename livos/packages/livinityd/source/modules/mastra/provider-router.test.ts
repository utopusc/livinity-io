/**
 * Phase 197-01 Plan 01 Task 2 — provider-router.test.ts (RED → GREEN).
 *
 * Coverage (≥8 PASS):
 *   1. resolveAgentModel with provider='xai' returns a model handle
 *   2. provider='claude' throws ProviderNotConfiguredError with .code
 *   3. provider='openai' throws same error
 *   4. Redis returns null → falls back to 'xai' branch (no throw)
 *   5. Redis returns garbage → falls back to 'xai' (T-197-01-03 allow-list)
 *   6. fetch middleware sets Authorization: Bearer <token-from-getToken>
 *   7. T-197-01-01: thrown error from fetch transport never contains raw Bearer
 *   8. T-197-01-02 grep-locked: no XAI_API_KEY anywhere
 */

import {describe, expect, test, vi, beforeEach, afterEach} from 'vitest'

import {
	ALLOWED_XAI_MODELS,
	coerceModel,
	createProviderRouter,
	createTokenFetch,
	REDIS_ACTIVE_PROVIDER_KEY,
	XAI_DEFAULT_MODEL_ID,
} from './provider-router.js'
import {ProviderNotConfiguredError} from './errors.js'

function makeDeps(opts: {
	activeProvider?: string | null
	token?: string
}): {
	xaiCreds: {getToken: ReturnType<typeof vi.fn>}
	redis: {get: ReturnType<typeof vi.fn>}
} {
	return {
		xaiCreds: {getToken: vi.fn().mockResolvedValue(opts.token ?? 'OAUTH-TOKEN-123')},
		redis: {get: vi.fn().mockImplementation(async (k: string) => (k === REDIS_ACTIVE_PROVIDER_KEY ? opts.activeProvider ?? null : null))},
	}
}

describe('createProviderRouter', () => {
	test('Test 1: provider=xai returns a model handle (non-null)', async () => {
		const deps = makeDeps({activeProvider: 'xai'})
		const router = createProviderRouter(deps as never)
		const model = await router.resolveAgentModel()
		expect(model).toBeTruthy()
	})

	test('Test 2: provider=claude throws ProviderNotConfiguredError', async () => {
		const deps = makeDeps({activeProvider: 'claude'})
		const router = createProviderRouter(deps as never)
		await expect(router.resolveAgentModel()).rejects.toBeInstanceOf(ProviderNotConfiguredError)
		try {
			await router.resolveAgentModel()
		} catch (err) {
			expect((err as ProviderNotConfiguredError).code).toBe('PROVIDER_NOT_CONFIGURED')
			expect((err as Error).message).toContain('claude')
		}
	})

	test('Test 3: provider=openai throws ProviderNotConfiguredError', async () => {
		const deps = makeDeps({activeProvider: 'openai'})
		const router = createProviderRouter(deps as never)
		await expect(router.resolveAgentModel()).rejects.toBeInstanceOf(ProviderNotConfiguredError)
	})

	test('Test 4: Redis returns null → falls back to xai (no throw)', async () => {
		const deps = makeDeps({activeProvider: null})
		const router = createProviderRouter(deps as never)
		const model = await router.resolveAgentModel()
		expect(model).toBeTruthy()
	})

	test('Test 5: Redis returns garbage (T-197-01-03 allow-list) → falls back to xai', async () => {
		const deps = makeDeps({activeProvider: 'rm-rf'})
		const router = createProviderRouter(deps as never)
		const model = await router.resolveAgentModel()
		expect(model).toBeTruthy()
	})
})

describe('createTokenFetch middleware (T-197-01-01)', () => {
	let fetchSpy: ReturnType<typeof vi.spyOn>

	beforeEach(() => {
		fetchSpy = vi.spyOn(globalThis, 'fetch')
	})
	afterEach(() => {
		fetchSpy.mockRestore()
	})

	test('Test 6: sets Authorization header with fresh Bearer token from getToken()', async () => {
		const deps = makeDeps({token: 'OAUTH-TOKEN-XYZ'})
		fetchSpy.mockResolvedValue(new Response('{}', {status: 200}) as never)
		const middleware = createTokenFetch({xaiCreds: deps.xaiCreds as never})
		await middleware('https://api.x.ai/v1/test', {method: 'POST'})
		expect(deps.xaiCreds.getToken).toHaveBeenCalledTimes(1)
		const callArg = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined
		const headers = new Headers(callArg?.headers)
		expect(headers.get('Authorization')).toBe('Bearer OAUTH-TOKEN-XYZ')
	})

	test('Test 7: T-197-01-01 — transport throw scrubs Bearer from error message', async () => {
		const deps = makeDeps({token: 'OAUTH-TOKEN-SECRET'})
		fetchSpy.mockRejectedValue(new Error('Network error: Authorization=Bearer OAUTH-TOKEN-SECRET'))
		const middleware = createTokenFetch({xaiCreds: deps.xaiCreds as never})
		await expect(middleware('https://api.x.ai/v1/test')).rejects.toThrow(
			expect.objectContaining({message: expect.stringContaining('xAI fetch failed')}),
		)
		try {
			await middleware('https://api.x.ai/v1/test')
		} catch (err) {
			expect((err as Error).message).not.toContain('OAUTH-TOKEN-SECRET')
			// 'Bearer' substring is still allowed if it appears as scrubbed placeholder
			expect((err as Error).message).toMatch(/Bearer \[redacted\]/)
			// Raw token MUST NOT leak
			expect((err as Error).message).not.toContain('Bearer OAUTH-TOKEN-SECRET')
		}
	})

	test('Test 8: T-197-01-02 — provider-router.ts source has zero XAI_API_KEY references', async () => {
		const fs = await import('node:fs/promises')
		const path = await import('node:path')
		const {fileURLToPath} = await import('node:url')
		const here = path.dirname(fileURLToPath(import.meta.url))
		const src = await fs.readFile(path.join(here, 'provider-router.ts'), 'utf-8')
		expect(src).not.toMatch(/XAI_API_KEY/)
	})
})

/**
 * Phase 199-02 — ALLOWED_XAI_MODELS allow-list + coerceModel helper +
 * resolveAgentModel(modelId?) extended signature.
 *
 * Backs the new mastra.agent.listAvailableModels tRPC procedure (D-199-11)
 * and the chat-route → agent dynamic-model dispatch path (Plan 199-03).
 * coerceModel narrows arbitrary unknown input to AllowedXaiModel — invalid
 * or missing input falls through to XAI_DEFAULT_MODEL_ID per D-199-24
 * (soft validation; never 400s a request).
 *
 * Default model id is rotated to 'grok-4.20-0309-non-reasoning' per D-199-07 (was
 * 'grok-4.20-0309-non-reasoning' pre-Phase 199).
 */
describe('Phase 199-02: ALLOWED_XAI_MODELS + coerceModel + resolveAgentModel signature', () => {
	test('Test 9: ALLOWED_XAI_MODELS contains exactly the 4 D-199-06 ids', () => {
		expect(ALLOWED_XAI_MODELS.length).toBe(4)
		expect(ALLOWED_XAI_MODELS).toContain('grok-4.20-0309-non-reasoning')
		expect(ALLOWED_XAI_MODELS).toContain('grok-4.20-0309-non-reasoning')
		expect(ALLOWED_XAI_MODELS).toContain('grok-4.20-0309-reasoning')
		expect(ALLOWED_XAI_MODELS).toContain('grok-4.3')
	})

	test('Test 10: XAI_DEFAULT_MODEL_ID rotated to grok-4.20-0309-non-reasoning (D-199-07)', () => {
		expect(XAI_DEFAULT_MODEL_ID).toBe('grok-4.20-0309-non-reasoning')
	})

	test('Test 11: coerceModel("grok-4.3") returns "grok-4.3"', () => {
		expect(coerceModel('grok-4.3')).toBe('grok-4.3')
	})

	test('Test 12: coerceModel("grok-4.20-0309-non-reasoning") returns "grok-4.20-0309-non-reasoning"', () => {
		expect(coerceModel('grok-4.20-0309-non-reasoning')).toBe('grok-4.20-0309-non-reasoning')
	})

	test('Test 13: coerceModel("grok-4.20-0309-non-reasoning") returns "grok-4.20-0309-non-reasoning"', () => {
		expect(coerceModel('grok-4.20-0309-non-reasoning')).toBe('grok-4.20-0309-non-reasoning')
	})

	test('Test 14: coerceModel("grok-4.20-0309-reasoning") returns "grok-4.20-0309-reasoning"', () => {
		expect(coerceModel('grok-4.20-0309-reasoning')).toBe('grok-4.20-0309-reasoning')
	})

	test('Test 15: coerceModel("bogus-model-id") falls back to default (D-199-24 soft validation)', () => {
		expect(coerceModel('bogus-model-id')).toBe('grok-4.20-0309-non-reasoning')
	})

	test('Test 16: coerceModel(undefined) returns default', () => {
		expect(coerceModel(undefined)).toBe('grok-4.20-0309-non-reasoning')
	})

	test('Test 17: coerceModel(null) returns default', () => {
		expect(coerceModel(null)).toBe('grok-4.20-0309-non-reasoning')
	})

	test('Test 18: coerceModel(42) returns default (typeof guard)', () => {
		expect(coerceModel(42)).toBe('grok-4.20-0309-non-reasoning')
	})

	test('Test 19: resolveAgentModel("grok-4.3") resolves a model handle for the requested id', async () => {
		const deps = makeDeps({activeProvider: 'xai'})
		const router = createProviderRouter(deps as never)
		const model = await router.resolveAgentModel('grok-4.3')
		expect(model).toBeTruthy()
		// The @ai-sdk/xai LanguageModelV2 surface exposes `.modelId` (per the
		// SDK contract); assert the requested id propagated correctly through
		// coerceModel + provider_(resolvedId).
		expect((model as {modelId?: string}).modelId).toBe('grok-4.3')
	})

	test('Test 20: resolveAgentModel("bogus") coerces to default model id', async () => {
		const deps = makeDeps({activeProvider: 'xai'})
		const router = createProviderRouter(deps as never)
		const model = await router.resolveAgentModel('bogus')
		expect((model as {modelId?: string}).modelId).toBe('grok-4.20-0309-non-reasoning')
	})

	test('Test 21: resolveAgentModel(undefined) uses default model id', async () => {
		const deps = makeDeps({activeProvider: 'xai'})
		const router = createProviderRouter(deps as never)
		const model = await router.resolveAgentModel(undefined)
		expect((model as {modelId?: string}).modelId).toBe('grok-4.20-0309-non-reasoning')
	})

	test('Test 22: resolveAgentModel() zero-arg (backward-compat) uses default model id', async () => {
		const deps = makeDeps({activeProvider: 'xai'})
		const router = createProviderRouter(deps as never)
		const model = await router.resolveAgentModel()
		expect((model as {modelId?: string}).modelId).toBe('grok-4.20-0309-non-reasoning')
	})
})
