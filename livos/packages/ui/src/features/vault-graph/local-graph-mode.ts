// Phase 180-01 — BFS subgraph resolver for local graph mode.
//
// Pure TypeScript — no React, no side effects.
// Exported for use in VaultGraph.tsx (useMemo) and tests.
//
// Threat mitigations:
//  - T-180-01-A: depth clamped to [1, 4] — at 2000 nodes depth-4 BFS completes < 5ms.
//  - T-180-01-B: `visited` Set prevents revisiting nodes; graph cycles cannot cause infinite loop.

export interface GraphNode {
  id: string
  label: string
  type: 'memory' | 'session' | 'inbox' | 'agent' | 'skill' | 'command' | 'root'
  size: number
  mtime: number
  tags: string[]
  topDir: string
}

export interface GraphEdge {
  source: string
  target: string
  type: 'wikilink' | 'directory'
}

export interface LocalGraphResult {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

/**
 * BFS subgraph from `focusId` up to `depth` hops.
 *
 * Edges are traversed in both directions (undirected BFS).
 * Returns only nodes reachable within `depth` hops, plus edges
 * where BOTH source and target are in the result set.
 */
export function bfsSubgraph(
  graph: { nodes: GraphNode[]; edges: GraphEdge[] },
  focusId: string,
  depth: number,
): LocalGraphResult {
  // T-180-01-A: clamp depth to [1, 4]
  const clampedDepth = Math.min(4, Math.max(1, depth))

  // Quick lookup
  const nodeMap = new Map<string, GraphNode>()
  for (const n of graph.nodes) nodeMap.set(n.id, n)

  if (!nodeMap.has(focusId)) return { nodes: [], edges: [] }

  // T-180-01-B: visited set prevents cycles
  const visited = new Set<string>([focusId])
  let frontier = [focusId]

  for (let hop = 0; hop < clampedDepth; hop++) {
    const nextFrontier: string[] = []
    for (const nodeId of frontier) {
      for (const e of graph.edges) {
        // Traverse edges in both directions (undirected BFS)
        const neighbour =
          e.source === nodeId ? e.target
          : e.target === nodeId ? e.source
          : null
        if (neighbour !== null && !visited.has(neighbour) && nodeMap.has(neighbour)) {
          visited.add(neighbour)
          nextFrontier.push(neighbour)
        }
      }
    }
    frontier = nextFrontier
    if (frontier.length === 0) break
  }

  const resultNodes = graph.nodes.filter((n) => visited.has(n.id))
  const resultEdges = graph.edges.filter(
    (e) => visited.has(e.source) && visited.has(e.target),
  )

  return { nodes: resultNodes, edges: resultEdges }
}
