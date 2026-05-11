/**
 * Phase 100-10-09 — legacy bytebot Redis state cleanup unit tests.
 *
 * The 100-10-02 source rename (Bytebot → Luse) updated source code identifiers
 * but did NOT migrate Redis-stored state. The cap-registry's `liv:cap:mcp:bytebot`
 * key + any `liv:cap:tool:mcp_bytebot_*` entries + the McpConfigManager's
 * `bytebot` server entry survive across livinityd restarts and cause UI MCP
 * discovery to display the stale "bytebot" name.
 *
 * `cleanupLegacyBytebotState` is a boot-time idempotent migration: it runs
 * ONCE per livinityd start BEFORE registerLuseMcpServer, removes orphaned
 * Redis keys + the stale McpConfigManager entry, and is safe to run on every
 * boot (no-op when state is already clean).
 *
 * Failure semantics: ANY error in cleanup is logged but does NOT throw.
 * livinityd boot continues regardless — cleanup is best-effort hygiene.
 */
import {test, expect, describe, vi} from 'vitest'
import {
	cleanupLegacyBytebotState,
	cleanupOrphanedPerWebAppLuseEntries,
} from './legacy-bytebot-cleanup.js'

// Minimal fake redis — only `del` + `scan` are exercised.
function makeFakeRedis() {
	const store = new Map<string, string>()
	return {
		del: async (...keys: string[]) => {
			let n = 0
			for (const k of keys) {
				if (store.delete(k)) n++
			}
			return n
		},
		// Simplified single-pass SCAN — returns cursor '0' (done) and all keys
		// matching the MATCH argument (treated as a glob; * → .*).
		scan: async (_cursor: string, ...args: string[]) => {
			let pattern: string | undefined
			for (let i = 0; i < args.length - 1; i++) {
				if (args[i].toUpperCase() === 'MATCH') {
					pattern = args[i + 1]
					break
				}
			}
			const re = pattern
				? new RegExp(
						'^' +
							pattern
								.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
								.replace(/\*/g, '.*') +
							'$',
					)
				: null
			const keys = [...store.keys()].filter((k) => (re ? re.test(k) : true))
			return ['0', keys]
		},
		set: async (k: string, v: string) => {
			store.set(k, v)
			return 'OK'
		},
		__store: store,
	}
}

function makeFakeMcp() {
	const servers: Array<{
		name: string
		transport: string
		command: string
		enabled: boolean
		installedAt: number
	}> = []
	return {
		installServer: async (s: any) => {
			servers.push(s)
		},
		removeServer: async (name: string) => {
			const idx = servers.findIndex((s) => s.name === name)
			if (idx >= 0) servers.splice(idx, 1)
			return idx >= 0
		},
		listServers: async () => servers.slice(),
		updateServer: async () => {},
		__servers: servers,
	}
}

describe('cleanupLegacyBytebotState', () => {
	test('T-10-09-CLEANUP-01: deletes liv:cap:mcp:bytebot Redis key', async () => {
		const redis = makeFakeRedis()
		await redis.set('liv:cap:mcp:bytebot', '{}')
		const mcp = makeFakeMcp()
		await cleanupLegacyBytebotState({
			redis: redis as any,
			mcpConfigManager: mcp as any,
		})
		expect(redis.__store.has('liv:cap:mcp:bytebot')).toBe(false)
	})

	test('T-10-09-CLEANUP-02: deletes all liv:cap:tool:mcp_bytebot_* Redis keys', async () => {
		const redis = makeFakeRedis()
		await redis.set('liv:cap:tool:mcp_bytebot_computer_screenshot', '{}')
		await redis.set('liv:cap:tool:mcp_bytebot_computer_click_mouse', '{}')
		await redis.set('liv:cap:tool:mcp_bytebot_mcp__luse__list_windows', '{}')
		// Leave a non-matching key in place to verify the SCAN pattern is scoped.
		await redis.set('liv:cap:tool:builtin_shell', '{}')
		const mcp = makeFakeMcp()
		await cleanupLegacyBytebotState({
			redis: redis as any,
			mcpConfigManager: mcp as any,
		})
		const remaining = [...redis.__store.keys()].filter((k) =>
			/^liv:cap:tool:mcp_bytebot_/.test(k),
		)
		expect(remaining).toHaveLength(0)
		// Non-matching key MUST NOT be deleted.
		expect(redis.__store.has('liv:cap:tool:builtin_shell')).toBe(true)
	})

	test('T-10-09-CLEANUP-03: removes mcpConfigManager bytebot server (and leaves luse intact)', async () => {
		const redis = makeFakeRedis()
		const mcp = makeFakeMcp()
		await mcp.installServer({
			name: 'bytebot',
			transport: 'stdio',
			command: 'tsx',
			enabled: true,
			installedAt: 0,
		})
		await mcp.installServer({
			name: 'luse',
			transport: 'stdio',
			command: 'tsx',
			enabled: true,
			installedAt: 0,
		})
		await cleanupLegacyBytebotState({
			redis: redis as any,
			mcpConfigManager: mcp as any,
		})
		expect(mcp.__servers.find((s) => s.name === 'bytebot')).toBeUndefined()
		expect(mcp.__servers.find((s) => s.name === 'luse')).toBeDefined()
	})

	test('T-10-09-CLEANUP-04: idempotent — second run is a no-op', async () => {
		const redis = makeFakeRedis()
		const mcp = makeFakeMcp()
		const r1 = await cleanupLegacyBytebotState({
			redis: redis as any,
			mcpConfigManager: mcp as any,
		})
		const r2 = await cleanupLegacyBytebotState({
			redis: redis as any,
			mcpConfigManager: mcp as any,
		})
		expect(r1.errors).toHaveLength(0)
		expect(r2.errors).toHaveLength(0)
		expect(r2.redisKeysDeleted).toBe(0)
		expect(r2.mcpServersRemoved).toBe(0)
	})

	test('T-10-09-CLEANUP-05: tolerates redis errors gracefully (boot must not block)', async () => {
		const redis = {
			del: async () => {
				throw new Error('redis down')
			},
			scan: async () => ['0', []] as [string, string[]],
		}
		const mcp = makeFakeMcp()
		// Should not throw — boot must continue even if cleanup partially fails.
		const result = await cleanupLegacyBytebotState({
			redis: redis as any,
			mcpConfigManager: mcp as any,
		})
		expect(result.errors.length).toBeGreaterThan(0)
	})
})

