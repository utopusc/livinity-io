/**
 * task-repository unit tests — Phase 71-03.
 *
 * Mocked-pool pattern (matches api-keys/database.test.ts and
 * usage-tracking/database.test.ts per STATE.md line 116). NO pg-mem.
 *
 * Each test stubs pool.query() to verify (a) the exact SQL emitted by
 * each repo function, (b) the parameter shape, (c) the row→type mapping.
 * Covers all 8 exported functions + 23505 unique-violation translation.
 */
import {describe, it, expect, vi} from 'vitest'
import type {Pool} from 'pg'

import {
	createActiveTask,
	getActiveTask,
	getTaskById,
	updateContainerInfo,
	bumpActivity,
	markIdle,
	markStopped,
	findIdleCandidates,
} from './task-repository.js'

type CallRecord = {text: string; values: unknown[]}

function makeMockPool(handlers: Array<(text: string, values: unknown[]) => any>): {pool: Pool; calls: CallRecord[]} {
	const calls: CallRecord[] = []
	let i = 0
	const query = vi.fn(async (text: string, values: unknown[] = []) => {
		calls.push({text, values})
		const handler = handlers[i++]
		if (!handler) throw new Error(`unexpected query: ${text}`)
		return handler(text, values)
	})
	return {pool: {query} as unknown as Pool, calls}
}

const FAKE_ROW = {
	id: 'task-uuid-1',
	user_id: 'user-uuid-1',
	status: 'active' as const,
	container_id: null,
	port: null,
	last_activity: new Date('2026-05-04T10:00:00Z'),
	created_at: new Date('2026-05-04T10:00:00Z'),
	stopped_at: null,
}

describe('createActiveTask', () => {
	it('INSERTs with status=active and returns mapped task', async () => {
		const {pool, calls} = makeMockPool([() => ({rows: [FAKE_ROW]})])
		const task = await createActiveTask(pool, 'user-uuid-1')
		expect(calls[0].text).toContain('INSERT INTO computer_use_tasks')
		expect(calls[0].text).toContain("VALUES ($1, 'active')")
		expect(calls[0].values).toEqual(['user-uuid-1'])
		expect(task.id).toBe('task-uuid-1')
		expect(task.userId).toBe('user-uuid-1')
		expect(task.status).toBe('active')
		expect(task.containerId).toBeNull()
		expect(task.port).toBeNull()
		expect(task.stoppedAt).toBeNull()
	})

	it('translates 23505 unique-violation to "Container already active for user"', async () => {
		const {pool} = makeMockPool([
			() => {
				const err: any = new Error('duplicate key value violates unique constraint')
				err.code = '23505'
				err.constraint = 'computer_use_tasks_user_active_idx'
				throw err
			},
		])
		await expect(createActiveTask(pool, 'user-uuid-1')).rejects.toThrow(/already active/)
	})

	it('does not swallow non-23505 PG errors', async () => {
		const {pool} = makeMockPool([
			() => {
				const err: any = new Error('connection terminated')
				err.code = '57P01'
				throw err
			},
		])
		await expect(createActiveTask(pool, 'user-uuid-1')).rejects.toThrow(/connection terminated/)
	})
})

describe('getActiveTask', () => {
	it('returns null when no active row', async () => {
		const {pool} = makeMockPool([() => ({rows: []})])
		expect(await getActiveTask(pool, 'user-uuid-1')).toBeNull()
	})

	it('returns mapped task when active row exists', async () => {
		const {pool, calls} = makeMockPool([() => ({rows: [FAKE_ROW]})])
		const task = await getActiveTask(pool, 'user-uuid-1')
		expect(task?.id).toBe('task-uuid-1')
		expect(calls[0].text).toContain("status = 'active'")
		expect(calls[0].text).toContain('LIMIT 1')
		expect(calls[0].values).toEqual(['user-uuid-1'])
	})
})

describe('getTaskById', () => {
	it('returns null when row not found', async () => {
		const {pool} = makeMockPool([() => ({rows: []})])
		expect(await getTaskById(pool, 'task-uuid-X')).toBeNull()
	})

	it('returns mapped task when row exists', async () => {
		const {pool, calls} = makeMockPool([() => ({rows: [FAKE_ROW]})])
		const task = await getTaskById(pool, 'task-uuid-1')
		expect(task?.id).toBe('task-uuid-1')
		expect(calls[0].values).toEqual(['task-uuid-1'])
		expect(calls[0].text).toContain('WHERE id = $1')
	})
})

