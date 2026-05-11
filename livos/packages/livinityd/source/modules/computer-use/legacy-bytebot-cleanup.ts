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

/**
 * Phase 103-05 (Pitfall 5 from 103-RESEARCH) — boot-time sweep of stale
 * `luse:webapp:*` MCP registrations.
 *
 * Pre-103 deploys called WebAppWindowManager.registerWebAppMcp() on every
 * spawn, persisting per-WebApp entries to McpConfigManager (Redis-backed).
 * Phase 103-05 flips LIVOS_PER_APP_LUSE default OFF — but those stale
 * entries SURVIVE the code change because Redis persists across boots.
 * Without this cleanup, liv-core still sees ~10 stale `luse:webapp:*`
 * entries and fires Claude Code permission prompts for each on first
 * connect.
 *
 * Strategy: list every server registered with McpConfigManager, filter
 * by `typeof name === 'string' && name.startsWith('luse:webapp:')`, call
 * removeServer on each. The global `luse` entry, `memory`, and any other
 * server are LEFT ALONE — only the per-WebApp orphans match the prefix.
 *
 * Idempotent: re-running on a clean Redis is a no-op (orphans gone → no
 * removeServer calls).
 *
 * Non-fatal: any error (listServers throws, removeServer throws on a
 * specific entry) is caught + logged via opts.logger.error + recorded in
 * the returned `errors` array; livinityd boot continues regardless. Boot
 * order constraint: this MUST run BEFORE registerLuseMcpServer so the
 * fresh `luse` registration is the only `luse*` entry visible to liv-core
 * after boot (see agent-runs.ts).
 *
 * Mirrors the idempotent + non-fatal style of cleanupLegacyBytebotState
 * above (Phase 100-10-09).
 */
export async function cleanupOrphanedPerWebAppLuseEntries(opts: {
	mcpConfigManager: McpConfigManagerLike
	logger?: {
		log(msg: string, ...args: unknown[]): void
		error(msg: string, ...args: unknown[]): void
	}
}): Promise<{mcpServersRemoved: number; errors: string[]}> {
	const log = opts.logger ?? {log: () => {}, error: () => {}}
	const result: {mcpServersRemoved: number; errors: string[]} = {
		mcpServersRemoved: 0,
		errors: [],
	}

	let servers: Array<{name: string}>
	try {
		servers = (await opts.mcpConfigManager.listServers()) as Array<{name: string}>
	} catch (err) {
		const msg = `listServers failed: ${(err as Error).message}`
		log.error(`[103-05 orphan-sweep] ${msg}`)
		result.errors.push(msg)
		return result
	}

	// Defensive: filter by strict prefix + string-name check. The McpConfigManager
	// blob comes from Redis JSON; a pathologically-shaped entry must not crash
	// boot. Only `luse:webapp:*` strings reach removeServer — T-103-05-01.
	const orphans = servers.filter(
		(s) => typeof s.name === 'string' && s.name.startsWith('luse:webapp:'),
	)
	if (orphans.length === 0) {
		log.log(
			`[103-05 orphan-sweep] no luse:webapp:* entries found (clean state)`,
		)
		return result
	}

	log.log(
		`[103-05 orphan-sweep] removing ${orphans.length} stale luse:webapp:* entries`,
	)
	for (const s of orphans) {
		try {
			if (typeof opts.mcpConfigManager.removeServer !== 'function') {
				const msg = `removeServer not implemented on McpConfigManager (cannot remove ${s.name})`
				log.error(`[103-05 orphan-sweep] ${msg}`)
				result.errors.push(msg)
				continue
			}
			await opts.mcpConfigManager.removeServer(s.name)
			result.mcpServersRemoved += 1
		} catch (err) {
			const msg = `removeServer(${s.name}) failed: ${(err as Error).message}`
			log.error(`[103-05 orphan-sweep] ${msg}`)
			result.errors.push(msg)
		}
	}
	log.log(
		`[103-05 orphan-sweep] complete — mcpServersRemoved=${result.mcpServersRemoved} errors=${result.errors.length}`,
	)
	return result
}
