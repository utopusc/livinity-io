// Phase 241 — boot-time orchestrator that seeds AionUi's MCP config with
// Liv's 5 system MCPs (luse, liv-docker, liv-system, liv-apps, liv-vault).
//
// Single-shot per version sentinel; never throws. Composes the 4 building
// blocks from 241-01 + 241-02 (readSystemMcpCatalog, AionUiMcpClient,
// waitForAionUiReady, transformRedisToAionUi) per the 7-stage flow in
// .planning/phases/241-mcp-auto-add-liv-tools/241-RESEARCH.md §Idempotency
// Strategy.
//
// Locked decisions: see .planning/phases/241-mcp-auto-add-liv-tools/241-CONTEXT.md
//   D-241-02: sentinel key `livos:v43:mcp_seeded:v1` (bump suffix to re-trigger)
//   D-241-04: strict GET-and-skip name match — DESTRUCTIVE upsert otherwise
//   D-241-06: AionUi readiness via ready-poll.ts (60s budget; leave sentinel
//             unset on timeout so next boot retries)
//
// Pitfall guards (see RESEARCH.md §Common Pitfalls):
//   Pitfall 1 — every per-tool branch goes through existingNames.has() before
//               any POST /api/mcp/servers.
//   Pitfall 2 — sentinel SET only when result.errored === 0. Partial-failure
//               state leaves sentinel unset so next boot retries.
//   Pitfall 3 — handled in aionui-client.ts (uses /api/mcp/servers, not
//               /api/extensions/mcp-servers — Pitfall 3 endpoint).
//   Pitfall 4 — createServer never carries `enabled`; toggleServer is a
//               separate follow-up call gated by cfg.enabled === true.

import {AionUiMcpClient} from './aionui-client.js'
import {readSystemMcpCatalog} from './redis-catalog.js'
import {waitForAionUiReady, type ReadyPollOptions} from './ready-poll.js'
import {transformRedisToAionUi} from './transform.js'
import type {SeedLogger, SeedResult} from './types.js'

export const MCP_SEED_SENTINEL_KEY = 'livos:v43:mcp_seeded:v1'

/**
 * Minimal Redis surface needed by the orchestrator — three methods.
 * Matches the ioredis runtime API; test mocks pass a vi.fn() shim.
 */
export interface SeedRedisClient {
	hgetall(key: string): Promise<Record<string, string>>
	get(key: string): Promise<string | null>
	set(key: string, value: string): Promise<unknown>
}

export interface SeedDeps {
	redis: SeedRedisClient
	aionUiBaseUrl: string
	logger: SeedLogger
	/** Optional DI for tests — defaults to a real AionUiMcpClient. */
	client?: AionUiMcpClient
	/** Optional DI for tests — defaults to waitForAionUiReady. */
	waitForReady?: (
		baseUrl: string,
		logger: SeedLogger,
		opts?: ReadyPollOptions,
	) => Promise<boolean>
	readyOpts?: ReadyPollOptions
}

/**
 * Seed AionUi's MCP config with Liv's 5 system MCPs. NEVER throws — every
 * failure path is caught, logged via deps.logger, and reflected in the
 * returned SeedResult counters.
 */
