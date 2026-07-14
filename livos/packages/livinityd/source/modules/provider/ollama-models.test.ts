/**
 * Phase 316-04 (LLM-01) — ollama-models unit tests.
 *
 * Covers the three pure/guardrail surfaces of the loopback Ollama REST
 * client module:
 *   - validateModelName / MODEL_NAME_RE allowlist (accept real tags, reject
 *     path-traversal + shell-metacharacter + whitespace names) — T-316-11.
 *   - estimateModelFootprintGb static lookup (known tags → sized estimate,
 *     unknown tags → conservative "unknown" marker).
 *   - checkPullGuardrails RAM + disk headroom gate (ok=false when available <
 *     needed + safety margin) — T-316-12.
 *
 * The client transport (fetch) and the system probes (getSystemMemoryUsage /
 * getDiskUsageByPath) are both mocked so no network + no real /proc reads.
 *
 * Router-level coverage (blocked-pull-without-override does not start the
 * background job, listModels parses /api/tags) is added in the same file by
 * Plan 316-04 Task 3.
 */

import {describe, expect, test, vi} from 'vitest'

// Mock the system probes BEFORE importing the module under test so the
// guardrail picks up the mocked headroom numbers (and we never load
// systeminformation / execa / p-queue in a unit test).
vi.mock('../system/system.js', () => ({
	getSystemMemoryUsage: vi.fn(),
	getDiskUsageByPath: vi.fn(),
}))

import {getDiskUsageByPath, getSystemMemoryUsage} from '../system/system.js'
import {
	checkPullGuardrails,
	estimateModelFootprintGb,
	MODEL_NAME_RE,
	OllamaClient,
	validateModelName,
} from './ollama-models.js'
import {createOllamaModelsRouter} from '../server/trpc/ollama-models-router.js'

const GB = 1024 ** 3

describe('validateModelName / MODEL_NAME_RE allowlist (T-316-11)', () => {
	test('accepts real Ollama model tags', () => {
		for (const good of [
			'llama3:8b-q4_0',
			'library/qwen2.5:7b',
			'mistral',
			'gemma2:2b',
			'llama3.1:70b',
			'deepseek-coder-v2:16b',
		]) {
			expect(validateModelName(good)).toBe(true)
			expect(MODEL_NAME_RE.test(good)).toBe(true)
		}
	})

	test('rejects path-traversal, shell-metacharacter, and whitespace names', () => {
		for (const bad of [
			'../evil',
			'foo/../bar',
			'foo; rm -rf /',
			'foo && curl evil',
			'foo bar',
			'llama3 8b',
			'`whoami`',
			'foo|bar',
			'',
			'  ',
		]) {
			expect(validateModelName(bad)).toBe(false)
		}
	})
})

describe('estimateModelFootprintGb static lookup', () => {
	test('known parameter-count tags return a sized, conservative estimate', () => {
		const eightB = estimateModelFootprintGb('llama3:8b-q4_0')
		expect(eightB.known).toBe(true)
		// 7-8B-Q4 ballpark ~5-7GB resident.
		expect(eightB.gb).toBeGreaterThanOrEqual(4)
		expect(eightB.gb).toBeLessThanOrEqual(8)

		const thirteenB = estimateModelFootprintGb('llama2:13b-q4_0')
		expect(thirteenB.known).toBe(true)
		expect(thirteenB.gb).toBeGreaterThan(eightB.gb)

		// A bigger model must estimate a bigger footprint.
		const seventyB = estimateModelFootprintGb('llama3.1:70b')
		expect(seventyB.gb).toBeGreaterThan(thirteenB.gb)
	})

	test('a version-numbered name is not mistaken for a parameter count', () => {
		// qwen2.5 has "2.5" but no parameter-count marker → unknown.
		const unknown = estimateModelFootprintGb('qwen2.5')
		expect(unknown.known).toBe(false)
		// Unknown still returns a conservative positive number to guard against.
		expect(unknown.gb).toBeGreaterThan(0)
	})

	test('unknown / size-less tags fall back to the caution marker', () => {
		const bare = estimateModelFootprintGb('mistral')
		expect(bare.known).toBe(false)
		expect(bare.gb).toBeGreaterThan(0)
	})
})

