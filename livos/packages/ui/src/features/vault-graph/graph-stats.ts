// Phase 187-05 — Graph topology statistics.
//
// Pure function, no side effects, no imports.
// Consumed by VaultGraph.tsx via useMemo and passed to LegendBadge.
//
// Threat T-187-05-02: Pure function — no eval/exec path; degree/wikiDegree
// are TypeScript-typed number fields from server-sourced nodes.

export interface HubEntry {
	id: string
	label: string
	degree: number
}

export interface GraphStats {
	nodeCount: number
	edgeCount: number
	orphanCount: number  // nodes where wikiDegree === 0
	topHubs: HubEntry[]  // top 3 nodes sorted by degree descending
}

/**
 * computeGraphStats — pure transform from node/edge arrays to topology metrics.
 *
 * @param nodes - Array with { id, label, degree, wikiDegree } — Phase 187-01 fields required.
 * @param edges - Any array; only .length is used for edgeCount.
 */
export function computeGraphStats(
	nodes: Array<{id: string; label: string; degree: number; wikiDegree: number}>,
	edges: Array<unknown>,
): GraphStats {
	const nodeCount = nodes.length
	const edgeCount = edges.length
	const orphanCount = nodes.filter((n) => n.wikiDegree === 0).length
	const topHubs = [...nodes]
		.sort((a, b) => b.degree - a.degree)
		.slice(0, 3)
		.map(({id, label, degree}) => ({id, label, degree}))
	return {nodeCount, edgeCount, orphanCount, topHubs}
}