export async function seedAionUiMcpConfig(deps: SeedDeps): Promise<SeedResult> {
	const result: SeedResult = {created: 0, skipped: 0, errored: 0, sentinelSet: false}
	const {redis, aionUiBaseUrl, logger} = deps
	const client = deps.client ?? new AionUiMcpClient(aionUiBaseUrl)
	const waitFn = deps.waitForReady ?? waitForAionUiReady

	try {
		// Stage 0 — sentinel short-circuit
		let sentinel: string | null = null
		try {
			sentinel = await redis.get(MCP_SEED_SENTINEL_KEY)
		} catch (err) {
			logger.warn('failed to read sentinel — proceeding as unset', err)
		}
		if (sentinel === '1') {
			logger.info('sentinel set — skip')
			return result
		}

		// Stage 1 — AionUi readiness probe (D-241-06)
		const ready = await waitFn(aionUiBaseUrl, logger, deps.readyOpts)
		if (!ready) {
			logger.warn(
				'AionUi not ready within timeout — leaving sentinel unset; will retry on next boot',
			)
			return result
		}

		// Stage 2 — read Liv catalog
		let targets
		try {
			targets = await readSystemMcpCatalog(redis, logger)
		} catch (err) {
			logger.warn('failed to read liv:mcp:config — aborting seed (sentinel unset)', err)
			result.errored++
			return result
		}
		if (targets.length === 0) {
			logger.warn('no system MCPs in liv:mcp:config — install seed missing? skipping')
			return result
		}

		// Stage 3 — GET AionUi existing (canonical /api/mcp/servers per Pitfall 3)
		let existingNames: Set<string>
		try {
			const existing = await client.listServers()
			existingNames = new Set(existing.map((s) => s.name))
		} catch (err) {
			logger.warn('failed to list AionUi servers — aborting seed (sentinel unset)', err)
			result.errored++
			return result
		}

		// Stage 4 — per-tool decide (Pitfall 1 strict GET-and-skip)
		for (const target of targets) {
			if (existingNames.has(target.name)) {
				logger.info(`${target.name} → already present in AionUi, skipping`)
				result.skipped++
				continue
			}
			try {
				const payload = transformRedisToAionUi(target.name, target.cfg)
				const created = await client.createServer(payload)
				logger.info(`${target.name} → injected into AionUi (id=${created.id})`)
				result.created++

				// Stage 4b — conditional enable-toggle (NON-fatal per RESEARCH.md A2)
				if (target.cfg.enabled === true) {
					try {
						await client.toggleServer(created.id, true)
						logger.info(`${target.name} → toggled enabled`)
					} catch (toggleErr) {
						logger.warn(
							`${target.name} toggle failed (server created but stays disabled — operator can manually flip)`,
							toggleErr,
						)
					}
				}
			} catch (err) {
				logger.warn(`${target.name} → POST failed`, err)
				result.errored++
			}
		}

		// Stage 5 — distribute to agent CLIs. ALWAYS send the FULL system-MCP
		// set (RESEARCH.md §Idempotency Strategy step 6) — robust against
		// partial state from previous failed boots.
		try {
			const allNames = targets.map((t) => t.name)
			const syncResult = await client.syncToAgents(allNames)
			const failedAgents = syncResult.results.filter((r) => !r.success)
			if (failedAgents.length > 0) {
				for (const f of failedAgents) {
					logger.warn(
						`sync-to-agents: agent '${f.agent}' failed${f.error ? ` (${f.error})` : ''}`,
					)
				}
				result.errored += failedAgents.length
			} else {
				logger.info(
					`sync-to-agents → distributed ${allNames.length} servers to all CLI agents`,
				)
			}
		} catch (err) {
			logger.warn(
				'sync-to-agents failed — agent CLIs may not see the new MCPs until next boot',
				err,
			)
			result.errored++
		}

		// Stage 6 — sentinel ONLY on full success (Pitfall 2)
		if (result.errored === 0) {
			try {
				await redis.set(MCP_SEED_SENTINEL_KEY, '1')
				result.sentinelSet = true
				logger.info(`sentinel ${MCP_SEED_SENTINEL_KEY} set`)
			} catch (err) {
				logger.warn('failed to set sentinel — will retry next boot', err)
			}
		} else {
			logger.warn(
				`leaving sentinel unset due to ${result.errored} error(s) — will retry on next boot`,
			)
		}
	} catch (err) {
		// Defense in depth — should never reach here, but if it does, livinityd
		// boot must continue.
		logger.error('seedAionUiMcpConfig caught unexpected error (non-fatal)', err)
	}

	return result
}
