// Phase 267-03 Task 1 — `scheduleAgentRefresh`: debounced, best-effort
// `liv-assistant` restart so AionUi re-PATH-scans and a freshly-authed CLI
// flips Failed→ready WITHOUT the user touching a terminal.
//
// WHY a restart at all (RESEARCH Task 2): the vendored AionUi (v2.1.14) detects
// backend CLIs by scanning $PATH at STARTUP. It has NO runtime refresh — an
// agent stays "Failed" until AionUi re-scans. So on auth/setApiKey success we
// restart `liv-assistant` (which hosts AionUi on :3020), forcing a fresh scan.
//
// DEBOUNCE: installing/authing several CLIs back-to-back must coalesce into ONE
// restart, not one-per-CLI (each restart is ~3s of AionUi downtime). Repeated
// calls within `debounceMs` reset a single trailing-edge timer.
//
// BEST-EFFORT (load-bearing contract): the restart is fired AFTER the auth /
// setApiKey already succeeded and was recorded. A FAILED restart must NEVER
// throw, never reject, never roll back the completed auth. Every failure path
// here is wrapped + logged + swallowed. `scheduleAgentRefresh` returns void
// synchronously (it only arms the timer); the async restart runs later and can
// never surface an error to the caller.
//
// PRIVILEGE: uses the already-provisioned NOPASSWD sudoers entry for
// `systemctl restart liv-assistant` (mirrors update.sh's `sudo systemctl
// restart liv-assistant`). NO new sudo grant is introduced. We spawn argv-array
// `sudo -n systemctl restart liv-assistant` (no shell, no interpolation; `-n`
// = non-interactive so a missing NOPASSWD fails fast instead of hanging on a
// password prompt).
//
// STATUS KEY: `liv:cli:agent-refresh` is SET to 'restarting' when the timer
// fires and 'done' once the restart settles (TTL 120s) so the UI can show
// "Applying…". Like the restart itself, the Redis writes are best-effort.

import {spawn as nodeSpawn} from 'node:child_process'

import type {Redis} from 'ioredis'

import type {InstallerLogger} from './types.js'

/** Default debounce window — a burst of installs within 4s = ONE restart. */
export const DEFAULT_AGENT_REFRESH_DEBOUNCE_MS = 4000

/** Redis key the UI polls to show "Applying…" while the restart is in flight. */
export const agentRefreshStatusKey = 'liv:cli:agent-refresh'

/** TTL for the status key — long enough to cover a slow AionUi cold-boot. */
const AGENT_REFRESH_STATUS_TTL_SECONDS = 120

/** AionUi WebUI base — probed post-restart to log how many agents are present. */
const AIONUI_BASE = 'http://127.0.0.1:3020'

/** Max wall-clock to wait for AionUi to come back + expose /api/agents. */
const POLL_TOTAL_MS = 10_000
/** Interval between /api/agents probes. */
const POLL_INTERVAL_MS = 1000

/**
 * The minimal restart executor. Returns a promise that RESOLVES on a clean exit
 * (code 0) and REJECTS on any non-zero exit / spawn error — but the only caller
 * (`runRefresh`) always wraps this in try/catch, so a rejection never escapes.
 *
 * Mirrors auth.ts's argv-array spawn (no shell, no string interpolation).
 */
export type AgentRefreshExecFn = () => Promise<void>

/**
 * Default exec: `sudo -n systemctl restart liv-assistant`, argv-array form.
 * `-n` keeps it non-interactive (never blocks on a password prompt — if the
 * NOPASSWD entry is missing it fails fast and we swallow + log it).
 */
function defaultExec(logger: InstallerLogger): AgentRefreshExecFn {
	return () =>
		new Promise<void>((resolve, reject) => {
			let settled = false
			let child
			try {
				child = nodeSpawn(
					'sudo',
					['-n', 'systemctl', 'restart', 'liv-assistant'],
					{stdio: 'ignore'},
				)
			} catch (err) {
				reject(err instanceof Error ? err : new Error(String(err)))
				return
			}
			child.on('error', (err: Error) => {
				if (settled) return
				settled = true
				reject(err)
			})
			child.on('exit', (code: number | null) => {
				if (settled) return
				settled = true
				if (code === 0) {
					resolve()
				} else {
					reject(
						new Error(
							`sudo -n systemctl restart liv-assistant exited ${String(code)}`,
						),
					)
				}
			})
			void logger // keep the seam symmetric; logging happens in runRefresh
		})
}

/** DI surface — tests inject a fake execFn / redis / fetch; prod uses real. */
export interface ScheduleAgentRefreshDeps {
	logger: InstallerLogger
	/**
	 * Optional restart executor (vitest injects a fake to assert it is called
	 * exactly ONCE per burst). When absent, the real `sudo -n systemctl restart
	 * liv-assistant` argv-spawn is used.
	 */
	execFn?: AgentRefreshExecFn
	/**
	 * Optional debounce window override (default 4000ms). Tests pass a small
	 * value (or rely on fake timers) to assert coalescing.
	 */
	debounceMs?: number
	/**
	 * Optional ioredis client for the `liv:cli:agent-refresh` status key. When
	 * absent, the status writes are skipped (the restart still happens).
	 */
	redis?: Pick<Redis, 'set'>
	/**
	 * Optional fetch override for the post-restart /api/agents probe (tests
	 * inject a fake; prod uses global fetch). When absent and global fetch is
	 * unavailable, the probe is skipped — the restart still happened.
	 */
	fetchFn?: typeof fetch
	/** Optional sleep override so tests don't actually wait 10s for the probe. */
	sleepFn?: (ms: number) => Promise<void>
}

