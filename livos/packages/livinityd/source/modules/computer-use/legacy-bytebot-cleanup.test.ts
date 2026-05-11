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
import {test, expect, describe} from 'vitest'
import {cleanupLegacyBytebotState} from './legacy-bytebot-cleanup.js'

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
