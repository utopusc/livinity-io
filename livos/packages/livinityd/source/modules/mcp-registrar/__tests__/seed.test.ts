/**
 * Phase 241-03 — seed.test.ts
 *
 * Unit tests for seedAionUiMcpConfig — the boot-time orchestrator that
 * composes the 4 building blocks from 241-01 + 241-02 (transform,
 * redis-catalog, aionui-client, ready-poll) into a single async function.
 *
 * 9 scenarios (A-I) verify every decision-flow branch of the Idempotency
 * Strategy pseudocode (241-RESEARCH.md §Idempotency Strategy):
 *
 *   A — sentinel already set (no-op fast path)
 *   B — empty AionUi: first boot, fresh Mini PC, all 5 created
 *   C — partial AionUi: re-seed after partial previous run
 *   D — full AionUi: operator already had all 5
 *   E — customized AionUi: operator edited luse — Pitfall 1 guard
 *   F — AionUi not ready (timeout)
 *   G — sync-to-agents fails — Pitfall 2 guard (sentinel must NOT be set)
 *   H — one create fails (partial failure resilience)
 *   I — luse toggle fails (NON-fatal per RESEARCH.md A2)
 */

import {beforeEach, describe, expect, test, vi} from 'vitest'

import type {AionUiMcpClient, AionUiSyncResult} from '../aionui-client.js'
import {
	MCP_CONFIG_REDIS_HASH_KEY,
	SYSTEM_MCP_NAMES,
} from '../redis-catalog.js'
import {MCP_SEED_SENTINEL_KEY, seedAionUiMcpConfig, type SeedRedisClient} from '../seed.js'
import type {
	AionUiCreateMcpServerRequest,
	AionUiServerRecord,
	LivRedisEntry,
	SeedLogger,
} from '../types.js'

const BASE_URL = 'http://127.0.0.1:3020'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeFakeRedis(opts: {
	sentinel?: string | null
	hash?: Record<string, string>
}): SeedRedisClient & {
	_setCalls: Array<{key: string; value: string}>
	_getCalls: string[]
	_hgetallCalls: string[]
} {
	const setCalls: Array<{key: string; value: string}> = []
	const getCalls: string[] = []
	const hgetallCalls: string[] = []
	let sentinelValue: string | null = opts.sentinel ?? null
	const hash = opts.hash ?? {}
	return {
		_setCalls: setCalls,
		_getCalls: getCalls,
		_hgetallCalls: hgetallCalls,
		get: vi.fn(async (key: string) => {
			getCalls.push(key)
			if (key === MCP_SEED_SENTINEL_KEY) return sentinelValue
			return null
		}),
		set: vi.fn(async (key: string, value: string) => {
			setCalls.push({key, value})
			if (key === MCP_SEED_SENTINEL_KEY) sentinelValue = value
			return 'OK'
		}),
		hgetall: vi.fn(async (key: string) => {
			hgetallCalls.push(key)
			expect(key).toBe(MCP_CONFIG_REDIS_HASH_KEY)
			return hash
		}),
	}
}

function makeCapturingLogger(): {
	logger: SeedLogger
	infos: string[]
	warns: Array<{msg: string; err?: unknown}>
	errors: Array<{msg: string; err?: unknown}>
} {
	const infos: string[] = []
	const warns: Array<{msg: string; err?: unknown}> = []
	const errors: Array<{msg: string; err?: unknown}> = []
	return {
		logger: {
			info: (m) => infos.push(m),
			warn: (m, e) => warns.push({msg: m, err: e}),
			error: (m, e) => errors.push({msg: m, err: e}),
		},
		infos,
		warns,
		errors,
	}
}

interface MockClient {
	listServers: ReturnType<typeof vi.fn>
	findByName: ReturnType<typeof vi.fn>
	createServer: ReturnType<typeof vi.fn>
	toggleServer: ReturnType<typeof vi.fn>
	syncToAgents: ReturnType<typeof vi.fn>
}

function makeMockClient(): MockClient {
	return {
		listServers: vi.fn(),
		findByName: vi.fn(),
		createServer: vi.fn(),
		toggleServer: vi.fn(),
		syncToAgents: vi.fn(),
	}
}

/** Cast our mock client to the AionUiMcpClient interface for DI. */
function asClient(m: MockClient): AionUiMcpClient {
	return m as unknown as AionUiMcpClient
}

/** Build a stdio JSON entry as Redis would store it (string-of-JSON). */
function stdioEntry(name: string, command: string, enabled = false): string {
	const entry: LivRedisEntry = {
		name,
		transport: 'stdio',
		command,
		args: [],
		enabled,
	}
	return JSON.stringify(entry)
}