// ── Module-level debounce state ─────────────────────────────────────────────
// One trailing-edge timer shared across all callers in this process. A burst of
// scheduleAgentRefresh calls within debounceMs resets `timer` so only the LAST
// call's trailing edge fires the single restart.
let timer: ReturnType<typeof setTimeout> | null = null
let pendingDeps: ScheduleAgentRefreshDeps | null = null

function realSleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms))
}

/**
 * Best-effort: SET the status key, swallow + log any failure.
 */
async function setStatus(
	deps: ScheduleAgentRefreshDeps,
	value: 'restarting' | 'done',
): Promise<void> {
	if (!deps.redis) return
	try {
		await deps.redis.set(
			agentRefreshStatusKey,
			value,
			'EX',
			AGENT_REFRESH_STATUS_TTL_SECONDS,
		)
	} catch (err) {
		deps.logger.warn(
			`[agent-refresh] redis SET ${agentRefreshStatusKey}=${value} failed (non-fatal)`,
			err,
		)
	}
}

/**
 * Best-effort: after the restart, poll AionUi's /api/agents (up to ~10s) and log
 * how many agents are present once it answers. Pure observability — any failure
 * (AionUi still booting, fetch unavailable) is swallowed.
 */
async function probeAgents(deps: ScheduleAgentRefreshDeps): Promise<void> {
	const fetchFn = deps.fetchFn ?? (globalThis.fetch as typeof fetch | undefined)
	if (!fetchFn) {
		deps.logger.info(
			'[agent-refresh] no fetch available — skipping /api/agents probe (restart still issued)',
		)
		return
	}
	const sleep = deps.sleepFn ?? realSleep
	const deadline = Date.now() + POLL_TOTAL_MS
	while (Date.now() < deadline) {
		try {
			const res = await fetchFn(`${AIONUI_BASE}/api/agents`)
			if (res.ok) {
				let count = -1
				try {
					const body = (await res.json()) as unknown
					if (Array.isArray(body)) count = body.length
					else if (
						body &&
						typeof body === 'object' &&
						Array.isArray((body as {agents?: unknown[]}).agents)
					) {
						count = (body as {agents: unknown[]}).agents.length
					}
				} catch {
					/* non-JSON body — still proves AionUi re-scanned */
				}
				deps.logger.info(
					`[agent-refresh] AionUi back up — /api/agents reported ${
						count >= 0 ? `${count} agent(s)` : 'reachable'
					}`,
				)
				return
			}
		} catch {
			/* AionUi still restarting — keep polling until the deadline */
		}
		await sleep(POLL_INTERVAL_MS)
	}
	deps.logger.info(
		'[agent-refresh] /api/agents not reachable within poll window (AionUi may still be cold-booting; restart was issued)',
	)
}

/**
 * The trailing-edge action: SET 'restarting', run the restart (best-effort),
 * SET 'done', then probe /api/agents (best-effort). NEVER throws.
 */
async function runRefresh(deps: ScheduleAgentRefreshDeps): Promise<void> {
	const exec = deps.execFn ?? defaultExec(deps.logger)
	await setStatus(deps, 'restarting')
	deps.logger.info(
		'[agent-refresh] restarting liv-assistant so AionUi re-scans backend CLIs (debounced trailing edge)',
	)
	try {
		await exec()
		deps.logger.info('[agent-refresh] liv-assistant restart issued OK')
	} catch (err) {
		// BEST-EFFORT: a failed restart must NEVER invalidate the completed auth.
		deps.logger.warn(
			'[agent-refresh] liv-assistant restart failed (non-fatal — the auth already succeeded; the agent will pick up the new CLI on the next AionUi restart)',
			err,
		)
	}
	await setStatus(deps, 'done')
	// Observability only — never blocks, never throws.
	try {
		await probeAgents(deps)
	} catch (err) {
		deps.logger.warn('[agent-refresh] /api/agents probe threw (non-fatal)', err)
	}
}

/**
 * Schedule a debounced `liv-assistant` restart. Returns synchronously after
 * arming the timer — the restart runs on the trailing edge, `debounceMs` after
 * the LAST call in a burst. Coalescing: N rapid calls → exactly ONE restart.
 *
 * Best-effort end to end: the trailing-edge action wraps the restart + Redis +
 * probe so a failure of any of them is logged and swallowed. The caller (the
 * router, on auth/setApiKey SUCCESS) is never affected.
 */
export function scheduleAgentRefresh(deps: ScheduleAgentRefreshDeps): void {
	// Last-writer-wins on the deps so the burst's final call's deps (logger,
	// execFn, redis) are the ones used when the timer fires.
	pendingDeps = deps
	const debounceMs = deps.debounceMs ?? DEFAULT_AGENT_REFRESH_DEBOUNCE_MS
	if (timer) clearTimeout(timer)
	timer = setTimeout(() => {
		timer = null
		const d = pendingDeps
		pendingDeps = null
		if (!d) return
		// Fire-and-forget; runRefresh never throws/rejects.
		void runRefresh(d).catch((err) => {
			// Defensive: runRefresh is designed never to reject, but guard anyway
			// so an unexpected throw can't become an unhandled rejection.
			try {
				d.logger.warn(
					'[agent-refresh] runRefresh rejected unexpectedly (swallowed)',
					err,
				)
			} catch {
				/* logger itself threw — nothing more we can safely do */
			}
		})
	}, debounceMs)
	// Don't let the debounce timer keep the event loop alive (e.g. during tests
	// or graceful shutdown). unref is a no-op where unavailable.
	;(timer as {unref?: () => void}).unref?.()
}

/**
 * Test-only: cancel any pending debounce timer so suites don't leak a trailing
 * restart into the next test. Safe to call when nothing is scheduled.
 */
export function _resetAgentRefreshForTests(): void {
	if (timer) clearTimeout(timer)
	timer = null
	pendingDeps = null
}
