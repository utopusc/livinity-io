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

	// -------------------------------------------------------------------------
	// Phase 245.1 contract scenarios — env-thread + default-enabled
	// -------------------------------------------------------------------------

	test('Scenario J (245.1) — all 5 system MCPs enabled:true triggers 5 toggleServer calls', async () => {
		// Build a catalog where every system MCP carries enabled:true (the
		// 245.1 contract — operator declared the 5 system MCPs mandatory).
		const hash: Record<string, string> = {
			luse: stdioEntry('luse', '/usr/local/bin/luse', true),
			'liv-docker': stdioEntry('liv-docker', 'liv-docker-mcp', true),
			'liv-system': stdioEntry('liv-system', 'liv-system-mcp', true),
			'liv-apps': stdioEntry('liv-apps', 'liv-apps-mcp', true),
			'liv-vault': stdioEntry('liv-vault', 'liv-vault-mcp', true),
		}
		const redis = makeFakeRedis({sentinel: null, hash})
		const {logger} = makeCapturingLogger()
		const client = makeMockClient()
		client.listServers.mockResolvedValue([])
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
		// CRITICAL Phase 245.1 contract: ALL 5 system MCPs toggled enabled.
		expect(client.toggleServer).toHaveBeenCalledTimes(5)
		const toggledIds = client.toggleServer.mock.calls.map((c) => c[0] as string).sort()
		expect(toggledIds).toEqual(
			[...SYSTEM_MCP_NAMES].map((n) => `mcp_${n}`).sort(),
		)
		// Each toggle call must pass `true` as the second arg.
		for (const call of client.toggleServer.mock.calls) {
			expect(call[1]).toBe(true)
		}
	})

	test('Scenario K (245.1) — luse env passed through to AionUi payload (7-key contract)', async () => {
		// luse carries the full Phase 245.1 env-thread (DISPLAY, XAUTHORITY,
		// LUSE_REDIS_URL, LIVINITYD_API_URL, LIV_API_KEY, LUSE_USER_SLUG,
		// LUSE_DOMAIN_ROOT). The seed orchestrator must forward all 7 keys
		// to AionUi via transformRedisToAionUi.
		const luseEntry: LivRedisEntry = {
			name: 'luse',
			transport: 'stdio',
			command: '/usr/bin/npx',
			args: ['tsx', '/opt/livos/packages/livinityd/source/modules/computer-use/mcp/server.ts'],
			env: {
				DISPLAY: ':1',
				XAUTHORITY: '/run/user/1000/gdm/Xauthority',
				LUSE_REDIS_URL: 'redis://default:pw@127.0.0.1:6379',
				LIVINITYD_API_URL: 'http://127.0.0.1:8080',
				LIV_API_KEY: 'test-api-key',
				LUSE_USER_SLUG: 'bruce',
				LUSE_DOMAIN_ROOT: 'livinity.io',
			},
			enabled: true,
		}
		const redis = makeFakeRedis({
			sentinel: null,
			hash: {luse: JSON.stringify(luseEntry)},
		})
		const {logger} = makeCapturingLogger()
		const client = makeMockClient()
		client.listServers.mockResolvedValue([])
		client.createServer.mockImplementation(async (req: AionUiCreateMcpServerRequest) => {
			return makeServerRecord(req.name, `mcp_${req.name}`)
		})
		client.toggleServer.mockResolvedValue(undefined)
		client.syncToAgents.mockResolvedValue(fullSyncOk)

		await seedAionUiMcpConfig({
			redis,
			aionUiBaseUrl: BASE_URL,
			logger,
			client: asClient(client),
			waitForReady: waitFnTrue,
		})

		expect(client.createServer).toHaveBeenCalledTimes(1)
		const payload = client.createServer.mock.calls[0][0] as AionUiCreateMcpServerRequest
		expect(payload.name).toBe('luse')
		expect(payload.transport.type).toBe('stdio')
		// Drift-lock: all 7 env keys must travel through.
		const stdio = payload.transport as {type: 'stdio'; env?: Record<string, string>}
		expect(stdio.env).toBeDefined()
		const envKeys = Object.keys(stdio.env ?? {}).sort()
		expect(envKeys).toEqual([
			'DISPLAY',
			'LIVINITYD_API_URL',
			'LIV_API_KEY',
			'LUSE_DOMAIN_ROOT',
			'LUSE_REDIS_URL',
			'LUSE_USER_SLUG',
			'XAUTHORITY',
		])
		// Specific value drift-lock on the Phase 245.1-introduced vars.
		expect(stdio.env?.LIVINITYD_API_URL).toBe('http://127.0.0.1:8080')
		expect(stdio.env?.LIV_API_KEY).toBe('test-api-key')
		expect(stdio.env?.LUSE_USER_SLUG).toBe('bruce')
		expect(stdio.env?.LUSE_DOMAIN_ROOT).toBe('livinity.io')
	})

	// -------------------------------------------------------------------------
	// Phase 252-05 (R12) — loud empty-catalog health signal
	// -------------------------------------------------------------------------

	test('Scenario L (252-05/R12) — empty liv:mcp:config: emptyCatalog flag set + ERROR log', async () => {
		// readSystemMcpCatalog returns [] (empty hash). The seed must NOT silently
		// no-op: it sets result.emptyCatalog = true AND logs at ERROR level so the
		// missing AionUi luse entry is operator-visible.
		const redis = makeFakeRedis({sentinel: null, hash: {}})
		const {logger, errors, warns} = makeCapturingLogger()
		const client = makeMockClient()

		const result = await seedAionUiMcpConfig({
			redis,
			aionUiBaseUrl: BASE_URL,
			logger,
			client: asClient(client),
			waitForReady: waitFnTrue,
		})

		// CRITICAL R12 contract: empty-catalog flag set, no AionUi calls, no sentinel.
		expect(result.emptyCatalog).toBe(true)
		expect(result.created).toBe(0)
		expect(result.skipped).toBe(0)
		expect(result.sentinelSet).toBe(false)
		expect(client.listServers).not.toHaveBeenCalled()
		expect(client.createServer).not.toHaveBeenCalled()
		expect(client.syncToAgents).not.toHaveBeenCalled()
		expect(redis._setCalls).toEqual([])
		// LOUD: ERROR (not warn) level so it surfaces in journalctl + health.
		expect(errors.some((e) => /EMPTY liv:mcp:config/i.test(e.msg))).toBe(true)
		// And NOT downgraded to a warn-only no-op.
		expect(warns.some((w) => /no system MCPs.*skipping/i.test(w.msg))).toBe(false)
	})

	test('Scenario M (252-05/R12) — non-empty catalog: emptyCatalog stays falsy (happy-path drift-lock)', async () => {
		const redis = makeFakeRedis({sentinel: null, hash: makeFullCatalog()})
		const {logger, errors} = makeCapturingLogger()
		const client = makeMockClient()
		client.listServers.mockResolvedValue([])
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

		// Non-empty path must NOT set the flag (false or absent) and emit NO
		// empty-catalog ERROR.
		expect(result.emptyCatalog).toBeFalsy()
		expect(result.created).toBe(5)
		expect(errors.some((e) => /EMPTY liv:mcp:config/i.test(e.msg))).toBe(false)
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
