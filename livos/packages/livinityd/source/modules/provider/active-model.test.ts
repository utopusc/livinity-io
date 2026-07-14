/**
 * Phase 316-05 (LLM-02) — active-model unit tests.
 *
 * Proves the fail-safe, explicit-selection-only design locked by 316-01's
 * DECISION:
 *   - The Ollama provider key is written ONLY by the explicit selection path
 *     (selectOllamaModel) — never by listing/pulling models — and always via
 *     the reused provider-config set/delete surface (never a direct env write).
 *   - revertToClaude tears BOTH sides down (provider-config delete + flag
 *     clear) leaving zero residual state.
 *   - The active-model flag lives at the LLM-02 key `liv:provider:active_model`
 *     (distinct from the unrelated Mastra key), driven only by explicit acts.
 *   - The sentinel written to the provider config is a fixed honest string
 *     that satisfies the writer's KEY_SHAPE_REGEX (Ollama has no real key).
 *   - The router's setActiveModel / getActiveModel / clearActiveModel
 *     procedures are adminProcedure-gated, validate the model name, and
 *     delegate to the orchestration above.
 */

import {describe, expect, test, vi} from 'vitest'

import {
	ACTIVE_MODEL_KEY,
	OLLAMA_SENTINEL,
	clearActiveModel,
	getActiveModel,
	revertToClaude,
	selectOllamaModel,
	setActiveModel,
} from './active-model.js'
import {KEY_SHAPE_REGEX} from './env-file-writer.js'
import {createOllamaModelsRouter} from '../server/trpc/ollama-models-router.js'
import type {OllamaClient} from './ollama-models.js'

// ── Fakes ──────────────────────────────────────────────────────────────────

function makeFakeRedis() {
	const store = new Map<string, string>()
	return {
		store,
		get: vi.fn(async (k: string) => store.get(k) ?? null),
		set: vi.fn(async (k: string, v: string) => {
			store.set(k, v)
			return 'OK'
		}),
		del: vi.fn(async (k: string) => {
			const had = store.has(k)
			store.delete(k)
			return had ? 1 : 0
		}),
	}
}

function makeFakeProviderConfig() {
	return {
		set: vi.fn(async (_provider: 'ollama', _key: string) => ({ok: true as const})),
		delete: vi.fn(async (_provider: 'ollama') => ({ok: true as const})),
	}
}

function makeDeps() {
	return {
		redis: makeFakeRedis(),
		providerConfig: makeFakeProviderConfig(),
		logger: {info: () => undefined, warn: () => undefined},
	}
}

// ── Flag primitives ─────────────────────────────────────────────────────────

describe('active-model flag primitives (liv:provider:active_model)', () => {
	test('the flag key is the LLM-02 provider key, not the Mastra config key', () => {
		expect(ACTIVE_MODEL_KEY).toBe('liv:provider:active_model')
		// Guard against accidental conflation with the unrelated agent-runtime key.
		expect(ACTIVE_MODEL_KEY.startsWith('liv:config:')).toBe(false)
	})

	test('setActiveModel writes the model name to the flag key', async () => {
		const redis = makeFakeRedis()
		await setActiveModel(redis, 'llama3:8b')
		expect(redis.set).toHaveBeenCalledWith(ACTIVE_MODEL_KEY, 'llama3:8b')
		expect(redis.store.get(ACTIVE_MODEL_KEY)).toBe('llama3:8b')
	})

	test('getActiveModel returns null when unset, the name when set', async () => {
		const redis = makeFakeRedis()
		expect(await getActiveModel(redis)).toBeNull()
		await setActiveModel(redis, 'mistral')
		expect(await getActiveModel(redis)).toBe('mistral')
	})

	test('clearActiveModel removes the flag', async () => {
		const redis = makeFakeRedis()
		await setActiveModel(redis, 'gemma2:2b')
		await clearActiveModel(redis)
		expect(redis.del).toHaveBeenCalledWith(ACTIVE_MODEL_KEY)
		expect(await getActiveModel(redis)).toBeNull()
	})
})

// ── Sentinel honesty (T-316-17) ──────────────────────────────────────────────

describe('Ollama provider sentinel', () => {
	test('is a fixed honest value that satisfies the writer KEY_SHAPE_REGEX', () => {
		expect(OLLAMA_SENTINEL).toBe('ollama-local-runtime')
		// Must pass the same shape gate the env-file writer enforces, so the
		// value never gets rejected downstream (T-204-04 / T-316-17).
		expect(KEY_SHAPE_REGEX.test(OLLAMA_SENTINEL)).toBe(true)
		// It is NOT a fabricated secret-looking key.
		expect(OLLAMA_SENTINEL).not.toMatch(/sk-|_key|secret|token/i)
	})
})

// ── selectOllamaModel — the ONLY key-write path ──────────────────────────────

