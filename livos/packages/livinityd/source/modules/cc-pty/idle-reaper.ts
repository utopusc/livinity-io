// Phase 166-05 — CC PTY Idle Reaper.
//
// Mirrors the structural pattern of livos/packages/livinityd/source/modules/
// claude-runner/idle-reaper.ts (Phase 165-01) but for tmux/PTY-backed CC
// sessions (NOT native CC SDK sessions). The 165-01 reaper is UNCHANGED —
// this is a SEPARATE file with a SEPARATE concern. Two reapers coexist.
//
// Polls every 5 min: calls manager.runIdleReaper(); sessions where
// max(lastAttachedAt, lastMessageAt, createdAt) < (now - idleHours*3600*1000)
// are killed.
//
// Sacred SHA f3538e1d... + D-09 + Phase 161-02 helper + Phase 162-01
// vault-scaffolder + Phase 162-02 agent-session.ts + Phase 163 ws-agent.ts
// + Phase 164 + Phase 165-01 all UNCHANGED.

import type {CcPtyManager} from './manager.js'

export interface CcPtyIdleReaperLogger {
	log: (msg: string) => void
	warn?: (msg: string) => void
	error: (msg: string, err?: unknown) => void
}

export interface CcPtyIdleReaperOptions {
	manager: CcPtyManager
	logger: CcPtyIdleReaperLogger
	/** Test-only: override poll interval (defaults to 5 min) */
	pollIntervalMs?: number
}

const DEFAULT_POLL_INTERVAL_MS = 5 * 60_000

export class CcPtyIdleReaper {
	private manager: CcPtyManager
	private logger: CcPtyIdleReaperLogger
	private pollIntervalMs: number
	private timer: ReturnType<typeof setInterval> | null = null
	private started = false

	constructor(opts: CcPtyIdleReaperOptions) {
		this.manager = opts.manager
		this.logger = opts.logger
		this.pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
	}

	async start(): Promise<void> {
		if (this.started) return
		this.started = true
		// One-shot boot run — kills any 24h+ corpses from before livinityd restart
		try {
			const {reaped} = await this.manager.runIdleReaper()
			this.logger.log(`[cc-pty/reaper] boot one-shot reaped=${reaped}`)
		} catch (err) {
			this.logger.error('[cc-pty/reaper] boot one-shot failed (non-fatal)', err)
		}
		this.timer = setInterval(() => {
			this.tick().catch(() => {})
		}, this.pollIntervalMs)
		// Detach so the interval doesn't pin the event loop on shutdown.
		const h = this.timer as unknown as {unref?: () => void}
		if (typeof h?.unref === 'function') h.unref()
		this.logger.log(
			`[cc-pty/reaper] started — poll every ${Math.round(this.pollIntervalMs / 1000)}s`,
		)
	}

	async tick(): Promise<{reaped: number}> {
		try {
			const r = await this.manager.runIdleReaper()
			if (r.reaped > 0) this.logger.log(`[cc-pty/reaper] tick reaped=${r.reaped}`)
			return r
		} catch (err) {
			this.logger.error('[cc-pty/reaper] tick failed (non-fatal)', err)
			return {reaped: 0}
		}
	}

	stop(): void {
		if (this.timer) {
			clearInterval(this.timer)
			this.timer = null
		}
		this.started = false
		this.logger.log('[cc-pty/reaper] stopped')
	}
}