function makeFullCatalog(): Record<string, string> {
	return {
		luse: stdioEntry('luse', '/usr/local/bin/luse', true),
		'liv-docker': stdioEntry('liv-docker', 'liv-docker-mcp'),
		'liv-system': stdioEntry('liv-system', 'liv-system-mcp'),
		'liv-apps': stdioEntry('liv-apps', 'liv-apps-mcp'),
		'liv-vault': stdioEntry('liv-vault', 'liv-vault-mcp'),
	}
}

function makeServerRecord(name: string, id = `mcp_${name}`): AionUiServerRecord {
	return {
		id,
		name,
		enabled: false,
		transport: {type: 'stdio', command: 'node'},
		status: 'disconnected',
		builtin: false,
		created_at: 1,
		updated_at: 1,
	}
}

const fullSyncOk: AionUiSyncResult = {
	success: true,
	results: [
		{agent: 'claude', success: true},
		{agent: 'gemini', success: true},
		{agent: 'qwen', success: true},
		{agent: 'codex', success: true},
		{agent: 'codebuddy', success: true},
		{agent: 'opencode', success: true},
		{agent: 'aionrs', success: true},
		{agent: 'aionui', success: true},
	],
}

const waitFnTrue = vi.fn().mockResolvedValue(true)
const waitFnFalse = vi.fn().mockResolvedValue(false)

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