// ============================================================================
// Phase 103-05 (Pitfall 5 from 103-RESEARCH) — boot-time sweep of stale
// `luse:webapp:*` McpConfigManager entries left over from pre-103 deploys.
//
// Pre-103 deploys called WebAppWindowManager.registerWebAppMcp() on every
// spawn, persisting per-WebApp entries to McpConfigManager (Redis-backed).
// Phase 103-05 flips LIVOS_PER_APP_LUSE default OFF — but those stale entries
// SURVIVE the code change because Redis persists across boots. Without this
// cleanup, liv-core still sees ~10 stale `luse:webapp:*` entries and fires
// Claude Code permission prompts for each on first connect.
//
// The sweep MUST be idempotent (re-running on a clean state is a no-op) and
// non-fatal (any error is caught + logged + livinityd boot continues).
// ============================================================================

describe('cleanupOrphanedPerWebAppLuseEntries (Phase 103-05)', () => {
	function makeMcp(opts: {
		servers?: Array<{name: string}>
		listThrows?: Error
		removeImpl?: (name: string) => Promise<boolean>
	}) {
		const servers = opts.servers ?? []
		const listServers = opts.listThrows
			? vi.fn(async () => {
					throw opts.listThrows
				})
			: vi.fn(async () => servers.slice() as any)
		const defaultRemove = async (name: string): Promise<boolean> => {
			const idx = servers.findIndex((s) => s.name === name)
			if (idx >= 0) {
				servers.splice(idx, 1)
				return true
			}
			return false
		}
		const removeServer = vi.fn(opts.removeImpl ?? defaultRemove)
		return {
			listServers,
			removeServer,
			installServer: vi.fn(),
			updateServer: vi.fn(),
			__servers: servers,
		}
	}

	test('T-103-05-SWEEP-01: removes ONLY luse:webapp:* entries; leaves luse + memory + bytebot etc. intact', async () => {
		const mcp = makeMcp({
			servers: [
				{name: 'luse'},
				{name: 'luse:webapp:yandex-91c9'},
				{name: 'luse:webapp:google-a3a1'},
				{name: 'memory'},
				{name: 'bytebot'}, // legacy entry — separate cleanup owns this
			],
		})

		const result = await cleanupOrphanedPerWebAppLuseEntries({
			mcpConfigManager: mcp as any,
		})

		expect(result.mcpServersRemoved).toBe(2)
		expect(result.errors).toEqual([])
		expect(mcp.removeServer).toHaveBeenCalledTimes(2)
		expect(mcp.removeServer).toHaveBeenCalledWith('luse:webapp:yandex-91c9')
		expect(mcp.removeServer).toHaveBeenCalledWith('luse:webapp:google-a3a1')
		// Untouched entries — the strict prefix filter MUST NOT mutate them.
		const remainingNames = mcp.__servers.map((s) => s.name).sort()
		expect(remainingNames).toEqual(['bytebot', 'luse', 'memory'])
	})

	test('T-103-05-SWEEP-02: listServers throws → caught, logged via opts.logger.error, returns CleanupResult with errors entry; does NOT re-throw', async () => {
		const logger = {log: vi.fn(), error: vi.fn()}
		const mcp = makeMcp({listThrows: new Error('redis pub-sub timeout')})

		// Must NOT throw.
		const result = await cleanupOrphanedPerWebAppLuseEntries({
			mcpConfigManager: mcp as any,
			logger,
		})

		expect(result.mcpServersRemoved).toBe(0)
		expect(result.errors).toHaveLength(1)
		expect(result.errors[0]).toMatch(/listServers/i)
		expect(result.errors[0]).toMatch(/redis pub-sub timeout/)
		expect(logger.error).toHaveBeenCalled()
		const errMsg = String((logger.error as any).mock.calls[0][0])
		expect(errMsg).toContain('103-05 orphan-sweep')
	})

	test('T-103-05-SWEEP-03: removeServer throws for one entry → continues, records error, removes the successes', async () => {
		const calls: string[] = []
		const removeImpl = async (name: string) => {
			calls.push(name)
			if (name === 'luse:webapp:yandex-91c9') {
				throw new Error('redis CAS conflict')
			}
			return true
		}
		const logger = {log: vi.fn(), error: vi.fn()}
		const mcp = makeMcp({
			servers: [
				{name: 'luse:webapp:yandex-91c9'},
				{name: 'luse:webapp:google-a3a1'},
				{name: 'luse:webapp:livinityio-bb22'},
			],
			removeImpl,
		})

		const result = await cleanupOrphanedPerWebAppLuseEntries({
			mcpConfigManager: mcp as any,
			logger,
		})

		// All 3 were ATTEMPTED.
		expect(calls).toHaveLength(3)
		// 2 succeeded.
		expect(result.mcpServersRemoved).toBe(2)
		// 1 error recorded.
		expect(result.errors).toHaveLength(1)
		expect(result.errors[0]).toContain('luse:webapp:yandex-91c9')
		expect(result.errors[0]).toMatch(/redis CAS conflict/)
		expect(logger.error).toHaveBeenCalled()
	})

	test('T-103-05-SWEEP-04: empty listServers → 0 removed, 0 errors, no throw, log line emitted', async () => {
		const logger = {log: vi.fn(), error: vi.fn()}
		const mcp = makeMcp({servers: []})

		const result = await cleanupOrphanedPerWebAppLuseEntries({
			mcpConfigManager: mcp as any,
			logger,
		})

		expect(result.mcpServersRemoved).toBe(0)
		expect(result.errors).toHaveLength(0)
		expect(mcp.removeServer).not.toHaveBeenCalled()
		// Clean-state log fires so operators see the sweep did run.
		const logCalls = (logger.log as any).mock.calls.map((c: any[]) => String(c[0]))
		expect(logCalls.some((l: string) => l.includes('clean state'))).toBe(true)
	})

	test('T-103-05-SWEEP-05: idempotent — second run is a no-op (entries already gone)', async () => {
		const mcp = makeMcp({
			servers: [
				{name: 'luse'},
				{name: 'luse:webapp:yandex-91c9'},
				{name: 'luse:webapp:google-a3a1'},
			],
		})

		const r1 = await cleanupOrphanedPerWebAppLuseEntries({
			mcpConfigManager: mcp as any,
		})
		const r2 = await cleanupOrphanedPerWebAppLuseEntries({
			mcpConfigManager: mcp as any,
		})

		expect(r1.mcpServersRemoved).toBe(2)
		expect(r1.errors).toEqual([])
		// Second run finds 0 orphans → 0 removeServer calls.
		expect(r2.mcpServersRemoved).toBe(0)
		expect(r2.errors).toEqual([])
		// removeServer total across both runs = 2 (only from r1).
		expect(mcp.removeServer).toHaveBeenCalledTimes(2)
		// Final state: the non-orphan `luse` entry survives both runs.
		expect(mcp.__servers.map((s) => s.name)).toEqual(['luse'])
	})

	test('T-103-05-SWEEP-06: tolerates entries with non-string name field (defensive — never throw)', async () => {
		// Real McpConfigManager always returns string names, but the input is
		// a JSON blob from Redis — defensive: filter must not blow up on
		// pathologically-shaped entries.
		const mcp = makeMcp({
			servers: [
				{name: 'luse:webapp:yandex-91c9'} as any,
				{name: 123 as any} as any, // non-string name — should be filtered out
				{name: null as any} as any,
			],
		})

		const result = await cleanupOrphanedPerWebAppLuseEntries({
			mcpConfigManager: mcp as any,
		})

		// Only the one string-name luse:webapp entry is removed; the pathological
		// entries are silently filtered out by `typeof s.name === 'string'`.
		expect(result.mcpServersRemoved).toBe(1)
		expect(result.errors).toEqual([])
	})
})

