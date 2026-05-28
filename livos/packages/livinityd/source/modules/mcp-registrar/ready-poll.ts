// Phase 241 — wait for AionUi to be reachable before seeding MCP config.
//
// Pattern: AbortController + while(Date.now()<deadline) — see
// .planning/phases/241-mcp-auto-add-liv-tools/241-RESEARCH.md §HTTP Polling Idiom.
//
// Decision lock D-241-06:
//   - Probe GET /api/settings/client every 2_000 ms
//   - Each probe attempt aborts at 1_500 ms (per-attempt cap)
//   - Total deadline 60_000 ms; on timeout return false (caller leaves sentinel unset)
//
// Pitfall 5 mitigation (opt-in via mcpServersProbe): /api/settings/client can
// return 200 while AionUi's MCP routes are still mounting. When opted in, after
// the settings probe passes we also GET /api/mcp/servers up to 3 times with 1s
// spacing before declaring readiness. If those sub-probes also fail, we fall
// back into the outer poll loop rather than crashing.

import type {SeedLogger} from './types.js'

export interface ReadyPollOptions {
	/** Total time budget for the entire poll loop. Default 60_000 ms (D-241-06). */
	totalTimeoutMs?: number
	/** Sleep between outer attempts. Default 2_000 ms (D-241-06). */
	pollIntervalMs?: number
	/** Per-attempt abort timeout. Default 1_500 ms (D-241-06). */
	perAttemptTimeoutMs?: number
	/** Pitfall 5 — also probe /api/mcp/servers once settings/client passes. */
	mcpServersProbe?: boolean
}

export async function waitForAionUiReady(
	baseUrl: string,
	logger: SeedLogger,
	opts: ReadyPollOptions = {},
): Promise<boolean> {
	const totalTimeoutMs = opts.totalTimeoutMs ?? 60_000
	const pollIntervalMs = opts.pollIntervalMs ?? 2_000
	const perAttemptTimeoutMs = opts.perAttemptTimeoutMs ?? 1_500
	const settingsUrl = `${baseUrl}/api/settings/client`
	const mcpUrl = `${baseUrl}/api/mcp/servers`
	const deadline = Date.now() + totalTimeoutMs
	let attempt = 0
	while (Date.now() < deadline) {
		attempt++
		const settingsOk = await probeOnce(settingsUrl, perAttemptTimeoutMs)
		if (settingsOk) {
			if (!opts.mcpServersProbe) {
				logger.info(`AionUi ready after ${attempt} attempt(s)`)
				return true
			}
			// Pitfall 5 — layered probe to defeat the "settings up but MCP
			// routes still mounting" race. Up to 3 sub-probes at 1s spacing.
			for (let sub = 0; sub < 3; sub++) {
				const mcpOk = await probeOnce(mcpUrl, perAttemptTimeoutMs)
				if (mcpOk) {
					logger.info(`AionUi ready after ${attempt} attempt(s) (mcp routes confirmed)`)
					return true
				}
				await sleep(1_000)
			}
			// mcp routes still not ready — fall through to outer poll wait.
		}
		// Only warn on the very last outer attempt — keeps the journal quiet
		// during a normal boot where AionUi takes 6-8 seconds.
		if (Date.now() + pollIntervalMs >= deadline) {
			logger.warn(`AionUi readiness probe failed (final attempt ${attempt})`)
		}
		await sleep(pollIntervalMs)
	}
	return false
}

/** Single probe attempt — returns true iff fetch settled with res.ok. */
async function probeOnce(url: string, timeoutMs: number): Promise<boolean> {
	const ctrl = new AbortController()
	const t = setTimeout(() => ctrl.abort(), timeoutMs)
	try {
		const res = await fetch(url, {signal: ctrl.signal})
		return res.ok
	} catch {
		return false
	} finally {
		clearTimeout(t)
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}
