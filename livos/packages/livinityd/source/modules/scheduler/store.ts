// Phase 20 — Scheduler PG store
// CRUD + idempotent default seeding for the `scheduled_jobs` table.
// Pool is fetched per call via getPool() (NOT at module load — DB inits async).

import {getPool} from '../database/index.js'
import {DEFAULT_JOB_DEFINITIONS} from './jobs.js'
import {
	rowToJob,
	type JobRunStatus,
	type JobType,
	type ScheduledJob,
	type ScheduledJobRow,
} from './types.js'

const SELECT_COLS = `id, name, schedule, type, config_json, enabled, last_run, last_run_status, last_run_error, last_run_output, next_run, created_at, updated_at`

/**
 * List every scheduled job, ordered by name.
 * Returns [] when the database is unavailable.
 */
export async function listJobs(): Promise<ScheduledJob[]> {
	const pool = getPool()
	if (!pool) return []
	const {rows} = await pool.query<ScheduledJobRow>(
		`SELECT ${SELECT_COLS} FROM scheduled_jobs ORDER BY name ASC`,
	)
	return rows.map(rowToJob)
}

/**
 * Fetch a single job by id. Returns null if not found or DB unavailable.
 */
export async function getJob(id: string): Promise<ScheduledJob | null> {
	const pool = getPool()
	if (!pool) return null
	const {rows} = await pool.query<ScheduledJobRow>(
		`SELECT ${SELECT_COLS} FROM scheduled_jobs WHERE id = $1`,
		[id],
	)
	if (rows.length === 0) return null
	return rowToJob(rows[0])
}

/**
 * Fetch a single job by its unique name. Used by seedDefaults / admin UI lookups.
 */
export async function getJobByName(name: string): Promise<ScheduledJob | null> {
	const pool = getPool()
	if (!pool) return null
	const {rows} = await pool.query<ScheduledJobRow>(
		`SELECT ${SELECT_COLS} FROM scheduled_jobs WHERE name = $1`,
		[name],
	)
	if (rows.length === 0) return null
	return rowToJob(rows[0])
}

/**
 * List only enabled jobs — used by Scheduler.start() to know which to register with cron.
 */
export async function listEnabledJobs(): Promise<ScheduledJob[]> {
	const pool = getPool()
	if (!pool) return []
	const {rows} = await pool.query<ScheduledJobRow>(
		`SELECT ${SELECT_COLS} FROM scheduled_jobs WHERE enabled = TRUE ORDER BY name ASC`,
	)
	return rows.map(rowToJob)
}

/**
 * Insert a new job definition. Throws if DB unavailable or name conflict.
 */
export async function insertJob(input: {
	name: string
	schedule: string
	type: JobType
	config?: Record<string, unknown>
	enabled?: boolean
}): Promise<ScheduledJob> {
	const pool = getPool()
	if (!pool) throw new Error('Database not initialized')
	const config = input.config ?? {}
	const enabled = input.enabled ?? true
	const {rows} = await pool.query<ScheduledJobRow>(
		`INSERT INTO scheduled_jobs (name, schedule, type, config_json, enabled)
		 VALUES ($1, $2, $3, $4::jsonb, $5)
		 RETURNING ${SELECT_COLS}`,
		[input.name, input.schedule, input.type, JSON.stringify(config), enabled],
	)
	return rowToJob(rows[0])
}

/**
 * Patch only provided fields on an existing job. Always bumps updated_at = NOW().
 * Returns the updated row, or null if id not found / DB unavailable.
 */
export async function updateJob(
	id: string,
	patch: Partial<{
		name: string
		schedule: string
		config: Record<string, unknown>
		enabled: boolean
		nextRun: Date | null
	}>,
): Promise<ScheduledJob | null> {
	const pool = getPool()
	if (!pool) throw new Error('Database not initialized')

	// Build dynamic UPDATE — only set provided fields. Each entry is a [column, value] pair
	// fed through parameterized SQL ($1, $2, ...) so column identifiers come from a closed
	// allowlist (the keys of `patch`) and values can never inject SQL.
	const setClauses: string[] = []
	const values: unknown[] = []
	let p = 1

	if (patch.name !== undefined) {
		setClauses.push(`name = $${p++}`)
		values.push(patch.name)
	}
	if (patch.schedule !== undefined) {
		setClauses.push(`schedule = $${p++}`)
		values.push(patch.schedule)
	}
	if (patch.config !== undefined) {
		setClauses.push(`config_json = $${p++}::jsonb`)
		values.push(JSON.stringify(patch.config))
	}
	if (patch.enabled !== undefined) {
		setClauses.push(`enabled = $${p++}`)
		values.push(patch.enabled)
	}
	if (patch.nextRun !== undefined) {
		setClauses.push(`next_run = $${p++}`)
		values.push(patch.nextRun)
	}

	// No fields to patch — return the current row unchanged
	if (setClauses.length === 0) return getJob(id)

	setClauses.push(`updated_at = NOW()`)
	values.push(id)

	const {rows} = await pool.query<ScheduledJobRow>(
		`UPDATE scheduled_jobs SET ${setClauses.join(', ')} WHERE id = $${p} RETURNING ${SELECT_COLS}`,
		values,
	)
	if (rows.length === 0) return null
	return rowToJob(rows[0])
}

/**
 * Delete a job by id. Returns true if a row was removed.
 */
export async function deleteJob(id: string): Promise<boolean> {
	const pool = getPool()
	if (!pool) throw new Error('Database not initialized')
	const result = await pool.query(`DELETE FROM scheduled_jobs WHERE id = $1`, [id])
	return (result.rowCount ?? 0) > 0
}

/**
 * Persist the outcome of a single run: last_run, status, error, output JSON.
 * Called by Scheduler before & after handler invocation.
 */
export async function recordRunResult(
	id: string,
	result: {status: JobRunStatus; error?: string | null; output?: unknown},
): Promise<void> {
	const pool = getPool()
	if (!pool) throw new Error('Database not initialized')
	const error = result.error ?? null
	const output = result.output === undefined ? null : JSON.stringify(result.output)
	await pool.query(
		`UPDATE scheduled_jobs
		    SET last_run = NOW(),
		        last_run_status = $1,
		        last_run_error = $2,
		        last_run_output = $3::jsonb,
		        updated_at = NOW()
		  WHERE id = $4`,
		[result.status, error, output, id],
	)
}

/**
 * Idempotent seed of built-in default jobs on every boot. Existing rows
 * (matched by unique `name`) are NOT touched — a user who manually disables
 * `image-prune` keeps it disabled across restarts.
 */
export async function seedDefaults(): Promise<void> {
	const pool = getPool()
	if (!pool) return

	for (const def of DEFAULT_JOB_DEFINITIONS) {
		await pool.query(
			`INSERT INTO scheduled_jobs (name, schedule, type, config_json, enabled)
			 VALUES ($1, $2, $3, $4::jsonb, $5)
			 ON CONFLICT (name) DO NOTHING`,
			[def.name, def.schedule, def.type, JSON.stringify(def.config ?? {}), def.enabled],
		)
	}
}
