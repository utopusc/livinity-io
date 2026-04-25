// Phase 20 — Scheduler module shared types

export type JobType =
	| 'image-prune'
	| 'container-update-check'
	| 'git-stack-sync'
	| 'volume-backup'
	| 'ai-resource-watch' // Phase 23 AID-02 — proactive Kimi-generated resource alerts

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
	ctx: {logger: SchedulerLogger},
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
