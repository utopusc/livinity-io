/**
 * Phase 204-01 — provider-config-router unit tests.
 *
 * 1. Empty-injection stub throws PRECONDITION_FAILED + PROVIDER_CONFIG_UNAVAILABLE.
 * 2. Built router list() returns empty array when store is empty.
 * 3. Built router set() calls keyStore.set + envFileWriter.sync + restartHook in order.
 * 4. Built router set() rejects short key (zod INVALID_KEY_FORMAT).
 * 5. Built router set() rejects unknown provider (zod BAD_REQUEST).
 */

import {describe, expect, test, vi} from 'vitest'

import {
	createProviderConfigRouter,
	providerConfigRouter,
} from './provider-config-router.js'

/**
 * Admin context mirrors `openclawos-router.test.ts` (the canonical pattern in
 * this repo for adminProcedure-gated routers).
 */
function makeAdminCtx() {
	return {
		livinityd: {} as never,
		logger: {
			info: () => undefined,
			warn: () => undefined,
			error: () => undefined,
			verbose: () => undefined,
			log: () => undefined,
			debug: () => undefined,
		},
		server: {} as never,
		user: {} as never,
		appStore: {} as never,
		apps: {} as never,
		dangerouslyBypassAuthentication: true,
		currentUser: {id: 'admin-uuid', username: 'admin', role: 'admin' as const},
		transport: 'express' as const,
	}
}

function makeDeps() {
	const keyStore = {
		list: vi.fn(async () => [] as Array<{provider: 'xai'; preview: string; addedAt: string}>),
		set: vi.fn(async (_provider: string, _key: string) => undefined),
		delete: vi.fn(async (_provider: string) => true),
	}
	const envFileWriter = {
		sync: vi.fn(async () => ({path: '/tmp/test-env', mode: 0o600})),
	}
	const restartHook = vi.fn(async () => ({ok: true as const}))
	const logger = {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	}
	return {keyStore, envFileWriter, restartHook, logger}
}

describe('providerConfigRouter — empty-injection stub', () => {
	test('1. list throws PROVIDER_CONFIG_UNAVAILABLE when production boot has not wired the deps', async () => {
		const caller = providerConfigRouter.createCaller(makeAdminCtx() as never)
		await expect(caller.list()).rejects.toMatchObject({
			code: 'PRECONDITION_FAILED',
			message: expect.stringContaining('PROVIDER_CONFIG_UNAVAILABLE'),
		})
	})
})

describe('createProviderConfigRouter — built router', () => {
	test('2. list returns empty array when store is empty', async () => {
		const deps = makeDeps()
		const r = createProviderConfigRouter(deps)
		const caller = r.createCaller(makeAdminCtx() as never)
		const res = await caller.list()
		expect(res).toEqual({providers: []})
		expect(deps.keyStore.list).toHaveBeenCalledTimes(1)
	})

	test('3. set calls keyStore.set + envFileWriter.sync + restartHook in order', async () => {
		const deps = makeDeps()
		const r = createProviderConfigRouter(deps)
		const caller = r.createCaller(makeAdminCtx() as never)
		const res = await caller.set({provider: 'xai', key: 'xai-validkey1234'})

		expect(deps.keyStore.set).toHaveBeenCalledWith('xai', 'xai-validkey1234')
		expect(deps.envFileWriter.sync).toHaveBeenCalledTimes(1)
		expect(deps.restartHook).toHaveBeenCalledTimes(1)

		// Order assertion via mock.invocationCallOrder.
		const setOrder = deps.keyStore.set.mock.invocationCallOrder[0]!
		const syncOrder = deps.envFileWriter.sync.mock.invocationCallOrder[0]!
		const restartOrder = deps.restartHook.mock.invocationCallOrder[0]!
		expect(setOrder).toBeLessThan(syncOrder)
		expect(syncOrder).toBeLessThan(restartOrder)

		expect(res).toMatchObject({
			ok: true,
			envFilePath: '/tmp/test-env',
			restartTriggered: true,
			restartRequired: false,
		})
	})

	test('4. set rejects short key with INVALID_KEY_FORMAT', async () => {
		const deps = makeDeps()
		const r = createProviderConfigRouter(deps)
		const caller = r.createCaller(makeAdminCtx() as never)
		await expect(
			caller.set({provider: 'xai', key: 'short'}),
		).rejects.toThrow()
		// keyStore.set MUST NOT be called when zod rejects.
		expect(deps.keyStore.set).not.toHaveBeenCalled()
	})

	test('5. set rejects unknown provider', async () => {
		const deps = makeDeps()
		const r = createProviderConfigRouter(deps)
		const caller = r.createCaller(makeAdminCtx() as never)
		await expect(
			caller.set({provider: 'unknown-provider' as never, key: 'validkey1234'}),
		).rejects.toThrow()
		expect(deps.keyStore.set).not.toHaveBeenCalled()
	})

	test('6. set returns restartRequired:true when restartHook fails', async () => {
		const deps = makeDeps()
		deps.restartHook.mockResolvedValueOnce(
			{ok: false, reason: 'sudo unavailable'} as never,
		)
		const r = createProviderConfigRouter(deps)
		const caller = r.createCaller(makeAdminCtx() as never)
		const res = await caller.set({provider: 'groq', key: 'gsk_validkey1234'})
		expect(res).toMatchObject({
			ok: true,
			restartTriggered: false,
			restartRequired: true,
			restartReason: 'sudo unavailable',
		})
	})

	test('7. delete calls keyStore.delete + envFileWriter.sync + restartHook', async () => {
		const deps = makeDeps()
		const r = createProviderConfigRouter(deps)
		const caller = r.createCaller(makeAdminCtx() as never)
		const res = await caller.delete({provider: 'xai'})
		expect(deps.keyStore.delete).toHaveBeenCalledWith('xai')
		expect(deps.envFileWriter.sync).toHaveBeenCalledTimes(1)
		expect(deps.restartHook).toHaveBeenCalledTimes(1)
		expect(res).toMatchObject({ok: true, restartTriggered: true})
	})
})
