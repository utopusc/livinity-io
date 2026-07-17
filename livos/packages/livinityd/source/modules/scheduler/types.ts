// Phase 20 — Scheduler module shared types

// `import type` is compile-time-erased → it CANNOT create a runtime cycle
// (system.ts:10 uses this exact form for getSystemDiskUsage(livinityd)).
import type Livinityd from '../../index.js'

export type JobType =
	| 'image-prune'
	| 'container-update-check'
	| 'git-stack-sync'
	| 'volume-backup'
	| 'ai-resource-watch' // Phase 23 AID-02 — proactive Kimi-generated resource alerts
	| 'disk-critical-watch' // Phase 310 ALERT-02 — server-side low-disk detection → external alert
	| 'smart-health-scan' // Phase 313 SMART-02 — daily per-drive SMART scan → external alert
	| 'smart-self-test-short' // Phase 313 SMART-02 — weekly short self-test (DoS-guarded)
	| 'resource-metrics-collect' // Phase 320 MON-01 — 1-min system-total metrics write (currentLoad, not per-app docker top)
	| 'resource-metrics-rollup' // Phase 320 MON-01 — hourly rollup aggregate + retention prune
	| 'security-advisor-scan' // Phase 328 SEC-02 — weekly Trivy + weak-config scan
	| 'app-auto-update' // Phase 326 APPS-02 — daily opt-in true auto-update (policy==='auto', pin-aware)
	| 'ups-watch' // Phase 326 HW-01 — ≥1-min UPS status poll → power-loss/restore external alert
	| 'user-quota-scan' // Phase 325 STOR-02 — app-layer per-user du accounting → quota-exceeded bell
	| 'custom-command' // Phase 329 APPS-04 — user-defined non-root execa(shell:false) command w/ history + failure alert
	| 'pool-sync' // Phase 318 (POOL-03) — nightly snapraid diff → D-08 freeze-gate → sync → status/alert
	| 'pool-scrub' // Phase 318 (POOL-03) — weekly snapraid scrub -p (parity verification) → status/alert
	| 'connectivity-self-check' // Phase 333 (DIAG-01/02) — hourly DNS/port/cert/tunnel/mail self-diagnosis → regression alert
	| 'recycle-purge' // Phase 338 (RECYCLE-01) — daily .Recycle.Bin age+free-floor purge

export type JobRunStatus = 'success' | 'failure' | 'skipped' | 'running'

// DB row shape (snake_case columns from PG)
export interface ScheduledJobRow {
	id: string
	name: string
	schedule: string
	type: JobType
	config_json: Record<string, unknown>
	enabled: boolean
	last_run: Date | null
	last_run_status: JobRunStatus | null
	last_run_error: string | null
	last_run_output: unknown | null
	next_run: Date | null
	created_at: Date
	updated_at: Date
}

// Domain object (camelCase) returned by store helpers
export interface ScheduledJob {
	id: string
	name: string
	schedule: string
	type: JobType
	config: Record<string, unknown>
	enabled: boolean
	lastRun: Date | null
	lastRunStatus: JobRunStatus | null
	lastRunError: string | null
	lastRunOutput: unknown | null
	nextRun: Date | null
	createdAt: Date
	updatedAt: Date
}

export interface JobRunResult {
	status: 'success' | 'failure' | 'skipped'
	output?: unknown
	error?: string
}

export interface SchedulerLogger {
	log: (msg: string, ...args: unknown[]) => void
	error: (msg: string, err?: unknown) => void
}

export type BuiltInJobHandler = (
	job: ScheduledJob,
	// Phase 310-02 — `livinityd?` is OPTIONAL so the 5 existing handlers (which
	// only read ctx.logger) compile with ZERO edits; Plan 03's disk-critical-watch
	// handler reads ctx.livinityd for getSystemDiskUsage() + notifications.add().
	ctx: {logger: SchedulerLogger; livinityd?: Livinityd},
) => Promise<JobRunResult>

// Helper: snake_case row -> camelCase domain
export function rowToJob(row: ScheduledJobRow): ScheduledJob {
	return {
		id: row.id,
		name: row.name,
		schedule: row.schedule,
		type: row.type,
		config: (row.config_json ?? {}) as Record<string, unknown>,
		enabled: row.enabled,
		lastRun: row.last_run,
		lastRunStatus: row.last_run_status,
		lastRunError: row.last_run_error,
		lastRunOutput: row.last_run_output,
		nextRun: row.next_run,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}
}
