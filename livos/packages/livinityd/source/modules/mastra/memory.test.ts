/**
 * Phase 197-03 Plan 03 Task 2 — memory.test.ts.
 *
 * Coverage (≥5 PASS):
 *   1. createLivOSMemory passes the expected options shape to Memory ctor
 *   2. PgVector constructor receives indexConfig={type:'hnsw',metric:'dotproduct'}
 *   3. redactPgUrl scrubs user:password
 *   4. redactPgUrl handles user-only URL
 *   5. Construction error → thrown message NEVER contains raw password
 */

import {beforeEach, describe, expect, test, vi} from 'vitest'

const memoryCtorCalls: Array<{args: unknown[]}> = []
const pgStoreCtorCalls: Array<{args: unknown[]}> = []
const pgVectorCtorCalls: Array<{args: unknown[]}> = []

vi.mock('@mastra/memory', () => ({
	Memory: vi.fn().mockImplementation((...args: unknown[]) => {
		memoryCtorCalls.push({args})
		return {__memory: true}
	}),
}))

vi.mock('@mastra/pg', () => ({
	PostgresStore: vi.fn().mockImplementation((...args: unknown[]) => {
		pgStoreCtorCalls.push({args})
		return {__pgStore: true}
	}),
	PgVector: vi.fn().mockImplementation((...args: unknown[]) => {
		pgVectorCtorCalls.push({args})
		return {__pgVector: true}
	}),
}))

import {createLivOSMemory, redactPgUrl} from './memory.js'

beforeEach(() => {
	memoryCtorCalls.length = 0
	pgStoreCtorCalls.length = 0
	pgVectorCtorCalls.length = 0
})

describe('createLivOSMemory', () => {
	test('Test 1: passes correct options shape with scope=thread on workingMemory', () => {
		createLivOSMemory({databaseUrl: 'postgres://test:pass@localhost/livos'})
		expect(memoryCtorCalls.length).toBe(1)
		const opts = memoryCtorCalls[0]!.args[0] as {
			options: {
				lastMessages: number
				semanticRecall: false | object
				workingMemory: {enabled: boolean; scope: string}
			}
		}
		expect(opts.options.lastMessages).toBe(20)
		// Phase 197-03 v1 — semanticRecall disabled at runtime (embedder deferred to Phase 198+)
		expect(opts.options.semanticRecall).toBe(false)
		expect(opts.options.workingMemory.enabled).toBe(true)
		// T-197-03-05 — workingMemory.scope MUST stay 'thread' to prevent
		// cross-thread context bleed when Phase 198+ re-enables semanticRecall.
		expect(opts.options.workingMemory.scope).toBe('thread')
	})

	test('Test 2: PgVector receives indexConfig hnsw + dotproduct', () => {
		createLivOSMemory({databaseUrl: 'postgres://test@localhost/livos'})
		expect(pgVectorCtorCalls.length).toBe(1)
		const arg = pgVectorCtorCalls[0]!.args[0] as {indexConfig: {type: string; metric: string}}
		expect(arg.indexConfig.type).toBe('hnsw')
		expect(arg.indexConfig.metric).toBe('dotproduct')
	})
})

describe('redactPgUrl (T-197-03-02)', () => {
	test('Test 3: scrubs user:password', () => {
		const out = redactPgUrl('postgres://livos:s3cret@localhost:5432/livos')
		expect(out).toBe('postgres://***:***@localhost:5432/livos')
		expect(out).not.toContain('s3cret')
	})

	test('Test 4: user-only URL → single *** redaction', () => {
		const out = redactPgUrl('postgres://livos@localhost/livos')
		expect(out).toBe('postgres://***@localhost/livos')
	})

	test('Test 5: construction error never contains raw password', async () => {
		// Force PostgresStore ctor to throw with a known password substring
		const pgMod = await import('@mastra/pg')
		;(pgMod.PostgresStore as unknown as {mockImplementationOnce: (fn: () => never) => void}).mockImplementationOnce(() => {
			throw new Error('boom: connection postgres://livos:DEEP-SECRET-XYZ@host/db failed')
		})
		try {
			createLivOSMemory({databaseUrl: 'postgres://livos:DEEP-SECRET-XYZ@host/db'})
			expect.fail('expected throw')
		} catch (err) {
			expect((err as Error).message).not.toContain('DEEP-SECRET-XYZ')
			expect((err as Error).message).toContain('***')
		}
	})
})
