// Phase 343-02 RESIL-02 — OOM self-heal.
//
// A free (no-LLM) per-minute scheduler job (`oom-watch`) inspects each installed
// GLOBAL app's main container. When it detects an out-of-memory kill it auto-restarts
// the app (default ON, per-app opt-out via the `oomSelfHeal` store key) and raises an
// external warning alert. A process-scoped rolling window caps auto-restarts at 3 per
// 60 minutes — on breach it STOPS restarting and raises a critical crash-loop alert so a
// genuinely broken app pages the operator instead of thrashing forever.
//
// Design notes:
//   - v1 detection is INSPECT-BASED (D-343-4): OOM fired ⇔ .State.OOMKilled === true OR
//     (.State.Status === 'exited' AND .State.ExitCode === 137). The inspectContainer()
//     wrapper (docker.ts) does NOT surface OOMKilled/ExitCode, so we raw-read via
//     dockerode exactly like ai-resource-watch.ts:getRawContainerStats (local socket only).
//   - cgroup-v2 RESIDUAL (D-343-4, documented + deferred): with deploy.resources.limits.memory
//     an in-cgroup OOM can kill a process INSIDE the container while PID 1 lives → Status
//     stays 'running', OOMKilled:false. Only `docker events --filter event=oom` sees that,
//     and NOTHING consumes docker events today → that case is a documented v1 residual, NOT
//     handled here. A `docker events` watcher is NEW infra deferred to a later phase.
//   - No stale-OOMKilled loop is possible: App.restart() (stop→start) destroys and recreates
//     the container (app-script: compose rm --force --stop then compose up --detach), producing
//     a FRESH State struct — so the next tick reads OOMKilled:false / a new ExitCode. No
//     StartedAt-comparison logic is needed; do NOT "fix" this with timestamp bookkeeping.
//   - v1 covers GLOBAL apps only (ctx.livinityd.apps.instances). Per-user-instance OOM +
//     per-user alert delivery are DEFERRED (D-343-7): the owner is resolvable via
//     user_app_instances but alerts are NOT per-user-routable (NotificationChannel has no
//     userId), so per-user coverage buys nothing without new routing infra.
//   - The restart window is process-scoped (Map keyed on app id). It resets on daemon
//     restart — benign (D-343-6): a fresh window means at most one extra recovery attempt
//     after a box update, and the Dispatcher's 6h per-id floor still throttles re-pages.

import Dockerode from 'dockerode'

import type {BuiltInJobHandler} from '../scheduler/types.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max auto-restarts per app inside WINDOW_MS before self-heal suspends (D-343-6). */
export const MAX_RESTARTS_PER_WINDOW = 3
/** Rolling anti-thrash window: 60 minutes. */
export const WINDOW_MS = 60 * 60 * 1000

// Docker's OOM-kill exit code (128 + SIGKILL(9)).
const OOM_EXIT_CODE = 137

// ---------------------------------------------------------------------------
// Pure decision logic (testable in isolation — see oom-decision.unit.test.ts)
// ---------------------------------------------------------------------------

/** The minimal container-State fields the OOM decision needs (raw-read, D-343-4). */
export interface OomInspectSnapshot {
	oomKilled: boolean
	status: string
	exitCode: number
}

export interface OomDecisionInput {
	inspect: OomInspectSnapshot
	appState: string
	/** undefined = default ON; false = explicit per-app opt-out (D-343-5). */
	oomSelfHeal: boolean | undefined
	debugMode: boolean
	/** epoch-ms timestamps of prior auto-restarts for this app (process-scoped window). */
	windowTimestamps: number[]
	now: number
}

export type OomVerdict = 'restart' | 'suspend-alert' | 'skip'

/**
 * Decide what to do about one app's container state. Pure — no I/O, no clock read
 * (the caller passes `now`). Decision order matters (D-343-4/5/6):
 *   1. debugMode → skip (debug apps are left alone, D-343-3)
 *   2. appState ∉ {ready, unhealthy} → skip (mirror health-monitor ownership, D-343-5:
 *      never touch stopped/debug/transient — stopped is operator intent)
 *   3. oomSelfHeal === false → skip (explicit opt-out; undefined = default ON)
 *   4. NOT an OOM signal → skip
 *   5. ≥ MAX_RESTARTS_PER_WINDOW in-window restarts → suspend-alert (breach)
 *   6. else → restart
 */
export function decideOomAction(input: OomDecisionInput): OomVerdict {
	if (input.debugMode) return 'skip'
	if (input.appState !== 'ready' && input.appState !== 'unhealthy') return 'skip'
	if (input.oomSelfHeal === false) return 'skip'

	const isOom =
		input.inspect.oomKilled === true ||
		(input.inspect.status === 'exited' && input.inspect.exitCode === OOM_EXIT_CODE)
	if (!isOom) return 'skip'

	const inWindow = input.windowTimestamps.filter((ts) => input.now - ts < WINDOW_MS).length
	if (inWindow >= MAX_RESTARTS_PER_WINDOW) return 'suspend-alert'
	return 'restart'
}

// ---------------------------------------------------------------------------
// Raw OOM inspect (Dockerode escape hatch — inspectContainer() in docker.ts does
// NOT surface .State.OOMKilled / .State.ExitCode; nothing else reads OOMKilled)
// ---------------------------------------------------------------------------

