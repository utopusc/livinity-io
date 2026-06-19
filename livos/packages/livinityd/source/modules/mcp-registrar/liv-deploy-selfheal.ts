// 288: existing-box self-heal. _dld_seed_mcp_servers (deploy-livinityd.sh:1454)
// SKIPS when liv:mcp:config already exists as a HASH — so existing boxes never
// pick up the new liv-deploy seed entry on Update. This boot-time HSET-if-missing
// (HSETNX) writes the liv-deploy runtime entry into the catalog if absent, so the
// mcp-registrar (seed.ts) mirrors it into AionUi on this same boot. Same class as
// the Phase 245.1 / 286 boot-backfill. NEVER throws.

/** Minimal ioredis surface needed by the self-heal — single method. */
export interface SelfHealRedis {
	hsetnx(key: string, field: string, value: string): Promise<number>
}
export interface SelfHealLogger {
	info(m: string): void
	warn(m: string, e?: unknown): void
}

export const MCP_CONFIG_REDIS_HASH_KEY = 'liv:mcp:config'

/**
 * The liv-deploy runtime entry — the seed-JSON shape but with the api key
 * RESOLVED from env (the seed ships `__LIVOS_LIV_API_KEY__` as a placeholder;
 * here the value is already substituted). `installedAt`/`installedFrom` are
 * intentionally omitted — they are seed-only and the registrar strips them.
 */
export function buildLivDeployEntry(livApiKey: string): string {
	return JSON.stringify({
		name: 'liv-deploy',
		transport: 'stdio',
		command: '/usr/bin/npx',
		args: ['tsx', '/opt/livos/packages/livinityd/source/modules/mcp/local/liv-deploy/index.ts'],
		env: {LIVINITYD_API_URL: 'http://127.0.0.1:8080', LIV_API_KEY: livApiKey},
		description:
			'Deploy a custom Docker image / compose to this LivOS box and mint {slug}-{user}.livinity.io. Destructive (gated). Talks back to livinityd via LIVINITYD_API_URL + LIV_API_KEY.',
		category: 'system',
		enabled: true,
	})
}

/**
 * Boot-time HSET-if-missing self-heal for liv-deploy.
 *
 * - If the `liv-deploy` field is ABSENT from the `liv:mcp:config` hash, HSETNX
 *   it with the runtime entry; if already present, no-op (HSETNX → 0).
 * - HSETNX (write-only-if-absent) NEVER clobbers an operator-customized entry.
 * - Defers (logs a warning, does NOT write) when LIV_API_KEY is empty — a later
 *   boot once the key exists will seed it.
 * - NEVER throws: Redis errors are caught + logged; boot continues.
 */
export async function ensureLivDeploySeeded(
	redis: SelfHealRedis,
	livApiKey: string | undefined,
	logger: SelfHealLogger,
): Promise<{seeded: boolean}> {
	try {
		if (!livApiKey || livApiKey.length === 0) {
			logger.warn('[liv-deploy-selfheal] LIV_API_KEY missing — deferring liv-deploy seed to a later boot')
			return {seeded: false}
		}
		const wrote = await redis.hsetnx(MCP_CONFIG_REDIS_HASH_KEY, 'liv-deploy', buildLivDeployEntry(livApiKey))
		if (wrote === 1) {
			logger.info('[liv-deploy-selfheal] HSETNX liv-deploy into liv:mcp:config (existing-box backfill)')
			return {seeded: true}
		}
		return {seeded: false} // already present — operator entry preserved
	} catch (err) {
		logger.warn('[liv-deploy-selfheal] failed (non-fatal — boot continues)', err)
		return {seeded: false}
	}
}
