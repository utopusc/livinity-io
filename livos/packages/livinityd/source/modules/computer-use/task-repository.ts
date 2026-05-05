/**
 * Computer Use Tasks repository — Phase 71 (CU-FOUND-06).
 *
 * Parameterized queries for the computer_use_tasks table. The partial
 * unique index `computer_use_tasks_user_active_idx` (schema.sql) enforces
 * max-1-active-per-user at the DB layer — `createActiveTask` translates
 * the resulting 23505 violation into a friendly error.
 */
import type {Pool} from 'pg'

export type ComputerUseTaskStatus = 'active' | 'idle' | 'stopped'

export type ComputerUseTask = {
	id: string
	userId: string
	status: ComputerUseTaskStatus
	containerId: string | null
	port: number | null
	lastActivity: Date
	createdAt: Date
	stoppedAt: Date | null
}

type Row = {
	id: string
	user_id: string
	status: ComputerUseTaskStatus
	container_id: string | null
	port: number | null
	last_activity: Date
	created_at: Date
	stopped_at: Date | null
}

function rowToTask(row: Row): ComputerUseTask {
	return {
		id: row.id,
		userId: row.user_id,
		status: row.status,
		containerId: row.container_id,
		port: row.port,
		lastActivity: row.last_activity,
		createdAt: row.created_at,
		stoppedAt: row.stopped_at,
	}
}

const SELECT_COLS = `id, user_id, status, container_id, port, last_activity, created_at, stopped_at`

export async function createActiveTask(pool: Pool, userId: string): Promise<ComputerUseTask> {
	try {
		const result = await pool.query<Row>(
			`INSERT INTO computer_use_tasks (user_id, status) VALUES ($1, 'active') RETURNING ${SELECT_COLS}`,
			[userId],
		)
		return rowToTask(result.rows[0])
	} catch (e: any) {
		if (e?.code === '23505') {
			throw new Error('Container already active for user')
		}
		throw e
	}
}

export async function getActiveTask(pool: Pool, userId: string): Promise<ComputerUseTask | null> {
	const result = await pool.query<Row>(
		`SELECT ${SELECT_COLS} FROM computer_use_tasks WHERE user_id = $1 AND status = 'active' LIMIT 1`,
		[userId],
	)
	return result.rows[0] ? rowToTask(result.rows[0]) : null
}

export async function getTaskById(pool: Pool, taskId: string): Promise<ComputerUseTask | null> {
	const result = await pool.query<Row>(
		`SELECT ${SELECT_COLS} FROM computer_use_tasks WHERE id = $1`,
		[taskId],
	)
	return result.rows[0] ? rowToTask(result.rows[0]) : null
}

export async function updateContainerInfo(
	pool: Pool,
	taskId: string,
	containerId: string,
	port: number,
): Promise<void> {
	await pool.query(
		`UPDATE computer_use_tasks SET container_id = $2, port = $3 WHERE id = $1`,
		[taskId, containerId, port],
	)
}

export async function bumpActivity(pool: Pool, userId: string): Promise<void> {
	await pool.query(
		`UPDATE computer_use_tasks SET last_activity = now() WHERE user_id = $1 AND status = 'active'`,
		[userId],
	)
}

export async function markIdle(pool: Pool, taskId: string): Promise<void> {
	await pool.query(
		`UPDATE computer_use_tasks SET status = 'idle' WHERE id = $1 AND status = 'active'`,
		[taskId],
	)
}

export async function markStopped(pool: Pool, taskId: string): Promise<void> {
	await pool.query(
		`UPDATE computer_use_tasks SET status = 'stopped', stopped_at = now() WHERE id = $1 AND status IN ('active', 'idle')`,
		[taskId],
	)
}

export async function findIdleCandidates(
	pool: Pool,
	idleThresholdMs: number,
): Promise<ComputerUseTask[]> {
	const result = await pool.query<Row>(
		`SELECT ${SELECT_COLS} FROM computer_use_tasks
		 WHERE status = 'active'
		   AND last_activity < now() - make_interval(secs => $1::numeric / 1000)
		 ORDER BY last_activity ASC`,
		[idleThresholdMs],
	)
	return result.rows.map(rowToTask)
}
