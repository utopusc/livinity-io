// Phase 38 Plan 04 — pick the most recent factory-reset event from the generic
// listUpdateHistory rows.
//
// `system.listUpdateHistory` returns rows of shape `{filename, ...parsed}`
// where `parsed` is the JSON event body (validated only that `parsed.timestamp`
// is a string — otherwise the row is dropped). v29.2 factory-reset rows carry
// the Phase 37 D-EVT-02 schema (`type: 'factory-reset'`, `status`, etc.), but
// the same endpoint also returns Phase 33 update rows (`type: 'success' |
// 'failed' | 'rollback' | 'precheck-fail'`). We therefore filter explicitly by
// `type === 'factory-reset'` and pick the most recent by `started_at` desc.
//
// Pure / deterministic — no React state, no side effects. Plan 04's overlay
// component calls this on every refetch.

import type {FactoryResetEvent} from './types'

export function selectLatestFactoryResetEvent(rows: unknown): FactoryResetEvent | null {
	if (!Array.isArray(rows)) return null
	const candidates: FactoryResetEvent[] = []
	for (const row of rows) {
		if (!row || typeof row !== 'object') continue
		const r = row as Record<string, unknown>
		if (r.type !== 'factory-reset') continue
		// status is the only field the UI strictly needs to switch on; everything
		// else is cosmetic / numeric. Drop rows missing it (defensive — Phase 37's
		// bash always writes status, but a partially-flushed row mid-write could
		// in theory be observed).
		if (typeof r.status !== 'string') continue
		candidates.push(r as unknown as FactoryResetEvent)
	}
	if (candidates.length === 0) return null
	candidates.sort((a, b) => {
		const sa = (a as unknown as {started_at?: unknown; timestamp?: unknown}).started_at
			?? (a as unknown as {timestamp?: unknown}).timestamp
			?? ''
		const sb = (b as unknown as {started_at?: unknown; timestamp?: unknown}).started_at
			?? (b as unknown as {timestamp?: unknown}).timestamp
			?? ''
		return String(sb).localeCompare(String(sa))
	})
	return candidates[0]
}
