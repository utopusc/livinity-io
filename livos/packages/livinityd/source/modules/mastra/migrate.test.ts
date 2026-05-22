/**
 * Phase 197-03 Plan 03 Task 3 — migrate.test.ts.
 *
 * Coverage (≥3 PASS):
 *   1. runMastraMigrations on a fresh DB creates 4 tables (mocked pg client)
 *   2. Re-run on the same DB is a no-op (tablesCreated=0, alreadyExisted=4)
 *   3. pg client throws → re-thrown error does NOT contain raw password
 */

import {beforeEach, describe, expect, test, vi} from 'vitest'

const connectCalls: Array<number> = []
const queryCalls: Array<{sql: string; params?: unknown[]}> = []
const endCalls: Array<number> = []

// Pre-/post existence rows controlled per-test via these mutable arrays.
let beforeRows: Array<{table_name: string}> = []
let afterRows: Array<{table_name: string}> = []
let queryError: Error | null = null

vi.mock('pg', () => ({
	Client: vi.fn().mockImplementation(() => ({
		async connect() {
			connectCalls.push(1)
			if (queryError && queryError.message === 'connect-error') throw queryError
		},
		async query(sql: string, params?: unknown[]) {
			queryCalls.push({sql, params})
			if (queryError && queryError.message !== 'connect-error') throw queryError
			if (sql.includes('information_schema.tables')) {
				return {rows: queryCalls.length <= 1 ? beforeRows : afterRows}
			}
			return {rows: []}
		},
		async end() {
			endCalls.push(1)
		},
	})),
}))

import {runMastraMigrations} from './migrate.js'

beforeEach(() => {
	connectCalls.length = 0
	queryCalls.length = 0
	endCalls.length = 0
	beforeRows = []
	afterRows = []
	queryError = null
})

describe('runMastraMigrations', () => {
	test('Test 1: fresh DB creates 4 tables', async () => {
		beforeRows = []
		afterRows = [
			{table_name: 'mastra_threads'},
			{table_name: 'mastra_messages'},
			{table_name: 'mastra_working_memory'},
			{table_name: 'mastra_workflow_runs'},
		]
		const result = await runMastraMigrations({databaseUrl: 'postgres://test:pass@host/db'})
		expect(result.alreadyExisted).toBe(0)
		expect(result.tablesCreated).toBe(4)
		expect(connectCalls.length).toBe(1)
		expect(endCalls.length).toBe(1)
		// The SQL file content was queried (3rd query — after pre-check, sql exec, post-check)
		const sqlCall = queryCalls.find((c) => /CREATE TABLE IF NOT EXISTS mastra_threads/.test(c.sql))
		expect(sqlCall).toBeTruthy()
	})

	test('Test 2: re-run is a no-op (already-existed=4, created=0)', async () => {
		beforeRows = [
			{table_name: 'mastra_threads'},
			{table_name: 'mastra_messages'},
			{table_name: 'mastra_working_memory'},
			{table_name: 'mastra_workflow_runs'},
		]
		afterRows = [...beforeRows]
		const result = await runMastraMigrations({databaseUrl: 'postgres://test:pass@host/db'})
		expect(result.alreadyExisted).toBe(4)
		expect(result.tablesCreated).toBe(0)
	})

	test('Test 3: connect error → thrown message has password scrubbed', async () => {
		queryError = new Error('connect-error')
		await expect(
			runMastraMigrations({databaseUrl: 'postgres://livos:SCRUB-ME-XYZ@host/db'}),
		).rejects.toThrow(/Phase 197-03 runMastraMigrations failed/)
		try {
			await runMastraMigrations({databaseUrl: 'postgres://livos:SCRUB-ME-XYZ@host/db'})
		} catch (err) {
			expect((err as Error).message).not.toContain('SCRUB-ME-XYZ')
		}
	})
})
