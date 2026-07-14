// Phase 320 (MON-02) — editable ai-resource-watch thresholds, FileStore-backed.
//
// Global-only (D-320-1) — one set for the whole box, no per-app dimension. The
// values were the three hardcoded consts in docker/ai-resource-watch.ts; they
// now live in the FileStore under a DEDICATED top-level `monitoring` key (see the
// StoreSchema note in index.ts) so an operator can edit them via the Plan 04
// admin mutation without a source change.
//
// Lazy-seed: getThresholds() falls back to DEFAULT_THRESHOLDS when the key is
// unset — no boot migration, the FileStore is schemaless YAML.

import type Livinityd from '../../index.js'

export interface ResourceThresholds {
	containerMemoryWarningPct: number
	containerMemoryCriticalPct: number
	containerRestartLoopCount: number
}

export const DEFAULT_THRESHOLDS: ResourceThresholds = {
	containerMemoryWarningPct: 80, // was MEMORY_WARNING_PCT
	containerMemoryCriticalPct: 95, // was MEMORY_CRITICAL_PCT
	containerRestartLoopCount: 3, // was RESTART_LOOP_THRESHOLD
}

// Dedicated top-level dot-prop path — NEVER nested under `alerts`/any array or
// scalar key (dot-prop path collisions silently drop the write, see 310-02).
const STORE_KEY = 'monitoring.thresholds'

// Read the operator-set thresholds, merged OVER the defaults so a partial /
// forward-compat stored object never leaks an `undefined` field downstream.
export async function getThresholds(livinityd: Livinityd): Promise<ResourceThresholds> {
	const stored = (await livinityd.store.get(STORE_KEY)) as Partial<ResourceThresholds> | undefined
	return {...DEFAULT_THRESHOLDS, ...(stored ?? {})}
}

// Concurrent-safe upsert of the single threshold object via getWriteLock. One
// object, not a keyed collection -> a plain `set`, no filter/push merge needed.
export async function setThresholds(livinityd: Livinityd, input: ResourceThresholds): Promise<ResourceThresholds> {
	await livinityd.store.getWriteLock(async ({set}) => {
		await set(STORE_KEY, input)
	})
	return input
}
