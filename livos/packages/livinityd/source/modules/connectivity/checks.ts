// livos/packages/livinityd/source/modules/connectivity/checks.ts
//
// Phase 333 (DIAG-01/02) — the PURE connectivity self-diagnosis engine: result
// types, scoring, and pass/warn→fail regression detection. Zero I/O — the live
// probes (probes.ts) feed CheckResult[] in; this module scores them and decides
// what regressed. Kept pure so the scoring + regression logic is unit-tested with
// canned data (no real DNS/TLS/network in tests).
//
// Distinct from `modules/diagnostics/` (AI capability/model/app-health) and the
// SEC-02 security-advisor — this is the D-333-1 `connectivity` namespace.

export type CheckStatus = 'pass' | 'warn' | 'fail'

// The five v1 categories (D-333-3). `mail` is optional/default-off.
export type CheckCategory = 'dns' | 'ports' | 'cert' | 'tunnel' | 'mail'

export interface CheckResult {
	/** Stable id, e.g. `dns:main` / `cert:main` / `ports:443` — the alert + ignore key. */
	id: string
	category: CheckCategory
	status: CheckStatus
	/** Human-readable one-liner (already localized-agnostic — the UI shows a t()-keyed title + this raw detail). */
	detail: string
	/** i18n key suffix for the remediation tip (UI resolves `connectivity.remedy.<remediationKey>`). */
	remediationKey?: string
	/** epoch ms when this check ran. */
	at: number
}

// Persisted per-check state (the `connectivity` StoreSchema key, D-333-1). Stored
// as a `type` (implicit index signature → assignable to FileStore Serializable).
export type PersistedCheck = {
	status: CheckStatus
	at: number
	detail?: string
}

export type ConnectivityState = {
	/** epoch ms of the last completed run. */
	lastRun?: number
	/** last-known status per check id (the regression baseline). */
	checks: Record<string, PersistedCheck>
	/** check ids the operator has muted — they still run + score but never alert. */
	ignore: string[]
	/** operator opt-in for the mail deliverability category (default off, D-333-3/5). */
	mailEnabled?: boolean
}

export const EMPTY_CONNECTIVITY_STATE: ConnectivityState = {checks: {}, ignore: []}

// ── Scoring ──────────────────────────────────────────────────────────────────

const STATUS_RANK: Record<CheckStatus, number> = {pass: 0, warn: 1, fail: 2}

export function worseStatus(a: CheckStatus, b: CheckStatus): CheckStatus {
	return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b
}

export interface ConnectivityScore {
	/** worst status across all checks (pass if there are none). */
	overall: CheckStatus
	/** worst status per category (only categories that produced a check appear). */
	byCategory: Partial<Record<CheckCategory, CheckStatus>>
	counts: {pass: number; warn: number; fail: number}
}

/**
 * Aggregate a run's results into an overall + per-category worst status + counts.
 * A run with no results scores `pass` (nothing to diagnose is not a failure).
 */
export function scoreChecks(results: CheckResult[]): ConnectivityScore {
	const byCategory: Partial<Record<CheckCategory, CheckStatus>> = {}
	const counts = {pass: 0, warn: 0, fail: 0}
	let overall: CheckStatus = 'pass'
	for (const r of results) {
		counts[r.status]++
		overall = worseStatus(overall, r.status)
		const prev = byCategory[r.category]
		byCategory[r.category] = prev ? worseStatus(prev, r.status) : r.status
	}
	return {overall, byCategory, counts}
}

// ── Regression detection ─────────────────────────────────────────────────────

/**
 * Which checks REGRESSED to `fail` since the last run — i.e. the prior persisted
 * status was pass/warn/absent and the fresh status is `fail`. Ignored ids are
 * excluded (they still score, but never alert — D-333-6). A check that was
 * ALREADY failing last run is NOT a fresh regression (the 6h resend-floor handles
 * the "still broken" re-page cadence, not this diff).
 */
export function detectRegressions(
	prev: Record<string, PersistedCheck>,
	results: CheckResult[],
	ignore: string[] = [],
): CheckResult[] {
	const ignored = new Set(ignore)
	const regressed: CheckResult[] = []
	for (const r of results) {
		if (r.status !== 'fail') continue
		if (ignored.has(r.id)) continue
		const before = prev[r.id]?.status
		if (before === 'fail') continue // already failing → not a fresh regression
		regressed.push(r)
	}
	return regressed
}

/**
 * Which previously-failing checks RECOVERED this run (prior fail → fresh pass/warn),
 * so the caller can clear a stale alert. Ignored ids excluded for symmetry.
 */
export function detectRecoveries(
	prev: Record<string, PersistedCheck>,
	results: CheckResult[],
	ignore: string[] = [],
): CheckResult[] {
	const ignored = new Set(ignore)
	const recovered: CheckResult[] = []
	for (const r of results) {
		if (r.status === 'fail') continue
		if (ignored.has(r.id)) continue
		if (prev[r.id]?.status === 'fail') recovered.push(r)
	}
	return recovered
}

/** The alert severity for a set of regressed checks — fail present → warning; any
 * cert/dns fail is critical (a broken domain/cert is a hard outage). */
export function regressionSeverity(regressed: CheckResult[]): 'critical' | 'warning' {
	const hard = regressed.some((r) => r.category === 'dns' || r.category === 'cert' || r.category === 'tunnel')
	return hard ? 'critical' : 'warning'
}

/** Fold a run's results into the persisted per-check map (status + at + detail). */
export function foldPersisted(results: CheckResult[]): Record<string, PersistedCheck> {
	const out: Record<string, PersistedCheck> = {}
	for (const r of results) {
		out[r.id] = {status: r.status, at: r.at, detail: r.detail}
	}
	return out
}
