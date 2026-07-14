// Phase 320 (MON-02) — thresholds.ts unit tests.
//
// Covers the FileStore-backed get/set contract for the editable
// ai-resource-watch thresholds:
//   1. getThresholds() on an unset store -> DEFAULT_THRESHOLDS (lazy seed)
//   2. setThresholds() then getThresholds() -> the stored custom values
//   3. a partial stored object is merged OVER the defaults (never dropped)
//
// No real FileStore/YAML needed — a tiny in-memory stub mirrors the
// `store.get` / `store.getWriteLock({set})` surface getThresholds/setThresholds
// actually touch (matches how the daemon tests stub `ctx as any`).

import {describe, expect, test} from 'vitest'

import type Livinityd from '../../index.js'
import {DEFAULT_THRESHOLDS, getThresholds, setThresholds, type ResourceThresholds} from './thresholds.js'

// In-memory `store` stub: a single value cell read by `get` and written by the
// `set` handed to the getWriteLock job. Cast to Livinityd — the real class is a
// full daemon we never need here (only `.store` is exercised).
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

describe('thresholds', () => {
	test('1. getThresholds on an unset store returns DEFAULT_THRESHOLDS', async () => {
		const livinityd = makeStubLivinityd(undefined)
		await expect(getThresholds(livinityd)).resolves.toEqual(DEFAULT_THRESHOLDS)
		// Sanity-pin the documented default values (80 / 95 / 3).
		expect(DEFAULT_THRESHOLDS).toEqual({
			containerMemoryWarningPct: 80,
			containerMemoryCriticalPct: 95,
			containerRestartLoopCount: 3,
		})
	})

	test('2. setThresholds then getThresholds returns the stored custom values', async () => {
		const livinityd = makeStubLivinityd(undefined)
		const custom: ResourceThresholds = {
			containerMemoryWarningPct: 60,
			containerMemoryCriticalPct: 85,
			containerRestartLoopCount: 5,
		}
		await expect(setThresholds(livinityd, custom)).resolves.toEqual(custom)
		await expect(getThresholds(livinityd)).resolves.toEqual(custom)
	})

	test('3. a partial stored object is merged over the defaults', async () => {
		// Only one field persisted (e.g. a forward/backward-compat partial write) —
		// the missing fields must fall back to DEFAULT_THRESHOLDS, never come back
		// undefined.
		const livinityd = makeStubLivinityd({containerMemoryWarningPct: 70})
		await expect(getThresholds(livinityd)).resolves.toEqual({
			containerMemoryWarningPct: 70,
			containerMemoryCriticalPct: 95,
			containerRestartLoopCount: 3,
		})
	})
})
