/**
 * Phase 241-01 — redis-catalog.test.ts
 *
 * Unit tests for readSystemMcpCatalog — reads Redis hash `liv:mcp:config`,
 * filters to SYSTEM_MCP_NAMES (5 Liv system MCPs), parses each JSON value,
 * skips malformed entries with a warn log. No live Redis — pure mock client.
 *
 * Reference contracts:
 *   - livos/packages/livinityd/source/modules/server/trpc/mcp-config-router.ts L60-67
 *     (MCP_CONFIG_REDIS_HASH_KEY + SYSTEM_MCP_NAMES — single source of truth on the
 *     router side; redis-catalog.ts duplicates the constant + this test asserts
 *     they remain in sync)
 *   - .planning/phases/241-mcp-auto-add-liv-tools/241-CONTEXT.md D-241-01 (5 system MCPs)
 *   - .planning/phases/241-mcp-auto-add-liv-tools/241-RESEARCH.md §Idempotency Strategy
 *     Stage 2 (read Liv catalog pseudocode)
 */

import {describe, expect, test, vi} from 'vitest'

import {
	MCP_CONFIG_REDIS_HASH_KEY,
	readSystemMcpCatalog,
	SYSTEM_MCP_NAMES,
	SYSTEM_MCP_NAMES_SET,
	type RedisCatalogClient,
} from '../redis-catalog.js'
import type {LivRedisEntry, SeedLogger} from '../types.js'

function makeFakeRedis(hash: Record<string, string>): RedisCatalogClient {
	return {
		hgetall: vi.fn(async (key: string) => {
			expect(key).toBe(MCP_CONFIG_REDIS_HASH_KEY)
			return hash
		}),
	}
}

function makeCapturingLogger(): {
	logger: SeedLogger
	logs: string[]
	warns: Array<{msg: string; err?: unknown}>
	errors: string[]
} {
	const logs: string[] = []
	const warns: Array<{msg: string; err?: unknown}> = []
	const errors: string[] = []
	return {
		logger: {
			info: (m) => logs.push(m),
			warn: (m, e) => warns.push({msg: m, err: e}),
			error: (m) => errors.push(m),
		},
		logs,
		warns,
		errors,
	}
}

function makeStdioEntry(name: string, command: string): string {
	const entry: LivRedisEntry = {
		name,
		transport: 'stdio',
		command,
		args: [],
		enabled: false,
	}
	return JSON.stringify(entry)
}

describe('readSystemMcpCatalog', () => {
	test('empty hash returns empty array', async () => {
		const redis = makeFakeRedis({})
		const {logger} = makeCapturingLogger()
		const out = await readSystemMcpCatalog(redis, logger)
		expect(out).toEqual([])
	})

	test('filters non-system entries (only luse passes through)', async () => {
		const redis = makeFakeRedis({
			'brave-search': makeStdioEntry('brave-search', 'npx'),
			fetch: makeStdioEntry('fetch', 'npx'),
			luse: makeStdioEntry('luse', 'node'),
		})
		const {logger} = makeCapturingLogger()
		const out = await readSystemMcpCatalog(redis, logger)
		expect(out).toHaveLength(1)
		expect(out[0].name).toBe('luse')
		expect(out[0].cfg.command).toBe('node')
	})

	test('returns all 5 system MCPs when present', async () => {
		const redis = makeFakeRedis({
			luse: makeStdioEntry('luse', 'node'),
			'liv-docker': makeStdioEntry('liv-docker', 'liv-docker-mcp'),
			'liv-system': makeStdioEntry('liv-system', 'liv-system-mcp'),
			'liv-apps': makeStdioEntry('liv-apps', 'liv-apps-mcp'),
			'liv-vault': makeStdioEntry('liv-vault', 'liv-vault-mcp'),
		})
		const {logger} = makeCapturingLogger()
		const out = await readSystemMcpCatalog(redis, logger)
		const names = out.map((t) => t.name).sort()
		expect(names).toEqual(['liv-apps', 'liv-docker', 'liv-system', 'liv-vault', 'luse'])
	})

	test('malformed JSON is skipped + logged warn (other entries pass through)', async () => {
		const redis = makeFakeRedis({
			luse: makeStdioEntry('luse', 'node'),
			'liv-docker': '{not valid', // malformed
			'liv-system': makeStdioEntry('liv-system', 'liv-system-mcp'),
		})
		const {logger, warns} = makeCapturingLogger()
		const out = await readSystemMcpCatalog(redis, logger)
		const names = out.map((t) => t.name).sort()
		expect(names).toEqual(['liv-system', 'luse'])
		expect(warns).toHaveLength(1)
		expect(warns[0].msg).toMatch(/malformed Redis entry for 'liv-docker'/)
		// warn must include the underlying error as the 2nd arg for journal context
		expect(warns[0].err).toBeInstanceOf(Error)
	})

	test('SYSTEM_MCP_NAMES is exactly the 5 locked names — Set + tuple in sync', () => {
		expect([...SYSTEM_MCP_NAMES]).toEqual([
			'luse',
			'liv-docker',
			'liv-system',
			'liv-apps',
			'liv-vault',
		])
		expect(SYSTEM_MCP_NAMES_SET.size).toBe(5)
		for (const name of SYSTEM_MCP_NAMES) {
			expect(SYSTEM_MCP_NAMES_SET.has(name)).toBe(true)
		}
		expect(MCP_CONFIG_REDIS_HASH_KEY).toBe('liv:mcp:config')
	})
})
