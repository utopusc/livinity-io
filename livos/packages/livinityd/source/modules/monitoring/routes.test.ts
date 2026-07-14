/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase 320-04 (MON-01 / MON-02) — monitoring router route tests for the two
// NEW nested routers added beside `diskHealth`:
//   - monitoring.history.list({range})   privateProcedure, 4-preset z.enum
//   - monitoring.thresholds.get           privateProcedure
//   - monitoring.thresholds.set({...})    adminProcedure, bounded + refined zod
//
// Strategy mirrors local-dns/routes.test.ts: build a caller via
// `router.createCaller(ctx)` with `dangerouslyBypassAuthentication: true` (skips
// isAuthenticated) + an explicit `currentUser.role` (so requireRole('admin') is
// still exercised on the mutation). thresholds.get/set touch ctx.livinityd.store
// only, stubbed in-memory exactly like thresholds.test.ts. history.list reaches
// getResourceHistory -> getPool() which is null in tests -> [] (fail-open), so
// no real Postgres is needed — these tests assert the ROUTE seam: zod validation,
// admin gating, and that a valid call wires straight through to the Plan 01/03
// functions.

import {describe, expect, test} from 'vitest'

import type Livinityd from '../../index.js'
import monitoringRouter from './routes.js'
import {DEFAULT_THRESHOLDS, type ResourceThresholds} from './thresholds.js'

// In-memory `store` stub: one value cell read by `get`, written by the `set`
// handed to getWriteLock — the exact surface getThresholds/setThresholds touch.
function makeStubLivinityd(initial?: unknown): Livinityd {
	let value: unknown = initial
	const store = {
		get: async () => value,
		getWriteLock: async (job: (methods: {set: (key: string, v: unknown) => Promise<void>}) => Promise<void>) => {
			await job({
				set: async (_key: string, v: unknown) => {
					value = v
				},
			})
		},
	}
	return {store} as unknown as Livinityd
}

// Build a caller. role defaults to 'admin' (passes both privateProcedure — via
// bypass — and adminProcedure — via requireRole). storeInitial seeds the stub
// FileStore cell for the thresholds tests.
function makeCaller(opts?: {role?: string; storeInitial?: unknown}) {
	const ctx = {
		livinityd: makeStubLivinityd(opts?.storeInitial),
		currentUser: {id: 'test-user', username: 'admin', role: opts?.role ?? 'admin'},
		dangerouslyBypassAuthentication: true,
		logger: {error: () => {}, info: () => {}, warn: () => {}, verbose: () => {}, log: () => {}},
	}
	return (monitoringRouter as any).createCaller(ctx)
}

// ─────────────────────────────────────────────────────────────────────────
// monitoring.history.list — privateProcedure, 4-preset z.enum
// ─────────────────────────────────────────────────────────────────────────
describe('monitoring.history.list', () => {
	test('nested under the monitoring router (not a new top-level namespace)', () => {
		const procs = (monitoringRouter as any)._def?.procedures ?? {}
		expect(procs['history.list']).toBeDefined()
	})

	test('accepts each of the 4 locked presets and returns an array (fail-open [] with no pool)', async () => {
		const caller = makeCaller()
		for (const range of ['1h', '24h', '7d', '30d'] as const) {
			await expect(caller.history.list({range})).resolves.toEqual([])
		}
	})

	test("rejects '1y' — D-320-2 locked out the one-year tier", async () => {
		const caller = makeCaller()
		await expect(caller.history.list({range: '1y'})).rejects.toThrow()
	})

	test('rejects an arbitrary/free-form range value at the zod boundary (T-320-10)', async () => {
		const caller = makeCaller()
		await expect(caller.history.list({range: 'all'})).rejects.toThrow()
		await expect(caller.history.list({range: "'; DROP TABLE resource_samples_raw; --"})).rejects.toThrow()
	})
})

// ─────────────────────────────────────────────────────────────────────────
// monitoring.thresholds.get — privateProcedure
// ─────────────────────────────────────────────────────────────────────────
describe('monitoring.thresholds.get', () => {
	test('returns DEFAULT_THRESHOLDS (80/95/3) on an unset store', async () => {
		const caller = makeCaller({storeInitial: undefined})
		await expect(caller.thresholds.get()).resolves.toEqual(DEFAULT_THRESHOLDS)
	})

	test('returns the stored custom values once set', async () => {
		const stored: ResourceThresholds = {
			containerMemoryWarningPct: 60,
			containerMemoryCriticalPct: 85,
			containerRestartLoopCount: 5,
		}
		const caller = makeCaller({storeInitial: stored})
		await expect(caller.thresholds.get()).resolves.toEqual(stored)
	})
})

// ─────────────────────────────────────────────────────────────────────────
// monitoring.thresholds.set — adminProcedure, bounded + refined zod
// ─────────────────────────────────────────────────────────────────────────
describe('monitoring.thresholds.set', () => {
	const valid: ResourceThresholds = {
		containerMemoryWarningPct: 70,
		containerMemoryCriticalPct: 90,
		containerRestartLoopCount: 3,
	}

	test('persists valid bounded input and returns it (re-get reads it back)', async () => {
		const caller = makeCaller()
		await expect(caller.thresholds.set(valid)).resolves.toEqual(valid)
		await expect(caller.thresholds.get()).resolves.toEqual(valid)
	})

	test('rejects containerMemoryWarningPct = 0 (below min 1) — T-320-07b', async () => {
		const caller = makeCaller()
		await expect(caller.thresholds.set({...valid, containerMemoryWarningPct: 0})).rejects.toThrow()
	})

	test('rejects containerMemoryCriticalPct = 101 (above max 100) — T-320-07b', async () => {
		const caller = makeCaller()
		await expect(caller.thresholds.set({...valid, containerMemoryCriticalPct: 101})).rejects.toThrow()
	})

	test('rejects warning >= critical via the refine (95 >= 90)', async () => {
		const caller = makeCaller()
		await expect(
			caller.thresholds.set({
				containerMemoryWarningPct: 95,
				containerMemoryCriticalPct: 90,
				containerRestartLoopCount: 3,
			}),
		).rejects.toThrow()
	})

	test('rejects a non-integer restart count and count < 1 / > 50', async () => {
		const caller = makeCaller()
		await expect(caller.thresholds.set({...valid, containerRestartLoopCount: 1.5})).rejects.toThrow()
		await expect(caller.thresholds.set({...valid, containerRestartLoopCount: 0})).rejects.toThrow()
		await expect(caller.thresholds.set({...valid, containerRestartLoopCount: 51})).rejects.toThrow()
	})

	test('rejects a non-admin caller (adminProcedure / T-320-11)', async () => {
		const caller = makeCaller({role: 'member'})
		await expect(caller.thresholds.set(valid)).rejects.toThrow()
	})
})