describe('updateContainerInfo', () => {
	it('UPDATEs container_id + port with $1=taskId, $2=containerId, $3=port', async () => {
		const {pool, calls} = makeMockPool([() => ({rows: []})])
		await updateContainerInfo(pool, 'task-uuid-1', 'docker-abc123', 14101)
		expect(calls[0].text).toContain('UPDATE computer_use_tasks')
		expect(calls[0].text).toContain('container_id = $2')
		expect(calls[0].text).toContain('port = $3')
		expect(calls[0].text).toContain('WHERE id = $1')
		expect(calls[0].values).toEqual(['task-uuid-1', 'docker-abc123', 14101])
	})
})

describe('bumpActivity', () => {
	it('UPDATEs last_activity=now() WHERE user_id=$1 AND status=active', async () => {
		const {pool, calls} = makeMockPool([() => ({rows: []})])
		await bumpActivity(pool, 'user-uuid-1')
		expect(calls[0].text).toContain('last_activity = now()')
		expect(calls[0].text).toContain('user_id = $1')
		expect(calls[0].text).toContain("status = 'active'")
		expect(calls[0].values).toEqual(['user-uuid-1'])
	})
})

describe('markIdle / markStopped', () => {
	it('markIdle only flips active rows', async () => {
		const {pool, calls} = makeMockPool([() => ({rows: []})])
		await markIdle(pool, 'task-uuid-1')
		expect(calls[0].text).toContain("status = 'idle'")
		expect(calls[0].text).toContain("status = 'active'") // guard clause in WHERE
		expect(calls[0].values).toEqual(['task-uuid-1'])
	})

	it('markStopped sets stopped_at=now() and accepts active OR idle', async () => {
		const {pool, calls} = makeMockPool([() => ({rows: []})])
		await markStopped(pool, 'task-uuid-1')
		expect(calls[0].text).toContain("status = 'stopped'")
		expect(calls[0].text).toContain('stopped_at = now()')
		expect(calls[0].text).toMatch(/status IN \('active', 'idle'\)/)
		expect(calls[0].values).toEqual(['task-uuid-1'])
	})
})

describe('findIdleCandidates', () => {
	it('SELECTs active rows older than threshold using make_interval', async () => {
		const {pool, calls} = makeMockPool([() => ({rows: [FAKE_ROW]})])
		const tasks = await findIdleCandidates(pool, 30 * 60 * 1000) // 30 minutes
		expect(calls[0].text).toContain("status = 'active'")
		expect(calls[0].text).toContain('last_activity <')
		expect(calls[0].text).toContain('make_interval(secs =>')
		expect(calls[0].text).toContain('$1::numeric / 1000')
		expect(calls[0].text).toContain('ORDER BY last_activity ASC')
		expect(calls[0].values).toEqual([30 * 60 * 1000])
		expect(tasks).toHaveLength(1)
		expect(tasks[0].id).toBe('task-uuid-1')
		expect(tasks[0].userId).toBe('user-uuid-1')
	})

	it('returns empty array when no candidates', async () => {
		const {pool} = makeMockPool([() => ({rows: []})])
		expect(await findIdleCandidates(pool, 999)).toEqual([])
	})
})

describe('rowToTask mapping coverage', () => {
	it('maps fully populated row (snake_case → camelCase) including non-null containerId, port, stoppedAt', async () => {
		const populated = {
			id: 'task-uuid-2',
			user_id: 'user-uuid-2',
			status: 'stopped' as const,
			container_id: 'docker-xyz789',
			port: 14102,
			last_activity: new Date('2026-05-04T11:00:00Z'),
			created_at: new Date('2026-05-04T09:00:00Z'),
			stopped_at: new Date('2026-05-04T11:30:00Z'),
		}
		const {pool} = makeMockPool([() => ({rows: [populated]})])
		const task = await getTaskById(pool, 'task-uuid-2')
		expect(task).not.toBeNull()
		expect(task!.id).toBe('task-uuid-2')
		expect(task!.userId).toBe('user-uuid-2')
		expect(task!.status).toBe('stopped')
		expect(task!.containerId).toBe('docker-xyz789')
		expect(task!.port).toBe(14102)
		expect(task!.lastActivity).toEqual(new Date('2026-05-04T11:00:00Z'))
		expect(task!.createdAt).toEqual(new Date('2026-05-04T09:00:00Z'))
		expect(task!.stoppedAt).toEqual(new Date('2026-05-04T11:30:00Z'))
	})
})
