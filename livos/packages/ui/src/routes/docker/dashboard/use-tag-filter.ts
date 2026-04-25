// Phase 25 Plan 25-02 — useTagFilter hook + pure helpers (DOC-06).
//
// The dashboard chip row is a small bit of state — single-selected tag — that
// needs to (a) survive page reloads, (b) filter the env list client-side, and
// (c) auto-fall back to 'All' when the persisted tag no longer exists.
//
// Architecture: pure helpers at module scope (deriveAllTags + filterEnvs +
// read/writePersistedTag) so vitest can lock down behaviour without rendering
// React. The hook is a thin shell — useState hydrates from localStorage on
// mount, the setSelected callback writes through.
//
// Why localStorage + plain useState (NOT zustand): selection scope is a
// single-component-tree concern (only the dashboard chip row + grid consume
// it), whereas the env-store / docker-store are read by many cross-route
// components. Adding a third zustand store for one chip-row would be
// disproportionate. localStorage key follows the `livos:docker:*` prefix
// convention (Plan 24-01 D-01 + Plan 24-02 D-03).

import {useCallback, useState} from 'react'

/** Persistence key — matches the `livos:docker:*` prefix convention. */
export const TAG_FILTER_STORAGE_KEY = 'livos:docker:dashboard:selected-tag'

// ---------------------------------------------------------------------------
// Pure helpers — exported for unit testing AND consumed by the hook below.
// ---------------------------------------------------------------------------

/**
 * Derives the alphabetised, deduped union of all tags across the given envs.
 * Returns [] when the input is empty. Used by the chip row to enumerate the
 * available filter options.
 */
export function deriveAllTags(envs: ReadonlyArray<{tags: string[]}>): string[] {
	const set = new Set<string>()
	for (const e of envs) for (const t of e.tags) set.add(t)
	return [...set].sort()
}

/**
 * Filters an env list by selected tag. `null` selected = 'All' = pass-through.
 * Single-select: only envs that include the selected tag survive. Generic over
 * any T extending {tags: string[]} so callers retain their full env type.
 */
export function filterEnvs<T extends {tags: string[]}>(envs: T[], selected: string | null): T[] {
	if (!selected) return envs
	return envs.filter((e) => e.tags.includes(selected))
}

/**
 * Reads the persisted tag from localStorage. Returns null when no value is
 * stored OR when localStorage is unavailable (SSR / disabled). Defensive:
 * any throw from localStorage (e.g. private mode quota) returns null.
 */
export function readPersistedTag(): string | null {
	if (typeof window === 'undefined') return null
	try {
		return localStorage.getItem(TAG_FILTER_STORAGE_KEY)
	} catch {
		return null
	}
}

/**
 * Writes the persisted tag to localStorage. `null` clears the key. Defensive:
 * any throw from localStorage is swallowed — the persistence layer is
 * best-effort, the in-memory state is the source of truth for the running tab.
 */
export function writePersistedTag(tag: string | null): void {
	if (typeof window === 'undefined') return
	try {
		if (tag === null) localStorage.removeItem(TAG_FILTER_STORAGE_KEY)
		else localStorage.setItem(TAG_FILTER_STORAGE_KEY, tag)
	} catch {
		// Ignore — see JSDoc.
	}
}

// ---------------------------------------------------------------------------
// useTagFilter — React hook wrapping the helpers above.
// ---------------------------------------------------------------------------

export interface UseTagFilterResult {
	/** The currently active tag, or null when 'All' is selected. */
	selected: string | null
	/** Sets the active tag and persists it. Pass null to reset to 'All'. */
	setSelected: (tag: string | null) => void
}

/**
 * Returns the active tag selection plus a setter that persists through to
 * localStorage. Hydrates from localStorage on first mount via useState's lazy
 * initialiser so the persisted value is read exactly once per component
 * lifetime.
 *
 * The hook does NOT cache the env list — that comes from useEnvironments()
 * which already has its own React Query cache. Pass `envs` to filterEnvs() at
 * the call site.
 */
export function useTagFilter(): UseTagFilterResult {
	const [selected, setSelectedState] = useState<string | null>(() => readPersistedTag())

	const setSelected = useCallback((tag: string | null) => {
		setSelectedState(tag)
		writePersistedTag(tag)
	}, [])

	return {selected, setSelected}
}
