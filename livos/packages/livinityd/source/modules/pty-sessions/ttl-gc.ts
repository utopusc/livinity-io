/**
 * Phase 246-05 Task 1 — TTL Garbage Collector for idle PTY sessions.
 *
 * 246-03 deliberately broke the Phase 243 ws.close → kill semantic so PTYs
 * survive browser reload. The cost is unbounded growth of stale sessions
 * until something kills them. This module bounds that worst case:
 *
 *   - Every `sweepMs` ms (default 1h), scan the SessionManager's entries.
 *   - For each session whose `lastAttachAt` ISO timestamp is older than
 *     `idleMs` (default 24h), call `sessionManager.kill(id)`.
 *
 * Drift-locks:
 *   - TTL_GC_DEFAULT_IDLE_MS  = 24 * 60 * 60 * 1000  (24h)
 *   - TTL_GC_DEFAULT_SWEEP_MS = 60 * 60 * 1000        (1h)
 *
 * Both constants are exported so the threat-model misconfiguration test
 * (T-246-05-02) can drift-lock the values in vitest.
 *
 * All time + timer functions are dependency-injected — vitest never spins
 * a real wall-clock interval, and production wiring just passes `setInterval`
 * + `Date.now` via the defaults.
 *
 * D-V44-SACRED: this module does NOT touch sdk-agent-runner.ts.
 * Logger surface is logger.info({msg, ctx}) — same shape every other livinityd
 * module uses. Audit trail (T-246-05-03 mitigation) is journalctl-readable.
 */

import type {SessionManager} from './session-manager.js'

export const TTL_GC_DEFAULT_IDLE_MS = 24 * 60 * 60 * 1000 // 24h
export const TTL_GC_DEFAULT_SWEEP_MS = 60 * 60 * 1000 // 1h

export interface TtlGcDeps {
	sessionManager: SessionManager
	nowFn?: () => number
	idleMs?: number
	sweepMs?: number
	setIntervalFn?: typeof setInterval
	clearIntervalFn?: typeof clearInterval
	logger?: {info: (msg: string, ctx?: object) => void}
}

export interface IdleSweep {
	start(): void
	stop(): void
	/** One-shot synchronous sweep — returns the number of sessions killed. */
	sweepNow(): number
}

export function createTtlGc(deps: TtlGcDeps): IdleSweep {
	const now = deps.nowFn ?? Date.now
	const idleMs = deps.idleMs ?? TTL_GC_DEFAULT_IDLE_MS
	const sweepMs = deps.sweepMs ?? TTL_GC_DEFAULT_SWEEP_MS
	const setIv = deps.setIntervalFn ?? setInterval
	const clearIv = deps.clearIntervalFn ?? clearInterval
	const logger = deps.logger ?? {info: () => {}}
	let handle: ReturnType<typeof setInterval> | null = null

	function sweepNow(): number {
		const cutoff = now() - idleMs
		let killed = 0
		for (const [id, session] of deps.sessionManager.entries()) {
			const last = Date.parse(session.lastAttachAt) || 0
			if (last < cutoff) {
				deps.sessionManager.kill(id)
				killed++
				logger.info('ttl-gc: killed idle session', {
					id,
					idleAgeMs: now() - last,
				})
			}
		}
		return killed
	}

	function start(): void {
		if (handle !== null) clearIv(handle)
		handle = setIv(() => sweepNow(), sweepMs)
		logger.info('ttl-gc: started', {sweepMs, idleMs})
	}

	function stop(): void {
		if (handle !== null) {
			clearIv(handle)
			handle = null
		}
	}

	return {start, stop, sweepNow}
}
