/**
 * Phase 100-10-09 — Idempotent cleanup of legacy bytebot Redis state +
 * stale McpConfigManager entry.
 *
 * Before the 100-10-02 rename (Bytebot → Luse), the MCP server was registered
 * as 'bytebot' in McpConfigManager. The associated capability registry
 * entries live under `liv:cap:mcp:bytebot` and any tool entries under
 * `liv:cap:tool:mcp_bytebot_*` Redis keys. After the rename, fresh installs
 * register under 'luse' but the old state is orphaned — UI MCP discovery
 * still surfaces the legacy 'bytebot' entry, causing user-visible confusion
 * ("Bytebot" name in the UI even after rename).
 *
 * This cleanup runs ONCE at livinityd boot, BEFORE registerLuseMcpServer,
 * and removes the orphans. It is idempotent — safe to run on every boot.
 *
 * Failure mode: ANY error in cleanup is logged but does NOT throw. livinityd
 * boot continues regardless — cleanup is a best-effort hygiene step.
 */

import type {Redis} from 'ioredis'
import type {McpConfigManagerLike} from './luse-mcp-config.js'

export interface CleanupOpts {
	redis: Pick<Redis, 'del' | 'scan'>
	mcpConfigManager: McpConfigManagerLike
	logger?: {
		log(msg: string, ...args: unknown[]): void
		error(msg: string, ...args: unknown[]): void
	}
}

export interface CleanupResult {
	redisKeysDeleted: number
	mcpServersRemoved: number
	errors: string[]
}

export async function cleanupLegacyBytebotState(
	opts: CleanupOpts,
): Promise<CleanupResult> {
	const {redis, mcpConfigManager} = opts
	const log = opts.logger ?? {log: () => {}, error: () => {}}
	const result: CleanupResult = {
		redisKeysDeleted: 0,
		mcpServersRemoved: 0,
		errors: [],
	}

	// Step 1 — Delete the bare cap:mcp:bytebot key (the cap-registry entry
	// the UI's MCP discovery reads to surface server names).
	try {
		const n = await redis.del('liv:cap:mcp:bytebot')
		result.redisKeysDeleted += n
	} catch (err) {
		const msg = `del liv:cap:mcp:bytebot failed: ${(err as Error).message}`
		log.error(`[100-10-09 cleanup] ${msg}`)
		result.errors.push(msg)
	}

	// Step 2 — SCAN+DEL the tool entries (avoid blocking KEYS on large scans).
	// The capability-registry skips `mcp__`-prefixed tools from the per-tool
	// write path (liv/packages/core/src/capability-registry.ts:180) so this
	// pattern usually matches nothing — but if any historical state predated
	// that filter, sweep them here.
	try {
		let cursor = '0'
		const batch: string[] = []
		do {
			const reply = (await redis.scan(
				cursor,
				'MATCH',
				'liv:cap:tool:mcp_bytebot_*',
				'COUNT',
				'200',
			)) as [string, string[]]
			cursor = reply[0]
			batch.push(...reply[1])
		} while (cursor !== '0')
		if (batch.length > 0) {
			// Delete in chunks of 100 to avoid command-too-large.
			for (let i = 0; i < batch.length; i += 100) {
				const slice = batch.slice(i, i + 100)
				const n = await redis.del(...slice)
				result.redisKeysDeleted += n
			}
		}
	} catch (err) {
		const msg = `scan/del liv:cap:tool:mcp_bytebot_* failed: ${(err as Error).message}`
		log.error(`[100-10-09 cleanup] ${msg}`)
		result.errors.push(msg)
	}

	// Step 3 — Remove the stale McpConfigManager 'bytebot' server entry.
	// The McpConfigManager stores all servers as a single JSON blob at
	// `liv:mcp:config`; `removeServer('bytebot')` is the only safe path to
	// mutate that blob (writes back + publishes `mcp_config` on the update
	// channel so subscribers re-sync).
	try {
		const servers = await mcpConfigManager.listServers()
		const hasBytebot = servers.some((s) => s.name === 'bytebot')
		if (hasBytebot && typeof mcpConfigManager.removeServer === 'function') {
			const removed = await mcpConfigManager.removeServer('bytebot')
			if (removed) result.mcpServersRemoved += 1
		}
	} catch (err) {
		const msg = `mcpConfigManager.removeServer('bytebot') failed: ${(err as Error).message}`
		log.error(`[100-10-09 cleanup] ${msg}`)
		result.errors.push(msg)
	}

	log.log(
		`[100-10-09 cleanup] complete — redisKeysDeleted=${result.redisKeysDeleted} mcpServersRemoved=${result.mcpServersRemoved} errors=${result.errors.length}`,
	)

	return result
}