describe('selectOllamaModel (explicit "Use as Liv model")', () => {
	test('writes the ollama sentinel via provider-config AND sets the active-model flag', async () => {
		const deps = makeDeps()
		await selectOllamaModel(deps, 'llama3:8b')

		// Reuses the existing provider-config set mutation (no direct env write).
		expect(deps.providerConfig.set).toHaveBeenCalledWith('ollama', OLLAMA_SENTINEL)
		// AND records the explicit selection in the flag.
		expect(deps.redis.set).toHaveBeenCalledWith(ACTIVE_MODEL_KEY, 'llama3:8b')
		expect(deps.redis.store.get(ACTIVE_MODEL_KEY)).toBe('llama3:8b')
	})

	test('is idempotent — re-selecting the same model re-writes both sides cleanly', async () => {
		const deps = makeDeps()
		await selectOllamaModel(deps, 'llama3:8b')
		await selectOllamaModel(deps, 'llama3:8b')
		expect(deps.providerConfig.set).toHaveBeenCalledTimes(2)
		expect(deps.redis.store.get(ACTIVE_MODEL_KEY)).toBe('llama3:8b')
	})

	test('switching models updates the flag to the newly selected model', async () => {
		const deps = makeDeps()
		await selectOllamaModel(deps, 'llama3:8b')
		await selectOllamaModel(deps, 'mistral')
		expect(deps.redis.store.get(ACTIVE_MODEL_KEY)).toBe('mistral')
	})
})

// ── revertToClaude — full teardown, zero residual ────────────────────────────

describe('revertToClaude (explicit "Revert to Claude")', () => {
	test('deletes the ollama provider config AND clears the active-model flag', async () => {
		const deps = makeDeps()
		await selectOllamaModel(deps, 'llama3:8b')
		await revertToClaude(deps)

		expect(deps.providerConfig.delete).toHaveBeenCalledWith('ollama')
		expect(deps.redis.del).toHaveBeenCalledWith(ACTIVE_MODEL_KEY)
		// Zero residual state (RESEARCH Test 2 step 4).
		expect(deps.redis.store.has(ACTIVE_MODEL_KEY)).toBe(false)
		expect(await getActiveModel(deps.redis)).toBeNull()
	})

	test('is safe to call when nothing was ever selected (idempotent teardown)', async () => {
		const deps = makeDeps()
		await revertToClaude(deps)
		expect(deps.providerConfig.delete).toHaveBeenCalledWith('ollama')
		expect(await getActiveModel(deps.redis)).toBeNull()
	})
})

// ── Router procedures ────────────────────────────────────────────────────────

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

function makeStubClient() {
	return {
		listModels: vi.fn(async () => ({models: []})),
		deleteModel: vi.fn(async () => ({ok: true, status: 200})),
		psModels: vi.fn(async () => ({models: []})),
		pullModel: vi.fn(async () => undefined),
		checkPullGuardrails: vi.fn(async () => ({
			ram: {availableGb: 32, neededGb: 7.5, ok: true},
			disk: {availableGb: 500, neededGb: 8, ok: true},
			estimate: {gb: 6, known: true, note: 'test'},
		})),
	}
}

function makeActiveModelDep() {
	return {
		select: vi.fn(async (_name: string) => undefined),
		revert: vi.fn(async () => undefined),
		get: vi.fn(async () => null as string | null),
	}
}

function makeRouterWithActiveModel(activeModel: ReturnType<typeof makeActiveModelDep>) {
	return createOllamaModelsRouter({
		client: makeStubClient() as unknown as OllamaClient,
		modelsDir: '/data/models',
		logger: {info: () => undefined, warn: () => undefined},
		activeModel,
	})
}

describe('createOllamaModelsRouter — active-model procedures (316-05)', () => {
	test('setActiveModel validates the name then delegates to activeModel.select', async () => {
		const activeModel = makeActiveModelDep()
		const caller = makeRouterWithActiveModel(activeModel).createCaller(makeAdminCtx() as never)
		const res = await caller.setActiveModel({name: 'llama3:8b'})
		expect(activeModel.select).toHaveBeenCalledWith('llama3:8b')
		expect(res.activeModel).toBe('llama3:8b')
	})

	test('setActiveModel rejects an injection-shaped name before any selection', async () => {
		const activeModel = makeActiveModelDep()
		const caller = makeRouterWithActiveModel(activeModel).createCaller(makeAdminCtx() as never)
		await expect(caller.setActiveModel({name: '../evil'})).rejects.toThrow()
		expect(activeModel.select).not.toHaveBeenCalled()
	})

	test('getActiveModel returns the currently selected model (or null)', async () => {
		const activeModel = makeActiveModelDep()
		activeModel.get.mockResolvedValueOnce('mistral')
		const caller = makeRouterWithActiveModel(activeModel).createCaller(makeAdminCtx() as never)
		const res = await caller.getActiveModel()
		expect(res.activeModel).toBe('mistral')
	})

	test('clearActiveModel delegates to activeModel.revert (revert to Claude)', async () => {
		const activeModel = makeActiveModelDep()
		const caller = makeRouterWithActiveModel(activeModel).createCaller(makeAdminCtx() as never)
		const res = await caller.clearActiveModel()
		expect(activeModel.revert).toHaveBeenCalledTimes(1)
		expect(res.ok).toBe(true)
	})

	test('the procedures surface a clear error when active-model is not wired', async () => {
		const caller = createOllamaModelsRouter({
			client: makeStubClient() as unknown as OllamaClient,
			modelsDir: '/data/models',
			logger: {info: () => undefined, warn: () => undefined},
			// activeModel intentionally omitted (pre-316-06 production wiring)
		}).createCaller(makeAdminCtx() as never)
		await expect(caller.getActiveModel()).rejects.toThrow()
	})
})
