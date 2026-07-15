// Phase 329 APPS-04 — job_runs history write + retention prune unit tests.
//
// Covers the two data helpers that back the custom-command run history (D-14):
//   1: FAIL-OPEN — no pool → recordJobRun/pruneJobRuns no-op, never throw
//      (mirrors history.ts — a scheduler tick survives PG being briefly down).
//   2: recordJobRun — a single parameterized INSERT into job_runs ($1..$7).
//   3: pruneJobRuns — a 30-day cap DELETE + a keep-newest-20-per-job_name DELETE
//      (LIMIT 20), job_name parameterized, interval a fixed literal (no injection).
//
// getPool() is mocked so the SQL text/params can be asserted without a live DB.

import {describe, expect, test, vi} from 'vitest'

const {mockGetPool, mockQuery} = vi.hoisted(() => {
	const mockQuery = vi.fn().mockResolvedValue({rows: []})
	return {mockQuery, mockGetPool: vi.fn<() => {query: typeof mockQuery} | null>(() => ({query: mockQuery}))}
})

vi.mock('../database/index.js', async (importActual) => {
	const actual = await importActual<typeof import('../database/index.js')>()
	return {...actual, getPool: () => mockGetPool()}
})

import {recordJobRun, pruneJobRuns} from './jobs.js'

describe('job_runs history helpers (D-14)', () => {
	test('FAIL-OPEN: no pool → both helpers resolve without a query', async () => {
		mockQuery.mockClear()
		mockGetPool.mockReturnValueOnce(null)
		await expect(recordJobRun({jobId: 'j', jobName: 'n', startedAt: new Date(), finishedAt: new Date(), status: 'success', output: 'x', error: null})).resolves.toBeUndefined()
		mockGetPool.mockReturnValueOnce(null)
		await expect(pruneJobRuns('n')).resolves.toBeUndefined()
		expect(mockQuery).not.toHaveBeenCalled()
	})

	test('recordJobRun: single parameterized INSERT into job_runs', async () => {
		mockQuery.mockClear()
		const startedAt = new Date('2026-07-15T00:00:00Z')
		const finishedAt = new Date('2026-07-15T00:00:05Z')
		await recordJobRun({jobId: 'job-1', jobName: 'my-job', startedAt, finishedAt, status: 'failure', output: null, error: 'boom'})
		expect(mockQuery).toHaveBeenCalledTimes(1)
		const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]]
		expect(sql).toContain('INSERT INTO job_runs')
		expect(params).toEqual(['job-1', 'my-job', startedAt, finishedAt, 'failure', null, 'boom'])
	})

	test('pruneJobRuns: 30-day cap DELETE + keep-newest-20-per-job DELETE', async () => {
		mockQuery.mockClear()
		await pruneJobRuns('my-job')
		expect(mockQuery).toHaveBeenCalledTimes(2)
		const [capSql] = mockQuery.mock.calls[0] as [string]
		expect(capSql).toContain('DELETE FROM job_runs')
		expect(capSql).toContain(`INTERVAL '30 days'`)
		const [keepSql, keepParams] = mockQuery.mock.calls[1] as [string, unknown[]]
		expect(keepSql).toContain('LIMIT 20')
		expect(keepSql).toContain('job_name = $1')
		expect(keepParams).toEqual(['my-job'])
	})
})
