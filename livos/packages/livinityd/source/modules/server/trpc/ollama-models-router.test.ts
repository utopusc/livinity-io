/**
 * Phase 316 review-fix — ollama-models-router regression tests.
 *
 * WR-03: deleting the CURRENTLY-active local model must auto-revert Liv to
 * Claude BEFORE the model is removed from disk, so the provider-config gateway
 * is never left pointing at a model that no longer exists. Deleting a
 * non-active model must NOT touch the active-model selection.
 */

import {describe, expect, test, vi} from 'vitest'

import {createOllamaModelsRouter, type OllamaActiveModelDep} from './ollama-models-router.js'

/**
 * Admin context mirrors provider-config-router.test.ts (the canonical pattern in
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

function makeDeps(activeModel?: OllamaActiveModelDep) {
	const client = {
		listModels: vi.fn(async () => []),
		deleteModel: vi.fn(async (_name: string) => ({ok: true as const, status: 'deleted'})),
		pullModel: vi.fn(async () => undefined),
		psModels: vi.fn(async () => []),
		checkPullGuardrails: vi.fn(async () => ({
			ram: {availableGb: 32, neededGb: 4, ok: true},
			disk: {availableGb: 100, neededGb: 6, ok: true},
			estimate: {gb: 4},
		})),
	}
	const logger = {info: vi.fn(), warn: vi.fn()}
	return {client, modelsDir: '/tmp/models', logger, activeModel}
}

describe('ollama-models-router — delete auto-revert (WR-03)', () => {
	test('deleting the ACTIVE model reverts to Claude BEFORE deleteModel runs', async () => {
		const active: OllamaActiveModelDep = {
			select: vi.fn(async () => undefined),
			revert: vi.fn(async () => undefined),
			get: vi.fn(async () => 'llama3:8b'),
		}
		const deps = makeDeps(active)
		const caller = createOllamaModelsRouter(deps as never).createCaller(makeAdminCtx() as never)

		await caller.delete({name: 'llama3:8b'})

		expect(active.revert).toHaveBeenCalledTimes(1)
		expect(deps.client.deleteModel).toHaveBeenCalledWith('llama3:8b')
		// Revert must precede the on-disk delete.
		const revertOrder = (active.revert as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!
		const deleteOrder = deps.client.deleteModel.mock.invocationCallOrder[0]!
		expect(revertOrder).toBeLessThan(deleteOrder)
	})

	test('deleting a NON-active model does not revert', async () => {
		const active: OllamaActiveModelDep = {
			select: vi.fn(async () => undefined),
			revert: vi.fn(async () => undefined),
			get: vi.fn(async () => 'qwen2.5:7b'),
		}
		const deps = makeDeps(active)
		const caller = createOllamaModelsRouter(deps as never).createCaller(makeAdminCtx() as never)

		await caller.delete({name: 'llama3:8b'})

		expect(active.revert).not.toHaveBeenCalled()
		expect(deps.client.deleteModel).toHaveBeenCalledWith('llama3:8b')
	})

	test('a failed revert aborts the delete (never orphan the active pointer)', async () => {
		const active: OllamaActiveModelDep = {
			select: vi.fn(async () => undefined),
			revert: vi.fn(async () => {
				throw new Error('provider-config delete failed')
			}),
			get: vi.fn(async () => 'llama3:8b'),
		}
		const deps = makeDeps(active)
		const caller = createOllamaModelsRouter(deps as never).createCaller(makeAdminCtx() as never)

		await expect(caller.delete({name: 'llama3:8b'})).rejects.toThrow()
		expect(deps.client.deleteModel).not.toHaveBeenCalled()
	})

	test('delete works when no active-model dep is wired (Redis unavailable)', async () => {
		const deps = makeDeps(undefined)
		const caller = createOllamaModelsRouter(deps as never).createCaller(makeAdminCtx() as never)

		await caller.delete({name: 'llama3:8b'})
		expect(deps.client.deleteModel).toHaveBeenCalledWith('llama3:8b')
	})
})
