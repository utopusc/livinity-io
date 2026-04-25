// Phase 26 Plan 26-01 — Generic client-side row filter.
//
// One primitive used by ContainerSection (haystack = name + image) and
// ImageSection (haystack = repoTags joined). Empty-query path returns the
// SAME array reference so consumers can skip a useMemo when search is
// inactive — small but free perf win.
//
// O(n × m) where n = row count, m = haystack length × query length. The
// `<Input maxLength={200}>` defensive bound on the search inputs keeps m
// bounded; threat T-26-03 in 26-01-PLAN.md.

export function filterByQuery<T>(rows: T[], query: string, getHaystack: (row: T) => string): T[] {
	const trimmed = query.trim()
	if (trimmed.length === 0) return rows
	const needle = trimmed.toLowerCase()
	return rows.filter((row) => getHaystack(row).toLowerCase().includes(needle))
}
