// Phase 62 Plan 62-05 — Usage filter (FR-BROKER-E2-02 frontend half).
//
// Persists the last-selected `apiKeyId` filter for the Usage subsection so
// that returning to Settings → AI Configuration → Usage shows the user's
// previous choice (CONTEXT.md decisions §API Key Filter Dropdown).
//
// localStorage key is VERBATIM from CONTEXT.md ("livinity:" prefix per the
// platform convention RESEARCH.md §Open Questions Q3 locked) — the grep
// guard in 62-05-PLAN.md asserts this string at phase-gate time.
//
// Mirrors livos/packages/ui/src/routes/docker/palette/use-recent-searches.ts
// (Phase 29 Plan 29-01) — three exports: KEY constant + two pure helpers
// (loadFilter / saveFilter) + the React hook (useUsageFilter). Pure helpers
// are tested in isolation (no @testing-library/react needed; D-NO-NEW-DEPS).
//
// SSR safety: every localStorage access is guarded by `typeof window !==
// 'undefined'` because the React tree may be rendered during SSG/SSR builds
// (vite-plugin-pwa precaches some routes statically).

import {useCallback, useState} from 'react'

export const KEY = 'livinity:usage:filter:apiKeyId'

/** Pure: read filter from localStorage. Returns null on miss / parse-error / SSR. */
export function loadFilter(): string | null {
	if (typeof window === 'undefined') return null
	try {
		const raw = localStorage.getItem(KEY)
		return typeof raw === 'string' && raw.length > 0 ? raw : null
	} catch {
		return null
	}
}

/** Pure: persist filter. null → removeItem; non-null → setItem. Quota errors swallowed. */
export function saveFilter(value: string | null): void {
	if (typeof window === 'undefined') return
	try {
		if (value === null) localStorage.removeItem(KEY)
		else localStorage.setItem(KEY, value)
	} catch {
		/* quota / disabled-storage errors are non-fatal — filter just doesn't persist */
	}
}

interface UseUsageFilterResult {
	filter: string | null
	setFilter: (value: string | null) => void
}

/**
 * Hook: mirror localStorage filter into React state. Updates persist to
 * localStorage on every setFilter call.
 */
export function useUsageFilter(): UseUsageFilterResult {
	const [filter, setFilterState] = useState<string | null>(() => loadFilter())

	const setFilter = useCallback((value: string | null) => {
		setFilterState(value)
		saveFilter(value)
	}, [])

	return {filter, setFilter}
}
