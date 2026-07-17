// livos/packages/livinityd/source/modules/connectivity/scheduler-job.ts
//
// Phase 333 (DIAG-01/02) — the scheduled connectivity self-check handler, wired
// into the scheduler via the standard 3-site JobType extension (types.ts union +
// BUILT_IN_HANDLERS + DEFAULT_JOB_DEFINITIONS). Mirrors securityAdvisorScanHandler's
// never-throw contract EXACTLY: guard !ctx.livinityd → 'skipped'; body try/catch →
// 'failure' (NOT 'error').
//
// Flow: read the prior per-check baseline + ignore-list from the `connectivity`
// store key → build the ProbeContext from the box's live domain/tunnel state →
// run the read-only probes → score → persist the new baseline → fire ONE coalesced
// `connectivity:regression` alert on any pass/warn→fail regression (ignore-aware,
// severity by category) and clear it once nothing is failing (D-333-4).

import type Livinityd from '../../index.js'
import type {BuiltInJobHandler, SchedulerLogger} from '../scheduler/types.js'
import {
	detectRegressions,
	foldPersisted,
	regressionSeverity,
	scoreChecks,
	EMPTY_CONNECTIVITY_STATE,
	type ConnectivityState,
} from './checks.js'
import {runConnectivityChecks, DEFAULT_PROBE_DEPS, type ProbeContext, type ProbeDeps} from './probes.js'

// The single coalesced alert id — the Dispatcher's 60s burst + 6h resend-floor
// (severity-escalation-aware) handle re-page cadence, so one id is correct.
export const CONNECTIVITY_ALERT_ID = 'connectivity:regression'

/** Build the ProbeContext from the box's live state (main domain + tunnel mode + mail opt-in). */
export async function buildProbeContext(livinityd: Livinityd, state: ConnectivityState): Promise<ProbeContext> {
	const mainDomain = await livinityd.server.getActiveMainDomain().catch(() => null)
	let tunnelMode = false
	try {
		const localMode = await livinityd.ai.redis.get('livos:domain:local_mode')
		tunnelMode = localMode === 'portal' || localMode === 'hybrid' || localMode === 'tunnel'
	} catch {
		tunnelMode = false
	}
	return {mainDomain, tunnelMode, mailEnabled: !!state.mailEnabled}
}

/**
 * Run one full connectivity self-check pass against the given daemon. Returns the
 * scored results + the regression set so the route (runCheckNow) and the scheduled
 * handler share ONE implementation. Persists the new baseline and fires/clears the
 * coalesced alert. Never throws.
 */
export async function runConnectivitySelfCheck(
	livinityd: Livinityd,
	logger: SchedulerLogger,
	probeDeps: ProbeDeps = DEFAULT_PROBE_DEPS,
): Promise<{results: ReturnType<typeof scoreChecks>; count: number}> {
	const state = (await livinityd.store.get('connectivity')) ?? EMPTY_CONNECTIVITY_STATE
	const prev = state.checks ?? {}
	const ignore = state.ignore ?? []

	const ctx = await buildProbeContext(livinityd, state)
	const results = await runConnectivityChecks(ctx, probeDeps)
	const score = scoreChecks(results)

	// 333-REVIEW F1: persist the baseline INSIDE the write lock, re-reading the
	// current state so a concurrent setIgnore/setMailEnabled that landed during the
	// (multi-second) probe I/O is NOT clobbered by our pre-run snapshot. We only own
	// `checks` + `lastRun`; ignore/mailEnabled belong to the routes.
	const at = probeDeps.now()
	await livinityd.store
		.getWriteLock(async ({get, set}) => {
			const current = (await get('connectivity')) ?? EMPTY_CONNECTIVITY_STATE
			// Merge over prior so a check that didn't run this tick keeps its last status.
			const nextChecks = {...(current.checks ?? {}), ...foldPersisted(results)}
			await set('connectivity', {...current, checks: nextChecks, lastRun: at})
		})
		.catch((e) => logger.error('[scheduler/connectivity] failed to persist state', e))

	// Regression / recovery alerting (ignore-aware, coalesced).
	const regressed = detectRegressions(prev, results, ignore)
	const anyLiveFail = results.some((r) => r.status === 'fail' && !ignore.includes(r.id))
	if (regressed.length > 0) {
		const severity = regressionSeverity(regressed)
		await livinityd.notifications.add(CONNECTIVITY_ALERT_ID, {severity, external: true}).catch(() => {})
		logger.log(
			`[scheduler/connectivity] ${regressed.length} check(s) regressed to fail (${regressed.map((r) => r.id).join(', ')}) — alerted ${severity}`,
		)
	} else if (!anyLiveFail) {
		// 333-REVIEW F2: clear whenever NOTHING is failing this run — not only on an
		// explicit prior-fail→pass transition. This also clears a stale alert when a
		// previously-failing check simply STOPPED being emitted (domain removed / left
		// tunnel mode), which the recovery-transition-only clear would leave stuck.
		// notifications.clear is a no-op when the id isn't set, so this is safe every run.
		await livinityd.notifications.clear(CONNECTIVITY_ALERT_ID).catch(() => {})
	}

	return {results: score, count: results.length}
}

// Never-throw scheduler handler — mirrors securityAdvisorScanHandler.
export const connectivitySelfCheckHandler: BuiltInJobHandler = async (job, ctx) => {
	if (!ctx.livinityd) {
		ctx.logger.log(`[scheduler/connectivity-self-check] no daemon reference — skipping job ${job.name}`)
		return {status: 'skipped', error: 'daemon reference unavailable'}
	}
	try {
		const out = await runConnectivitySelfCheck(ctx.livinityd, ctx.logger)
		return {status: 'success', output: out}
	} catch (err) {
		return {status: 'failure', error: err instanceof Error ? err.message : String(err)}
	}
}