/**
 * Read the OOM-relevant container State fields via a raw dockerode inspect.
 * Local socket only (ai-resource-watch precedent). Exported so the handler test can
 * vi.spyOn/replace it — no real docker socket is touched on the offline dev host.
 */
export async function readOomInspect(name: string): Promise<OomInspectSnapshot> {
	const docker = new Dockerode()
	const info = await docker.getContainer(name).inspect()
	return {
		oomKilled: !!info.State?.OOMKilled,
		status: info.State?.Status ?? 'unknown',
		exitCode: info.State?.ExitCode ?? 0,
	}
}

// Module-scoped indirection so the handler test can replace the raw inspect without touching a
// real docker socket (offline dev host). ESM internal calls bind to the module-local reference, so
// a vi.mock/vi.spyOn on the export would NOT intercept the handler's call — routing through this
// mutable object (which the test overwrites `.read` on) is the reliable seam.
export const oomInspector: {read: (name: string) => Promise<OomInspectSnapshot>} = {
	read: readOomInspect,
}

// ---------------------------------------------------------------------------
// Process-scoped anti-thrash window (ai-resource-watch _throttledTimeCache precedent)
// ---------------------------------------------------------------------------

// Map<appId, epoch-ms timestamps of auto-restarts>. Resets on daemon restart (benign, D-343-6).
const _oomRestartWindow = new Map<string, number[]>()

/** Test-only helper to reset the window between handler invocations. */
export function _resetOomWindowForTests(): void {
	_oomRestartWindow.clear()
}

// ---------------------------------------------------------------------------
// Scheduler handler — never-throw contract (diskCriticalWatchHandler clone)
// ---------------------------------------------------------------------------

export const oomWatchHandler: BuiltInJobHandler = async (job, ctx) => {
	// Guard: no daemon ref (isolated unit test / Scheduler built without livinityd) →
	// skip cleanly, never throw.
	if (!ctx.livinityd) {
		ctx.logger.log(`[scheduler/oom-watch] no daemon reference — skipping job ${job.name}`)
		return {status: 'skipped', error: 'daemon reference unavailable'}
	}
	try {
		ctx.logger.log(`[scheduler/oom-watch] running job ${job.name}`)
		let checked = 0
		let restarted = 0
		let suspended = 0

		// GLOBAL apps only (D-343-7). Per-user instances are DEFERRED — owner resolvable but
		// not per-user-routable (NotificationChannel has no userId).
		for (const app of ctx.livinityd.apps.instances) {
			// Per-app isolation (T-343-07): one bad container must NEVER fail the whole tick.
			try {
				const containerName = await app.getMainContainerName()
				if (!containerName) continue
				checked++

				const inspect = await oomInspector.read(containerName)
				const oomSelfHeal = await app.store.get('oomSelfHeal')
				const debugMode = await app.store.get('debugMode')
				const window = _oomRestartWindow.get(app.id) ?? []

				const verdict = decideOomAction({
					inspect,
					appState: app.state,
					oomSelfHeal,
					debugMode: !!debugMode,
					windowTimestamps: window,
					now: Date.now(),
				})

				if (verdict === 'restart') {
					// Record this restart, pruning entries that have rolled off the 60-min window.
					// 343-review INFO-03: the timestamp is recorded BEFORE the restart attempt and is
					// DELIBERATELY kept even when the restart throws — a permanently-failing restart still
					// counts toward the 3/60min breach (no infinite retry), and the failure is surfaced
					// (below) rather than silently swallowed.
					const now = Date.now()
					_oomRestartWindow.set(app.id, [...window.filter((ts) => now - ts < WINDOW_MS), now])
					try {
						await app.restart()
						restarted++
						// Fire-and-forget: a dispatch failure must never fail the tick. The external
						// DESCRIPTIONS copy (notification-descriptions) names the app; the generic id is the
						// dispatch key, the human copy lives in the descriptions map (320 precedent).
						await ctx.livinityd.notifications
							.add(`app-oom-restarted:${app.id}`, {severity: 'warning', external: true})
							.catch(() => {})
					} catch (restartErr) {
						// 343-review INFO-03: a FAILED recovery restart must surface — otherwise the operator
						// only learns of the broken app at the 4th-tick crash-loop critical. Emit a warning so
						// the failed attempt is visible now; the window timestamp above stays counted (no
						// infinite retry). Fire-and-forget alert; never fail the tick.
						ctx.logger.error(
							`[scheduler/oom-watch] ${app.id}: restart failed: ${restartErr instanceof Error ? restartErr.message : String(restartErr)}`,
						)
						await ctx.livinityd.notifications
							.add(`app-oom-restart-failed:${app.id}`, {severity: 'warning', external: true})
							.catch(() => {})
					}
				} else if (verdict === 'suspend-alert') {
					// Breach: STOP restarting (do NOT touch the container) and page critical.
					suspended++
					await ctx.livinityd.notifications
						.add(`app-oom-loop:${app.id}`, {severity: 'critical', external: true})
						.catch(() => {})
				}
				// verdict === 'skip' → nothing.
			} catch (appErr) {
				ctx.logger.error(
					`[scheduler/oom-watch] ${app.id}: ${appErr instanceof Error ? appErr.message : String(appErr)}`,
				)
			}
		}

		return {status: 'success', output: {checked, restarted, suspended}}
	} catch (err) {
		// NOTE: 'failure', NOT 'error' — JobRunResult.status has no 'error' member.
		return {status: 'failure', error: err instanceof Error ? err.message : String(err)}
	}
}
