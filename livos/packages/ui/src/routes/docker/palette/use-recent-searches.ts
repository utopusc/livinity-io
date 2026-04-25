// Phase 29 Plan 29-01 — recent palette searches (DOC-18).
//
// Manages the localStorage-backed list of recent queries the user has typed
// into the cmd+k palette. Persisted (recent searches ARE preferential — the
// user implicitly opts in by typing) under 'livos:docker:palette:recent'.
//
// Pure-helper-as-fixture: loadRecent + pushRecent are pure exports the hook
// wraps. Tests hit the helpers directly (no renderHook needed). Same pattern
// as Plan 28-01 parseLogsParams + log-buffer.

import {useCallback, useState} from 'react'

export const KEY = 'livos:docker:palette:recent'
export const MAX = 8

/** Pure: read recent list from localStorage. Returns [] on missing/invalid. */
export function loadRecent(): string[] {
	try {
		const raw = localStorage.getItem(KEY)
		if (!raw) return []
		const parsed = JSON.parse(raw)
		if (!Array.isArray(parsed)) return []
		// Defensive — only keep string entries.
		return parsed.filter((x): x is string => typeof x === 'string')
	} catch {
		return []
	}
}

/**
 * Pure: produce next recent list given previous + new query.
 *  - Trim input; ignore empty/whitespace
 *  - Dedupe (move to head if already present)
 *  - Cap at MAX (drop oldest)
 */
export function pushRecent(prev: string[], query: string): string[] {
	const trimmed = query.trim()
	if (!trimmed) return prev
	const filtered = prev.filter((p) => p !== trimmed)
	return [trimmed, ...filtered].slice(0, MAX)
}

interface UseRecentSearchesResult {
	recent: string[]
	addRecent: (query: string) => void
}

/**
 * Hook that mirrors the localStorage list into React state, exposing
 * addRecent for the palette to call on result-select.
 */
export function useRecentSearches(): UseRecentSearchesResult {
	const [recent, setRecent] = useState<string[]>(() => loadRecent())

	const addRecent = useCallback((query: string) => {
		setRecent((prev) => {
			const next = pushRecent(prev, query)
			if (next === prev) return prev // no-op (empty input)
			try {
				localStorage.setItem(KEY, JSON.stringify(next))
			} catch {
				/* ignore — quota errors don't crash the palette */
			}
			return next
		})
	}, [])

	return {recent, addRecent}
}
