// @vitest-environment jsdom
//
// Phase 180-01 — BFS subgraph unit tests (6 assertions).
// Pure TypeScript tests — no JSX, no React.

import { describe, it, expect } from 'vitest'
import { bfsSubgraph } from './local-graph-mode'

// Minimal GraphNode fixture factory
function node(id: string, topDir = 'root') {
  return { id, label: id, type: 'memory' as const, size: 1, mtime: 0, tags: [], topDir }
}

// GraphEdge shorthand
function edge(source: string, target: string) {
  return { source, target, type: 'wikilink' as const }
}

describe('bfsSubgraph', () => {
  it('depth=1 returns focus node + direct neighbours only', () => {
    const graph = {
      nodes: [node('A'), node('B'), node('C'), node('D')],
      edges: [edge('A', 'B'), edge('A', 'C'), edge('B', 'D')],
    }
    const result = bfsSubgraph(graph, 'A', 1)
    const ids = result.nodes.map((n) => n.id).sort()
    // A + direct neighbours B and C (not D which is depth 2)
    expect(ids).toEqual(['A', 'B', 'C'])
    // Edges between those nodes
    expect(result.edges).toHaveLength(2)
  })

  it('depth=2 includes depth-2 neighbours', () => {
    // Chain: A → B → D; A → C
    const graph = {
      nodes: [node('A'), node('B'), node('C'), node('D')],
      edges: [edge('A', 'B'), edge('A', 'C'), edge('B', 'D')],
    }
    const result = bfsSubgraph(graph, 'A', 2)
    const ids = result.nodes.map((n) => n.id).sort()
    expect(ids).toEqual(['A', 'B', 'C', 'D'])
  })

  it('never revisits nodes in a cyclic graph', () => {
    // A ↔ B ↔ A (cycle)
    const graph = {
      nodes: [node('A'), node('B')],
      edges: [edge('A', 'B'), edge('B', 'A')],
    }
    const result = bfsSubgraph(graph, 'A', 4)
    // Should only contain A and B once each
    expect(result.nodes).toHaveLength(2)
  })

  it('depth=0 is clamped to depth=1', () => {
    const graph = {
      nodes: [node('A'), node('B'), node('C')],
      edges: [edge('A', 'B'), edge('B', 'C')],
    }
    const depthZero = bfsSubgraph(graph, 'A', 0)
    const depthOne = bfsSubgraph(graph, 'A', 1)
    expect(depthZero.nodes.map((n) => n.id).sort()).toEqual(
      depthOne.nodes.map((n) => n.id).sort(),
    )
  })

  it('depth=5 is clamped to depth=4', () => {
    // Chain A → B → C → D → E → F; max depth=4 should include A..E, not F
    const graph = {
      nodes: [node('A'), node('B'), node('C'), node('D'), node('E'), node('F')],
      edges: [
        edge('A', 'B'),
        edge('B', 'C'),
        edge('C', 'D'),
        edge('D', 'E'),
        edge('E', 'F'),
      ],
    }
    const depthFive = bfsSubgraph(graph, 'A', 5)
    const depthFour = bfsSubgraph(graph, 'A', 4)
    expect(depthFive.nodes.map((n) => n.id).sort()).toEqual(
      depthFour.nodes.map((n) => n.id).sort(),
    )
    // F should NOT be in depth-4 result
    expect(depthFour.nodes.find((n) => n.id === 'F')).toBeUndefined()
  })

  it('returns empty result when focusId is not in graph', () => {
    const graph = {
      nodes: [node('A'), node('B')],
      edges: [edge('A', 'B')],
    }
    const result = bfsSubgraph(graph, 'MISSING', 2)
    expect(result.nodes).toHaveLength(0)
    expect(result.edges).toHaveLength(0)
  })
})
