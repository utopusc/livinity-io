// Phase 241 — read Liv's MCP catalog from Redis hash `liv:mcp:config` and
// filter to the 6 system MCPs that Phase 241 mirrors into AionUi.
// (Phase 288 added liv-deploy as the 6th.)
//
// The SYSTEM_MCP_NAMES set is duplicated here (NOT imported from
// modules/server/trpc/mcp-config-router.ts) on purpose:
//
//   - mcp-config-router.ts lives under the tRPC surface that pulls in
//     heavyweight transitive deps (zod schemas, openclaw-config-store,
//     etc.) — a boot-time module like this one must not re-load that
//     graph.
//   - The constant is small and stable (locked by Phase 219 T3 + D-241-01).
//
// To prevent drift, redis-catalog.test.ts asserts the exact name list and
// a separate phase-level check could grep both files. If a future phase
// adds another system MCP, BOTH files must be updated in the same commit.

import type {LivRedisEntry, McpCatalogTarget, SeedLogger} from './types.js'

export const MCP_CONFIG_REDIS_HASH_KEY = 'liv:mcp:config'

/**
 * Phase 219 T3 + D-241-01 — the Liv system MCPs that mirror into AionUi.
 * Tuple order is preserved deliberately (matches the order they're declared
 * in mcp-config-router.ts so a diff is one-line-readable).
 * Phase 288 appended `liv-deploy` (the DESTRUCTIVE custom-app deploy tool).
 */
export const SYSTEM_MCP_NAMES = [
	'luse',
	'liv-docker',
	'liv-system',
	'liv-apps',
	'liv-vault',
	'liv-deploy',
] as const

export const SYSTEM_MCP_NAMES_SET: ReadonlySet<string> = new Set<string>(SYSTEM_MCP_NAMES)

/**
 * Minimal Redis surface needed by readSystemMcpCatalog — single method.
 * Matches the ioredis runtime API; test mocks pass a vi.fn() shim.
 */
export interface RedisCatalogClient {
	hgetall(key: string): Promise<Record<string, string>>
}

/**
 * Read `liv:mcp:config` and return parsed system-MCP catalog targets.
 *
 * - Non-system entries are silently skipped (no log noise — operator-added
 *   MCPs are expected to live alongside the system 5 in the same hash).
 * - Malformed JSON for a system MCP is logged warn + skipped; the rest of
 *   the catalog still returns. The caller (seedAionUiMcpConfig in 241-03)
 *   counts these in `errored` so the sentinel stays unset.
 *
 * Never throws — Redis-level failures bubble up to the caller as a thrown
 * `hgetall` rejection (caller wraps in try/catch).
 */
export async function readSystemMcpCatalog(
	redis: RedisCatalogClient,
	logger: SeedLogger,
): Promise<McpCatalogTarget[]> {
	const hash = await redis.hgetall(MCP_CONFIG_REDIS_HASH_KEY)
	const out: McpCatalogTarget[] = []
	for (const [name, raw] of Object.entries(hash)) {
		if (!SYSTEM_MCP_NAMES_SET.has(name)) continue
		try {
			const parsed = JSON.parse(raw) as LivRedisEntry
			out.push({name, cfg: parsed})
		} catch (err) {
			logger.warn(`malformed Redis entry for '${name}' — skipping`, err)
		}
	}
	return out
}
