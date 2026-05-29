/**
 * Phase 248-03 Task 2 — TTL Garbage Collector for idle nested displays.
 *
 * Mirrors the Phase 246-05 pty-sessions/ttl-gc.ts pattern line-for-line:
 *
 *   - Every `sweepMs` ms (default 1h), scan `displayManager.list()`.
 *   - For each display whose `last_app_at` (or `created_at` if no app has
 *     ever been attached) is older than `idleMs` (default 4h), call
 *     `displayManager.kill({display, callerSession: <owner_session>})`.
 *
 * The owner-impersonation is intentional: the user-facing owner-scope check
 * on `kill` (D-V44-DISPLAY-OWNER-SCOPED) would refuse a GC running as 'admin'
 * or 'system', so the sweep reads `owner_session` off the record and passes
 * it back into `kill` to bypass the scope check in a well-scoped, in-process
 * code path that the test suite drift-locks. Future v45+ refinement: replace
 * with an explicit `killAsSystem()` admin method on `DisplayManager` so the
 * bypass is type-visible instead of impersonation-via-payload.
 *
 * Drift-locks (per 248-03-PLAN.md must_haves.truths):
 *   - DISPLAY_TTL_GC_DEFAULT_IDLE_MS  = 4 * 60 * 60 * 1000  (4h)
 *   - DISPLAY_TTL_GC_DEFAULT_SWEEP_MS = 60 * 60 * 1000      (1h)
 *
 * Both constants are exported so the drift-lock vitest cases (Cases 1+2 in
 * `__tests__/display-ttl-gc.test.ts`) can pin the exact literals.
 *
 * All time + timer functions are dependency-injected — vitest never spins a
 * real wall-clock interval, and production wiring just passes `setInterval` +
 * `Date.now` via the defaults.
 *
 * D-V44-SACRED: this module does NOT touch sdk-agent-runner.ts.
 */

import type {DisplayManager} from './types.js'

export const DISPLAY_TTL_GC_DEFAULT_IDLE_MS = 4 * 60 * 60 * 1000 // 4h
export const DISPLAY_TTL_GC_DEFAULT_SWEEP_MS = 60 * 60 * 1000 // 1h

export interface DisplayTtlGcDeps {
	displayManager: DisplayManager
	nowFn?: () => number
	idleMs?: number
	sweepMs?: number
	setIntervalFn?: typeof setInterval
	clearIntervalFn?: typeof clearInterval
	logger?: {info: (msg: string, ctx?: object) => void}
}

export interface IdleDisplaySweep {
	start(): void
	stop(): void
	/**
	 * One-shot sweep — returns the number of displays SUCCESSFULLY killed.
	 * Stale displays whose `kill` returns `{ok:false}` (most commonly because
	 * the display vanished between `list()` and `kill()`) do NOT count.
	 */
	sweepNow(): Promise<number>
}

export function createDisplayTtlGc(deps: DisplayTtlGcDeps): IdleDisplaySweep {
	const now = deps.nowFn ?? Date.now
	const idleMs = deps.idleMs ?? DISPLAY_TTL_GC_DEFAULT_IDLE_MS
	const sweepMs = deps.sweepMs ?? DISPLAY_TTL_GC_DEFAULT_SWEEP_MS
	const setIv = deps.setIntervalFn ?? setInterval
	const clearIv = deps.clearIntervalFn ?? clearInterval
	const logger = deps.logger ?? {info: () => {}}
	let handle: ReturnType<typeof setInterval> | null = null

	async function sweepNow(): Promise<number> {
		const cutoff = now() - idleMs
		const records = await deps.displayManager.list()
		let killed = 0
		for (const r of records) {
			// last_app_at (set by attachApp) is the canonical staleness signal.
			// When absent (no app ever attached), fall back to created_at so an
			// empty display also has a bounded lifetime.
			const lastIso = r.last_app_at ?? r.created_at
			const lastMs = Date.parse(lastIso) || 0
			if (lastMs >= cutoff) continue

			try {
				const result = await deps.displayManager.kill({
					display: r.display,
					// Owner-impersonation — see module doc-comment for rationale.
					callerSession: r.owner_session,
				})
				if (result.ok) {
					killed++
					logger.info('display-ttl-gc: killed idle display', {
						display: r.display,
						idleAgeMs: now() - lastMs,
						owner_session: r.owner_session,
					})
				}
				// ok:false (most commonly 'not-found' when the display vanished
				// between list and kill) is silently ignored — best-effort.
			} catch {
				// Network/Redis failure mid-kill is also best-effort — the next
				// sweep will see the same stale display and retry.
			}
		}
		return killed
	}

	function start(): void {
		// Idempotent: a second start() must clear the prior interval handle so
		// callers can blindly re-arm without leaking a wall-clock interval.
		if (handle !== null) clearIv(handle)
		handle = setIv(() => {
			sweepNow().catch(() => {
				// Defensive — sweepNow already swallows per-display errors, but
				// an unhandled promise rejection inside the interval would crash
				// the process in node 16+ strict mode. Best-effort wrap.
			})
		}, sweepMs)
		logger.info('display-ttl-gc: started', {sweepMs, idleMs})
	}

	function stop(): void {
		// Null-safe — calling stop() before start() or twice is a no-op.
		if (handle !== null) {
			clearIv(handle)
			handle = null
		}
	}

	return {start, stop, sweepNow}
}