describe('seedAionUiMcpConfig', () => {
	beforeEach(() => {
		waitFnTrue.mockClear().mockResolvedValue(true)
		waitFnFalse.mockClear().mockResolvedValue(false)
	})

	test('Scenario A — sentinel already set: idempotent re-boot (no-op)', async () => {
		const redis = makeFakeRedis({sentinel: '1', hash: makeFullCatalog()})
		const {logger, infos} = makeCapturingLogger()
		const client = makeMockClient()

		const result = await seedAionUiMcpConfig({
			redis,
			aionUiBaseUrl: BASE_URL,
			logger,
			client: asClient(client),
			waitForReady: waitFnTrue,
		})

		expect(result).toEqual({created: 0, skipped: 0, errored: 0, sentinelSet: false})
		expect(client.listServers).not.toHaveBeenCalled()
		expect(client.createServer).not.toHaveBeenCalled()
		expect(client.syncToAgents).not.toHaveBeenCalled()
		expect(waitFnTrue).not.toHaveBeenCalled()
		expect(infos.some((m) => /sentinel set.*skip/i.test(m))).toBe(true)
	})

	test('Scenario B — empty AionUi: first boot creates all 5 + toggles luse + sync + sentinel', async () => {
		const redis = makeFakeRedis({sentinel: null, hash: makeFullCatalog()})
		const {logger} = makeCapturingLogger()
		const client = makeMockClient()
		client.listServers.mockResolvedValue([])
		// createServer returns the new record (we look up id for luse toggle)
		client.createServer.mockImplementation(async (req: AionUiCreateMcpServerRequest) => {
			return makeServerRecord(req.name, `mcp_${req.name}`)
		})
		client.toggleServer.mockResolvedValue(undefined)
		client.syncToAgents.mockResolvedValue(fullSyncOk)

		const result = await seedAionUiMcpConfig({
			redis,
			aionUiBaseUrl: BASE_URL,
			logger,
			client: asClient(client),
			waitForReady: waitFnTrue,
		})

		expect(result).toEqual({created: 5, skipped: 0, errored: 0, sentinelSet: true})
		expect(client.createServer).toHaveBeenCalledTimes(5)
		const namesCreated = client.createServer.mock.calls
			.map((c) => (c[0] as AionUiCreateMcpServerRequest).name)
			.sort()
		expect(namesCreated).toEqual([...SYSTEM_MCP_NAMES].sort())
		// luse alone is enabled:true in the catalog → toggle called exactly once
		expect(client.toggleServer).toHaveBeenCalledTimes(1)
		expect(client.toggleServer).toHaveBeenCalledWith('mcp_luse', true)
		// syncToAgents called once with ALL 5 names (not just newly created)
		expect(client.syncToAgents).toHaveBeenCalledTimes(1)
		const syncedNames = (client.syncToAgents.mock.calls[0][0] as string[]).sort()
		expect(syncedNames).toEqual([...SYSTEM_MCP_NAMES].sort())
		// sentinel set
		expect(redis._setCalls).toEqual([{key: MCP_SEED_SENTINEL_KEY, value: '1'}])
	})

	test('Scenario C — partial AionUi: 2 already exist, 3 created, sentinel SET', async () => {
		const redis = makeFakeRedis({sentinel: null, hash: makeFullCatalog()})
		const {logger} = makeCapturingLogger()
		const client = makeMockClient()
		client.listServers.mockResolvedValue([
			makeServerRecord('luse', 'mcp_luse_existing'),
			makeServerRecord('liv-docker', 'mcp_liv-docker_existing'),
		])
		client.createServer.mockImplementation(async (req: AionUiCreateMcpServerRequest) => {
			return makeServerRecord(req.name)
		})
		client.toggleServer.mockResolvedValue(undefined)
		client.syncToAgents.mockResolvedValue(fullSyncOk)

		const result = await seedAionUiMcpConfig({
			redis,
			aionUiBaseUrl: BASE_URL,
			logger,
			client: asClient(client),
			waitForReady: waitFnTrue,
		})

		expect(result).toEqual({created: 3, skipped: 2, errored: 0, sentinelSet: true})
		expect(client.createServer).toHaveBeenCalledTimes(3)
		const namesCreated = client.createServer.mock.calls
			.map((c) => (c[0] as AionUiCreateMcpServerRequest).name)
			.sort()
		expect(namesCreated).toEqual(['liv-apps', 'liv-system', 'liv-vault'])
		// toggleServer NOT called for luse (it was skipped, not created → no toggle)
		expect(client.toggleServer).not.toHaveBeenCalled()
		// syncToAgents called with ALL 5 names
		expect(client.syncToAgents).toHaveBeenCalledTimes(1)
		expect((client.syncToAgents.mock.calls[0][0] as string[]).sort()).toEqual(
			[...SYSTEM_MCP_NAMES].sort(),
		)
		expect(redis._setCalls).toEqual([{key: MCP_SEED_SENTINEL_KEY, value: '1'}])
	})

	test('Scenario D — full AionUi: operator already has all 5, no creates, sync still runs, sentinel SET', async () => {
		const redis = makeFakeRedis({sentinel: null, hash: makeFullCatalog()})
		const {logger} = makeCapturingLogger()
		const client = makeMockClient()
		client.listServers.mockResolvedValue([
			makeServerRecord('luse'),
			makeServerRecord('liv-docker'),
			makeServerRecord('liv-system'),
			makeServerRecord('liv-apps'),
			makeServerRecord('liv-vault'),
		])
		client.syncToAgents.mockResolvedValue(fullSyncOk)

		const result = await seedAionUiMcpConfig({
			redis,
			aionUiBaseUrl: BASE_URL,
			logger,
			client: asClient(client),
			waitForReady: waitFnTrue,
		})

		expect(result).toEqual({created: 0, skipped: 5, errored: 0, sentinelSet: true})
		expect(client.createServer).not.toHaveBeenCalled()
		expect(client.toggleServer).not.toHaveBeenCalled()
		// Stage 5 always runs
		expect(client.syncToAgents).toHaveBeenCalledTimes(1)
		expect(redis._setCalls).toEqual([{key: MCP_SEED_SENTINEL_KEY, value: '1'}])
	})

	test('Scenario E — customized AionUi: Pitfall 1 guard — operator edits preserved', async () => {
		const redis = makeFakeRedis({sentinel: null, hash: makeFullCatalog()})
		const {logger, infos} = makeCapturingLogger()
		const client = makeMockClient()
		// luse exists but with operator-edited command
		const editedLuse: AionUiServerRecord = {
			...makeServerRecord('luse'),
			transport: {type: 'stdio', command: '/operator/custom/luse-debug.js'},
		}
		client.listServers.mockResolvedValue([
			editedLuse,
			makeServerRecord('liv-docker'),
			makeServerRecord('liv-system'),
			makeServerRecord('liv-apps'),
			makeServerRecord('liv-vault'),
		])
		client.syncToAgents.mockResolvedValue(fullSyncOk)

		const result = await seedAionUiMcpConfig({
			redis,
			aionUiBaseUrl: BASE_URL,
			logger,
			client: asClient(client),
			waitForReady: waitFnTrue,
		})

		expect(result).toEqual({created: 0, skipped: 5, errored: 0, sentinelSet: true})
		// CRITICAL: createServer NEVER called for luse — operator edit preserved
		expect(client.createServer).not.toHaveBeenCalled()
		expect(infos.some((m) => /luse.*already present.*skipping/i.test(m))).toBe(true)
		expect(redis._setCalls).toEqual([{key: MCP_SEED_SENTINEL_KEY, value: '1'}])
	})

	test('Scenario F — AionUi not ready (timeout): sentinel NOT set, will retry next boot', async () => {
		const redis = makeFakeRedis({sentinel: null, hash: makeFullCatalog()})
		const {logger, warns} = makeCapturingLogger()
		const client = makeMockClient()

		const result = await seedAionUiMcpConfig({
			redis,
			aionUiBaseUrl: BASE_URL,
			logger,
			client: asClient(client),
			waitForReady: waitFnFalse,
		})

		expect(result).toEqual({created: 0, skipped: 0, errored: 0, sentinelSet: false})
		expect(client.listServers).not.toHaveBeenCalled()
		expect(client.createServer).not.toHaveBeenCalled()
		expect(client.syncToAgents).not.toHaveBeenCalled()
		expect(redis._setCalls).toEqual([])
		expect(warns.some((w) => /AionUi not ready/i.test(w.msg))).toBe(true)
	})

	test('Scenario G — sync-to-agents fails: Pitfall 2 guard — sentinel NOT set', async () => {
		const redis = makeFakeRedis({sentinel: null, hash: makeFullCatalog()})
		const {logger} = makeCapturingLogger()
		const client = makeMockClient()
		client.listServers.mockResolvedValue([])
		client.createServer.mockImplementation(async (req: AionUiCreateMcpServerRequest) => {
			return makeServerRecord(req.name)
		})
		client.toggleServer.mockResolvedValue(undefined)
		client.syncToAgents.mockRejectedValue(new Error('agent config write failed'))

		const result = await seedAionUiMcpConfig({
			redis,
			aionUiBaseUrl: BASE_URL,
			logger,
			client: asClient(client),
			waitForReady: waitFnTrue,
		})

		expect(result.created).toBe(5)
		expect(result.skipped).toBe(0)
		expect(result.errored).toBeGreaterThanOrEqual(1)
		expect(result.sentinelSet).toBe(false)
		// CRITICAL: sentinel must NOT be set (Pitfall 2)
		expect(redis._setCalls).toEqual([])
	})

	test('Scenario H — one create fails: 4 succeed, 1 errors, sentinel NOT set', async () => {
		const redis = makeFakeRedis({sentinel: null, hash: makeFullCatalog()})
		const {logger, warns} = makeCapturingLogger()
		const client = makeMockClient()
		client.listServers.mockResolvedValue([])
		client.createServer.mockImplementation(async (req: AionUiCreateMcpServerRequest) => {
			if (req.name === 'liv-vault') throw new Error('400 bad payload')
			return makeServerRecord(req.name)
		})
		client.toggleServer.mockResolvedValue(undefined)
		client.syncToAgents.mockResolvedValue(fullSyncOk)

		const result = await seedAionUiMcpConfig({
			redis,
			aionUiBaseUrl: BASE_URL,
			logger,
			client: asClient(client),
			waitForReady: waitFnTrue,
		})

		expect(result.created).toBe(4)
		expect(result.errored).toBeGreaterThanOrEqual(1)
		expect(result.sentinelSet).toBe(false)
		// The 4 non-failing creates STILL happened (resilience)
		expect(client.createServer).toHaveBeenCalledTimes(5)
		expect(warns.some((w) => /liv-vault.*POST failed/i.test(w.msg))).toBe(true)
		expect(redis._setCalls).toEqual([])
	})

	test('Scenario I — luse toggle fails: NON-fatal (errored stays 0, sentinel SET)', async () => {
		const redis = makeFakeRedis({sentinel: null, hash: makeFullCatalog()})
		const {logger, warns} = makeCapturingLogger()
		const client = makeMockClient()
		client.listServers.mockResolvedValue([])
		client.createServer.mockImplementation(async (req: AionUiCreateMcpServerRequest) => {
			return makeServerRecord(req.name)
		})
		client.toggleServer.mockRejectedValue(new Error('toggle endpoint 404'))
		client.syncToAgents.mockResolvedValue(fullSyncOk)

		const result = await seedAionUiMcpConfig({
			redis,
			aionUiBaseUrl: BASE_URL,
			logger,
			client: asClient(client),
			waitForReady: waitFnTrue,
		})

		expect(result).toEqual({created: 5, skipped: 0, errored: 0, sentinelSet: true})
		expect(client.toggleServer).toHaveBeenCalledTimes(1)
		expect(warns.some((w) => /luse.*toggle failed/i.test(w.msg))).toBe(true)
		// sentinel still SET — toggle failure is acceptable degradation (RESEARCH.md A2)
		expect(redis._setCalls).toEqual([{key: MCP_SEED_SENTINEL_KEY, value: '1'}])
	})
})