describe('checkPullGuardrails RAM + disk headroom (T-316-12)', () => {
	test('blocks (ram.ok=false) when available RAM is below needed + margin', async () => {
		vi.mocked(getSystemMemoryUsage).mockResolvedValue({
			size: 16 * GB,
			totalUsed: 14.5 * GB, // only ~1.5GB free
		})
		vi.mocked(getDiskUsageByPath).mockResolvedValue({
			size: 500 * GB,
			totalUsed: 100 * GB,
			available: 400 * GB, // plenty of disk
		})

		const g = await checkPullGuardrails('llama3:8b-q4_0', '/data/models')
		expect(g.ram.ok).toBe(false)
		expect(g.disk.ok).toBe(true)
		expect(g.ram.availableGb).toBeGreaterThan(0)
		expect(g.ram.neededGb).toBeGreaterThan(g.ram.availableGb)
	})

	test('blocks (disk.ok=false) when available disk is below the model size', async () => {
		vi.mocked(getSystemMemoryUsage).mockResolvedValue({
			size: 64 * GB,
			totalUsed: 8 * GB, // plenty of RAM
		})
		vi.mocked(getDiskUsageByPath).mockResolvedValue({
			size: 500 * GB,
			totalUsed: 499 * GB,
			available: 1 * GB, // almost no disk
		})

		const g = await checkPullGuardrails('llama3:8b-q4_0', '/data/models')
		expect(g.ram.ok).toBe(true)
		expect(g.disk.ok).toBe(false)
	})

	test('passes both gates when RAM and disk headroom are ample', async () => {
		vi.mocked(getSystemMemoryUsage).mockResolvedValue({
			size: 64 * GB,
			totalUsed: 8 * GB,
		})
		vi.mocked(getDiskUsageByPath).mockResolvedValue({
			size: 1000 * GB,
			totalUsed: 100 * GB,
			available: 900 * GB,
		})

		const g = await checkPullGuardrails('llama3:8b-q4_0', '/data/models')
		expect(g.ram.ok).toBe(true)
		expect(g.disk.ok).toBe(true)
		expect(g.estimate.known).toBe(true)
	})

	test('targets the supplied Ollama models directory for the disk probe', async () => {
		vi.mocked(getSystemMemoryUsage).mockResolvedValue({size: 64 * GB, totalUsed: 8 * GB})
		vi.mocked(getDiskUsageByPath).mockResolvedValue({
			size: 1000 * GB,
			totalUsed: 100 * GB,
			available: 900 * GB,
		})
		await checkPullGuardrails('llama3:8b-q4_0', '/opt/livos/app-data/ollama/models')
		expect(vi.mocked(getDiskUsageByPath)).toHaveBeenCalledWith(
			'/opt/livos/app-data/ollama/models',
		)
	})
})

// ── Task 3 (a): client transport — listModels parses /api/tags ─────────────

describe('OllamaClient.listModels parses GET /api/tags', () => {
	test('returns the parsed models array', async () => {
		const fetchImpl = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						models: [
							{
								name: 'llama3:8b',
								size: 4_700_000_000,
								digest: 'sha256:abc',
								modified_at: '2026-01-01T00:00:00Z',
							},
						],
					}),
					{status: 200, headers: {'content-type': 'application/json'}},
				),
		)
		const client = new OllamaClient({fetchImpl: fetchImpl as unknown as typeof fetch})
		const res = await client.listModels()
		expect(res.models).toHaveLength(1)
		expect(res.models[0]!.name).toBe('llama3:8b')
		// SSRF guard — the URL is the hardcoded loopback, never a caller host.
		expect(fetchImpl).toHaveBeenCalledWith(
			'http://127.0.0.1:11434/api/tags',
			expect.objectContaining({method: 'GET'}),
		)
	})

	test('surfaces a typed OLLAMA_UNREACHABLE error (never a raw undefined throw)', async () => {
		const fetchImpl = vi.fn(async () => {
			throw new Error('ECONNREFUSED 127.0.0.1:11434')
		})
		const client = new OllamaClient({fetchImpl: fetchImpl as unknown as typeof fetch})
		await expect(client.listModels()).rejects.toMatchObject({
			code: 'OLLAMA_UNREACHABLE',
		})
	})
})

