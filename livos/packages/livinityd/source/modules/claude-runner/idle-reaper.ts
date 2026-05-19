// Phase 165-01 — Idle CC Session Reaper.
//
// Polls every 5 min: for each session reported by the injected
// SessionActivityProvider, if lastMessageAt + idleThresholdMs < now()
// → call provider.abort(sessionKey). Uses session.abortController.abort()
// ON THE OTHER SIDE of the interface boundary (ws-agent.ts owns the
// AbortController reference). agent-session.ts is UNCHANGED — see Phase
// 165 quality gate.
//
// Sacred SHA f3538e1d... + D-09 + Phase 161-02 helper + Phase 162-01
// vault-scaffolder + Phase 164-02 autonomous-scheduler all UNCHANGED.
//
// Architectural boundary: this module is FORBIDDEN from importing
// `@liv/core` or any path containing `agent-session`. The Phase 165-01
// quality gate enforces this with a source-text grep in
// idle-reaper.test.ts Test 10.

import type {Redis} from 'ioredis'

const REDIS_KEY_IDLE_REAP_MIN = 'liv:config:idle_reap_min'
const DEFAULT_IDLE_REAP_MIN = 30
const POLL_INTERVAL_MS = 5 * 60_000

/**
 * One row in the reaper's view of active CC sessions. Populated by the
 * SessionActivityProvider implementation (ws-agent.ts owns the underlying
 * Map; agent-session.ts is UNCHANGED).
 */
export interface SessionSnapshot {
	sessionKey: string
	/** Epoch milliseconds of the last user WS-message received for this key. */
	lastMessageAt: number
}

/**
 * Thin interface the reaper uses to read session activity and trigger
 * aborts. Implementation lives in ws-agent.ts (createSessionActivityProvider)
 * so the reaper module never imports liv-core internals.
 */
export interface SessionActivityProvider {
	listSessions(): SessionSnapshot[]
	abort(sessionKey: string): void
}

export interface IdleReaperLogger {
	log: (msg: string) => void
	warn?: (msg: string) => void
	error: (msg: string, err?: unknown) => void
}

export interface IdleSessionReaperOptions {
	redis: Redis
	provider: SessionActivityProvider
	logger: IdleReaperLogger
	/** Tests-only: override Date.now */
	nowMs?: () => number
	/** Tests-only: override the 5-min poll interval */
	pollIntervalMs?: number
}

/**
 * Idle CC Session Reaper.
 *
 * Usage (livinityd boot):
 *   const reaper = new IdleSessionReaper({
 *     redis: this.ai.redis,
 *     provider: createSessionActivityProvider(),
 *     logger: {log, error},
 *   })
 *   reaper.start()
 *   // ... later, at shutdown ...
 *   reaper.stop()
 *
 * Test:
 *   await reaper.tick()  // single-pass synchronous-ish drive
 */
export class IdleSessionReaper {
	private redis: Redis
	private provider: SessionActivityProvider
	private logger: IdleReaperLogger
	private nowMs: () => number
	private pollIntervalMs: number
	private handle: ReturnType<typeof setInterval> | null = null

	constructor(opts: IdleSessionReaperOptions) {
		this.redis = opts.redis
		this.provider = opts.provider
		this.logger = opts.logger
		this.nowMs = opts.nowMs ?? (() => Date.now())
		this.pollIntervalMs = opts.pollIntervalMs ?? POLL_INTERVAL_MS
	}

	/**
	 * Arm the poll loop. Idempotent — repeated calls re-use the existing
	 * setInterval handle (no double-armed timers).
	 */
	start(): void {
		if (this.handle) return // idempotent
		this.handle = setInterval(() => {
			this.tick().catch((err) =>
				this.logger.error('[claude-runner/reaper] tick threw', err),
			)
		}, this.pollIntervalMs)
		// Detach so the interval doesn't pin the event loop on shutdown.
		// In some test runtimes the setInterval handle is a plain number — guard.
		const h = this.handle as unknown as {unref?: () => void}
		if (typeof h?.unref === 'function') {
			h.unref()
		}
		this.logger.log(
			`[claude-runner/reaper] started — poll every ${Math.round(this.pollIntervalMs / 1000)}s`,
		)
	}

	/**
	 * Disarm the poll loop. Idempotent — no-op when not started.
	 */
	stop(): void {
		if (!this.handle) return
		clearInterval(this.handle)
		this.handle = null
		this.logger.log('[claude-runner/reaper] stopped')
	}

	/**
	 * Single reap pass. Public for testability (and for the autonomous
	 * scheduler / debug surfaces that may want to drive a manual sweep).
	 *
	 * Contract: NEVER throws. provider.abort() throws are swallowed and
	 * logged; redis throws fall back to the default threshold.
	 */
	async tick(): Promise<void> {
		const thresholdMin = await this.resolveThresholdMin()
		const thresholdMs = thresholdMin * 60_000
		const now = this.nowMs()
		const sessions = this.provider.listSessions()
		for (const s of sessions) {
			const idleMs = now - s.lastMessageAt
			if (idleMs >= thresholdMs) {
				try {
					this.provider.abort(s.sessionKey)
					this.logger.log(
						`[claude-runner/reaper] aborted idle session sessionKey=${s.sessionKey} idle_for_min=${Math.round(idleMs / 60_000)}`,
					)
				} catch (err) {
					this.logger.error(
						`[claude-runner/reaper] abort threw for sessionKey=${s.sessionKey}`,
						err,
					)
				}
			}
		}
	}

	/**
	 * Read `liv:config:idle_reap_min` from Redis. Falls back to the default
	 * (30) for: missing key, non-numeric value, non-positive value, or any
	 * Redis throw. Returns minutes (not ms).
	 */
	private async resolveThresholdMin(): Promise<number> {
		try {
			const raw = await this.redis.get(REDIS_KEY_IDLE_REAP_MIN)
			if (!raw) return DEFAULT_IDLE_REAP_MIN
			const n = Number.parseFloat(raw)
			if (!Number.isFinite(n) || n <= 0) return DEFAULT_IDLE_REAP_MIN
			return n
		} catch {
			return DEFAULT_IDLE_REAP_MIN
		}
	}
}
