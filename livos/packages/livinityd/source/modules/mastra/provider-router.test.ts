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
	createProviderRouter,
	createTokenFetch,
	REDIS_ACTIVE_PROVIDER_KEY,
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