// ── Task 3 (d): router — block-by-default pull does NOT start the job ───────

/**
 * Admin context — mirrors provider-config-router.test.ts (the canonical
 * pattern for adminProcedure-gated routers in this repo).
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

function makeRouterClient(guardrailPasses: boolean) {
	return {
		listModels: vi.fn(async () => ({models: []})),
		deleteModel: vi.fn(async () => ({ok: true, status: 200})),
		psModels: vi.fn(async () => ({models: []})),
		pullModel: vi.fn(async () => undefined),
		checkPullGuardrails: vi.fn(async () => ({
			ram: {availableGb: guardrailPasses ? 32 : 1, neededGb: 7.5, ok: guardrailPasses},
			disk: {availableGb: 500, neededGb: 8, ok: true},
			estimate: {gb: 6, known: true, note: 'test'},
		})),
	}
}

function makeRouter(client: ReturnType<typeof makeRouterClient>) {
	return createOllamaModelsRouter({
		client: client as unknown as OllamaClient,
		modelsDir: '/data/models',
		logger: {info: () => undefined, warn: () => undefined},
	})
}

describe('createOllamaModelsRouter — pull block-by-default (T-316-12)', () => {
	test('a failing guardrail without override returns blocked + does NOT start the pull', async () => {
		const client = makeRouterClient(false) // ram.ok=false
		const caller = makeRouter(client).createCaller(makeAdminCtx() as never)
		const res = await caller.pull({name: 'llama3:70b'})
		expect(res.started).toBe(false)
		expect(res.blocked).toBe(true)
		// The background pull job MUST NOT have been kicked off.
		expect(client.pullModel).not.toHaveBeenCalled()
	})

	test('override===true starts the background pull despite a failing guardrail', async () => {
		const client = makeRouterClient(false)
		const caller = makeRouter(client).createCaller(makeAdminCtx() as never)
		const res = await caller.pull({name: 'llama3:70b', override: true})
		expect(res.started).toBe(true)
		expect(res.blocked).toBe(false)
		expect(client.pullModel).toHaveBeenCalledTimes(1)
	})

	test('a green guardrail starts the pull without an override', async () => {
		const client = makeRouterClient(true)
		const caller = makeRouter(client).createCaller(makeAdminCtx() as never)
		const res = await caller.pull({name: 'llama3:8b'})
		expect(res.started).toBe(true)
		expect(res.blocked).toBe(false)
		expect(client.pullModel).toHaveBeenCalledTimes(1)
	})

	test('an injection-shaped model name is rejected before any client call', async () => {
		const client = makeRouterClient(true)
		const caller = makeRouter(client).createCaller(makeAdminCtx() as never)
		await expect(caller.pull({name: '../evil'})).rejects.toThrow()
		expect(client.checkPullGuardrails).not.toHaveBeenCalled()
		expect(client.pullModel).not.toHaveBeenCalled()
	})

	test('delete validates the name before calling the client', async () => {
		const client = makeRouterClient(true)
		const caller = makeRouter(client).createCaller(makeAdminCtx() as never)
		await expect(caller.delete({name: 'foo; rm -rf /'})).rejects.toThrow()
		expect(client.deleteModel).not.toHaveBeenCalled()
	})
})
